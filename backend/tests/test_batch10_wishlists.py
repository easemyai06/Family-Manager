"""
Batch #10 backend tests: Wish Lists + Gift Planning + Secret Gift Mode.
Uses the pre-seeded wishdemo@fam.com Sharma family (Raj admin/adult).
Also registers a fresh account for owner-of-empty-list flows.
"""
import os
import pytest
import requests
import uuid

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL missing"

WISH_EMAIL = "wishdemo@fam.com"
WISH_PWD = "secret123"


# ------------------------------------------------------------------ fixtures
@pytest.fixture(scope="module")
def raj():
    """Adult admin (Raj) logged into the Sharma demo family."""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": WISH_EMAIL, "password": WISH_PWD})
    assert r.status_code == 200, r.text
    tok = r.json()["token"]
    s.headers["Authorization"] = f"Bearer {tok}"
    # find member ids
    me = s.get(f"{BASE_URL}/api/families/me").json()
    members = {m["name"]: m for m in me["members"]}
    viewer = s.get(f"{BASE_URL}/api/me").json()
    return {"s": s, "members": members, "viewer": viewer}


@pytest.fixture(scope="module")
def fresh_user():
    """A brand-new account that seeds its own Sharma demo (for isolation)."""
    email = f"TEST_wish_{uuid.uuid4().hex[:8]}@fam.com"
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/register", json={"email": email, "password": "secret123", "name": "Test User"})
    assert r.status_code == 200, r.text
    s.headers["Authorization"] = f"Bearer {r.json()['token']}"
    seed = s.post(f"{BASE_URL}/api/seed/demo")
    assert seed.status_code == 200, seed.text
    me = s.get(f"{BASE_URL}/api/families/me").json()
    members = {m["name"]: m for m in me["members"]}
    return {"s": s, "members": members, "email": email}


# ------------------------------------------------------------------ overview
class TestOverview:
    def test_overview_shape_and_counts(self, raj):
        s = raj["s"]
        r = s.get(f"{BASE_URL}/api/wishlists")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "members" in data and "family" in data
        assert data["family"]["count"] == 3, data
        by_name = {m["member"]["name"]: m for m in data["members"]}
        assert by_name["Aarav"]["count"] == 4
        assert by_name["Anaya"]["count"] == 2
        assert by_name["Priya"]["count"] == 1
        # Raj should have is_me=True
        assert by_name["Raj"]["is_me"] is True
        # Grandma Meera should exist in members with is_me=False
        assert by_name["Meera"]["is_me"] is False


# ------------------------------------------------------------------ owner list
class TestOwnerList:
    def test_aarav_list_shows_lego_reserved_by_meera(self, raj):
        s = raj["s"]
        aarav_id = raj["members"]["Aarav"]["member_id"]
        r = s.get(f"{BASE_URL}/api/wishlists/{aarav_id}")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["owner_member"]["name"] == "Aarav"
        assert data["is_family"] is False
        assert data["can_add"] is True  # Raj is admin
        assert len(data["items"]) == 4
        lego = next(i for i in data["items"] if i["name"] == "LEGO Space Explorer Set")
        assert lego["is_reserved"] is True
        assert lego["reserved_by"]["name"] == "Meera"
        assert lego["i_reserved"] is False  # Raj is not the reserver
        assert lego["status"] == "reserved"
        assert lego["can_reserve"] is False  # already reserved

    def test_family_list_items_not_reservable(self, raj):
        s = raj["s"]
        r = s.get(f"{BASE_URL}/api/wishlists/family")
        assert r.status_code == 200
        data = r.json()
        assert data["is_family"] is True
        assert len(data["items"]) == 3
        for it in data["items"]:
            assert it["can_reserve"] is False
            assert it["is_family"] is True

    def test_owner_missing_member_returns_404(self, raj):
        r = raj["s"].get(f"{BASE_URL}/api/wishlists/mem_nope")
        assert r.status_code == 404


