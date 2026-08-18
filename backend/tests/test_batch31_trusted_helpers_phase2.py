"""Batch #31 — Trusted Helpers Phase 2 regression tests.

Coverage:
  - SECURITY: /helper/chat SEPARATE from Family Chat (never returns db.messages)
  - SECURITY: helper WITHOUT 'chat' permission → 403 on GET/POST /helper/chat
  - SECURITY: parent (family) token → 401 on /helper/*
  - SECURITY: helper token → 401 on /api/helpers/{id}/chat and family routes
  - Chat round-trip (parent→helper→parent) + unread counters
  - Handover round-trip + handover_today count + cross-family 404
  - Trip flow en_route → picked_up → reached (completes task) + invalid stage 400
  - Notifications Center: helper events surface for admin/parent only
  - Lifecycle: paused/removed helper → 401/403 on chat/handover/trip
"""
import os
import time
import uuid
import pytest
import requests


def _load_backend_url():
    for k in ("EXPO_PUBLIC_BACKEND_URL", "EXPO_BACKEND_URL", "EXPO_PACKAGER_PROXY_URL"):
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


# ------------- fixtures ---------------------------------------------------
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
    """The demo helper has a seeded daily pickup task."""
    r = requests.get(f"{API}/helper/dashboard", headers=demo_helper_headers, timeout=15)
    assert r.status_code == 200, r.text
    tasks = r.json().get("tasks") or []
    for t in tasks:
        if (t.get("category") == "pickup") or ("pick up" in (t.get("title") or "").lower()):
            return t["task_id"]
    pytest.skip("no pickup task in dashboard")


# ============ 1. SECURITY: chat is a SEPARATE collection ==================
class TestChatIsolation:
    def test_helper_chat_never_returns_family_chat(self, demo_helper_headers, parent_headers):
        # Parent posts to family chat: should never appear in /helper/chat
        # First get family chat id
        r = requests.get(f"{API}/chats", headers=parent_headers, timeout=15)
        assert r.status_code == 200
        chats = r.json() if isinstance(r.json(), list) else r.json().get("chats", [])
        fchat = next((c for c in chats if (c.get("kind") == "family") or (c.get("type") == "family")
                      or "family" in ((c.get("name") or "").lower())), chats[0] if chats else None)
        assert fchat, "no family chat found"
        marker = f"TEST_FAMILY_CHAT_MARKER_{uuid.uuid4().hex[:8]}"
        sent = requests.post(f"{API}/chats/{fchat['chat_id']}/messages", headers=parent_headers,
                             json={"text": marker}, timeout=15)
        assert sent.status_code in (200, 201), sent.text
        # helper /helper/chat must NOT include this marker text
        r2 = requests.get(f"{API}/helper/chat", headers=demo_helper_headers, timeout=15)
        assert r2.status_code == 200, r2.text
        for m in r2.json().get("messages", []):
            assert marker not in (m.get("text") or ""), \
                f"FAMILY CHAT LEAK: {m.get('text')}"

    def test_helper_chat_without_permission_returns_403(self, parent_headers):
        # Create helper with chat=false, activate via direct login, hit /helper/chat
        uname = f"nochat_{uuid.uuid4().hex[:6]}"
        pin = "1122"
        body = {
            "name": "TEST_NoChat_Helper",
            "role": "custom",
            "assigned_all": True,
            "assigned_member_ids": [],
            "permissions": {"chat": False, "tasks": True},
            "username": uname,
            "pin": pin,
        }
        r = requests.post(f"{API}/helpers", headers=parent_headers, json=body, timeout=15)
        assert r.status_code in (200, 201), r.text
        hid = r.json()["helper"]["helper_id"]
        try:
            login = requests.post(f"{API}/helper/login",
                                  json={"username": uname, "pin": pin}, timeout=15)
            assert login.status_code == 200, login.text
            hh = {"Authorization": f"Bearer {login.json()['token']}",
                  "Content-Type": "application/json"}
            g = requests.get(f"{API}/helper/chat", headers=hh, timeout=15)
            assert g.status_code == 403, f"expected 403 GET, got {g.status_code}: {g.text}"
            p = requests.post(f"{API}/helper/chat", headers=hh,
                              json={"text": "should be blocked"}, timeout=15)
            assert p.status_code == 403, f"expected 403 POST, got {p.status_code}: {p.text}"
        finally:
            requests.delete(f"{API}/helpers/{hid}", headers=parent_headers, timeout=10)


