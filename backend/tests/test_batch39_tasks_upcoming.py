"""Batch #39 — Calendar Task view backend tests.

Covers:
- GET /api/tasks/upcoming requires auth (401 without token)
- Returns {tasks:[...], can_manage:bool} with expected shape
- Tasks are family-scoped (no cross-family leak, uses login family)
- Sorted by due_date; undated tasks are handled
- POST /todos/items/{id}/toggle marks a task done and it disappears from /tasks/upcoming
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or \
           os.environ.get("EXPO_BACKEND_URL", "").rstrip("/")

CRED = {"email": "storytester@fam.com", "password": "secret123"}


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=CRED, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("token")
    assert tok, "no token returned"
    return tok


@pytest.fixture(scope="module")
def auth(token):
    return {"Authorization": f"Bearer {token}"}


# --- auth guard --------------------------------------------------------------
class TestAuthGuard:
    def test_upcoming_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/tasks/upcoming", timeout=15)
        assert r.status_code in (401, 403), f"expected 401/403 without token, got {r.status_code}"


# --- shape & content ---------------------------------------------------------
class TestUpcomingShape:
    def test_returns_tasks_and_can_manage(self, auth):
        r = requests.get(f"{BASE_URL}/api/tasks/upcoming", headers=auth, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "tasks" in body and isinstance(body["tasks"], list), body
        assert "can_manage" in body and isinstance(body["can_manage"], bool), body
        # storytester is family admin -> can_manage True
        assert body["can_manage"] is True

    def test_task_item_fields(self, auth):
        r = requests.get(f"{BASE_URL}/api/tasks/upcoming", headers=auth, timeout=20)
        body = r.json()
        tasks = body["tasks"]
        assert len(tasks) > 0, "expected seeded open to-dos (Family Tasks / Vacation Packing)"
        required = {"item_id", "title", "priority", "due_date", "days_until_due",
                    "overdue", "assignee", "scope", "list_name"}
        for t in tasks:
            missing = required - set(t.keys())
            assert not missing, f"task missing keys {missing}: {t}"
            # scope must be one of these
            assert t["scope"] in ("mine", "kids", "family"), t
            # assignee is either None or a member card dict with member_id
            if t["assignee"] is not None:
                assert isinstance(t["assignee"], dict)
                assert "member_id" in t["assignee"], t["assignee"]
            # overdue must be bool
            assert isinstance(t["overdue"], bool)

    def test_sorted_by_due_date_undated_last_ok(self, auth):
        """Backend sorts by due_date ascending. Undated (null) tasks may appear anywhere
        in mongo's sort order but the frontend groups them as 'No date' — we simply
        assert that dated tasks form a non-decreasing sequence when considered together."""
        r = requests.get(f"{BASE_URL}/api/tasks/upcoming", headers=auth, timeout=20)
        tasks = r.json()["tasks"]
        dated = [t["due_date"] for t in tasks if t.get("due_date")]
        assert dated == sorted(dated), f"due_date not ascending: {dated}"

    def test_family_scoped_no_id_leak(self, auth):
        """Every task should belong to the caller's family. We cannot check family_id
        directly (endpoint doesn't expose it), but any mongodb _id leak would be a bug."""
        r = requests.get(f"{BASE_URL}/api/tasks/upcoming", headers=auth, timeout=20)
        body = r.json()
        assert "_id" not in body
        for t in body["tasks"]:
            assert "_id" not in t
            if t["assignee"]:
                assert "_id" not in t["assignee"]


# --- toggle removes task from upcoming ---------------------------------------
class TestToggleRemovesTask:
    def test_toggle_open_task_removes_from_upcoming(self, auth):
        # 1. get current open tasks
        r = requests.get(f"{BASE_URL}/api/tasks/upcoming", headers=auth, timeout=20)
        assert r.status_code == 200
        tasks_before = r.json()["tasks"]
        assert tasks_before, "need at least one open task to test toggle"

        target = tasks_before[0]
        item_id = target["item_id"]

        # 2. toggle done
        r = requests.post(f"{BASE_URL}/api/todos/items/{item_id}/toggle",
                          headers=auth, timeout=15)
        assert r.status_code == 200, r.text
        toggled = r.json()
        assert toggled.get("done") is True, toggled

        try:
            # 3. GET /tasks/upcoming — item_id must no longer appear
            r = requests.get(f"{BASE_URL}/api/tasks/upcoming", headers=auth, timeout=20)
            assert r.status_code == 200
            tasks_after = r.json()["tasks"]
            ids_after = {t["item_id"] for t in tasks_after}
            assert item_id not in ids_after, \
                f"toggled task {item_id} still returned by /tasks/upcoming"
        finally:
            # 4. cleanup — toggle back to open so demo data is intact
            r2 = requests.post(f"{BASE_URL}/api/todos/items/{item_id}/toggle",
                               headers=auth, timeout=15)
            assert r2.status_code == 200, r2.text
            assert r2.json().get("done") is False

            # verify it comes back
            r3 = requests.get(f"{BASE_URL}/api/tasks/upcoming", headers=auth, timeout=20)
            ids_restored = {t["item_id"] for t in r3.json()["tasks"]}
            assert item_id in ids_restored, "cleanup failed: task not restored to open"