# ------------------------------------------------------------------ item CRUD
class TestItemCRUD:
    def test_post_empty_name_returns_400(self, raj):
        s = raj["s"]
        raj_id = raj["members"]["Raj"]["member_id"]
        r = s.post(f"{BASE_URL}/api/wishlists/{raj_id}/items", json={"name": "  "})
        assert r.status_code == 400

    def test_admin_can_add_to_family_list(self, raj):
        s = raj["s"]
        r = s.post(f"{BASE_URL}/api/wishlists/family/items", json={
            "name": "TEST_Family Air Purifier", "price": "₹9,999", "priority": 2, "category": "Gadgets"})
        assert r.status_code == 201, r.text
        item = r.json()
        assert item["is_family"] is True
        assert item["visibility"] == "family"
        assert item["can_reserve"] is False  # family items never reservable
        # cleanup
        s.delete(f"{BASE_URL}/api/wishlists/items/{item['wish_id']}")

    def test_admin_can_add_to_other_members_list(self, raj):
        s = raj["s"]
        aarav_id = raj["members"]["Aarav"]["member_id"]
        r = s.post(f"{BASE_URL}/api/wishlists/{aarav_id}/items", json={"name": "TEST_Skateboard", "priority": 2})
        assert r.status_code == 201, r.text
        wid = r.json()["wish_id"]
        # verify via GET
        g = s.get(f"{BASE_URL}/api/wishlists/items/{wid}")
        assert g.status_code == 200
        assert g.json()["name"] == "TEST_Skateboard"
        s.delete(f"{BASE_URL}/api/wishlists/items/{wid}")

    def test_patch_edit(self, raj):
        s = raj["s"]
        raj_id = raj["members"]["Raj"]["member_id"]
        r = s.post(f"{BASE_URL}/api/wishlists/{raj_id}/items", json={"name": "TEST_MyItem", "priority": 1})
        wid = r.json()["wish_id"]
        p = s.patch(f"{BASE_URL}/api/wishlists/items/{wid}", json={"name": "TEST_MyItem Updated", "priority": 3})
        assert p.status_code == 200
        assert p.json()["name"] == "TEST_MyItem Updated"
        assert p.json()["priority"] == 3
        s.delete(f"{BASE_URL}/api/wishlists/items/{wid}")

    def test_delete_and_verify_404(self, raj):
        s = raj["s"]
        raj_id = raj["members"]["Raj"]["member_id"]
        wid = s.post(f"{BASE_URL}/api/wishlists/{raj_id}/items", json={"name": "TEST_ToDelete"}).json()["wish_id"]
        assert s.delete(f"{BASE_URL}/api/wishlists/items/{wid}").status_code == 200
        assert s.get(f"{BASE_URL}/api/wishlists/items/{wid}").status_code == 404


