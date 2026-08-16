"""Batch #9 — Recipes + Weekly Meal Planner + Auto-fill Shopping tests."""
import os
import time
import uuid
from datetime import date, timedelta

import pytest
import requests

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL") or "https://our-story-191.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


# -------------------- helpers --------------------
def _monday_iso():
    today = date.today()
    return (today - timedelta(days=today.weekday())).isoformat()


@pytest.fixture(scope="module")
def creator_session():
    """Register a fresh account and seed the demo family. This user is family admin."""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    email = f"TEST_meal_{uuid.uuid4().hex[:8]}@fam.com"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "secret123", "name": "Meal Tester"})
    assert r.status_code == 200, r.text
    token = r.json()["token"]
    s.headers.update({"Authorization": f"Bearer {token}"})
    seed = s.post(f"{API}/seed/demo", json={})
    assert seed.status_code == 200, seed.text
    return s


@pytest.fixture(scope="module")
def second_session(creator_session):
    """Second user in same family (join via invite code)."""
    inv = creator_session.get(f"{API}/families/invite").json()
    invite = inv.get("invite_code")
    assert invite, "family should have invite_code"
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    email = f"TEST_meal2_{uuid.uuid4().hex[:8]}@fam.com"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "secret123", "name": "Meal2"})
    assert r.status_code == 200, r.text
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    j = s.post(f"{API}/families/join", json={"code": invite})
    assert j.status_code == 200, j.text
    return s


# -------------------- Recipes CRUD --------------------
class TestRecipes:
    def test_list_seeded(self, creator_session):
        r = creator_session.get(f"{API}/recipes")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 4, f"expected >=4 seeded recipes, got {len(data)}"
        titles = [x["title"] for x in data]
        assert any("Rajma" in t for t in titles)
        # newest first
        ts = [x["created_at"] for x in data]
        assert ts == sorted(ts, reverse=True), "recipes must be newest-first"
        # required keys
        for x in data:
            assert "recipe_id" in x and "title" in x and "ingredients" in x

    def test_create_and_get(self, creator_session):
        payload = {
            "title": "TEST_Aloo Paratha",
            "description": "Stuffed flatbread",
            "prep_minutes": 25,
            "ingredients": [
                {"name": "Wheat flour", "quantity": "3 cups"},
                {"name": "Potato", "quantity": "4"},
                {"name": "Ghee", "quantity": "2 tbsp"},
            ],
        }
        r = creator_session.post(f"{API}/recipes", json=payload)
        assert r.status_code == 200, r.text
        rc = r.json()
        assert rc["title"] == payload["title"]
        assert len(rc["ingredients"]) == 3
        assert rc["prep_minutes"] == 25
        rid = rc["recipe_id"]

        # verify GET by id includes author
        g = creator_session.get(f"{API}/recipes/{rid}")
        assert g.status_code == 200
        gd = g.json()
        assert gd["recipe_id"] == rid
        assert gd["title"] == payload["title"]
        assert gd.get("author") is not None
        assert gd["author"].get("name")

    def test_empty_title_rejected(self, creator_session):
        r = creator_session.post(f"{API}/recipes", json={"title": "   ", "ingredients": []})
        assert r.status_code == 400

    def test_get_unknown_returns_404(self, creator_session):
        r = creator_session.get(f"{API}/recipes/rcp_doesnotexist")
        assert r.status_code == 404

    def test_delete_permissions_and_cascade(self, creator_session, second_session):
        # create recipe as second_session (non-admin)
        payload = {"title": "TEST_ToDelete", "ingredients": [{"name": "Salt", "quantity": "1 tsp"}]}
        r = second_session.post(f"{API}/recipes", json=payload)
        assert r.status_code == 200
        rid = r.json()["recipe_id"]

        # add to meal plan by creator (admin can add)
        wk = _monday_iso()
        mp = creator_session.post(f"{API}/meals",
                                  json={"week_start": wk, "day": 5, "slot": "lunch", "recipe_id": rid})
        assert mp.status_code == 200, mp.text

        # creator (admin) is allowed to delete OTHER user's recipe
        # But first: try deleting from a THIRD non-creator, non-admin session -> 403
        # Use a fresh third user in a different family attempting delete: it should 404 (recipe not found in their family)
        # So test the intended 403 path: create as second_session, try deleting as creator? creator IS admin -> would succeed.
        # Better: create recipe as creator (admin), then try delete as second_session (non-admin non-creator) -> 403
        r2 = creator_session.post(f"{API}/recipes",
                                  json={"title": "TEST_AdminOnly", "ingredients": [{"name": "Sugar"}]})
        assert r2.status_code == 200
        rid_admin = r2.json()["recipe_id"]
        denied = second_session.delete(f"{API}/recipes/{rid_admin}")
        assert denied.status_code == 403, denied.text

        # Creator (admin) deletes the second_session's recipe -> 200 + cascade
        d = creator_session.delete(f"{API}/recipes/{rid}")
        assert d.status_code == 200

        # Recipe now gone
        g = creator_session.get(f"{API}/recipes/{rid}")
        assert g.status_code == 404

        # Meal plan entry cascaded out
        meals = creator_session.get(f"{API}/meals", params={"week_start": wk}).json()["meals"]
        assert all(m["recipe_id"] != rid for m in meals), "deleted recipe still referenced in meal plans"

        # Cleanup admin-only recipe
        creator_session.delete(f"{API}/recipes/{rid_admin}")


