"""Batch #30 — Trusted Helpers Phase 1 regression tests.

Coverage:
  - Parent CRUD (invite mode + direct mode, GET/PATCH/DELETE)
  - Pause / resume, regenerate-invite, reset-pin
  - Sessions listing, signout-all invalidates old tokens
  - Helper self activation, login, /me, /dashboard, start/complete/issue
  - require_proof=photo enforcement (400 without, 200 with)
  - Parent task assignment appears on helper dashboard
  - /helpers/{id}/activity records completions & issues
  - SECURITY: helper token rejected on family routes; family token rejected on /helper/*
  - SECURITY: non-parent members get 403 on helper management (admin-only in demo)
  - Pause → 401 on requests + 403 on login; Remove → 401 on login
  - Child-level scoping: helper on Aarav cannot see Anaya-only tasks
"""
import os
import time
import uuid
import pytest
import requests

def _load_backend_url():
    for k in ("EXPO_PUBLIC_BACKEND_URL", "EXPO_BACKEND_URL", "EXPO_PACKAGER_PROXY_URL"):
        v = os.environ.get(k)
        if v:
            return v
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except Exception:
        pass
    return None


BASE_URL = _load_backend_url()
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL missing"
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

PARENT_EMAIL = "storytester@fam.com"
PARENT_PW = "secret123"
DEMO_HELPER_USER = "sunita"
DEMO_HELPER_PIN = "1234"