# --------------------------------------------------------- Secret Gift Mode
class TestSecretGiftMode:
    def test_reserve_flow_end_to_end(self, fresh_user):
        """Isolated: fresh Sharma family, Raj (admin/adult) reserves Aarav's football shoes."""
        s = fresh_user["s"]
        aarav_id = fresh_user["members"]["Aarav"]["member_id"]
        raj_id = fresh_user["members"]["Raj"]["member_id"]
        aarav_list = s.get(f"{BASE_URL}/api/wishlists/{aarav_id}").json()
        shoes = next(i for i in aarav_list["items"] if i["name"] == "New Football Shoes")
        wid = shoes["wish_id"]

        # reserve
        r = s.post(f"{BASE_URL}/api/wishlists/items/{wid}/reserve", json={"reveal": False})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["is_reserved"] is True
        assert j["i_reserved"] is True
        assert j["reserved_by"]["member_id"] == raj_id
        assert j["status"] == "reserved"

        # duplicate reserve by same user is allowed (returns same state)
        # but reserving own wish -> 400 handled separately

        # set status to purchased
        r2 = s.post(f"{BASE_URL}/api/wishlists/items/{wid}/status", json={"status": "purchased"})
        assert r2.status_code == 200
        assert r2.json()["status"] == "purchased"

        # invalid status -> 400
        assert s.post(f"{BASE_URL}/api/wishlists/items/{wid}/status", json={"status": "bogus"}).status_code == 400

        # unreserve
        u = s.post(f"{BASE_URL}/api/wishlists/items/{wid}/unreserve")
        assert u.status_code == 200
        assert u.json()["is_reserved"] is False
        assert u.json()["status"] == "wished"

    def test_reserve_family_item_400(self, raj):
        s = raj["s"]
        fam = s.get(f"{BASE_URL}/api/wishlists/family").json()
        wid = fam["items"][0]["wish_id"]
        r = s.post(f"{BASE_URL}/api/wishlists/items/{wid}/reserve", json={"reveal": False})
        assert r.status_code == 400

    def test_reserve_own_wish_400(self, raj):
        s = raj["s"]
        raj_id = raj["members"]["Raj"]["member_id"]
        wid = s.post(f"{BASE_URL}/api/wishlists/{raj_id}/items", json={"name": "TEST_OwnWish"}).json()["wish_id"]
        r = s.post(f"{BASE_URL}/api/wishlists/items/{wid}/reserve", json={"reveal": False})
        assert r.status_code == 400
        s.delete(f"{BASE_URL}/api/wishlists/items/{wid}")

    def test_reserve_already_reserved_by_other_409(self, raj):
        """LEGO is reserved by Meera in the pre-seeded family, so Raj gets 409."""
        s = raj["s"]
        aarav_id = raj["members"]["Aarav"]["member_id"]
        lego = next(i for i in s.get(f"{BASE_URL}/api/wishlists/{aarav_id}").json()["items"]
                    if i["name"] == "LEGO Space Explorer Set")
        r = s.post(f"{BASE_URL}/api/wishlists/items/{lego['wish_id']}/reserve", json={"reveal": False})
        assert r.status_code == 409, r.text

    def test_unreserve_by_non_reserver_403(self, raj):
        """Raj is not the reserver of the LEGO, so unreserve -> 403."""
        s = raj["s"]
        aarav_id = raj["members"]["Aarav"]["member_id"]
        lego = next(i for i in s.get(f"{BASE_URL}/api/wishlists/{aarav_id}").json()["items"]
                    if i["name"] == "LEGO Space Explorer Set")
        r = s.post(f"{BASE_URL}/api/wishlists/items/{lego['wish_id']}/unreserve")
        assert r.status_code == 403


# ------------------------------------------------------------------ notes
class TestGiftNotes:
    def test_adult_non_owner_can_read_and_add(self, fresh_user):
        s = fresh_user["s"]
        aarav_id = fresh_user["members"]["Aarav"]["member_id"]
        # pick any item on Aarav's list
        item = s.get(f"{BASE_URL}/api/wishlists/{aarav_id}").json()["items"][0]
        wid = item["wish_id"]
        # read -> ok (should include seeded LEGO note if this is the LEGO)
        r = s.get(f"{BASE_URL}/api/wishlists/items/{wid}/notes")
        assert r.status_code == 200
        # add note
        p = s.post(f"{BASE_URL}/api/wishlists/items/{wid}/notes", json={"text": "TEST_note by Raj"})
        assert p.status_code == 201, p.text
        assert p.json()["text"] == "TEST_note by Raj"
        # empty note -> 400
        e = s.post(f"{BASE_URL}/api/wishlists/items/{wid}/notes", json={"text": "   "})
        assert e.status_code == 400

    def test_notes_forbidden_on_family_item(self, raj):
        s = raj["s"]
        fam_wid = s.get(f"{BASE_URL}/api/wishlists/family").json()["items"][0]["wish_id"]
        assert s.get(f"{BASE_URL}/api/wishlists/items/{fam_wid}/notes").status_code == 403
        assert s.post(f"{BASE_URL}/api/wishlists/items/{fam_wid}/notes",
                      json={"text": "no"}).status_code == 403
