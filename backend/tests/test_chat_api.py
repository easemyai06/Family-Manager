"""FamilyHome CHAT (P0) backend tests.

Covers: chats list (auto family chat), create direct/group + dedupe, get messages,
send text/image/affection/reply, read receipts, typing indicator, unread counts,
affection-in-chat -> Love timeline link, /home unread_messages, seed demo chats.
"""
import os
import time
import uuid
import pytest
import requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def s():
    return requests.Session()


# Register a fresh user + seed the demo family so we get pre-seeded chats
@pytest.fixture(scope="session")
def demo(s):
    email = f"TEST_chat_{uuid.uuid4().hex[:8]}@fam.com"
    reg = s.post(f"{BASE}/auth/register",
                 json={"name": "TEST Chat User", "email": email, "password": "secret123"}).json()
    token = reg["token"]
    r = s.post(f"{BASE}/seed/demo", headers=_auth(token))
    assert r.status_code == 200, r.text
    # collect members
    fam = s.get(f"{BASE}/families/me", headers=_auth(token)).json()
    members = {m["name"]: m for m in fam["members"]}
    me = s.get(f"{BASE}/auth/me", headers=_auth(token)).json()
    return {"token": token, "members": members, "me_member": me["member"]}


# ---------- list / auto family chat ----------
class TestChatList:
    def test_list_auto_creates_family_and_hydrates(self, s, demo):
        r = s.get(f"{BASE}/chats", headers=_auth(demo["token"]))
        assert r.status_code == 200, r.text
        chats = r.json()
        assert isinstance(chats, list) and len(chats) >= 1

        # Family chat should exist
        fam_chats = [c for c in chats if c["type"] == "family"]
        assert len(fam_chats) == 1, f"expected exactly 1 family chat, got {len(fam_chats)}"
        fc = fam_chats[0]
        assert fc["display_name"]
        assert isinstance(fc.get("members"), list) and len(fc["members"]) == 5
        # seed adds 4 messages -> last_message should be populated
        assert fc.get("last_message"), "family chat should have last_message from seed"
        assert "unread" in fc

        # Seed direct chat Priya<->Raj (current user is Raj) with 3 messages
        directs = [c for c in chats if c["type"] == "direct"]
        assert any(c.get("last_message") for c in directs), \
            "expected the seeded Priya<->Raj direct chat with messages"

    def test_home_returns_unread_messages(self, s):
        # use a fresh demo user to avoid contamination from other tests marking chats read
        email = f"TEST_chat_home_{uuid.uuid4().hex[:8]}@fam.com"
        reg = s.post(f"{BASE}/auth/register",
                     json={"name": "TEST H", "email": email, "password": "secret123"}).json()
        h = _auth(reg["token"])
        assert s.post(f"{BASE}/seed/demo", headers=h).status_code == 200
        r = s.get(f"{BASE}/home", headers=h)
        assert r.status_code == 200
        j = r.json()
        assert "unread_messages" in j
        assert isinstance(j["unread_messages"], int)
        # seed sets unread from other members (Priya direct chat + family chat)
        assert j["unread_messages"] >= 1, f"expected seeded unread_messages >= 1, got {j['unread_messages']}"


# ---------- create direct / group / dedupe ----------
class TestCreateChat:
    def test_create_direct_dedupes(self, s, demo):
        h = _auth(demo["token"])
        aarav = demo["members"]["Aarav"]["member_id"]
        r1 = s.post(f"{BASE}/chats", json={"type": "direct", "member_ids": [aarav]}, headers=h)
        assert r1.status_code == 200, r1.text
        cid1 = r1.json()["chat_id"]
        assert r1.json()["type"] == "direct"
        # second call must dedupe to the same chat
        r2 = s.post(f"{BASE}/chats", json={"type": "direct", "member_ids": [aarav]}, headers=h)
        assert r2.status_code == 200
        assert r2.json()["chat_id"] == cid1, "direct chat should be deduped"

    def test_create_group_with_multi_members(self, s, demo):
        h = _auth(demo["token"])
        ids = [demo["members"]["Aarav"]["member_id"], demo["members"]["Anaya"]["member_id"]]
        r = s.post(f"{BASE}/chats",
                   json={"type": "group", "member_ids": ids, "name": "TEST_kids"}, headers=h)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["type"] == "group"
        assert j.get("display_name") == "TEST_kids" or j.get("name") == "TEST_kids"
        # includes creator (Raj) + Aarav + Anaya
        member_ids = [m["member_id"] for m in j["members"]]
        assert demo["me_member"]["member_id"] in member_ids
        for mid in ids:
            assert mid in member_ids


