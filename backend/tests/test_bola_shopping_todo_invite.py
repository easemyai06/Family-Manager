"""BOLA / invite-preview / CORS regression tests for the Jan-2026 security batch.

Verifies:
  1. Shopping BOLA - Family B cannot toggle or delete Family A's item.
     Same-family (Family A) toggle/delete succeeds.
  2. Todo BOLA - same pattern for /api/todos.
  3. Invite/preview - GET /families/invite works, /families/preview returns
     pending members with children photo_url null, and rate-limit kicks in at 429.
  4. Join still works with claim_member_id after preview.
  5. Auth sanity - valid login 200, wrong password 401.
"""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://our-story-191.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

FAMILY_A_EMAIL = "testdad@fam.com"
FAMILY_A_PASSWORD = "secret123"


def _auth_header(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def family_a_token():
    r = requests.post(f"{API}/auth/login", json={"email": FAMILY_A_EMAIL, "password": FAMILY_A_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login testdad failed: {r.status_code} {r.text}"
    tok = r.json().get("token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def family_b():
    """Register a fresh user, seed the demo family for them, return (token, email)."""
    email = f"TEST_secuser_{uuid.uuid4().hex[:8]}@fam.com"
    password = "secret123"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": password, "name": "TEST SecUser"}, timeout=30)
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
    tok = r.json().get("token")
    assert tok
    # seed demo family for this user
    r2 = requests.post(f"{API}/seed/demo", headers=_auth_header(tok), timeout=60)
    assert r2.status_code in (200, 201), f"seed/demo failed: {r2.status_code} {r2.text}"
    me = requests.get(f"{API}/auth/me", headers=_auth_header(tok), timeout=30)
    assert me.status_code == 200 and me.json().get("user", {}).get("family_id"), \
        f"family B has no family_id after seed: {me.text}"
    yield tok, email
    try:
        requests.delete(f"{API}/auth/account", headers=_auth_header(tok), timeout=30)
    except Exception:
        pass


# ---------- 1. Shopping BOLA ----------
class TestShoppingBOLA:
    def test_shopping_same_family_and_cross_family(self, family_a_token, family_b):
        b_tok, _ = family_b

        # A creates a shopping list
        list_name = f"TEST_shop_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/shopping/lists", json={"name": list_name},
                          headers=_auth_header(family_a_token), timeout=30)
        assert r.status_code in (200, 201), f"create list: {r.status_code} {r.text}"
        list_id = r.json().get("list_id")
        assert list_id

        # A adds an item
        item_name = f"TEST_item_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/shopping/lists/{list_id}/items",
                          json={"name": item_name, "quantity": "1", "category": "Grocery"},
                          headers=_auth_header(family_a_token), timeout=30)
        assert r.status_code in (200, 201), f"add item: {r.status_code} {r.text}"
        item_id = r.json().get("item_id")
        assert item_id

        # A GETs the items and sees theirs
        r = requests.get(f"{API}/shopping/lists/{list_id}/items",
                         headers=_auth_header(family_a_token), timeout=30)
        assert r.status_code == 200
        items = r.json()
        assert any(i.get("item_id") == item_id for i in items), f"A cannot see own item: {items}"
        my_item = next(i for i in items if i["item_id"] == item_id)
        assert my_item.get("checked") is False

        # --- CROSS-FAMILY (B) attempts ---
        # B toggle -> 404
        r_b_tog = requests.post(f"{API}/shopping/items/{item_id}/toggle",
                                headers=_auth_header(b_tok), timeout=30)
        assert r_b_tog.status_code == 404, f"B toggle should 404, got {r_b_tog.status_code}: {r_b_tog.text}"

        # B delete -> idempotent 200 but item MUST still exist for A
        r_b_del = requests.delete(f"{API}/shopping/items/{item_id}",
                                  headers=_auth_header(b_tok), timeout=30)
        # accept 200/204/404 - business rule is that item still exists
        assert r_b_del.status_code in (200, 204, 404), f"B delete unexpected: {r_b_del.status_code}"

        # A can still see & toggle the item
        r = requests.get(f"{API}/shopping/lists/{list_id}/items",
                         headers=_auth_header(family_a_token), timeout=30)
        assert r.status_code == 200
        assert any(i.get("item_id") == item_id for i in r.json()), \
            "SECURITY: A's item disappeared after B's cross-family delete"

        r_a_tog = requests.post(f"{API}/shopping/items/{item_id}/toggle",
                                headers=_auth_header(family_a_token), timeout=30)
        assert r_a_tog.status_code == 200, f"A toggle: {r_a_tog.status_code} {r_a_tog.text}"
        assert r_a_tog.json().get("checked") is True

        # A deletes item (own)
        r = requests.delete(f"{API}/shopping/items/{item_id}",
                            headers=_auth_header(family_a_token), timeout=30)
        assert r.status_code in (200, 204), f"A delete: {r.status_code} {r.text}"

        # cleanup: A deletes the list
        requests.delete(f"{API}/shopping/lists/{list_id}",
                        headers=_auth_header(family_a_token), timeout=30)


# ---------- 2. Todo BOLA ----------
class TestTodoBOLA:
    def test_todo_same_family_and_cross_family(self, family_a_token, family_b):
        b_tok, _ = family_b

        # A creates a todo list
        r = requests.post(f"{API}/todos/lists", json={"name": f"TEST_td_{uuid.uuid4().hex[:6]}"},
                          headers=_auth_header(family_a_token), timeout=30)
        assert r.status_code in (200, 201), f"create todo list: {r.status_code} {r.text}"
        list_id = r.json().get("list_id")
        assert list_id

        # A adds a todo item
        r = requests.post(f"{API}/todos/lists/{list_id}/items",
                          json={"title": f"TEST_todo_{uuid.uuid4().hex[:6]}", "priority": "normal"},
                          headers=_auth_header(family_a_token), timeout=30)
        assert r.status_code in (200, 201), f"add todo item: {r.status_code} {r.text}"
        item_id = r.json().get("item_id")
        assert item_id

        # A GET
        r = requests.get(f"{API}/todos/lists/{list_id}/items",
                         headers=_auth_header(family_a_token), timeout=30)
        assert r.status_code == 200
        assert any(i.get("item_id") == item_id for i in r.json())

        # --- CROSS-FAMILY (B) attempts ---
        r_b_tog = requests.post(f"{API}/todos/items/{item_id}/toggle",
                                headers=_auth_header(b_tok), timeout=30)
        assert r_b_tog.status_code == 404, f"B todo toggle should 404, got {r_b_tog.status_code}"

        r_b_del = requests.delete(f"{API}/todos/items/{item_id}",
                                  headers=_auth_header(b_tok), timeout=30)
        assert r_b_del.status_code in (200, 204, 404)

        # Item must survive; A can toggle
        r = requests.get(f"{API}/todos/lists/{list_id}/items",
                         headers=_auth_header(family_a_token), timeout=30)
        assert any(i.get("item_id") == item_id for i in r.json()), \
            "SECURITY: A's todo item disappeared after B's cross-family delete"

        r_a_tog = requests.post(f"{API}/todos/items/{item_id}/toggle",
                                headers=_auth_header(family_a_token), timeout=30)
        assert r_a_tog.status_code == 200
        assert r_a_tog.json().get("done") is True

        # cleanup
        requests.delete(f"{API}/todos/items/{item_id}",
                        headers=_auth_header(family_a_token), timeout=30)
        requests.delete(f"{API}/todos/lists/{list_id}",
                        headers=_auth_header(family_a_token), timeout=30)


# ---------- 3. Invite & Preview ----------
class TestInvitePreview:
    def test_get_invite_code(self, family_a_token):
        r = requests.get(f"{API}/families/invite", headers=_auth_header(family_a_token), timeout=30)
        assert r.status_code == 200, f"invite: {r.status_code} {r.text}"
        data = r.json()
        assert data.get("invite_code")
        assert data.get("family_name")

    def test_preview_and_rate_limit(self, family_a_token, family_b):
        # Family A gets its own code
        r = requests.get(f"{API}/families/invite", headers=_auth_header(family_a_token), timeout=30)
        code = r.json()["invite_code"]

        # Register a THIRD fresh user (no family) so their preview counter is clean.
        email = f"TEST_preview_{uuid.uuid4().hex[:8]}@fam.com"
        r = requests.post(f"{API}/auth/register",
                          json={"email": email, "password": "secret123", "name": "TEST Preview"}, timeout=30)
        assert r.status_code in (200, 201)
        tok = r.json()["token"]

        try:
            # First preview
            r = requests.get(f"{API}/families/preview", params={"code": code},
                             headers=_auth_header(tok), timeout=30)
            assert r.status_code == 200, f"preview: {r.status_code} {r.text}"
            body = r.json()
            assert body.get("family_name")
            members = body.get("pending_members", [])
            assert isinstance(members, list) and len(members) >= 1, f"no pending members: {body}"
            # every is_child=true entry must have photo_url null
            for m in members:
                if m.get("is_child") is True:
                    assert m.get("photo_url") is None, f"child photo leaked: {m}"

            # Rapid-fire ~22 more calls -> expect 429 at some point before 22
            saw_429 = False
            for _ in range(22):
                rr = requests.get(f"{API}/families/preview", params={"code": code},
                                  headers=_auth_header(tok), timeout=30)
                if rr.status_code == 429:
                    saw_429 = True
                    break
                assert rr.status_code == 200, f"unexpected status during burst: {rr.status_code} {rr.text}"
            assert saw_429, "expected 429 after >20 preview calls in 10 min"
        finally:
            try:
                requests.delete(f"{API}/auth/account", headers=_auth_header(tok), timeout=30)
            except Exception:
                pass


# ---------- 4. Join with claim_member_id ----------
class TestJoinWithClaim:
    def test_join_claims_pending_member(self, family_a_token):
        # Get A's invite code and pending profiles
        r = requests.get(f"{API}/families/invite", headers=_auth_header(family_a_token), timeout=30)
        assert r.status_code == 200
        code = r.json()["invite_code"]

        # Baseline: A's family member count
        r_me = requests.get(f"{API}/families/me", headers=_auth_header(family_a_token), timeout=30)
        assert r_me.status_code == 200
        baseline_count = len(r_me.json().get("members", []))

        # Fresh joiner registers
        email = f"TEST_joiner_{uuid.uuid4().hex[:8]}@fam.com"
        r = requests.post(f"{API}/auth/register",
                          json={"email": email, "password": "secret123", "name": "TEST Joiner"}, timeout=30)
        assert r.status_code in (200, 201)
        joiner_tok = r.json()["token"]

        try:
            # Preview to grab a pending member
            r = requests.get(f"{API}/families/preview", params={"code": code},
                             headers=_auth_header(joiner_tok), timeout=30)
            assert r.status_code == 200
            pending = r.json().get("pending_members", [])
            if not pending:
                pytest.skip("no pending members available to claim in Sharma demo (already claimed)")
            claim_id = pending[0]["member_id"]

            # Join
            r = requests.post(f"{API}/families/join",
                              json={"code": code, "claim_member_id": claim_id},
                              headers=_auth_header(joiner_tok), timeout=30)
            assert r.status_code in (200, 201), f"join: {r.status_code} {r.text}"

            # Post-join: same count (claim, not new insert)
            r_me2 = requests.get(f"{API}/families/me", headers=_auth_header(family_a_token), timeout=30)
            assert r_me2.status_code == 200
            new_members = r_me2.json().get("members", [])
            assert len(new_members) == baseline_count, \
                f"member count changed after claim (expected {baseline_count}, got {len(new_members)})"

            # Claimed member should now be joined for the joiner
            claimed = next((m for m in new_members if m.get("member_id") == claim_id), None)
            assert claimed is not None, "claimed member missing from family"
            # linked_user_id is not exposed in /families/me; verify via joiner's /auth/me
            j_me = requests.get(f"{API}/auth/me", headers=_auth_header(joiner_tok), timeout=30)
            assert j_me.status_code == 200
            assert j_me.json().get("user", {}).get("family_id"), "joiner has no family_id after join"
        finally:
            try:
                requests.delete(f"{API}/auth/account", headers=_auth_header(joiner_tok), timeout=30)
            except Exception:
                pass


# ---------- 5. Auth sanity ----------
class TestAuthSanity:
    def test_valid_login_200(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": FAMILY_A_EMAIL, "password": FAMILY_A_PASSWORD}, timeout=30)
        assert r.status_code == 200
        assert r.json().get("token")

    def test_wrong_password_401(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": FAMILY_A_EMAIL, "password": "wrong_password_xyz"}, timeout=30)
        assert r.status_code == 401
