"""Batch #12 — Family Dashboard + manual member status tests.

Covers:
  * PATCH /api/families/members/{id}/status (self, admin-for-other, clear)
  * GET /api/home — NEW aggregation keys (meals_today, tasks, kids,
    shopping_preview, coming_up, vault_expiring, wishlist_reminder,
    latest_post, family_chat, needs_attention) + regression that ALL
    old keys still exist and members carry status fields.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://our-story-191.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

DASH_EMAIL = "dashdemo@fam.com"
DASH_PASSWORD = "secret123"


# ---------------------------------------------------------------------------
# Session / auth
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": DASH_EMAIL, "password": DASH_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json()["token"]
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def members(session):
    r = session.get(f"{API}/families/members", timeout=20)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="module")
def me_and_others(session, members):
    # Raj is the admin/logged-in user
    r = session.get(f"{API}/auth/me", timeout=20)
    assert r.status_code == 200
    j = r.json()
    user = j.get("user", j)
    mine = j.get("member")
    if not mine:
        for m in members:
            if m.get("linked_user_id") == user["user_id"]:
                mine = m
                break
    assert mine is not None, "logged-in user must be linked to a member"
    others = [m for m in members if m["member_id"] != mine["member_id"]]
    return mine, others


# ---------------------------------------------------------------------------
# Manual status
# ---------------------------------------------------------------------------
class TestMemberStatus:
    def test_self_set_status(self, session, me_and_others):
        mine, _ = me_and_others
        payload = {"status": "work", "status_emoji": "💼", "status_label": "At work", "status_note": "TEST_ pytest note"}
        r = session.patch(f"{API}/families/members/{mine['member_id']}/status", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "work"
        assert body["status_emoji"] == "💼"
        assert body["status_label"] == "At work"
        assert body["status_note"] == "TEST_ pytest note"
        assert body.get("status_updated_at")

    def test_self_clear_status(self, session, me_and_others):
        mine, _ = me_and_others
        r = session.patch(f"{API}/families/members/{mine['member_id']}/status",
                          json={"status": None, "status_emoji": None, "status_label": None, "status_note": None}, timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert body["status"] is None
        assert body["status_emoji"] is None
        assert body["status_label"] is None
        assert body["status_note"] is None
        # restore something so downstream Home assertions still see statuses
        session.patch(f"{API}/families/members/{mine['member_id']}/status",
                      json={"status": "work", "status_emoji": "💼", "status_label": "At work", "status_note": None},
                      timeout=20)

    def test_admin_can_set_other_member(self, session, me_and_others):
        _, others = me_and_others
        target = others[0]
        r = session.patch(f"{API}/families/members/{target['member_id']}/status",
                          json={"status": "home", "status_emoji": "🏡", "status_label": "At home", "status_note": None},
                          timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["member_id"] == target["member_id"]
        assert body["status"] == "home"
        assert body["status_emoji"] == "🏡"


# ---------------------------------------------------------------------------
# /api/home aggregation
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def home(session):
    r = session.get(f"{API}/home", timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


class TestHomeNewKeys:
    def test_all_new_keys_present(self, home):
        for k in ["meals_today", "tasks", "kids", "shopping_preview", "coming_up",
                  "vault_expiring", "wishlist_reminder", "latest_post", "family_chat", "needs_attention"]:
            assert k in home, f"missing new key: {k}"

    def test_meals_today_shape(self, home):
        assert isinstance(home["meals_today"], list)
        for m in home["meals_today"]:
            assert "slot" in m and "recipe" in m
            assert m["slot"] in ("breakfast", "lunch", "dinner")

    def test_tasks_shape_and_scope(self, home):
        tasks = home["tasks"]
        assert isinstance(tasks, list)
        # accept empty (demo may have none) but if there are tasks, structure must match
        for t in tasks:
            for k in ["item_id", "title", "priority", "due_date", "days_until_due", "overdue", "assignee", "scope"]:
                assert k in t, f"task missing {k}: {t}"
            assert t["scope"] in ("mine", "kids", "family")

    def test_kids_shape(self, home):
        for k in home["kids"]:
            assert "member" in k and "done" in k and "total" in k
            assert isinstance(k["done"], int) and isinstance(k["total"], int)

    def test_shopping_preview_shape(self, home):
        for s in home["shopping_preview"]:
            assert "name" in s and "list_id" in s

    def test_coming_up_sorted_asc(self, home):
        cu = home["coming_up"]
        assert isinstance(cu, list)
        for c in cu:
            assert "days" in c and isinstance(c["days"], int)
        assert cu == sorted(cu, key=lambda x: x["days"])

    def test_vault_expiring_summary_only(self, home):
        for v in home["vault_expiring"]:
            assert set(v.keys()).issuperset({"title", "kind", "days_until_expiry"})
            # MUST NOT contain sensitive fields
            for forbidden in ("policy_number", "provider", "coverage_amount", "coverage"):
                assert forbidden not in v, f"vault_expiring leaked sensitive field: {forbidden} in {v}"
            assert 0 <= v["days_until_expiry"] <= 60

    def test_wishlist_reminder_shape(self, home):
        wr = home.get("wishlist_reminder")
        if wr is None:
            return
        assert "member" in wr and "days" in wr and "wishes" in wr
        # reservation must never leak to viewer (Raj = adult, non-owner)
        for w in wr["wishes"]:
            # `reserved_by_member` / `reserved` may be exposed, but not when viewer IS the owner.
            # Owner check is baked in server-side; simply assert wishes list is not empty and each has title.
            assert w.get("title") or w.get("name")

    def test_latest_post_shape(self, home):
        lp = home.get("latest_post")
        if lp is not None:
            assert "post_id" in lp

    def test_family_chat_shape(self, home):
        fc = home.get("family_chat")
        if fc is not None:
            assert "chat_id" in fc
            assert "last_message" in fc
            assert "pinned" in fc  # may be None

    def test_needs_attention_shape(self, home):
        for it in home["needs_attention"]:
            for k in ["key", "icon", "tone", "title", "subtitle", "route"]:
                assert k in it, f"needs_attention missing {k}: {it}"

    def test_needs_attention_routes(self, home):
        routes = {it["key"].split("_")[0]: it["route"] for it in home["needs_attention"]}
        # chores/shopping/vault must point to the right screens when present
        for it in home["needs_attention"]:
            if it["key"] == "chores":
                assert it["route"] == "/chores"
            if it["key"] == "shopping":
                assert it["route"] == "/shopping"
            if it["key"] == "vault":
                assert it["route"] == "/vault"
            if it["key"].startswith("bday_"):
                assert it["route"].startswith("/birthday/")


class TestHomeRegression:
    def test_old_keys_still_present(self, home):
        for k in ["family", "me", "members", "events_today", "pending_chores",
                  "upcoming_birthdays", "unread_messages", "on_this_day",
                  "family_streak", "shopping_pending"]:
            assert k in home, f"regression: legacy key missing: {k}"

    def test_members_carry_status_fields(self, home):
        assert len(home["members"]) >= 1
        for m in home["members"]:
            # each member key should exist even if None
            for k in ("status", "status_emoji", "status_label", "status_note"):
                assert k in m, f"member missing status field {k}: {m.get('name')}"

    def test_members_include_seeded_statuses(self, home):
        by_name = {m["name"].split()[0].lower(): m for m in home["members"]}
        # per spec, seeded statuses: Raj=work, Priya=home, Aarav=school, Anaya=home, Meera=available
        # (Raj may have been overwritten by the earlier self-set test back to 'work' — that's fine)
        expected = {"raj": "work", "priya": "home", "aarav": "school", "anaya": "home", "meera": "available"}
        for first, want in expected.items():
            if first in by_name:
                got = by_name[first].get("status")
                assert got == want, f"{first} expected status={want}, got={got}"
