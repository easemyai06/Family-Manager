"""
Batch #21 — Backend tests for:
  1) Login rate limiting (5x401 -> 429 with Retry-After) & counter clears on success
  2) Signed short-lived media_token in /auth/me; media token is NOT valid for API
     endpoints; /api/files/{path} accepts media_token via ?token= AND full user
     token via Authorization header, and 401s without any token.
  3) Regression: /auth/me and core authenticated GETs still work with a full
     Bearer token.
"""
import io
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # supervisor exposes it via frontend/.env; read as fallback
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
                    break
    except Exception:
        pass
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL missing"
API = f"{BASE_URL}/api"

BOARD_EMAIL = "board@fam.com"
BOARD_PASSWORD = "secret123"


@pytest.fixture(scope="session")
def board_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": BOARD_EMAIL, "password": BOARD_PASSWORD},
                      timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and "user" in data
    return data["token"]


@pytest.fixture(scope="session")
def board_headers(board_token):
    return {"Authorization": f"Bearer {board_token}"}


# ---------------------------------------------------------------------------
# 1) LOGIN RATE LIMITING
# ---------------------------------------------------------------------------
class TestLoginRateLimit:
    """5 wrong passwords for a fake email -> 401 each, 6th -> 429 with Retry-After."""

    def test_5x401_then_429(self):
        fake_email = f"TEST_ratelimit_probe_{uuid.uuid4().hex[:8]}@x.com"
        for i in range(5):
            r = requests.post(f"{API}/auth/login",
                              json={"email": fake_email, "password": "wrong_pw"},
                              timeout=30)
            assert r.status_code == 401, f"attempt {i+1}: expected 401, got {r.status_code} {r.text}"
        # 6th attempt should be 429
        r6 = requests.post(f"{API}/auth/login",
                           json={"email": fake_email, "password": "wrong_pw"},
                           timeout=30)
        assert r6.status_code == 429, f"6th: expected 429, got {r6.status_code} {r6.text}"
        retry_after = r6.headers.get("Retry-After")
        assert retry_after is not None, "Retry-After header missing on 429"
        try:
            secs = int(retry_after)
        except ValueError:
            pytest.fail(f"Retry-After not an int: {retry_after!r}")
        # 10 min lock == 600 s (allow small drift)
        assert 60 < secs <= 600, f"Retry-After out of range: {secs}"

    def test_board_valid_login_unaffected(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": BOARD_EMAIL, "password": BOARD_PASSWORD},
                          timeout=30)
        assert r.status_code == 200, f"board login failed: {r.status_code} {r.text}"
        assert "token" in r.json()

    def test_success_clears_counter(self):
        """Wrong password 3 times for board's throwaway variant then correct login
        for a fresh throwaway user resets counter (we only assert board is fine
        via test_board_valid_login_unaffected). Here we exercise the register→
        login-fail-2x→ correct-login → login-fail-2x → correct-login flow which
        should NOT hit 429 because counter clears on success."""
        email = f"TEST_clr_{uuid.uuid4().hex[:8]}@fam.com"
        pw = "secret123abc"
        r = requests.post(f"{API}/auth/register",
                          json={"name": "Clear Probe", "email": email, "password": pw},
                          timeout=30)
        assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
        token = r.json()["token"]

        # 2 wrongs, then correct (should clear)
        for _ in range(2):
            rw = requests.post(f"{API}/auth/login",
                               json={"email": email, "password": "wrong_pw"}, timeout=30)
            assert rw.status_code == 401
        rok = requests.post(f"{API}/auth/login",
                            json={"email": email, "password": pw}, timeout=30)
        assert rok.status_code == 200, f"correct login should succeed: {rok.text}"

        # 4 more wrong attempts should still be 401 (counter was cleared)
        for i in range(4):
            rw = requests.post(f"{API}/auth/login",
                               json={"email": email, "password": "wrong_pw"}, timeout=30)
            assert rw.status_code == 401, f"post-clear attempt {i+1}: expected 401, got {rw.status_code}"

        # cleanup: delete throwaway account
        try:
            requests.delete(f"{API}/auth/account",
                            headers={"Authorization": f"Bearer {token}"}, timeout=30)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# 2) MEDIA TOKEN
# ---------------------------------------------------------------------------
class TestMediaToken:
    """/auth/me returns media_token; it's read-only file token, not API token."""

    def test_auth_me_returns_media_token(self, board_headers):
        r = requests.get(f"{API}/auth/me", headers=board_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "user" in data and "media_token" in data
        assert isinstance(data["media_token"], str) and len(data["media_token"]) > 20

    def test_media_token_rejected_on_api(self, board_headers):
        me = requests.get(f"{API}/auth/me", headers=board_headers, timeout=30).json()
        mt = me["media_token"]
        # Using media token as bearer on /api/home should 401
        r = requests.get(f"{API}/home",
                         headers={"Authorization": f"Bearer {mt}"}, timeout=30)
        assert r.status_code == 401, f"media token accepted on /home: {r.status_code} {r.text}"

    def test_file_access_via_media_token_query(self, board_headers, board_token):
        me = requests.get(f"{API}/auth/me", headers=board_headers, timeout=30).json()
        mt = me["media_token"]

        # Upload a small image
        img_bytes = (b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
                     b"\xff\xdb\x00C\x00" + b"\x08" * 64 + b"\xff\xd9")
        files = {"file": ("probe.jpg", io.BytesIO(img_bytes), "image/jpeg")}
        data = {"kind": "image"}
        up = requests.post(f"{API}/upload",
                           headers={"Authorization": f"Bearer {board_token}"},
                           files=files, data=data, timeout=60)
        assert up.status_code == 200, f"upload failed: {up.status_code} {up.text}"
        upj = up.json()
        assert "url" in upj and upj["url"].startswith("/api/files/")
        rel_url = upj["url"]  # /api/files/<path>
        full_url = f"{BASE_URL}{rel_url}"

        # No auth -> 401
        r_no = requests.get(full_url, timeout=30)
        assert r_no.status_code == 401, f"no-auth: expected 401, got {r_no.status_code}"

        # ?token=<media_token> -> 200
        r_mt = requests.get(f"{full_url}?token={mt}", timeout=30)
        assert r_mt.status_code == 200, f"media token query: expected 200, got {r_mt.status_code} {r_mt.text[:200]}"
        assert r_mt.content[:2] == b"\xff\xd8" or len(r_mt.content) > 0

        # Full user token via Authorization header -> 200
        r_hdr = requests.get(full_url,
                             headers={"Authorization": f"Bearer {board_token}"},
                             timeout=30)
        assert r_hdr.status_code == 200, f"full token header: expected 200, got {r_hdr.status_code}"


# ---------------------------------------------------------------------------
# 3) REGRESSION — auth/me + core authed GETs still work
# ---------------------------------------------------------------------------
class TestAuthCoreRegression:
    ENDPOINTS = [
        "/home",
        "/families/members",
        "/events",
        "/notices",
        "/vault/items",
        "/emergency/medical",
    ]

    def test_auth_me(self, board_headers):
        r = requests.get(f"{API}/auth/me", headers=board_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user"]["email"] == BOARD_EMAIL

    @pytest.mark.parametrize("path", ENDPOINTS)
    def test_core_get(self, board_headers, path):
        r = requests.get(f"{API}{path}", headers=board_headers, timeout=30)
        assert r.status_code == 200, f"{path}: {r.status_code} {r.text[:200]}"
