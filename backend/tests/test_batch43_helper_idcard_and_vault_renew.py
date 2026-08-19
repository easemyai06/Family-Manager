"""
Batch #43 — Backend tests
  A) HELPER ID CARD BACK
     - POST /api/helpers accepts and persists id_card_back_url
     - PATCH /api/helpers/{id} accepts and persists id_card_back_url
     - GET  /api/helpers/{id} returns BOTH id_card_url (front) and id_card_back_url (back)
     - Clearing id_card_back_url (empty string) removes the value
     - Helper management endpoints remain parent/admin only (child gets 403)

  B) VAULT MARK-AS-RENEWED
     - POST /api/vault/items/{id}/renew updates expiry_date (verify via GET)
     - Invalid date -> 400
     - Missing token -> 401
     - Non-editor (child in family) -> 403
     - After renewing near-expiry doc to far future, the vault_expiry
       notification for that item is no longer in /api/notifications
"""
import os
import re
import uuid
import datetime as dt
import requests
import pytest


def _resolve_base_url() -> str:
    for k in ("EXPO_PUBLIC_BACKEND_URL", "EXPO_BACKEND_URL"):
        v = os.environ.get(k)
        if v:
            return v.rstrip("/")
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                line = line.strip()
                if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().strip('"').rstrip("/")
    except Exception:
        pass
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL not configured")


BASE_URL = _resolve_base_url()


# ---------------- session helpers ----------------
def _new_session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(sess: requests.Session, email: str, password: str) -> dict:
    r = sess.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    data = r.json()
    sess.headers["Authorization"] = f"Bearer {data['token']}"
    return data