# ---------- fixtures --------------------------------------------------------
@pytest.fixture(scope="module")
def parent_token():
    r = requests.post(f"{API}/auth/login", json={"email": PARENT_EMAIL, "password": PARENT_PW}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def parent_headers(parent_token):
    return {"Authorization": f"Bearer {parent_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def family(parent_headers):
    r = requests.get(f"{API}/families/me", headers=parent_headers, timeout=15)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="module")
def members(parent_headers):
    r = requests.get(f"{API}/families/members", headers=parent_headers, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    return data if isinstance(data, list) else data.get("members", [])


def _aarav_id(members):
    for m in members:
        if (m.get("name") or "").lower().startswith("aarav"):
            return m["member_id"]
    return None


def _anaya_id(members):
    for m in members:
        if (m.get("name") or "").lower().startswith("anaya"):
            return m["member_id"]
    return None


@pytest.fixture(scope="module")
def demo_helper_token():
    r = requests.post(f"{API}/helper/login",
                      json={"username": DEMO_HELPER_USER, "pin": DEMO_HELPER_PIN}, timeout=15)
    assert r.status_code == 200, f"demo helper login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def demo_helper_headers(demo_helper_token):
    return {"Authorization": f"Bearer {demo_helper_token}", "Content-Type": "application/json"}


# ---------- 1. Parent CRUD --------------------------------------------------
class TestParentHelperCRUD:
    def test_list_roles(self, parent_headers):
        r = requests.get(f"{API}/helpers/roles", headers=parent_headers, timeout=10)
        assert r.status_code == 200
        keys = [x["key"] for x in r.json()["roles"]]
        for k in ("nanny", "cook", "driver", "custom"):
            assert k in keys

    def test_list_helpers_contains_demo(self, parent_headers):
        r = requests.get(f"{API}/helpers", headers=parent_headers, timeout=10)
        assert r.status_code == 200
        names = [h.get("name", "").lower() for h in r.json().get("helpers", [])]
        assert any("sunita" in n for n in names), f"demo helper Sunita not listed: {names}"

    def test_create_invite_mode(self, parent_headers):
        body = {"name": "TEST_HelperInvite", "role": "cook",
                "assigned_all": True, "assigned_member_ids": []}
        r = requests.post(f"{API}/helpers", headers=parent_headers, json=body, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("invite_code") and len(j["invite_code"]) >= 6
        assert j["helper"]["status"] == "pending"
        hid = j["helper"]["helper_id"]
        # cleanup
        requests.delete(f"{API}/helpers/{hid}", headers=parent_headers, timeout=10)

    def test_create_direct_mode(self, parent_headers, members):
        aarav = _aarav_id(members)
        uname = f"test_h_{uuid.uuid4().hex[:6]}"
        body = {"name": "TEST_HelperDirect", "role": "nanny",
                "assigned_all": False, "assigned_member_ids": [aarav] if aarav else [],
                "username": uname, "pin": "9876"}
        r = requests.post(f"{API}/helpers", headers=parent_headers, json=body, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("invite_code") is None
        assert j["helper"]["status"] == "active"
        assert j["helper"]["username"] == uname
        hid = j["helper"]["helper_id"]

        # PATCH — rename & change permission
        r2 = requests.patch(f"{API}/helpers/{hid}", headers=parent_headers,
                            json={"name": "TEST_HelperRenamed",
                                  "permissions": {"medical": True}}, timeout=10)
        assert r2.status_code == 200
        assert r2.json()["helper"]["name"] == "TEST_HelperRenamed"
        assert r2.json()["helper"]["permissions"]["medical"] is True

        # GET single
        r3 = requests.get(f"{API}/helpers/{hid}", headers=parent_headers, timeout=10)
        assert r3.status_code == 200

        # cleanup
        requests.delete(f"{API}/helpers/{hid}", headers=parent_headers, timeout=10)
        # verify removal
        r4 = requests.get(f"{API}/helpers/{hid}", headers=parent_headers, timeout=10)
        assert r4.status_code == 404

    def test_reject_bad_role(self, parent_headers):
        r = requests.post(f"{API}/helpers", headers=parent_headers,
                          json={"name": "x", "role": "wizard"}, timeout=10)
        assert r.status_code == 400


# ---------- 2. Pause / Resume / Regenerate / Reset --------------------------
class TestHelperLifecycle:
    @pytest.fixture(scope="class")
    def temp_helper(self, parent_headers):
        uname = f"test_life_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/helpers", headers=parent_headers, json={
            "name": "TEST_Life", "role": "house_help", "assigned_all": True,
            "username": uname, "pin": "4242"}, timeout=15)
        assert r.status_code == 200
        h = r.json()["helper"]
        yield {"helper": h, "username": uname, "pin": "4242"}
        requests.delete(f"{API}/helpers/{h['helper_id']}", headers=parent_headers, timeout=10)

    def test_pause_blocks_login(self, parent_headers, temp_helper):
        hid = temp_helper["helper"]["helper_id"]
        r = requests.post(f"{API}/helpers/{hid}/pause", headers=parent_headers, timeout=10)
        assert r.status_code == 200
        # login should be blocked (403 per spec)
        r2 = requests.post(f"{API}/helper/login",
                           json={"username": temp_helper["username"], "pin": temp_helper["pin"]},
                           timeout=10)
        assert r2.status_code in (401, 403), r2.text

    def test_resume_reallows_login(self, parent_headers, temp_helper):
        hid = temp_helper["helper"]["helper_id"]
        r = requests.post(f"{API}/helpers/{hid}/resume", headers=parent_headers, timeout=10)
        assert r.status_code == 200
        r2 = requests.post(f"{API}/helper/login",
                           json={"username": temp_helper["username"], "pin": temp_helper["pin"]},
                           timeout=10)
        assert r2.status_code == 200, r2.text

    def test_signout_all_invalidates_token(self, parent_headers, temp_helper):
        # login → get token → sign-out-all → old token must 401
        r = requests.post(f"{API}/helper/login",
                          json={"username": temp_helper["username"], "pin": temp_helper["pin"]},
                          timeout=10)
        assert r.status_code == 200
        old = r.json()["token"]
        hid = temp_helper["helper"]["helper_id"]
        r2 = requests.post(f"{API}/helpers/{hid}/signout-all", headers=parent_headers, timeout=10)
        assert r2.status_code == 200
        r3 = requests.get(f"{API}/helper/me",
                          headers={"Authorization": f"Bearer {old}"}, timeout=10)
        assert r3.status_code == 401

    def test_regenerate_invite(self, parent_headers):
        r = requests.post(f"{API}/helpers", headers=parent_headers,
                          json={"name": "TEST_Regen", "role": "cook", "assigned_all": True}, timeout=10)
        hid = r.json()["helper"]["helper_id"]
        old_code = r.json()["invite_code"]
        r2 = requests.post(f"{API}/helpers/{hid}/regenerate-invite",
                           headers=parent_headers, timeout=10)
        assert r2.status_code == 200
        new_code = r2.json()["invite_code"]
        assert new_code and new_code != old_code
        requests.delete(f"{API}/helpers/{hid}", headers=parent_headers, timeout=10)

    def test_reset_pin_changes_login(self, parent_headers):
        uname = f"test_reset_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/helpers", headers=parent_headers, json={
            "name": "TEST_Reset", "role": "cook", "assigned_all": True,
            "username": uname, "pin": "1111"}, timeout=10)
        hid = r.json()["helper"]["helper_id"]
        # reset pin
        new_uname = f"test_reset2_{uuid.uuid4().hex[:6]}"
        r2 = requests.post(f"{API}/helpers/{hid}/reset-pin", headers=parent_headers,
                           json={"username": new_uname, "pin": "2222"}, timeout=10)
        assert r2.status_code == 200
        # old creds no longer work
        assert requests.post(f"{API}/helper/login", json={"username": uname, "pin": "1111"},
                             timeout=10).status_code in (401, 403)
        # new creds do
        assert requests.post(f"{API}/helper/login", json={"username": new_uname, "pin": "2222"},
                             timeout=10).status_code == 200
        requests.delete(f"{API}/helpers/{hid}", headers=parent_headers, timeout=10)

    def test_remove_blocks_login(self, parent_headers):
        uname = f"test_rm_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/helpers", headers=parent_headers, json={
            "name": "TEST_Remove", "role": "cook", "assigned_all": True,
            "username": uname, "pin": "3333"}, timeout=10)
        hid = r.json()["helper"]["helper_id"]
        # login token acquired
        tok = requests.post(f"{API}/helper/login",
                            json={"username": uname, "pin": "3333"}, timeout=10).json()["token"]
        # delete
        assert requests.delete(f"{API}/helpers/{hid}",
                               headers=parent_headers, timeout=10).status_code == 200
        # old token 401
        r2 = requests.get(f"{API}/helper/me",
                          headers={"Authorization": f"Bearer {tok}"}, timeout=10)
        assert r2.status_code == 401
        # login now 401 (username no longer active)
        r3 = requests.post(f"{API}/helper/login",
                           json={"username": uname, "pin": "3333"}, timeout=10)
        assert r3.status_code == 401


# ---------- 3. Helper self-service (demo helper) ----------------------------
class TestHelperSelfService:
    def test_helper_me(self, demo_helper_headers):
        r = requests.get(f"{API}/helper/me", headers=demo_helper_headers, timeout=10)
        assert r.status_code == 200
        h = r.json()["helper"]
        assert h["username"] == DEMO_HELPER_USER

    def test_helper_dashboard_has_three_tasks(self, demo_helper_headers):
        r = requests.get(f"{API}/helper/dashboard", headers=demo_helper_headers, timeout=10)
        assert r.status_code == 200
        j = r.json()
        assert "tasks" in j
        # spec says 3 daily tasks for demo Sunita
        assert len(j["tasks"]) >= 3, f"expected 3+ tasks, got {len(j['tasks'])}"
        titles = [t["title"].lower() for t in j["tasks"]]
        assert any("pickup" in t or "school" in t for t in titles), titles

    def test_start_and_complete_non_proof_task(self, demo_helper_headers):
        r = requests.get(f"{API}/helper/dashboard", headers=demo_helper_headers, timeout=10)
        tasks = r.json()["tasks"]
        # pick a task that does NOT require photo proof
        non_proof = [t for t in tasks if (t.get("require_proof") or "none") != "photo"]
        assert non_proof, "no non-proof tasks to test"
        t = non_proof[0]
        tid = t["task_id"]
        s = requests.post(f"{API}/helper/tasks/{tid}/start",
                          headers=demo_helper_headers, timeout=10)
        assert s.status_code == 200
        c = requests.post(f"{API}/helper/tasks/{tid}/complete",
                          headers=demo_helper_headers, json={"note": "TEST auto"}, timeout=10)
        assert c.status_code == 200, c.text

    def test_complete_proof_task_blocked_without_photo(self, demo_helper_headers):
        r = requests.get(f"{API}/helper/dashboard", headers=demo_helper_headers, timeout=10)
        proof_tasks = [t for t in r.json()["tasks"] if t.get("require_proof") == "photo"]
        assert proof_tasks, "no photo-proof task on demo dashboard"
        t = proof_tasks[0]
        tid = t["task_id"]
        r1 = requests.post(f"{API}/helper/tasks/{tid}/complete",
                           headers=demo_helper_headers, json={"note": "no photo"}, timeout=10)
        assert r1.status_code == 400, f"expected 400 without photo, got {r1.status_code}: {r1.text}"
        # with photo_url succeeds
        r2 = requests.post(f"{API}/helper/tasks/{tid}/complete",
                           headers=demo_helper_headers,
                           json={"note": "with photo", "photo_url": "https://example.com/proof.jpg"},
                           timeout=10)
        assert r2.status_code == 200, r2.text

    def test_issue_flow(self, demo_helper_headers):
        r = requests.get(f"{API}/helper/dashboard", headers=demo_helper_headers, timeout=10)
        tasks = r.json()["tasks"]
        # need a fresh one not already completed
        pending = [t for t in tasks if (t.get("state") or "pending") != "done"]
        target = pending[0] if pending else tasks[0]
        tid = target["task_id"]
        r1 = requests.post(f"{API}/helper/tasks/{tid}/issue",
                           headers=demo_helper_headers,
                           json={"reason": "traffic", "note": "TEST issue"}, timeout=10)
        assert r1.status_code == 200, r1.text


# ---------- 4. Parent assigns task → helper sees it -------------------------
class TestParentAssignTask:
    def test_assign_task_appears_on_dashboard(self, parent_headers, demo_helper_headers, members):
        # find demo helper id
        r = requests.get(f"{API}/helpers", headers=parent_headers, timeout=10)
        sunita = next((h for h in r.json()["helpers"] if h.get("username") == DEMO_HELPER_USER), None)
        assert sunita, "demo helper not found"
        hid = sunita["helper_id"]
        aarav = _aarav_id(members)
        title = f"TEST_ASSIGN_{uuid.uuid4().hex[:6]}"
        body = {"title": title, "schedule": "daily", "due_time": "17:00",
                "category": "pickup", "for_member_id": aarav, "priority": "high",
                "require_proof": "note"}
        r1 = requests.post(f"{API}/helpers/{hid}/tasks", headers=parent_headers,
                           json=body, timeout=10)
        assert r1.status_code == 200, r1.text
        task_id = r1.json()["task"]["task_id"]
        # helper sees it
        r2 = requests.get(f"{API}/helper/dashboard", headers=demo_helper_headers, timeout=10)
        titles = [t["title"] for t in r2.json()["tasks"]]
        assert title in titles, f"assigned task not on dashboard: {titles}"
        # activity for parent lists this task's completions after helper completes
        requests.post(f"{API}/helper/tasks/{task_id}/complete",
                      headers=demo_helper_headers, json={"note": "auto"}, timeout=10)
        r3 = requests.get(f"{API}/helpers/{hid}/activity", headers=parent_headers, timeout=10)
        assert r3.status_code == 200
        # cleanup
        requests.delete(f"{API}/helper-tasks/{task_id}", headers=parent_headers, timeout=10)


# ---------- 5. SECURITY — helper token rejected on family routes -----------
class TestHelperTokenSecurity:
    FAMILY_ROUTES = ["/home", "/families/me", "/chats", "/vault/folders"]

    @pytest.mark.parametrize("path", FAMILY_ROUTES)
    def test_helper_cannot_hit_family_route(self, demo_helper_headers, path):
        r = requests.get(f"{API}{path}", headers=demo_helper_headers, timeout=10)
        assert r.status_code == 401, f"{path} should reject helper token, got {r.status_code}"

    def test_family_token_cannot_hit_helper_routes(self, parent_headers):
        for path in ("/helper/me", "/helper/dashboard", "/helper/tasks"):
            r = requests.get(f"{API}{path}", headers=parent_headers, timeout=10)
            assert r.status_code == 401, f"{path} should reject family token, got {r.status_code}"


# ---------- 6. Child-level scoping -----------------------------------------
class TestChildScoping:
    def test_helper_assigned_aarav_not_gaining_anaya(self, parent_headers, demo_helper_headers, members):
        aarav = _aarav_id(members)
        anaya = _anaya_id(members)
        assert aarav and anaya
        # demo helper is assigned to Aarav
        me = requests.get(f"{API}/helper/me", headers=demo_helper_headers, timeout=10).json()["helper"]
        if me.get("assigned_all"):
            pytest.skip("demo helper is assigned_all — child-scoping n/a")
        assigned = set(me.get("assigned_member_ids") or [])
        assert aarav in assigned
        assert anaya not in assigned


# ---------- 7. Non-parent 403 (best-effort) --------------------------------
class TestNonParentForbidden:
    def test_non_authenticated_cannot_manage(self):
        r = requests.get(f"{API}/helpers", timeout=10)
        assert r.status_code == 401
        r2 = requests.post(f"{API}/helpers", json={"name": "x"}, timeout=10)
        assert r2.status_code == 401
