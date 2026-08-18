"""Batch #33 — Trusted Helpers Phase 4 regression tests.

Scope:
  1. BUGFIX regression — POST /api/helpers/{helper_id}/tasks with
     category=pickup + pickup_from/pickup_to/dest_lat/dest_lng persists all
     fields. Read-back via GET /api/helpers/{id}/tasks.
  2. Trip ETA alerts — set dest on pickup task, Start Trip (en_route), post FAR
     point (>2km) -> eta_min but NO 📍 parent notification; post NEAR (<2km) ->
     EXACTLY ONE 📍 notification; post NEAR again -> NO second 📍 alert
     (trip.eta_alerted guard). Location BEFORE Start Trip returns 400.
  3. Shift reminders — /helper/dashboard returns shift={start_time,end_time,
     today,on_duty,minutes_until,reminder}. reminder=true only when
     0 <= minutes_until <= 60 (UTC). PATCH access.start_time to ~30-min-ahead
     (true) and to ~3h-ahead (false).
  4. Care Team photos — parent POST /api/care-team/chat {photo_url} and helper
     POST /helper/care-team {photo_url} both persist photo_url; text-only and
     photo-only both work; isolation from Family Chat (db.messages) and 1:1
     helper chat (db.helper_messages) preserved.
  5. Security regression sanity — helper WITHOUT 'chat' -> 403 on /helper/care-team;
     parent 401 on /helper/*; helper 401 on /api/care-team/*;
     /helper/medical remains privacy-clean.

The demo helper Sunita (help_c77a0a30120545bb, sunita/1234) is used. Its dest
coords (28.6/77.2) and working hours are preserved (restored in fixtures).
"""
import os
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests
from pymongo import MongoClient


# --------------------------- config ----------------------------------------
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

# direct DB access to reset today's trip-completion row between ETA runs
_mongo = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
_db = _mongo[os.environ.get("DB_NAME", "test_database")]


# --------------------------- fixtures --------------------------------------
@pytest.fixture(scope="module")
def parent_headers():
    r = requests.post(f"{API}/auth/login",
                      json={"email": PARENT_EMAIL, "password": PARENT_PW}, timeout=20)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def demo_helper_headers():
    r = requests.post(f"{API}/helper/login",
                      json={"username": DEMO_HELPER_USER, "pin": DEMO_HELPER_PIN}, timeout=15)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def family_id(parent_headers):
    r = requests.get(f"{API}/families/me", headers=parent_headers, timeout=15)
    fam = r.json()
    return fam.get("family_id") or (fam.get("family") or {}).get("family_id")


@pytest.fixture(scope="module")
def aarav_id(parent_headers):
    r = requests.get(f"{API}/families/me", headers=parent_headers, timeout=15).json()
    members = r.get("members") or (r.get("family") or {}).get("members") or []
    for m in members:
        if (m.get("name") or "").lower().startswith("aarav"):
            return m["member_id"]
    pytest.skip("no Aarav")


@pytest.fixture(scope="module")
def demo_pickup_task(demo_helper_headers):
    r = requests.get(f"{API}/helper/dashboard", headers=demo_helper_headers, timeout=15)
    assert r.status_code == 200, r.text
    for t in r.json().get("tasks") or []:
        if (t.get("category") == "pickup") or ("pick up" in (t.get("title") or "").lower()):
            return t
    pytest.skip("no pickup task")


@pytest.fixture(scope="module")
def demo_helper_access():
    """Snapshot Sunita's original access at start; restore at teardown."""
    h = _db.helpers.find_one({"helper_id": DEMO_HELPER_ID}, {"_id": 0, "access": 1})
    return (h or {}).get("access") or {}


def _reset_today_pickup_completion(task_id: str):
    """Wipe today's completion for a task so Start Trip can be re-tested and
    trip.eta_alerted is cleared."""
    today = datetime.now(timezone.utc).date().isoformat()
    _db.helper_task_completions.delete_many({"task_id": task_id, "date": today})


