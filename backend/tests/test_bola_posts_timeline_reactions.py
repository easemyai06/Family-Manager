"""
Cross-family Broken Object Level Authorization (BOLA) regression tests.

Covers:
  - GET/POST /api/posts/{post_id}/comments cross-family -> 404
  - GET/POST /api/timeline/{timeline_id}/comments cross-family -> 404
  - POST /api/posts/{post_id}/react and /api/timeline/{timeline_id}/react cross-family -> 404
  - POST /api/messages/{message_id}/react from a different family -> 404
    (same-family non-member scenario noted as untestable: create_chat always adds caller
    to member_ids and family A only has one auth user.)
  - Regression: legitimate same-family reads/writes still succeed.

Cleans up posts / timelines / chats / messages it created; leaves seeded demo data intact.
"""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fall back to the well-known preview URL used elsewhere in this repo.
    BASE_URL = "https://our-story-191.preview.emergentagent.com"
API = f"{BASE_URL}/api"

FAMILY_A_EMAIL = "storytester@fam.com"
FAMILY_B_EMAIL = "protectdemo@fam.com"
PASSWORD = "secret123"


def _login(email: str, password: str = PASSWORD) -> str:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"no token in login response for {email}: {data}"
    return tok


def _h(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


# ---------------- fixtures -----------------
@pytest.fixture(scope="module")
def token_a():
    return _login(FAMILY_A_EMAIL)


@pytest.fixture(scope="module")
def token_b():
    return _login(FAMILY_B_EMAIL)


@pytest.fixture(scope="module")
def family_ids(token_a, token_b):
    a = requests.get(f"{API}/auth/me", headers=_h(token_a), timeout=30).json()["user"]
    b = requests.get(f"{API}/auth/me", headers=_h(token_b), timeout=30).json()["user"]
    fa = a.get("family_id")
    fb = b.get("family_id")
    assert fa and fb and fa != fb, f"expected two different families, got A={fa} B={fb}"
    return fa, fb


@pytest.fixture(scope="module")
def post_a(token_a):
    """Post created by family A. Yields post_id and cleans up on teardown."""
    payload = {
        "caption": f"TEST_BOLA_post_{uuid.uuid4().hex[:6]}",
        "media": [],
        "category": "everyday",
    }
    r = requests.post(f"{API}/posts", json=payload, headers=_h(token_a), timeout=30)
    assert r.status_code in (200, 201), f"create post failed: {r.status_code} {r.text}"
    pid = r.json().get("post_id")
    assert pid, f"no post_id in response: {r.json()}"
    yield pid
    try:
        requests.delete(f"{API}/posts/{pid}", headers=_h(token_a), timeout=30)
    except Exception:
        pass


@pytest.fixture(scope="module")
def timeline_a(token_a):
    """Timeline memory created by family A. Yields timeline_id and cleans up on teardown."""
    payload = {
        "title": f"TEST_BOLA_tl_{uuid.uuid4().hex[:6]}",
        "date": "2024-01-15",
        "category": "📸 Everyday Memories",
        "description": "BOLA test",
        "people": [],
        "media": [],
        "importance": False,
    }
    r = requests.post(f"{API}/timeline", json=payload, headers=_h(token_a), timeout=30)
    assert r.status_code in (200, 201), f"create timeline failed: {r.status_code} {r.text}"
    tid = r.json().get("timeline_id")
    assert tid, f"no timeline_id in response: {r.json()}"
    yield tid
    try:
        requests.delete(f"{API}/timeline/{tid}", headers=_h(token_a), timeout=30)
    except Exception:
        pass


@pytest.fixture(scope="module")
def message_a(token_a):
    """A message posted into family A's family chat. Yields message_id."""
    chats = requests.get(f"{API}/chats", headers=_h(token_a), timeout=30).json()
    assert isinstance(chats, list) and chats, "family A has no chats"
    # Prefer family chat
    fam_chat = next((c for c in chats if c.get("type") == "family"), chats[0])
    chat_id = fam_chat["chat_id"]
    body = {"text": f"TEST_BOLA_msg_{uuid.uuid4().hex[:6]}", "type": "text", "media": []}
    r = requests.post(f"{API}/chats/{chat_id}/messages", json=body, headers=_h(token_a), timeout=30)
    assert r.status_code in (200, 201), f"send message failed: {r.status_code} {r.text}"
    mid = r.json().get("message_id")
    assert mid, f"no message_id in response: {r.json()}"
    yield mid
    # no dedicated cleanup endpoint for messages; leave in family chat


# ===========================================================
# SECURITY: cross-family access on POST endpoints -> 404
# ===========================================================
class TestCrossFamilyPostBOLA:
    def test_list_comments_cross_family_returns_404(self, token_b, post_a):
        r = requests.get(f"{API}/posts/{post_a}/comments", headers=_h(token_b), timeout=30)
        assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text[:200]}"

    def test_add_comment_cross_family_returns_404(self, token_b, post_a):
        r = requests.post(f"{API}/posts/{post_a}/comments",
                          json={"text": "TEST_BOLA_attempt"}, headers=_h(token_b), timeout=30)
        assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text[:200]}"

    def test_react_post_cross_family_returns_404(self, token_b, post_a):
        r = requests.post(f"{API}/posts/{post_a}/react",
                          json={"type": "love"}, headers=_h(token_b), timeout=30)
        assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text[:200]}"

    def test_unreact_post_cross_family_returns_404(self, token_b, post_a):
        # unreact_post has NO existence guard; it calls back into get_post which does.
        r = requests.delete(f"{API}/posts/{post_a}/react", headers=_h(token_b), timeout=30)
        assert r.status_code == 404, f"expected 404 for cross-family unreact, got {r.status_code}: {r.text[:200]}"

    def test_no_cross_family_data_leak_side_effect(self, token_a, token_b, post_a):
        """Even if the cross-family write returned 404, verify no comment/reaction was written."""
        # attempt was already made in previous tests; re-run to be defensive
        requests.post(f"{API}/posts/{post_a}/comments",
                      json={"text": "TEST_BOLA_leak"}, headers=_h(token_b), timeout=30)
        requests.post(f"{API}/posts/{post_a}/react",
                      json={"type": "love"}, headers=_h(token_b), timeout=30)
        # As family A, list comments -- none of ours should be "TEST_BOLA_leak"
        r = requests.get(f"{API}/posts/{post_a}/comments", headers=_h(token_a), timeout=30)
        assert r.status_code == 200
        texts = [c.get("text") for c in r.json()]
        assert "TEST_BOLA_leak" not in texts, f"cross-family comment leaked into family A: {texts}"
        # And post's reaction_total from family A view should still be 0
        p = requests.get(f"{API}/posts/{post_a}", headers=_h(token_a), timeout=30).json()
        assert p.get("reaction_total", 0) == 0, f"cross-family reaction leaked, reaction_total={p.get('reaction_total')}"


