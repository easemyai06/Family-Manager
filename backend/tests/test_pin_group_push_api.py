"""FamilyHome batch #4 backend tests.

Covers:
- Pin/Unpin message on a chat (single pin per conversation; newest replaces older)
- Group management (PATCH /api/chats/{chat_id}) rename, add/remove members
  - Only custom groups editable (family chat + direct -> 400)
  - Caller cannot be removed, >=2 members enforced
- Push registration + test-reminder (placeholder key -> 500/push_ok=false EXPECTED)
"""
import os
import uuid
import pytest
import requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"


def _auth(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="session")
def s():
    return requests.Session()


@pytest.fixture(scope="session")
def demo(s):
    email = f"TEST_batch4_{uuid.uuid4().hex[:8]}@fam.com"
    reg = s.post(
        f"{BASE}/auth/register",
        json={"name": "TEST Batch4", "email": email, "password": "secret123"},
    ).json()
    token = reg["token"]
    assert s.post(f"{BASE}/seed/demo", headers=_auth(token)).status_code == 200
    fam = s.get(f"{BASE}/families/me", headers=_auth(token)).json()
    members = {m["name"]: m for m in fam["members"]}
    me = s.get(f"{BASE}/auth/me", headers=_auth(token)).json()
    return {
        "token": token,
        "user_id": me["user"]["user_id"],
        "me_member": me["member"],
        "members": members,
        "email": email,
    }


# ---------- pin / unpin ----------
class TestPinMessage:
    def test_pin_and_get_returns_pinned_message_with_sender(self, s, demo):
        h = _auth(demo["token"])
        chats = s.get(f"{BASE}/chats", headers=h).json()
        fam_id = next(c["chat_id"] for c in chats if c["type"] == "family")

        m1 = s.post(f"{BASE}/chats/{fam_id}/messages",
                    json={"text": "TEST_pin_msg_1"}, headers=h).json()
        r = s.post(f"{BASE}/chats/{fam_id}/pin",
                   json={"message_id": m1["message_id"]}, headers=h)
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True

        got = s.get(f"{BASE}/chats/{fam_id}", headers=h).json()
        assert got.get("pinned_message"), "GET /chats/{id} should return pinned_message"
        pm = got["pinned_message"]
        assert pm["message_id"] == m1["message_id"]
        assert pm["text"] == "TEST_pin_msg_1"
        assert pm.get("sender") and pm["sender"].get("name") == "Raj"

    def test_second_pin_replaces_first(self, s, demo):
        h = _auth(demo["token"])
        chats = s.get(f"{BASE}/chats", headers=h).json()
        fam_id = next(c["chat_id"] for c in chats if c["type"] == "family")

        m2 = s.post(f"{BASE}/chats/{fam_id}/messages",
                    json={"text": "TEST_pin_msg_2"}, headers=h).json()
        r = s.post(f"{BASE}/chats/{fam_id}/pin",
                   json={"message_id": m2["message_id"]}, headers=h)
        assert r.status_code == 200
        got = s.get(f"{BASE}/chats/{fam_id}", headers=h).json()
        assert got["pinned_message"]["message_id"] == m2["message_id"]
        assert got["pinned_message"]["text"] == "TEST_pin_msg_2"

    def test_unpin_clears_pinned_message(self, s, demo):
        h = _auth(demo["token"])
        chats = s.get(f"{BASE}/chats", headers=h).json()
        fam_id = next(c["chat_id"] for c in chats if c["type"] == "family")
        r = s.post(f"{BASE}/chats/{fam_id}/unpin", headers=h)
        assert r.status_code == 200
        got = s.get(f"{BASE}/chats/{fam_id}", headers=h).json()
        assert got["pinned_message"] is None

    def test_pin_unknown_message_returns_404(self, s, demo):
        h = _auth(demo["token"])
        chats = s.get(f"{BASE}/chats", headers=h).json()
        fam_id = next(c["chat_id"] for c in chats if c["type"] == "family")
        r = s.post(f"{BASE}/chats/{fam_id}/pin",
                   json={"message_id": "does_not_exist"}, headers=h)
        assert r.status_code == 404


