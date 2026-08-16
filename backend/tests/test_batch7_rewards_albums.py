"""Batch 7 tests — Family Rewards, Family Albums, home streak.

Uses the pre-seeded `rewardtester@fam.com / secret123` Sharma family
(Raj is the logged-in user and creator of the seeded "Goa Getaway" album).
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://our-story-191.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

EMAIL = "rewardtester@fam.com"
PASSWORD = "secret123"


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def me(headers):
    r = requests.get(f"{API}/auth/me", headers=headers, timeout=30)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="module")
def members(headers):
    r = requests.get(f"{API}/families/members", headers=headers, timeout=30)
    assert r.status_code == 200
    return r.json()


# ---------- Rewards ----------
class TestRewards:
    def test_rewards_shape(self, headers):
        r = requests.get(f"{API}/rewards", headers=headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        for key in ("leaderboard", "streak", "totals", "badges"):
            assert key in data, f"missing key {key}"
        assert isinstance(data["leaderboard"], list) and len(data["leaderboard"]) >= 1
        assert isinstance(data["streak"], int)
        assert data["streak"] >= 1
        assert isinstance(data["badges"], list) and len(data["badges"]) >= 6

    def test_leaderboard_entries_and_sort(self, headers):
        data = requests.get(f"{API}/rewards", headers=headers, timeout=30).json()
        lb = data["leaderboard"]
        for entry in lb:
            assert "member" in entry and entry["member"].get("member_id")
            assert "points" in entry and isinstance(entry["points"], int)
            for k in ("posts", "loves", "memories", "wishes", "chores"):
                assert k in entry, f"leaderboard entry missing per-type count {k}"
        pts = [e["points"] for e in lb]
        assert pts == sorted(pts, reverse=True), "leaderboard not sorted desc by points"

    def test_raj_is_top(self, headers):
        data = requests.get(f"{API}/rewards", headers=headers, timeout=30).json()
        top = data["leaderboard"][0]
        assert top["member"]["name"] == "Raj", f"expected Raj top, got {top['member']['name']}"
        assert top["points"] >= 100, f"expected Raj ~135 pts, got {top['points']}"

    def test_badges_shape(self, headers):
        data = requests.get(f"{API}/rewards", headers=headers, timeout=30).json()
        for b in data["badges"]:
            for k in ("key", "label", "emoji", "current", "target", "earned"):
                assert k in b, f"badge missing {k}"
            assert isinstance(b["earned"], bool)
            assert b["current"] <= b["target"]

    def test_totals_contains_points_and_streak(self, headers):
        totals = requests.get(f"{API}/rewards", headers=headers, timeout=30).json()["totals"]
        for k in ("posts", "memories", "loves", "points", "streak"):
            assert k in totals


# ---------- Home streak ----------
class TestHomeStreak:
    def test_home_returns_family_streak(self, headers):
        r = requests.get(f"{API}/home", headers=headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "family_streak" in data
        assert isinstance(data["family_streak"], int)
        assert data["family_streak"] >= 1


# ---------- Albums ----------
class TestAlbums:
    def test_list_albums_has_goa(self, headers):
        r = requests.get(f"{API}/albums", headers=headers, timeout=30)
        assert r.status_code == 200
        albums = r.json()
        assert isinstance(albums, list) and len(albums) >= 1
        goa = next((a for a in albums if "Goa" in a.get("title", "")), None)
        assert goa is not None, "seeded Goa album not found"
        assert goa["photo_count"] == 3, f"expected 3 photos, got {goa['photo_count']}"
        assert goa["cover"], "cover missing"
        assert goa["creator"]["name"] == "Raj"

    def test_get_album_photos(self, headers):
        albums = requests.get(f"{API}/albums", headers=headers, timeout=30).json()
        goa = next(a for a in albums if "Goa" in a["title"])
        r = requests.get(f"{API}/albums/{goa['album_id']}", headers=headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert len(data.get("photos", [])) == 3

    def test_create_album_empty_title_400(self, headers):
        r = requests.post(f"{API}/albums", headers=headers, json={"title": "  "}, timeout=30)
        assert r.status_code == 400

    def test_create_and_add_photos_as_creator(self, headers):
        r = requests.post(f"{API}/albums", headers=headers,
                          json={"title": "TEST_MyAlbum_batch7", "description": "test"}, timeout=30)
        assert r.status_code == 200
        album = r.json()
        aid = album["album_id"]
        assert album["photo_count"] == 0
        assert album["creator"]["name"] == "Raj"

        # add photo as creator (Raj) → 200
        r = requests.post(f"{API}/albums/{aid}/photos", headers=headers,
                          json={"media": [{"url": "https://example.com/x.jpg", "type": "image"}]}, timeout=30)
        assert r.status_code == 200, r.text
        assert len(r.json()["photos"]) == 1

        # verify via GET
        got = requests.get(f"{API}/albums/{aid}", headers=headers, timeout=30).json()
        assert len(got["photos"]) == 1
        assert got["cover"] == "https://example.com/x.jpg"

        # DELETE as creator → 200
        d = requests.delete(f"{API}/albums/{aid}", headers=headers, timeout=30)
        assert d.status_code == 200
        # verify gone
        assert requests.get(f"{API}/albums/{aid}", headers=headers, timeout=30).status_code == 404

    def test_non_creator_cannot_add_photos_or_delete(self, headers):
        """Create a fresh user, join Raj's family via invite → non-creator; expect 403."""
        # get invite code
        inv = requests.get(f"{API}/families/invite", headers=headers, timeout=30).json()
        code = inv["invite_code"]

        import uuid as _u
        email2 = f"test_nc_{_u.uuid4().hex[:8]}@fam.com"
        reg = requests.post(f"{API}/auth/register", json={
            "name": "NonCreator", "email": email2, "password": "secret123"}, timeout=30)
        assert reg.status_code == 200
        tok2 = reg.json()["token"]
        h2 = {"Authorization": f"Bearer {tok2}", "Content-Type": "application/json"}
        j = requests.post(f"{API}/families/join", headers=h2, json={"code": code}, timeout=30)
        assert j.status_code == 200

        # find Goa album (created by Raj)
        albums = requests.get(f"{API}/albums", headers=h2, timeout=30).json()
        goa = next(a for a in albums if "Goa" in a["title"])
        aid = goa["album_id"]

        # non-creator add photos → 403
        r = requests.post(f"{API}/albums/{aid}/photos", headers=h2,
                          json={"media": [{"url": "https://x/y.jpg", "type": "image"}]}, timeout=30)
        assert r.status_code == 403, f"expected 403, got {r.status_code}"

        # non-creator delete → 403
        d = requests.delete(f"{API}/albums/{aid}", headers=h2, timeout=30)
        assert d.status_code == 403


