"""FamilyHome — batch tests for Timeline (Our Family Story),
On This Day, Message Reactions, and Voice Audio Upload.

Uses a freshly-registered TEST_ account and /api/seed/demo, which now seeds
8 timeline memories including an On This Day event dated today's MM-DD
(server sets otd_date = date(2019, today.month, today.day)).
"""
import io
import os
import uuid
import pytest
import requests
from datetime import date

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def s():
    return requests.Session()


@pytest.fixture(scope="session")
def demo(s):
    email = f"TEST_story_{uuid.uuid4().hex[:8]}@fam.com"
    reg = s.post(f"{BASE}/auth/register",
                 json={"name": "TEST Story User", "email": email, "password": "secret123"}).json()
    token = reg["token"]
    r = s.post(f"{BASE}/seed/demo", headers=_auth(token))
    assert r.status_code == 200, r.text
    fam = s.get(f"{BASE}/families/me", headers=_auth(token)).json()
    members = {m["name"]: m for m in fam["members"]}
    me = s.get(f"{BASE}/auth/me", headers=_auth(token)).json()
    return {"token": token, "members": members, "me_member": me["member"], "email": email}


# ---------------------------------------------------------------------------
# Timeline (Our Family Story)
# ---------------------------------------------------------------------------
class TestTimeline:
    def test_list_returns_seeded_memories(self, s, demo):
        r = s.get(f"{BASE}/timeline", headers=_auth(demo["token"]))
        assert r.status_code == 200, r.text
        items = r.json()
        assert isinstance(items, list)
        # seed inserts 8 memories
        assert len(items) >= 8, f"expected >=8 seeded memories, got {len(items)}"
        # hydrated with people_members
        m = items[0]
        for k in ("timeline_id", "family_id", "title", "date", "category", "people", "people_members"):
            assert k in m, f"missing {k} on memory"
        # sorted by date desc
        dates = [x["date"] for x in items]
        assert dates == sorted(dates, reverse=True), "timeline must be sorted date desc"

    def test_list_filter_by_member(self, s, demo):
        aarav = demo["members"]["Aarav"]["member_id"]
        r = s.get(f"{BASE}/timeline", headers=_auth(demo["token"]),
                  params={"member_id": aarav})
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 1
        for m in items:
            assert aarav in m["people"], f"filter returned memory without Aarav: {m['title']}"

    def test_create_get_delete_memory(self, s, demo):
        h = _auth(demo["token"])
        raj = demo["me_member"]["member_id"]
        payload = {
            "title": "TEST_family_beach_day",
            "date": "2024-05-01",
            "category": "🌊 Vacations",
            "location": "Goa",
            "description": "Sand castles!",
            "people": [raj],
            "media": [],
            "importance": False,
        }
        r = s.post(f"{BASE}/timeline", json=payload, headers=h)
        assert r.status_code == 200, r.text
        created = r.json()
        tid = created["timeline_id"]
        assert created["title"] == payload["title"]
        assert created["date"] == payload["date"]
        assert created["created_by"] == raj
        assert any(m.get("member_id") == raj for m in created["people_members"])

        # GET single
        r = s.get(f"{BASE}/timeline/{tid}", headers=h)
        assert r.status_code == 200
        assert r.json()["timeline_id"] == tid

        # persisted in list
        lst = s.get(f"{BASE}/timeline", headers=h).json()
        assert any(x["timeline_id"] == tid for x in lst)

        # DELETE
        d = s.delete(f"{BASE}/timeline/{tid}", headers=h)
        assert d.status_code == 200 and d.json().get("ok") is True

        r = s.get(f"{BASE}/timeline/{tid}", headers=h)
        assert r.status_code == 404

    def test_get_not_found(self, s, demo):
        r = s.get(f"{BASE}/timeline/tl_doesnotexist", headers=_auth(demo["token"]))
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# On This Day
# ---------------------------------------------------------------------------
class TestOnThisDay:
    def test_on_this_day_shape(self, s, demo):
        r = s.get(f"{BASE}/timeline/on-this-day", headers=_auth(demo["token"]))
        assert r.status_code == 200, r.text
        j = r.json()
        assert "events" in j and "birthdays" in j
        assert isinstance(j["events"], list) and isinstance(j["birthdays"], list)
        # seed schedules an event dated 2019-<MM>-<DD>
        assert len(j["events"]) >= 1, "expected at least the seeded Kerala trip on-this-day event"
        ev = j["events"][0]
        # each event carries years_ago
        assert "years_ago" in ev and isinstance(ev["years_ago"], int)
        assert ev["years_ago"] == date.today().year - int(ev["date"][:4])
        # today's MM-DD must match
        today = date.today()
        assert ev["date"].endswith(f"-{today.month:02d}-{today.day:02d}")

    def test_home_includes_on_this_day(self, s, demo):
        r = s.get(f"{BASE}/home", headers=_auth(demo["token"]))
        assert r.status_code == 200
        j = r.json()
        assert "on_this_day" in j, "/home should return on_this_day"
        assert isinstance(j["on_this_day"], list)
        assert len(j["on_this_day"]) >= 1
        assert "years_ago" in j["on_this_day"][0]
        assert "title" in j["on_this_day"][0]


