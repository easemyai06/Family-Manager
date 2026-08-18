"""Batch #24 backend tests — Auto-Link Invites (preview/claim), Role Editing, Resend invite (backend surface).

Covers:
- GET /api/families/preview?code=CODE returns family_name + pending_members[]
  (only members with linked_user_id=None). Invalid code -> 404.
- POST /api/families/join with claim_member_id: valid pending id links to joiner
  (count unchanged, member joined+is_me for joiner). claim_member_id=null creates
  a new member (count +1). Claiming already-joined/invalid id -> 400.
- PATCH /api/families/members/{id} with {role}: parent/child/adult -> 200 with
  is_child kept in sync; invalid role -> 400; admin target -> 403.
"""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


def _register(prefix="tester"):
    email = f"{prefix}+{uuid.uuid4().hex[:8]}@fam.com"
    r = requests.post(f"{API}/auth/register",
                      json={"name": prefix.capitalize(), "email": email, "password": "secret123"})
    assert r.status_code == 200, r.text
    return r.json()["token"], email


def _seed(headers):
    r = requests.post(f"{API}/seed/demo", headers=headers)
    assert r.status_code == 200, r.text


@pytest.fixture(scope="module")
def admin_ctx():
    token, email = _register("admin")
    headers = {"Authorization": f"Bearer {token}"}
    _seed(headers)
    inv = requests.get(f"{API}/families/invite", headers=headers).json()
    yield {"token": token, "headers": headers, "email": email,
           "invite_code": inv["invite_code"], "family_name": inv["family_name"]}
    try:
        requests.delete(f"{API}/auth/account", headers=headers, timeout=15)
    except Exception:
        pass


# --- 1. GET /api/families/preview --------------------------------------------
class TestPreview:
    def test_preview_valid_code_returns_pending_only(self, admin_ctx):
        r = requests.get(f"{API}/families/preview",
                         params={"code": admin_ctx["invite_code"]},
                         headers=admin_ctx["headers"])
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["family_name"] == admin_ctx["family_name"]
        pending = data["pending_members"]
        assert isinstance(pending, list)
        # Sharma demo has 4 pending members (Priya, Aarav, Anaya, Meera)
        assert len(pending) == 4, f"expected 4 pending members, got {len(pending)}"
        expected_keys = {"member_id", "name", "relationship", "role", "photo_url", "color", "is_child"}
        for m in pending:
            assert expected_keys.issubset(set(m.keys())), f"missing keys in {m}"
            # only unlinked members
            assert m.get("member_id")
            assert m.get("name")

    def test_preview_invalid_code_404(self, admin_ctx):
        r = requests.get(f"{API}/families/preview",
                         params={"code": "NOPE9999"},
                         headers=admin_ctx["headers"])
        assert r.status_code == 404, r.text

    def test_preview_lowercase_normalized(self, admin_ctx):
        # invite_code is uppercase; server should upper-case the query
        r = requests.get(f"{API}/families/preview",
                         params={"code": admin_ctx["invite_code"].lower()},
                         headers=admin_ctx["headers"])
        assert r.status_code == 200, r.text


# --- 2. POST /api/families/join with claim_member_id -------------------------
class TestJoinClaim:
    def test_claim_pending_no_duplicate(self, admin_ctx):
        # Snapshot pending list + total count
        before = requests.get(f"{API}/families/me", headers=admin_ctx["headers"]).json()
        before_count = len(before["members"])
        pending_before = [m for m in before["members"] if not m.get("joined")]
        assert pending_before, "seed should have pending members"
        target = pending_before[0]  # e.g. Priya

        # Register a fresh joiner with NO family
        token, _ = _register("joiner")
        jh = {"Authorization": f"Bearer {token}"}
        try:
            r = requests.post(f"{API}/families/join", headers=jh,
                              json={"code": admin_ctx["invite_code"],
                                    "claim_member_id": target["member_id"]})
            assert r.status_code == 200, r.text

            # Admin re-reads /families/me — count MUST be unchanged
            after = requests.get(f"{API}/families/me", headers=admin_ctx["headers"]).json()
            assert len(after["members"]) == before_count, \
                f"member count changed: before={before_count} after={len(after['members'])}"

            # Joiner sees themselves — target member now has is_me=true + joined=true
            joiner_me = requests.get(f"{API}/families/me", headers=jh).json()
            me_row = next((m for m in joiner_me["members"] if m["member_id"] == target["member_id"]), None)
            assert me_row is not None, "claimed member disappeared"
            assert me_row.get("is_me") is True, "claimed member should be is_me for the joiner"
            assert me_row.get("joined") is True, "claimed member should be joined=true"
            assert me_row.get("name") == target["name"], "claimed member name should stay as-is"
        finally:
            requests.delete(f"{API}/auth/account", headers=jh, timeout=15)

    def test_claim_already_joined_returns_400(self, admin_ctx):
        # admin's own linked member is already joined; a fresh joiner claiming it -> 400
        me = requests.get(f"{API}/families/me", headers=admin_ctx["headers"]).json()
        admin_member_id = me["viewer_member_id"]

        token, _ = _register("badclaim")
        jh = {"Authorization": f"Bearer {token}"}
        try:
            r = requests.post(f"{API}/families/join", headers=jh,
                              json={"code": admin_ctx["invite_code"],
                                    "claim_member_id": admin_member_id})
            assert r.status_code == 400, r.text
        finally:
            requests.delete(f"{API}/auth/account", headers=jh, timeout=15)

    def test_claim_invalid_id_returns_400(self, admin_ctx):
        token, _ = _register("badid")
        jh = {"Authorization": f"Bearer {token}"}
        try:
            r = requests.post(f"{API}/families/join", headers=jh,
                              json={"code": admin_ctx["invite_code"],
                                    "claim_member_id": "mem_does_not_exist"})
            assert r.status_code == 400, r.text
        finally:
            requests.delete(f"{API}/auth/account", headers=jh, timeout=15)

    def test_join_without_claim_creates_new_member(self, admin_ctx):
        before = requests.get(f"{API}/families/me", headers=admin_ctx["headers"]).json()
        before_count = len(before["members"])

        token, _ = _register("newmem")
        jh = {"Authorization": f"Bearer {token}"}
        try:
            r = requests.post(f"{API}/families/join", headers=jh,
                              json={"code": admin_ctx["invite_code"], "claim_member_id": None})
            assert r.status_code == 200, r.text

            after = requests.get(f"{API}/families/me", headers=admin_ctx["headers"]).json()
            assert len(after["members"]) == before_count + 1, \
                f"count did not increase: before={before_count} after={len(after['members'])}"
        finally:
            requests.delete(f"{API}/auth/account", headers=jh, timeout=15)


