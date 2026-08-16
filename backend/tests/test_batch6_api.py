"""FamilyHome — batch #6 backend tests.

Covers:
- Time Capsules (locked list hides message; unlocked list exposes it;
  create/read/delete; 400 for past date; 400 for empty message;
  403 non-author delete)
- Weekly Highlights (GET /highlights/week shape)
- Places (GET /timeline/places groups + GET /timeline?location=<X> filter)
"""
import os
import uuid
from datetime import date, timedelta

import pytest
import requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def user_a(s):
    email = f"TEST_batch6_a_{uuid.uuid4().hex[:8]}@fam.com"
    reg = s.post(
        f"{BASE}/auth/register",
        json={"name": "TEST Batch6 A", "email": email, "password": "secret123"},
    ).json()
    token = reg["token"]
    r = s.post(f"{BASE}/seed/demo", headers=_auth(token))
    assert r.status_code == 200, r.text
    me = s.get(f"{BASE}/auth/me", headers=_auth(token)).json()
    return {"token": token, "me": me}


@pytest.fixture(scope="module")
def capsule_tester(s):
    """Login as the pre-seeded capsuletester (linked to Raj)."""
    r = s.post(
        f"{BASE}/auth/login",
        json={"email": "capsuletester@fam.com", "password": "secret123"},
    )
    assert r.status_code == 200, r.text
    return {"token": r.json()["token"]}


# ---------------------------------------------------------------------------
# Time Capsules
# ---------------------------------------------------------------------------
class TestCapsules:
    def test_seeded_locked_capsule_hides_message(self, s, user_a):
        h = _auth(user_a["token"])
        r = s.get(f"{BASE}/capsules", headers=h)
        assert r.status_code == 200, r.text
        caps = r.json()
        assert isinstance(caps, list) and len(caps) >= 1
        locked = [c for c in caps if c["is_locked"]]
        assert locked, "expected at least one locked seeded capsule"
        for c in locked:
            assert c["is_locked"] is True
            assert "days_until" in c and isinstance(c["days_until"], int)
            assert c["days_until"] >= 0
            assert "message" not in c, f"locked capsule leaked message: {c}"
            assert "media" not in c, f"locked capsule leaked media: {c}"
            assert "author" in c and c["author"]

    def test_seeded_unlocked_capsule_exposes_message(self, s, user_a):
        h = _auth(user_a["token"])
        caps = s.get(f"{BASE}/capsules", headers=h).json()
        unlocked = [c for c in caps if not c["is_locked"]]
        assert unlocked, "expected at least one unlocked seeded capsule"
        for c in unlocked:
            assert c["is_locked"] is False
            assert c.get("message"), f"unlocked capsule missing message: {c}"
            assert "media" in c

    def test_create_capsule_ok(self, s, user_a):
        h = _auth(user_a["token"])
        future = (date.today() + timedelta(days=45)).isoformat()
        body = {
            "message": "TEST_batch6 future love note",
            "media": [],
            "unlock_date": future,
        }
        r = s.post(f"{BASE}/capsules", json=body, headers=h)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["is_locked"] is True
        assert j["unlock_date"] == future
        assert j["days_until"] >= 44
        # locked returned view hides message
        assert "message" not in j
        cap_id = j["capsule_id"]

        # GET single also hides message
        r = s.get(f"{BASE}/capsules/{cap_id}", headers=h)
        assert r.status_code == 200
        got = r.json()
        assert got["is_locked"] is True
        assert "message" not in got

        # cleanup
        s.delete(f"{BASE}/capsules/{cap_id}", headers=h)

    def test_create_past_date_400(self, s, user_a):
        h = _auth(user_a["token"])
        past = (date.today() - timedelta(days=1)).isoformat()
        r = s.post(
            f"{BASE}/capsules",
            json={"message": "hi", "media": [], "unlock_date": past},
            headers=h,
        )
        assert r.status_code == 400

    def test_create_today_400(self, s, user_a):
        h = _auth(user_a["token"])
        today = date.today().isoformat()
        r = s.post(
            f"{BASE}/capsules",
            json={"message": "hi", "media": [], "unlock_date": today},
            headers=h,
        )
        assert r.status_code == 400

    def test_create_empty_message_400(self, s, user_a):
        h = _auth(user_a["token"])
        future = (date.today() + timedelta(days=30)).isoformat()
        r = s.post(
            f"{BASE}/capsules",
            json={"message": "   ", "media": [], "unlock_date": future},
            headers=h,
        )
        assert r.status_code == 400

    def test_author_can_delete_non_author_403(self, s, capsule_tester):
        """Uses the pre-seeded Sharma family: capsuletester is linked to Raj.
        The seed inserts capsules authored by Priya (locked) and Raj (unlocked).
        Deleting Priya's capsule as Raj must 403.
        """
        h = _auth(capsule_tester["token"])
        me = s.get(f"{BASE}/auth/me", headers=h).json()
        my_mid = me["member"]["member_id"]

        caps = s.get(f"{BASE}/capsules", headers=h).json()
        assert len(caps) >= 2
        # find one whose author is NOT me
        # We need to look at author.member_id on returned view
        not_mine = [c for c in caps if c.get("author", {}).get("member_id") != my_mid]
        assert not_mine, f"expected a capsule not authored by me; caps={caps}"
        other_id = not_mine[0]["capsule_id"]

        r = s.delete(f"{BASE}/capsules/{other_id}", headers=h)
        assert r.status_code == 403, r.text

        # Create + delete one of my own capsules to prove author-delete works
        future = (date.today() + timedelta(days=90)).isoformat()
        r = s.post(
            f"{BASE}/capsules",
            json={"message": "TEST_batch6 raj's own", "media": [], "unlock_date": future},
            headers=h,
        )
        assert r.status_code == 200, r.text
        mine_id = r.json()["capsule_id"]
        r = s.delete(f"{BASE}/capsules/{mine_id}", headers=h)
        assert r.status_code == 200
        # confirm 404
        assert s.get(f"{BASE}/capsules/{mine_id}", headers=h).status_code == 404