# ---------------------------------------------------------------------------
# Message Reactions
# ---------------------------------------------------------------------------
class TestMessageReactions:
    def _get_family_msg(self, s, token):
        chats = s.get(f"{BASE}/chats", headers=_auth(token)).json()
        cid = next(c["chat_id"] for c in chats if c["type"] == "family")
        msgs = s.get(f"{BASE}/chats/{cid}/messages", headers=_auth(token)).json()["messages"]
        return cid, msgs[0]["message_id"]

    def test_add_reaction_and_summary(self, s, demo):
        h = _auth(demo["token"])
        cid, mid = self._get_family_msg(s, demo["token"])

        r = s.post(f"{BASE}/messages/{mid}/react", json={"emoji": "❤️"}, headers=h)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

        j = s.get(f"{BASE}/chats/{cid}/messages", headers=h).json()
        target = next(m for m in j["messages"] if m["message_id"] == mid)
        assert target["reactions"].get("❤️") == 1, target["reactions"]
        assert target["my_reaction"] == "❤️"

    def test_toggle_same_emoji_removes(self, s, demo):
        h = _auth(demo["token"])
        cid, mid = self._get_family_msg(s, demo["token"])
        # ensure state: add
        s.post(f"{BASE}/messages/{mid}/react", json={"emoji": "👍"}, headers=h)
        j = s.get(f"{BASE}/chats/{cid}/messages", headers=h).json()
        target = next(m for m in j["messages"] if m["message_id"] == mid)
        assert target["my_reaction"] == "👍"
        # send same again -> should remove
        s.post(f"{BASE}/messages/{mid}/react", json={"emoji": "👍"}, headers=h)
        j = s.get(f"{BASE}/chats/{cid}/messages", headers=h).json()
        target = next(m for m in j["messages"] if m["message_id"] == mid)
        assert target["my_reaction"] is None
        assert target["reactions"].get("👍", 0) == 0

    def test_switch_reaction_replaces(self, s, demo):
        h = _auth(demo["token"])
        cid, mid = self._get_family_msg(s, demo["token"])
        s.post(f"{BASE}/messages/{mid}/react", json={"emoji": "😂"}, headers=h)
        s.post(f"{BASE}/messages/{mid}/react", json={"emoji": "🎉"}, headers=h)
        j = s.get(f"{BASE}/chats/{cid}/messages", headers=h).json()
        target = next(m for m in j["messages"] if m["message_id"] == mid)
        assert target["my_reaction"] == "🎉"
        assert target["reactions"].get("😂", 0) == 0
        assert target["reactions"].get("🎉") == 1

    def test_react_unknown_message_returns_404(self, s, demo):
        r = s.post(f"{BASE}/messages/msg_nope/react", json={"emoji": "❤️"},
                   headers=_auth(demo["token"]))
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# Voice / audio upload + send voice message
# ---------------------------------------------------------------------------
class TestVoice:
    def test_upload_audio_and_send_voice_message(self, s, demo):
        h = _auth(demo["token"])
        # tiny fake m4a payload
        fake_audio = b"\x00\x00\x00\x18ftypM4A \x00\x00\x00\x00" + b"\x00" * 128
        files = {"file": ("clip.m4a", io.BytesIO(fake_audio), "audio/m4a")}
        data = {"kind": "audio"}
        r = s.post(f"{BASE}/upload", files=files, data=data, headers=h)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("type") == "audio"
        assert j.get("url", "").startswith("/api/files/")
        assert j.get("path")

        # send a voice message referencing this audio
        chats = s.get(f"{BASE}/chats", headers=h).json()
        fam_chat = next(c["chat_id"] for c in chats if c["type"] == "family")
        body = {
            "type": "voice",
            "media": [{"url": j["url"], "type": "audio"}],
            "duration": 3200,
        }
        r = s.post(f"{BASE}/chats/{fam_chat}/messages", json=body, headers=h)
        assert r.status_code == 200, r.text
        msg = r.json()
        assert msg["type"] == "voice"
        assert msg["duration"] == 3200
        assert msg["media"] and msg["media"][0]["url"] == j["url"]

        # chat last_message preview reflects voice
        chats2 = s.get(f"{BASE}/chats", headers=h).json()
        target = next(c for c in chats2 if c["chat_id"] == fam_chat)
        assert target["last_message"]["type"] == "voice"
        assert "Voice" in target["last_message"]["text"]
