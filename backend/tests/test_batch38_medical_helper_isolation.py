"""Batch #38 backend tests — medical card doctor_phone + insurance persistence,
detail gating for viewers without medical-detail permission, and helper Care-Team
medical endpoint isolation (must NOT include doctor_phone or insurance)."""
import os
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or os.environ.get("EXPO_BACKEND_URL", "").rstrip("/")
assert BASE, "EXPO_PUBLIC_BACKEND_URL must be set"
API = f"{BASE}/api"

PARENT_EMAIL = "storytester@fam.com"
PARENT_PASSWORD = "secret123"
HELPER_USER = "sunita"
HELPER_PIN = "1234"


# ---------------- Session fixtures ---------------- #
@pytest.fixture(scope="module")
def parent_token():
    r = requests.post(f"{API}/auth/login", json={"email": PARENT_EMAIL, "password": PARENT_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    j = r.json()
    return j.get("access_token") or j["token"]


@pytest.fixture(scope="module")
def parent_headers(parent_token):
    return {"Authorization": f"Bearer {parent_token}"}


@pytest.fixture(scope="module")
def helper_token():
    r = requests.post(f"{API}/helper/login", json={"username": HELPER_USER, "pin": HELPER_PIN}, timeout=15)
    assert r.status_code == 200, f"helper login failed: {r.status_code} {r.text[:200]}"
    j = r.json()
    return j.get("access_token") or j["token"]


@pytest.fixture(scope="module")
def helper_headers(helper_token):
    return {"Authorization": f"Bearer {helper_token}"}


@pytest.fixture(scope="module")
def parent_member_id(parent_headers):
    """Parent's own member_id (Raj)."""
    r = requests.get(f"{API}/families/members", headers=parent_headers, timeout=15)
    assert r.status_code == 200
    me = requests.get(f"{API}/auth/me", headers=parent_headers, timeout=15).json()
    uid = me.get("user_id") or me.get("id") or (me.get("user") or {}).get("user_id")
    for m in r.json():
        if m.get("linked_user_id") == uid:
            return m["member_id"]
    # fallback: pick Raj by name
    for m in r.json():
        if (m.get("name") or "").lower().startswith("raj"):
            return m["member_id"]
    pytest.skip("Could not resolve parent's member_id")


# ---------------- Medical PUT/GET (parent) ---------------- #
class TestMedicalPersistence:
    def test_put_persists_doctor_phone_and_insurance(self, parent_headers, parent_member_id):
        payload = {
            "member_id": parent_member_id,
            "blood_group": "B+",
            "allergies": "Peanuts, Dust",
            "doctor": "Dr. Mehta",
            "doctor_phone": "+91 98765 43210",
            "insurance": [
                {"type": "health", "provider": "Star Health", "policy_number": "SH-TEST-38-1", "phone": "1800111222"},
                {"type": "vehicle", "provider": "ICICI Lombard", "policy_number": "VH-TEST-38-2", "phone": None},
            ],
            "emergency_contact": "Priya +91 98111 00099",
        }
        r = requests.put(f"{API}/emergency/medical/{parent_member_id}", json=payload, headers=parent_headers, timeout=15)
        assert r.status_code == 200, f"PUT failed: {r.status_code} {r.text[:200]}"
        d = r.json()
        assert d.get("doctor_phone") == "+91 98765 43210"
        ins = d.get("insurance") or []
        assert isinstance(ins, list) and len(ins) == 2
        health = next((x for x in ins if x["type"] == "health"), None)
        vehicle = next((x for x in ins if x["type"] == "vehicle"), None)
        assert health and health["provider"] == "Star Health" and health["policy_number"] == "SH-TEST-38-1"
        assert vehicle and vehicle["provider"] == "ICICI Lombard"

    def test_get_returns_full_detail_for_parent(self, parent_headers, parent_member_id):
        r = requests.get(f"{API}/emergency/medical/{parent_member_id}", headers=parent_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d.get("blood_group") == "B+"
        assert "Peanuts" in (d.get("allergies") or "")
        assert d.get("doctor") == "Dr. Mehta"
        assert d.get("doctor_phone") == "+91 98765 43210"
        assert isinstance(d.get("insurance"), list) and len(d["insurance"]) >= 2
        assert d.get("can_view_detail") is True


# ---------------- Helper /helper/medical isolation ---------------- #
class TestHelperMedicalIsolation:
    """The helper Care-Team medical endpoint must expose ONLY
    allergies/blood_group/doctor/emergency_contact — never doctor_phone/insurance/
    medication/conditions/insurance_provider/policy_reference."""

    _FORBIDDEN = ("doctor_phone", "insurance", "medication", "conditions",
                  "insurance_provider", "policy_reference")

    def test_helper_medical_returns_only_at_a_glance_fields(self, helper_headers, parent_headers, parent_member_id):
        # Ensure Sunita's assigned child (Aarav) has a rich medical card with doctor_phone+insurance,
        # so if the endpoint leaked those, this test would catch it.
        # First find Aarav's member_id.
        mm = requests.get(f"{API}/families/members", headers=parent_headers, timeout=15).json()
        aarav = next((m for m in mm if (m.get("name") or "").lower().startswith("aarav")), None)
        assert aarav, "Aarav member not found — needed for helper test"
        aid = aarav["member_id"]
        # Seed a rich card as parent
        rich = {
            "member_id": aid,
            "blood_group": "O+",
            "allergies": "Peanuts",
            "doctor": "Dr. Mehta",
            "doctor_phone": "+91 98700 12345",  # should be hidden from helper
            "insurance": [
                {"type": "health", "provider": "TEST-Helper-Insurance", "policy_number": "HELPER-LEAK-TEST", "phone": "1800000000"},
            ],
            "emergency_contact": "Priya +91 98111 00099",
        }
        pr = requests.put(f"{API}/emergency/medical/{aid}", json=rich, headers=parent_headers, timeout=15)
        assert pr.status_code == 200, f"seed rich card failed: {pr.status_code} {pr.text[:200]}"

        # Now call helper endpoint
        r = requests.get(f"{API}/helper/medical", headers=helper_headers, timeout=15)
        assert r.status_code == 200, f"/helper/medical failed: {r.status_code} {r.text[:200]}"
        data = r.json()
        assert "cards" in data and isinstance(data["cards"], list) and len(data["cards"]) >= 1
        for card in data["cards"]:
            # allowed fields present
            assert "blood_group" in card
            assert "allergies" in card
            assert "doctor" in card
            assert "emergency_contact" in card
            # forbidden fields absent (or None) — spec says MUST NOT include
            for k in self._FORBIDDEN:
                assert k not in card, f"helper medical leaked field '{k}' for member {card.get('member', {}).get('member_id')}: {card.get(k)!r}"

        # Additionally, ensure the raw serialized JSON does NOT mention the leak markers
        raw = r.text
        assert "HELPER-LEAK-TEST" not in raw, "helper medical exposed policy_number (insurance leak)"
        assert "+91 98700 12345" not in raw, "helper medical exposed doctor_phone"


# ---------------- Detail gating via code inspection ---------------- #
class TestMedicalDetailGatingList:
    """CRITICAL check: the _MEDICAL_DETAIL_FIELDS list on the backend must
    include doctor_phone AND insurance so a viewer without medical-detail
    permission gets ONLY blood_group + allergies via GET /emergency/medical/{id}."""

    def test_detail_fields_list_includes_new_fields(self):
        # Read the source of truth directly, since the demo family has no accessible
        # limited-role account (child/limited) exposed to automated tests.
        src_path = "/app/backend/server.py"
        with open(src_path, "r", encoding="utf-8") as f:
            src = f.read()
        # Find the tuple definition line
        idx = src.find("_MEDICAL_DETAIL_FIELDS")
        assert idx > 0, "_MEDICAL_DETAIL_FIELDS not found in server.py"
        # Grab a window
        window = src[idx: idx + 400]
        for needle in ("doctor_phone", "insurance", "medication", "conditions",
                       "insurance_provider", "policy_reference"):
            assert needle in window, f"_MEDICAL_DETAIL_FIELDS is missing '{needle}' — detail gating would leak this field"

    def test_get_medical_uses_gating(self):
        src_path = "/app/backend/server.py"
        with open(src_path, "r", encoding="utf-8") as f:
            src = f.read()
        # Confirm the loop that pops detail fields exists in get_medical_card
        assert "for f in _MEDICAL_DETAIL_FIELDS" in src
        assert 'out.pop(f, None)' in src
        assert 'out["detail_restricted"] = True' in src