# -------------------- Meal Planner --------------------
class TestMealPlanner:
    def test_get_meals_seeded(self, creator_session):
        wk = _monday_iso()
        r = creator_session.get(f"{API}/meals", params={"week_start": wk})
        assert r.status_code == 200
        data = r.json()
        assert data["week_start"] == wk
        assert len(data["meals"]) >= 4, f"expected 4 seeded meals, got {len(data['meals'])}"
        # every entry has recipe hydrated
        for m in data["meals"]:
            assert m.get("recipe"), f"missing recipe hydration: {m}"
            assert "ingredient_count" in m["recipe"]
        # verify specific seed: Mon dinner = Rajma Chawal
        mon_dinner = next((m for m in data["meals"] if m["day"] == 0 and m["slot"] == "dinner"), None)
        assert mon_dinner and "Rajma" in mon_dinner["recipe"]["title"]

    def test_post_meal_replaces_not_duplicates(self, creator_session):
        # Use a future week to avoid trampling seed
        future_wk = (date.today() - timedelta(days=date.today().weekday()) + timedelta(days=7)).isoformat()
        # Fetch two recipes
        recipes = creator_session.get(f"{API}/recipes").json()
        assert len(recipes) >= 2
        r1, r2 = recipes[0]["recipe_id"], recipes[1]["recipe_id"]
        # Post r1 to Thu breakfast
        p1 = creator_session.post(f"{API}/meals",
                                  json={"week_start": future_wk, "day": 3, "slot": "breakfast", "recipe_id": r1})
        assert p1.status_code == 200
        # Post r2 to same slot -> should REPLACE
        p2 = creator_session.post(f"{API}/meals",
                                  json={"week_start": future_wk, "day": 3, "slot": "breakfast", "recipe_id": r2})
        assert p2.status_code == 200
        # Get and verify exactly one entry
        after = creator_session.get(f"{API}/meals", params={"week_start": future_wk}).json()["meals"]
        thu_bf = [m for m in after if m["day"] == 3 and m["slot"] == "breakfast"]
        assert len(thu_bf) == 1, f"replacement failed; got {len(thu_bf)} entries"
        assert thu_bf[0]["recipe_id"] == r2

    def test_invalid_slot_rejected(self, creator_session):
        wk = _monday_iso()
        recipes = creator_session.get(f"{API}/recipes").json()
        rid = recipes[0]["recipe_id"]
        r = creator_session.post(f"{API}/meals",
                                 json={"week_start": wk, "day": 0, "slot": "snack", "recipe_id": rid})
        assert r.status_code == 400

    def test_invalid_day_rejected(self, creator_session):
        wk = _monday_iso()
        recipes = creator_session.get(f"{API}/recipes").json()
        rid = recipes[0]["recipe_id"]
        r = creator_session.post(f"{API}/meals",
                                 json={"week_start": wk, "day": 9, "slot": "dinner", "recipe_id": rid})
        assert r.status_code == 400

    def test_unknown_recipe_returns_404(self, creator_session):
        wk = _monday_iso()
        r = creator_session.post(f"{API}/meals",
                                 json={"week_start": wk, "day": 0, "slot": "dinner", "recipe_id": "rcp_nope"})
        assert r.status_code == 404

    def test_delete_meal(self, creator_session):
        future_wk = (date.today() - timedelta(days=date.today().weekday()) + timedelta(days=14)).isoformat()
        recipes = creator_session.get(f"{API}/recipes").json()
        rid = recipes[0]["recipe_id"]
        posted = creator_session.post(f"{API}/meals",
                                      json={"week_start": future_wk, "day": 2, "slot": "lunch", "recipe_id": rid}).json()
        plan_id = posted["plan_id"]
        d = creator_session.delete(f"{API}/meals/{plan_id}")
        assert d.status_code == 200
        after = creator_session.get(f"{API}/meals", params={"week_start": future_wk}).json()["meals"]
        assert all(m["plan_id"] != plan_id for m in after)