# ---------- Regression ----------
class TestRegression:
    def test_timeline_list(self, headers):
        r = requests.get(f"{API}/timeline", headers=headers, timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_on_this_day(self, headers):
        r = requests.get(f"{API}/timeline/on-this-day", headers=headers, timeout=30)
        assert r.status_code == 200
        assert "events" in r.json()

    def test_timeline_places(self, headers):
        r = requests.get(f"{API}/timeline/places", headers=headers, timeout=30)
        assert r.status_code == 200

    def test_chats_and_family_chat(self, headers):
        r = requests.get(f"{API}/chats", headers=headers, timeout=30)
        assert r.status_code == 200
        chats = r.json()
        assert any(c["type"] == "family" for c in chats)

    def test_home_dashboard(self, headers):
        r = requests.get(f"{API}/home", headers=headers, timeout=30)
        assert r.status_code == 200
        for k in ("family", "members", "events_today", "pending_chores", "family_streak"):
            assert k in r.json()

    def test_chat_pin_flow(self, headers):
        chats = requests.get(f"{API}/chats", headers=headers, timeout=30).json()
        fam = next(c for c in chats if c["type"] == "family")
        cid = fam["chat_id"]
        # send msg
        m = requests.post(f"{API}/chats/{cid}/messages", headers=headers,
                          json={"text": "TEST_pin_msg", "type": "text"}, timeout=30).json()
        # pin
        p = requests.post(f"{API}/chats/{cid}/pin", headers=headers, json={"message_id": m["message_id"]}, timeout=30)
        assert p.status_code == 200
        # verify
        got = requests.get(f"{API}/chats/{cid}", headers=headers, timeout=30).json()
        assert got.get("pinned_message") and got["pinned_message"]["message_id"] == m["message_id"]
        # unpin
        u = requests.post(f"{API}/chats/{cid}/unpin", headers=headers, timeout=30)
        assert u.status_code == 200
