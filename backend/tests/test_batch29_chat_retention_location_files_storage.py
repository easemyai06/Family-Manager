"""
Batch #29 backend tests — Chat retention / location sharing / file messages / storage cleanup.

Coverage:
  - PATCH /api/chats/{id}/retention (admin allowed, persists, purge doesn't error)
  - POST /chats/{id}/messages type=location & type=live_location
  - PATCH /chats/{id}/messages/{mid}/location (sender-only guard reasoned)
  - POST /chats/{id}/messages/{mid}/stop-live (sender-only guard reasoned)
  - POST /api/upload kind=document, then POST /chats/{id}/messages type=file, /api/files serves it (family-scoped)
  - GET /api/storage/usage shape
  - POST /api/storage/cleanup scope=chat_media (older_than_days=9999 -> no-op safe)
  - POST /api/storage/cleanup scope=chat_history on a FRESH family (destructive)
"""

import io
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://our-story-191.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

DEMO_EMAIL = "storytester@fam.com"
DEMO_PASSWORD = "secret123"


# ----- helpers -----

def _login(email: str, password: str) -> dict:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()

def _register_fresh() -> dict:
    email = f"batch29_{uuid.uuid4().hex[:10]}@fam.com"
    r = requests.post(f"{API}/auth/register",
                      json={"email": email, "password": "secret123", "name": "B29 Tester"}, timeout=20)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    return r.json()

