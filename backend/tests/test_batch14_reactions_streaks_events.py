"""Batch #14 — Noticeboard reactions/replies, chore streaks, notice expiry reminders,
event email + .ics calendar invite.

Covers:
  * Noticeboard reactions: toggle same emoji removes, different emoji replaces (one/member).
  * Noticeboard replies: appended, reply_count increments, GET hydrates member card.
  * Chore streaks on GET /api/home: kids[].streak (int), streak_badge (nullable dict).
  * Notice expiry reminder: notice with expiry_date=tomorrow surfaces in home.needs_attention.
  * Event email + .ics: POST /api/events with participant_ids returns 200/created even
    though email delivery is intentionally blocked in demo; GET /api/events/{id}/invite.ics
    returns text/calendar with BEGIN:VCALENDAR + VEVENT + SUMMARY + DTSTART.
"""
import os
import uuid
from datetime import date, timedelta

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

BOARD_EMAIL = "board@fam.com"
PASSWORD = "secret123"


def _login(email, password):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    tok = r.json()["token"]
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def raj():
    return _login(BOARD_EMAIL, PASSWORD)


@pytest.fixture(scope="module")
def raj_me(raj):
    r = raj.get(f"{API}/auth/me", timeout=20)
    assert r.status_code == 200
    j = r.json()
    return {"user": j.get("user", j), "member": j.get("member")}