# ---------- group management ----------
class TestGroupManagement:
    def test_patch_family_chat_rejected(self, s, demo):
        h = _auth(demo["token"])
        chats = s.get(f"{BASE}/chats", headers=h).json()
        fam_id = next(c["chat_id"] for c in chats if c["type"] == "family")
        r = s.patch(f"{BASE}/chats/{fam_id}", json={"name": "TEST_nope"}, headers=h)
        assert r.status_code == 400
        assert "custom groups" in r.json().get("detail", "").lower()

    def test_patch_direct_chat_rejected(self, s, demo):
        h = _auth(demo["token"])
        priya = demo["members"]["Priya"]["member_id"]
        cr = s.post(f"{BASE}/chats",
                    json={"type": "direct", "member_ids": [priya]}, headers=h).json()
        r = s.patch(f"{BASE}/chats/{cr['chat_id']}",
                    json={"name": "TEST_direct_edit"}, headers=h)
        assert r.status_code == 400
        assert "custom groups" in r.json().get("detail", "").lower()

    def test_rename_and_add_remove_members_on_custom_group(self, s, demo):
        h = _auth(demo["token"])
        aarav = demo["members"]["Aarav"]["member_id"]
        anaya = demo["members"]["Anaya"]["member_id"]
        meera = demo["members"]["Meera"]["member_id"]
        # start with Raj + Aarav + Anaya
        g = s.post(f"{BASE}/chats",
                   json={"type": "group", "name": "TEST_grp_orig",
                         "member_ids": [aarav, anaya]}, headers=h).json()
        cid = g["chat_id"]
        assert len(g["members"]) == 3

        r = s.patch(f"{BASE}/chats/{cid}", json={
            "name": "TEST_grp_renamed",
            "add_member_ids": [meera],
            "remove_member_ids": [anaya],
        }, headers=h)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("name") == "TEST_grp_renamed"
        assert j.get("display_name") == "TEST_grp_renamed"
        member_ids = [m["member_id"] for m in j["members"]]
        assert meera in member_ids
        assert anaya not in member_ids
        # caller kept
        assert demo["me_member"]["member_id"] in member_ids

    def test_caller_cannot_be_removed(self, s, demo):
        h = _auth(demo["token"])
        aarav = demo["members"]["Aarav"]["member_id"]
        anaya = demo["members"]["Anaya"]["member_id"]
        g = s.post(f"{BASE}/chats",
                   json={"type": "group", "name": "TEST_grp_keep_me",
                         "member_ids": [aarav, anaya]}, headers=h).json()
        r = s.patch(f"{BASE}/chats/{g['chat_id']}",
                    json={"remove_member_ids": [demo["me_member"]["member_id"]]},
                    headers=h)
        # Server silently keeps the caller
        assert r.status_code == 200, r.text
        ids = [m["member_id"] for m in r.json()["members"]]
        assert demo["me_member"]["member_id"] in ids

    def test_min_two_members_enforced(self, s, demo):
        h = _auth(demo["token"])
        aarav = demo["members"]["Aarav"]["member_id"]
        anaya = demo["members"]["Anaya"]["member_id"]
        g = s.post(f"{BASE}/chats",
                   json={"type": "group", "name": "TEST_grp_min",
                         "member_ids": [aarav, anaya]}, headers=h).json()
        # removing both other members would leave only me -> 400
        r = s.patch(f"{BASE}/chats/{g['chat_id']}",
                    json={"remove_member_ids": [aarav, anaya]}, headers=h)
        assert r.status_code == 400
        assert "2" in r.json().get("detail", "")


# ---------- push (placeholder key -> EXPECTED failures) ----------
class TestPushRegistration:
    def test_register_push_placeholder_returns_500(self, s, demo):
        """With placeholder EMERGENT_PUSH_KEY, register-push MUST return 500.
        This is the documented expected behaviour in preview environments."""
        r = s.post(f"{BASE}/register-push",
                   json={"user_id": demo["user_id"], "platform": "android",
                         "device_token": "TEST_token_abc"},
                   headers=_auth(demo["token"]))
        assert r.status_code == 500, f"expected 500 in preview, got {r.status_code}: {r.text}"

    def test_test_reminder_returns_recipients_and_push_ok_false(self, s, demo):
        """/push/test-reminder should return {recipients, push_ok}; push_ok=false
        expected in preview because push provider auth fails with placeholder key."""
        r = s.post(f"{BASE}/push/test-reminder", headers=_auth(demo["token"]))
        assert r.status_code == 200, r.text
        j = r.json()
        # seed places an On This Day memory today -> recipients should exist
        assert "recipients" in j
        assert isinstance(j["recipients"], int)
        assert j["recipients"] >= 1
        assert "push_ok" in j
        assert j["push_ok"] is False, "in preview push must fail with placeholder key"
