"""Batch #34 — Trusted Helpers Phase 5 regression tests.

Scope (Phase 5 additions):
  1. HELPER MEDIA TOKEN (SECURITY — MOST IMPORTANT)
     - /helper/login and /helper/dashboard return a `media_token` distinct from
       the JWT auth token.
     - GET /api/files/{path}?token={helper_media_token}:
         200 for a file the helper uploaded (owner_id == helper_id)
         200 for a file referenced by care_team_messages (photo_url/audio_url)
         200 for a file referenced by helper_messages (1:1) — helper's own thread
         404 for any other family file (Family Chat photo, Vault file, another
             member's random media, or a random path)
     - A normal parent/family media_token STILL serves the family file, and is
       NOT broadenable by helpers.
  2. CARE TEAM voice + photo
     - Parent POST /api/care-team/chat accepts {audio_url, audio_dur} and
       {photo_url}; text|photo|audio all accepted; empty -> 400.
     - Helper POST /api/helper/care-team same.
     - care_msg_public returns audio_url/audio_dur/photo_url.
     - Care-team messages remain isolated from db.messages (family chat) and
       db.helper_messages (1:1 helper chat).
  3. DROP-OFF PROOF at 'reached'
     - POST /api/helper/tasks/{id}/trip stage=reached {proof_url=...} stores
       trip.proof_url, marks task done, fires 📸 parent notification.
     - Parent GET /api/helpers/{id}/activity includes proof_url on the trip.
  4. SHIFT CHECK-IN / CHECK-OUT
     - POST /api/helper/checkin idempotent — 2nd call same checked_in_at,
       no new 🟢 notification. First call fires 🟢.
     - POST /api/helper/checkout returns 400 if not checked in, else fires 👋.
     - /helper/dashboard.checkin present.
     - Parent GET /api/helpers and /api/helpers/{id} include
       checked_in_at / checked_out_at.
  5. REGRESSION / SECURITY
     - Helper WITHOUT chat permission -> 403 on /helper/care-team.
     - Parent token -> 401 on /helper/* ; helper token -> 401 on /api/care-team/*.
     - /helper/medical leak-free (no meds/conditions/insurance).
     - Paused helper is blocked on Phase-5 endpoints (401/403).

Demo helper Sunita (help_c77a0a30120545bb, sunita/1234) is used. All state that
Phase-4 cares about (dest coords, access.start_time ~40-min-ahead, medical) is
preserved.
"""
import os
import io
import uuid
from datetime import datetime, timezone

import pytest
import requests
from pymongo import MongoClient


# --------------------------- config ----------------------------------------
def _load_backend_url():
    for k in ("EXPO_PUBLIC_BACKEND_URL", "EXPO_BACKEND_URL"):
        v = os.environ.get(k)
        if v:
            return v
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


BASE_URL = _load_backend_url().rstrip("/")
API = f"{BASE_URL}/api"

PARENT_EMAIL = "storytester@fam.com"
PARENT_PW = "secret123"
DEMO_HELPER_ID = "help_c77a0a30120545bb"
DEMO_HELPER_USER = "sunita"
DEMO_HELPER_PIN = "1234"

_mongo = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
_db = _mongo[os.environ.get("DB_NAME", "test_database")]