# ---------------------------------------------------------------------------
# Weekly Highlights
# ---------------------------------------------------------------------------
class TestHighlights:
    def test_shape(self, s, user_a):
        h = _auth(user_a["token"])
        r = s.get(f"{BASE}/highlights/week", headers=h)
        assert r.status_code == 200, r.text
        j = r.json()
        # period
        assert "period" in j and "from" in j["period"] and "to" in j["period"]
        # counts
        assert "counts" in j
        for k in ("posts", "memories", "wishes", "loves"):
            assert k in j["counts"] and isinstance(j["counts"][k], int)
        # top_poster may be None if no posts, but key must exist
        assert "top_poster" in j
        assert isinstance(j["posts"], list)
        assert isinstance(j["memories"], list)
        # memories items have id/title/date
        for m in j["memories"]:
            assert "id" in m and "title" in m and "date" in m


# ---------------------------------------------------------------------------
# Places
# ---------------------------------------------------------------------------
class TestPlaces:
    def test_places_grouped(self, s, user_a):
        h = _auth(user_a["token"])
        r = s.get(f"{BASE}/timeline/places", headers=h)
        assert r.status_code == 200, r.text
        places = r.json()
        assert isinstance(places, list) and len(places) >= 1
        for p in places:
            assert "location" in p and p["location"]
            assert "count" in p and p["count"] >= 1
            assert "cover" in p  # may be None
        # counts should sort desc (top result >= last result)
        counts = [p["count"] for p in places]
        assert counts == sorted(counts, reverse=True)

    def test_timeline_location_filter_case_insensitive(self, s, user_a):
        h = _auth(user_a["token"])
        places = s.get(f"{BASE}/timeline/places", headers=h).json()
        # pick a place from the demo
        target = places[0]["location"]

        # exact case
        r = s.get(f"{BASE}/timeline?location={target}", headers=h)
        assert r.status_code == 200
        exact = r.json()
        assert len(exact) == places[0]["count"]
        for m in exact:
            assert m.get("location", "").lower() == target.lower()

        # lower case must return the same
        r = s.get(f"{BASE}/timeline?location={target.lower()}", headers=h)
        assert r.status_code == 200
        lower = r.json()
        assert len(lower) == len(exact)

        # upper case must return the same
        r = s.get(f"{BASE}/timeline?location={target.upper()}", headers=h)
        assert r.status_code == 200
        upper = r.json()
        assert len(upper) == len(exact)

    def test_unknown_location_empty(self, s, user_a):
        h = _auth(user_a["token"])
        r = s.get(f"{BASE}/timeline?location=Atlantis-Nowhere", headers=h)
        assert r.status_code == 200
        assert r.json() == []
