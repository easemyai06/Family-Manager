"""Batch #35 — Home tasks_done_today / chore done_by + Helper in-portal notifications.

Coverage (matches the review request):
  BACKEND 1) /api/home
     - `tasks` still returns the OPEN family task list (regression for the
       helpers-loop `tasks` shadowing bug).
     - `tasks_done_today[]` is present; items have title/scope/done_by (member
       card with member_id + name)/done_at + done=True.
     - kids[].chores[] items carry `done_by` (None until completed; a member
       card after completion).
     - POST /todos/items/{id}/toggle records done_by_member_id + done_at when
       marking done and CLEARS them on un-toggle. The completed item then
       appears in /api/home.tasks_done_today with the correct done_by.
     - POST /chores/{id}/complete records completed_by_member_id and surfaces
       as kids[].chores[].done_by; /chores/{id}/uncomplete clears it.

  BACKEND 2) Helper in-portal notifications
     - GET /api/helper/notifications returns {items[], unread, last_read};
       items include 1:1 parent chat, care-team messages from OTHERS, parent
       handovers and family ratings/praise, sorted newest-first, each with
       emoji/title/subtitle/route/created_at.
     - POST /api/helper/notifications/read stamps read time -> subsequent GET
       returns unread=0.
     - GET /api/helper/dashboard now includes notif_unread.
     - SECURITY: the feed contains NO db.messages (family chat) rows —
       validated by seeding a family-chat message and verifying it does NOT
       appear.
     - A helper WITHOUT chat perm still gets handover/rating items but NO
       chat/care-team items.

Uses parent storytester@fam.com / secret123 and demo helper sunita / 1234.
"""
import os
import uuid
from datetime import datetime, timezone

import pytest
import requests
from pymongo import MongoClient


def _load_backend_url():
    for k in ("EXPO_PUBLIC_BACKEND_URL", "EXPO_BACKEND_URL"):
        v = os.environ.get(k)
        if v:
            return v
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


BASE_URL = _load_backend_url().rstrip("/")
API = f"{BASE_URL}/api"

PARENT_EMAIL = "storytester@fam.com"
PARENT_PW = "secret123"
DEMO_HELPER_ID = "help_c77a0a30120545bb"
DEMO_HELPER_USER = "sunita"
DEMO_HELPER_PIN = "1234"

_mongo = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
_db = _mongo[os.environ.get("DB_NAME", "test_database")]


# --------------------------- fixtures --------------------------------------
@pytest.fixture(scope="module")
def parent_headers():
    r = requests.post(f"{API}/auth/login",
                      json={"email": PARENT_EMAIL, "password": PARENT_PW}, timeout=20)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}",
            "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def parent_me(parent_headers):
    return requests.get(f"{API}/auth/me", headers=parent_headers, timeout=15).json()


@pytest.fixture(scope="module")
def family_meta(parent_headers):
    r = requests.get(f"{API}/families/me", headers=parent_headers, timeout=15).json()
    fid = r.get("family_id") or (r.get("family") or {}).get("family_id")
    members = r.get("members") or (r.get("family") or {}).get("members") or []
    return {"family_id": fid, "members": members}


@pytest.fixture(scope="module")
def helper_headers():
    r = requests.post(f"{API}/helper/login",
                      json={"username": DEMO_HELPER_USER, "pin": DEMO_HELPER_PIN}, timeout=15)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}",
            "Content-Type": "application/json"}


def _find_list(parent_headers, name_hint="family"):
    r = requests.get(f"{API}/todos/lists", headers=parent_headers, timeout=15).json()
    lists = r if isinstance(r, list) else (r.get("lists") or [])
    if not lists:
        # create one
        c = requests.post(f"{API}/todos/lists", headers=parent_headers,
                          json={"name": f"TEST_B35_LIST_{uuid.uuid4().hex[:5]}"}, timeout=15)
        assert c.status_code in (200, 201), c.text
        return (c.json().get("list") or c.json())["list_id"]
    return lists[0]["list_id"]


