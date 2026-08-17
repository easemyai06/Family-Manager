"""
Batch #22 — Re-hardening verification:

  SEC-002b: Login lockout is keyed on email + client IP (X-Forwarded-For
            left-most). Locking one IP must NOT lock the same email from a
            different IP.

  SEC-001b: /api/files/{path} accepts full Bearer (Authorization) or a media
            token (?token=<media_token from /auth/me>). No token = 401.
            A different family's token = 404. Non-Vault media stays reachable.

  Regression: /auth/me + core authenticated GETs still work with a full Bearer.
  Media token cannot be used against a regular API endpoint (/api/home → 401).
"""
import io
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
                break
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL missing"
API = f"{BASE_URL}/api"

BOARD_EMAIL = "board@fam.com"
BOARD_PASSWORD = "secret123"


# --------------------------------------------------------------------------- #
# Session fixtures
# --------------------------------------------------------------------------- #
@pytest.fixture(scope="session")
def board_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": BOARD_EMAIL, "password": BOARD_PASSWORD},
                      headers={"X-Forwarded-For": "10.0.0.1"},
                      timeout=30)
    assert r.status_code == 200, f"board login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def board_headers(board_token):
    return {"Authorization": f"Bearer {board_token}"}


@pytest.fixture(scope="session")
def board_media_token(board_headers):
    r = requests.get(f"{API}/auth/me", headers=board_headers, timeout=30)
    assert r.status_code == 200, r.text
    mt = r.json().get("media_token")
    assert isinstance(mt, str) and len(mt) > 20, "media_token missing on /auth/me"
    return mt


# --------------------------------------------------------------------------- #
# SEC-002b — per-(email+IP) lockout
# --------------------------------------------------------------------------- #
class TestLoginLockoutSegmentation:

    def test_ipA_5x401_then_429(self):
        """5 wrong on ipA => 401 each; 6th => 429 with Retry-After."""
        fake = f"probe_{uuid.uuid4().hex[:10]}@x.com"
        ipA = "11.11.11.11"
        for i in range(5):
            r = requests.post(
                f"{API}/auth/login",
                json={"email": fake, "password": "wrong_pw"},
                headers={"X-Forwarded-For": ipA},
                timeout=30,
            )
            assert r.status_code == 401, f"ipA attempt {i+1}: {r.status_code} {r.text}"
        r6 = requests.post(
            f"{API}/auth/login",
            json={"email": fake, "password": "wrong_pw"},
            headers={"X-Forwarded-For": ipA},
            timeout=30,
        )
        assert r6.status_code == 429, f"ipA 6th: expected 429 got {r6.status_code} {r6.text}"
        retry = r6.headers.get("Retry-After")
        assert retry is not None, "Retry-After missing on 429"
        assert 30 < int(retry) <= 600, f"Retry-After out of range: {retry}"

        # Persist for the next test via class attr
        TestLoginLockoutSegmentation._fake = fake

    def test_same_email_ipB_still_401_not_429(self):
        """Same fake email but from a different IP must NOT be locked out."""
        fake = getattr(TestLoginLockoutSegmentation, "_fake", None)
        assert fake, "prior test must run first"
        ipB = "22.22.22.22"
        r = requests.post(
            f"{API}/auth/login",
            json={"email": fake, "password": "wrong_pw"},
            headers={"X-Forwarded-For": ipB},
            timeout=30,
        )
        assert r.status_code == 401, (
            f"ipB expected 401 (segmentation OK); got {r.status_code} {r.text}"
        )

    def test_board_valid_login_unaffected_from_any_ip(self):
        """A locked (bad-email, ipA) key must not affect board@ (different email)."""
        # Try from ipA (the "attacker" IP)
        r = requests.post(
            f"{API}/auth/login",
            json={"email": BOARD_EMAIL, "password": BOARD_PASSWORD},
            headers={"X-Forwarded-For": "11.11.11.11"},
            timeout=30,
        )
        assert r.status_code == 200, f"board login on ipA failed: {r.status_code} {r.text}"
        assert "token" in r.json()

    def test_leftmost_xff_is_used(self):
        """The left-most XFF entry is the client. Two different left-most entries
        must map to two different lockout keys even if the tail is identical."""
        fake = f"probe_lm_{uuid.uuid4().hex[:8]}@x.com"
        # 5 fails from '33.33.33.33, 10.0.0.1'
        for i in range(5):
            r = requests.post(
                f"{API}/auth/login",
                json={"email": fake, "password": "wrong_pw"},
                headers={"X-Forwarded-For": "33.33.33.33, 10.0.0.1"},
                timeout=30,
            )
            assert r.status_code == 401
        r_lock = requests.post(
            f"{API}/auth/login",
            json={"email": fake, "password": "wrong_pw"},
            headers={"X-Forwarded-For": "33.33.33.33, 10.0.0.1"},
            timeout=30,
        )
        assert r_lock.status_code == 429, f"expected 429 on 6th, got {r_lock.status_code}"
        # Same email but left-most is 44.x.x.x — must be 401 (different key)
        r_other = requests.post(
            f"{API}/auth/login",
            json={"email": fake, "password": "wrong_pw"},
            headers={"X-Forwarded-For": "44.44.44.44, 10.0.0.1"},
            timeout=30,
        )
        assert r_other.status_code == 401, (
            f"different left-most XFF should not be locked: got {r_other.status_code}"
        )