# ---------- messages send / get ----------
class TestMessages:
    def test_send_text_and_get(self, s, demo):
        h = _auth(demo["token"])
        # use the family chat (already exists after list)
        chats = s.get(f"{BASE}/chats", headers=h).json()
        fam_chat_id = next(c["chat_id"] for c in chats if c["type"] == "family")

        r = s.post(f"{BASE}/chats/{fam_chat_id}/messages",
                   json={"text": "TEST_hello"}, headers=h)
        assert r.status_code == 200, r.text
        msg = r.json()
        assert msg["text"] == "TEST_hello"
        assert msg["type"] == "text"
        assert msg["sender"]["name"] == "Raj"
        mid = msg["message_id"]

        # GET messages returns messages, reads, typing
        r2 = s.get(f"{BASE}/chats/{fam_chat_id}/messages", headers=h)
        assert r2.status_code == 200
        j = r2.json()
        assert "messages" in j and "reads" in j and "typing" in j
        assert any(m["message_id"] == mid for m in j["messages"])
        # reads should include self (sender is implicitly read)
        assert demo["me_member"]["member_id"] in j["reads"]

    def test_send_reply(self, s, demo):
        h = _auth(demo["token"])
        chats = s.get(f"{BASE}/chats", headers=h).json()
        fam_chat_id = next(c["chat_id"] for c in chats if c["type"] == "family")
        # get a target message
        msgs = s.get(f"{BASE}/chats/{fam_chat_id}/messages", headers=h).json()["messages"]
        target = msgs[0]
        r = s.post(f"{BASE}/chats/{fam_chat_id}/messages",
                   json={"text": "TEST_reply", "reply_to": target["message_id"]}, headers=h)
        assert r.status_code == 200
        j = r.json()
        assert j["reply_to"] == target["message_id"]
        assert j["reply_preview"] is not None
        assert "name" in j["reply_preview"]

    def test_send_affection_creates_love_record(self, s, demo):
        h = _auth(demo["token"])
        # create/use direct chat with Priya
        priya = demo["members"]["Priya"]["member_id"]
        r0 = s.post(f"{BASE}/chats",
                    json={"type": "direct", "member_ids": [priya]}, headers=h)
        cid = r0.json()["chat_id"]

        r = s.post(f"{BASE}/chats/{cid}/messages",
                   json={"type": "affection", "affection_key": "hug", "text": "TEST_chat_hug"},
                   headers=h)
        assert r.status_code == 200, r.text
        assert r.json()["type"] == "affection"
        assert r.json()["affection_key"] == "hug"

        # verify appears in the Love timeline (aggregated week counts)
        tl = s.get(f"{BASE}/affection/timeline", headers=h).json()
        assert "week" in tl and isinstance(tl["week"], list)
        # look for a hug from me to Priya
        found = any(
            row.get("from", {}).get("member_id") == demo["me_member"]["member_id"]
            and row.get("to", {}).get("member_id") == priya
            and row.get("type") == "hug"
            for row in tl["week"]
        )
        assert found, "affection sent from chat should appear in Love timeline"

        # also verify recipient's inbox has an unseen entry (chat -> affection link)
        inbox = s.get(f"{BASE}/affection/inbox", headers=h).json()
        # (current user is the sender so their own inbox won't have this)
        assert "unseen" in inbox and "recent" in inbox

    def test_non_member_gets_404(self, s, demo):
        h = _auth(demo["token"])
        # register a stranger with no family; try to fetch a chat
        stranger_email = f"TEST_stranger_{uuid.uuid4().hex[:6]}@fam.com"
        sreg = s.post(f"{BASE}/auth/register",
                      json={"name": "S", "email": stranger_email, "password": "secret123"}).json()
        chats = s.get(f"{BASE}/chats", headers=h).json()
        cid = chats[0]["chat_id"]
        r = s.get(f"{BASE}/chats/{cid}/messages", headers=_auth(sreg["token"]))
        # stranger has no family -> require_family raises 400; still not 200
        assert r.status_code in (400, 404), r.status_code