# ============ 1. HOME tasks_done_today & regression =======================
class TestHomeTasksDone:
    def test_home_tasks_open_regression(self, parent_headers):
        r = requests.get(f"{API}/home", headers=parent_headers, timeout=20)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "tasks" in j, f"/home missing 'tasks': keys={list(j.keys())}"
        assert isinstance(j["tasks"], list), \
            "'tasks' must be a list — shadowing bug regressed?"
        # every open task must have done=False
        for t in j["tasks"]:
            assert t.get("done") is False, f"open task marked done: {t}"
        assert "tasks_done_today" in j, "tasks_done_today missing"
        assert isinstance(j["tasks_done_today"], list)

    def test_toggle_records_done_by_and_appears_in_tasks_done_today(
            self, parent_headers, family_meta, parent_me):
        list_id = _find_list(parent_headers)
        # create a fresh open task
        title = f"TEST_B35_TASK_{uuid.uuid4().hex[:6]}"
        c = requests.post(f"{API}/todos/lists/{list_id}/items", headers=parent_headers,
                          json={"title": title, "priority": "normal"}, timeout=15)
        assert c.status_code in (200, 201), c.text
        item = c.json().get("item") or c.json()
        iid = item["item_id"]

        # figure out my member_id from families/me
        my_uid = parent_me.get("user_id") or parent_me.get("id")
        my_member_id = None
        for m in family_meta["members"]:
            if m.get("user_id") == my_uid or (m.get("name") or "").lower().startswith("raj"):
                my_member_id = m.get("member_id")
                break

        # toggle -> done
        tg = requests.post(f"{API}/todos/items/{iid}/toggle",
                           headers=parent_headers, timeout=15)
        assert tg.status_code == 200, tg.text
        tj = tg.json()
        assert tj.get("done") is True
        assert tj.get("done_at"), f"done_at missing: {tj}"
        assert tj.get("done_by_member_id"), f"done_by_member_id missing: {tj}"
        if my_member_id:
            assert tj["done_by_member_id"] == my_member_id, \
                f"done_by wrong: {tj.get('done_by_member_id')} vs {my_member_id}"

        # /home should surface it in tasks_done_today with done_by member card
        h = requests.get(f"{API}/home", headers=parent_headers, timeout=20).json()
        row = next((x for x in h.get("tasks_done_today", []) if x.get("item_id") == iid), None)
        assert row, "just-completed task not in /home.tasks_done_today"
        assert row.get("done") is True
        assert row.get("title") == title
        assert row.get("scope") in ("mine", "kids", "family")
        assert row.get("done_by"), "done_by member card missing on tasks_done_today row"
        assert row["done_by"].get("member_id")
        assert row["done_by"].get("name")
        assert row.get("done_at")

        # OPEN list should NOT contain it anymore
        assert not any(x.get("item_id") == iid for x in h.get("tasks", [])), \
            "completed task leaked into open tasks list"

        # un-toggle -> done_by/done_at cleared
        tg2 = requests.post(f"{API}/todos/items/{iid}/toggle",
                            headers=parent_headers, timeout=15)
        assert tg2.status_code == 200
        tj2 = tg2.json()
        assert tj2.get("done") is False
        assert not tj2.get("done_at")
        assert not tj2.get("done_by_member_id")

        # /home should now show it back in OPEN list and NOT in done_today
        h2 = requests.get(f"{API}/home", headers=parent_headers, timeout=20).json()
        assert any(x.get("item_id") == iid for x in h2.get("tasks", [])), \
            "un-toggled task not back in open list"
        assert not any(x.get("item_id") == iid for x in h2.get("tasks_done_today", [])), \
            "un-toggled task still in tasks_done_today"

        # cleanup
        requests.delete(f"{API}/todos/items/{iid}", headers=parent_headers, timeout=10)