# =====================================================================
# A) HELPER ID CARD (front + back)
# =====================================================================
class TestHelperIdCardBack:
    @pytest.fixture(scope="class")
    def parent(self):
        s = _new_session()
        _login(s, "storytester@fam.com", "secret123")
        return s

    @pytest.fixture(scope="class")
    def helper_id(self, parent):
        """Create a fresh test helper with BOTH front and back id-card urls."""
        payload = {
            "name": f"TEST_batch43_{uuid.uuid4().hex[:6]}",
            "role": "house_help",
            "photo_url": "https://example.com/photo.jpg",
            "id_card_url": "https://example.com/idfront.jpg",
            "id_card_back_url": "https://example.com/idback.jpg",
            "assigned_all": False,
        }
        r = parent.post(f"{BASE_URL}/api/helpers", json=payload)
        assert r.status_code in (200, 201), r.text
        body = r.json()
        hid = body["helper"]["helper_id"]
        # cleanup at end of class via a yield-style teardown
        yield hid
        parent.delete(f"{BASE_URL}/api/helpers/{hid}")

    # ---- POST persists id_card_back_url ----
    def test_create_helper_persists_id_card_back_url(self, parent, helper_id):
        r = parent.get(f"{BASE_URL}/api/helpers/{helper_id}")
        assert r.status_code == 200, r.text
        h = r.json()["helper"]
        assert h.get("id_card_url") == "https://example.com/idfront.jpg", h
        assert h.get("id_card_back_url") == "https://example.com/idback.jpg", h

    # ---- PATCH updates id_card_back_url ----
    def test_patch_helper_updates_id_card_back_url(self, parent, helper_id):
        new_back = "https://example.com/idback_v2.jpg"
        r = parent.patch(
            f"{BASE_URL}/api/helpers/{helper_id}",
            json={"id_card_back_url": new_back},
        )
        assert r.status_code == 200, r.text
        assert r.json()["helper"]["id_card_back_url"] == new_back

        # verify persisted via GET
        r2 = parent.get(f"{BASE_URL}/api/helpers/{helper_id}")
        assert r2.json()["helper"]["id_card_back_url"] == new_back
        # front unchanged
        assert r2.json()["helper"]["id_card_url"] == "https://example.com/idfront.jpg"

    # ---- Clearing back with empty string clears it ----
    def test_patch_clear_id_card_back_url_with_empty_string(self, parent, helper_id):
        r = parent.patch(
            f"{BASE_URL}/api/helpers/{helper_id}",
            json={"id_card_back_url": ""},
        )
        assert r.status_code == 200, r.text
        assert r.json()["helper"]["id_card_back_url"] in (None, "")
        # verify via GET
        r2 = parent.get(f"{BASE_URL}/api/helpers/{helper_id}")
        assert r2.json()["helper"]["id_card_back_url"] in (None, "")
        # front still there
        assert r2.json()["helper"]["id_card_url"] == "https://example.com/idfront.jpg"

    # ---- Clearing back with null JSON also clears it (nice-to-have) ----
    def test_patch_clear_id_card_back_url_with_null(self, parent, helper_id):
        # first re-set it so we have something to clear
        r0 = parent.patch(
            f"{BASE_URL}/api/helpers/{helper_id}",
            json={"id_card_back_url": "https://example.com/idback_v3.jpg"},
        )
        assert r0.status_code == 200
        assert r0.json()["helper"]["id_card_back_url"] == "https://example.com/idback_v3.jpg"

        # send null
        r = parent.patch(
            f"{BASE_URL}/api/helpers/{helper_id}",
            json={"id_card_back_url": None},
        )
        assert r.status_code == 200, r.text
        cleared = r.json()["helper"].get("id_card_back_url")
        # We assert the desired behaviour (spec says null should clear).
        # If the backend uses "is not None" gating, this will FAIL and we'll flag it.
        assert cleared in (None, ""), (
            f"Sending null should clear id_card_back_url, got={cleared!r}. "
            "Backend PATCH gate may use `is not None`; needs update."
        )

    # ---- Helper endpoints remain parent/admin only ----
    def test_helper_endpoints_are_parent_admin_only(self, parent, helper_id):
        # promote Aarav (child) in storytester's Sharma family to a login user
        r_members = parent.get(f"{BASE_URL}/api/families/members")
        if r_members.status_code != 200:
            pytest.skip("cannot list members")
        aarav = next(
            (m for m in r_members.json()
             if (m.get("name") or "").split()[0].lower() == "aarav"),
            None,
        )
        if not aarav:
            pytest.skip("Aarav (child) not present in family")

        uname = f"aarav_b43_{uuid.uuid4().hex[:4]}"
        rc = parent.post(
            f"{BASE_URL}/api/families/members/{aarav['member_id']}/credentials",
            json={"username": uname, "password": "childpass123", "pin": "1234"},
        )
        if rc.status_code not in (200, 201):
            pytest.skip(f"cannot set child creds ({rc.status_code} {rc.text})")

        child = _new_session()
        rl = child.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": uname, "password": "childpass123"},
        )
        assert rl.status_code == 200, rl.text
        child.headers["Authorization"] = f"Bearer {rl.json()['token']}"

        # try to LIST helpers
        r1 = child.get(f"{BASE_URL}/api/helpers")
        # try to CREATE helper
        r2 = child.post(
            f"{BASE_URL}/api/helpers",
            json={"name": "TEST_child_helper", "role": "house_help"},
        )
        # try to PATCH the existing helper
        r3 = child.patch(
            f"{BASE_URL}/api/helpers/{helper_id}",
            json={"id_card_back_url": "https://x/y.jpg"},
        )
        # try to GET the helper
        r4 = child.get(f"{BASE_URL}/api/helpers/{helper_id}")

        assert r1.status_code == 403, f"LIST helpers by child should 403, got {r1.status_code}"
        assert r2.status_code == 403, f"CREATE by child should 403, got {r2.status_code}"
        assert r3.status_code == 403, f"PATCH by child should 403, got {r3.status_code}"
        assert r4.status_code == 403, f"GET by child should 403, got {r4.status_code}"


