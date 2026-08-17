"""Batch #16 — Recurring Events + Notice Seen-by + Trusted Emergency Delegates.

Covered surface:
  * Recurring events:
      - POST /api/events repeat=weekly + repeat_count=4 -> 4 events sharing series_id
      - POST /api/events repeat=monthly + repeat_count=3 with Jan 31 -> Jan31/Feb28/Mar31
      - POST /api/events repeat=weekly + repeat_end_date bounds by date
      - DELETE any occurrence removes the whole series
      - PATCH updates non-date fields across the whole series but keeps dates
      - GET /api/events/{id}/invite.ics contains RRULE FREQ=WEEKLY|MONTHLY + COUNT/UNTIL
      - Non-recurring (repeat omitted) creates one event, no series_id
  * Notice seen-by:
      - POST /notices/{id}/seen adds caller, idempotent (seen_count=1 twice)
      - GET /notices/{id} returns seen_count + seen(bool) + seen_members[]
      - GET /notices list + GET /home notices include seen_count
  * Emergency delegates:
      - POST /emergency/delegates {member_id} grants (201) for an adult
      - POST for child member -> 400
      - POST unknown member -> 404
      - GET lists with member card
      - DELETE revokes
"""
import os
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
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
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


@pytest.fixture(scope="module")
def family_members(raj):
    r = raj.get(f"{API}/families/members", timeout=20)
    assert r.status_code == 200
    raw = r.json()
    return raw.get("members", raw) if isinstance(raw, dict) else raw