# --------------------------- fixtures --------------------------------------
@pytest.fixture(scope="module")
def parent_login():
    r = requests.post(f"{API}/auth/login",
                      json={"email": PARENT_EMAIL, "password": PARENT_PW}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def parent_headers(parent_login):
    return {"Authorization": f"Bearer {parent_login['token']}",
            "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def parent_media_token(parent_headers):
    # media_token is exposed on GET /api/auth/me (see server.py:974)
    r = requests.get(f"{API}/auth/me", headers=parent_headers, timeout=15)
    assert r.status_code == 200, r.text
    tok = r.json().get("media_token")
    assert tok, "GET /auth/me missing media_token"
    return tok


@pytest.fixture(scope="module")
def helper_login_data():
    r = requests.post(f"{API}/helper/login",
                      json={"username": DEMO_HELPER_USER, "pin": DEMO_HELPER_PIN}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def helper_headers(helper_login_data):
    return {"Authorization": f"Bearer {helper_login_data['token']}",
            "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def helper_media_token(helper_login_data):
    tok = helper_login_data.get("media_token")
    assert tok, "helper login response missing media_token"
    return tok


@pytest.fixture(scope="module")
def family_id(parent_headers):
    r = requests.get(f"{API}/families/me", headers=parent_headers, timeout=15).json()
    return r.get("family_id") or (r.get("family") or {}).get("family_id")


@pytest.fixture(scope="module")
def aarav_id(parent_headers):
    r = requests.get(f"{API}/families/me", headers=parent_headers, timeout=15).json()
    members = r.get("members") or (r.get("family") or {}).get("members") or []
    for m in members:
        if (m.get("name") or "").lower().startswith("aarav"):
            return m["member_id"]
    pytest.skip("no Aarav")


@pytest.fixture(scope="module")
def demo_pickup_task(helper_headers):
    r = requests.get(f"{API}/helper/dashboard", headers=helper_headers, timeout=15).json()
    for t in r.get("tasks") or []:
        if (t.get("category") == "pickup") or ("pick up" in (t.get("title") or "").lower()):
            return t
    pytest.skip("no pickup task")


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _reset_today_pickup_completion(task_id: str):
    _db.helper_task_completions.delete_many({"task_id": task_id, "date": _today()})


def _reset_today_checkin():
    _db.helper_checkins.delete_many({"helper_id": DEMO_HELPER_ID, "date": _today()})


def _upload_helper_image(helper_hdrs) -> str:
    """Upload a tiny PNG via /helper/upload; return relative storage path."""
    hh = {k: v for k, v in helper_hdrs.items() if k.lower() != "content-type"}
    files = {"file": ("test.jpg", io.BytesIO(b"\xff\xd8\xff\xe0test-jpg-bytes"), "image/jpeg")}
    r = requests.post(f"{API}/helper/upload", headers=hh,
                      data={"kind": "image"}, files=files, timeout=20)
    assert r.status_code == 200, r.text
    # url looks like "/api/files/{path}"
    url = r.json()["url"]
    assert url.startswith("/api/files/")
    return url[len("/api/files/"):]


def _upload_parent_image(parent_hdrs) -> str:
    hh = {k: v for k, v in parent_hdrs.items() if k.lower() != "content-type"}
    files = {"file": ("p.jpg", io.BytesIO(b"\xff\xd8\xff\xe0parent-jpg-bytes"), "image/jpeg")}
    r = requests.post(f"{API}/upload", headers=hh, data={"kind": "image"},
                      files=files, timeout=20)
    assert r.status_code == 200, r.text
    url = r.json()["url"]
    return url[len("/api/files/"):]


# ============ 1. HELPER MEDIA TOKEN ========================================
class TestHelperMediaToken:
    def test_helper_login_returns_media_token_distinct_from_auth(self, helper_login_data):
        assert "media_token" in helper_login_data, "login missing media_token"
        assert helper_login_data["media_token"] != helper_login_data["token"], \
            "media_token should be distinct from auth token"

    def test_helper_dashboard_returns_media_token(self, helper_headers):
        r = requests.get(f"{API}/helper/dashboard", headers=helper_headers, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("media_token"), "dashboard missing media_token"

    def test_helper_can_load_own_upload(self, helper_headers, helper_media_token):
        path = _upload_helper_image(helper_headers)
        r = requests.get(f"{API}/files/{path}", params={"token": helper_media_token}, timeout=15)
        assert r.status_code == 200, f"helper own upload not served: {r.status_code} {r.text[:120]}"
        assert r.content and len(r.content) > 5

    def test_helper_can_load_care_team_photo(self, parent_headers, helper_headers,
                                             helper_media_token):
        # Parent uploads a file and posts to care-team chat referencing that file url.
        path = _upload_parent_image(parent_headers)
        photo_url = f"/api/files/{path}"
        r = requests.post(f"{API}/care-team/chat", headers=parent_headers,
                          json={"photo_url": photo_url}, timeout=15)
        assert r.status_code == 200, r.text
        # Helper media token must serve this file (referenced by care_team_messages).
        g = requests.get(f"{API}/files/{path}", params={"token": helper_media_token}, timeout=15)
        assert g.status_code == 200, \
            f"helper media token should serve care-team-referenced file: {g.status_code}"

    def test_helper_can_load_own_helper_message_photo(self, parent_headers, helper_headers,
                                                     helper_media_token):
        # Helper uploads then posts to their own 1:1 helper chat.
        path = _upload_helper_image(helper_headers)
        photo_url = f"/api/files/{path}"
        r = requests.post(f"{API}/helper/chat", headers=helper_headers,
                          json={"photo_url": photo_url}, timeout=15)
        assert r.status_code == 200, r.text
        g = requests.get(f"{API}/files/{path}", params={"token": helper_media_token}, timeout=15)
        assert g.status_code == 200

    def test_helper_media_token_404s_random_path(self, helper_media_token):
        r = requests.get(f"{API}/files/nonexistent/random_{uuid.uuid4().hex}.jpg",
                         params={"token": helper_media_token}, timeout=15)
        assert r.status_code == 404, f"expected 404 for random path, got {r.status_code}"

    def test_helper_media_token_404s_family_chat_photo(self, parent_headers, helper_media_token):
        """A photo uploaded by parent and referenced ONLY by family chat (db.messages)
        must NOT be served by the helper media token."""
        path = _upload_parent_image(parent_headers)
        # Find/create a family chat message referencing this photo. We tag it in
        # db.messages directly to isolate the reference from care_team_messages.
        family = requests.get(f"{API}/families/me", headers=parent_headers, timeout=15).json()
        fid = family.get("family_id") or (family.get("family") or {}).get("family_id")
        _db.messages.insert_one({
            "message_id": f"TEST_P5_FAMCHAT_{uuid.uuid4().hex[:6]}",
            "family_id": fid,
            "chat_id": f"TEST_P5_CHAT_{uuid.uuid4().hex[:6]}",
            "sender_id": "parent",
            "photo_url": f"/api/files/{path}",
            "text": "family-chat-only photo",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        try:
            g = requests.get(f"{API}/files/{path}",
                             params={"token": helper_media_token}, timeout=15)
            assert g.status_code == 404, \
                f"helper media token wrongly served family-chat-only file: {g.status_code}"
        finally:
            _db.messages.delete_many({"message_id": {"$regex": r"^TEST_P5_FAMCHAT_"}})

    def test_helper_media_token_404s_vault_file(self, parent_headers, helper_media_token):
        """A file that belongs to a Vault item must NOT be served by helper media token."""
        path = _upload_parent_image(parent_headers)
        family = requests.get(f"{API}/families/me", headers=parent_headers, timeout=15).json()
        fid = family.get("family_id") or (family.get("family") or {}).get("family_id")
        vid = f"TEST_P5_VAULT_{uuid.uuid4().hex[:6]}"
        _db.vault_items.insert_one({
            "vault_item_id": vid,
            "family_id": fid,
            "title": "TEST_P5_VAULT",
            "files": [{"url": f"/api/files/{path}", "name": "secret.jpg"}],
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        try:
            g = requests.get(f"{API}/files/{path}",
                             params={"token": helper_media_token}, timeout=15)
            assert g.status_code == 404, \
                f"helper media token wrongly served vault file: {g.status_code}"
        finally:
            _db.vault_items.delete_many({"vault_item_id": vid})

    def test_parent_media_token_still_serves_family_files(self, parent_headers,
                                                          parent_media_token):
        """Regression: normal family media token still works for family files
        (not broken by Phase-5 helper additions)."""
        path = _upload_parent_image(parent_headers)
        g = requests.get(f"{API}/files/{path}", params={"token": parent_media_token}, timeout=15)
        assert g.status_code == 200, f"parent media token should serve family file: {g.status_code}"

    def test_helper_media_token_cannot_read_arbitrary_family_media(self, parent_headers,
                                                                    helper_media_token):
        """A random parent-uploaded file that is NOT tied to care-team / helper
        chat / vault must 404 for the helper media token."""
        path = _upload_parent_image(parent_headers)
        # Do NOT reference it anywhere helper-visible.
        g = requests.get(f"{API}/files/{path}",
                         params={"token": helper_media_token}, timeout=15)
        assert g.status_code == 404, \
            f"helper media token wrongly served unrelated family file: {g.status_code}"


# ============ 2. CARE TEAM voice + photo ==================================
class TestCareTeamAudioPhoto:
    def test_parent_post_audio(self, parent_headers, helper_headers):
        aurl = f"https://example.com/TEST_P5_PAUD_{uuid.uuid4().hex[:6]}.m4a"
        r = requests.post(f"{API}/care-team/chat", headers=parent_headers,
                          json={"audio_url": aurl, "audio_dur": 7}, timeout=15)
        assert r.status_code == 200, r.text
        m = r.json()["message"]
        assert m.get("audio_url") == aurl
        assert m.get("audio_dur") == 7
        # helper sees it
        g = requests.get(f"{API}/helper/care-team", headers=helper_headers, timeout=15).json()
        got = next((x for x in g.get("messages", []) if x.get("audio_url") == aurl), None)
        assert got, "audio message not visible to helper"
        assert got.get("audio_dur") == 7

    def test_helper_post_audio(self, parent_headers, helper_headers):
        aurl = f"https://example.com/TEST_P5_HAUD_{uuid.uuid4().hex[:6]}.m4a"
        r = requests.post(f"{API}/helper/care-team", headers=helper_headers,
                          json={"audio_url": aurl, "audio_dur": 12}, timeout=15)
        assert r.status_code == 200, r.text
        m = r.json()["message"]
        assert m.get("audio_url") == aurl
        assert m.get("audio_dur") == 12
        g = requests.get(f"{API}/care-team/chat", headers=parent_headers, timeout=15).json()
        got = next((x for x in g.get("messages", []) if x.get("audio_url") == aurl), None)
        assert got, "helper audio not visible to parent"
        assert got.get("audio_dur") == 12

    def test_empty_message_rejected(self, parent_headers, helper_headers):
        r1 = requests.post(f"{API}/care-team/chat", headers=parent_headers, json={}, timeout=15)
        assert r1.status_code == 400
        r2 = requests.post(f"{API}/helper/care-team", headers=helper_headers, json={}, timeout=15)
        assert r2.status_code == 400

    def test_photo_only_and_text_only_still_work(self, parent_headers, helper_headers):
        r_p = requests.post(f"{API}/care-team/chat", headers=parent_headers,
                            json={"photo_url": "https://x/TEST_P5_PHOTO.jpg"}, timeout=15)
        assert r_p.status_code == 200
        r_t = requests.post(f"{API}/helper/care-team", headers=helper_headers,
                            json={"text": f"TEST_P5_TXT_{uuid.uuid4().hex[:6]}"}, timeout=15)
        assert r_t.status_code == 200

    def test_audio_isolated_from_family_and_1to1(self, parent_headers, helper_headers):
        aurl = f"https://example.com/TEST_P5_ISO_{uuid.uuid4().hex[:6]}.m4a"
        r = requests.post(f"{API}/care-team/chat", headers=parent_headers,
                          json={"audio_url": aurl, "audio_dur": 3}, timeout=15)
        assert r.status_code == 200
        # 1:1 helper chat should NOT contain it
        c = requests.get(f"{API}/helpers/{DEMO_HELPER_ID}/chat",
                         headers=parent_headers, timeout=15).json()
        msgs = c.get("messages", [])
        assert not any((m.get("audio_url") or "") == aurl for m in msgs), \
            "care-team audio leaked into 1:1 helper chat"
        # Family chat messages (db.messages) should not have it either
        assert _db.messages.find_one({"audio_url": aurl}) is None, \
            "care-team audio leaked into db.messages (family chat)"


# ============ 3. DROP-OFF PROOF ============================================
class TestDropOffProof:
    def test_reached_with_proof_url_stores_and_notifies(self, parent_headers, helper_headers,
                                                        demo_pickup_task):
        tid = demo_pickup_task["task_id"]
        _reset_today_pickup_completion(tid)

        # Baseline: count 📸 notifications before
        def _count_camera_notifs():
            r = requests.get(f"{API}/notifications", headers=parent_headers, timeout=15).json()
            items = r if isinstance(r, list) else (r.get("items") or r.get("notifications") or [])
            n = 0
            for it in items:
                blob = " ".join(str(it.get(k) or "") for k in
                                ("emoji", "title", "subtitle", "body", "icon", "message", "text"))
                if "📸" in blob or "Arrival photo" in blob:
                    n += 1
            return n

        before = _count_camera_notifs()

        # Start Trip
        s = requests.post(f"{API}/helper/tasks/{tid}/trip", headers=helper_headers,
                          json={"stage": "en_route"}, timeout=15)
        assert s.status_code == 200, s.text
        # Reached with proof_url
        proof = f"https://example.com/TEST_P5_PROOF_{uuid.uuid4().hex[:6]}.jpg"
        r = requests.post(f"{API}/helper/tasks/{tid}/trip", headers=helper_headers,
                          json={"stage": "reached", "proof_url": proof}, timeout=15)
        assert r.status_code == 200, r.text

        # Verify persistence via parent activity
        act = requests.get(f"{API}/helpers/{DEMO_HELPER_ID}/activity",
                           headers=parent_headers, timeout=15).json()
        rows = [c for c in (act.get("activity") or []) if c.get("task_id") == tid]
        assert rows, f"no activity row for task {tid}"
        row = rows[0]
        trip = row.get("trip") or {}
        assert trip.get("proof_url") == proof, f"proof_url not persisted: {trip}"
        assert row.get("status") == "done"
        assert trip.get("status") == "reached"

        after = _count_camera_notifs()
        assert after == before + 1, \
            f"expected exactly one 📸 arrival notification (before={before}, after={after})"

    def test_reached_without_proof_no_camera_notif(self, parent_headers, helper_headers,
                                                    demo_pickup_task):
        tid = demo_pickup_task["task_id"]
        _reset_today_pickup_completion(tid)
        s = requests.post(f"{API}/helper/tasks/{tid}/trip", headers=helper_headers,
                          json={"stage": "en_route"}, timeout=15)
        assert s.status_code == 200
        # Reached without proof
        r = requests.post(f"{API}/helper/tasks/{tid}/trip", headers=helper_headers,
                          json={"stage": "reached"}, timeout=15)
        assert r.status_code == 200
        # Activity trip has no proof_url
        act = requests.get(f"{API}/helpers/{DEMO_HELPER_ID}/activity",
                           headers=parent_headers, timeout=15).json()
        rows = [c for c in (act.get("activity") or []) if c.get("task_id") == tid]
        assert rows
        trip = (rows[0].get("trip") or {})
        assert not trip.get("proof_url"), f"proof_url should be absent: {trip}"


# ============ 4. SHIFT CHECK-IN / CHECK-OUT ================================
class TestShiftCheckInOut:
    def _count_green_notifs(self, parent_headers):
        r = requests.get(f"{API}/notifications", headers=parent_headers, timeout=15).json()
        items = r if isinstance(r, list) else (r.get("items") or r.get("notifications") or [])
        n = 0
        for it in items:
            blob = " ".join(str(it.get(k) or "") for k in
                            ("emoji", "title", "subtitle", "body", "icon", "message", "text"))
            if "🟢" in blob or "checked in" in blob.lower():
                n += 1
        return n

    def _count_wave_notifs(self, parent_headers):
        r = requests.get(f"{API}/notifications", headers=parent_headers, timeout=15).json()
        items = r if isinstance(r, list) else (r.get("items") or r.get("notifications") or [])
        n = 0
        for it in items:
            blob = " ".join(str(it.get(k) or "") for k in
                            ("emoji", "title", "subtitle", "body", "icon", "message", "text"))
            if "👋" in blob or "checked out" in blob.lower():
                n += 1
        return n

    def test_checkout_before_checkin_returns_400(self, parent_headers, helper_headers):
        _reset_today_checkin()
        r = requests.post(f"{API}/helper/checkout", headers=helper_headers, timeout=15)
        assert r.status_code == 400, f"expected 400 without checkin, got {r.status_code}: {r.text}"

    def test_checkin_idempotent_and_first_fires_notification(self, parent_headers, helper_headers):
        _reset_today_checkin()
        before_green = self._count_green_notifs(parent_headers)

        # 1st check-in
        r1 = requests.post(f"{API}/helper/checkin", headers=helper_headers, timeout=15)
        assert r1.status_code == 200, r1.text
        b1 = r1.json()
        assert b1.get("ok") is True
        ci1 = b1.get("checked_in_at")
        assert ci1

        after1 = self._count_green_notifs(parent_headers)
        assert after1 == before_green + 1, \
            f"expected +1 🟢 notification after first check-in (before={before_green}, after={after1})"

        # 2nd check-in (idempotent) — same timestamp, no new notification
        r2 = requests.post(f"{API}/helper/checkin", headers=helper_headers, timeout=15)
        assert r2.status_code == 200, r2.text
        b2 = r2.json()
        assert b2.get("checked_in_at") == ci1, \
            f"checked_in_at changed on 2nd call: {ci1} -> {b2.get('checked_in_at')}"

        after2 = self._count_green_notifs(parent_headers)
        assert after2 == after1, \
            f"2nd check-in wrongly fired another notification (after1={after1}, after2={after2})"

    def test_dashboard_checkin_present(self, helper_headers):
        r = requests.get(f"{API}/helper/dashboard", headers=helper_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "checkin" in d, f"dashboard missing 'checkin': keys={list(d.keys())}"
        ci = d["checkin"] or {}
        assert "checked_in_at" in ci, f"dashboard.checkin missing checked_in_at: {ci}"

    def test_parent_list_and_get_helper_expose_checkin(self, parent_headers):
        # GET /helpers list
        r = requests.get(f"{API}/helpers", headers=parent_headers, timeout=15).json()
        helpers = r if isinstance(r, list) else (r.get("helpers") or [])
        sun = next((h for h in helpers if h.get("helper_id") == DEMO_HELPER_ID), None)
        assert sun, "Sunita missing from /helpers list"
        assert "checked_in_at" in sun and "checked_out_at" in sun, \
            f"list missing checkin fields: {list(sun.keys())}"
        assert sun.get("checked_in_at"), "checked_in_at should be set after Test 2"

        # GET /helpers/{id}
        r2 = requests.get(f"{API}/helpers/{DEMO_HELPER_ID}",
                          headers=parent_headers, timeout=15).json()
        pub = r2.get("helper") or r2
        assert "checked_in_at" in pub and "checked_out_at" in pub, \
            f"helper detail missing checkin fields: {list(pub.keys())}"
        assert pub.get("checked_in_at")

    def test_checkout_success_fires_wave_and_sets_time(self, parent_headers, helper_headers):
        before_wave = self._count_wave_notifs(parent_headers)
        r = requests.post(f"{API}/helper/checkout", headers=helper_headers, timeout=15)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b.get("ok") is True
        assert b.get("checked_out_at")
        after_wave = self._count_wave_notifs(parent_headers)
        assert after_wave == before_wave + 1, \
            f"expected +1 👋 notification after checkout (before={before_wave}, after={after_wave})"


# ============ 5. REGRESSION / SECURITY =====================================
class TestSecurityRegressionP5:
    @pytest.mark.parametrize("path", ["/helper/care-team", "/helper/medical",
                                      "/helper/dashboard", "/helper/checkin"])
    def test_parent_token_rejected_on_helper_routes(self, parent_headers, path):
        if path == "/helper/checkin":
            r = requests.post(f"{API}{path}", headers=parent_headers, timeout=15)
        else:
            r = requests.get(f"{API}{path}", headers=parent_headers, timeout=15)
        assert r.status_code == 401, f"{path} -> {r.status_code}"

    @pytest.mark.parametrize("path", ["/care-team/chat", "/care-team/unread",
                                      f"/helpers/{DEMO_HELPER_ID}/ratings",
                                      "/helpers"])
    def test_helper_token_rejected_on_family_routes(self, helper_headers, path):
        r = requests.get(f"{API}{path}", headers=helper_headers, timeout=15)
        assert r.status_code == 401, f"{path} -> {r.status_code}"

    def test_helper_without_chat_perm_gets_403_on_care_team(self, parent_headers):
        uname = f"nochat5_{uuid.uuid4().hex[:6]}"
        body = {"name": "TEST_P5_NoChat", "role": "custom",
                "assigned_all": True, "assigned_member_ids": [],
                "permissions": {"chat": False, "medical": False, "tasks": True},
                "username": uname, "pin": "9977"}
        c = requests.post(f"{API}/helpers", headers=parent_headers, json=body, timeout=15)
        assert c.status_code in (200, 201), c.text
        hid = c.json()["helper"]["helper_id"]
        try:
            lg = requests.post(f"{API}/helper/login",
                               json={"username": uname, "pin": "9977"}, timeout=15).json()
            hh = {"Authorization": f"Bearer {lg['token']}",
                  "Content-Type": "application/json"}
            r = requests.get(f"{API}/helper/care-team", headers=hh, timeout=15)
            assert r.status_code == 403
            r2 = requests.post(f"{API}/helper/care-team", headers=hh,
                               json={"audio_url": "https://x/y.m4a", "audio_dur": 3}, timeout=15)
            assert r2.status_code == 403
        finally:
            requests.delete(f"{API}/helpers/{hid}", headers=parent_headers, timeout=10)

    def test_medical_still_privacy_scrubbed(self, helper_headers):
        r = requests.get(f"{API}/helper/medical", headers=helper_headers, timeout=15)
        assert r.status_code == 200
        blob = str(r.json()).lower()
        for bad in ("medication", "conditions", "insurance", "policy"):
            assert bad not in blob, f"'{bad}' leaked in medical response"

    def test_paused_helper_blocked_on_phase5_endpoints(self, parent_headers):
        uname = f"pause5_{uuid.uuid4().hex[:6]}"
        body = {"name": "TEST_P5_Pause", "role": "custom",
                "assigned_all": True, "assigned_member_ids": [],
                "permissions": {"chat": True, "medical": True, "tasks": True},
                "username": uname, "pin": "8877"}
        c = requests.post(f"{API}/helpers", headers=parent_headers, json=body, timeout=15)
        hid = c.json()["helper"]["helper_id"]
        try:
            lg = requests.post(f"{API}/helper/login",
                               json={"username": uname, "pin": "8877"}, timeout=15).json()
            hh = {"Authorization": f"Bearer {lg['token']}",
                  "Content-Type": "application/json"}
            # works before pause
            assert requests.get(f"{API}/helper/dashboard", headers=hh, timeout=15).status_code == 200

            p = requests.post(f"{API}/helpers/{hid}/pause", headers=parent_headers, timeout=15)
            assert p.status_code in (200, 204)

            # After pause, Phase-5 endpoints blocked
            for method, path in [("POST", "/helper/checkin"),
                                  ("POST", "/helper/checkout"),
                                  ("GET", "/helper/care-team"),
                                  ("GET", "/helper/dashboard")]:
                fn = requests.post if method == "POST" else requests.get
                rr = fn(f"{API}{path}", headers=hh, timeout=15)
                assert rr.status_code in (401, 403), f"paused {method} {path} -> {rr.status_code}"
        finally:
            requests.delete(f"{API}/helpers/{hid}", headers=parent_headers, timeout=10)