# ---------- read receipts / typing / unread ----------
class TestReadTypingUnread:
    def test_mark_read_updates_reads_map(self, s, demo):
        h = _auth(demo["token"])
        chats = s.get(f"{BASE}/chats", headers=h).json()
        cid = next(c["chat_id"] for c in chats if c["type"] == "family")
        r = s.post(f"{BASE}/chats/{cid}/read", headers=h)
        assert r.status_code == 200
        # reads map contains our member with iso timestamp
        j = s.get(f"{BASE}/chats/{cid}/messages", headers=h).json()
        assert demo["me_member"]["member_id"] in j["reads"]

    def test_typing_marker(self, s, demo):
        h = _auth(demo["token"])
        chats = s.get(f"{BASE}/chats", headers=h).json()
        cid = next(c["chat_id"] for c in chats if c["type"] == "family")
        r = s.post(f"{BASE}/chats/{cid}/typing", headers=h)
        assert r.status_code == 200
        # self should NOT appear in typing list (spec says excluding self)
        j = s.get(f"{BASE}/chats/{cid}/messages", headers=h).json()
        typing_ids = [m["member_id"] for m in j.get("typing", [])]
        assert demo["me_member"]["member_id"] not in typing_ids

    def test_unread_count_flow(self, s, demo):
        # Second user (Priya link) sends a message; primary user's unread should increase
        # We simulate by creating a second registered user linked to the same family? Not easy.
        # Instead: mark read, count seed unread, then verify decreases.
        h = _auth(demo["token"])
        chats = s.get(f"{BASE}/chats", headers=h).json()
        direct = next((c for c in chats if c["type"] == "direct" and c.get("last_message")), None)
        if direct is None:
            pytest.skip("no seeded direct chat with messages found")
        before = direct.get("unread", 0)
        assert before >= 0
        # mark read and re-fetch
        s.post(f"{BASE}/chats/{direct['chat_id']}/read", headers=h)
        chats2 = s.get(f"{BASE}/chats", headers=h).json()
        after = next(c["unread"] for c in chats2 if c["chat_id"] == direct["chat_id"])
        assert after == 0, f"unread should be 0 after mark-read (was {before}, now {after})"

    def test_home_unread_updates_after_read(self, s, demo):
        h = _auth(demo["token"])
        # mark every chat as read
        chats = s.get(f"{BASE}/chats", headers=h).json()
        for c in chats:
            s.post(f"{BASE}/chats/{c['chat_id']}/read", headers=h)
        home = s.get(f"{BASE}/home", headers=h).json()
        assert home["unread_messages"] == 0


# ---------- chats list order ----------
class TestSortAndUpdateLastMessage:
    def test_send_message_updates_last_message_and_sort(self, s, demo):
        h = _auth(demo["token"])
        chats = s.get(f"{BASE}/chats", headers=h).json()
        # pick a non-family chat if any, else family
        cid = chats[-1]["chat_id"]
        r = s.post(f"{BASE}/chats/{cid}/messages",
                   json={"text": "TEST_bumps_sort"}, headers=h)
        assert r.status_code == 200
        time.sleep(0.5)
        chats2 = s.get(f"{BASE}/chats", headers=h).json()
        # our chat should now be first (most recent)
        assert chats2[0]["chat_id"] == cid
        assert chats2[0]["last_message"]["text"] == "TEST_bumps_sort"
