"""Batch #28 — Forgot password + PIN login + Child credentials + Notifications Center.

Regression surface covered:
  * Forgot / reset password:
      - POST /api/auth/forgot-password always returns 200 (existent + unknown email).
      - POST /api/auth/reset-password with wrong 6-digit code -> 400.
      - POST /api/auth/reset-password with new_password < 6 chars -> 400 (regardless of code).
  * Quick-unlock PIN (adult):
      - POST /api/auth/pin sets PIN, /auth/me returns pin_set=True + non-null family_chat_id.
      - POST /api/auth/pin-login {user_id, pin} works; wrong pin -> 401; short pin ('12') -> 401 (not 500).
      - DELETE /api/auth/pin clears; /auth/me pin_set=False afterwards.
  * Child credentials + child login + role guards:
      - Non-admin child member gets username+password+PIN via POST /families/members/{id}/credentials.
      - POST /auth/login with {username, password} returns a token.
      - POST /auth/pin-login {member_id, pin} returns a token.
      - GET /families/me now surfaces has_login/has_pin/username for that member.
      - Setting credentials on target with role=admin -> 403.
      - Adding member with role=admin -> 400.
      - Non-parent trying to set credentials -> 403.
  * Notifications Center:
      - GET /api/notifications returns {items, unread_count, last_read}, items includes
        activity from OTHER members and/or upcoming birthdays.
      - POST /api/notifications/read is ok, GET /api/notifications/unread drops.
"""
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "protectdemo@fam.com"
PASSWORD = "secret123"


def _session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(email, password):
    s = _session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    return s, r.json()


@pytest.fixture(scope="module")
def admin():
    s, data = _login(ADMIN_EMAIL, PASSWORD)
    return {"session": s, "user": data["user"], "token": data["token"]}


