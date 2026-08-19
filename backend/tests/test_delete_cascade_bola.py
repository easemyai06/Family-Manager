"""
BOLA regression tests for cascade deletes on DELETE /api/posts/{post_id}
and DELETE /api/timeline/{timeline_id}.

Prior bug: cascade delete_many on reactions/comments did NOT include family_id,
so a family-B DELETE (which returned {"ok": true} without touching the parent
row) would still wipe family-A's comments+reactions for that id.

Fix under test (server.py lines 1847-1853 and 4133-4139): delete_many now
includes family_id.

Cases:
  A. Cross-family DELETE /api/posts/{A_post}   from B -> A's comments+reactions survive.
  B. Cross-family DELETE /api/timeline/{A_tl}  from B -> A's tl comments+reactions survive.
  C. Regression: same-family owner DELETE removes post + cascades comments/reactions.
  D. Regression: same-family owner DELETE removes timeline + cascades tl comments/reactions.

All test data is prefixed "TEST_CASCADE_" for identification.
"""
import os
import uuid
import requests
import pytest

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
    or "https://our-story-191.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"

FAMILY_A_EMAIL = "storytester@fam.com"
FAMILY_B_EMAIL = "protectdemo@fam.com"
PASSWORD = "secret123"


def _login(email: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token in response: {r.json()}"
    return tok


def _h(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def token_a() -> str:
    return _login(FAMILY_A_EMAIL)


@pytest.fixture(scope="module")
def token_b() -> str:
    return _login(FAMILY_B_EMAIL)


@pytest.fixture(scope="module")
def different_families(token_a, token_b):
    a = requests.get(f"{API}/auth/me", headers=_h(token_a), timeout=30).json()["user"]
    b = requests.get(f"{API}/auth/me", headers=_h(token_b), timeout=30).json()["user"]
    fa, fb = a.get("family_id"), b.get("family_id")
    assert fa and fb and fa != fb, f"need two different families, got A={fa} B={fb}"
    return fa, fb


# ---------- helpers ----------
def _create_post_with_activity(token: str) -> str:
    """Create a family-A post + 1 comment + 1 reaction. Returns post_id."""
    r = requests.post(
        f"{API}/posts",
        json={"caption": f"TEST_CASCADE_post_{uuid.uuid4().hex[:6]}", "media": [], "category": "everyday"},
        headers=_h(token), timeout=30,
    )
    assert r.status_code in (200, 201), f"create post failed: {r.status_code} {r.text}"
    pid = r.json().get("post_id")
    assert pid
    # comment
    c = requests.post(
        f"{API}/posts/{pid}/comments",
        json={"text": f"TEST_CASCADE_comment_{uuid.uuid4().hex[:4]}"},
        headers=_h(token), timeout=30,
    )
    assert c.status_code in (200, 201), f"add comment failed: {c.status_code} {c.text}"
    # reaction
    rx = requests.post(
        f"{API}/posts/{pid}/react",
        json={"type": "love"},
        headers=_h(token), timeout=30,
    )
    assert rx.status_code in (200, 201), f"react failed: {rx.status_code} {rx.text}"
    return pid


def _create_timeline_with_activity(token: str) -> str:
    r = requests.post(
        f"{API}/timeline",
        json={
            "title": f"TEST_CASCADE_tl_{uuid.uuid4().hex[:6]}",
            "date": "2024-01-15",
            "category": "📸 Everyday Memories",
            "description": "cascade bola test",
            "people": [], "media": [], "importance": False,
        },
        headers=_h(token), timeout=30,
    )
    assert r.status_code in (200, 201), f"create timeline failed: {r.status_code} {r.text}"
    tid = r.json().get("timeline_id")
    assert tid
    c = requests.post(
        f"{API}/timeline/{tid}/comments",
        json={"text": f"TEST_CASCADE_tlcomment_{uuid.uuid4().hex[:4]}"},
        headers=_h(token), timeout=30,
    )
    assert c.status_code in (200, 201), f"add tl comment failed: {c.status_code} {c.text}"
    rx = requests.post(f"{API}/timeline/{tid}/react", headers=_h(token), timeout=30)
    assert rx.status_code in (200, 201), f"tl react failed: {rx.status_code} {rx.text}"
    return tid


# ==========================================================================
# A. Cross-family DELETE /posts/{id} -- must NOT wipe family A's data
# ==========================================================================
class TestCrossFamilyPostDeleteCascade:
    def test_cross_family_post_delete_does_not_cascade(self, token_a, token_b, different_families):
        pid = _create_post_with_activity(token_a)
        try:
            # sanity: A sees 1 comment + reaction_total >= 1
            before_comments = requests.get(f"{API}/posts/{pid}/comments", headers=_h(token_a), timeout=30)
            assert before_comments.status_code == 200
            assert len(before_comments.json()) >= 1, f"setup: expected >=1 comment, got {before_comments.json()}"
            before_post = requests.get(f"{API}/posts/{pid}", headers=_h(token_a), timeout=30)
            assert before_post.status_code == 200
            assert before_post.json().get("reaction_total", 0) >= 1

            # ATTACK: family B deletes A's post
            del_r = requests.delete(f"{API}/posts/{pid}", headers=_h(token_b), timeout=30)
            # Endpoint returns {"ok": True} regardless (200) even if nothing matched
            assert del_r.status_code in (200, 204, 404), f"unexpected status: {del_r.status_code} {del_r.text}"

            # POST-CHECK: family A's data survives
            after_post = requests.get(f"{API}/posts/{pid}", headers=_h(token_a), timeout=30)
            assert after_post.status_code == 200, f"family A's post got deleted by family B! {after_post.status_code} {after_post.text}"
            assert after_post.json().get("reaction_total", 0) >= 1, (
                f"BOLA: family B's DELETE cascaded into family A's reactions. reaction_total={after_post.json().get('reaction_total')}"
            )
            after_comments = requests.get(f"{API}/posts/{pid}/comments", headers=_h(token_a), timeout=30)
            assert after_comments.status_code == 200
            texts = [c.get("text") for c in after_comments.json()]
            assert any((t or "").startswith("TEST_CASCADE_comment_") for t in texts), (
                f"BOLA: family B's DELETE wiped family A's comments. Remaining: {texts}"
            )
        finally:
            # cleanup as owner
            requests.delete(f"{API}/posts/{pid}", headers=_h(token_a), timeout=30)


# ==========================================================================
# B. Cross-family DELETE /timeline/{id} -- must NOT wipe family A's data
# ==========================================================================
class TestCrossFamilyTimelineDeleteCascade:
    def test_cross_family_timeline_delete_does_not_cascade(self, token_a, token_b, different_families):
        tid = _create_timeline_with_activity(token_a)
        try:
            # sanity
            before_comments = requests.get(f"{API}/timeline/{tid}/comments", headers=_h(token_a), timeout=30)
            assert before_comments.status_code == 200
            assert len(before_comments.json()) >= 1
            before_tl = requests.get(f"{API}/timeline/{tid}", headers=_h(token_a), timeout=30)
            assert before_tl.status_code == 200
            assert before_tl.json().get("love_count", 0) >= 1

            # ATTACK: family B deletes A's timeline
            del_r = requests.delete(f"{API}/timeline/{tid}", headers=_h(token_b), timeout=30)
            assert del_r.status_code in (200, 204, 404), f"unexpected status: {del_r.status_code} {del_r.text}"

            # POST-CHECK
            after_tl = requests.get(f"{API}/timeline/{tid}", headers=_h(token_a), timeout=30)
            assert after_tl.status_code == 200, f"family A's timeline got deleted by family B! {after_tl.status_code}"
            assert after_tl.json().get("love_count", 0) >= 1, (
                f"BOLA: family B's DELETE cascaded into family A's tl reactions. love_count={after_tl.json().get('love_count')}"
            )
            after_comments = requests.get(f"{API}/timeline/{tid}/comments", headers=_h(token_a), timeout=30)
            assert after_comments.status_code == 200
            texts = [c.get("text") for c in after_comments.json()]
            assert any((t or "").startswith("TEST_CASCADE_tlcomment_") for t in texts), (
                f"BOLA: family B's DELETE wiped family A's tl comments. Remaining: {texts}"
            )
        finally:
            requests.delete(f"{API}/timeline/{tid}", headers=_h(token_a), timeout=30)


# ==========================================================================
# C+D. Regression: same-family owner delete cascades correctly
# ==========================================================================
class TestOwnerDeleteCascade:
    def test_owner_post_delete_cascades_comments_and_reactions(self, token_a):
        pid = _create_post_with_activity(token_a)
        # sanity
        assert requests.get(f"{API}/posts/{pid}", headers=_h(token_a), timeout=30).status_code == 200

        # owner delete
        d = requests.delete(f"{API}/posts/{pid}", headers=_h(token_a), timeout=30)
        assert d.status_code in (200, 204), f"owner delete failed: {d.status_code} {d.text}"

        # post gone
        after = requests.get(f"{API}/posts/{pid}", headers=_h(token_a), timeout=30)
        assert after.status_code == 404, f"post still there after owner delete: {after.status_code}"

        # comments gone (endpoint 404s because post 404s; check with token_a)
        cr = requests.get(f"{API}/posts/{pid}/comments", headers=_h(token_a), timeout=30)
        # either 404 (post existence guard) or 200 with empty list
        if cr.status_code == 200:
            assert cr.json() == [], f"comments not cascaded: {cr.json()}"
        else:
            assert cr.status_code == 404, f"unexpected comments status: {cr.status_code}"

    def test_owner_timeline_delete_cascades_comments_and_reactions(self, token_a):
        tid = _create_timeline_with_activity(token_a)
        assert requests.get(f"{API}/timeline/{tid}", headers=_h(token_a), timeout=30).status_code == 200

        d = requests.delete(f"{API}/timeline/{tid}", headers=_h(token_a), timeout=30)
        assert d.status_code in (200, 204), f"owner tl delete failed: {d.status_code} {d.text}"

        after = requests.get(f"{API}/timeline/{tid}", headers=_h(token_a), timeout=30)
        assert after.status_code == 404, f"timeline still there after owner delete: {after.status_code}"

        cr = requests.get(f"{API}/timeline/{tid}/comments", headers=_h(token_a), timeout=30)
        if cr.status_code == 200:
            assert cr.json() == [], f"tl comments not cascaded: {cr.json()}"
        else:
            assert cr.status_code == 404, f"unexpected tl comments status: {cr.status_code}"