# --------------------------------------------------------------------------- #
# Media-token API-scope rejection
# --------------------------------------------------------------------------- #
class TestMediaTokenScope:

    def test_media_token_rejected_on_api_home(self, board_media_token):
        r = requests.get(
            f"{API}/home",
            headers={"Authorization": f"Bearer {board_media_token}"},
            timeout=30,
        )
        assert r.status_code == 401, (
            f"media token must be file-only, but /home returned {r.status_code} {r.text[:120]}"
        )

    def test_media_token_rejected_on_auth_me(self, board_media_token):
        r = requests.get(
            f"{API}/auth/me",
            headers={"Authorization": f"Bearer {board_media_token}"},
            timeout=30,
        )
        assert r.status_code == 401


# --------------------------------------------------------------------------- #
# SEC-001b — /api/files auth + per-item Vault visibility + cross-family
# --------------------------------------------------------------------------- #
JPEG_BYTES = (b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
              b"\xff\xdb\x00C\x00" + b"\x08" * 64 + b"\xff\xd9")


class TestFilesAccess:
    """
    Uploads a non-Vault image as board@ and verifies:
       - no token         -> 401
       - board full token -> 200
       - board media tok  -> 200
       - other family tok -> 404
    Cleans up the throwaway other-family user with DELETE /api/auth/account.
    """

    @pytest.fixture(scope="class")
    def uploaded_file_url(self, board_token):
        files = {"file": ("probe.jpg", io.BytesIO(JPEG_BYTES), "image/jpeg")}
        data = {"kind": "image"}
        r = requests.post(
            f"{API}/upload",
            headers={"Authorization": f"Bearer {board_token}"},
            files=files, data=data, timeout=60,
        )
        assert r.status_code == 200, f"upload failed: {r.status_code} {r.text}"
        j = r.json()
        assert j["url"].startswith("/api/files/")
        return f"{BASE_URL}{j['url']}"

    def test_no_token_returns_401(self, uploaded_file_url):
        r = requests.get(uploaded_file_url, timeout=30)
        assert r.status_code == 401, f"no token: expected 401, got {r.status_code}"

    def test_owner_full_bearer_returns_200(self, uploaded_file_url, board_token):
        r = requests.get(
            uploaded_file_url,
            headers={"Authorization": f"Bearer {board_token}"},
            timeout=30,
        )
        assert r.status_code == 200, f"owner Bearer: expected 200, got {r.status_code}"
        assert len(r.content) > 0

    def test_owner_media_token_query_returns_200(self, uploaded_file_url,
                                                 board_media_token):
        r = requests.get(f"{uploaded_file_url}?token={board_media_token}", timeout=30)
        assert r.status_code == 200, f"media tok query: expected 200, got {r.status_code}"
        assert r.content[:2] == b"\xff\xd8" or len(r.content) > 0

    def test_different_family_token_returns_404(self, uploaded_file_url):
        """Register a throwaway user, give them their OWN family, then attempt
        to fetch board's file. Must be 404 (no cross-family read)."""
        email = f"TEST_xfam_{uuid.uuid4().hex[:8]}@x.com"
        pw = "secret123abc"
        reg = requests.post(
            f"{API}/auth/register",
            json={"name": "XFam Probe", "email": email, "password": pw},
            timeout=30,
        )
        assert reg.status_code == 200, f"register: {reg.status_code} {reg.text}"
        other_tok = reg.json()["token"]

        # Give the new user their own family (POST /api/families)
        fam = requests.post(
            f"{API}/families",
            headers={"Authorization": f"Bearer {other_tok}"},
            json={"name": "XFam Probe Household"},
            timeout=30,
        )
        assert fam.status_code in (200, 201), f"create family: {fam.status_code} {fam.text}"

        # Re-fetch token (family_id embedded in JWT? — server uses live user record.
        # Auth header still fine; live user now has family_id set.)
        try:
            r = requests.get(
                uploaded_file_url,
                headers={"Authorization": f"Bearer {other_tok}"},
                timeout=30,
            )
            assert r.status_code == 404, (
                f"cross-family: expected 404, got {r.status_code} {r.text[:120]}"
            )
        finally:
            # cleanup
            try:
                requests.delete(
                    f"{API}/auth/account",
                    headers={"Authorization": f"Bearer {other_tok}"},
                    timeout=30,
                )
            except Exception:
                pass


# --------------------------------------------------------------------------- #
# Regression — /auth/me + core authed GETs still 200
# --------------------------------------------------------------------------- #
CORE_ENDPOINTS = [
    "/home",
    "/families/members",
    "/events",
    "/notices",
    "/vault/items",
    "/emergency/medical",
]


class TestRegressionAuthedGets:

    def test_auth_me_has_media_token(self, board_headers):
        r = requests.get(f"{API}/auth/me", headers=board_headers, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["user"]["email"] == BOARD_EMAIL
        assert isinstance(d.get("media_token"), str)

    @pytest.mark.parametrize("path", CORE_ENDPOINTS)
    def test_core_get(self, board_headers, path):
        r = requests.get(f"{API}{path}", headers=board_headers, timeout=30)
        assert r.status_code == 200, f"{path}: {r.status_code} {r.text[:200]}"
