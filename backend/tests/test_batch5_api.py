"""FamilyHome — batch #5 backend tests.

Covers:
- Memory reactions/notes (POST /timeline/{id}/react toggle, comment list+add,
  GET /timeline/{id} love_count/comment_count/my_love)
- Birthday wishes (GET+POST /birthdays/{member_id}/wishes, 404/400 branches)
- Group photo (PATCH /chats/{id} {photo_url} on custom group, invalid on
  family/direct chats)

Uses a fresh TEST_ account + /api/seed/demo. Cleans up self-created objects.
"""
import os
import uuid
import pytest
import requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def demo(s):
    email = f"TEST_batch5_{uuid.uuid4().hex[:8]}@fam.com"
    reg = s.post(
        f"{BASE}/auth/register",
        json={"name": "TEST Batch5", "email": email, "password": "secret123"},
    ).json()
    token = reg["token"]
    r = s.post(f"{BASE}/seed/demo", headers=_auth(token))
    assert r.status_code == 200, r.text
    fam = s.get(f"{BASE}/families/me", headers=_auth(token)).json()
    members = {m["name"]: m for m in fam["members"]}
    me = s.get(f"{BASE}/auth/me", headers=_auth(token)).json()
    tl = s.get(f"{BASE}/timeline", headers=_auth(token)).json()
    chats = s.get(f"{BASE}/chats", headers=_auth(token)).json()
    return {
        "token": token,
        "members": members,
        "me_member": me["member"],
        "timeline": tl,
        "chats": chats,
    }


# ---------------------------------------------------------------------------
# Memory reactions & notes
# ---------------------------------------------------------------------------
class TestMemoryReactions:
    def test_react_toggles_love(self, s, demo):
        h = _auth(demo["token"])
        tid = demo["timeline"][0]["timeline_id"]
        # First react → adds love
        r = s.post(f"{BASE}/timeline/{tid}/react", headers=h)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["love_count"] >= 1
        assert j["my_love"] is True

        # Second react → removes love
        r = s.post(f"{BASE}/timeline/{tid}/react", headers=h)
        assert r.status_code == 200
        j = r.json()
        assert j["my_love"] is False

    def test_get_memory_returns_counters(self, s, demo):
        h = _auth(demo["token"])
        tid = demo["timeline"][0]["timeline_id"]
        # ensure my_love=true by reacting once (idempotent state)
        r = s.post(f"{BASE}/timeline/{tid}/react", headers=h)
        assert r.status_code == 200

        r = s.get(f"{BASE}/timeline/{tid}", headers=h)
        assert r.status_code == 200
        j = r.json()
        assert "love_count" in j
        assert "comment_count" in j
        assert "my_love" in j
        assert j["my_love"] is True
        assert j["love_count"] >= 1

        # cleanup: toggle off
        s.post(f"{BASE}/timeline/{tid}/react", headers=h)

    def test_comments_list_and_add(self, s, demo):
        h = _auth(demo["token"])
        tid = demo["timeline"][1]["timeline_id"]
        # initial list
        r = s.get(f"{BASE}/timeline/{tid}/comments", headers=h)
        assert r.status_code == 200
        initial = r.json()
        assert isinstance(initial, list)

        # add a note
        r = s.post(
            f"{BASE}/timeline/{tid}/comments",
            json={"text": "TEST_batch5_note lovely photo!"},
            headers=h,
        )
        assert r.status_code == 200, r.text
        note = r.json()
        assert note["text"] == "TEST_batch5_note lovely photo!"
        assert note["author"]["member_id"] == demo["me_member"]["member_id"]
        assert "comment_id" in note

        # list must include the new note
        r = s.get(f"{BASE}/timeline/{tid}/comments", headers=h)
        assert r.status_code == 200
        lst = r.json()
        assert any(c.get("comment_id") == note["comment_id"] for c in lst)

        # comment_count should reflect in memory GET
        r = s.get(f"{BASE}/timeline/{tid}", headers=h)
        assert r.status_code == 200
        assert r.json()["comment_count"] >= len(initial) + 1