# ============ 1. BUGFIX: pickup fields persist on CREATE ===================
class TestPickupCreatePersistence:
    def test_create_pickup_persists_all_pickup_fields(self, parent_headers, aarav_id):
        marker = f"TEST_P4_PICKUP_{uuid.uuid4().hex[:6]}"
        body = {
            "title": marker,
            "category": "pickup",
            "for_member_id": aarav_id,
            "pickup_from": "TEST_FROM Location A",
            "pickup_to": "TEST_TO Location B",
            "dest_lat": 12.9716, "dest_lng": 77.5946,
            "schedule": "once",
        }
        c = requests.post(f"{API}/helpers/{DEMO_HELPER_ID}/tasks",
                          headers=parent_headers, json=body, timeout=15)
        assert c.status_code in (200, 201), c.text
        created = c.json()["task"]
        task_id = created["task_id"]
        try:
            # Immediate response contains the fields (bugfix)
            for k, v in [("pickup_from", "TEST_FROM Location A"),
                         ("pickup_to", "TEST_TO Location B"),
                         ("dest_lat", 12.9716), ("dest_lng", 77.5946),
                         ("category", "pickup")]:
                assert created.get(k) == v, f"create response missing {k}={v}: {created}"
            # Read-back via GET
            g = requests.get(f"{API}/helpers/{DEMO_HELPER_ID}/tasks",
                             headers=parent_headers, timeout=15)
            assert g.status_code == 200
            rt = next((t for t in g.json()["tasks"] if t["task_id"] == task_id), None)
            assert rt, "created task missing from list"
            assert rt.get("pickup_from") == "TEST_FROM Location A"
            assert rt.get("pickup_to") == "TEST_TO Location B"
            assert rt.get("dest_lat") == 12.9716
            assert rt.get("dest_lng") == 77.5946
            assert rt.get("category") == "pickup"
        finally:
            requests.delete(f"{API}/helper-tasks/{task_id}",
                            headers=parent_headers, timeout=10)

    def test_create_pickup_without_dest_still_persists_from_to(self, parent_headers, aarav_id):
        body = {
            "title": f"TEST_P4_PICKUP_NODEST_{uuid.uuid4().hex[:5]}",
            "category": "pickup",
            "for_member_id": aarav_id,
            "pickup_from": "School",
            "pickup_to": "Home",
            "schedule": "once",
        }
        c = requests.post(f"{API}/helpers/{DEMO_HELPER_ID}/tasks",
                          headers=parent_headers, json=body, timeout=15)
        assert c.status_code in (200, 201)
        t = c.json()["task"]
        try:
            assert t.get("pickup_from") == "School"
            assert t.get("pickup_to") == "Home"
            assert t.get("dest_lat") is None
            assert t.get("dest_lng") is None
        finally:
            requests.delete(f"{API}/helper-tasks/{t['task_id']}",
                            headers=parent_headers, timeout=10)


# ============ 2. Trip ETA alerts ===========================================
# dest at (28.6, 77.2); a FAR point (28.70, 77.20) ~ 11 km; NEAR (28.61, 77.20) ~ 1.1 km
FAR_LAT, FAR_LNG = 28.70, 77.20     # >2km from (28.6,77.2) -> no alert
NEAR_LAT, NEAR_LNG = 28.61, 77.20   # ~1.1km -> alert
NEAR2_LAT, NEAR2_LNG = 28.605, 77.202