# --- 3. PATCH /api/families/members/{id} role edits --------------------------
class TestRoleEdit:
    def _pick_non_admin_joined_or_pending(self, admin_ctx):
        me = requests.get(f"{API}/families/me", headers=admin_ctx["headers"]).json()
        return next(m for m in me["members"]
                    if not m.get("is_me") and m.get("role") != "admin")

    def test_role_child_ok_and_is_child_synced(self, admin_ctx):
        target = self._pick_non_admin_joined_or_pending(admin_ctx)
        r = requests.patch(f"{API}/families/members/{target['member_id']}",
                           headers=admin_ctx["headers"], json={"role": "child"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("role") == "child"
        assert body.get("is_child") is True

    def test_role_adult_ok_and_is_child_cleared(self, admin_ctx):
        target = self._pick_non_admin_joined_or_pending(admin_ctx)
        r = requests.patch(f"{API}/families/members/{target['member_id']}",
                           headers=admin_ctx["headers"], json={"role": "adult"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("role") == "adult"
        assert body.get("is_child") is False

    def test_role_parent_ok(self, admin_ctx):
        target = self._pick_non_admin_joined_or_pending(admin_ctx)
        r = requests.patch(f"{API}/families/members/{target['member_id']}",
                           headers=admin_ctx["headers"], json={"role": "parent"})
        assert r.status_code == 200, r.text
        assert r.json().get("role") == "parent"
        assert r.json().get("is_child") is False

    def test_invalid_role_400(self, admin_ctx):
        target = self._pick_non_admin_joined_or_pending(admin_ctx)
        r = requests.patch(f"{API}/families/members/{target['member_id']}",
                           headers=admin_ctx["headers"], json={"role": "grandparent"})
        assert r.status_code == 400, r.text

    def test_admin_target_role_change_403(self, admin_ctx):
        me = requests.get(f"{API}/families/me", headers=admin_ctx["headers"]).json()
        admin_id = me["viewer_member_id"]
        r = requests.patch(f"{API}/families/members/{admin_id}",
                           headers=admin_ctx["headers"], json={"role": "child"})
        assert r.status_code == 403, r.text

    def test_child_cannot_change_roles_403(self, admin_ctx):
        # join a joiner via invite (they become role=adult), demote to child via admin,
        # then have them try to PATCH another member's role -> 403.
        token, _ = _register("junior")
        jh = {"Authorization": f"Bearer {token}"}
        try:
            j = requests.post(f"{API}/families/join", headers=jh,
                              json={"code": admin_ctx["invite_code"]})
            assert j.status_code == 200, j.text

            # find joiner's member row + a victim
            jme = requests.get(f"{API}/families/me", headers=jh).json()
            junior_member = next(m for m in jme["members"] if m.get("is_me"))
            victim = next(m for m in jme["members"]
                          if not m.get("is_me") and m.get("role") != "admin")

            # admin demotes junior to child
            r = requests.patch(f"{API}/families/members/{junior_member['member_id']}",
                               headers=admin_ctx["headers"], json={"role": "child"})
            assert r.status_code == 200

            # junior (child now) tries to PATCH victim
            r = requests.patch(f"{API}/families/members/{victim['member_id']}",
                               headers=jh, json={"role": "child"})
            assert r.status_code == 403, r.text
        finally:
            requests.delete(f"{API}/auth/account", headers=jh, timeout=15)