# ---------------------------------------------------------------------------
# Recurring Events
# ---------------------------------------------------------------------------
class TestRecurringEvents:

    def _create(self, raj, payload):
        r = raj.post(f"{API}/events", json=payload, timeout=30)
        assert r.status_code in (200, 201), r.text
        return r.json()

    def _cleanup(self, raj, event_id):
        raj.delete(f"{API}/events/{event_id}", timeout=20)

    def test_weekly_repeat_count_creates_4_events_with_series_id(self, raj, raj_me):
        my_mid = (raj_me["member"] or {}).get("member_id")
        start = date.today() + timedelta(days=1)
        end = start + timedelta(days=7 * 5)
        created = self._create(raj, {
            "title": "TEST_ weekly4",
            "date": start.isoformat(),
            "start_time": "09:00",
            "end_time": "10:00",
            "owner_member_id": my_mid,
            "repeat": "weekly",
            "repeat_count": 4,
            "all_day": False,
        })
        series_id = created.get("series_id")
        assert series_id, f"created event should carry series_id: {created}"

        # Query the range that should contain all 4 occurrences
        r = raj.get(f"{API}/events?start={start.isoformat()}&end={end.isoformat()}", timeout=20)
        assert r.status_code == 200
        events = [e for e in r.json() if e.get("series_id") == series_id]
        assert len(events) == 4, f"weekly repeat_count=4 must create 4 events, got {len(events)}"

        expected_dates = [(start + timedelta(days=7 * i)).isoformat() for i in range(4)]
        actual_dates = sorted(e["date"][:10] for e in events)
        assert actual_dates == expected_dates, f"weekly dates mismatch expected={expected_dates} got={actual_dates}"

        # Cleanup: delete any occurrence -> deletes the whole series
        self._cleanup(raj, events[0]["event_id"])

    def test_monthly_repeat_short_month_clamps(self, raj, raj_me):
        """Jan 31 -> Feb 28 (non-leap) -> Mar 31."""
        my_mid = (raj_me["member"] or {}).get("member_id")
        # 2027 is not a leap year -> Feb has 28 days.
        start = date(2027, 1, 31)
        created = self._create(raj, {
            "title": "TEST_ monthly3",
            "date": start.isoformat(),
            "start_time": "09:00",
            "end_time": "10:00",
            "owner_member_id": my_mid,
            "repeat": "monthly",
            "repeat_count": 3,
            "all_day": False,
        })
        series_id = created.get("series_id")
        assert series_id

        r = raj.get(f"{API}/events?start=2027-01-01&end=2027-06-30", timeout=20)
        assert r.status_code == 200
        events = sorted([e for e in r.json() if e.get("series_id") == series_id],
                        key=lambda e: e["date"])
        assert len(events) == 3, f"monthly count=3 must yield 3 events: {[e['date'] for e in events]}"
        got = [e["date"][:10] for e in events]
        assert got == ["2027-01-31", "2027-02-28", "2027-03-31"], f"short-month clamp wrong: {got}"

        self._cleanup(raj, events[0]["event_id"])

    def test_repeat_end_date_bounds_series(self, raj, raj_me):
        my_mid = (raj_me["member"] or {}).get("member_id")
        start = date.today() + timedelta(days=2)
        end = start + timedelta(days=21)  # inclusive; expect start, +7, +14, +21 = 4 events
        created = self._create(raj, {
            "title": "TEST_ weeklyUntil",
            "date": start.isoformat(),
            "start_time": "09:00",
            "end_time": "10:00",
            "owner_member_id": my_mid,
            "repeat": "weekly",
            "repeat_end_date": end.isoformat(),
            "all_day": False,
        })
        series_id = created.get("series_id")
        assert series_id

        r = raj.get(f"{API}/events?start={start.isoformat()}&end={end.isoformat()}", timeout=20)
        events = [e for e in r.json() if e.get("series_id") == series_id]
        assert len(events) == 4, f"weekly until date must cap at 4 occurrences, got {len(events)}"

        self._cleanup(raj, events[0]["event_id"])

    def test_delete_occurrence_removes_whole_series(self, raj, raj_me):
        my_mid = (raj_me["member"] or {}).get("member_id")
        start = date.today() + timedelta(days=3)
        created = self._create(raj, {
            "title": "TEST_ deleteSeries",
            "date": start.isoformat(),
            "start_time": "09:00",
            "end_time": "10:00",
            "owner_member_id": my_mid,
            "repeat": "weekly",
            "repeat_count": 3,
            "all_day": False,
        })
        sid = created["series_id"]
        # Fetch and pick middle occurrence
        r = raj.get(f"{API}/events?start={start.isoformat()}&end={(start + timedelta(days=30)).isoformat()}", timeout=20)
        events = sorted([e for e in r.json() if e.get("series_id") == sid], key=lambda e: e["date"])
        assert len(events) == 3
        mid_id = events[1]["event_id"]

        r = raj.delete(f"{API}/events/{mid_id}", timeout=20)
        assert r.status_code == 200

        r = raj.get(f"{API}/events?start={start.isoformat()}&end={(start + timedelta(days=30)).isoformat()}", timeout=20)
        remaining = [e for e in r.json() if e.get("series_id") == sid]
        assert remaining == [], f"deleting occurrence must remove whole series, remaining={remaining}"

    def test_patch_applies_to_series_but_keeps_dates(self, raj, raj_me):
        my_mid = (raj_me["member"] or {}).get("member_id")
        start = date.today() + timedelta(days=4)
        created = self._create(raj, {
            "title": "TEST_ patchSeries",
            "date": start.isoformat(),
            "start_time": "09:00",
            "end_time": "10:00",
            "location": "Old",
            "owner_member_id": my_mid,
            "repeat": "weekly",
            "repeat_count": 3,
            "all_day": False,
        })
        sid = created["series_id"]
        r = raj.get(f"{API}/events?start={start.isoformat()}&end={(start + timedelta(days=30)).isoformat()}", timeout=20)
        events = sorted([e for e in r.json() if e.get("series_id") == sid], key=lambda e: e["date"])
        original_dates = [e["date"][:10] for e in events]

        # PATCH the first occurrence with a new location + moved date (date change must be ignored per code)
        patch = {
            "title": "TEST_ patchSeries",
            "date": (start + timedelta(days=99)).isoformat(),  # this MUST be dropped by server for series
            "start_time": "09:00",
            "end_time": "10:00",
            "location": "New Venue",
            "owner_member_id": my_mid,
            "all_day": False,
        }
        r = raj.patch(f"{API}/events/{events[0]['event_id']}", json=patch, timeout=20)
        assert r.status_code == 200, r.text

        r = raj.get(f"{API}/events?start={start.isoformat()}&end={(start + timedelta(days=30)).isoformat()}", timeout=20)
        after = sorted([e for e in r.json() if e.get("series_id") == sid], key=lambda e: e["date"])
        assert [e["date"][:10] for e in after] == original_dates, "PATCH must not move occurrence dates"
        assert all(e.get("location") == "New Venue" for e in after), \
            f"PATCH must set location on every occurrence, got {[e.get('location') for e in after]}"

        self._cleanup(raj, after[0]["event_id"])

    def test_invite_ics_contains_rrule_weekly_count(self, raj, raj_me):
        my_mid = (raj_me["member"] or {}).get("member_id")
        start = date.today() + timedelta(days=5)
        created = self._create(raj, {
            "title": "TEST_ icsWeekly",
            "date": start.isoformat(),
            "start_time": "09:00",
            "end_time": "10:00",
            "owner_member_id": my_mid,
            "repeat": "weekly",
            "repeat_count": 4,
            "all_day": False,
        })
        eid = created["event_id"]
        r = requests.get(f"{API}/events/{eid}/invite.ics", timeout=20)  # public
        assert r.status_code == 200
        text = r.text
        assert "RRULE:FREQ=WEEKLY" in text, f"ICS missing weekly RRULE: {text}"
        assert "COUNT=4" in text, f"ICS missing COUNT=4: {text}"

        self._cleanup(raj, eid)

    def test_invite_ics_contains_rrule_monthly_until(self, raj, raj_me):
        my_mid = (raj_me["member"] or {}).get("member_id")
        start = date(2027, 2, 15)
        until = date(2027, 6, 30)
        created = self._create(raj, {
            "title": "TEST_ icsMonthlyUntil",
            "date": start.isoformat(),
            "start_time": "09:00",
            "end_time": "10:00",
            "owner_member_id": my_mid,
            "repeat": "monthly",
            "repeat_end_date": until.isoformat(),
            "all_day": False,
        })
        eid = created["event_id"]
        r = requests.get(f"{API}/events/{eid}/invite.ics", timeout=20)
        assert r.status_code == 200
        text = r.text
        assert "RRULE:FREQ=MONTHLY" in text, f"ICS missing monthly RRULE: {text}"
        assert "UNTIL=20270630" in text, f"ICS missing UNTIL: {text}"

        self._cleanup(raj, eid)

    def test_non_recurring_has_no_series_id(self, raj, raj_me):
        my_mid = (raj_me["member"] or {}).get("member_id")
        start = date.today() + timedelta(days=6)
        created = self._create(raj, {
            "title": "TEST_ oneShot",
            "date": start.isoformat(),
            "start_time": "09:00",
            "end_time": "10:00",
            "owner_member_id": my_mid,
            "all_day": False,
        })
        assert created.get("series_id") is None, \
            f"non-recurring event must not have series_id, got {created.get('series_id')}"
        assert created.get("repeat") in (None, "none")

        # Should return exactly 1 in the range
        r = raj.get(f"{API}/events?start={start.isoformat()}&end={start.isoformat()}", timeout=20)
        matches = [e for e in r.json() if e["event_id"] == created["event_id"]]
        assert len(matches) == 1

        self._cleanup(raj, created["event_id"])


