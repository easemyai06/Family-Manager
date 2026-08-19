"""Batch #36 — Task Nudge + Helper notification focus URL.

Coverage:
  BACKEND Task Nudge — POST /api/todos/items/{id}/nudge
    * parent nudges OPEN task with assignee -> {nudged:1, name:<assignee>}
      + inserts a '⏰ Reminder from ...' message into db.messages family chat.
    * task with NO assignee -> {nudged:0, name:'the family'} still posts to chat.
    * 400 when task is already done.
    * 404 when item_id unknown.
    * 403 when a non-parent (child persona) tries to nudge a task that isn't
      theirs.

  BACKEND Helper notif focus route — GET /api/helper/notifications
    * chat & care_team items carry `message_id` AND their `route` ends with
      `?focus=<message_id>`; non-message items keep their plain routes.
    * SECURITY: family chat (db.messages) rows STILL don't leak into the feed.
"""
import os
import uuid

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


def _find_or_create_list(parent_headers):
    r = requests.get(f"{API}/todos/lists", headers=parent_headers, timeout=15).json()
    lists = r if isinstance(r, list) else (r.get("lists") or [])
    if lists:
        return lists[0]["list_id"]
    c = requests.post(f"{API}/todos/lists", headers=parent_headers,
                      json={"name": f"TEST_B36_LIST_{uuid.uuid4().hex[:5]}"}, timeout=15)
    assert c.status_code in (200, 201), c.text
    return (c.json().get("list") or c.json())["list_id"]


def _pick_assignee(members):
    # prefer a non-parent adult (e.g., Priya). Otherwise any child.
    for m in members:
        if (m.get("name") or "").lower().startswith("priya"):
            return m
    for m in members:
        if m.get("role") in ("parent", "adult") and not (m.get("name") or "").lower().startswith("raj"):
            return m
    for m in members:
        if m.get("role") == "child" or m.get("is_child"):
            return m
    return members[0] if members else None


def _pick_child_member(members):
    for m in members:
        if m.get("role") == "child" or m.get("is_child"):
            return m
    return None