# ---------------------------------------------------------------------------
# Forgot / reset password
# ---------------------------------------------------------------------------
class TestForgotReset:
    def test_forgot_password_always_ok_for_known_email(self):
        s = _session()
        r = s.post(f"{API}/auth/forgot-password", json={"email": ADMIN_EMAIL}, timeout=20)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

    def test_forgot_password_always_ok_for_unknown_email(self):
        s = _session()
        r = s.post(
            f"{API}/auth/forgot-password",
            json={"email": f"unknown_{uuid.uuid4().hex[:8]}@none.example"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

    def test_reset_with_wrong_code_returns_400(self):
        s = _session()
        r = s.post(
            f"{API}/auth/reset-password",
            json={"email": ADMIN_EMAIL, "code": "000000", "new_password": "brandnewpass123"},
            timeout=20,
        )
        assert r.status_code == 400, r.text

    def test_reset_with_short_password_returns_400(self):
        s = _session()
        r = s.post(
            f"{API}/auth/reset-password",
            json={"email": ADMIN_EMAIL, "code": "123456", "new_password": "abc"},
            timeout=20,
        )
        assert r.status_code == 400, r.text


# ---------------------------------------------------------------------------
# Quick-unlock PIN for the signed-in adult
# ---------------------------------------------------------------------------
class TestQuickPin:
    def test_set_pin_and_me_reports_pin_set_and_family_chat(self, admin):
        s = admin["session"]
        r = s.post(f"{API}/auth/pin", json={"pin": "4321"}, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True and body.get("pin_set") is True

        me = s.get(f"{API}/auth/me", timeout=20)
        assert me.status_code == 200
        mej = me.json()
        assert mej.get("pin_set") is True
        assert mej.get("family_chat_id"), "family_chat_id must be non-null after login"

    def test_pin_login_with_user_id_works(self, admin):
        uid = admin["user"]["user_id"]
        r = requests.post(f"{API}/auth/pin-login", json={"user_id": uid, "pin": "4321"}, timeout=20)
        assert r.status_code == 200, r.text
        assert "token" in r.json() and r.json().get("user", {}).get("user_id") == uid

    def test_pin_login_wrong_pin_returns_401(self, admin):
        uid = admin["user"]["user_id"]
        r = requests.post(f"{API}/auth/pin-login", json={"user_id": uid, "pin": "0000"}, timeout=20)
        assert r.status_code == 401, r.text

    def test_pin_login_short_pin_returns_401_not_500(self, admin):
        uid = admin["user"]["user_id"]
        r = requests.post(f"{API}/auth/pin-login", json={"user_id": uid, "pin": "12"}, timeout=20)
        assert r.status_code == 401, r.text

    def test_delete_pin_clears_state(self, admin):
        s = admin["session"]
        r = s.delete(f"{API}/auth/pin", timeout=20)
        assert r.status_code == 200, r.text
        assert r.json().get("pin_set") is False

        me = s.get(f"{API}/auth/me", timeout=20).json()
        assert me.get("pin_set") is False
        # Re-set for later tests that assume a PIN is present is not required — leave cleared.


# ---------------------------------------------------------------------------
# Child credentials + username-login + member-PIN login + role guards
# ---------------------------------------------------------------------------
class TestChildCredentialsAndGuards:
    @pytest.fixture(scope="class")
    def child_member(self, admin):
        s = admin["session"]
        r = s.get(f"{API}/families/me", timeout=20)
        assert r.status_code == 200
        fam = r.json()
        members = fam["members"]
        admin_mid = fam.get("viewer_member_id")
        # pick a non-admin child-role member if possible, else any non-admin
        candidates = [m for m in members if m.get("role") == "child" and m.get("member_id") != admin_mid]
        if not candidates:
            candidates = [m for m in members if m.get("role") != "admin" and m.get("member_id") != admin_mid]
        assert candidates, "no non-admin candidate member found"
        return candidates[0], fam, admin_mid

    def test_add_member_role_admin_returns_400(self, admin):
        s = admin["session"]
        r = s.post(
            f"{API}/families/members",
            json={"name": f"TEST_admin_{uuid.uuid4().hex[:6]}", "relationship": "Parent", "role": "admin"},
            timeout=20,
        )
        assert r.status_code == 400, r.text

    def test_set_credentials_and_username_login(self, admin, child_member):
        target, fam, _ = child_member
        s = admin["session"]
        uname = f"test_kid_{uuid.uuid4().hex[:6]}"
        r = s.post(
            f"{API}/families/members/{target['member_id']}/credentials",
            json={"username": uname, "password": "kidpass123", "pin": "1111"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("username") == uname
        assert body.get("has_password") is True
        assert body.get("has_pin") is True

        # username login
        r2 = requests.post(f"{API}/auth/login", json={"username": uname, "password": "kidpass123"}, timeout=20)
        assert r2.status_code == 200, r2.text
        assert "token" in r2.json()

        # pin-login via member_id
        r3 = requests.post(
            f"{API}/auth/pin-login",
            json={"member_id": target["member_id"], "pin": "1111"},
            timeout=20,
        )
        assert r3.status_code == 200, r3.text
        assert "token" in r3.json()

        # families/me reflects new credentials
        fam2 = s.get(f"{API}/families/me", timeout=20).json()
        updated = next((m for m in fam2["members"] if m["member_id"] == target["member_id"]), None)
        assert updated is not None
        assert updated.get("has_login") is True
        assert updated.get("has_pin") is True
        assert updated.get("username") == uname

    def test_set_credentials_on_admin_target_returns_403(self, admin, child_member):
        _, fam, admin_mid = child_member
        s = admin["session"]
        r = s.post(
            f"{API}/families/members/{admin_mid}/credentials",
            json={"username": f"test_bad_{uuid.uuid4().hex[:5]}", "password": "kidpass123"},
            timeout=20,
        )
        assert r.status_code == 403, r.text

    def test_non_parent_cannot_set_credentials(self, admin, child_member):
        """A signed-in child (or any non-parent) trying to set another member's credentials -> 403."""
        target, fam, _ = child_member
        # sign in as the kid we just credentialed (username+password)
        # we know they have has_login/pin=1111 & password=kidpass123 from prior test — but
        # fresh username is different for each run. Look it up via families/me.
        fam2 = admin["session"].get(f"{API}/families/me", timeout=20).json()
        kid = next(m for m in fam2["members"] if m["member_id"] == target["member_id"])
        uname = kid.get("username")
        if not uname:
            pytest.skip("kid has no username yet")
        r_login = requests.post(f"{API}/auth/login", json={"username": uname, "password": "kidpass123"}, timeout=20)
        assert r_login.status_code == 200, r_login.text
        kid_token = r_login.json()["token"]

        # kid tries to set another child's credentials
        other = next(
            (m for m in fam2["members"] if m["member_id"] not in (target["member_id"], fam2.get("viewer_member_id"))),
            None,
        )
        if not other:
            pytest.skip("no other member to target")
        r = requests.post(
            f"{API}/families/members/{other['member_id']}/credentials",
            json={"username": f"test_hack_{uuid.uuid4().hex[:5]}", "pin": "2222"},
            headers={"Authorization": f"Bearer {kid_token}", "Content-Type": "application/json"},
            timeout=20,
        )
        assert r.status_code == 403, r.text


# ---------------------------------------------------------------------------
# Notifications Center
# ---------------------------------------------------------------------------
class TestNotifications:
    def test_notifications_list_shape_and_read_drops_unread(self, admin):
        s = admin["session"]
        r = s.get(f"{API}/notifications", timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "items" in body and isinstance(body["items"], list)
        assert "unread_count" in body
        assert "last_read" in body
        # Items should mix upcoming birthdays and activity from others (Sharma demo seed
        # posts many things authored by non-viewer members) — expect non-empty for
        # protectdemo family.
        assert len(body["items"]) >= 1, "expected at least 1 notification for seeded family"

        # mark read
        r2 = s.post(f"{API}/notifications/read", timeout=20)
        assert r2.status_code == 200, r2.text

        # unread should now be 0 (or at most non-birthday items created between calls;
        # in a fresh test window it should be 0)
        r3 = s.get(f"{API}/notifications/unread", timeout=20)
        assert r3.status_code == 200, r3.text
        assert r3.json().get("count", -1) == 0
