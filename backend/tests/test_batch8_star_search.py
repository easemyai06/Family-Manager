"""Batch #8 backend tests: Star of the Week (Weekly Winner) + Global Search."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://our-story-191.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

SEEDED_EMAIL = "winner1786918036@fam.com"
SEEDED_PASS = "secret123"


def _login_or_register(email: str, password: str, name: str = "Batch8 Tester"):
    """Try login; if fails, register + seed demo."""
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    if r.status_code == 200:
        return r.json()["token"], r.json()["user"], False  # existing
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": password, "name": name})
    r.raise_for_status()
    return r.json()["token"], r.json()["user"], True


@pytest.fixture(scope="module")
def auth():
    """Prefer the fresh seeded winner account; else register + seed demo."""
    # Try seeded winner first
    r = requests.post(f"{API}/auth/login", json={"email": SEEDED_EMAIL, "password": SEEDED_PASS})
    if r.status_code == 200:
        token = r.json()["token"]
        user = r.json()["user"]
        if user.get("family_id"):
            return {"token": token, "user": user, "headers": {"Authorization": f"Bearer {token}"}}

    # Fresh account fallback
    email = f"batch8_{int(time.time())}@fam.com"
    token, user, is_new = _login_or_register(email, SEEDED_PASS)
    headers = {"Authorization": f"Bearer {token}"}
    if not user.get("family_id"):
        # seed demo
        r = requests.post(f"{API}/seed/demo", headers=headers)
        r.raise_for_status()
        # refresh user
        r = requests.get(f"{API}/auth/me", headers=headers)
        r.raise_for_status()
        user = r.json()["user"]
    return {"token": token, "user": user, "headers": headers}


@pytest.fixture(scope="module")
def second_family():
    """Register a second isolated account with its own seeded family to check cross-family leakage."""
    email = f"batch8_other_{int(time.time())}@fam.com"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": SEEDED_PASS, "name": "Other"})
    r.raise_for_status()
    token = r.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    requests.post(f"{API}/seed/demo", headers=headers).raise_for_status()
    return {"token": token, "headers": headers}


# ---------- /api/rewards ----------
class TestRewards:
    def test_rewards_returns_week_leaderboard_and_star(self, auth):
        r = requests.get(f"{API}/rewards", headers=auth["headers"])
        assert r.status_code == 200, r.text
        data = r.json()
        # Required Batch #8 fields
        assert "week_leaderboard" in data, "missing week_leaderboard"
        assert "star_of_week" in data, "missing star_of_week"
        # Regression: existing fields
        for k in ("leaderboard", "streak", "totals", "badges"):
            assert k in data, f"missing {k}"

        wb = data["week_leaderboard"]
        assert isinstance(wb, list) and len(wb) >= 1
        # Sorted desc by points
        pts = [row["points"] for row in wb]
        assert pts == sorted(pts, reverse=True), f"week_leaderboard not sorted desc: {pts}"

        for row in wb:
            assert "member" in row and "points" in row
            assert "member_id" in row["member"]

        star = data["star_of_week"]
        # Fresh seed guarantees points>0 => star should not be None
        assert star is not None, "star_of_week should not be null for seeded family"
        assert star["points"] > 0
        assert star["points"] == wb[0]["points"]
        assert star["member"]["member_id"] == wb[0]["member"]["member_id"]

    def test_child_with_chores_appears_in_weekly(self, auth):
        r = requests.get(f"{API}/rewards", headers=auth["headers"])
        assert r.status_code == 200
        data = r.json()
        wb = data["week_leaderboard"]
        # Look for a child (Aarav in Sharma seed) with points > 0
        children_with_points = [
            row for row in wb
            if (row["member"].get("is_child") or row["member"].get("role") == "child") and row["points"] > 0
        ]
        assert len(children_with_points) >= 1, (
            f"expected at least one child with weekly points from chore completions. "
            f"week_leaderboard members = {[(r['member']['name'], r['member'].get('role'), r['points']) for r in wb]}"
        )


# ---------- /api/highlights/week ----------
class TestHighlightsWeek:
    def test_highlights_week_includes_star_and_counts(self, auth):
        r = requests.get(f"{API}/highlights/week", headers=auth["headers"])
        assert r.status_code == 200, r.text
        data = r.json()
        assert "star_of_week" in data
        assert "counts" in data
        for k in ("posts", "memories", "wishes", "loves"):
            assert k in data["counts"], f"missing counts.{k}"
            assert isinstance(data["counts"][k], int)
        assert "memories" in data
        assert isinstance(data["memories"], list)
        # star_of_week should have same shape as in /rewards
        if data["star_of_week"] is not None:
            assert "member" in data["star_of_week"]
            assert "points" in data["star_of_week"]

    def test_rewards_and_highlights_star_match(self, auth):
        r1 = requests.get(f"{API}/rewards", headers=auth["headers"]).json()
        r2 = requests.get(f"{API}/highlights/week", headers=auth["headers"]).json()
        s1, s2 = r1.get("star_of_week"), r2.get("star_of_week")
        if s1 is None:
            assert s2 is None
        else:
            assert s2 is not None
            assert s1["member"]["member_id"] == s2["member"]["member_id"]
            assert s1["points"] == s2["points"]


# ---------- /api/search ----------
class TestSearch:
    def test_search_priya(self, auth):
        r = requests.get(f"{API}/search", params={"q": "Priya"}, headers=auth["headers"])
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["query"] == "Priya"
        for k in ("members", "memories", "posts", "chats"):
            assert k in d and isinstance(d[k], list)
        # Expect at least one member match
        names = [m["name"] for m in d["members"]]
        assert any("priya" in n.lower() for n in names), f"expected Priya in members, got {names}"
        # Expect a direct chat named Priya
        chat_names = [c["display_name"] for c in d["chats"]]
        assert any("priya" in c.lower() for c in chat_names), f"expected Priya chat, got {chat_names}"

    def test_search_family(self, auth):
        r = requests.get(f"{API}/search", params={"q": "family"}, headers=auth["headers"])
        assert r.status_code == 200
        d = r.json()
        # Family Chat should be present
        chat_names = [c["display_name"] for c in d["chats"]]
        assert any("family chat" in c.lower() for c in chat_names), f"expected Family Chat, got {chat_names}"

    def test_search_case_insensitive(self, auth):
        r1 = requests.get(f"{API}/search", params={"q": "priya"}, headers=auth["headers"]).json()
        r2 = requests.get(f"{API}/search", params={"q": "PRIYA"}, headers=auth["headers"]).json()
        assert len(r1["members"]) == len(r2["members"])

    def test_search_blank_returns_empty(self, auth):
        r = requests.get(f"{API}/search", params={"q": "   "}, headers=auth["headers"])
        assert r.status_code == 200
        d = r.json()
        assert d["members"] == [] and d["memories"] == [] and d["posts"] == [] and d["chats"] == []

    def test_search_scoped_to_own_family(self, auth, second_family):
        # Get a member from account 1's family
        me1 = requests.get(f"{API}/auth/me", headers=auth["headers"]).json()
        fam1_members = requests.get(f"{API}/families/members", headers=auth["headers"]).json()
        # Pick a member name likely unique -- we can't guarantee no overlap since both are Sharma-seeded.
        # Instead, verify that member_ids returned by account 2 do NOT match account 1's ids.
        ids1 = {m["member_id"] for m in fam1_members}
        # Search 'Priya' from second family and check none of its member_ids appear in ids1
        r2 = requests.get(f"{API}/search", params={"q": "Priya"}, headers=second_family["headers"]).json()
        for m in r2["members"]:
            assert m["member_id"] not in ids1, "cross-family leakage detected!"

    def test_search_missing_q(self, auth):
        r = requests.get(f"{API}/search", headers=auth["headers"])
        # FastAPI Query is required (no default) -> 422
        assert r.status_code in (400, 422)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