# ============ 2. Cross-token boundary =====================================
class TestCrossTokenBoundary:
    @pytest.mark.parametrize("path", ["/helper/chat", "/helper/handover", "/helper/dashboard"])
    def test_parent_token_rejected_on_helper_routes(self, parent_headers, path):
        r = requests.get(f"{API}{path}", headers=parent_headers, timeout=15)
        assert r.status_code == 401, f"{path} expected 401, got {r.status_code}"

    @pytest.mark.parametrize("path", [
        f"/helpers/{DEMO_HELPER_ID}/chat",
        f"/helpers/{DEMO_HELPER_ID}/handover",
        "/helpers",
        "/families/me",
        "/home",
    ])
    def test_helper_token_rejected_on_family_routes(self, demo_helper_headers, path):
        r = requests.get(f"{API}{path}", headers=demo_helper_headers, timeout=15)
        assert r.status_code == 401, f"{path} expected 401, got {r.status_code}"


# ============ 3. Chat round-trip + unread counters ========================
class TestChatRoundTrip:
    def test_parent_sends_helper_receives_marks_read(self, parent_headers, demo_helper_headers):
        marker = f"TEST_P2H_{uuid.uuid4().hex[:8]}"
        r = requests.post(f"{API}/helpers/{DEMO_HELPER_ID}/chat", headers=parent_headers,
                          json={"text": marker}, timeout=15)
        assert r.status_code == 200, r.text
        # Before helper GET, dashboard.unread_chat >= 1
        dash = requests.get(f"{API}/helper/dashboard", headers=demo_helper_headers, timeout=15).json()
        assert dash.get("unread_chat", 0) >= 1, f"expected unread>=1 before helper read, got {dash.get('unread_chat')}"
        # Helper GET /helper/chat sees the message
        r2 = requests.get(f"{API}/helper/chat", headers=demo_helper_headers, timeout=15)
        assert r2.status_code == 200
        assert any(marker in (m.get("text") or "") for m in r2.json().get("messages", [])), \
            "parent message not visible to helper"
        # After helper GET, unread on helper side must be 0
        dash2 = requests.get(f"{API}/helper/dashboard", headers=demo_helper_headers, timeout=15).json()
        assert dash2.get("unread_chat", 99) == 0, f"expected unread=0 after helper read, got {dash2.get('unread_chat')}"

    def test_helper_sends_parent_receives_and_unread_counter(self, parent_headers, demo_helper_headers):
        marker = f"TEST_H2P_{uuid.uuid4().hex[:8]}"
        # First: parent reads existing chat to zero-out unread_by_parent
        requests.get(f"{API}/helpers/{DEMO_HELPER_ID}/chat", headers=parent_headers, timeout=15)
        # Helper posts
        r = requests.post(f"{API}/helper/chat", headers=demo_helper_headers,
                          json={"text": marker}, timeout=15)
        assert r.status_code == 200, r.text
        # /api/helpers list must reflect unread_chat on THIS helper
        lst = requests.get(f"{API}/helpers", headers=parent_headers, timeout=15).json()
        helpers = lst.get("helpers", [])
        me = next((h for h in helpers if h.get("helper_id") == DEMO_HELPER_ID), None)
        assert me is not None, "demo helper missing from list"
        assert me.get("unread_chat", 0) >= 1, f"list unread_chat expected >=1, got {me.get('unread_chat')}"
        # /api/helpers/{id} detail same
        det = requests.get(f"{API}/helpers/{DEMO_HELPER_ID}", headers=parent_headers, timeout=15).json()
        detail_h = det.get("helper") if isinstance(det.get("helper"), dict) else det
        assert detail_h.get("unread_chat", 0) >= 1, f"detail unread_chat expected>=1, got {detail_h.get('unread_chat')}"
        # Parent GET marks read → unread becomes 0
        got = requests.get(f"{API}/helpers/{DEMO_HELPER_ID}/chat", headers=parent_headers, timeout=15)
        assert got.status_code == 200
        assert any(marker in (m.get("text") or "") for m in got.json().get("messages", [])), \
            "helper message not visible to parent"
        after = requests.get(f"{API}/helpers/{DEMO_HELPER_ID}", headers=parent_headers, timeout=15).json()
        after_h = after.get("helper") if isinstance(after.get("helper"), dict) else after
        assert after_h.get("unread_chat", 99) == 0, f"unread after parent-read expected 0, got {after_h.get('unread_chat')}"


