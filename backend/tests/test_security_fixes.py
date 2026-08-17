"""
Security-fix regression tests (SEC-001, SEC-002, P3, general auth/core regression).
Verifies:
  - SEC-001: /api/register-push requires auth (401 without, non-401 with token).
  - SEC-002: /api/files/{path} enforces same-family access (200 same fam, 401 no auth,
    404 different family).
  - P3: admin (organizer) can still POST /api/families/members.
  - Regression: /api/auth/me and core authed GETs return 200.
"""
import os
import io
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://our-story-191.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

BOARD_EMAIL = "board@fam.com"
BOARD_PASSWORD = "secret123"


# ---------- shared fixtures ----------
@pytest.fixture(scope="module")
def board_token():
    r = requests.post(f"{API}/auth/login", json={"email": BOARD_EMAIL, "password": BOARD_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"board login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"no token in login response: {data}"
    return tok


@pytest.fixture(scope="module")
def throwaway():
    """Register a fresh throwaway user + create their own family. Returns (token, email).
    The account is cleaned up in teardown via DELETE /api/auth/account."""
    email = f"TEST_throwaway_{uuid.uuid4().hex[:8]}@fam.com"
    password = "secret123"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": password, "name": "TEST Throwaway"}, timeout=30)
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"no token in register response: {data}"
    # create their own family
    r2 = requests.post(f"{API}/families", json={"name": "TEST Throwaway Family"},
                       headers={"Authorization": f"Bearer {tok}"}, timeout=30)
    assert r2.status_code in (200, 201), f"create family failed: {r2.status_code} {r2.text}"
    # refresh /me to make sure family is bound
    me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tok}"}, timeout=30)
    assert me.status_code == 200
    assert me.json().get("user", {}).get("family_id"), f"throwaway has no family_id: {me.json()}"
    yield tok, email
    # cleanup
    try:
        requests.delete(f"{API}/auth/account", headers={"Authorization": f"Bearer {tok}"}, timeout=30)
    except Exception:
        pass


# ---------- SEC-001: /api/register-push requires auth ----------
class TestSEC001RegisterPushAuth:
    def test_no_token_returns_401(self):
        r = requests.post(f"{API}/register-push",
                          json={"user_id": "anything", "platform": "android", "device_token": "tok_xyz"},
                          timeout=30)
        assert r.status_code == 401, f"expected 401 without token, got {r.status_code}: {r.text}"

    def test_with_token_is_authenticated(self, board_token):
        r = requests.post(f"{API}/register-push",
                          json={"user_id": "should_be_ignored", "platform": "android", "device_token": "tok_test"},
                          headers={"Authorization": f"Bearer {board_token}"},
                          timeout=30)
        # 401 = still unauthenticated (regression). Any other status means the fix is in place.
        # In preview 500 is expected because EMERGENT_PUSH_KEY is a placeholder.
        assert r.status_code != 401, f"expected != 401 with token, got 401: {r.text}"
        assert r.status_code in (201, 500, 502), f"unexpected status {r.status_code}: {r.text}"


# ---------- SEC-002: /api/files/{path} BOLA ----------
class TestSEC002FileBOLA:
    @pytest.fixture(scope="class")
    def uploaded_path(self, board_token):
        # tiny 1x1 png
        png = bytes.fromhex(
            "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C489"
            "0000000A49444154789C63000100000500010D0A2DB40000000049454E44AE426082"
        )
        files = {"file": ("test.png", io.BytesIO(png), "image/png")}
        data = {"kind": "image"}
        r = requests.post(f"{API}/upload", files=files, data=data,
                          headers={"Authorization": f"Bearer {board_token}"}, timeout=30)
        assert r.status_code in (200, 201), f"upload failed: {r.status_code} {r.text}"
        path = r.json().get("path")
        assert path, f"no path in upload response: {r.json()}"
        return path

    def test_same_family_token_returns_200(self, board_token, uploaded_path):
        r = requests.get(f"{API}/files/{uploaded_path}",
                         headers={"Authorization": f"Bearer {board_token}"}, timeout=30)
        assert r.status_code == 200, f"expected 200 for same-family, got {r.status_code}: {r.text[:200]}"
        # also verify token query works (used by SmartImage on web)
        r2 = requests.get(f"{API}/files/{uploaded_path}?token={board_token}", timeout=30)
        assert r2.status_code == 200, f"expected 200 via ?token=, got {r2.status_code}"

    def test_no_token_returns_401(self, uploaded_path):
        r = requests.get(f"{API}/files/{uploaded_path}", timeout=30)
        assert r.status_code == 401, f"expected 401 without token, got {r.status_code}: {r.text[:200]}"

    def test_different_family_token_returns_404(self, throwaway, uploaded_path):
        other_tok, _ = throwaway
        r = requests.get(f"{API}/files/{uploaded_path}",
                         headers={"Authorization": f"Bearer {other_tok}"}, timeout=30)
        assert r.status_code == 404, f"expected 404 for cross-family, got {r.status_code}: {r.text[:200]}"


# ---------- P3: /api/families/members authorization ----------
class TestP3MemberAddAuthorization:
    def test_admin_can_add_member(self, board_token):
        payload = {
            "name": f"TEST_p3_{uuid.uuid4().hex[:6]}",
            "relationship": "child",
            "role": "child",
            "is_child": True,
        }
        r = requests.post(f"{API}/families/members", json=payload,
                          headers={"Authorization": f"Bearer {board_token}"}, timeout=30)
        assert r.status_code in (200, 201), f"admin add member failed: {r.status_code} {r.text}"
        created = r.json()
        mid = created.get("member_id")
        assert mid, f"no member_id in response: {created}"
        # verify persistence via list
        r2 = requests.get(f"{API}/families/members",
                          headers={"Authorization": f"Bearer {board_token}"}, timeout=30)
        assert r2.status_code == 200
        names = [m.get("name") for m in r2.json()]
        assert payload["name"] in names, f"created member not in list: {names}"
        # cleanup
        try:
            requests.delete(f"{API}/families/members/{mid}",
                            headers={"Authorization": f"Bearer {board_token}"}, timeout=30)
        except Exception:
            pass


# ---------- REGRESSION: auth + core authed GETs ----------
class TestRegressionAuthCore:
    def test_login_and_me(self, board_token):
        r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {board_token}"}, timeout=30)
        assert r.status_code == 200
        user = r.json().get("user")
        assert user and user.get("email") == BOARD_EMAIL

    @pytest.mark.parametrize("path", [
        "/home",
        "/families/members",
        "/events",
        "/notices",
        "/vault/items",
        "/emergency/medical",
    ])
    def test_core_authed_get(self, board_token, path):
        r = requests.get(f"{API}{path}", headers={"Authorization": f"Bearer {board_token}"}, timeout=30)
        assert r.status_code == 200, f"{path} returned {r.status_code}: {r.text[:200]}"