# -------------------- Auto-fill Shopping --------------------
class TestMealToShopping:
    def test_empty_week_returns_400(self, creator_session):
        # far-future week with no meals
        empty_wk = (date.today() + timedelta(days=365)).isoformat()
        # Ensure it's a Monday-ish string is fine; server just queries by string
        r = creator_session.post(f"{API}/meals/to-shopping", json={"week_start": empty_wk})
        assert r.status_code == 400

    def test_idempotent_autofill(self, creator_session):
        wk = _monday_iso()
        # Clear existing 'Meal Plan 🍽️' list items to ensure clean run
        lists_before = creator_session.get(f"{API}/shopping/lists").json()
        existing = [l for l in lists_before if l["name"] == "Meal Plan 🍽️"]
        for l in existing:
            # delete the list to reset (endpoint may exist as DELETE /shopping/lists/{id})
            creator_session.delete(f"{API}/shopping/lists/{l['list_id']}")

        # First call: should ADD items > 0
        r1 = creator_session.post(f"{API}/meals/to-shopping", json={"week_start": wk})
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert d1["list_name"] == "Meal Plan 🍽️"
        assert d1["added"] > 0, f"expected items to be added first time, got {d1}"
        assert d1["total_ingredients"] >= d1["added"]
        list_id = d1["list_id"]

        # Second call: idempotent -> added = 0, same list_id
        r2 = creator_session.post(f"{API}/meals/to-shopping", json={"week_start": wk})
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2["added"] == 0, f"expected 0 added on repeat, got {d2}"
        assert d2["list_id"] == list_id

        # Verify shopping list contains the ingredients
        lists = creator_session.get(f"{API}/shopping/lists").json()
        assert any(l["list_id"] == list_id and l["name"] == "Meal Plan 🍽️" for l in lists)

        # Get list items - endpoint likely /shopping/lists/{list_id}/items or similar
        items_resp = creator_session.get(f"{API}/shopping/lists/{list_id}/items")
        assert items_resp.status_code == 200, items_resp.text
        items = items_resp.json()
        item_names = {(i.get("name") or "").lower() for i in items}
        # From seeded recipes, expect these common items
        expected_any = ["kidney beans", "basmati rice", "paneer", "potato", "onion"]
        matches = [n for n in expected_any if n in item_names]
        assert matches, f"expected some seeded ingredients in list, got names={item_names}"
