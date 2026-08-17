"""Batch #15 — Event RSVP + Notice photo_url.

Covers:
  * POST /api/events/{id}/rsvp with going|maybe|declined by an invited/owner member
    returns updated event with rsvps[], rsvp_summary {going,maybe,declined}, my_rsvp.
  * POST /api/events/{id}/rsvp with invalid status returns 400.
  * GET /api/events (list_events) hydrates rsvp_summary + my_rsvp for the viewer.
  * POST /api/notices with photo_url persists photo_url.
  * GET /api/notices list + GET /api/notices/{id} + GET /api/home notices preview all
    return photo_url on the notice.
"""
import os
from datetime import date, timedelta

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

BOARD_EMAIL = "board@fam.com"
PASSWORD = "secret123"

PHOTO_URL = "https://images.unsplash.com/photo-1503023345310-bd7c1de61c7d?w=640"


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
# Event RSVP
# ---------------------------------------------------------------------------
class TestEventRsvp:
    @pytest.fixture
    def event_id(self, raj, raj_me):
        my_mid = (raj_me["member"] or {}).get("member_id")
        # Fetch other family members so we can invite participant(s).
        mem_r = raj.get(f"{API}/families/members", timeout=20)
        assert mem_r.status_code == 200
        raw = mem_r.json()
        members = raw.get("members", raw) if isinstance(raw, dict) else raw
        others = [m["member_id"] for m in members if m["member_id"] != my_mid][:2]

        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        r = raj.post(f"{API}/events", json={
            "title": "TEST_ RSVP event",
            "date": tomorrow,
            "start_time": "18:00",
            "end_time": "19:00",
            "owner_member_id": my_mid,
            "participant_ids": others,
            "all_day": False,
        }, timeout=30)
        assert r.status_code in (200, 201), r.text
        eid = r.json()["event_id"]
        yield eid
        raj.delete(f"{API}/events/{eid}", timeout=20)

    def test_rsvp_going_by_owner(self, raj, event_id, raj_me):
        r = raj.post(f"{API}/events/{event_id}/rsvp", json={"status": "going"}, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        # my_rsvp reflects viewer choice
        assert body.get("my_rsvp") == "going", f"my_rsvp expected 'going', got {body.get('my_rsvp')}"
        # rsvp_summary counts going=1
        summary = body.get("rsvp_summary") or {}
        assert summary.get("going") == 1, f"going count expected 1, got {summary}"
        assert summary.get("maybe") == 0
        assert summary.get("declined") == 0
        # rsvps[] contains an entry with member card + status='going'
        rsvps = body.get("rsvps") or []
        assert len(rsvps) >= 1, f"rsvps[] should have at least owner entry, got {rsvps}"
        my_entry = next((x for x in rsvps if (x.get("member") or {}).get("member_id") == raj_me["member"]["member_id"]), None)
        assert my_entry is not None, f"owner rsvp entry missing: {rsvps}"
        assert my_entry["status"] == "going"
        assert (my_entry.get("member") or {}).get("name"), "member card must be hydrated with name"

    def test_rsvp_maybe_updates_summary(self, raj, event_id):
        r = raj.post(f"{API}/events/{event_id}/rsvp", json={"status": "maybe"}, timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert body["my_rsvp"] == "maybe"
        assert body["rsvp_summary"]["maybe"] == 1
        assert body["rsvp_summary"]["going"] == 0

    def test_rsvp_declined_updates_summary(self, raj, event_id):
        r = raj.post(f"{API}/events/{event_id}/rsvp", json={"status": "declined"}, timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert body["my_rsvp"] == "declined"
        assert body["rsvp_summary"]["declined"] == 1
        assert body["rsvp_summary"]["going"] == 0
        assert body["rsvp_summary"]["maybe"] == 0

    def test_rsvp_invalid_status_returns_400(self, raj, event_id):
        r = raj.post(f"{API}/events/{event_id}/rsvp", json={"status": "foo"}, timeout=20)
        assert r.status_code == 400, f"invalid status must be 400, got {r.status_code} {r.text}"

    def test_rsvp_missing_event_404(self, raj):
        r = raj.post(f"{API}/events/evt_bogusdoesnotexist/rsvp", json={"status": "going"}, timeout=20)
        assert r.status_code == 404, f"missing event should be 404, got {r.status_code}"

    def test_list_events_includes_rsvp_summary_and_my_rsvp(self, raj, event_id):
        # First set a known RSVP
        raj.post(f"{API}/events/{event_id}/rsvp", json={"status": "going"}, timeout=20)

        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        r = raj.get(f"{API}/events?start={tomorrow}&end={tomorrow}", timeout=20)
        assert r.status_code == 200
        events = r.json()
        target = next((e for e in events if e["event_id"] == event_id), None)
        assert target is not None, "event should appear in list_events range"
        assert "rsvp_summary" in target, f"list_events must hydrate rsvp_summary: {target.keys()}"
        assert target["rsvp_summary"]["going"] == 1
        assert "my_rsvp" in target, f"list_events must hydrate my_rsvp: {target.keys()}"
        assert target["my_rsvp"] == "going"

    def test_rsvp_non_invited_returns_403(self, raj, raj_me):
        """Create an event that does NOT include the logged-in member as owner or
        participant, then attempt to RSVP — must return 403."""
        my_mid = (raj_me["member"] or {}).get("member_id")
        # Grab another member to be the owner + only participant.
        mem_r = raj.get(f"{API}/families/members", timeout=20)
        raw = mem_r.json()
        members = raw.get("members", raw) if isinstance(raw, dict) else raw
        others = [m for m in members if m["member_id"] != my_mid]
        if not others:
            pytest.skip("family has no other members to own a non-invited event")
        other_mid = others[0]["member_id"]

        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        create = raj.post(f"{API}/events", json={
            "title": "TEST_ non-invited event",
            "date": tomorrow,
            "owner_member_id": other_mid,
            "participant_ids": [],  # explicitly exclude Raj
            "all_day": True,
        }, timeout=30)
        assert create.status_code in (200, 201), create.text
        eid = create.json()["event_id"]
        try:
            r = raj.post(f"{API}/events/{eid}/rsvp", json={"status": "going"}, timeout=20)
            assert r.status_code == 403, \
                f"non-invited RSVP must be 403, got {r.status_code} {r.text}"
        finally:
            raj.delete(f"{API}/events/{eid}", timeout=20)


# ---------------------------------------------------------------------------
# Notice photo_url
# ---------------------------------------------------------------------------
class TestNoticePhoto:
    @pytest.fixture
    def notice_id(self, raj):
        r = raj.post(f"{API}/notices", json={
            "title": "TEST_ notice with photo",
            "note": "See attached flyer",
            "photo_url": PHOTO_URL,
        }, timeout=20)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body.get("photo_url") == PHOTO_URL, \
            f"POST /notices must return photo_url, got {body.get('photo_url')}"
        nid = body["notice_id"]
        yield nid
        raj.delete(f"{API}/notices/{nid}", timeout=20)

    def test_get_notices_list_returns_photo_url(self, raj, notice_id):
        r = raj.get(f"{API}/notices", timeout=20)
        assert r.status_code == 200
        listing = r.json()
        target = next((n for n in listing if n["notice_id"] == notice_id), None)
        assert target is not None, "created notice must appear in /notices"
        assert target.get("photo_url") == PHOTO_URL, \
            f"list notices photo_url mismatch: {target.get('photo_url')}"

    def test_get_notice_detail_returns_photo_url(self, raj, notice_id):
        r = raj.get(f"{API}/notices/{notice_id}", timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert body.get("photo_url") == PHOTO_URL, \
            f"notice detail photo_url mismatch: {body.get('photo_url')}"

    def test_home_notices_preview_returns_photo_url(self, raj, notice_id):
        # Pin so it definitely lands in top-3 home preview.
        raj.patch(f"{API}/notices/{notice_id}", json={"pinned": True}, timeout=20)
        r = raj.get(f"{API}/home", timeout=30)
        assert r.status_code == 200
        home = r.json()
        assert "notices" in home, f"home missing notices: keys={list(home.keys())}"
        target = next((n for n in home["notices"] if n["notice_id"] == notice_id), None)
        assert target is not None, \
            f"pinned notice must appear in home notices preview: {home['notices']}"
        assert target.get("photo_url") == PHOTO_URL, \
            f"home preview photo_url mismatch: {target.get('photo_url')}"

    def test_notice_without_photo_is_null(self, raj):
        r = raj.post(f"{API}/notices", json={"title": "TEST_ no photo"}, timeout=20)
        assert r.status_code == 201
        body = r.json()
        assert body.get("photo_url") is None, \
            f"missing photo_url should be null, got {body.get('photo_url')}"
        raj.delete(f"{API}/notices/{body['notice_id']}", timeout=20)
