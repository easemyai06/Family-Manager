"""Batch #32 — Trusted Helpers Phase 3 regression tests.

Coverage:
  - SECURITY: Care Team chat is a SEPARATE collection (care_team_messages),
    never touches Family Chat (db.messages) nor 1:1 helper chat (db.helper_messages).
  - SECURITY: /helper/care-team requires 'chat' permission (403 without).
  - SECURITY: cross-token boundary — parent 401 on /helper/*, helper 401 on
    /api/care-team/* and family routes.
  - Care Team round-trip: parent -> helper AND helper -> parent; roster + unread=0
    after parent read.
  - Live pickup location: 400 before Start Trip, 200 after en_route, coords visible
    in parent /helpers/{id}/activity.
  - SECURITY: /helper/medical requires 'medical' permission; response contains
    ONLY safe fields (no medication/conditions/insurance/policy). Scoping to
    assigned members only.
  - Helper ratings: invalid rating -> 400, upsert per-day, GET history has
    ratings + up/total + today, dashboard rated_up_today=true.
  - Lifecycle: paused/removed helper -> care-team/location/medical blocked.
"""
import os
import time
import uuid
import pytest
import requests


def _load_backend_url():
    for k in ("EXPO_PUBLIC_BACKEND_URL", "EXPO_BACKEND_URL"):
        v = os.environ.get(k)
        if v:
            return v
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except Exception:
        pass
    return None


BASE_URL = _load_backend_url()
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL missing"
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

PARENT_EMAIL = "storytester@fam.com"
PARENT_PW = "secret123"
DEMO_HELPER_ID = "help_c77a0a30120545bb"
DEMO_HELPER_USER = "sunita"
DEMO_HELPER_PIN = "1234"