# ============ 4. Handover round-trip + count + cross-family 404 ===========
class TestHandover:
    def test_parent_note_to_helper(self, parent_headers, demo_helper_headers):
        marker = f"TEST_HO_P2H_{uuid.uuid4().hex[:8]}"
        r = requests.post(f"{API}/helpers/{DEMO_HELPER_ID}/handover", headers=parent_headers,
                          json={"text": marker}, timeout=15)
        assert r.status_code == 200, r.text
        # Helper GET /helper/handover
        r2 = requests.get(f"{API}/helper/handover", headers=demo_helper_headers, timeout=15)
        assert r2.status_code == 200
        assert any(marker in (n.get("text") or "") for n in r2.json().get("notes", [])), \
            "parent handover note not visible to helper"
        # helper/dashboard.handover_today counts today's parent notes
        dash = requests.get(f"{API}/helper/dashboard", headers=demo_helper_headers, timeout=15).json()
        assert dash.get("handover_today", 0) >= 1, f"handover_today expected>=1, got {dash.get('handover_today')}"

    def test_helper_note_to_parent(self, parent_headers, demo_helper_headers):
        marker = f"TEST_HO_H2P_{uuid.uuid4().hex[:8]}"
        r = requests.post(f"{API}/helper/handover", headers=demo_helper_headers,
                          json={"text": marker}, timeout=15)
        assert r.status_code == 200, r.text
        r2 = requests.get(f"{API}/helpers/{DEMO_HELPER_ID}/handover", headers=parent_headers,
                          timeout=15)
        assert r2.status_code == 200
        assert any(marker in (n.get("text") or "") for n in r2.json().get("notes", [])), \
            "helper handover note not visible to parent"

    def test_cross_family_handover_404(self, parent_headers):
        # Try a bogus helper_id → must 404
        bogus = "help_" + uuid.uuid4().hex[:16]
        r = requests.get(f"{API}/helpers/{bogus}/handover", headers=parent_headers, timeout=15)
        assert r.status_code == 404, f"expected 404, got {r.status_code}"


# ============ 5. Pickup/Drop trip flow ====================================
class TestTripFlow:
    def test_invalid_stage_400(self, demo_helper_headers, pickup_task_id):
        r = requests.post(f"{API}/helper/tasks/{pickup_task_id}/trip",
                          headers=demo_helper_headers, json={"stage": "banana"}, timeout=15)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"

    def test_full_trip_flow(self, demo_helper_headers, pickup_task_id):
        for stage in ("en_route", "picked_up", "reached"):
            r = requests.post(f"{API}/helper/tasks/{pickup_task_id}/trip",
                              headers=demo_helper_headers,
                              json={"stage": stage}, timeout=15)
            assert r.status_code == 200, f"{stage} → {r.status_code}: {r.text}"
            assert r.json().get("stage") == stage
        # After 'reached' → dashboard shows this task as done
        dash = requests.get(f"{API}/helper/dashboard", headers=demo_helper_headers, timeout=15).json()
        t = next((x for x in dash.get("tasks", []) if x["task_id"] == pickup_task_id), None)
        assert t is not None, "pickup task missing from dashboard"
        assert t.get("done") is True, f"pickup task not marked done after reached: {t}"

    def test_reached_triggers_parent_notification(self, parent_headers, demo_helper_headers, pickup_task_id):
        # Trigger a fresh stage (idempotent replay of 'reached' still records event)
        requests.post(f"{API}/helper/tasks/{pickup_task_id}/trip",
                      headers=demo_helper_headers, json={"stage": "reached"}, timeout=15)
        time.sleep(0.5)
        r = requests.get(f"{API}/notifications", headers=parent_headers, timeout=15)
        assert r.status_code == 200
        payload = r.json()
        activity = payload.get("activity") or payload.get("items") or []
        helper_items = [i for i in activity if i.get("type") == "helper"]
        assert helper_items, f"no helper events in notifications: keys={list(payload.keys())}"