# ===========================================================
# SECURITY: cross-family access on TIMELINE endpoints -> 404
# ===========================================================
class TestCrossFamilyTimelineBOLA:
    def test_get_timeline_cross_family_returns_404(self, token_b, timeline_a):
        r = requests.get(f"{API}/timeline/{timeline_a}", headers=_h(token_b), timeout=30)
        assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text[:200]}"

    def test_list_timeline_comments_cross_family_returns_404(self, token_b, timeline_a):
        r = requests.get(f"{API}/timeline/{timeline_a}/comments", headers=_h(token_b), timeout=30)
        assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text[:200]}"

    def test_add_timeline_comment_cross_family_returns_404(self, token_b, timeline_a):
        r = requests.post(f"{API}/timeline/{timeline_a}/comments",
                          json={"text": "TEST_BOLA_attempt"}, headers=_h(token_b), timeout=30)
        assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text[:200]}"

    def test_react_timeline_cross_family_returns_404(self, token_b, timeline_a):
        r = requests.post(f"{API}/timeline/{timeline_a}/react", headers=_h(token_b), timeout=30)
        assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text[:200]}"

    def test_no_cross_family_timeline_leak(self, token_a, token_b, timeline_a):
        # try again then verify family A view is untouched
        requests.post(f"{API}/timeline/{timeline_a}/comments",
                      json={"text": "TEST_BOLA_leak_tl"}, headers=_h(token_b), timeout=30)
        requests.post(f"{API}/timeline/{timeline_a}/react", headers=_h(token_b), timeout=30)
        r = requests.get(f"{API}/timeline/{timeline_a}/comments", headers=_h(token_a), timeout=30)
        assert r.status_code == 200
        assert "TEST_BOLA_leak_tl" not in [c.get("text") for c in r.json()]
        t = requests.get(f"{API}/timeline/{timeline_a}", headers=_h(token_a), timeout=30).json()
        assert t.get("love_count", 0) == 0, f"cross-family timeline reaction leaked, love_count={t.get('love_count')}"