# ---------------------------------------------------------------------------
# Notice Seen-by
# ---------------------------------------------------------------------------
class TestNoticeSeen:

    @pytest.fixture
    def notice_id(self, raj):
        r = raj.post(f"{API}/notices", json={
            "title": "TEST_ seen notice",
            "note": "please open me",
        }, timeout=20)
        assert r.status_code == 201, r.text
        nid = r.json()["notice_id"]
        yield nid
        raj.delete(f"{API}/notices/{nid}", timeout=20)

    def test_mark_seen_idempotent(self, raj, notice_id, raj_me):
        # First mark
        r1 = raj.post(f"{API}/notices/{notice_id}/seen", timeout=20)
        assert r1.status_code == 200, r1.text
        b1 = r1.json()
        assert b1.get("seen_count") == 1
        assert b1.get("seen") is True
        assert isinstance(b1.get("seen_members"), list) and len(b1["seen_members"]) == 1
        assert b1["seen_members"][0].get("member_id") == raj_me["member"]["member_id"]

        # Second mark by same user -> still 1
        r2 = raj.post(f"{API}/notices/{notice_id}/seen", timeout=20)
        assert r2.status_code == 200
        b2 = r2.json()
        assert b2.get("seen_count") == 1, f"POST /seen must be idempotent, got {b2.get('seen_count')}"

    def test_notice_detail_returns_seen_fields(self, raj, notice_id):
        raj.post(f"{API}/notices/{notice_id}/seen", timeout=20)
        r = raj.get(f"{API}/notices/{notice_id}", timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert "seen_count" in body
        assert "seen" in body
        assert "seen_members" in body
        assert body["seen"] is True
        assert body["seen_count"] == 1

    def test_notices_list_includes_seen_count(self, raj, notice_id):
        raj.post(f"{API}/notices/{notice_id}/seen", timeout=20)
        r = raj.get(f"{API}/notices", timeout=20)
        assert r.status_code == 200
        target = next((n for n in r.json() if n["notice_id"] == notice_id), None)
        assert target is not None
        assert target.get("seen_count") == 1

    def test_home_notices_preview_includes_seen_count(self, raj, notice_id):
        raj.patch(f"{API}/notices/{notice_id}", json={"pinned": True}, timeout=20)
        raj.post(f"{API}/notices/{notice_id}/seen", timeout=20)
        r = raj.get(f"{API}/home", timeout=30)
        assert r.status_code == 200
        home = r.json()
        assert "notices" in home
        target = next((n for n in home["notices"] if n["notice_id"] == notice_id), None)
        assert target is not None, f"pinned notice missing from /home preview: {home['notices']}"
        assert target.get("seen_count") == 1, f"home notice missing seen_count: {target}"


# ---------------------------------------------------------------------------
# Emergency Delegates
# ---------------------------------------------------------------------------
class TestEmergencyDelegates:

    def _find(self, members, predicate):
        for m in members:
            if predicate(m):
                return m
        return None

    def test_grant_and_list_delegate_for_adult(self, raj, raj_me, family_members):
        my_mid = raj_me["member"]["member_id"]
        adult = self._find(family_members, lambda m: m["member_id"] != my_mid
                            and not m.get("is_child") and m.get("role") != "child")
        if not adult:
            pytest.skip("no adult non-self member available")

        # Ensure clean state
        raj.delete(f"{API}/emergency/delegates/{adult['member_id']}", timeout=20)

        r = raj.post(f"{API}/emergency/delegates", json={"member_id": adult["member_id"]}, timeout=20)
        assert r.status_code == 201, f"grant adult expected 201, got {r.status_code} {r.text}"

        r = raj.get(f"{API}/emergency/delegates", timeout=20)
        assert r.status_code == 200
        listed = r.json()
        found = next((d for d in listed if (d.get("member") or {}).get("member_id") == adult["member_id"]), None)
        assert found is not None, f"delegate not listed after POST: {listed}"
        assert (found.get("member") or {}).get("name"), "delegate member card missing name"

        # Idempotent grant (upsert)
        r2 = raj.post(f"{API}/emergency/delegates", json={"member_id": adult["member_id"]}, timeout=20)
        assert r2.status_code == 201

        # Cleanup
        r = raj.delete(f"{API}/emergency/delegates/{adult['member_id']}", timeout=20)
        assert r.status_code == 200

    def test_delete_delegate_removes_from_list(self, raj, raj_me, family_members):
        my_mid = raj_me["member"]["member_id"]
        adult = self._find(family_members, lambda m: m["member_id"] != my_mid
                            and not m.get("is_child") and m.get("role") != "child")
        if not adult:
            pytest.skip("no adult non-self member available")

        raj.post(f"{API}/emergency/delegates", json={"member_id": adult["member_id"]}, timeout=20)
        r = raj.delete(f"{API}/emergency/delegates/{adult['member_id']}", timeout=20)
        assert r.status_code == 200

        r = raj.get(f"{API}/emergency/delegates", timeout=20)
        assert r.status_code == 200
        assert all((d.get("member") or {}).get("member_id") != adult["member_id"] for d in r.json()), \
            "delegate must be absent after DELETE"

    def test_grant_child_returns_400(self, raj, family_members):
        child = self._find(family_members, lambda m: m.get("is_child") or m.get("role") == "child")
        if not child:
            pytest.skip("no child in family")
        r = raj.post(f"{API}/emergency/delegates", json={"member_id": child["member_id"]}, timeout=20)
        assert r.status_code == 400, f"child grant must be 400, got {r.status_code} {r.text}"

    def test_grant_unknown_member_returns_404(self, raj):
        r = raj.post(f"{API}/emergency/delegates",
                     json={"member_id": "mem_thisIdDoesNotExist"}, timeout=20)
        assert r.status_code == 404, f"unknown member must be 404, got {r.status_code} {r.text}"