# ============ 2. KIDS' CHORES done_by ======================================
class TestChoreDoneBy:
    def test_chore_complete_records_done_by_and_home_shows_it(
            self, parent_headers, family_meta, parent_me):
        # find or create a chore for a child
        child = next((m for m in family_meta["members"]
                      if m.get("is_child") or m.get("role") == "child"), None)
        if not child:
            pytest.skip("no child member in demo family")
        child_id = child["member_id"]
        # look for an existing chore for this child
        h_before = requests.get(f"{API}/home", headers=parent_headers, timeout=20).json()
        kid_row = next((k for k in h_before.get("kids", [])
                        if (k.get("member") or {}).get("member_id") == child_id), None)
        if not kid_row or not kid_row.get("chores"):
            pytest.skip("no seeded chores for the child; skipping chore done_by test")

        # pick a chore that is currently NOT done today (uncomplete first if needed)
        chore = kid_row["chores"][0]
        cid = chore["chore_id"]
        if chore.get("done_today"):
            requests.post(f"{API}/chores/{cid}/uncomplete",
                          headers=parent_headers, timeout=15)

        # sanity: before complete, done_by should be None
        h_pre = requests.get(f"{API}/home", headers=parent_headers, timeout=20).json()
        kid_pre = next((k for k in h_pre.get("kids", [])
                        if (k.get("member") or {}).get("member_id") == child_id), None)
        chore_pre = next((c for c in kid_pre["chores"] if c["chore_id"] == cid), None)
        assert chore_pre is not None
        assert chore_pre.get("done_today") is False
        assert chore_pre.get("done_by") in (None, {}), \
            f"done_by should be None before complete: {chore_pre.get('done_by')}"

        # complete as parent
        r = requests.post(f"{API}/chores/{cid}/complete",
                          headers=parent_headers, timeout=15)
        assert r.status_code == 200, r.text

        # my member_id
        my_uid = parent_me.get("user_id") or parent_me.get("id")
        my_member_id = None
        for m in family_meta["members"]:
            if m.get("user_id") == my_uid or (m.get("name") or "").lower().startswith("raj"):
                my_member_id = m.get("member_id")
                break

        h_post = requests.get(f"{API}/home", headers=parent_headers, timeout=20).json()
        kid_post = next((k for k in h_post.get("kids", [])
                         if (k.get("member") or {}).get("member_id") == child_id), None)
        chore_post = next((c for c in kid_post["chores"] if c["chore_id"] == cid), None)
        assert chore_post.get("done_today") is True
        assert chore_post.get("done_by"), "done_by missing after complete"
        assert chore_post["done_by"].get("member_id")
        assert chore_post["done_by"].get("name")
        if my_member_id:
            assert chore_post["done_by"]["member_id"] == my_member_id, \
                f"done_by should be acting user: {chore_post['done_by']} vs {my_member_id}"

        # uncomplete clears done_by
        requests.post(f"{API}/chores/{cid}/uncomplete",
                      headers=parent_headers, timeout=15)
        h_undo = requests.get(f"{API}/home", headers=parent_headers, timeout=20).json()
        kid_undo = next((k for k in h_undo.get("kids", [])
                         if (k.get("member") or {}).get("member_id") == child_id), None)
        chore_undo = next((c for c in kid_undo["chores"] if c["chore_id"] == cid), None)
        assert chore_undo.get("done_today") is False
        assert chore_undo.get("done_by") in (None, {}), \
            f"done_by should be None after uncomplete: {chore_undo.get('done_by')}"