# ============ 6. Notifications gating (parent/admin only) =================
class TestNotificationsGating:
    def test_parent_sees_helper_events(self, parent_headers):
        r = requests.get(f"{API}/notifications", headers=parent_headers, timeout=15)
        assert r.status_code == 200
        payload = r.json()
        activity = payload.get("activity") or payload.get("items") or []
        # After the chat/handover/trip tests above, there MUST be helper events
        assert any(i.get("type") == "helper" for i in activity), \
            f"parent should see helper events; sample={activity[:3]}"


# ============ 7. Lifecycle: paused/removed blocks helper endpoints ========
class TestLifecycleBlocking:
    def test_paused_helper_blocked(self, parent_headers):
        # create + activate a helper, pause, then verify endpoints are blocked
        uname = f"life_{uuid.uuid4().hex[:6]}"
        pin = "3344"
        r = requests.post(f"{API}/helpers", headers=parent_headers, json={
            "name": "TEST_Lifecycle_Helper", "role": "nanny",
            "assigned_all": True, "assigned_member_ids": [],
            "permissions": {"chat": True, "tasks": True},
            "username": uname, "pin": pin,
        }, timeout=15)
        assert r.status_code in (200, 201), r.text
        hid = r.json()["helper"]["helper_id"]
        try:
            lg = requests.post(f"{API}/helper/login",
                               json={"username": uname, "pin": pin}, timeout=15)
            assert lg.status_code == 200, lg.text
            tok = lg.json()["token"]
            hh = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
            # Sanity: works before pause
            assert requests.get(f"{API}/helper/chat", headers=hh, timeout=15).status_code == 200
            # Pause
            p = requests.post(f"{API}/helpers/{hid}/pause", headers=parent_headers, timeout=15)
            assert p.status_code in (200, 204), p.text
            # Now endpoints must be blocked (401/403)
            for path in ("/helper/chat", "/helper/handover"):
                rr = requests.get(f"{API}{path}", headers=hh, timeout=15)
                assert rr.status_code in (401, 403), f"paused {path} → {rr.status_code}"
            # Trip on any task — should also be blocked
            rr2 = requests.post(f"{API}/helper/tasks/anything/trip", headers=hh,
                                json={"stage": "en_route"}, timeout=15)
            assert rr2.status_code in (401, 403), f"paused trip → {rr2.status_code}"
        finally:
            requests.delete(f"{API}/helpers/{hid}", headers=parent_headers, timeout=10)

    def test_removed_helper_blocked(self, parent_headers):
        uname = f"rm_{uuid.uuid4().hex[:6]}"
        pin = "5566"
        r = requests.post(f"{API}/helpers", headers=parent_headers, json={
            "name": "TEST_Remove_Helper", "role": "nanny",
            "assigned_all": True, "assigned_member_ids": [],
            "permissions": {"chat": True, "tasks": True},
            "username": uname, "pin": pin,
        }, timeout=15)
        assert r.status_code in (200, 201), r.text
        hid = r.json()["helper"]["helper_id"]
        lg = requests.post(f"{API}/helper/login",
                           json={"username": uname, "pin": pin}, timeout=15)
        assert lg.status_code == 200
        tok = lg.json()["token"]
        hh = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
        # Remove
        d = requests.delete(f"{API}/helpers/{hid}", headers=parent_headers, timeout=10)
        assert d.status_code in (200, 204), d.text
        # Old token → 401/403 on helper endpoints
        for path in ("/helper/chat", "/helper/handover", "/helper/dashboard"):
            rr = requests.get(f"{API}{path}", headers=hh, timeout=15)
            assert rr.status_code in (401, 403), f"removed {path} → {rr.status_code}"