# ================ 1. TASK NUDGE ============================================
class TestTaskNudge:
    def test_nudge_open_task_with_assignee(self, parent_headers, family_meta):
        list_id = _find_or_create_list(parent_headers)
        assignee = _pick_assignee(family_meta["members"])
        assert assignee, "no member to assign task to"

        title = f"TEST_B36_TASK_{uuid.uuid4().hex[:6]}"
        c = requests.post(f"{API}/todos/lists/{list_id}/items", headers=parent_headers,
                          json={"title": title, "priority": "normal",
                                "assignee_member_id": assignee["member_id"]}, timeout=15)
        assert c.status_code in (200, 201), c.text
        iid = (c.json().get("item") or c.json())["item_id"]

        r = requests.post(f"{API}/todos/items/{iid}/nudge",
                          headers=parent_headers, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("nudged") == 1, f"expected nudged=1, got {j}"
        assert j.get("name") == assignee["name"], \
            f"name mismatch: {j.get('name')} vs {assignee['name']}"

        # verify a '⏰ Reminder from ...' message was inserted into db.messages
        # (family chat) for this family.
        fam_chat = _db.chats.find_one({"family_id": family_meta["family_id"], "type": "family"})
        assert fam_chat, "family chat not found"
        msg = _db.messages.find_one(
            {"chat_id": fam_chat["chat_id"], "text": {"$regex": r"^⏰ Reminder from .+" + title[:20]}},
            sort=[("created_at", -1)])
        assert msg, f"reminder message not found in family chat for task {title}"
        assert title in msg["text"], f"reminder text missing task title: {msg['text']}"
        assert assignee["name"] in msg["text"], "reminder text missing assignee name"

        # cleanup
        requests.delete(f"{API}/todos/items/{iid}", headers=parent_headers, timeout=10)

    def test_nudge_task_without_assignee_posts_to_family(self, parent_headers, family_meta):
        list_id = _find_or_create_list(parent_headers)
        title = f"TEST_B36_UNASSIGNED_{uuid.uuid4().hex[:6]}"
        c = requests.post(f"{API}/todos/lists/{list_id}/items", headers=parent_headers,
                          json={"title": title, "priority": "normal"}, timeout=15)
        assert c.status_code in (200, 201), c.text
        iid = (c.json().get("item") or c.json())["item_id"]

        r = requests.post(f"{API}/todos/items/{iid}/nudge",
                          headers=parent_headers, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("nudged") == 0, f"expected nudged=0 for unassigned, got {j}"
        assert j.get("name") == "the family", f"name should be 'the family', got {j.get('name')}"

        # still posts to family chat
        fam_chat = _db.chats.find_one({"family_id": family_meta["family_id"], "type": "family"})
        msg = _db.messages.find_one(
            {"chat_id": fam_chat["chat_id"], "text": {"$regex": title}},
            sort=[("created_at", -1)])
        assert msg, "reminder message for unassigned task not posted to family chat"

        requests.delete(f"{API}/todos/items/{iid}", headers=parent_headers, timeout=10)

    def test_nudge_done_task_returns_400(self, parent_headers):
        list_id = _find_or_create_list(parent_headers)
        title = f"TEST_B36_DONE_{uuid.uuid4().hex[:6]}"
        c = requests.post(f"{API}/todos/lists/{list_id}/items", headers=parent_headers,
                          json={"title": title, "priority": "normal"}, timeout=15)
        iid = (c.json().get("item") or c.json())["item_id"]
        # toggle -> done
        tg = requests.post(f"{API}/todos/items/{iid}/toggle",
                           headers=parent_headers, timeout=15)
        assert tg.status_code == 200 and tg.json().get("done") is True

        r = requests.post(f"{API}/todos/items/{iid}/nudge",
                          headers=parent_headers, timeout=15)
        assert r.status_code == 400, f"expected 400 for done task, got {r.status_code}: {r.text}"

        requests.delete(f"{API}/todos/items/{iid}", headers=parent_headers, timeout=10)

    def test_nudge_unknown_item_returns_404(self, parent_headers):
        r = requests.post(f"{API}/todos/items/does_not_exist_zzz/nudge",
                          headers=parent_headers, timeout=15)
        assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text}"

    def test_child_cannot_nudge_other_persons_task(self, parent_headers, family_meta):
        """A non-parent (child) shouldn't be able to nudge a task assigned to someone else -> 403."""
        # pick a child with a linked_user_id if available. If no such child, skip.
        child = _pick_child_member(family_meta["members"])
        if not child or not child.get("linked_user_id"):
            pytest.skip("no linked child account available for 403 test")

        # find the child's login. Sharma demo children usually don't have passwords;
        # try common demo pattern first, else fall back to switch-persona if backend supports it.
        # Try to fetch a child login token via /api/personas/switch (if exists) — otherwise skip.
        r = requests.post(f"{API}/personas/switch",
                          headers=parent_headers,
                          json={"member_id": child["member_id"]}, timeout=10)
        if r.status_code != 200 or "token" not in (r.json() or {}):
            pytest.skip("no persona switch endpoint / child login not exposed for 403 test")
        child_headers = {"Authorization": f"Bearer {r.json()['token']}",
                         "Content-Type": "application/json"}

        # create a task assigned to a DIFFERENT member (e.g. Priya or Raj)
        list_id = _find_or_create_list(parent_headers)
        other = None
        for m in family_meta["members"]:
            if m["member_id"] != child["member_id"] and m.get("role") in ("parent", "admin", "adult"):
                other = m; break
        assert other, "no other member for 403 test"
        title = f"TEST_B36_403_{uuid.uuid4().hex[:6]}"
        c = requests.post(f"{API}/todos/lists/{list_id}/items", headers=parent_headers,
                          json={"title": title, "priority": "normal",
                                "assignee_member_id": other["member_id"]}, timeout=15)
        iid = (c.json().get("item") or c.json())["item_id"]

        rn = requests.post(f"{API}/todos/items/{iid}/nudge",
                           headers=child_headers, timeout=15)
        assert rn.status_code == 403, f"expected 403 for child nudging other's task, got {rn.status_code}: {rn.text}"

        requests.delete(f"{API}/todos/items/{iid}", headers=parent_headers, timeout=10)


# ================ 2. HELPER NOTIF FOCUS ROUTE ==============================
class TestHelperNotifFocus:
    def test_chat_and_care_team_items_carry_focus_message_id(
            self, parent_headers, helper_headers, family_meta):
        # seed one 1:1 helper chat message from parent + one care-team message
        # so the feed has at least one of each kind.
        helper_id = "help_c77a0a30120545bb"
        # 1:1 helper chat
        c1 = requests.post(
            f"{API}/helpers/{helper_id}/chat", headers=parent_headers,
            json={"text": f"TEST_B36_CHAT_{uuid.uuid4().hex[:6]}"}, timeout=15)
        assert c1.status_code in (200, 201), c1.text
        # care team chat
        c2 = requests.post(
            f"{API}/care-team/chat", headers=parent_headers,
            json={"text": f"TEST_B36_CT_{uuid.uuid4().hex[:6]}"}, timeout=15)
        assert c2.status_code in (200, 201), c2.text

        r = requests.get(f"{API}/helper/notifications",
                         headers=helper_headers, timeout=15)
        assert r.status_code == 200, r.text
        items = r.json().get("items") or []
        assert items, "helper notifications feed unexpectedly empty"

        chat_items = [it for it in items if it.get("kind") == "chat"]
        ct_items = [it for it in items if it.get("kind") == "care_team"]
        assert chat_items, "no chat items in helper notifications"
        assert ct_items, "no care_team items in helper notifications"

        for it in chat_items:
            mid = it.get("message_id")
            assert mid, f"chat item missing message_id: {it}"
            route = it.get("route") or ""
            assert route.endswith(f"?focus={mid}"), \
                f"chat route must end with ?focus=<message_id>. got: {route}"
            assert route.startswith("/helper-portal/chat"), \
                f"chat route prefix wrong: {route}"

        for it in ct_items:
            mid = it.get("message_id")
            assert mid, f"care_team item missing message_id: {it}"
            route = it.get("route") or ""
            assert route.endswith(f"?focus={mid}"), \
                f"care_team route must end with ?focus=<message_id>. got: {route}"
            assert route.startswith("/helper-portal/care-team"), \
                f"care_team route prefix wrong: {route}"

        # non-message kinds (handover / rating) — routes remain plain (no focus)
        for it in items:
            if it.get("kind") in ("handover", "rating"):
                route = it.get("route") or ""
                assert "focus=" not in route, \
                    f"{it.get('kind')} route should NOT carry focus= : {route}"

    def test_family_chat_still_isolated_from_feed(
            self, parent_headers, helper_headers, family_meta):
        """SECURITY regression: db.messages (family chat) content must never
        surface in the helper notifications feed."""
        # inject a probe message directly into db.messages for the family chat.
        fam_chat = _db.chats.find_one({"family_id": family_meta["family_id"], "type": "family"})
        assert fam_chat, "family chat not found"
        marker = f"TEST_B36_FAMCHAT_PROBE_{uuid.uuid4().hex[:8]}"
        mid = f"msg_{uuid.uuid4().hex[:12]}"
        _db.messages.insert_one({
            "message_id": mid, "chat_id": fam_chat["chat_id"],
            "family_id": family_meta["family_id"],
            "sender_member_id": "probe",
            "text": marker, "media": [], "type": "text",
            "created_at": "2099-12-31T23:59:59+00:00",
        })
        try:
            r = requests.get(f"{API}/helper/notifications",
                             headers=helper_headers, timeout=15)
            assert r.status_code == 200
            items = r.json().get("items") or []
            leaked = [it for it in items
                      if marker in (it.get("subtitle") or "")
                      or marker in (it.get("title") or "")
                      or it.get("message_id") == mid]
            assert not leaked, \
                f"family chat db.messages content LEAKED into helper feed: {leaked}"
        finally:
            _db.messages.delete_one({"message_id": mid})