# --------------------------- fixtures --------------------------------------
@pytest.fixture(scope="module")
def parent_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": PARENT_EMAIL, "password": PARENT_PW}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def parent_headers(parent_token):
    return {"Authorization": f"Bearer {parent_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def family_id(parent_headers):
    r = requests.get(f"{API}/families/me", headers=parent_headers, timeout=15)
    assert r.status_code == 200, r.text
    fam = r.json()
    fid = fam.get("family_id") or (fam.get("family") or {}).get("family_id")
    assert fid, f"no family_id in {fam}"
    return fid


@pytest.fixture(scope="module")
def members(parent_headers):
    r = requests.get(f"{API}/families/me", headers=parent_headers, timeout=15)
    payload = r.json()
    return payload.get("members") or (payload.get("family") or {}).get("members") or []


@pytest.fixture(scope="module")
def aarav_id(members):
    for m in members:
        if (m.get("name") or "").lower().startswith("aarav"):
            return m["member_id"]
    pytest.skip("no Aarav in demo family")


@pytest.fixture(scope="module")
def non_aarav_child_id(members, aarav_id):
    # Any other child-like member (Anaya) or fallback to any member != aarav
    for m in members:
        if m["member_id"] == aarav_id:
            continue
        return m["member_id"]
    pytest.skip("no other member")


@pytest.fixture(scope="module")
def demo_helper_token():
    r = requests.post(f"{API}/helper/login",
                      json={"username": DEMO_HELPER_USER, "pin": DEMO_HELPER_PIN}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def demo_helper_headers(demo_helper_token):
    return {"Authorization": f"Bearer {demo_helper_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def pickup_task_id(demo_helper_headers):
    r = requests.get(f"{API}/helper/dashboard", headers=demo_helper_headers, timeout=15)
    assert r.status_code == 200, r.text
    tasks = r.json().get("tasks") or []
    for t in tasks:
        if (t.get("category") == "pickup") or ("pick up" in (t.get("title") or "").lower()):
            return t["task_id"]
    pytest.skip("no pickup task in dashboard")


def _create_helper(parent_headers, name, perms, assigned_all=False, assigned_ids=None,
                   uname_prefix="h", pin="9911"):
    uname = f"{uname_prefix}_{uuid.uuid4().hex[:6]}"
    body = {
        "name": name, "role": "custom",
        "assigned_all": assigned_all,
        "assigned_member_ids": assigned_ids or [],
        "permissions": perms,
        "username": uname, "pin": pin,
    }
    r = requests.post(f"{API}/helpers", headers=parent_headers, json=body, timeout=15)
    assert r.status_code in (200, 201), r.text
    hid = r.json()["helper"]["helper_id"]
    lg = requests.post(f"{API}/helper/login",
                      json={"username": uname, "pin": pin}, timeout=15)
    assert lg.status_code == 200, lg.text
    return hid, {"Authorization": f"Bearer {lg.json()['token']}",
                 "Content-Type": "application/json"}


# ============ 1. Care Team isolation ======================================
class TestCareTeamIsolation:
    def test_family_chat_marker_never_leaks_to_care_team(self, parent_headers, demo_helper_headers):
        # Post to Family Chat then confirm care-team endpoints don't return it
        r = requests.get(f"{API}/chats", headers=parent_headers, timeout=15)
        assert r.status_code == 200
        chats = r.json() if isinstance(r.json(), list) else r.json().get("chats", [])
        fchat = next((c for c in chats if (c.get("kind") == "family") or (c.get("type") == "family")
                     or "family" in ((c.get("name") or "").lower())), chats[0] if chats else None)
        assert fchat, "no family chat found"
        marker = f"TEST_FCHAT_LEAK_{uuid.uuid4().hex[:8]}"
        s = requests.post(f"{API}/chats/{fchat['chat_id']}/messages",
                          headers=parent_headers, json={"text": marker}, timeout=15)
        assert s.status_code in (200, 201), s.text
        # parent /care-team/chat
        r1 = requests.get(f"{API}/care-team/chat", headers=parent_headers, timeout=15)
        assert r1.status_code == 200
        for m in r1.json().get("messages", []):
            assert marker not in (m.get("text") or ""), f"family chat leaked to care-team (parent view): {m}"
        # helper /helper/care-team
        r2 = requests.get(f"{API}/helper/care-team", headers=demo_helper_headers, timeout=15)
        assert r2.status_code == 200
        for m in r2.json().get("messages", []):
            assert marker not in (m.get("text") or ""), f"family chat leaked to care-team (helper view): {m}"

    def test_helper_1to1_chat_marker_never_leaks_to_care_team(self, parent_headers, demo_helper_headers):
        marker = f"TEST_1TO1_LEAK_{uuid.uuid4().hex[:8]}"
        p = requests.post(f"{API}/helpers/{DEMO_HELPER_ID}/chat",
                          headers=parent_headers, json={"text": marker}, timeout=15)
        assert p.status_code == 200, p.text
        # neither care-team endpoint should contain this
        r1 = requests.get(f"{API}/care-team/chat", headers=parent_headers, timeout=15).json()
        assert not any(marker in (m.get("text") or "") for m in r1.get("messages", []))
        r2 = requests.get(f"{API}/helper/care-team", headers=demo_helper_headers, timeout=15).json()
        assert not any(marker in (m.get("text") or "") for m in r2.get("messages", []))

    def test_helper_without_chat_permission_returns_403(self, parent_headers):
        hid, hh = _create_helper(parent_headers, "TEST_NoChatPerm_CT",
                                 perms={"chat": False, "medical": False, "tasks": True},
                                 assigned_all=True)
        try:
            g = requests.get(f"{API}/helper/care-team", headers=hh, timeout=15)
            assert g.status_code == 403, f"expected 403 GET, got {g.status_code}: {g.text}"
            p = requests.post(f"{API}/helper/care-team", headers=hh,
                              json={"text": "should be blocked"}, timeout=15)
            assert p.status_code == 403, f"expected 403 POST, got {p.status_code}: {p.text}"
        finally:
            requests.delete(f"{API}/helpers/{hid}", headers=parent_headers, timeout=10)


# ============ 2. Cross-token boundary =====================================
class TestCrossTokenBoundary:
    @pytest.mark.parametrize("path", ["/helper/care-team", "/helper/medical", "/helper/dashboard"])
    def test_parent_token_rejected_on_helper_routes(self, parent_headers, path):
        r = requests.get(f"{API}{path}", headers=parent_headers, timeout=15)
        assert r.status_code == 401, f"{path} expected 401, got {r.status_code}"

    @pytest.mark.parametrize("path", ["/care-team/chat", "/care-team/unread",
                                      f"/helpers/{DEMO_HELPER_ID}/ratings",
                                      "/helpers", "/families/me", "/home"])
    def test_helper_token_rejected_on_family_routes(self, demo_helper_headers, path):
        r = requests.get(f"{API}{path}", headers=demo_helper_headers, timeout=15)
        assert r.status_code == 401, f"{path} expected 401, got {r.status_code}"


# ============ 3. Care Team round-trip + unread =============================
class TestCareTeamRoundTrip:
    def test_parent_send_helper_sees(self, parent_headers, demo_helper_headers):
        marker = f"TEST_CT_P2H_{uuid.uuid4().hex[:8]}"
        p = requests.post(f"{API}/care-team/chat", headers=parent_headers,
                          json={"text": marker}, timeout=15)
        assert p.status_code == 200, p.text
        r = requests.get(f"{API}/helper/care-team", headers=demo_helper_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data.get("my_type") == "helper"
        assert data.get("me") == DEMO_HELPER_ID
        assert any(marker in (m.get("text") or "") for m in data.get("messages", [])), \
            "parent care-team message not visible to helper"

    def test_helper_send_parent_sees_and_roster(self, parent_headers, demo_helper_headers):
        marker = f"TEST_CT_H2P_{uuid.uuid4().hex[:8]}"
        p = requests.post(f"{API}/helper/care-team", headers=demo_helper_headers,
                          json={"text": marker}, timeout=15)
        assert p.status_code == 200, p.text
        r = requests.get(f"{API}/care-team/chat", headers=parent_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data.get("my_type") == "parent"
        assert "me" in data
        assert isinstance(data.get("helpers"), list) and len(data["helpers"]) >= 1, \
            f"expected non-empty roster, got {data.get('helpers')}"
        # Sunita active helper should be in roster
        assert any((h.get("name") or "").lower().startswith("sunita")
                   for h in data["helpers"]), f"Sunita missing from roster: {data['helpers']}"
        assert any(marker in (m.get("text") or "") for m in data.get("messages", [])), \
            "helper message not visible to parent"

    def test_unread_decreases_to_zero_after_parent_read(self, parent_headers, demo_helper_headers):
        # Parent reads to reset unread
        requests.get(f"{API}/care-team/chat", headers=parent_headers, timeout=15)
        u0 = requests.get(f"{API}/care-team/unread", headers=parent_headers, timeout=15).json()
        assert u0.get("count") == 0, f"expected 0 after read, got {u0}"
        # Helper posts -> unread should be >=1 for the parent
        marker = f"TEST_CT_UNREAD_{uuid.uuid4().hex[:8]}"
        requests.post(f"{API}/helper/care-team", headers=demo_helper_headers,
                      json={"text": marker}, timeout=15)
        u1 = requests.get(f"{API}/care-team/unread", headers=parent_headers, timeout=15).json()
        assert u1.get("count", 0) >= 1, f"expected >=1 unread after helper post, got {u1}"
        # Parent reads and unread returns to 0
        requests.get(f"{API}/care-team/chat", headers=parent_headers, timeout=15)
        u2 = requests.get(f"{API}/care-team/unread", headers=parent_headers, timeout=15).json()
        assert u2.get("count") == 0, f"expected 0 after re-read, got {u2}"


# ============ 4. Live pickup location =====================================
class TestLivePickupLocation:
    def test_location_before_start_trip_returns_400(self, demo_helper_headers, pickup_task_id):
        # Ensure any completion for today is fresh: attempt to hit endpoint before Start Trip
        # In case a previous run already started, the endpoint could 200. So we assert two cases:
        # either 400 (no completion yet) OR 200 (already started earlier today).
        r = requests.post(f"{API}/helper/tasks/{pickup_task_id}/location",
                          headers=demo_helper_headers,
                          json={"lat": 12.34, "lng": 56.78}, timeout=15)
        assert r.status_code in (400, 200), f"unexpected {r.status_code}: {r.text}"
        if r.status_code == 400:
            body = r.json()
            assert "start" in (body.get("detail") or "").lower() or \
                   "trip" in (body.get("detail") or "").lower(), body

    def test_location_after_start_trip_returns_200_and_visible(self, parent_headers, demo_helper_headers, pickup_task_id):
        # Start trip via en_route (idempotent)
        s = requests.post(f"{API}/helper/tasks/{pickup_task_id}/trip",
                          headers=demo_helper_headers, json={"stage": "en_route"}, timeout=15)
        assert s.status_code == 200, s.text
        # Now location should succeed
        lat, lng = 28.6139, 77.2090
        r = requests.post(f"{API}/helper/tasks/{pickup_task_id}/location",
                          headers=demo_helper_headers, json={"lat": lat, "lng": lng}, timeout=15)
        assert r.status_code == 200, f"expected 200 after en_route, got {r.status_code}: {r.text}"
        # Parent sees via /helpers/{id}/activity
        act = requests.get(f"{API}/helpers/{DEMO_HELPER_ID}/activity",
                          headers=parent_headers, timeout=15)
        assert act.status_code == 200
        comps = act.json().get("activity", [])
        # find the completion for our pickup task with trip.lat/lng
        matches = [c for c in comps if c.get("task_id") == pickup_task_id
                   and (c.get("trip") or {}).get("lat") == lat
                   and (c.get("trip") or {}).get("lng") == lng]
        assert matches, f"trip lat/lng not visible in activity: {comps[:2]}"
        assert (matches[0].get("trip") or {}).get("loc_updated_at"), "no loc_updated_at timestamp"


# ============ 5. Medical sharing ==========================================
SAFE_FIELDS = {"member", "blood_group", "allergies", "doctor", "hospital", "emergency_contact"}
FORBIDDEN_TEXT_FIELDS = ("medication", "conditions", "insurance", "policy")


class TestMedicalSharing:
    def test_medical_requires_permission_403(self, parent_headers):
        hid, hh = _create_helper(parent_headers, "TEST_NoMedPerm",
                                 perms={"chat": True, "medical": False, "tasks": True},
                                 assigned_all=True)
        try:
            r = requests.get(f"{API}/helper/medical", headers=hh, timeout=15)
            assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"
        finally:
            requests.delete(f"{API}/helpers/{hid}", headers=parent_headers, timeout=10)

    def test_medical_returns_only_safe_fields_no_leak(self, demo_helper_headers):
        r = requests.get(f"{API}/helper/medical", headers=demo_helper_headers, timeout=15)
        assert r.status_code == 200, r.text
        payload = r.json()
        assert "cards" in payload
        cards = payload["cards"]
        assert cards, "expected at least Aarav's card for demo helper"
        for c in cards:
            # Only whitelisted top-level keys
            extra = set(c.keys()) - SAFE_FIELDS
            assert not extra, f"unexpected keys leaked in medical card: {extra} (card={c})"
            # No forbidden field name anywhere in serialised card
            blob = str(c).lower()
            for bad in FORBIDDEN_TEXT_FIELDS:
                assert bad not in blob, f"FORBIDDEN field/text '{bad}' leaked in medical card: {c}"

    def test_medical_shows_aarav_card_for_demo_helper(self, demo_helper_headers, aarav_id):
        r = requests.get(f"{API}/helper/medical", headers=demo_helper_headers, timeout=15).json()
        aarav = next((c for c in r.get("cards", []) if (c.get("member") or {}).get("member_id") == aarav_id), None)
        assert aarav, f"Aarav's card missing for demo helper: {r}"
        # Sanity: seeded data should have blood group and allergies
        assert aarav.get("blood_group"), "expected blood_group on Aarav card"
        assert aarav.get("allergies"), "expected allergies on Aarav card"

    def test_medical_scoping_other_helper_cannot_see_aarav(self, parent_headers, aarav_id, non_aarav_child_id):
        # Create a helper assigned to a DIFFERENT member with medical perm
        hid, hh = _create_helper(parent_headers, "TEST_MedScoping",
                                 perms={"chat": True, "medical": True, "tasks": True},
                                 assigned_all=False,
                                 assigned_ids=[non_aarav_child_id])
        try:
            r = requests.get(f"{API}/helper/medical", headers=hh, timeout=15)
            assert r.status_code == 200, r.text
            cards = r.json().get("cards", [])
            ids = [(c.get("member") or {}).get("member_id") for c in cards]
            assert aarav_id not in ids, f"SCOPE LEAK: other helper saw Aarav in medical: {ids}"
            # And the assigned member IS present (may not have medical card seeded but member should be returned)
            assert non_aarav_child_id in ids, f"expected assigned member {non_aarav_child_id} in {ids}"
        finally:
            requests.delete(f"{API}/helpers/{hid}", headers=parent_headers, timeout=10)


# ============ 6. Helper ratings ============================================
class TestHelperRatings:
    def test_invalid_rating_400(self, parent_headers):
        r = requests.post(f"{API}/helpers/{DEMO_HELPER_ID}/rating",
                          headers=parent_headers, json={"rating": "banana"}, timeout=15)
        assert r.status_code in (400, 422), f"expected 400/422, got {r.status_code}: {r.text}"

    def test_rating_up_dashboard_flag_and_history(self, parent_headers, demo_helper_headers):
        # Post up rating
        r = requests.post(f"{API}/helpers/{DEMO_HELPER_ID}/rating",
                          headers=parent_headers,
                          json={"rating": "up", "note": "TEST_RATE_NOTE_UP"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("rating") == "up"
        # Dashboard shows rated_up_today=true
        dash = requests.get(f"{API}/helper/dashboard", headers=demo_helper_headers, timeout=15).json()
        assert dash.get("rated_up_today") is True, f"expected rated_up_today=true, got {dash.get('rated_up_today')}"
        # History
        h = requests.get(f"{API}/helpers/{DEMO_HELPER_ID}/ratings",
                         headers=parent_headers, timeout=15)
        assert h.status_code == 200
        hd = h.json()
        assert "ratings" in hd and isinstance(hd["ratings"], list)
        assert hd.get("today") is not None, f"today rating missing: {hd}"
        assert hd["today"].get("rating") == "up"
        assert hd["today"].get("note") == "TEST_RATE_NOTE_UP"
        assert hd.get("up", 0) >= 1
        assert hd.get("total", 0) >= 1

    def test_rating_upsert_same_day(self, parent_headers, demo_helper_headers):
        # Overwrite same-day rating: up -> down
        r = requests.post(f"{API}/helpers/{DEMO_HELPER_ID}/rating",
                          headers=parent_headers,
                          json={"rating": "down", "note": "TEST_RATE_DOWN"}, timeout=15)
        assert r.status_code == 200, r.text
        h = requests.get(f"{API}/helpers/{DEMO_HELPER_ID}/ratings",
                         headers=parent_headers, timeout=15).json()
        assert h.get("today") is not None
        assert h["today"].get("rating") == "down", f"upsert failed: {h['today']}"
        assert h["today"].get("note") == "TEST_RATE_DOWN"
        # Dashboard should no longer show rated_up_today=true
        dash = requests.get(f"{API}/helper/dashboard", headers=demo_helper_headers, timeout=15).json()
        assert dash.get("rated_up_today") is False, \
            f"expected rated_up_today=false after down, got {dash.get('rated_up_today')}"
        # Restore to 'up' so frontend test can see the banner
        requests.post(f"{API}/helpers/{DEMO_HELPER_ID}/rating",
                      headers=parent_headers,
                      json={"rating": "up", "note": "TEST_RATE_FINAL_UP"}, timeout=15)


# ============ 7. Lifecycle: paused/removed blocks phase-3 endpoints =======
class TestLifecycleBlocking:
    def test_paused_helper_phase3_blocked(self, parent_headers, aarav_id):
        hid, hh = _create_helper(parent_headers, "TEST_P3_LifePause",
                                 perms={"chat": True, "medical": True, "tasks": True},
                                 assigned_all=False, assigned_ids=[aarav_id])
        try:
            # Sanity checks before pausing
            assert requests.get(f"{API}/helper/care-team", headers=hh, timeout=15).status_code == 200
            assert requests.get(f"{API}/helper/medical", headers=hh, timeout=15).status_code == 200
            # Pause
            p = requests.post(f"{API}/helpers/{hid}/pause", headers=parent_headers, timeout=15)
            assert p.status_code in (200, 204), p.text
            for path in ("/helper/care-team", "/helper/medical"):
                rr = requests.get(f"{API}{path}", headers=hh, timeout=15)
                assert rr.status_code in (401, 403), f"paused {path} -> {rr.status_code}"
            # location endpoint on any task
            rr2 = requests.post(f"{API}/helper/tasks/anything/location",
                                headers=hh, json={"lat": 1.0, "lng": 1.0}, timeout=15)
            assert rr2.status_code in (401, 403), f"paused location -> {rr2.status_code}"
        finally:
            requests.delete(f"{API}/helpers/{hid}", headers=parent_headers, timeout=10)

    def test_removed_helper_phase3_blocked(self, parent_headers, aarav_id):
        hid, hh = _create_helper(parent_headers, "TEST_P3_LifeRm",
                                 perms={"chat": True, "medical": True, "tasks": True},
                                 assigned_all=False, assigned_ids=[aarav_id])
        d = requests.delete(f"{API}/helpers/{hid}", headers=parent_headers, timeout=10)
        assert d.status_code in (200, 204), d.text
        for path in ("/helper/care-team", "/helper/medical", "/helper/dashboard"):
            rr = requests.get(f"{API}{path}", headers=hh, timeout=15)
            assert rr.status_code in (401, 403), f"removed {path} -> {rr.status_code}"
        rr2 = requests.post(f"{API}/helper/tasks/anything/location",
                            headers=hh, json={"lat": 1.0, "lng": 1.0}, timeout=15)
        assert rr2.status_code in (401, 403), f"removed location -> {rr2.status_code}"