# ---------------------------------------------------------------------------
# Birthday wishes
# ---------------------------------------------------------------------------
class TestBirthdayWishes:
    def test_list_wishes_returns_shape(self, s, demo):
        h = _auth(demo["token"])
        mid = demo["members"]["Aarav"]["member_id"]
        r = s.get(f"{BASE}/birthdays/{mid}/wishes", headers=h)
        assert r.status_code == 200
        j = r.json()
        assert "member" in j and j["member"]["member_id"] == mid
        assert "year" in j and isinstance(j["year"], int)
        assert "wishes" in j and isinstance(j["wishes"], list)

    def test_add_wish_persists(self, s, demo):
        h = _auth(demo["token"])
        mid = demo["members"]["Aarav"]["member_id"]
        payload = {"message": "TEST_batch5 happy birthday!", "emoji": "🎉"}
        r = s.post(f"{BASE}/birthdays/{mid}/wishes", json=payload, headers=h)
        assert r.status_code == 200, r.text
        w = r.json()
        assert w["message"] == payload["message"]
        assert w["emoji"] == "🎉"
        assert w["from"]["member_id"] == demo["me_member"]["member_id"]
        wish_id = w["wish_id"]

        # list must now include this wish for current year
        r = s.get(f"{BASE}/birthdays/{mid}/wishes", headers=h)
        j = r.json()
        assert any(x.get("wish_id") == wish_id for x in j["wishes"])
        # the enriched 'from' member is populated
        wish_from_list = next(x for x in j["wishes"] if x["wish_id"] == wish_id)
        assert wish_from_list.get("from", {}).get("member_id") == demo["me_member"]["member_id"]

    def test_invalid_member_404(self, s, demo):
        h = _auth(demo["token"])
        r = s.get(f"{BASE}/birthdays/mem_doesnotexist/wishes", headers=h)
        assert r.status_code == 404
        r = s.post(
            f"{BASE}/birthdays/mem_doesnotexist/wishes",
            json={"message": "hi", "emoji": "🎉"},
            headers=h,
        )
        assert r.status_code == 404

    def test_empty_message_400(self, s, demo):
        h = _auth(demo["token"])
        mid = demo["members"]["Aarav"]["member_id"]
        r = s.post(
            f"{BASE}/birthdays/{mid}/wishes",
            json={"message": "   ", "emoji": "🎉"},
            headers=h,
        )
        assert r.status_code == 400


# ---------------------------------------------------------------------------
# Group photo (PATCH /chats/{id})
# ---------------------------------------------------------------------------
class TestGroupPhoto:
    @pytest.fixture(scope="class")
    def custom_group(self, s, demo):
        h = _auth(demo["token"])
        # Create a custom group with self + 2 members
        member_ids = [
            demo["members"]["Priya"]["member_id"],
            demo["members"]["Aarav"]["member_id"],
        ]
        r = s.post(
            f"{BASE}/chats",
            json={"type": "group", "name": "TEST_batch5_photo_group", "member_ids": member_ids},
            headers=h,
        )
        assert r.status_code == 200, r.text
        return r.json()["chat_id"]

    def test_patch_custom_group_photo(self, s, demo, custom_group):
        h = _auth(demo["token"])
        photo = "/api/files/uploads/testphoto.jpg?token=x"
        r = s.patch(
            f"{BASE}/chats/{custom_group}", json={"photo_url": photo}, headers=h
        )
        assert r.status_code == 200, r.text
        j = r.json()
        # Response is hydrated chat - avatar should reflect photo_url
        assert j.get("avatar") == photo

        # GET must return same avatar
        r = s.get(f"{BASE}/chats/{custom_group}", headers=h)
        assert r.status_code == 200
        assert r.json()["avatar"] == photo

    def test_patch_family_chat_photo_400(self, s, demo):
        h = _auth(demo["token"])
        family_chat = next(c for c in demo["chats"] if c["type"] == "family")
        r = s.patch(
            f"{BASE}/chats/{family_chat['chat_id']}",
            json={"photo_url": "/api/files/x.jpg"},
            headers=h,
        )
        assert r.status_code == 400

    def test_patch_direct_chat_photo_400(self, s, demo):
        h = _auth(demo["token"])
        # Create a direct chat if not present
        priya = demo["members"]["Priya"]["member_id"]
        r = s.post(
            f"{BASE}/chats",
            json={"type": "direct", "member_ids": [priya]},
            headers=h,
        )
        assert r.status_code == 200
        cid = r.json()["chat_id"]
        r = s.patch(
            f"{BASE}/chats/{cid}",
            json={"photo_url": "/api/files/x.jpg"},
            headers=h,
        )
        assert r.status_code == 400