def _hdrs(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

def _hdrs_no_ct(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}

def _seed_demo(token: str) -> None:
    r = requests.post(f"{API}/seed/demo", headers=_hdrs(token), timeout=60)
    # seed may be 200 or 400 if already seeded; both fine
    assert r.status_code in (200, 400), r.text

def _get_family_chat_id(token: str) -> str:
    rc = requests.get(f"{API}/chats", headers=_hdrs(token), timeout=20)
    assert rc.status_code == 200, rc.text
    chats = rc.json()
    if isinstance(chats, dict):
        chats = chats.get("chats", [])
    for c in chats:
        if c.get("type") == "family":
            return c["chat_id"]
    raise AssertionError(f"no family chat found in {chats!r}")


# ----- fixtures -----

@pytest.fixture(scope="module")
def admin():
    return _login(DEMO_EMAIL, DEMO_PASSWORD)

@pytest.fixture(scope="module")
def admin_token(admin):
    return admin["token"]

@pytest.fixture(scope="module")
def family_chat_id(admin_token):
    return _get_family_chat_id(admin_token)


# =====================================================================
# 1. Retention
# =====================================================================
class TestRetention:
    def test_set_retention_7_persists(self, admin_token, family_chat_id):
        r = requests.patch(f"{API}/chats/{family_chat_id}/retention",
                           headers=_hdrs(admin_token), json={"days": 7}, timeout=20)
        assert r.status_code == 200, r.text
        assert r.json().get("retention_days") == 7

        # GET chat via /chats and confirm persisted (retention_days is on chat doc)
        rl = requests.get(f"{API}/chats", headers=_hdrs(admin_token), timeout=20)
        assert rl.status_code == 200
        chats = rl.json()
        if isinstance(chats, dict):
            chats = chats.get("chats", [])
        me = next((c for c in chats if c["chat_id"] == family_chat_id), None)
        assert me is not None
        assert me.get("retention_days") == 7

        # GET messages shouldn't error (purge path runs)
        rm = requests.get(f"{API}/chats/{family_chat_id}/messages", headers=_hdrs(admin_token), timeout=20)
        assert rm.status_code == 200, rm.text
        assert "messages" in rm.json()

    def test_retention_invalid_becomes_null(self, admin_token, family_chat_id):
        r = requests.patch(f"{API}/chats/{family_chat_id}/retention",
                           headers=_hdrs(admin_token), json={"days": 5}, timeout=20)
        assert r.status_code == 200
        assert r.json().get("retention_days") is None

    def test_retention_off(self, admin_token, family_chat_id):
        r = requests.patch(f"{API}/chats/{family_chat_id}/retention",
                           headers=_hdrs(admin_token), json={"days": None}, timeout=20)
        assert r.status_code == 200
        assert r.json().get("retention_days") is None


# =====================================================================
# 2. Location + live_location
# =====================================================================
class TestLocationMessages:
    def test_send_location_message(self, admin_token, family_chat_id):
        r = requests.post(f"{API}/chats/{family_chat_id}/messages",
                          headers=_hdrs(admin_token),
                          json={"type": "location", "lat": 12.9716, "lng": 77.5946},
                          timeout=20)
        assert r.status_code == 200, r.text
        m = r.json()
        assert m.get("type") == "location"
        assert m.get("lat") == 12.9716 and m.get("lng") == 77.5946

    def test_send_live_location_and_stop(self, admin_token, family_chat_id):
        from datetime import datetime, timezone, timedelta
        until = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
        r = requests.post(f"{API}/chats/{family_chat_id}/messages",
                          headers=_hdrs(admin_token),
                          json={"type": "live_location", "lat": 12.9716, "lng": 77.5946, "live_until": until},
                          timeout=20)
        assert r.status_code == 200, r.text
        mid = r.json()["message_id"]

        # Update location as sender -> 200
        r2 = requests.patch(f"{API}/chats/{family_chat_id}/messages/{mid}/location",
                            headers=_hdrs(admin_token),
                            json={"lat": 13.0000, "lng": 77.6000}, timeout=20)
        assert r2.status_code == 200, r2.text
        assert r2.json().get("ok") is True

        # Stop live as sender -> 200
        r3 = requests.post(f"{API}/chats/{family_chat_id}/messages/{mid}/stop-live",
                           headers=_hdrs(admin_token), json={}, timeout=20)
        assert r3.status_code == 200, r3.text
        assert r3.json().get("ok") is True

    def test_update_location_not_found_404(self, admin_token, family_chat_id):
        r = requests.patch(f"{API}/chats/{family_chat_id}/messages/does_not_exist/location",
                           headers=_hdrs(admin_token),
                           json={"lat": 1.0, "lng": 2.0}, timeout=20)
        assert r.status_code == 404


# =====================================================================
# 3. File message: upload doc -> message type=file -> /files serves it (family-scoped)
# =====================================================================
class TestFileMessage:
    def test_upload_document_and_send_and_serve(self, admin_token, family_chat_id):
        pdf_bytes = b"%PDF-1.4\n%TEST batch29 pdf\n%%EOF\n"
        files = {"file": ("batch29_test.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
        data = {"kind": "document"}
        r = requests.post(f"{API}/upload", headers=_hdrs_no_ct(admin_token),
                          files=files, data=data, timeout=30)
        assert r.status_code == 200, r.text
        up = r.json()
        assert up.get("type") == "document"
        url = up["url"]
        assert url.startswith("/api/files/")

        # Send file message
        rmsg = requests.post(f"{API}/chats/{family_chat_id}/messages",
                             headers=_hdrs(admin_token),
                             json={"type": "file",
                                   "media": [{"url": url, "type": "document"}],
                                   "file_name": "batch29_test.pdf",
                                   "file_size": len(pdf_bytes),
                                   "file_mime": "application/pdf"},
                             timeout=20)
        assert rmsg.status_code == 200, rmsg.text
        m = rmsg.json()
        assert m.get("type") == "file"
        assert m.get("file_name") == "batch29_test.pdf"
        assert m.get("file_mime") == "application/pdf"

        # Serve the file (family-scoped) using Authorization header
        path = url.replace("/api/files/", "")
        rf = requests.get(f"{API}/files/{path}", headers=_hdrs_no_ct(admin_token), timeout=20)
        assert rf.status_code == 200, rf.text
        assert rf.content.startswith(b"%PDF")

        # Serve with token query param also works
        rf2 = requests.get(f"{API}/files/{path}?token={admin_token}", timeout=20)
        assert rf2.status_code == 200

        # Unauthenticated -> 401
        rf3 = requests.get(f"{API}/files/{path}", timeout=20)
        assert rf3.status_code == 401

    def test_file_scoped_to_family(self, admin_token, family_chat_id):
        """Upload as admin then try to serve as a fresh account with different family -> 404."""
        pdf_bytes = b"%PDF-1.4\n%B29 scope test\n%%EOF\n"
        files = {"file": ("scope_test.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
        data = {"kind": "document"}
        r = requests.post(f"{API}/upload", headers=_hdrs_no_ct(admin_token),
                          files=files, data=data, timeout=30)
        assert r.status_code == 200
        path = r.json()["url"].replace("/api/files/", "")

        # Fresh account with own new family
        fresh = _register_fresh()
        # register creates onboarding-state user with no family; create a fresh family so
        # require_family() succeeds server-side when serving files
        rcreate = requests.post(f"{API}/families",
                                headers=_hdrs(fresh["token"]),
                                json={"name": "Scope Test Family"}, timeout=20)
        assert rcreate.status_code in (200, 201), rcreate.text

        # Attempt to serve the admin-uploaded file with fresh account -> 404 (family-scoped)
        rf = requests.get(f"{API}/files/{path}",
                          headers=_hdrs_no_ct(fresh["token"]), timeout=20)
        assert rf.status_code == 404, f"family scoping broken: {rf.status_code} {rf.text[:200]}"


# =====================================================================
# 4. Storage usage + cleanup
# =====================================================================
class TestStorage:
    def test_usage_shape(self, admin_token):
        r = requests.get(f"{API}/storage/usage", headers=_hdrs(admin_token), timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("messages", "media_messages", "media_files"):
            assert k in data, f"missing {k}: {data}"
            assert isinstance(data[k], int)
            assert data[k] >= 0

    def test_cleanup_chat_media_safe(self, admin_token):
        """No-op-ish: only wipe media older than 9999 days (i.e. none)."""
        r = requests.post(f"{API}/storage/cleanup",
                          headers=_hdrs(admin_token),
                          json={"scope": "chat_media", "older_than_days": 9999},
                          timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("media_removed") == 0

    def test_cleanup_chat_history_fresh_family(self):
        """Destructive test — uses a FRESH registered account so the shared demo isn't wiped.
        Send a message then cleanup with older_than_days=0 -> all wiped."""
        fresh = _register_fresh()
        _seed_demo(fresh["token"])
        token = fresh["token"]

        chat_id = _get_family_chat_id(token)
        # add a message so there's something to wipe
        r = requests.post(f"{API}/chats/{chat_id}/messages",
                          headers=_hdrs(token),
                          json={"text": "hello batch29 fresh"}, timeout=20)
        assert r.status_code == 200, r.text

        before = requests.get(f"{API}/storage/usage", headers=_hdrs(token), timeout=20).json()
        assert before["messages"] >= 1

        rc = requests.post(f"{API}/storage/cleanup",
                           headers=_hdrs(token),
                           json={"scope": "chat_history", "older_than_days": 0},
                           timeout=30)
        assert rc.status_code == 200, rc.text
        assert rc.json().get("ok") is True
        removed = rc.json().get("messages_removed", 0)
        assert removed >= 1

        after = requests.get(f"{API}/storage/usage", headers=_hdrs(token), timeout=20).json()
        assert after["messages"] == 0, f"expected all messages wiped, got {after}"

        # follow-up: GET /messages must not error after purge
        rm = requests.get(f"{API}/chats/{chat_id}/messages", headers=_hdrs(token), timeout=20)
        assert rm.status_code == 200
        assert rm.json().get("messages") == []