# ---------------------------------------------------------------------------
# Noticeboard: reactions + replies
# ---------------------------------------------------------------------------
class TestNoticeReactions:
    @pytest.fixture
    def notice_id(self, raj):
        r = raj.post(f"{API}/notices", json={"title": "TEST_ reactions target"}, timeout=20)
        assert r.status_code == 201, r.text
        nid = r.json()["notice_id"]
        yield nid
        raj.delete(f"{API}/notices/{nid}", timeout=20)

    def test_react_adds_reaction_summary(self, raj, notice_id):
        r = raj.post(f"{API}/notices/{notice_id}/react", json={"emoji": "❤️"}, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "reaction_summary" in body
        heart = next((x for x in body["reaction_summary"] if x["emoji"] == "❤️"), None)
        assert heart is not None, f"reaction_summary missing ❤️: {body['reaction_summary']}"
        assert heart["count"] == 1
        assert heart["mine"] is True

    def test_react_toggle_same_emoji_removes(self, raj, notice_id):
        # First react
        raj.post(f"{API}/notices/{notice_id}/react", json={"emoji": "❤️"}, timeout=20)
        # Second react with same emoji -> should remove
        r = raj.post(f"{API}/notices/{notice_id}/react", json={"emoji": "❤️"}, timeout=20)
        assert r.status_code == 200
        body = r.json()
        heart = next((x for x in body["reaction_summary"] if x["emoji"] == "❤️"), None)
        assert heart is None, f"❤️ should have been removed but still present: {body['reaction_summary']}"

    def test_react_different_emoji_replaces(self, raj, notice_id):
        # Start with ❤️
        raj.post(f"{API}/notices/{notice_id}/react", json={"emoji": "❤️"}, timeout=20)
        # React with 👍 -> should replace ❤️ (only one per member)
        r = raj.post(f"{API}/notices/{notice_id}/react", json={"emoji": "👍"}, timeout=20)
        assert r.status_code == 200
        body = r.json()
        emojis = {x["emoji"]: x for x in body["reaction_summary"]}
        assert "👍" in emojis, f"missing 👍: {emojis}"
        assert emojis["👍"]["mine"] is True
        assert emojis["👍"]["count"] == 1
        # ❤️ should be gone
        assert "❤️" not in emojis, f"❤️ still present after replacement: {emojis}"


class TestNoticeReplies:
    @pytest.fixture
    def notice_id(self, raj):
        r = raj.post(f"{API}/notices", json={"title": "TEST_ replies target"}, timeout=20)
        assert r.status_code == 201
        nid = r.json()["notice_id"]
        yield nid
        raj.delete(f"{API}/notices/{nid}", timeout=20)

    def test_add_reply_appends(self, raj, notice_id):
        r = raj.post(f"{API}/notices/{notice_id}/replies", json={"text": "TEST_ first reply"}, timeout=20)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body.get("reply_count", 0) >= 1
        # GET verifies
        g = raj.get(f"{API}/notices/{notice_id}", timeout=20)
        assert g.status_code == 200
        gb = g.json()
        assert gb["reply_count"] == 1
        assert len(gb["replies"]) == 1
        rp = gb["replies"][0]
        assert rp["text"] == "TEST_ first reply"
        assert rp.get("member") is not None, "reply must have hydrated member card"
        assert rp["member"].get("member_id"), "member card must have member_id"

    def test_reply_count_increments(self, raj, notice_id):
        raj.post(f"{API}/notices/{notice_id}/replies", json={"text": "one"}, timeout=20)
        raj.post(f"{API}/notices/{notice_id}/replies", json={"text": "two"}, timeout=20)
        raj.post(f"{API}/notices/{notice_id}/replies", json={"text": "three"}, timeout=20)
        g = raj.get(f"{API}/notices/{notice_id}", timeout=20).json()
        assert g["reply_count"] == 3
        texts = [r["text"] for r in g["replies"]]
        assert texts == ["one", "two", "three"], f"replies must preserve order, got {texts}"

    def test_empty_reply_rejected(self, raj, notice_id):
        r = raj.post(f"{API}/notices/{notice_id}/replies", json={"text": "   "}, timeout=20)
        assert r.status_code == 400


# ---------------------------------------------------------------------------
# Chore streaks
# ---------------------------------------------------------------------------
class TestChoreStreaks:
    def test_home_kids_include_streak_fields(self, raj):
        r = raj.get(f"{API}/home", timeout=30)
        assert r.status_code == 200
        home = r.json()
        assert "kids" in home
        assert len(home["kids"]) >= 1, "demo family should have kids"
        for k in home["kids"]:
            assert "streak" in k, f"kid missing streak: {k}"
            assert isinstance(k["streak"], int), f"streak must be int, got {type(k['streak'])}"
            assert k["streak"] >= 0
            assert "streak_badge" in k, f"kid missing streak_badge: {k}"
            if k["streak"] >= 3:
                assert isinstance(k["streak_badge"], dict), \
                    f"streak_badge must be dict when streak>=3, got {k['streak_badge']}"
            else:
                assert k["streak_badge"] is None, \
                    f"streak_badge must be null when streak<3, got {k['streak_badge']}"


# ---------------------------------------------------------------------------
# Notice expiry reminder in needs_attention
# ---------------------------------------------------------------------------
class TestNoticeExpiryReminder:
    def test_tomorrow_expiry_shows_in_needs_attention(self, raj):
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        title = f"TEST_ expiring {uuid.uuid4().hex[:6]}"
        create = raj.post(f"{API}/notices",
                          json={"title": title, "expiry_date": tomorrow}, timeout=20)
        assert create.status_code == 201, create.text
        nid = create.json()["notice_id"]
        try:
            home = raj.get(f"{API}/home", timeout=30).json()
            assert "needs_attention" in home
            keys = [n.get("key") for n in home["needs_attention"]]
            match = next((n for n in home["needs_attention"] if n.get("key") == "notice_expiring"), None)
            assert match is not None, f"needs_attention missing 'notice_expiring'. keys={keys}"
            assert match.get("route") == "/notice", f"route should be /notice, got {match.get('route')}"
        finally:
            raj.delete(f"{API}/notices/{nid}", timeout=20)


# ---------------------------------------------------------------------------
# Event email + .ics calendar invite
# ---------------------------------------------------------------------------
class TestEventInvite:
    @pytest.fixture
    def members(self, raj):
        r = raj.get(f"{API}/families/members", timeout=20)
        assert r.status_code == 200
        data = r.json()
        members = data.get("members", data) if isinstance(data, dict) else data
        assert isinstance(members, list) and len(members) >= 2
        return members

    def test_create_event_with_participants_returns_ok(self, raj, members, raj_me):
        my_mid = (raj_me["member"] or {}).get("member_id")
        others = [m["member_id"] for m in members if m["member_id"] != my_mid][:2]
        assert others, "need at least one other family member"
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        payload = {
            "title": "TEST_ Movie Night",
            "date": tomorrow,
            "start_time": "19:00",
            "end_time": "21:00",
            "location": "Living room",
            "notes": "Bring popcorn",
            "owner_member_id": my_mid,
            "participant_ids": others,
            "all_day": False,
        }
        r = raj.post(f"{API}/events", json=payload, timeout=30)
        # MUST return 2xx even though outbound email to fake demo addresses is blocked.
        assert r.status_code in (200, 201), \
            f"event creation must succeed regardless of email: {r.status_code} {r.text}"
        e = r.json()
        assert e.get("event_id"), f"event must have event_id: {e}"
        assert e["title"] == "TEST_ Movie Night"
        # cleanup
        raj.delete(f"{API}/events/{e['event_id']}", timeout=20)

    def test_invite_ics_endpoint(self, raj, members, raj_me):
        my_mid = (raj_me["member"] or {}).get("member_id")
        others = [m["member_id"] for m in members if m["member_id"] != my_mid][:1]
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        create = raj.post(f"{API}/events", json={
            "title": "TEST_ ICS Event",
            "date": tomorrow,
            "start_time": "10:30",
            "end_time": "11:30",
            "location": "Park",
            "owner_member_id": my_mid,
            "participant_ids": others,
            "all_day": False,
        }, timeout=30)
        assert create.status_code in (200, 201)
        eid = create.json()["event_id"]
        try:
            # invite.ics is intentionally PUBLIC (no auth header)
            ics_r = requests.get(f"{API}/events/{eid}/invite.ics", timeout=20)
            assert ics_r.status_code == 200, f"ics fetch failed: {ics_r.status_code} {ics_r.text[:200]}"
            ctype = ics_r.headers.get("content-type", "")
            assert "text/calendar" in ctype.lower(), f"wrong content-type: {ctype}"
            body = ics_r.text
            assert body.startswith("BEGIN:VCALENDAR"), f"ics must start with BEGIN:VCALENDAR: {body[:80]}"
            assert "BEGIN:VEVENT" in body
            assert "SUMMARY:TEST_ ICS Event" in body, f"missing SUMMARY: {body}"
            assert "DTSTART" in body, "missing DTSTART"
            assert "END:VEVENT" in body
            assert "END:VCALENDAR" in body
        finally:
            raj.delete(f"{API}/events/{eid}", timeout=20)

    def test_invite_ics_all_day_event(self, raj, raj_me):
        """All-day events use DTSTART;VALUE=DATE format."""
        my_mid = (raj_me["member"] or {}).get("member_id")
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        create = raj.post(f"{API}/events", json={
            "title": "TEST_ All Day",
            "date": tomorrow,
            "owner_member_id": my_mid,
            "participant_ids": [],
            "all_day": True,
        }, timeout=30)
        assert create.status_code in (200, 201), create.text
        eid = create.json()["event_id"]
        try:
            ics_r = requests.get(f"{API}/events/{eid}/invite.ics", timeout=20)
            assert ics_r.status_code == 200
            assert "DTSTART;VALUE=DATE:" in ics_r.text, \
                f"all-day must have DTSTART;VALUE=DATE: {ics_r.text}"
        finally:
            raj.delete(f"{API}/events/{eid}", timeout=20)

    def test_invite_ics_missing_event_404(self):
        r = requests.get(f"{API}/events/evt_nonexistent_id/invite.ics", timeout=20)
        assert r.status_code == 404
