"""FamilyHome backend regression tests.

Covers: auth, seed/demo onboarding, home dashboard, feed/posts/comments/reactions,
affection, calendar, chores, shopping, todos, family/members, invite, media serve.
"""
import io
import os
import uuid
import pytest
import requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"
PRIMARY_EMAIL = "testdad@fam.com"
PRIMARY_PASSWORD = "secret123"


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def s():
    return requests.Session()


def _auth(session, token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def primary(s):
    # login the seeded primary user (Raj / Sharma family)
    r = s.post(f"{BASE}/auth/login", json={"email": PRIMARY_EMAIL, "password": PRIMARY_PASSWORD})
    assert r.status_code == 200, f"primary login failed: {r.status_code} {r.text}"
    data = r.json()
    return {"token": data["token"], "user": data["user"]}


@pytest.fixture(scope="session")
def fresh_user(s):
    email = f"TEST_fresh_{uuid.uuid4().hex[:8]}@fam.com"
    r = s.post(f"{BASE}/auth/register", json={"name": "TEST Fresh", "email": email, "password": "secret123"})
    assert r.status_code == 200, r.text
    return r.json()


# ---------- auth ----------
class TestAuth:
    def test_register_returns_token_and_user(self, fresh_user):
        assert fresh_user["token"]
        assert fresh_user["user"]["email"].startswith("test_fresh_")
        assert fresh_user["user"]["family_id"] in (None,)

    def test_login_success(self, primary):
        assert primary["token"]
        assert primary["user"]["email"] == PRIMARY_EMAIL

    def test_login_invalid_returns_401(self, s):
        r = s.post(f"{BASE}/auth/login", json={"email": PRIMARY_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_register_duplicate_returns_400(self, s):
        r = s.post(f"{BASE}/auth/register", json={"name": "x", "email": PRIMARY_EMAIL, "password": "secret123"})
        assert r.status_code == 400

    def test_me_returns_user_and_member(self, s, primary):
        r = s.get(f"{BASE}/auth/me", headers=_auth(s, primary["token"]))
        assert r.status_code == 200
        j = r.json()
        assert j["user"]["email"] == PRIMARY_EMAIL
        assert j["member"] is not None
        assert j["member"]["name"] == "Raj"

    def test_me_no_token_returns_401(self, s):
        r = s.get(f"{BASE}/auth/me")
        assert r.status_code == 401


# ---------- onboarding / seed demo ----------
class TestOnboarding:
    def test_new_user_no_family(self, s, fresh_user):
        r = s.get(f"{BASE}/auth/me", headers=_auth(s, fresh_user["token"]))
        assert r.status_code == 200
        assert r.json()["user"]["family_id"] is None

    def test_home_without_family_returns_400(self, s, fresh_user):
        r = s.get(f"{BASE}/home", headers=_auth(s, fresh_user["token"]))
        assert r.status_code == 400

    def test_seed_demo_creates_family(self, s):
        email = f"TEST_seed_{uuid.uuid4().hex[:8]}@fam.com"
        reg = s.post(f"{BASE}/auth/register", json={"name": "TEST Seed", "email": email, "password": "secret123"}).json()
        h = _auth(s, reg["token"])
        r = s.post(f"{BASE}/seed/demo", headers=h)
        assert r.status_code == 200, r.text
        assert r.json()["family"]["name"] == "The Sharma Family"
        # /home should now return dashboard
        home = s.get(f"{BASE}/home", headers=h).json()
        assert home["family"]["name"] == "The Sharma Family"
        # seed links the logged-in user to the hardcoded "Raj (Dad)" member
        assert home["me"]["name"] == "Raj"
        assert len(home["members"]) == 5
        assert home["unseen_affection"] >= 1  # unseen affection from Priya
        # birthday banner (Aarav in ~4 days)
        assert any(b["days"] <= 5 for b in home["upcoming_birthdays"])

    def test_create_family(self, s):
        email = f"TEST_cf_{uuid.uuid4().hex[:8]}@fam.com"
        reg = s.post(f"{BASE}/auth/register", json={"name": "TEST CF", "email": email, "password": "secret123"}).json()
        h = _auth(s, reg["token"])
        r = s.post(f"{BASE}/families", json={"name": "TEST_Family_A"}, headers=h)
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Family_A"
        # cannot create again
        r2 = s.post(f"{BASE}/families", json={"name": "another"}, headers=h)
        assert r2.status_code == 400

    def test_join_family_invalid_code(self, s):
        email = f"TEST_jf_{uuid.uuid4().hex[:8]}@fam.com"
        reg = s.post(f"{BASE}/auth/register", json={"name": "TEST JF", "email": email, "password": "secret123"}).json()
        h = _auth(s, reg["token"])
        r = s.post(f"{BASE}/families/join", json={"code": "NOPE1234"}, headers=h)
        assert r.status_code == 404


# ---------- home ----------
class TestHome:
    def test_home_dashboard_shape(self, s, primary):
        r = s.get(f"{BASE}/home", headers=_auth(s, primary["token"]))
        assert r.status_code == 200
        j = r.json()
        for key in ["family", "me", "members", "events_today", "pending_chores",
                    "upcoming_birthdays", "unseen_affection", "recent_posts", "shopping_pending"]:
            assert key in j, f"missing {key}"
        assert j["me"]["name"] == "Raj"
        assert j["recent_posts"] >= 5
        assert j["shopping_pending"] >= 1


# ---------- posts / feed ----------
class TestFeed:
    def test_list_posts_hydrated(self, s, primary):
        r = s.get(f"{BASE}/posts", headers=_auth(s, primary["token"]))
        assert r.status_code == 200
        posts = r.json()
        assert len(posts) >= 5
        p = posts[0]
        assert p["author"]["name"]
        assert "reaction_summary" in p
        assert "comment_count" in p
        assert "my_reaction" in p

    def test_react_and_unreact_toggle(self, s, primary):
        h = _auth(s, primary["token"])
        posts = s.get(f"{BASE}/posts", headers=h).json()
        pid = posts[0]["post_id"]
        r = s.post(f"{BASE}/posts/{pid}/react", json={"type": "love"}, headers=h)
        assert r.status_code == 200
        assert r.json()["my_reaction"] == "love"
        # switch reaction
        r2 = s.post(f"{BASE}/posts/{pid}/react", json={"type": "kiss"}, headers=h)
        assert r2.json()["my_reaction"] == "kiss"
        # unreact
        r3 = s.delete(f"{BASE}/posts/{pid}/react", headers=h)
        assert r3.json()["my_reaction"] is None

    def test_comment_flow(self, s, primary):
        h = _auth(s, primary["token"])
        posts = s.get(f"{BASE}/posts", headers=h).json()
        pid = posts[0]["post_id"]
        r = s.post(f"{BASE}/posts/{pid}/comments", json={"text": "TEST_comment"}, headers=h)
        assert r.status_code == 200
        assert r.json()["text"] == "TEST_comment"
        r2 = s.get(f"{BASE}/posts/{pid}/comments", headers=h)
        assert any(c["text"] == "TEST_comment" for c in r2.json())

    def test_create_and_delete_post(self, s, primary):
        h = _auth(s, primary["token"])
        r = s.post(f"{BASE}/posts", json={"caption": "TEST_post", "media": [], "category": "test"}, headers=h)
        assert r.status_code == 200
        pid = r.json()["post_id"]
        r2 = s.get(f"{BASE}/posts/{pid}", headers=h)
        assert r2.status_code == 200
        assert r2.json()["caption"] == "TEST_post"
        r3 = s.delete(f"{BASE}/posts/{pid}", headers=h)
        assert r3.status_code == 200
        r4 = s.get(f"{BASE}/posts/{pid}", headers=h)
        assert r4.status_code == 404


# ---------- affection ----------
class TestAffection:
    def test_inbox_has_unseen(self, s, primary):
        r = s.get(f"{BASE}/affection/inbox", headers=_auth(s, primary["token"]))
        assert r.status_code == 200
        j = r.json()
        assert isinstance(j.get("unseen"), list)
        assert isinstance(j.get("recent"), list)

    def test_send_affection_to_family(self, s, primary):
        h = _auth(s, primary["token"])
        r = s.post(f"{BASE}/affection", json={"type": "hug", "message": "TEST_hug"}, headers=h)
        assert r.status_code == 200
        assert r.json()["is_family"] is True
        assert r.json()["sent"] >= 1

    def test_send_affection_to_member(self, s, primary):
        h = _auth(s, primary["token"])
        fam = s.get(f"{BASE}/families/me", headers=h).json()
        target = next(m for m in fam["members"] if m["name"] == "Priya")["member_id"]
        r = s.post(f"{BASE}/affection", json={"to_member_id": target, "type": "kiss"}, headers=h)
        assert r.status_code == 200
        assert r.json()["is_family"] is False
        assert r.json()["sent"] == 1

    def test_mark_seen_and_timeline(self, s, primary):
        h = _auth(s, primary["token"])
        inbox = s.get(f"{BASE}/affection/inbox", headers=h).json()
        if inbox["unseen"]:
            aid = inbox["unseen"][0]["affection_id"]
            r = s.post(f"{BASE}/affection/{aid}/seen", headers=h)
            assert r.status_code == 200
        r2 = s.get(f"{BASE}/affection/timeline", headers=h)
        assert r2.status_code == 200
        assert "week" in r2.json()


# ---------- calendar ----------
class TestCalendar:
    def test_list_events(self, s, primary):
        r = s.get(f"{BASE}/events", headers=_auth(s, primary["token"]))
        assert r.status_code == 200
        events = r.json()
        assert len(events) >= 1
        assert "participants" in events[0]

    def test_create_and_delete_event(self, s, primary):
        h = _auth(s, primary["token"])
        fam = s.get(f"{BASE}/families/me", headers=h).json()
        owner = fam["members"][0]["member_id"]
        payload = {
            "title": "TEST_event", "date": "2026-06-15", "start_time": "10:00", "end_time": "11:00",
            "owner_member_id": owner, "participant_ids": [owner], "category": "family",
        }
        r = s.post(f"{BASE}/events", json=payload, headers=h)
        assert r.status_code == 200
        eid = r.json()["event_id"]
        assert r.json()["color"]  # inherited from owner
        r2 = s.delete(f"{BASE}/events/{eid}", headers=h)
        assert r2.status_code == 200


# ---------- chores ----------
class TestChores:
    def test_list_chores(self, s, primary):
        r = s.get(f"{BASE}/chores", headers=_auth(s, primary["token"]))
        assert r.status_code == 200
        chores = r.json()
        assert len(chores) >= 1
        assert "done_today" in chores[0]
        assert "owner" in chores[0]

    def test_complete_uncomplete_and_stars(self, s, primary):
        h = _auth(s, primary["token"])
        chores = s.get(f"{BASE}/chores", headers=h).json()
        pending = next((c for c in chores if not c["done_today"]), None)
        assert pending is not None
        cid = pending["chore_id"]
        r = s.post(f"{BASE}/chores/{cid}/complete", headers=h)
        assert r.status_code == 200
        again = next(c for c in s.get(f"{BASE}/chores", headers=h).json() if c["chore_id"] == cid)
        assert again["done_today"] is True
        r2 = s.post(f"{BASE}/chores/{cid}/uncomplete", headers=h)
        assert r2.status_code == 200
        # stars
        r3 = s.get(f"{BASE}/chores/stars", headers=h)
        assert r3.status_code == 200
        assert isinstance(r3.json(), list)

    def test_create_and_delete_chore(self, s, primary):
        h = _auth(s, primary["token"])
        fam = s.get(f"{BASE}/families/me", headers=h).json()
        owner = fam["members"][0]["member_id"]
        r = s.post(f"{BASE}/chores", json={"title": "TEST_chore", "owner_member_id": owner, "stars": 2}, headers=h)
        assert r.status_code == 200
        cid = r.json()["chore_id"]
        r2 = s.delete(f"{BASE}/chores/{cid}", headers=h)
        assert r2.status_code == 200


# ---------- shopping ----------
class TestShopping:
    def test_shopping_full_flow(self, s, primary):
        h = _auth(s, primary["token"])
        lists = s.get(f"{BASE}/shopping/lists", headers=h).json()
        assert len(lists) >= 1
        assert "total" in lists[0] and "done" in lists[0]

        r = s.post(f"{BASE}/shopping/lists", json={"name": "TEST_list", "category": "TEST"}, headers=h)
        assert r.status_code == 200
        lid = r.json()["list_id"]

        r2 = s.post(f"{BASE}/shopping/lists/{lid}/items", json={"name": "TEST_item", "quantity": "1"}, headers=h)
        assert r2.status_code == 200
        iid = r2.json()["item_id"]
        assert r2.json()["checked"] is False

        r3 = s.post(f"{BASE}/shopping/items/{iid}/toggle", headers=h)
        assert r3.json()["checked"] is True

        r4 = s.delete(f"{BASE}/shopping/items/{iid}", headers=h)
        assert r4.status_code == 200
        r5 = s.delete(f"{BASE}/shopping/lists/{lid}", headers=h)
        assert r5.status_code == 200


# ---------- todos ----------
class TestTodos:
    def test_todo_full_flow(self, s, primary):
        h = _auth(s, primary["token"])
        lists = s.get(f"{BASE}/todos/lists", headers=h).json()
        assert len(lists) >= 1

        r = s.post(f"{BASE}/todos/lists", json={"name": "TEST_todo_list"}, headers=h)
        lid = r.json()["list_id"]

        fam = s.get(f"{BASE}/families/me", headers=h).json()
        assignee = fam["members"][0]["member_id"]
        r2 = s.post(f"{BASE}/todos/lists/{lid}/items",
                    json={"title": "TEST_task", "priority": "high", "assignee_member_id": assignee}, headers=h)
        assert r2.status_code == 200
        iid = r2.json()["item_id"]
        assert r2.json()["assignee"]["member_id"] == assignee

        r3 = s.post(f"{BASE}/todos/items/{iid}/toggle", headers=h)
        assert r3.json()["done"] is True

        s.delete(f"{BASE}/todos/items/{iid}", headers=h)
        s.delete(f"{BASE}/todos/lists/{lid}", headers=h)


# ---------- family & members ----------
class TestFamily:
    def test_families_me(self, s, primary):
        r = s.get(f"{BASE}/families/me", headers=_auth(s, primary["token"]))
        assert r.status_code == 200
        j = r.json()
        assert j["family"]["name"] == "The Sharma Family"
        assert len(j["members"]) == 5

    def test_member_detail(self, s, primary):
        h = _auth(s, primary["token"])
        fam = s.get(f"{BASE}/families/me", headers=h).json()
        aarav = next(m for m in fam["members"] if m["name"] == "Aarav")
        r = s.get(f"{BASE}/families/members/{aarav['member_id']}", headers=h)
        assert r.status_code == 200
        j = r.json()
        assert j["member"]["name"] == "Aarav"
        assert "posts" in j
        assert "stars" in j

    def test_invite_code(self, s, primary):
        r = s.get(f"{BASE}/families/invite", headers=_auth(s, primary["token"]))
        assert r.status_code == 200
        j = r.json()
        assert len(j["invite_code"]) >= 6
        assert j["family_name"] == "The Sharma Family"

    def test_add_member(self, s, primary):
        h = _auth(s, primary["token"])
        r = s.post(f"{BASE}/families/members",
                   json={"name": "TEST_Uncle", "relationship": "Uncle", "role": "adult"}, headers=h)
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Uncle"


# ---------- media upload / serve ----------
class TestMedia:
    def test_upload_and_serve(self, s, primary):
        h = _auth(s, primary["token"])
        # 1x1 png bytes
        png = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
               b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xcf\xc0"
               b"\x00\x00\x00\x03\x00\x01\x5b\xd6\xc5\xd5\x00\x00\x00\x00IEND\xaeB`\x82")
        files = {"file": ("test.png", io.BytesIO(png), "image/png")}
        data = {"kind": "image"}
        r = s.post(f"{BASE}/upload", files=files, data=data, headers=h)
        if r.status_code == 502:
            pytest.skip("object storage unreachable in preview env")
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["url"].startswith("/api/files/")
        assert j["path"]
        # serve requires auth via token qs
        url = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + j["url"] + f"?token={primary['token']}"
        r2 = s.get(url)
        assert r2.status_code == 200
        assert len(r2.content) > 0