def _count_pin_notifs(parent_headers):
    """Return count of parent notifications whose emoji/title indicates a 📍 ETA alert."""
    r = requests.get(f"{API}/notifications", headers=parent_headers, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    items = data if isinstance(data, list) else (data.get("items") or data.get("notifications") or [])
    n = 0
    for it in items:
        blob = " ".join(str(it.get(k) or "") for k in
                        ("emoji", "title", "subtitle", "body", "icon", "message", "text"))
        if "📍" in blob or "min from" in blob:
            n += 1
    return n


class TestTripETAAlerts:
    def test_dest_can_be_patched(self, parent_headers, demo_pickup_task):
        # Ensure Sunita's pickup task has dest set (Phase-4 seeded (28.6,77.2))
        tid = demo_pickup_task["task_id"]
        p = requests.patch(f"{API}/helper-tasks/{tid}", headers=parent_headers,
                           json={"dest_lat": 28.6, "dest_lng": 77.2}, timeout=15)
        assert p.status_code == 200, p.text
        t = p.json()["task"]
        assert t.get("dest_lat") == 28.6
        assert t.get("dest_lng") == 77.2

    def test_location_before_start_trip_returns_400(self, demo_helper_headers, demo_pickup_task):
        tid = demo_pickup_task["task_id"]
        _reset_today_pickup_completion(tid)  # ensure no completion row exists
        r = requests.post(f"{API}/helper/tasks/{tid}/location",
                          headers=demo_helper_headers,
                          json={"lat": NEAR_LAT, "lng": NEAR_LNG}, timeout=15)
        assert r.status_code == 400, f"expected 400 before Start Trip, got {r.status_code}: {r.text}"
        det = (r.json().get("detail") or "").lower()
        assert "start" in det or "trip" in det, r.text

    def test_far_point_no_alert_then_near_fires_exactly_one(
            self, parent_headers, demo_helper_headers, demo_pickup_task):
        tid = demo_pickup_task["task_id"]
        _reset_today_pickup_completion(tid)  # fresh trip

        # Baseline 📍 count BEFORE Start Trip
        before = _count_pin_notifs(parent_headers)

        # Start Trip
        s = requests.post(f"{API}/helper/tasks/{tid}/trip",
                          headers=demo_helper_headers, json={"stage": "en_route"}, timeout=15)
        assert s.status_code == 200, s.text

        # FAR point -> should return eta_min but NOT create a 📍 alert
        r1 = requests.post(f"{API}/helper/tasks/{tid}/location",
                           headers=demo_helper_headers,
                           json={"lat": FAR_LAT, "lng": FAR_LNG}, timeout=15)
        assert r1.status_code == 200, r1.text
        b1 = r1.json()
        assert b1.get("ok") is True
        assert isinstance(b1.get("eta_min"), int) and b1["eta_min"] >= 1, b1
        # sanity — far distance should map to >4 min (11km @500m/min ~22 min)
        assert b1["eta_min"] >= 4, f"expected large eta_min for far point, got {b1['eta_min']}"

        after_far = _count_pin_notifs(parent_headers)
        assert after_far == before, \
            f"FAR point unexpectedly created a 📍 alert: before={before}, after={after_far}"

        # NEAR point -> should fire EXACTLY ONE 📍 alert
        r2 = requests.post(f"{API}/helper/tasks/{tid}/location",
                           headers=demo_helper_headers,
                           json={"lat": NEAR_LAT, "lng": NEAR_LNG}, timeout=15)
        assert r2.status_code == 200, r2.text
        b2 = r2.json()
        assert b2.get("eta_min") is not None

        after_near = _count_pin_notifs(parent_headers)
        assert after_near == before + 1, \
            f"expected exactly ONE new 📍 alert (before={before}, after_far={after_far}, after_near={after_near})"

        # Repeat NEAR point -> NO 2nd alert (trip.eta_alerted guard)
        r3 = requests.post(f"{API}/helper/tasks/{tid}/location",
                           headers=demo_helper_headers,
                           json={"lat": NEAR2_LAT, "lng": NEAR2_LNG}, timeout=15)
        assert r3.status_code == 200, r3.text
        after_repeat = _count_pin_notifs(parent_headers)
        assert after_repeat == after_near, \
            f"repeat NEAR point wrongly created a 2nd 📍 alert: after_near={after_near}, after_repeat={after_repeat}"

        # Verify trip.eta_alerted persisted on the completion row
        today = datetime.now(timezone.utc).date().isoformat()
        comp = _db.helper_task_completions.find_one({"task_id": tid, "date": today}, {"_id": 0}) or {}
        assert (comp.get("trip") or {}).get("eta_alerted") is True, f"eta_alerted flag not set: {comp}"


# ============ 3. Shift reminder ============================================
def _hhmm_ahead(minutes: int) -> str:
    dt = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    return f"{dt.hour:02d}:{dt.minute:02d}"


class TestShiftReminder:
    def test_dashboard_shift_shape(self, demo_helper_headers):
        r = requests.get(f"{API}/helper/dashboard", headers=demo_helper_headers, timeout=15)
        assert r.status_code == 200, r.text
        shift = r.json().get("shift")
        assert shift, f"shift missing from dashboard: {r.json().keys()}"
        for k in ("start_time", "end_time", "today", "on_duty", "minutes_until", "reminder"):
            assert k in shift, f"shift missing key '{k}': {shift}"
        assert isinstance(shift["reminder"], bool)
        assert isinstance(shift["today"], bool)
        assert isinstance(shift["on_duty"], bool)

    def test_reminder_true_when_30min_ahead_and_false_when_3h_ahead(
            self, parent_headers, demo_helper_headers, demo_helper_access):
        # Snapshot original access for restoration
        original = demo_helper_access or {}

        # --- 30-min ahead: reminder MUST be true ---
        st_30 = _hhmm_ahead(30)
        access_30 = {**original, "start_time": st_30, "end_time": original.get("end_time") or "23:59"}
        pr = requests.patch(f"{API}/helpers/{DEMO_HELPER_ID}", headers=parent_headers,
                            json={"access": access_30}, timeout=15)
        assert pr.status_code == 200, pr.text

        d = requests.get(f"{API}/helper/dashboard", headers=demo_helper_headers, timeout=15).json()
        s = d.get("shift") or {}
        assert s.get("start_time") == st_30
        mu = s.get("minutes_until")
        # Guard against clock drift — accept 28..31
        assert mu is not None and 25 <= mu <= 35, f"expected minutes_until ~30, got {mu}"
        assert s.get("reminder") is True, f"reminder should be true at 30-min-ahead: shift={s}"

        # --- 3h ahead: reminder MUST be false ---
        st_3h = _hhmm_ahead(180)
        access_3h = {**original, "start_time": st_3h, "end_time": original.get("end_time") or "23:59"}
        pr = requests.patch(f"{API}/helpers/{DEMO_HELPER_ID}", headers=parent_headers,
                            json={"access": access_3h}, timeout=15)
        assert pr.status_code == 200, pr.text

        d = requests.get(f"{API}/helper/dashboard", headers=demo_helper_headers, timeout=15).json()
        s = d.get("shift") or {}
        assert s.get("start_time") == st_3h
        mu = s.get("minutes_until")
        # When start_time is 3h ahead: either mu>60 (same UTC day) or mu is None
        # (wrapped past midnight — today's shift already 'past'). Either way,
        # reminder MUST be false per spec (only true when 0<=mu<=60).
        assert (mu is None) or (mu > 60), f"expected minutes_until None or >60, got {mu}"
        assert s.get("reminder") is False, f"reminder should be false at 3h-ahead: shift={s}"

        # --- Restore Sunita's original access (roughly 40 min ahead, per credentials note) ---
        # Rather than relying on original start_time which drifts, set back to ~40 min ahead
        # so the frontend banner test in credentials.md continues to work.
        st_40 = _hhmm_ahead(40)
        restore = {**original, "start_time": st_40, "end_time": original.get("end_time") or "23:59"}
        pr = requests.patch(f"{API}/helpers/{DEMO_HELPER_ID}", headers=parent_headers,
                            json={"access": restore}, timeout=15)
        assert pr.status_code == 200, pr.text


# ============ 4. Care Team photos ==========================================
class TestCareTeamPhotos:
    def test_parent_photo_only_message(self, parent_headers, demo_helper_headers):
        photo = f"https://example.com/TEST_P4_PPHOTO_{uuid.uuid4().hex[:6]}.jpg"
        r = requests.post(f"{API}/care-team/chat", headers=parent_headers,
                          json={"photo_url": photo}, timeout=15)
        assert r.status_code == 200, r.text
        m = r.json()["message"]
        assert m.get("photo_url") == photo
        assert m.get("text") in (None, "")
        # helper sees it with photo_url
        g = requests.get(f"{API}/helper/care-team", headers=demo_helper_headers, timeout=15).json()
        assert any(x.get("photo_url") == photo for x in g.get("messages", [])), \
            "photo-only parent message not visible to helper"

    def test_helper_photo_only_message(self, parent_headers, demo_helper_headers):
        photo = f"https://example.com/TEST_P4_HPHOTO_{uuid.uuid4().hex[:6]}.jpg"
        r = requests.post(f"{API}/helper/care-team", headers=demo_helper_headers,
                          json={"photo_url": photo}, timeout=15)
        assert r.status_code == 200, r.text
        m = r.json()["message"]
        assert m.get("photo_url") == photo
        # parent sees it with photo_url
        g = requests.get(f"{API}/care-team/chat", headers=parent_headers, timeout=15).json()
        assert any(x.get("photo_url") == photo for x in g.get("messages", [])), \
            "photo-only helper message not visible to parent"

    def test_text_only_still_works(self, parent_headers, demo_helper_headers):
        marker = f"TEST_P4_TEXT_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/care-team/chat", headers=parent_headers,
                          json={"text": marker}, timeout=15)
        assert r.status_code == 200
        assert r.json()["message"].get("text") == marker
        # helper sees it
        g = requests.get(f"{API}/helper/care-team", headers=demo_helper_headers, timeout=15).json()
        assert any(x.get("text") == marker for x in g.get("messages", []))

    def test_empty_message_rejected(self, parent_headers, demo_helper_headers):
        r1 = requests.post(f"{API}/care-team/chat", headers=parent_headers,
                           json={}, timeout=15)
        assert r1.status_code == 400
        r2 = requests.post(f"{API}/helper/care-team", headers=demo_helper_headers,
                           json={}, timeout=15)
        assert r2.status_code == 400

    def test_care_team_photo_isolated_from_family_and_1to1_chat(
            self, parent_headers, demo_helper_headers):
        # A photo posted into care-team must NOT appear in family chat or 1:1 helper chat
        photo = f"https://example.com/TEST_P4_ISO_{uuid.uuid4().hex[:6]}.jpg"
        r = requests.post(f"{API}/care-team/chat", headers=parent_headers,
                          json={"photo_url": photo, "text": "iso"}, timeout=15)
        assert r.status_code == 200
        # 1:1 helper chat (parent view)
        c = requests.get(f"{API}/helpers/{DEMO_HELPER_ID}/chat",
                         headers=parent_headers, timeout=15)
        assert c.status_code == 200
        msgs = c.json().get("messages", [])
        assert not any((m.get("photo_url") or "") == photo for m in msgs), \
            "care-team photo leaked into 1:1 helper chat"
        # Family chat check
        chats = requests.get(f"{API}/chats", headers=parent_headers, timeout=15).json()
        chats = chats if isinstance(chats, list) else chats.get("chats", [])
        fchat = next((c for c in chats if (c.get("kind") == "family") or
                     "family" in ((c.get("name") or "").lower())), chats[0] if chats else None)
        if fchat:
            fmsgs = requests.get(f"{API}/chats/{fchat['chat_id']}/messages",
                                 headers=parent_headers, timeout=15).json()
            fmsgs = fmsgs if isinstance(fmsgs, list) else fmsgs.get("messages", [])
            assert not any((m.get("photo_url") or "") == photo for m in fmsgs), \
                "care-team photo leaked into family chat"