# ===========================================================
# SECURITY: cross-family message reaction -> 404
# ===========================================================
class TestCrossFamilyMessageReactionBOLA:
    def test_react_message_cross_family_returns_404(self, token_b, message_a):
        r = requests.post(f"{API}/messages/{message_a}/react",
                          json={"emoji": "❤️"}, headers=_h(token_b), timeout=30)
        assert r.status_code == 404, f"expected 404 cross-family, got {r.status_code}: {r.text[:200]}"


# ===========================================================
# REGRESSION: legitimate same-family operations still work
# ===========================================================
class TestSameFamilyRegression:
    def test_post_comment_and_reaction_flow(self, token_a, post_a):
        # add a comment
        r = requests.post(f"{API}/posts/{post_a}/comments",
                          json={"text": "TEST_regression_comment"}, headers=_h(token_a), timeout=30)
        assert r.status_code in (200, 201), f"same-family comment failed: {r.status_code} {r.text}"
        cid = r.json().get("comment_id")
        assert cid, f"no comment_id in response: {r.json()}"
        # list comments
        r2 = requests.get(f"{API}/posts/{post_a}/comments", headers=_h(token_a), timeout=30)
        assert r2.status_code == 200
        assert "TEST_regression_comment" in [c.get("text") for c in r2.json()]
        # react
        r3 = requests.post(f"{API}/posts/{post_a}/react",
                           json={"type": "love"}, headers=_h(token_a), timeout=30)
        assert r3.status_code in (200, 201)
        assert r3.json().get("reaction_total", 0) >= 1
        assert r3.json().get("my_reaction") == "love"
        # unreact
        r4 = requests.delete(f"{API}/posts/{post_a}/react", headers=_h(token_a), timeout=30)
        assert r4.status_code in (200, 201)
        assert r4.json().get("my_reaction") is None

    def test_timeline_comment_and_reaction_flow(self, token_a, timeline_a):
        r = requests.post(f"{API}/timeline/{timeline_a}/comments",
                          json={"text": "TEST_regression_tl_comment"}, headers=_h(token_a), timeout=30)
        assert r.status_code in (200, 201), f"same-family tl comment failed: {r.status_code} {r.text}"
        assert r.json().get("comment_id")
        # list
        r2 = requests.get(f"{API}/timeline/{timeline_a}/comments", headers=_h(token_a), timeout=30)
        assert r2.status_code == 200
        assert "TEST_regression_tl_comment" in [c.get("text") for c in r2.json()]
        # react (toggle)
        r3 = requests.post(f"{API}/timeline/{timeline_a}/react", headers=_h(token_a), timeout=30)
        assert r3.status_code in (200, 201)
        assert r3.json().get("love_count", 0) >= 1
        # toggle off to keep state clean
        requests.post(f"{API}/timeline/{timeline_a}/react", headers=_h(token_a), timeout=30)

    def test_react_message_same_family_ok(self, token_a, message_a):
        r = requests.post(f"{API}/messages/{message_a}/react",
                          json={"emoji": "❤️"}, headers=_h(token_a), timeout=30)
        assert r.status_code in (200, 201), f"same-family msg react failed: {r.status_code} {r.text}"
        # toggle off (same emoji removes)
        requests.post(f"{API}/messages/{message_a}/react",
                      json={"emoji": "❤️"}, headers=_h(token_a), timeout=30)

    def test_two_different_families(self, family_ids):
        fa, fb = family_ids
        assert fa != fb, "test setup requires two different families"
