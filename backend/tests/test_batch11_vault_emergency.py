"""
Batch #11 backend tests — Family Vault + Emergency Center + SOS.

Runs against the public BASE_URL from EXPO_PUBLIC_BACKEND_URL (or EXPO_BACKEND_URL).
Uses the seeded protectdemo@fam.com admin (Raj) account. Falls back to registering
a fresh account and calling /api/seed/demo when the seeded one is missing.
"""

import os
import uuid
import pytest
import requests

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
    or ""
).rstrip("/")

assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"

PROTECT_EMAIL = "protectdemo@fam.com"
PROTECT_PASSWORD = "secret123"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})

    # Try login with the seeded demo admin
    r = s.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": PROTECT_EMAIL, "password": PROTECT_PASSWORD},
        timeout=20,
    )
    if r.status_code != 200:
        # Register a fresh user + seed
        email = f"protecttest_{uuid.uuid4().hex[:8]}@fam.com"
        r = s.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": email, "password": "secret123", "display_name": "Test Raj"},
            timeout=20,
        )
        assert r.status_code in (200, 201), f"Register failed: {r.status_code} {r.text}"
        token = r.json()["token"]
        s.headers["Authorization"] = f"Bearer {token}"
        r2 = s.post(f"{BASE_URL}/api/seed/demo", json={}, timeout=60)
        assert r2.status_code in (200, 201), f"seed/demo failed: {r2.status_code} {r2.text}"
    else:
        s.headers["Authorization"] = f"Bearer {r.json()['token']}"
    return s


