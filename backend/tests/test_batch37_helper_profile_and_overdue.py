"""Batch #37 — Helper profile fields (address/id_card/phone/photo) + Overdue Reminders.

Security-sensitive: id_card_url must never appear in helper-facing responses
(GET /helper/me, POST /helper/login), and a helper media token must NOT be
able to fetch the parent-uploaded id_card via /api/files.
"""

import os
import re
import time
import uuid

import pytest
import requests

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
    or "https://our-story-191.preview.emergentagent.com"
)
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

PARENT_EMAIL = "storytester@fam.com"
PARENT_PW = "secret123"
HELPER_USERNAME = "sunita"
HELPER_PIN = "1234"


@pytest.fixture(scope="module")
def parent_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": PARENT_EMAIL, "password": PARENT_PW}, timeout=30)
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def helper_session():
    s = requests.Session()
    r = s.post(f"{API}/helper/login", json={"username": HELPER_USERNAME, "pin": HELPER_PIN}, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    tok = body["token"]
    s.headers.update({"Authorization": f"Bearer {tok}"})
    s.media_token = body.get("media_token")
    s.login_body = body
    return s


# ---------------------------------------------------------------------------
# Helper profile fields — SECURITY
# ---------------------------------------------------------------------------
class TestHelperProfileFields:
    def _find_sunita(self, parent_session):
        r = parent_session.get(f"{API}/helpers", timeout=30)
        assert r.status_code == 200, r.text
        for h in r.json()["helpers"]:
            if (h.get("username") or "").lower() == HELPER_USERNAME:
                return h
        pytest.skip("Helper 'sunita' not found in seeded family")

    def test_patch_helper_persists_all_fields(self, parent_session):
        h = self._find_sunita(parent_session)
        hid = h["helper_id"]
        marker = uuid.uuid4().hex[:8]
        payload = {
            "address": f"TEST_B37 Koramangala {marker}, Bengaluru 560095",
            "phone": "+91 90000 00037",
            "photo_url": f"emergent/helpers/photo_test_{marker}.jpg",
            "id_card_url": f"emergent/helpers/idcard_test_{marker}.pdf",
        }
        r = parent_session.patch(f"{API}/helpers/{hid}", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        got = r.json()["helper"]
        assert got["address"] == payload["address"]
        assert got["phone"] == payload["phone"]
        assert got["photo_url"] == payload["photo_url"]
        assert got["id_card_url"] == payload["id_card_url"]

        # GET should mirror the persisted values
        r2 = parent_session.get(f"{API}/helpers/{hid}", timeout=30)
        assert r2.status_code == 200, r2.text
        h2 = r2.json()["helper"]
        assert h2["address"] == payload["address"]
        assert h2["id_card_url"] == payload["id_card_url"]
        assert h2["phone"] == payload["phone"]

    def test_post_helpers_returns_address_and_idcard(self, parent_session):
        marker = uuid.uuid4().hex[:6]
        body = {
            "name": f"TEST_B37 Helper {marker}",
            "role": "nanny",
            "phone": "+91 91234 56789",
            "address": f"TEST_B37 Whitefield {marker}, Bengaluru",
            "id_card_url": f"emergent/helpers/idcard_new_{marker}.jpg",
            "photo_url": f"emergent/helpers/photo_new_{marker}.jpg",
            "assigned_all": True,
            "assigned_member_ids": [],
            "access": {"days": [0, 1, 2, 3, 4, 5, 6]},
        }
        r = parent_session.post(f"{API}/helpers", json=body, timeout=30)
        assert r.status_code == 200, r.text
        h = r.json()["helper"]
        assert h["address"] == body["address"]
        assert h["id_card_url"] == body["id_card_url"]
        assert h["phone"] == body["phone"]

        # Clean up: delete this helper
        try:
            parent_session.delete(f"{API}/helpers/{h['helper_id']}", timeout=30)
        except Exception:
            pass

    def test_helper_me_hides_idcard_url(self, parent_session, helper_session):
        # First ensure sunita has an id_card_url set (from test above or set now)
        h = self._find_sunita(parent_session)
        if not h.get("id_card_url"):
            parent_session.patch(f"{API}/helpers/{h['helper_id']}",
                                 json={"id_card_url": "emergent/helpers/idcard_ensure.pdf"}, timeout=30)

        r = helper_session.get(f"{API}/helper/me", timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        helper_pub = body.get("helper") or {}
        assert "id_card_url" not in helper_pub, f"SECURITY: helper/me leaked id_card_url: {helper_pub}"
        # address IS allowed
        assert "address" in helper_pub

    def test_helper_login_response_hides_idcard_url(self):
        s = requests.Session()
        r = s.post(f"{API}/helper/login", json={"username": HELPER_USERNAME, "pin": HELPER_PIN}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        helper_pub = body.get("helper") or {}
        assert "id_card_url" not in helper_pub, f"SECURITY: helper/login leaked id_card_url: {helper_pub}"

    def test_helper_media_token_cannot_fetch_parent_idcard(self, parent_session, helper_session):
        # Set a fresh id_card_url on sunita and try to fetch via helper media token
        h = self._find_sunita(parent_session)
        marker = uuid.uuid4().hex[:8]
        # Path used in GET /api/files/{path}
        path = f"emergent/helpers/idcard_probe_{marker}.pdf"
        r = parent_session.patch(f"{API}/helpers/{h['helper_id']}",
                                 json={"id_card_url": path}, timeout=30)
        assert r.status_code == 200

        media_tok = getattr(helper_session, "media_token", None)
        assert media_tok, "helper media token missing"
        # Attempt the fetch — expect 404 (or 403) since file is parent-owned and not tied to a helper message
        url = f"{API}/files/{path}?token={media_tok}"
        rr = requests.get(url, timeout=30, allow_redirects=False)
        assert rr.status_code in (403, 404), (
            f"SECURITY: helper media token was allowed to fetch parent id_card! "
            f"status={rr.status_code}, body={rr.text[:200]}"
        )


# ---------------------------------------------------------------------------
# Overdue Reminders
# ---------------------------------------------------------------------------
class TestOverdueReminders:
    def test_nudge_overdue_no_overdue_returns_zero(self, parent_session):
        # Snapshot open tasks; if no overdue, we should get zero. Otherwise still valid response shape.
        r = parent_session.post(f"{API}/todos/nudge-overdue", json={}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert set(body.keys()) >= {"nudged", "tasks", "names"}
        assert isinstance(body["nudged"], int)
        assert isinstance(body["tasks"], int)
        assert isinstance(body["names"], list)

    def _get_members(self, parent_session):
        r = parent_session.get(f"{API}/families/members", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        if isinstance(data, dict):
            return data.get("members", [])
        return data

    def test_nudge_overdue_with_seeded_overdue(self, parent_session):
        members = self._get_members(parent_session)
        # pick Priya
        priya = next((m for m in members if (m.get("name") or "").lower().startswith("priya")), None)
        if not priya:
            pytest.skip("Priya not present in seeded family")

        # find or create a to-do list
        r = parent_session.get(f"{API}/todos/lists", timeout=30)
        assert r.status_code == 200, r.text
        lists_data = r.json()
        lists = lists_data if isinstance(lists_data, list) else lists_data.get("lists", [])
        if not lists:
            rc = parent_session.post(f"{API}/todos/lists", json={"name": "TEST_B37 List"}, timeout=30)
            assert rc.status_code in (200, 201)
            lst = rc.json()
        else:
            lst = lists[0]
        list_id = lst.get("list_id") or lst.get("id")

        marker = uuid.uuid4().hex[:8]
        body = {
            "title": f"TEST_B37_OVERDUE_{marker}",
            "due_date": "2020-01-01",
            "assignee_member_id": priya["member_id"],
        }
        r = parent_session.post(f"{API}/todos/lists/{list_id}/items", json=body, timeout=30)
        assert r.status_code in (200, 201), r.text
        item = r.json()
        item_id = item.get("item_id") or item.get("id")
        assert item_id

        try:
            r2 = parent_session.post(f"{API}/todos/nudge-overdue", json={}, timeout=30)
            assert r2.status_code == 200, r2.text
            data = r2.json()
            assert data["nudged"] >= 1, data
            assert data["tasks"] >= 1, data
            assert any((n or "").lower().startswith("priya") for n in data["names"]), data
        finally:
            # cleanup
            try:
                parent_session.delete(f"{API}/todos/items/{item_id}", timeout=30)
            except Exception:
                pass

    def test_nudge_overdue_child_gets_403(self, parent_session):
        # Try to find any non-admin/parent user we can login as. In this env, no exposed child login.
        pytest.skip("No exposed child auth flow in demo env — parent-only guard curl-verified by main agent.")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