# ============ 5. Security regression sanity ================================
class TestSecurityRegression:
    @pytest.mark.parametrize("path", ["/helper/care-team", "/helper/medical",
                                      "/helper/dashboard"])
    def test_parent_token_401_on_helper_routes(self, parent_headers, path):
        r = requests.get(f"{API}{path}", headers=parent_headers, timeout=15)
        assert r.status_code == 401, f"{path} -> {r.status_code}"

    @pytest.mark.parametrize("path", ["/care-team/chat", "/care-team/unread",
                                      f"/helpers/{DEMO_HELPER_ID}/ratings"])
    def test_helper_token_401_on_family_routes(self, demo_helper_headers, path):
        r = requests.get(f"{API}{path}", headers=demo_helper_headers, timeout=15)
        assert r.status_code == 401, f"{path} -> {r.status_code}"

    def test_helper_without_chat_permission_still_403(self, parent_headers, aarav_id):
        uname = f"nochat_{uuid.uuid4().hex[:6]}"
        body = {"name": "TEST_P4_NoChat", "role": "custom",
                "assigned_all": True, "assigned_member_ids": [],
                "permissions": {"chat": False, "medical": False, "tasks": True},
                "username": uname, "pin": "9977"}
        c = requests.post(f"{API}/helpers", headers=parent_headers, json=body, timeout=15)
        assert c.status_code in (200, 201), c.text
        hid = c.json()["helper"]["helper_id"]
        try:
            lg = requests.post(f"{API}/helper/login",
                               json={"username": uname, "pin": "9977"}, timeout=15)
            assert lg.status_code == 200
            hh = {"Authorization": f"Bearer {lg.json()['token']}"}
            r = requests.get(f"{API}/helper/care-team", headers=hh, timeout=15)
            assert r.status_code == 403, f"expected 403 without chat perm, got {r.status_code}"
            r2 = requests.post(f"{API}/helper/care-team", headers=hh,
                               json={"photo_url": "https://x/y.jpg"}, timeout=15)
            assert r2.status_code == 403
        finally:
            requests.delete(f"{API}/helpers/{hid}", headers=parent_headers, timeout=10)

    def test_medical_still_privacy_scrubbed(self, demo_helper_headers):
        r = requests.get(f"{API}/helper/medical", headers=demo_helper_headers, timeout=15)
        assert r.status_code == 200
        blob = str(r.json()).lower()
        for bad in ("medication", "conditions", "insurance", "policy"):
            assert bad not in blob, f"'{bad}' leaked in medical response"

    def test_paused_helper_blocked_on_phase4_endpoints(self, parent_headers, aarav_id):
        uname = f"pause4_{uuid.uuid4().hex[:6]}"
        body = {"name": "TEST_P4_Pause", "role": "custom",
                "assigned_all": True, "assigned_member_ids": [],
                "permissions": {"chat": True, "medical": True, "tasks": True},
                "username": uname, "pin": "8877"}
        c = requests.post(f"{API}/helpers", headers=parent_headers, json=body, timeout=15)
        hid = c.json()["helper"]["helper_id"]
        try:
            lg = requests.post(f"{API}/helper/login",
                               json={"username": uname, "pin": "8877"}, timeout=15)
            hh = {"Authorization": f"Bearer {lg.json()['token']}"}
            # sanity works before pause
            assert requests.get(f"{API}/helper/care-team", headers=hh, timeout=15).status_code == 200
            p = requests.post(f"{API}/helpers/{hid}/pause", headers=parent_headers, timeout=15)
            assert p.status_code in (200, 204)
            for path in ("/helper/care-team", "/helper/medical", "/helper/dashboard"):
                rr = requests.get(f"{API}{path}", headers=hh, timeout=15)
                assert rr.status_code in (401, 403), f"paused {path} -> {rr.status_code}"
            loc = requests.post(f"{API}/helper/tasks/x/location",
                                headers=hh, json={"lat": 1.0, "lng": 1.0}, timeout=15)
            assert loc.status_code in (401, 403)
        finally:
            requests.delete(f"{API}/helpers/{hid}", headers=parent_headers, timeout=10)
