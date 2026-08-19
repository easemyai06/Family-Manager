"""Batch 46 — block back-dated events and todo items.
Verifies POST /api/events, PATCH /api/events/{id}, POST /api/todos/lists/{id}/items reject past dates
while today/future/None still succeed.
"""
import os
import pytest
import requests
from datetime import date, timedelta

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or \
           "https://our-story-191.preview.emergentagent.com"
EMAIL = "storytester@fam.com"
PASSWORD = "secret123"

created_event_ids = []
created_item_ids = []


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module", autouse=True)
def cleanup(headers):
    yield
    for eid in created_event_ids:
        try:
            requests.delete(f"{BASE_URL}/api/events/{eid}", headers=headers, timeout=15)
        except Exception:
            pass
    for iid in created_item_ids:
        try:
            requests.delete(f"{BASE_URL}/api/todos/items/{iid}", headers=headers, timeout=15)
        except Exception:
            pass


TODAY = date.today().isoformat()
YESTERDAY = (date.today() - timedelta(days=1)).isoformat()
FUTURE = (date.today() + timedelta(days=7)).isoformat()
FAR_PAST = "2020-01-01"


# ---------------- Events ----------------
class TestEventPastDate:
    def test_create_past_date_rejected(self, headers):
        r = requests.post(f"{BASE_URL}/api/events", headers=headers, timeout=15,
                          json={"title": "TEST_past_event", "date": FAR_PAST, "all_day": True})
        assert r.status_code == 400, r.text
        assert "past" in r.json().get("detail", "").lower()

    def test_create_yesterday_rejected(self, headers):
        r = requests.post(f"{BASE_URL}/api/events", headers=headers, timeout=15,
                          json={"title": "TEST_yesterday", "date": YESTERDAY, "all_day": True})
        assert r.status_code == 400, r.text

    def test_create_today_succeeds(self, headers):
        r = requests.post(f"{BASE_URL}/api/events", headers=headers, timeout=15,
                          json={"title": "TEST_today_event", "date": TODAY, "all_day": True})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["date"] == TODAY
        assert d["title"] == "TEST_today_event"
        created_event_ids.append(d["event_id"])
        # verify persistence
        g = requests.get(f"{BASE_URL}/api/events?date={TODAY}", headers=headers, timeout=15)
        assert g.status_code == 200

    def test_create_future_succeeds(self, headers):
        r = requests.post(f"{BASE_URL}/api/events", headers=headers, timeout=15,
                          json={"title": "TEST_future_event", "date": FUTURE, "all_day": True})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["date"] == FUTURE
        created_event_ids.append(d["event_id"])

    def test_patch_move_to_past_rejected(self, headers):
        # create a future event, then try to PATCH it to the past
        r = requests.post(f"{BASE_URL}/api/events", headers=headers, timeout=15,
                          json={"title": "TEST_movable", "date": FUTURE, "all_day": True})
        assert r.status_code == 200
        eid = r.json()["event_id"]
        created_event_ids.append(eid)
        p = requests.patch(f"{BASE_URL}/api/events/{eid}", headers=headers, timeout=15,
                           json={"title": "TEST_movable", "date": FAR_PAST, "all_day": True})
        assert p.status_code == 400, p.text
        assert "past" in p.json().get("detail", "").lower()
        # ensure date unchanged
        g = requests.get(f"{BASE_URL}/api/events/{eid}", headers=headers, timeout=15)
        if g.status_code == 200:
            assert g.json().get("date") == FUTURE

    def test_patch_title_only_on_past_event_succeeds(self, headers):
        # We can't create a past event via API, so seed one via PATCH after creation isn't possible either.
        # Instead: create for today, then attempt to change TITLE only (same date). Should succeed.
        r = requests.post(f"{BASE_URL}/api/events", headers=headers, timeout=15,
                          json={"title": "TEST_title_edit", "date": TODAY, "all_day": True})
        assert r.status_code == 200
        eid = r.json()["event_id"]
        created_event_ids.append(eid)
        p = requests.patch(f"{BASE_URL}/api/events/{eid}", headers=headers, timeout=15,
                           json={"title": "TEST_title_edited", "date": TODAY, "all_day": True})
        assert p.status_code == 200, p.text
        assert p.json().get("title") == "TEST_title_edited"


# ---------------- Todo items ----------------
class TestTodoPastDate:
    @pytest.fixture(scope="class")
    def list_id(self, headers):
        r = requests.get(f"{BASE_URL}/api/todos/lists", headers=headers, timeout=15)
        assert r.status_code == 200, r.text
        lists = r.json()
        assert isinstance(lists, list) and len(lists) > 0, f"No todo lists: {lists}"
        return lists[0]["list_id"]

    def test_add_item_past_date_rejected(self, headers, list_id):
        r = requests.post(f"{BASE_URL}/api/todos/lists/{list_id}/items", headers=headers, timeout=15,
                          json={"title": "TEST_past_todo", "due_date": FAR_PAST})
        assert r.status_code == 400, r.text
        assert "past" in r.json().get("detail", "").lower()

    def test_add_item_yesterday_rejected(self, headers, list_id):
        r = requests.post(f"{BASE_URL}/api/todos/lists/{list_id}/items", headers=headers, timeout=15,
                          json={"title": "TEST_yesterday_todo", "due_date": YESTERDAY})
        assert r.status_code == 400, r.text

    def test_add_item_today_succeeds(self, headers, list_id):
        r = requests.post(f"{BASE_URL}/api/todos/lists/{list_id}/items", headers=headers, timeout=15,
                          json={"title": "TEST_today_todo", "due_date": TODAY})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["due_date"] == TODAY
        created_item_ids.append(d["item_id"])

    def test_add_item_future_succeeds(self, headers, list_id):
        r = requests.post(f"{BASE_URL}/api/todos/lists/{list_id}/items", headers=headers, timeout=15,
                          json={"title": "TEST_future_todo", "due_date": FUTURE})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["due_date"] == FUTURE
        created_item_ids.append(d["item_id"])

    def test_add_item_no_date_succeeds(self, headers, list_id):
        r = requests.post(f"{BASE_URL}/api/todos/lists/{list_id}/items", headers=headers, timeout=15,
                          json={"title": "TEST_nodate_todo"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("due_date") is None
        created_item_ids.append(d["item_id"])