@pytest.fixture(scope="module")
def members(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/families/members", timeout=20)
    assert r.status_code == 200
    data = r.json()
    return {m["name"].split(" ")[0]: m for m in data}


# ---------------------------------------------------------------------------
# Vault folders
# ---------------------------------------------------------------------------
class TestVaultFolders:
    def test_list_folders_with_counts(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/vault/folders", timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 5
        names = {f["name"] for f in data}
        for expected in ["Insurance", "Documents", "Home", "Vehicles", "Travel"]:
            assert expected in names, f"missing seed folder {expected}"
        for f in data:
            assert "count" in f and isinstance(f["count"], int)

    def test_create_and_delete_folder(self, admin_session):
        r = admin_session.post(
            f"{BASE_URL}/api/vault/folders",
            json={"name": "TEST_MyFolder", "icon": "folder"},
            timeout=20,
        )
        assert r.status_code == 201, r.text
        fid = r.json()["folder_id"]
        assert r.json()["count"] == 0
        # verify present
        listing = admin_session.get(f"{BASE_URL}/api/vault/folders", timeout=20).json()
        assert any(f["folder_id"] == fid for f in listing)
        # delete
        d = admin_session.delete(f"{BASE_URL}/api/vault/folders/{fid}", timeout=20)
        assert d.status_code == 200
        listing = admin_session.get(f"{BASE_URL}/api/vault/folders", timeout=20).json()
        assert not any(f["folder_id"] == fid for f in listing)


# ---------------------------------------------------------------------------
# Vault items
# ---------------------------------------------------------------------------
class TestVaultItems:
    def test_list_items(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/vault/items", timeout=20)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list) and len(items) >= 4
        titles = {i["title"] for i in items}
        assert "Family Health Insurance" in titles
        assert "Car Insurance — Honda City" in titles

    def test_filter_by_kind_insurance(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/vault/items?kind=insurance", timeout=20)
        assert r.status_code == 200
        items = r.json()
        assert all(i["kind"] == "insurance" for i in items)
        assert len(items) >= 2

    def test_create_document_and_persist(self, admin_session):
        r = admin_session.post(
            f"{BASE_URL}/api/vault/items",
            json={
                "kind": "document",
                "title": "TEST_Rent Receipt",
                "notes": "January rent",
                "visibility": "family",
            },
            timeout=20,
        )
        assert r.status_code == 201, r.text
        item_id = r.json()["item_id"]
        # GET to verify persistence
        g = admin_session.get(f"{BASE_URL}/api/vault/items/{item_id}", timeout=20)
        assert g.status_code == 200
        got = g.json()
        assert got["title"] == "TEST_Rent Receipt"
        assert got["kind"] == "document"
        assert got["notes"] == "January rent"
        # cleanup
        admin_session.delete(f"{BASE_URL}/api/vault/items/{item_id}", timeout=20)

    def test_create_insurance_full_fields(self, admin_session, members):
        covered = [members["Raj"]["member_id"], members["Priya"]["member_id"]]
        r = admin_session.post(
            f"{BASE_URL}/api/vault/items",
            json={
                "kind": "insurance",
                "title": "TEST_Life Insurance",
                "provider": "TEST_LIC",
                "policy_number": "TEST-LIC-42",
                "coverage_amount": "₹50,00,000",
                "expiry_date": "2030-12-31",
                "covered_member_ids": covered,
                "visibility": "parents",
            },
            timeout=20,
        )
        assert r.status_code == 201, r.text
        item_id = r.json()["item_id"]
        g = admin_session.get(f"{BASE_URL}/api/vault/items/{item_id}", timeout=20).json()
        assert g["provider"] == "TEST_LIC"
        assert g["policy_number"] == "TEST-LIC-42"
        assert g["coverage_amount"] == "₹50,00,000"
        assert g["expiry_date"] == "2030-12-31"
        assert set(g["covered_member_ids"]) == set(covered)
        assert len(g.get("covered_members") or []) == 2
        # patch
        p = admin_session.patch(
            f"{BASE_URL}/api/vault/items/{item_id}",
            json={
                "kind": "insurance", "title": "TEST_Life Insurance (Updated)",
                "provider": "TEST_LIC", "policy_number": "TEST-LIC-42",
                "coverage_amount": "₹75,00,000", "expiry_date": "2030-12-31",
                "covered_member_ids": covered, "visibility": "parents",
            },
            timeout=20,
        )
        assert p.status_code == 200
        g2 = admin_session.get(f"{BASE_URL}/api/vault/items/{item_id}", timeout=20).json()
        assert g2["title"].endswith("(Updated)")
        assert g2["coverage_amount"] == "₹75,00,000"
        # cleanup
        d = admin_session.delete(f"{BASE_URL}/api/vault/items/{item_id}", timeout=20)
        assert d.status_code == 200
        g3 = admin_session.get(f"{BASE_URL}/api/vault/items/{item_id}", timeout=20)
        assert g3.status_code == 404


# ---------------------------------------------------------------------------
# Vault expiries
# ---------------------------------------------------------------------------
class TestVaultExpiries:
    def test_expiries_sorted_and_shape(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/vault/expiries?days=90", timeout=20)
        assert r.status_code == 200
        items = r.json()
        # seed has Car (~15d) and Health (~30d) -> both should be here
        assert len(items) >= 2
        # each has days_until_expiry
        for it in items:
            assert "days_until_expiry" in it
        # sorted ascending
        dus = [i["days_until_expiry"] for i in items if i["days_until_expiry"] is not None]
        assert dus == sorted(dus)
        titles = [i["title"] for i in items]
        assert "Car Insurance — Honda City" in titles
        assert "Family Health Insurance" in titles


# ---------------------------------------------------------------------------
# Emergency contacts
# ---------------------------------------------------------------------------
class TestEmergencyContacts:
    def test_list_critical_first(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/emergency/contacts", timeout=20)
        assert r.status_code == 200
        contacts = r.json()
        assert len(contacts) >= 10
        # critical first
        seen_non_crit = False
        for c in contacts:
            if not c.get("critical"):
                seen_non_crit = True
            elif seen_non_crit:
                pytest.fail("critical contact appeared after non-critical")
        names = {c["name"] for c in contacts}
        assert "Ambulance" in names
        assert "Police" in names
        assert "Fire Department" in names

    def test_missing_name_or_phone_400(self, admin_session):
        r = admin_session.post(
            f"{BASE_URL}/api/emergency/contacts",
            json={"name": "", "phone": "123"},
            timeout=20,
        )
        assert r.status_code == 400
        r = admin_session.post(
            f"{BASE_URL}/api/emergency/contacts",
            json={"name": "TEST_Foo", "phone": ""},
            timeout=20,
        )
        assert r.status_code == 400

    def test_crud_contact(self, admin_session):
        r = admin_session.post(
            f"{BASE_URL}/api/emergency/contacts",
            json={"name": "TEST_Neighbour", "phone": "+91 99999 00000", "critical": False},
            timeout=20,
        )
        assert r.status_code == 201, r.text
        cid = r.json()["contact_id"]
        assert r.json()["name"] == "TEST_Neighbour"
        # patch to critical
        p = admin_session.patch(
            f"{BASE_URL}/api/emergency/contacts/{cid}",
            json={"name": "TEST_Neighbour", "phone": "+91 99999 00000", "critical": True},
            timeout=20,
        )
        assert p.status_code == 200
        assert p.json()["critical"] is True
        # cleanup
        d = admin_session.delete(f"{BASE_URL}/api/emergency/contacts/{cid}", timeout=20)
        assert d.status_code == 200


# ---------------------------------------------------------------------------
# Emergency instructions
# ---------------------------------------------------------------------------
class TestEmergencyInstructions:
    def test_list_has_3_seeded(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/emergency/instructions", timeout=20)
        assert r.status_code == 200
        ins = r.json()
        assert len(ins) >= 3
        titles = {i["title"] for i in ins}
        # fuzzy match (they contain emoji)
        assert any("Fire" in t for t in titles)
        assert any("Medical" in t for t in titles)

    def test_create_patch_delete(self, admin_session):
        r = admin_session.post(
            f"{BASE_URL}/api/emergency/instructions",
            json={"title": "TEST_Earthquake", "icon": "🌍",
                  "steps": ["Duck", "Cover", "Hold on"]},
            timeout=20,
        )
        assert r.status_code == 201, r.text
        iid = r.json()["instruction_id"]
        assert r.json()["steps"] == ["Duck", "Cover", "Hold on"]
        p = admin_session.patch(
            f"{BASE_URL}/api/emergency/instructions/{iid}",
            json={"title": "TEST_Earthquake", "icon": "🌍",
                  "steps": ["Duck", "Cover", "Hold on", "Evacuate"]},
            timeout=20,
        )
        assert p.status_code == 200
        assert len(p.json()["steps"]) == 4
        d = admin_session.delete(f"{BASE_URL}/api/emergency/instructions/{iid}", timeout=20)
        assert d.status_code == 200


# ---------------------------------------------------------------------------
# Family plan
# ---------------------------------------------------------------------------
class TestFamilyPlan:
    def test_get_and_put(self, admin_session):
        g = admin_session.get(f"{BASE_URL}/api/emergency/plan", timeout=20)
        assert g.status_code == 200
        plan = g.json()
        # PUT with a distinctive value we can verify
        new_addr = f"TEST_ADDR {uuid.uuid4().hex[:6]}"
        payload = {
            "home_address": new_addr,
            "meeting_point": plan.get("meeting_point") or "Front gate",
            "parent_numbers": plan.get("parent_numbers"),
            "notes": "TEST_updated",
        }
        p = admin_session.put(f"{BASE_URL}/api/emergency/plan", json=payload, timeout=20)
        assert p.status_code == 200, p.text
        updated = p.json()
        assert updated["home_address"] == new_addr
        assert updated["notes"] == "TEST_updated"
        assert updated.get("last_reviewed")
        # GET again to confirm persistence
        g2 = admin_session.get(f"{BASE_URL}/api/emergency/plan", timeout=20).json()
        assert g2["home_address"] == new_addr


# ---------------------------------------------------------------------------
# Medical cards
# ---------------------------------------------------------------------------
class TestMedicalCards:
    def test_get_aarav(self, admin_session, members):
        aarav_id = members["Aarav"]["member_id"]
        r = admin_session.get(f"{BASE_URL}/api/emergency/medical/{aarav_id}", timeout=20)
        assert r.status_code == 200
        card = r.json()
        assert card["blood_group"] == "O+"
        assert "Peanuts" in (card.get("allergies") or "")

    def test_put_aarav_updates(self, admin_session, members):
        aarav_id = members["Aarav"]["member_id"]
        original = admin_session.get(
            f"{BASE_URL}/api/emergency/medical/{aarav_id}", timeout=20
        ).json()
        new_notes = f"TEST_note_{uuid.uuid4().hex[:6]}"
        payload = {
            "member_id": aarav_id,
            "blood_group": "O+",
            "allergies": original.get("allergies") or "Peanuts",
            "medication": new_notes,
            "conditions": original.get("conditions"),
        }
        p = admin_session.put(
            f"{BASE_URL}/api/emergency/medical/{aarav_id}", json=payload, timeout=20
        )
        assert p.status_code == 200
        assert p.json()["medication"] == new_notes
        # revert
        admin_session.put(
            f"{BASE_URL}/api/emergency/medical/{aarav_id}",
            json={
                "member_id": aarav_id,
                "blood_group": "O+",
                "allergies": "Peanuts",
                "medication": original.get("medication") or "None",
                "conditions": original.get("conditions"),
            },
            timeout=20,
        )


# ---------------------------------------------------------------------------
# SOS
# ---------------------------------------------------------------------------
class TestSOS:
    def test_trigger_and_resolve(self, admin_session):
        # get family chat + last message before
        chats = admin_session.get(f"{BASE_URL}/api/chats", timeout=20).json()
        fam = next((c for c in chats if c.get("type") == "family"), None)
        assert fam, "no family chat found"
        # trigger SOS
        r = admin_session.post(
            f"{BASE_URL}/api/emergency/sos",
            json={"latitude": 28.6139, "longitude": 77.209, "message": "TEST_SOS please help"},
            timeout=30,
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert "sos_id" in body
        assert "notified" in body
        assert "push_ok" in body
        assert body["location"]["maps_url"].startswith("https://www.google.com/maps?q=28.6139")
        sos_id = body["sos_id"]

        # verify family chat received the SOS message
        msgs = admin_session.get(
            f"{BASE_URL}/api/chats/{fam['chat_id']}/messages", timeout=20
        ).json()
        # messages endpoint may return list directly or dict; handle both
        msg_list = msgs if isinstance(msgs, list) else msgs.get("messages", [])
        assert any("🚨 FAMILY SOS" in (m.get("text") or "") and "TEST_SOS please help" in (m.get("text") or "")
                   for m in msg_list), "SOS message not posted to family chat"

        # active listing
        active = admin_session.get(f"{BASE_URL}/api/emergency/sos/active", timeout=20).json()
        assert any(a["sos_id"] == sos_id for a in active)

        # resolve
        res = admin_session.post(
            f"{BASE_URL}/api/emergency/sos/{sos_id}/resolve", json={}, timeout=20
        )
        assert res.status_code == 200
        active2 = admin_session.get(f"{BASE_URL}/api/emergency/sos/active", timeout=20).json()
        assert not any(a["sos_id"] == sos_id for a in active2)


# ---------------------------------------------------------------------------
# Regression: 6-pillar More + wishlists still work
# ---------------------------------------------------------------------------
class TestRegression:
    def test_wishlists_overview(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/wishlists", timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert "family" in data and "members" in data

    def test_members_endpoint(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/families/members", timeout=20)
        assert r.status_code == 200
        assert len(r.json()) >= 5