# ============ 3. HELPER IN-PORTAL NOTIFICATIONS ============================
class TestHelperNotifications:
    def test_dashboard_exposes_notif_unread(self, helper_headers):
        r = requests.get(f"{API}/helper/dashboard", headers=helper_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "notif_unread" in d, f"dashboard missing notif_unread: keys={list(d.keys())}"
        assert isinstance(d["notif_unread"], int)

    def test_feed_shape_and_ordering(self, parent_headers, helper_headers):
        # Post fresh items so we always have something to see
        # 1) parent 1:1 chat
        txt_chat = f"TEST_B35_CHAT_{uuid.uuid4().hex[:5]}"
        c1 = requests.post(f"{API}/helpers/{DEMO_HELPER_ID}/chat",
                           headers=parent_headers, json={"text": txt_chat}, timeout=15)
        assert c1.status_code == 200, c1.text
        # 2) care-team message from parent
        txt_ct = f"TEST_B35_CT_{uuid.uuid4().hex[:5]}"
        c2 = requests.post(f"{API}/care-team/chat", headers=parent_headers,
                           json={"text": txt_ct}, timeout=15)
        assert c2.status_code == 200
        # 3) parent handover note
        txt_hn = f"TEST_B35_HANDOVER_{uuid.uuid4().hex[:5]}"
        c3 = requests.post(f"{API}/helpers/{DEMO_HELPER_ID}/handover",
                           headers=parent_headers, json={"text": txt_hn}, timeout=15)
        # handover endpoint may be /helper-handover or scoped — try both
        if c3.status_code >= 400:
            c3b = requests.post(f"{API}/helpers/{DEMO_HELPER_ID}/handovers",
                                headers=parent_headers, json={"text": txt_hn}, timeout=15)
            assert c3b.status_code in (200, 201), c3b.text

        # GET feed
        r = requests.get(f"{API}/helper/notifications",
                         headers=helper_headers, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "items" in j and "unread" in j and "last_read" in j, \
            f"feed shape wrong: keys={list(j.keys())}"
        items = j["items"]
        assert isinstance(items, list) and items, "feed empty"
        # newest-first ordering
        cas = [x.get("created_at") or "" for x in items]
        assert cas == sorted(cas, reverse=True), "feed not sorted newest-first"
        # every item has required fields
        for it in items:
            assert it.get("emoji"), f"item missing emoji: {it}"
            assert it.get("title"), f"item missing title: {it}"
            assert "route" in it, f"item missing route: {it}"
            assert it.get("created_at"), f"item missing created_at: {it}"
        # unread >= 1 (we just added items)
        assert j["unread"] >= 1, f"unread should be >=1: {j['unread']}"
        # our chat + care-team + handover items are present
        titles_subs = " | ".join((it.get("title") or "") + " " + (it.get("subtitle") or "")
                                 for it in items)
        assert txt_chat in titles_subs, "1:1 chat message missing from feed"
        assert txt_ct in titles_subs, "care-team message missing from feed"
        assert txt_hn in titles_subs, "handover note missing from feed"

    def test_read_zeros_unread(self, helper_headers):
        r = requests.post(f"{API}/helper/notifications/read",
                          headers=helper_headers, timeout=15)
        assert r.status_code == 200
        g = requests.get(f"{API}/helper/notifications",
                         headers=helper_headers, timeout=15).json()
        assert g["unread"] == 0, f"unread not cleared after /read: {g['unread']}"
        # dashboard reflects it too
        d = requests.get(f"{API}/helper/dashboard",
                         headers=helper_headers, timeout=15).json()
        assert d["notif_unread"] == 0, f"dashboard notif_unread not cleared: {d['notif_unread']}"

    def test_feed_excludes_family_chat_db_messages(self, parent_headers, helper_headers,
                                                    family_meta):
        """SECURITY: db.messages (Family Chat) content must NEVER appear."""
        fid = family_meta["family_id"]
        marker = f"TEST_B35_FAMCHAT_{uuid.uuid4().hex[:6]}"
        _db.messages.insert_one({
            "message_id": f"TEST_B35_MSG_{uuid.uuid4().hex[:6]}",
            "family_id": fid,
            "chat_id": f"TEST_B35_CHAT_{uuid.uuid4().hex[:6]}",
            "sender_id": "parent",
            "text": marker,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        try:
            r = requests.get(f"{API}/helper/notifications",
                             headers=helper_headers, timeout=15).json()
            blob = " ".join((it.get("subtitle") or "") + " " + (it.get("title") or "")
                            for it in r["items"])
            assert marker not in blob, \
                "SECURITY LEAK: family chat text appeared in helper notifications"
        finally:
            _db.messages.delete_many({"message_id": {"$regex": r"^TEST_B35_MSG_"}})

    def test_helper_without_chat_perm_gets_no_chat_or_care_team(self, parent_headers):
        """A helper WITHOUT chat permission still gets handover/rating rows
        but NO chat/care-team rows."""
        uname = f"nochat35_{uuid.uuid4().hex[:6]}"
        body = {"name": "TEST_B35_NoChat", "role": "custom",
                "assigned_all": True, "assigned_member_ids": [],
                "permissions": {"chat": False, "medical": False, "tasks": True},
                "username": uname, "pin": "5566"}
        c = requests.post(f"{API}/helpers", headers=parent_headers, json=body, timeout=15)
        assert c.status_code in (200, 201), c.text
        hid = c.json()["helper"]["helper_id"]
        try:
            # seed a handover for this helper
            hn = f"TEST_B35_NCHANDOVER_{uuid.uuid4().hex[:5]}"
            posted = False
            for path in (f"/helpers/{hid}/handover", f"/helpers/{hid}/handovers"):
                pr = requests.post(f"{API}{path}", headers=parent_headers,
                                   json={"text": hn}, timeout=15)
                if pr.status_code in (200, 201):
                    posted = True
                    break
            # login as this helper
            lg = requests.post(f"{API}/helper/login",
                               json={"username": uname, "pin": "5566"}, timeout=15).json()
            hh = {"Authorization": f"Bearer {lg['token']}", "Content-Type": "application/json"}
            r = requests.get(f"{API}/helper/notifications",
                             headers=hh, timeout=15)
            assert r.status_code == 200, r.text
            items = r.json()["items"]
            # No chat or care_team kinds
            kinds = {it.get("kind") for it in items}
            assert "chat" not in kinds, f"chat leaked to no-chat helper: {kinds}"
            assert "care_team" not in kinds, f"care_team leaked to no-chat helper: {kinds}"
            if posted:
                # handover row should be present
                assert any(it.get("kind") == "handover" for it in items), \
                    "handover missing for no-chat helper"
        finally:
            requests.delete(f"{API}/helpers/{hid}", headers=parent_headers, timeout=10)