# =====================================================================
# B) VAULT MARK-AS-RENEWED
# =====================================================================
class TestVaultRenew:
    @pytest.fixture(scope="class")
    def parent(self):
        s = _new_session()
        _login(s, "protectdemo@fam.com", "secret123")
        return s

    @pytest.fixture(scope="class")
    def near_expiry_item(self, parent):
        """
        Create a fresh vault item owned by admin (protectdemo) with an expiry
        3 days away so it produces a vault_expiry notification.
        """
        title = f"TEST_batch43_renew_{uuid.uuid4().hex[:6]}"
        payload = {
            "kind": "document",
            "title": title,
            "expiry_date": (dt.date.today() + dt.timedelta(days=3)).isoformat(),
            "visibility": "family",
        }
        r = parent.post(f"{BASE_URL}/api/vault/items", json=payload)
        assert r.status_code in (200, 201), r.text
        item = r.json()
        yield item
        parent.delete(f"{BASE_URL}/api/vault/items/{item['item_id']}")

    def test_missing_token_returns_401(self, near_expiry_item):
        # no auth session
        anon = _new_session()
        item_id = near_expiry_item["item_id"]
        r = anon.post(
            f"{BASE_URL}/api/vault/items/{item_id}/renew",
            json={"expiry_date": "2027-01-01"},
        )
        assert r.status_code in (401, 403), r.text

    def test_bad_date_returns_400(self, parent, near_expiry_item):
        item_id = near_expiry_item["item_id"]
        r = parent.post(
            f"{BASE_URL}/api/vault/items/{item_id}/renew",
            json={"expiry_date": "not-a-date"},
        )
        assert r.status_code == 400, r.text

    def test_renew_updates_expiry_date(self, parent, near_expiry_item):
        item_id = near_expiry_item["item_id"]
        new_exp = "2027-01-01"
        r = parent.post(
            f"{BASE_URL}/api/vault/items/{item_id}/renew",
            json={"expiry_date": new_exp},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("expiry_date") == new_exp, body

        # verify via GET
        rg = parent.get(f"{BASE_URL}/api/vault/items/{item_id}")
        assert rg.status_code == 200, rg.text
        assert rg.json().get("expiry_date") == new_exp

    def test_renew_clears_expiry_notification(self, parent, near_expiry_item):
        """After renewing to a far-future date, that item's vault_expiry
        reminder should no longer be in /api/notifications."""
        item_id = near_expiry_item["item_id"]

        # First bring it back to a 3-day expiry to guarantee a reminder exists
        parent.post(
            f"{BASE_URL}/api/vault/items/{item_id}/renew",
            json={"expiry_date": (dt.date.today() + dt.timedelta(days=3)).isoformat()},
        )
        items = parent.get(f"{BASE_URL}/api/notifications").json().get("items") or []
        target_route = f"/vault/item/{item_id}"
        before = [
            i for i in items
            if i.get("type") == "vault_expiry" and i.get("route") == target_route
        ]
        assert before, f"Setup expected vault_expiry for {item_id} to be present. items={items[:3]}"

        # Now renew to far-future — reminder should clear
        r = parent.post(
            f"{BASE_URL}/api/vault/items/{item_id}/renew",
            json={"expiry_date": "2099-12-31"},
        )
        assert r.status_code == 200, r.text

        items2 = parent.get(f"{BASE_URL}/api/notifications").json().get("items") or []
        after = [
            i for i in items2
            if i.get("type") == "vault_expiry" and i.get("route") == target_route
        ]
        assert not after, (
            f"vault_expiry reminder should have cleared after renew, "
            f"but still present: {after}"
        )

    def test_child_member_cannot_renew_gets_403(self, parent, near_expiry_item):
        """A child member (non-parent, non-owner, non-creator) must get 403."""
        # locate Aarav in this family and give him login creds
        r_members = parent.get(f"{BASE_URL}/api/families/members")
        if r_members.status_code != 200:
            pytest.skip("cannot list members")
        aarav = next(
            (m for m in r_members.json()
             if (m.get("name") or "").split()[0].lower() == "aarav"),
            None,
        )
        if not aarav:
            pytest.skip("Aarav (child) not present")

        uname = f"aarav_v_{uuid.uuid4().hex[:4]}"
        rc = parent.post(
            f"{BASE_URL}/api/families/members/{aarav['member_id']}/credentials",
            json={"username": uname, "password": "childpass123", "pin": "1234"},
        )
        if rc.status_code not in (200, 201):
            pytest.skip(f"cannot set child creds ({rc.status_code} {rc.text})")

        child = _new_session()
        rl = child.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": uname, "password": "childpass123"},
        )
        assert rl.status_code == 200, rl.text
        child.headers["Authorization"] = f"Bearer {rl.json()['token']}"

        # Aarav is neither parent nor owner nor creator of this item
        r = child.post(
            f"{BASE_URL}/api/vault/items/{near_expiry_item['item_id']}/renew",
            json={"expiry_date": "2027-01-01"},
        )
        # Could be 403 (permission) OR 404 (item not visible). Spec says 403.
        assert r.status_code == 403, (
            f"child should get 403 renewing vault item they can't edit, got {r.status_code} {r.text}"
        )
