"""FamilyHome — Private Family Super-App backend.

A single FastAPI service exposing auth, family, feed, stories, affection,
calendar, chores, shopping and to-do APIs backed by MongoDB, plus a rich
demo-family seeder and Emergent Object Storage media upload/serving.
"""
import os
import re
import uuid
import math
import secrets
import asyncio
import ipaddress
import logging
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse
from pathlib import Path
from datetime import datetime, timezone, timedelta, date

import jwt
import httpx
import requests
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Header, UploadFile, File, Form, Query, Request
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ReturnDocument
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from passlib.context import CryptContext

ROOT_DIR = Path(__file__).parent
from dotenv import load_dotenv
load_dotenv(ROOT_DIR / '.env')

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("familyhome")

# ---------------------------------------------------------------------------
# Config / clients
# ---------------------------------------------------------------------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGO = "HS256"
JWT_DAYS = 60

# Sign in with Apple — verify identity tokens against Apple's public JWKS.
# APPLE_AUDIENCES must include the iOS bundle id AND host.exp.Exponent (Expo Go).
APPLE_ISSUER = "https://appleid.apple.com"
APPLE_AUDIENCES = [a.strip() for a in os.environ.get(
    "APPLE_AUDIENCES", "com.emergent.ourstory.ff6oeh,host.exp.Exponent").split(",") if a.strip()]
_apple_jwks_client = jwt.PyJWKClient("https://appleid.apple.com/auth/keys")
# Optional Apple credentials — only needed to revoke tokens on account deletion
# (Apple guideline 5.1.1(v)). Supplied once the developer has an Apple account.
APPLE_TEAM_ID = os.environ.get("APPLE_TEAM_ID")
APPLE_KEY_ID = os.environ.get("APPLE_KEY_ID")
APPLE_PRIVATE_KEY = os.environ.get("APPLE_PRIVATE_KEY")   # raw contents of the .p8 key
APPLE_CLIENT_ID = os.environ.get("APPLE_CLIENT_ID", "com.emergent.ourstory.ff6oeh")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "familyhome"
_storage_key = None

# Emergent-managed push notifications (SuprSend relay).
PUSH_BASE_URL = "https://integrations.emergentagent.com"
PUSH_KEY = os.environ.get("EMERGENT_PUSH_KEY", "placeholder")
_push_client = httpx.AsyncClient(base_url=PUSH_BASE_URL, headers={"X-Push-Key": PUSH_KEY}, timeout=10.0)

# Emergent-managed email (Resend proxy). Base URL is a constant so it survives deployment.
EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY", "")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "FamilyHome")
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")

app = FastAPI(title="FamilyHome API")
api = APIRouter(prefix="/api")


# ---------------------------------------------------------------------------
# Email guardrail gate + sender (Resend playbook)
# ---------------------------------------------------------------------------
_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != real link host {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str) -> Optional[str]:
    """Best-effort transactional send. Never raises — email is non-critical."""
    if not EMAIL_KEY:
        logger.warning("email skipped: EMERGENT_EMAIL_KEY not set")
        return None
    try:
        _assert_safe_email(subject, html)
    except ValueError as e:
        logger.error(f"email blocked by guardrail: {e}")
        return None
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if EMAIL_REPLY_TO:
        payload["contact_email"] = EMAIL_REPLY_TO
    try:
        async with httpx.AsyncClient(timeout=30) as cl:
            resp = await cl.post(f"{EMAIL_BASE_URL}/api/v1/email/send",
                                 headers={"X-Email-Key": EMAIL_KEY}, json=payload)
        resp.raise_for_status()
        return resp.json().get("id")
    except Exception as e:
        logger.warning(f"email send failed (non-blocking): {e}")
        return None


def _public_base_url(request: Optional[Request]) -> str:
    """Public https base URL the client reached us on (for links in emails)."""
    if request is not None:
        host = request.headers.get("x-forwarded-host") or request.headers.get("host")
        proto = request.headers.get("x-forwarded-proto") or "https"
        if host:
            return f"{proto}://{host}"
    return (os.environ.get("APP_PUBLIC_URL") or "https://app.emergent.sh").rstrip("/")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id(prefix: str = "") -> str:
    return f"{prefix}{uuid.uuid4().hex[:16]}"


def make_token(user_id: str) -> str:
    payload = {"user_id": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=JWT_DAYS)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


# Short-lived, read-only, family-scoped token used ONLY in media URLs so the
# long-lived login token never travels in a URL (web <img>, documents, audio).
MEDIA_TOKEN_DAYS = 7


def make_media_token(user_id: str, family_id: Optional[str]) -> str:
    payload = {"user_id": user_id, "family_id": family_id, "scope": "media",
               "exp": datetime.now(timezone.utc) + timedelta(days=MEDIA_TOKEN_DAYS)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def _decode_token(raw: str) -> Optional[dict]:
    try:
        return jwt.decode(raw, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.PyJWTError:
        return None


def clean(doc: dict) -> dict:
    if doc:
        doc.pop("_id", None)
    return doc


async def get_current_user(authorization: Optional[str] = Header(None),
                           token: Optional[str] = Query(None)):
    raw = None
    if authorization and authorization.lower().startswith("bearer "):
        raw = authorization.split(" ", 1)[1].strip()
    elif token:
        raw = token
    if not raw:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(raw, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    # media-scoped tokens are read-only file tokens; never valid for the API
    if payload.get("scope") == "media":
        raise HTTPException(status_code=401, detail="Invalid token")
    # helper tokens are a separate principal — never valid on family-member routes
    if payload.get("account_type") == "helper":
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"user_id": payload.get("user_id")}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# ---------------------------------------------------------------------------
# Login brute-force throttle (MongoDB-backed, per-email + per-IP lockout)
# ---------------------------------------------------------------------------
THROTTLE_WINDOW = timedelta(minutes=10)
ACCOUNT_LOCK = timedelta(minutes=10)
THROTTLE_RETENTION = timedelta(days=1)
ACCOUNT_LIMIT = 5
# Real bcrypt hash used when a user doesn't exist, so timing doesn't leak account existence.
DUMMY_BCRYPT_HASH = pwd_context.hash("fixed-unusable-dummy-password")


# Number of trusted proxies (from the right of X-Forwarded-For) that append the
# real client. The left-most XFF entries are attacker-controlled, so we count in
# from the right instead of trusting the spoofable first hop. Default 1 = the k8s
# ingress. Our lockout is keyed on email+IP, so even if IPs collapse onto a shared
# proxy, only that specific email is throttled — sign-in is never globally blocked.
TRUSTED_PROXY_HOPS = max(1, int(os.environ.get("TRUSTED_PROXY_HOPS", "1")))


def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        parts = [p.strip() for p in xff.split(",") if p.strip()]
        if parts:
            idx = len(parts) - TRUSTED_PROXY_HOPS
            return parts[idx] if 0 <= idx < len(parts) else parts[-1]
    return request.client.host if request.client else "unknown"


async def _throttle_lock(tkey: str) -> Optional[datetime]:
    doc = await db.auth_throttles.find_one({"_id": tkey}, {"locked_until": 1})
    until = doc.get("locked_until") if doc else None
    if not until:
        return None
    if until.tzinfo is None:  # motor returns naive UTC
        until = until.replace(tzinfo=timezone.utc)
    return until if until > datetime.now(timezone.utc) else None


async def _reject_if_locked(*keys: str) -> None:
    locks = [x for x in await asyncio.gather(*[_throttle_lock(k) for k in keys]) if x]
    if locks:
        until = max(locks)
        secs = max(1, int((until - datetime.now(timezone.utc)).total_seconds()))
        raise HTTPException(status_code=429, detail="Too many login attempts. Please try again later.",
                            headers={"Retry-After": str(secs)})


async def _record_failure(tkey: str) -> None:
    lock_ms = int(ACCOUNT_LOCK.total_seconds() * 1000)
    window_ms = int(THROTTLE_WINDOW.total_seconds() * 1000)
    retention_ms = int(THROTTLE_RETENTION.total_seconds() * 1000)
    in_new_window = {"$or": [
        {"$eq": [{"$ifNull": ["$window_started_at", None]}, None]},
        {"$gte": ["$$NOW", {"$add": ["$window_started_at", window_ms]}]},
    ]}
    pipeline = [
        {"$set": {
            "failed_count": {"$cond": [in_new_window, 1, {"$add": [{"$ifNull": ["$failed_count", 0]}, 1]}]},
            "window_started_at": {"$cond": [in_new_window, "$$NOW", "$window_started_at"]},
            "updated_at": "$$NOW",
            "expires_at": {"$add": ["$$NOW", retention_ms]},
        }},
        {"$set": {
            "locked_until": {"$cond": [{"$gte": ["$failed_count", ACCOUNT_LIMIT]}, {"$add": ["$$NOW", lock_ms]}, None]},
        }},
    ]
    await db.auth_throttles.find_one_and_update(
        {"_id": tkey}, pipeline, upsert=True, return_document=ReturnDocument.AFTER)
    # Opportunistically purge expired ephemeral throttle records at request time
    # (not a startup TTL) so the collection stays bounded. Rate-limit decisions
    # rely on locked_until/window_started_at, never on this cleanup.
    await db.auth_throttles.delete_many({"expires_at": {"$lt": datetime.now(timezone.utc)}})


async def _clear_failures(*keys: str) -> None:
    await db.auth_throttles.delete_many({"_id": {"$in": list(keys)}})


async def member_for_user(user: dict) -> Optional[dict]:
    if not user.get("family_id"):
        return None
    return await db.members.find_one(
        {"family_id": user["family_id"], "linked_user_id": user["user_id"]}, {"_id": 0}
    )


def require_family(user: dict) -> str:
    fid = user.get("family_id")
    if not fid:
        raise HTTPException(status_code=400, detail="You are not part of a family yet")
    return fid


def _valid_pin(pin: Optional[str]) -> bool:
    return bool(pin) and pin.isdigit() and 4 <= len(pin) <= 6


# ---------------------------------------------------------------------------
# Object storage
# ---------------------------------------------------------------------------
def _init_storage():
    global _storage_key
    if _storage_key:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def _put_object(path: str, data: bytes, content_type: str) -> dict:
    key = _init_storage()
    resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key, "Content-Type": content_type},
                        data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()


def _get_object(path: str):
    key = _init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


def _delete_object(path: str):
    key = _init_storage()
    try:
        requests.delete(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key}, timeout=60)
    except Exception:
        pass


async def _delete_media_file(path: str):
    """Best-effort remove an uploaded object + its media record (frees storage)."""
    if not path:
        return
    try:
        await run_in_threadpool(_delete_object, path)
    except Exception:
        pass
    await db.media.delete_one({"storage_path": path})


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    password: str


class LoginIn(BaseModel):
    email: Optional[str] = None       # email OR username (kids use a username)
    username: Optional[str] = None
    password: str


class SessionIn(BaseModel):
    session_id: str


class AppleAuthIn(BaseModel):
    identity_token: str
    authorization_code: Optional[str] = None
    name: Optional[str] = None       # only sent by the client on first sign-in
    email: Optional[str] = None      # only sent by the client on first sign-in


class FamilyIn(BaseModel):
    name: str
    cover_photo: Optional[str] = None


class MemberIn(BaseModel):
    name: str
    relationship: str = "Member"
    role: str = "adult"            # admin | parent | child | adult
    color: Optional[str] = None
    birthday: Optional[str] = None  # YYYY-MM-DD
    photo_url: Optional[str] = None
    is_child: bool = False
    favorite_food: Optional[str] = None
    favorite_color: Optional[str] = None
    hobbies: Optional[str] = None


class MemberPatch(BaseModel):
    name: Optional[str] = None
    relationship: Optional[str] = None
    role: Optional[str] = None       # parent | child | adult (admin can't be set/changed here)
    color: Optional[str] = None
    birthday: Optional[str] = None
    photo_url: Optional[str] = None
    phone: Optional[str] = None
    favorite_food: Optional[str] = None
    favorite_color: Optional[str] = None
    hobbies: Optional[str] = None


class MemberStatusIn(BaseModel):
    status: Optional[str] = None          # home|work|school|travelling|busy|available|vacation|custom (None clears)
    status_emoji: Optional[str] = None
    status_label: Optional[str] = None
    status_note: Optional[str] = None


class ProfileIn(BaseModel):
    name: Optional[str] = None


class NoticeIn(BaseModel):
    title: str
    note: Optional[str] = None
    expiry_date: Optional[str] = None       # YYYY-MM-DD
    priority: str = "normal"                # normal | high
    pinned: bool = False
    photo_url: Optional[str] = None


class NoticePatch(BaseModel):
    title: Optional[str] = None
    note: Optional[str] = None
    expiry_date: Optional[str] = None
    priority: Optional[str] = None
    pinned: Optional[bool] = None
    photo_url: Optional[str] = None


class NoticeReactionIn(BaseModel):
    emoji: str


class NoticeReplyIn(BaseModel):
    text: str


class RsvpIn(BaseModel):
    status: str  # going | maybe | declined


class DashboardPrefsIn(BaseModel):
    order: List[str] = []
    hidden: List[str] = []
    pinned: List[str] = []
    compact: bool = False


class MediaItem(BaseModel):
    url: str
    type: str = "image"  # image | video


class PostIn(BaseModel):
    caption: Optional[str] = ""
    media: List[MediaItem] = []
    location: Optional[str] = None
    category: Optional[str] = None


class ReactIn(BaseModel):
    type: str  # love | adore | hug | kiss | proud | laugh | celebrate


class CommentIn(BaseModel):
    text: str


class StoryIn(BaseModel):
    media_url: str
    type: str = "image"
    caption: Optional[str] = None


class AffectionIn(BaseModel):
    to_member_id: Optional[str] = None  # None => whole family
    type: str
    message: Optional[str] = None


class EventIn(BaseModel):
    title: str
    date: str                       # YYYY-MM-DD
    end_date: Optional[str] = None
    start_time: Optional[str] = None  # HH:MM
    end_time: Optional[str] = None
    all_day: bool = False
    location: Optional[str] = None
    notes: Optional[str] = None
    category: Optional[str] = "family"
    owner_member_id: Optional[str] = None
    participant_ids: List[str] = []
    color: Optional[str] = None
    repeat: str = "none"                    # none | weekly | monthly
    repeat_end_date: Optional[str] = None   # YYYY-MM-DD (inclusive)
    repeat_count: Optional[int] = None      # number of occurrences incl. the first


class ChoreIn(BaseModel):
    title: str
    owner_member_id: str
    schedule: Optional[str] = "daily"
    stars: int = 1
    instructions: Optional[str] = None


class ShoppingListIn(BaseModel):
    name: str
    category: Optional[str] = "Grocery"


class ShoppingItemIn(BaseModel):
    name: str
    quantity: Optional[str] = None
    category: Optional[str] = None
    notes: Optional[str] = None


class TodoListIn(BaseModel):
    name: str


class TodoItemIn(BaseModel):
    title: str
    assignee_member_id: Optional[str] = None
    due_date: Optional[str] = None
    priority: Optional[str] = "normal"  # low | normal | high


class Ingredient(BaseModel):
    name: str
    quantity: Optional[str] = None


class RecipeIn(BaseModel):
    title: str
    description: Optional[str] = None
    photo_url: Optional[str] = None
    ingredients: List[Ingredient] = []
    prep_minutes: Optional[int] = None


class MealIn(BaseModel):
    week_start: str          # ISO date of the Monday
    day: int                 # 0=Mon .. 6=Sun
    slot: str                # breakfast | lunch | dinner
    recipe_id: str


class MealToShoppingIn(BaseModel):
    week_start: str
    list_id: Optional[str] = None


class WishItemIn(BaseModel):
    name: str
    photo_url: Optional[str] = None
    product_url: Optional[str] = None
    price: Optional[str] = None
    store: Optional[str] = None
    size: Optional[str] = None
    color: Optional[str] = None
    notes: Optional[str] = None
    priority: int = 2                       # 1=nice, 2=would love, 3=really want
    occasion: Optional[str] = None          # Birthday | Christmas | Diwali | Eid | ...
    category: Optional[str] = None          # Toys | Books | Experience | ...
    visibility: str = "family"              # family | parents | grandparents | selected
    visible_member_ids: List[str] = []


class WishReserveIn(BaseModel):
    reveal: bool = False


class WishStatusIn(BaseModel):
    status: str                             # reserved | purchased | received | wished


class WishNoteIn(BaseModel):
    text: str


class VaultFile(BaseModel):
    url: str
    type: str = "document"          # image | pdf | document
    name: Optional[str] = None


class VaultFolderIn(BaseModel):
    name: str
    icon: Optional[str] = "folder"


class VaultItemIn(BaseModel):
    kind: str = "document"          # document | insurance
    title: str
    folder_id: Optional[str] = None
    owner_member_id: Optional[str] = None
    notes: Optional[str] = None
    tags: List[str] = []
    issue_date: Optional[str] = None
    expiry_date: Optional[str] = None
    files: List[VaultFile] = []
    visibility: str = "family"      # family | parents | grandparents | selected
    visible_member_ids: List[str] = []
    # insurance-specific (all optional)
    provider: Optional[str] = None
    policy_number: Optional[str] = None
    policy_holder: Optional[str] = None
    coverage_amount: Optional[str] = None
    premium: Optional[str] = None
    agent_contact: Optional[str] = None
    claims_number: Optional[str] = None
    emergency_number: Optional[str] = None
    website: Optional[str] = None
    covered_member_ids: List[str] = []


class EmergencyContactIn(BaseModel):
    name: str
    relationship: Optional[str] = None       # relationship or organization
    phone: str
    alt_phone: Optional[str] = None
    whatsapp: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    icon: Optional[str] = None                # emoji
    critical: bool = False
    member_id: Optional[str] = None


class EmergencyInstructionIn(BaseModel):
    title: str
    icon: Optional[str] = "🚨"
    steps: List[str] = []
    contact_ids: List[str] = []


class FamilyPlanIn(BaseModel):
    home_address: Optional[str] = None
    meeting_point: Optional[str] = None
    alt_meeting_point: Optional[str] = None
    parent_numbers: Optional[str] = None
    neighbour: Optional[str] = None
    school_contact: Optional[str] = None
    doctor: Optional[str] = None
    hospital: Optional[str] = None
    insurance_number: Optional[str] = None
    building_security: Optional[str] = None
    notes: Optional[str] = None


class InsuranceEntryIn(BaseModel):
    type: str                                # health | critical | term | vehicle
    provider: Optional[str] = None
    policy_number: Optional[str] = None
    phone: Optional[str] = None


class MedicalCardIn(BaseModel):
    member_id: str
    blood_group: Optional[str] = None
    allergies: Optional[str] = None
    medication: Optional[str] = None
    conditions: Optional[str] = None
    doctor: Optional[str] = None
    doctor_phone: Optional[str] = None
    hospital: Optional[str] = None
    insurance_provider: Optional[str] = None
    policy_reference: Optional[str] = None
    insurance: List[InsuranceEntryIn] = []
    emergency_contact: Optional[str] = None


class SosTriggerIn(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    message: Optional[str] = None


class DelegateIn(BaseModel):
    member_id: str


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    email: EmailStr
    code: str
    new_password: str


class PinSetIn(BaseModel):
    pin: str


class PinLoginIn(BaseModel):
    user_id: Optional[str] = None
    member_id: Optional[str] = None
    pin: str


class ChildCredentialsIn(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    pin: Optional[str] = None





# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------
def public_user(u: dict) -> dict:
    return {
        "user_id": u["user_id"], "name": u.get("name"), "email": u.get("email"),
        "picture": u.get("picture"), "family_id": u.get("family_id"),
        "apple_linked": bool(u.get("apple_sub")),
    }


@api.post("/auth/register")
async def register(body: RegisterIn):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists")
    uid = new_id("user_")
    doc = {
        "user_id": uid, "name": body.name.strip(), "email": body.email.lower(),
        "password_hash": pwd_context.hash(body.password), "picture": None,
        "family_id": None, "provider": "email", "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    return {"token": make_token(uid), "user": public_user(doc)}


@api.post("/auth/login")
async def login(body: LoginIn, request: Request):
    ident = (body.email or body.username or "").lower().strip()
    if not ident or not body.password:
        raise HTTPException(status_code=400, detail="Enter your email/username and password")
    ip = _client_ip(request)
    # Key the lockout on identifier+IP so an attacker can't lock a victim out from a
    # different network, and a shared ingress IP can never globally block sign-in.
    key = f"acct:{ident}:{ip}"
    await _reject_if_locked(key)
    u = await db.users.find_one({"email": ident}) if "@" in ident else await db.users.find_one({"username": ident})
    stored = u.get("password_hash") if (u and u.get("password_hash")) else DUMMY_BCRYPT_HASH
    ok = pwd_context.verify(body.password, stored)
    if not u or not ok:
        await _record_failure(key)
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    await _clear_failures(key)
    return {"token": make_token(u["user_id"]), "user": public_user(u)}


@api.post("/auth/session")
async def google_session(body: SessionIn):
    async with httpx.AsyncClient(timeout=30) as hc:
        r = await hc.get("https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                         headers={"X-Session-ID": body.session_id})
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session")
    data = r.json()
    email = (data.get("email") or "").lower()
    u = await db.users.find_one({"email": email})
    if not u:
        uid = new_id("user_")
        u = {
            "user_id": uid, "name": data.get("name"), "email": email,
            "password_hash": None, "picture": data.get("picture"),
            "family_id": None, "provider": "google", "created_at": now_iso(),
        }
        await db.users.insert_one(u)
    return {"token": make_token(u["user_id"]), "user": public_user(u)}


# --- Sign in with Apple (iOS) ---------------------------------------------
def _verify_apple_identity_token(identity_token: str) -> dict:
    """Verify an Apple identity token against Apple's JWKS (RS256). Sync -> threadpool."""
    signing_key = _apple_jwks_client.get_signing_key_from_jwt(identity_token)
    return jwt.decode(
        identity_token, signing_key.key, algorithms=["RS256"],
        audience=APPLE_AUDIENCES, issuer=APPLE_ISSUER,
    )


def _apple_client_secret() -> Optional[str]:
    """Signed client secret for Apple's token endpoints. None unless creds present."""
    if not (APPLE_TEAM_ID and APPLE_KEY_ID and APPLE_PRIVATE_KEY):
        return None
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"iss": APPLE_TEAM_ID, "iat": now, "exp": now + timedelta(minutes=10),
         "aud": APPLE_ISSUER, "sub": APPLE_CLIENT_ID},
        APPLE_PRIVATE_KEY, algorithm="ES256", headers={"kid": APPLE_KEY_ID},
    )


async def _apple_exchange_refresh_token(code: str) -> Optional[str]:
    """Exchange a native authorization code for a refresh token (needs Apple creds)."""
    secret = _apple_client_secret()
    if not (secret and code):
        return None
    try:
        async with httpx.AsyncClient(timeout=15) as cl:
            r = await cl.post("https://appleid.apple.com/auth/token", data={
                "client_id": APPLE_CLIENT_ID, "client_secret": secret,
                "code": code, "grant_type": "authorization_code"})
        if r.status_code == 200:
            return r.json().get("refresh_token")
        logger.warning(f"apple token exchange failed: {r.status_code} {r.text[:180]}")
    except Exception as e:
        logger.warning(f"apple token exchange error: {e}")
    return None


async def _apple_revoke_user(u: dict) -> None:
    """Best-effort token revocation on account deletion (Apple 5.1.1(v))."""
    secret = _apple_client_secret()
    rt = u.get("apple_refresh_token")
    if not (secret and rt):
        return
    try:
        async with httpx.AsyncClient(timeout=15) as cl:
            await cl.post("https://appleid.apple.com/auth/revoke", data={
                "client_id": APPLE_CLIENT_ID, "client_secret": secret,
                "token": rt, "token_type_hint": "refresh_token"})
    except Exception as e:
        logger.warning(f"apple revoke error: {e}")


@api.post("/auth/apple")
async def apple_auth(body: AppleAuthIn):
    try:
        claims = await run_in_threadpool(_verify_apple_identity_token, body.identity_token)
    except Exception as e:
        logger.warning(f"apple token verify failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid Apple token")
    apple_sub = claims.get("sub")
    if not apple_sub:
        raise HTTPException(status_code=401, detail="Invalid Apple token")
    # Use ONLY the verified email from Apple's token — never trust the client-supplied
    # field, and never auto-link to an existing account by email (that risks takeover).
    ev = claims.get("email_verified")
    email_verified = ev is True or (isinstance(ev, str) and ev.lower() == "true")
    email = ((claims.get("email") or "").lower() or None) if email_verified else None

    u = await db.users.find_one({"apple_sub": apple_sub})
    if not u:
        # If a different account already owns this email, do NOT hijack it — send the
        # user to sign in with their original method and link Apple from Settings.
        if email and await db.users.find_one({"email": email}):
            raise HTTPException(
                status_code=409,
                detail="An account with this email already exists. Sign in with your original method, then link Apple in Settings.",
            )
        uid = new_id("user_")
        u = {
            "user_id": uid,
            "name": (body.name or "").strip() or (email.split("@")[0] if email else "Member"),
            "email": email, "password_hash": None, "picture": None,
            "family_id": None, "provider": "apple", "apple_sub": apple_sub,
            "created_at": now_iso(),
        }
        await db.users.insert_one(u)
    elif body.name and not u.get("name"):
        await db.users.update_one({"user_id": u["user_id"]}, {"$set": {"name": body.name.strip()}})
    # best-effort: capture a refresh token so we can revoke on delete (needs Apple creds)
    if body.authorization_code:
        rt = await _apple_exchange_refresh_token(body.authorization_code)
        if rt:
            await db.users.update_one({"user_id": u["user_id"]}, {"$set": {"apple_refresh_token": rt}})
    u = await db.users.find_one({"user_id": u["user_id"]}, {"_id": 0})
    return {"token": make_token(u["user_id"]), "user": public_user(u)}


@api.post("/auth/apple/link")
async def apple_link(body: AppleAuthIn, user: dict = Depends(get_current_user)):
    """Attach an Apple ID to the signed-in account so they can also sign in with Apple."""
    try:
        claims = await run_in_threadpool(_verify_apple_identity_token, body.identity_token)
    except Exception as e:
        logger.warning(f"apple link verify failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid Apple token")
    apple_sub = claims.get("sub")
    if not apple_sub:
        raise HTTPException(status_code=401, detail="Invalid Apple token")
    other = await db.users.find_one({"apple_sub": apple_sub})
    if other and other["user_id"] != user["user_id"]:
        raise HTTPException(status_code=409, detail="This Apple ID is already linked to another account")
    set_fields = {"apple_sub": apple_sub}
    if body.authorization_code:
        rt = await _apple_exchange_refresh_token(body.authorization_code)
        if rt:
            set_fields["apple_refresh_token"] = rt
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": set_fields})
    u = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return {"ok": True, "user": public_user(u)}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    member = await member_for_user(user)
    fchat = None
    if user.get("family_id"):
        fchat = await db.chats.find_one(
            {"family_id": user["family_id"], "type": "family"}, {"chat_id": 1, "_id": 0})
    return {"user": public_user(user), "member": member,
            "pin_set": bool(user.get("pin_hash")),
            "family_chat_id": fchat.get("chat_id") if fchat else None,
            "media_token": make_media_token(user["user_id"], user.get("family_id"))}


# ---------------------------------------------------------------------------
# Password reset (emailed 6-digit code) + PIN login
# ---------------------------------------------------------------------------
def _reset_email_html(code: str) -> str:
    return f"""<!DOCTYPE html><html><body style="margin:0;background:#FBF7F2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2b2b2b;">
<div style="max-width:480px;margin:0 auto;padding:32px 22px;">
  <div style="color:#E05A5A;font-weight:800;font-size:20px;letter-spacing:.3px;">FamilyHome</div>
  <h1 style="font-size:22px;margin:18px 0 6px;">Reset your password</h1>
  <p style="color:#555;line-height:1.6;margin:0 0 18px;">Use the code below to reset your FamilyHome password. It expires in 15 minutes.</p>
  <div style="background:#fff;border:1px solid #eadfd4;border-radius:14px;padding:20px;text-align:center;">
    <div style="font-size:34px;font-weight:800;letter-spacing:10px;color:#2b2b2b;">{code}</div>
  </div>
  <p style="color:#8a8a8a;font-size:13px;line-height:1.6;margin:18px 0 0;">If you didn't request this, you can safely ignore this email — your password stays the same. FamilyHome will never contact you asking for your password.</p>
  <div style="margin-top:28px;padding-top:16px;border-top:1px solid #eadfd4;color:#8a8a8a;font-size:12px;">FamilyHome · by Ease My Ai Pvt Ltd</div>
</div></body></html>"""


@api.post("/auth/forgot-password")
async def forgot_password(body: ForgotPasswordIn, request: Request):
    """Email a 6-digit reset code. Always returns ok so we never leak whether an
    email is registered. Rate-limited per email+IP to stop code spamming."""
    email = body.email.lower().strip()
    ip = _client_ip(request)
    key = f"pwreset:{email}:{ip}"
    await _reject_if_locked(key)
    u = await db.users.find_one({"email": email})
    if u and u.get("email"):
        code = f"{secrets.randbelow(900000) + 100000}"
        expires = datetime.now(timezone.utc) + timedelta(minutes=15)
        await db.password_resets.replace_one(
            {"email": email},
            {"email": email, "code_hash": pwd_context.hash(code), "expires_at": expires,
             "attempts": 0, "created_at": now_iso()}, upsert=True)
        await send_email(to=email, subject="Your FamilyHome reset code", html=_reset_email_html(code))
    await _record_failure(key)
    return {"ok": True}


@api.post("/auth/reset-password")
async def reset_password(body: ResetPasswordIn, request: Request):
    email = body.email.lower().strip()
    if len((body.new_password or "")) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    ip = _client_ip(request)
    key = f"pwresetverify:{email}:{ip}"
    await _reject_if_locked(key)
    doc = await db.password_resets.find_one({"email": email})
    exp = doc.get("expires_at") if doc else None
    if exp and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    valid = bool(doc and exp and exp > datetime.now(timezone.utc) and doc.get("attempts", 0) < 5
                 and pwd_context.verify(body.code.strip(), doc.get("code_hash", "")))
    if not valid:
        if doc:
            await db.password_resets.update_one({"email": email}, {"$inc": {"attempts": 1}})
        await _record_failure(key)
        raise HTTPException(status_code=400, detail="That reset code is invalid or has expired")
    u = await db.users.find_one({"email": email})
    if not u:
        raise HTTPException(status_code=400, detail="That reset code is invalid or has expired")
    await db.users.update_one({"user_id": u["user_id"]},
                              {"$set": {"password_hash": pwd_context.hash(body.new_password)}})
    await db.password_resets.delete_one({"email": email})
    await _clear_failures(key, f"acct:{email}:{ip}")
    return {"token": make_token(u["user_id"]), "user": public_user(u)}


@api.post("/auth/pin")
async def set_pin(body: PinSetIn, user: dict = Depends(get_current_user)):
    """Set a quick-unlock PIN for the signed-in account."""
    if not _valid_pin(body.pin):
        raise HTTPException(status_code=400, detail="PIN must be 4–6 digits")
    await db.users.update_one({"user_id": user["user_id"]},
                              {"$set": {"pin_hash": pwd_context.hash(body.pin)}})
    return {"ok": True, "pin_set": True}


@api.delete("/auth/pin")
async def clear_pin(user: dict = Depends(get_current_user)):
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"pin_hash": None}})
    return {"ok": True, "pin_set": False}


@api.post("/auth/pin-login")
async def pin_login(body: PinLoginIn, request: Request):
    """Sign in with a PIN — either quick-unlock (user_id, known to the device) or a
    kid picking their name (member_id). Strictly throttled since PINs are short."""
    ip = _client_ip(request)
    if body.user_id:
        u = await db.users.find_one({"user_id": body.user_id})
        subj = body.user_id
    elif body.member_id:
        m = await db.members.find_one({"member_id": body.member_id})
        u = await db.users.find_one({"user_id": m["linked_user_id"]}) if (m and m.get("linked_user_id")) else None
        subj = body.member_id
    else:
        raise HTTPException(status_code=400, detail="Missing account")
    key = f"pin:{subj}:{ip}"
    await _reject_if_locked(key)
    stored = u.get("pin_hash") if (u and u.get("pin_hash")) else DUMMY_BCRYPT_HASH
    ok = _valid_pin(body.pin) and pwd_context.verify(body.pin, stored)
    if not u or not u.get("pin_hash") or not ok:
        await _record_failure(key)
        raise HTTPException(status_code=401, detail="Incorrect PIN")
    await _clear_failures(key)
    return {"token": make_token(u["user_id"]), "user": public_user(u)}


# ---------------------------------------------------------------------------
# Notifications Center — unified recent family-activity inbox
# ---------------------------------------------------------------------------
def _bday_in_days(bday: Optional[str], today: date) -> Optional[int]:
    if not bday:
        return None
    try:
        parts = str(bday).split("-")
        mo, da = int(parts[-2]), int(parts[-1])
        this_year = date(today.year, mo, da)
        nxt = this_year if this_year >= today else date(today.year + 1, mo, da)
        return (nxt - today).days
    except Exception:
        return None


async def _gather_notifications(fid: str, my_member_id: Optional[str], limit: int = 60,
                                viewer_role: Optional[str] = None,
                                secure_viewer: Optional[dict] = None):
    since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    members = await db.members.find({"family_id": fid}, {"_id": 0}).to_list(200)
    mmap = {m["member_id"]: m for m in members}

    def actor(mid):
        m = mmap.get(mid)
        if not m:
            return None
        return {"member_id": mid, "name": m.get("name"), "photo_url": m.get("photo_url"), "color": m.get("color")}

    def fname(mid):
        m = mmap.get(mid)
        return ((m.get("name") or "Someone").split(" ")[0]) if m else "Someone"

    items = []
    for p in await db.posts.find({"family_id": fid, "created_at": {"$gte": since}}, {"_id": 0}).sort("created_at", -1).to_list(20):
        mid = p.get("author_member_id")
        if mid == my_member_id:
            continue
        has_media = bool(p.get("media"))
        items.append({"id": p["post_id"], "type": "post", "emoji": "📸" if has_media else "📝",
                      "title": f"{fname(mid)} shared {'a photo' if has_media else 'an update'}",
                      "subtitle": ((p.get("caption") or "").strip()[:90] or None),
                      "actor": actor(mid), "created_at": p["created_at"], "route": f"/post/{p['post_id']}"})
    for t in await db.timeline.find({"family_id": fid, "created_at": {"$gte": since}}, {"_id": 0}).sort("created_at", -1).to_list(15):
        mid = t.get("created_by")
        if mid == my_member_id:
            continue
        items.append({"id": t["timeline_id"], "type": "memory", "emoji": "📖",
                      "title": f"{fname(mid)} added a memory", "subtitle": t.get("title"),
                      "actor": actor(mid), "created_at": t["created_at"], "route": "/timeline"})
    seen_series, ev_n = set(), 0
    for e in await db.events.find({"family_id": fid, "created_at": {"$gte": since}}, {"_id": 0}).sort("created_at", -1).to_list(30):
        mid = e.get("owner_member_id")
        if mid == my_member_id:
            continue
        sid = e.get("series_id")
        if sid and sid in seen_series:
            continue
        if sid:
            seen_series.add(sid)
        items.append({"id": e["event_id"], "type": "event", "emoji": "📅",
                      "title": f"{fname(mid)} added an event", "subtitle": f"{e.get('title')} · {e.get('date')}",
                      "actor": actor(mid), "created_at": e["created_at"], "route": f"/event/{e['event_id']}"})
        ev_n += 1
        if ev_n >= 12:
            break
    for n in await db.notices.find({"family_id": fid, "created_at": {"$gte": since}}, {"_id": 0}).sort("created_at", -1).to_list(15):
        mid = n.get("owner_member_id")
        if mid == my_member_id:
            continue
        items.append({"id": n["notice_id"], "type": "notice", "emoji": "📌" if n.get("pinned") else "🗒️",
                      "title": f"{fname(mid)} posted a note", "subtitle": n.get("title"),
                      "actor": actor(mid), "created_at": n["created_at"], "route": f"/notice/{n['notice_id']}"})
    aq = {"family_id": fid, "created_at": {"$gte": since},
          "$or": [{"to_member_id": my_member_id}, {"is_family": True}]}
    for a in await db.affections.find(aq, {"_id": 0}).sort("created_at", -1).to_list(20):
        mid = a.get("from_member_id")
        if mid == my_member_id:
            continue
        label = AFFECTION_LABELS.get(a.get("type"), "❤️ Love")
        emoji = label.split(" ")[0]
        word = label.split(" ", 1)[-1].lower()
        who = "the family" if a.get("is_family") else "you"
        items.append({"id": a["affection_id"], "type": "affection", "emoji": emoji,
                      "title": f"{fname(mid)} sent {who} {word}",
                      "subtitle": ((a.get("message") or "").strip()[:90] or None),
                      "actor": actor(mid), "created_at": a["created_at"], "route": "/affection/send"})
    for cc in await db.chore_completions.find({"family_id": fid, "created_at": {"$gte": since}}, {"_id": 0}).sort("created_at", -1).to_list(15):
        mid = cc.get("member_id")
        if mid == my_member_id:
            continue
        items.append({"id": cc.get("completion_id") or f"{cc.get('chore_id','')}{cc.get('created_at','')}",
                      "type": "chore", "emoji": "⭐", "title": f"{fname(mid)} finished a chore",
                      "subtitle": cc.get("title") or "Earned a star",
                      "actor": actor(mid), "created_at": cc["created_at"], "route": "/chores"})
    fchat = await db.chats.find_one({"family_id": fid, "type": "family"}, {"_id": 0})
    if fchat:
        for msg in await db.messages.find(
                {"chat_id": fchat["chat_id"], "created_at": {"$gte": since},
                 "sender_member_id": {"$ne": my_member_id}}, {"_id": 0}).sort("created_at", -1).to_list(8):
            mid = msg.get("sender_member_id")
            txt = msg.get("text") or ("🎤 Voice message" if msg.get("type") == "voice"
                                      else "📷 Photo" if msg.get("media") else "❤️")
            items.append({"id": msg["message_id"], "type": "message", "emoji": "💬",
                          "title": f"{fname(mid)} messaged the family", "subtitle": (txt or "")[:90],
                          "actor": actor(mid), "created_at": msg["created_at"],
                          "route": f"/chat/{fchat['chat_id']}?name=Family%20Chat"})
    if viewer_role in ("admin", "parent"):
        for ev in await db.helper_events.find(
                {"family_id": fid, "created_at": {"$gte": since}}, {"_id": 0}).sort("created_at", -1).to_list(25):
            items.append({"id": ev["event_id"], "type": "helper", "emoji": ev.get("emoji") or "🔔",
                          "title": ev.get("title"), "subtitle": ev.get("subtitle"),
                          "actor": None, "created_at": ev.get("created_at"),
                          "route": ev.get("route") or "/(tabs)/family"})
    # Vault expiry reminders — warn a few days early (respects per-item visibility).
    if secure_viewer:
        today_anchor = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        for d in await db.vault_items.find(
                {"family_id": fid, "expiry_date": {"$ne": None}}, {"_id": 0}).to_list(2000):
            du = _days_until(d.get("expiry_date"))
            if du is None or du > 14 or du < -14:
                continue
            if not _can_view_secure(d, secure_viewer):
                continue
            title = d.get("title") or "A document"
            if du > 1:
                when = f"expires in {du} days"
            elif du == 1:
                when = "expires tomorrow"
            elif du == 0:
                when = "expires today"
            elif du == -1:
                when = "expired yesterday"
            else:
                when = f"expired {abs(du)} days ago"
            items.append({"id": f"vaultexp_{d['item_id']}", "type": "vault_expiry",
                          "emoji": "⏰" if du >= 0 else "⚠️",
                          "title": f"{title} {when}",
                          "subtitle": "Tap to review it in the Family Vault",
                          "actor": None, "created_at": today_anchor,
                          "route": f"/vault/item/{d['item_id']}"})
    items.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    activity = items[:limit]

    bdays = []
    today = datetime.now(timezone.utc).date()
    for m in members:
        d = _bday_in_days(m.get("birthday"), today)
        if d is not None and 0 <= d <= 7:
            when = "today 🎉" if d == 0 else ("tomorrow" if d == 1 else f"in {d} days")
            bdays.append({"id": f"bday_{m['member_id']}_{today.year}", "type": "birthday", "emoji": "🎂",
                          "title": f"{(m.get('name') or 'Someone').split(' ')[0]}'s birthday is {when}",
                          "subtitle": "Tap to send a little love", "actor": actor(m["member_id"]),
                          "created_at": now_iso(), "route": "/affection/send"})
    return bdays, activity


@api.get("/notifications")
async def list_notifications(user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    myid = mine["member_id"] if mine else None
    viewer = await _secure_viewer(user)
    bdays, activity = await _gather_notifications(fid, myid, viewer_role=(mine or {}).get("role"), secure_viewer=viewer)
    last_read = user.get("notifications_last_read") or ""
    unread = sum(1 for i in activity if (i.get("created_at") or "") > last_read)
    return {"items": bdays + activity, "unread_count": unread, "last_read": last_read}


@api.post("/notifications/read")
async def read_notifications(user: dict = Depends(get_current_user)):
    require_family(user)
    await db.users.update_one({"user_id": user["user_id"]},
                              {"$set": {"notifications_last_read": now_iso()}})
    return {"ok": True}


@api.get("/notifications/unread")
async def notifications_unread(user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    myid = mine["member_id"] if mine else None
    viewer = await _secure_viewer(user)
    _, activity = await _gather_notifications(fid, myid, viewer_role=(mine or {}).get("role"), secure_viewer=viewer)
    last_read = user.get("notifications_last_read") or ""
    return {"count": sum(1 for i in activity if (i.get("created_at") or "") > last_read)}


# ---------------------------------------------------------------------------
# Family & members
# ---------------------------------------------------------------------------
DEFAULT_COLORS = ["#FF6B6B", "#D98E5A", "#A3B18A", "#FFD166", "#8AB07D", "#C96F4A", "#B5835A", "#6B8E5A"]


def new_invite_code() -> str:
    # 10 hex chars (~40 bits) so codes aren't trivially enumerable.
    return uuid.uuid4().hex[:10].upper()


# Light per-user rate limit on invite-code preview to stop code enumeration.
PREVIEW_LIMIT = 20
PREVIEW_WINDOW = timedelta(minutes=10)


async def _preview_rate_ok(user_id: str) -> bool:
    now = datetime.now(timezone.utc)
    doc = await db.preview_throttles.find_one({"_id": user_id})
    started = doc.get("window_started_at") if doc else None
    if started and started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    if doc and started and now < started + PREVIEW_WINDOW:
        if doc.get("count", 0) >= PREVIEW_LIMIT:
            return False
        await db.preview_throttles.update_one({"_id": user_id}, {"$inc": {"count": 1}})
        return True
    await db.preview_throttles.update_one(
        {"_id": user_id}, {"$set": {"window_started_at": now, "count": 1}}, upsert=True)
    return True


@api.post("/families")
async def create_family(body: FamilyIn, user: dict = Depends(get_current_user)):
    if user.get("family_id"):
        raise HTTPException(status_code=400, detail="You already belong to a family")
    fid = new_id("fam_")
    fam = {
        "family_id": fid, "name": body.name.strip(), "cover_photo": body.cover_photo,
        "created_by": user["user_id"], "invite_code": new_invite_code(),
        "created_at": now_iso(),
    }
    await db.families.insert_one(fam)
    # creator becomes the admin member
    member = {
        "member_id": new_id("mem_"), "family_id": fid, "name": user.get("name") or "Me",
        "relationship": "Parent", "role": "admin", "color": DEFAULT_COLORS[0],
        "birthday": None, "photo_url": user.get("picture"), "is_child": False,
        "linked_user_id": user["user_id"], "favorite_food": None,
        "favorite_color": None, "hobbies": None, "created_at": now_iso(),
    }
    await db.members.insert_one(member)
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"family_id": fid}})
    return clean(fam)


@api.get("/families/me")
async def my_family(user: dict = Depends(get_current_user)):
    fid = require_family(user)
    fam = await db.families.find_one({"family_id": fid}, {"_id": 0})
    viewer = await member_for_user(user)
    raw = await db.members.find({"family_id": fid}, {"_id": 0}).to_list(200)
    linked_ids = [m.get("linked_user_id") for m in raw if m.get("linked_user_id")]
    umap = {}
    if linked_ids:
        async for uu in db.users.find(
            {"user_id": {"$in": linked_ids}},
            {"user_id": 1, "pin_hash": 1, "username": 1, "email": 1, "provider": 1, "_id": 0}):
            umap[uu["user_id"]] = uu
    members = []
    for m in raw:
        lu = umap.get(m.get("linked_user_id"))
        m["joined"] = bool(m.get("linked_user_id"))
        m["is_me"] = bool(viewer) and m.get("member_id") == viewer.get("member_id")
        m["has_login"] = bool(m.get("linked_user_id"))
        m["has_pin"] = bool(lu and lu.get("pin_hash"))
        m["username"] = lu.get("username") if lu else None
        m["login_email"] = lu.get("email") if lu else None
        # A parent can only create/reset a login for members that don't yet have one,
        # or for parent-managed child accounts — never for self-owned (email/Google/
        # Apple) accounts. Admin is always self-managed.
        m["manage_login"] = m.get("role") != "admin" and (not lu or lu.get("provider") == "child")
        members.append(m)
    return {
        "family": fam,
        "members": members,
        "viewer_member_id": viewer.get("member_id") if viewer else None,
        "viewer_role": viewer.get("role") if viewer else None,
        "can_manage": bool(viewer and viewer.get("role") in ("admin", "parent")),
    }


@api.get("/families/members")
async def list_members(user: dict = Depends(get_current_user)):
    fid = require_family(user)
    return await db.members.find({"family_id": fid}, {"_id": 0}).to_list(200)


@api.post("/families/members")
async def add_member(body: MemberIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    viewer = await member_for_user(user)
    if not (viewer and viewer.get("role") in ("admin", "parent")):
        raise HTTPException(status_code=403, detail="Only parents can add family members")
    # Role is limited to parent/child/adult — an 'admin' can never be minted here
    # (prevents a claimed pending profile from granting organizer power).
    if body.role not in ("parent", "child", "adult"):
        raise HTTPException(status_code=400, detail="Invalid role")
    count = await db.members.count_documents({"family_id": fid})
    member = {
        "member_id": new_id("mem_"), "family_id": fid, "name": body.name.strip(),
        "relationship": body.relationship, "role": body.role,
        "color": body.color or DEFAULT_COLORS[count % len(DEFAULT_COLORS)],
        "birthday": body.birthday, "photo_url": body.photo_url,
        "is_child": body.is_child or body.role == "child",
        "linked_user_id": None, "favorite_food": body.favorite_food,
        "favorite_color": body.favorite_color, "hobbies": body.hobbies,
        "created_at": now_iso(),
    }
    await db.members.insert_one(member)
    return clean(member)


@api.get("/families/members/{member_id}")
async def get_member(member_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    m = await db.members.find_one({"member_id": member_id, "family_id": fid}, {"_id": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Member not found")
    posts = await db.posts.find({"family_id": fid, "author_member_id": member_id}, {"_id": 0}).sort("created_at", -1).to_list(50)
    stars = await db.chore_completions.count_documents({"family_id": fid, "member_id": member_id})
    return {"member": m, "posts": posts, "stars": stars}


@api.patch("/families/members/{member_id}")
async def patch_member(member_id: str, body: MemberPatch, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    if not mine or (mine["member_id"] != member_id and mine.get("role") not in ("admin", "parent")):
        raise HTTPException(status_code=403, detail="Not allowed to edit this member")
    updates = {k: v for k, v in body.dict().items() if v is not None}
    if body.role is not None:
        # Role changes are an admin/parent action only, limited to parent/child/adult,
        # and the family admin's role is protected.
        if mine.get("role") not in ("admin", "parent"):
            raise HTTPException(status_code=403, detail="Only parents or admins can change roles")
        if body.role not in ("parent", "child", "adult"):
            raise HTTPException(status_code=400, detail="Invalid role")
        target = await db.members.find_one({"member_id": member_id, "family_id": fid}, {"_id": 0})
        if target and target.get("role") == "admin":
            raise HTTPException(status_code=403, detail="The family admin's role can't be changed")
        updates["is_child"] = body.role == "child"
    if updates:
        await db.members.update_one({"member_id": member_id, "family_id": fid}, {"$set": updates})
    return await db.members.find_one({"member_id": member_id, "family_id": fid}, {"_id": 0})


@api.delete("/families/members/{member_id}")
async def remove_member(member_id: str, user: dict = Depends(get_current_user)):
    """Admin/parent removes a family member. Joined members are unlinked from the
    family (they keep their login but must re-join); pending members are deleted.
    You can't remove yourself or the family admin."""
    fid = require_family(user)
    mine = await member_for_user(user)
    if not (mine and mine.get("role") in ("admin", "parent")):
        raise HTTPException(status_code=403, detail="Only parents or admins can remove members")
    target = await db.members.find_one({"member_id": member_id, "family_id": fid}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")
    if target["member_id"] == mine["member_id"]:
        raise HTTPException(status_code=400, detail="You can't remove yourself")
    if target.get("role") == "admin":
        raise HTTPException(status_code=403, detail="The family admin can't be removed")
    if target.get("linked_user_id"):
        await db.users.update_one({"user_id": target["linked_user_id"]}, {"$set": {"family_id": None}})
    await db.members.delete_one({"member_id": member_id, "family_id": fid})
    return {"ok": True}


@api.post("/families/members/{member_id}/credentials")
async def set_member_credentials(member_id: str, body: ChildCredentialsIn,
                                 user: dict = Depends(get_current_user)):
    """Parent/admin sets or resets a member's login (username + password + PIN).
    Mainly for children who have no email — they sign in with a username/PIN."""
    fid = require_family(user)
    mine = await member_for_user(user)
    if not (mine and mine.get("role") in ("admin", "parent")):
        raise HTTPException(status_code=403, detail="Only parents or admins can manage member logins")
    target = await db.members.find_one({"member_id": member_id, "family_id": fid}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")
    if target.get("role") == "admin":
        raise HTTPException(status_code=403, detail="The family organizer manages their own login")
    if body.pin not in (None, "") and not _valid_pin(body.pin):
        raise HTTPException(status_code=400, detail="PIN must be 4–6 digits")
    if body.password not in (None, "") and len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    username = (body.username or "").strip().lower() or None
    if username:
        if not re.fullmatch(r"[a-z0-9_.]{3,20}", username):
            raise HTTPException(status_code=400, detail="Username must be 3–20 letters, numbers, dots or underscores")
        clash = await db.users.find_one({"username": username})
        if clash and clash.get("user_id") != target.get("linked_user_id"):
            raise HTTPException(status_code=400, detail="That username is already taken")

    luid = target.get("linked_user_id")
    if not luid:
        if not username:
            raise HTTPException(status_code=400, detail="Choose a username for this member")
        if not body.password and not body.pin:
            raise HTTPException(status_code=400, detail="Set a password or a PIN")
        luid = new_id("user_")
        # NOTE: intentionally omit `email` (rather than setting it to None) so the
        # `sparse=True` unique index on users.email skips these child accounts —
        # otherwise the 2nd child user for the same family would collide on
        # `email: null` and raise DuplicateKeyError (a 500).
        await db.users.insert_one({
            "user_id": luid, "name": target.get("name") or "Member",
            "username": username,
            "password_hash": pwd_context.hash(body.password) if body.password else None,
            "pin_hash": pwd_context.hash(body.pin) if body.pin else None,
            "picture": target.get("photo_url"), "family_id": fid, "provider": "child",
            "created_at": now_iso(),
        })
        await db.members.update_one({"member_id": member_id, "family_id": fid},
                                    {"$set": {"linked_user_id": luid}})
    else:
        existing = await db.users.find_one({"user_id": luid}, {"_id": 0})
        # Only parent-managed CHILD accounts can be reset here. Never overwrite an
        # account the member set up themselves (email / Google / Apple) — otherwise a
        # parent could silently take over another adult member's account.
        if not existing or existing.get("provider") != "child":
            raise HTTPException(
                status_code=403,
                detail="This member signed in with their own account, so only they can change their login")
        updates = {}
        if username:
            updates["username"] = username
        if body.password:
            updates["password_hash"] = pwd_context.hash(body.password)
        if body.pin:
            updates["pin_hash"] = pwd_context.hash(body.pin)
        if updates:
            await db.users.update_one({"user_id": luid}, {"$set": updates})
    lu = await db.users.find_one({"user_id": luid}, {"_id": 0})
    return {"ok": True, "member_id": member_id, "username": lu.get("username"),
            "has_pin": bool(lu.get("pin_hash")), "has_password": bool(lu.get("password_hash"))}


@api.patch("/families/members/{member_id}/status")
async def set_member_status(member_id: str, body: MemberStatusIn, user: dict = Depends(get_current_user)):
    """Manually set a family member's availability status. Self, or a parent/admin for anyone."""
    fid = require_family(user)
    mine = await member_for_user(user)
    if not mine or (mine["member_id"] != member_id and mine.get("role") not in ("admin", "parent")):
        raise HTTPException(status_code=403, detail="You can only update your own status")
    m = await db.members.find_one({"member_id": member_id, "family_id": fid}, {"_id": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Member not found")
    updates = {
        "status": body.status,
        "status_emoji": body.status_emoji,
        "status_label": body.status_label,
        "status_note": (body.status_note or "").strip() or None,
        "status_updated_at": now_iso() if body.status else None,
    }
    await db.members.update_one({"member_id": member_id, "family_id": fid}, {"$set": updates})
    return await db.members.find_one({"member_id": member_id, "family_id": fid}, {"_id": 0})


@api.patch("/auth/profile")
async def update_profile(body: ProfileIn, user: dict = Depends(get_current_user)):
    """Update the signed-in user's display name (kept in sync with their member)."""
    updates = {}
    if body.name and body.name.strip():
        updates["name"] = body.name.strip()
    if updates:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": updates})
        if user.get("family_id"):
            await db.members.update_one(
                {"family_id": user["family_id"], "linked_user_id": user["user_id"]},
                {"$set": {"name": updates["name"]}})
    u = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return {"user": public_user(u)}


@api.delete("/auth/account")
async def delete_account(user: dict = Depends(get_current_user)):
    """
    Permanently delete the signed-in user's account (App Store / Play Store requirement).
    - Family organizer (admin): the whole family space + all its data is removed.
    - Anyone else: only their own login + member profile + preferences are removed.
    """
    uid = user["user_id"]
    fid = user.get("family_id")
    mine = await member_for_user(user)
    is_admin = bool(mine and mine.get("role") == "admin")

    # Sign in with Apple requires revoking the user's Apple token on deletion.
    if user.get("provider") == "apple":
        await _apple_revoke_user(user)

    if fid and is_admin:
        # gather every user linked to this family (for prefs cleanup) BEFORE purging
        fam_users = await db.users.find({"family_id": fid}, {"user_id": 1, "_id": 0}).to_list(1000)
        fuids = [u.get("user_id") for u in fam_users if u.get("user_id")]
        # purge every collection that stores data for this family
        for name in await db.list_collection_names():
            try:
                await db[name].delete_many({"family_id": fid})
            except Exception:
                pass
        await db.families.delete_one({"family_id": fid})
        if fuids:
            await db.dashboard_prefs.delete_many({"user_id": {"$in": fuids}})
        # make sure this user is gone even if they weren't tagged with family_id
        await db.users.delete_one({"user_id": uid})
    else:
        if mine:
            await db.members.delete_one({"member_id": mine["member_id"], "family_id": fid})
        await db.users.delete_one({"user_id": uid})
        await db.dashboard_prefs.delete_many({"user_id": uid})

    return {"ok": True, "scope": "family" if is_admin else "self"}


@api.get("/family/export")
async def export_family(user: dict = Depends(get_current_user)):
    """Organizer-only: a full JSON copy of the family's data (e.g. before deleting)."""
    fid = require_family(user)
    mine = await member_for_user(user)
    if not (mine and mine.get("role") == "admin"):
        raise HTTPException(status_code=403, detail="Only the family organizer can export data")
    fam = await db.families.find_one({"family_id": fid}, {"_id": 0})
    collections: dict = {}
    for name in sorted(await db.list_collection_names()):
        if name == "families":
            continue
        try:
            docs = await db[name].find({"family_id": fid}, {"_id": 0}).to_list(10000)
        except Exception:
            docs = []
        if not docs:
            continue
        if name == "users":  # never export credentials
            for d in docs:
                d.pop("password_hash", None)
                d.pop("pin_hash", None)
        collections[name] = docs
    return {
        "app": "FamilyHome",
        "publisher": "Ease My Ai Pvt Ltd",
        "exported_at": now_iso(),
        "family": fam,
        "collections": collections,
    }


# ---------------------------------------------------------------------------
# Public legal pages (no auth) — hostable Privacy Policy / Terms for the stores
# ---------------------------------------------------------------------------
def _legal_html(title: str, updated: str, intro: str, sections: list) -> str:
    body = "".join(f"<h2>{h}</h2><p>{p}</p>" for h, p in sections)
    return f"""<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>{title} · FamilyHome</title>
<style>
  :root {{ color-scheme: light; }}
  * {{ box-sizing: border-box; }}
  body {{ margin:0; background:#FBF7F2; color:#2b2b2b;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    line-height:1.6; }}
  .wrap {{ max-width:760px; margin:0 auto; padding:40px 22px 72px; }}
  .brand {{ color:#E05A5A; font-weight:800; letter-spacing:.3px; }}
  h1 {{ font-size:28px; margin:8px 0 4px; }}
  .updated {{ color:#8a8a8a; font-size:13px; margin-bottom:24px; }}
  .intro {{ font-size:16px; color:#444; }}
  h2 {{ font-size:18px; margin:28px 0 6px; }}
  p {{ margin:0 0 4px; color:#333; }}
  a {{ color:#E05A5A; }}
  footer {{ margin-top:44px; padding-top:18px; border-top:1px solid #eadfd4; color:#8a8a8a; font-size:13px; }}
</style></head>
<body><div class="wrap">
  <div class="brand">FamilyHome</div>
  <h1>{title}</h1>
  <div class="updated">Last updated: {updated}</div>
  <p class="intro">{intro}</p>
  {body}
  <footer>FamilyHome · by Ease My Ai Pvt Ltd · <a href="mailto:info@easemyai.com">info@easemyai.com</a></footer>
</div></body></html>"""


_PRIVACY_SECTIONS = [
    ("1. Information you provide", "When you create an account we collect your name, email address and a securely hashed password. Inside the app you may add family content such as posts, photos and videos, calendar events, chores, shopping and to-do lists, meal plans, recipes, memories, wish lists, and sensitive family records like documents, insurance, medical cards and emergency contacts. You choose what to add."),
    ("2. How we use your information", "We use your information only to provide the app&rsquo;s features to you and your family &mdash; for example to show your calendar, sync your lists, deliver family chat messages and reminders, and keep your Family Vault and emergency information available to the right people. We do not sell your personal data and we do not use it for advertising."),
    ("3. Who can see your data", "Your content is visible only to members of your family group. Some items (such as private Vault documents, medical cards and secret gifts) have additional visibility controls that you set. A parent may grant a trusted adult view-only emergency access; this can be turned off at any time."),
    ("4. Storage and security", "Data is stored on secure, access-controlled cloud infrastructure. Uploaded photos, videos and documents are kept in private object storage and are not publicly listed. Passwords are stored only as salted hashes. While no online service can be guaranteed 100% secure, we take reasonable technical and organisational measures to protect your data."),
    ("5. Service providers", "We rely on trusted third parties strictly to operate the app &mdash; for example cloud hosting and database, private media storage, transactional email delivery (calendar invites), and push-notification delivery. These providers process data only on our behalf."),
    ("6. Children", "FamilyHome is designed to be used by families. Child profiles and any information about children are created and managed by a parent or guardian within the family group. Children are not asked to provide personal information directly, and child content stays within the private family group."),
    ("7. Data retention and deletion", "You can delete your account at any time from More &rarr; Account &amp; Data &rarr; Delete Account. Deleting a member-only account removes your login and profile. If you are the family organizer, deleting your account permanently removes the entire family space and all of its data. Deletions are permanent and cannot be undone."),
    ("8. Your rights", "You may access, correct or delete your information from within the app, and organizers can export a full copy of their family data. To request help exercising any privacy right, contact us using the details below."),
    ("9. Changes to this policy", "We may update this policy from time to time. Material changes will be reflected here with a new &ldquo;Last updated&rdquo; date. Continued use of the app after changes means you accept the updated policy."),
    ("10. Contact us", "Ease My Ai Pvt Ltd &mdash; email <a href=\"mailto:info@easemyai.com\">info@easemyai.com</a> for any privacy questions or requests."),
]

_TERMS_SECTIONS = [
    ("1. The service", "FamilyHome is a private family-organisation app that helps your family coordinate calendars, chores, lists, meals, memories, documents and emergency information. Features may change or be improved over time."),
    ("2. Eligibility", "You must be at least 18 years old, or of legal age in your country, to create an account. By creating a family you confirm you are authorised to add and manage information about your family members, including any child profiles."),
    ("3. Your account", "You are responsible for keeping your login credentials secure and for all activity under your account. Please provide accurate information and keep it up to date. Notify us promptly of any unauthorised use."),
    ("4. Acceptable use", "You agree to use FamilyHome lawfully and respectfully. Do not upload content that is illegal, infringing, or that you do not have the right to share, and do not attempt to disrupt, reverse engineer or gain unauthorised access to the service or other families&rsquo; data."),
    ("5. Your content", "You keep ownership of the content you add. You grant us a limited licence to store, process and display that content solely to operate the app for you and your family. You are responsible for the content you and your family members contribute."),
    ("6. Privacy", "Your use of the app is also governed by our Privacy Policy, which explains how we handle your information. Please review it alongside these terms."),
    ("7. Account deletion", "You may delete your account at any time from within the app. If you are the family organizer, deleting your account permanently removes the whole family space and its data. We may suspend or terminate accounts that violate these terms."),
    ("8. Disclaimers", "FamilyHome is provided &ldquo;as is&rdquo;. It is a family-organisation tool and is not a substitute for professional medical, legal or emergency services. In a real emergency, always contact your local emergency number first."),
    ("9. Limitation of liability", "To the maximum extent permitted by law, Ease My Ai Pvt Ltd is not liable for any indirect, incidental or consequential damages arising from your use of the app, or for any loss of data beyond our reasonable control."),
    ("10. Changes and governing law", "We may update these terms; material changes will be posted here with a new date. These terms are governed by the laws of India. Questions? Email <a href=\"mailto:info@easemyai.com\">info@easemyai.com</a>."),
]


@api.get("/legal/privacy")
async def public_privacy():
    intro = "FamilyHome is operated by Ease My Ai Pvt Ltd (&ldquo;we&rdquo;, &ldquo;us&rdquo;). We built FamilyHome as a private space for your family, so protecting your information matters to us. This policy explains what we collect, why, and the choices you have."
    return Response(content=_legal_html("Privacy Policy", "June 2026", intro, _PRIVACY_SECTIONS),
                    media_type="text/html; charset=utf-8")


@api.get("/legal/terms")
async def public_terms():
    intro = "These Terms of Use govern your use of FamilyHome, provided by Ease My Ai Pvt Ltd. By creating an account or using the app, you agree to these terms."
    return Response(content=_legal_html("Terms of Use", "June 2026", intro, _TERMS_SECTIONS),
                    media_type="text/html; charset=utf-8")


@api.get("/families/invite")
async def get_invite(user: dict = Depends(get_current_user)):
    fid = require_family(user)
    fam = await db.families.find_one({"family_id": fid})
    code = fam.get("invite_code")
    if not code:
        # backfill a code for demo/legacy families created before invite codes existed
        code = new_invite_code()
        await db.families.update_one({"family_id": fid}, {"$set": {"invite_code": code}})
    return {"invite_code": code, "family_name": fam["name"]}


@api.get("/families/preview")
async def preview_family(code: str, user: dict = Depends(get_current_user)):
    """Look up a family by invite code (before joining) so a new member can pick
    the pending profile that represents them instead of creating a duplicate."""
    if not await _preview_rate_ok(user["user_id"]):
        raise HTTPException(status_code=429, detail="Too many invite lookups. Please try again shortly.")
    code = (code or "").strip().upper()
    fam = await db.families.find_one({"invite_code": code}, {"_id": 0})
    if not fam:
        raise HTTPException(status_code=404, detail="Invalid invite code")
    pend = await db.members.find(
        {"family_id": fam["family_id"], "linked_user_id": None}, {"_id": 0}
    ).to_list(200)
    fields = ("member_id", "name", "relationship", "role", "photo_url", "color", "is_child")
    members = []
    for m in pend:
        row = {k: m.get(k) for k in fields}
        if m.get("is_child"):
            row["photo_url"] = None  # don't expose children's photos to a mere code holder
        members.append(row)
    return {"family_name": fam["name"], "pending_members": members}


@api.post("/families/join")
async def join_family(body: dict, user: dict = Depends(get_current_user)):
    if user.get("family_id"):
        raise HTTPException(status_code=400, detail="You already belong to a family")
    code = (body.get("code") or "").strip().upper()
    fam = await db.families.find_one({"invite_code": code}, {"_id": 0})
    if not fam:
        raise HTTPException(status_code=404, detail="Invalid invite code")
    fid = fam["family_id"]
    claim_id = body.get("claim_member_id")
    if claim_id:
        # Claim an existing pending profile instead of creating a new member.
        target = await db.members.find_one({"member_id": claim_id, "family_id": fid}, {"_id": 0})
        if not target or target.get("linked_user_id"):
            raise HTTPException(status_code=400, detail="That profile is no longer available to claim")
        updates = {"linked_user_id": user["user_id"]}
        if not target.get("photo_url") and user.get("picture"):
            updates["photo_url"] = user["picture"]
        await db.members.update_one({"member_id": claim_id, "family_id": fid}, {"$set": updates})
    else:
        count = await db.members.count_documents({"family_id": fid})
        member = {
            "member_id": new_id("mem_"), "family_id": fid, "name": user.get("name") or "Me",
            "relationship": "Member", "role": "adult",
            "color": DEFAULT_COLORS[count % len(DEFAULT_COLORS)], "birthday": None,
            "photo_url": user.get("picture"), "is_child": False,
            "linked_user_id": user["user_id"], "created_at": now_iso(),
        }
        await db.members.insert_one(member)
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"family_id": fid}})
    return {"family": fam}


# ---------------------------------------------------------------------------
# Feed / posts
# ---------------------------------------------------------------------------
async def hydrate_post(post: dict, fid: str, my_member_id: Optional[str]) -> dict:
    author = await db.members.find_one({"member_id": post["author_member_id"]}, {"_id": 0})
    reactions = await db.reactions.find({"post_id": post["post_id"]}, {"_id": 0}).to_list(500)
    summary = {}
    my_reaction = None
    for r in reactions:
        summary[r["type"]] = summary.get(r["type"], 0) + 1
        if my_member_id and r["member_id"] == my_member_id:
            my_reaction = r["type"]
    comment_count = await db.comments.count_documents({"post_id": post["post_id"]})
    post = clean(dict(post))
    post["author"] = author
    post["reaction_summary"] = summary
    post["reaction_total"] = sum(summary.values())
    post["my_reaction"] = my_reaction
    post["comment_count"] = comment_count
    return post


@api.get("/posts")
async def list_posts(user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    my_id = mine["member_id"] if mine else None
    posts = await db.posts.find({"family_id": fid}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [await hydrate_post(p, fid, my_id) for p in posts]


@api.post("/posts")
async def create_post(body: PostIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    if not mine:
        raise HTTPException(status_code=400, detail="No family profile")
    post = {
        "post_id": new_id("post_"), "family_id": fid, "author_member_id": mine["member_id"],
        "caption": body.caption or "", "media": [m.dict() for m in body.media],
        "location": body.location, "category": body.category, "created_at": now_iso(),
    }
    await db.posts.insert_one(post)
    return await hydrate_post(post, fid, mine["member_id"])


@api.get("/posts/{post_id}")
async def get_post(post_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    my_id = mine["member_id"] if mine else None
    post = await db.posts.find_one({"post_id": post_id, "family_id": fid}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    return await hydrate_post(post, fid, my_id)


@api.delete("/posts/{post_id}")
async def delete_post(post_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    await db.posts.delete_one({"post_id": post_id, "family_id": fid})
    await db.reactions.delete_many({"post_id": post_id})
    await db.comments.delete_many({"post_id": post_id})
    return {"ok": True}


@api.post("/posts/{post_id}/react")
async def react_post(post_id: str, body: ReactIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    if not mine:
        raise HTTPException(status_code=400, detail="No family profile")
    await db.reactions.update_one(
        {"post_id": post_id, "member_id": mine["member_id"]},
        {"$set": {"type": body.type, "created_at": now_iso(), "family_id": fid}},
        upsert=True,
    )
    return await get_post(post_id, user)


@api.delete("/posts/{post_id}/react")
async def unreact_post(post_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    if mine:
        await db.reactions.delete_one({"post_id": post_id, "member_id": mine["member_id"]})
    return await get_post(post_id, user)


@api.get("/posts/{post_id}/comments")
async def list_comments(post_id: str, user: dict = Depends(get_current_user)):
    require_family(user)
    comments = await db.comments.find({"post_id": post_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    out = []
    for c in comments:
        author = await db.members.find_one({"member_id": c["member_id"]}, {"_id": 0})
        c["author"] = author
        out.append(c)
    return out


@api.post("/posts/{post_id}/comments")
async def add_comment(post_id: str, body: CommentIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    if not mine:
        raise HTTPException(status_code=400, detail="No family profile")
    c = {
        "comment_id": new_id("cmt_"), "post_id": post_id, "family_id": fid,
        "member_id": mine["member_id"], "text": body.text, "created_at": now_iso(),
    }
    await db.comments.insert_one(c)
    c = clean(c)
    c["author"] = mine
    return c


# ---------------------------------------------------------------------------
# Stories
# ---------------------------------------------------------------------------
@api.get("/stories")
async def list_stories(user: dict = Depends(get_current_user)):
    fid = require_family(user)
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    stories = await db.stories.find({"family_id": fid, "created_at": {"$gte": cutoff}}, {"_id": 0}).sort("created_at", 1).to_list(200)
    grouped = {}
    for s in stories:
        author = await db.members.find_one({"member_id": s["author_member_id"]}, {"_id": 0})
        mid = s["author_member_id"]
        if mid not in grouped:
            grouped[mid] = {"member": author, "stories": []}
        grouped[mid]["stories"].append(s)
    return list(grouped.values())


@api.post("/stories")
async def create_story(body: StoryIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    if not mine:
        raise HTTPException(status_code=400, detail="No family profile")
    s = {
        "story_id": new_id("story_"), "family_id": fid, "author_member_id": mine["member_id"],
        "media_url": body.media_url, "type": body.type, "caption": body.caption,
        "created_at": now_iso(),
    }
    await db.stories.insert_one(s)
    return clean(s)


# ---------------------------------------------------------------------------
# Affection
# ---------------------------------------------------------------------------
AFFECTION_LABELS = {
    "hug": "🤗 Hug", "kiss": "😘 Kiss", "love": "❤️ Love", "lots_of_love": "🥰 Lots of Love",
    "miss_you": "🫶 Miss You", "thinking_of_you": "🌹 Thinking of You", "proud": "⭐ Proud of You",
    "got_this": "💪 You've Got This", "good_morning": "🌞 Good Morning", "good_night": "🌙 Good Night",
    "birthday_love": "🎂 Birthday Love", "congrats": "🎉 Congratulations",
}


@api.post("/affection")
async def send_affection(body: AffectionIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    if not mine:
        raise HTTPException(status_code=400, detail="No family profile")
    if body.to_member_id:
        targets = [body.to_member_id]
        is_family = False
    else:
        members = await db.members.find({"family_id": fid}, {"_id": 0}).to_list(200)
        targets = [m["member_id"] for m in members if m["member_id"] != mine["member_id"]]
        is_family = True
    created = []
    for t in targets:
        a = {
            "affection_id": new_id("aff_"), "family_id": fid, "from_member_id": mine["member_id"],
            "to_member_id": t, "type": body.type, "message": body.message,
            "is_family": is_family, "seen": False, "created_at": now_iso(),
        }
        await db.affections.insert_one(a)
        created.append(clean(a))
    return {"sent": len(created), "is_family": is_family}


@api.get("/affection/inbox")
async def affection_inbox(user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    if not mine:
        return {"unseen": [], "recent": []}
    unseen = await db.affections.find(
        {"family_id": fid, "to_member_id": mine["member_id"], "seen": False}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    recent = await db.affections.find(
        {"family_id": fid, "to_member_id": mine["member_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    for lst in (unseen, recent):
        for a in lst:
            a["from"] = await db.members.find_one({"member_id": a["from_member_id"]}, {"_id": 0})
    return {"unseen": unseen, "recent": recent}


@api.post("/affection/{affection_id}/seen")
async def mark_affection_seen(affection_id: str, user: dict = Depends(get_current_user)):
    await db.affections.update_one({"affection_id": affection_id}, {"$set": {"seen": True}})
    return {"ok": True}


@api.get("/affection/timeline")
async def affection_timeline(user: dict = Depends(get_current_user)):
    fid = require_family(user)
    cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    items = await db.affections.find({"family_id": fid, "created_at": {"$gte": cutoff}}, {"_id": 0}).to_list(2000)
    members = {m["member_id"]: m for m in await db.members.find({"family_id": fid}, {"_id": 0}).to_list(200)}
    agg = {}
    for a in items:
        key = (a["from_member_id"], a["to_member_id"], a["type"])
        agg[key] = agg.get(key, 0) + 1
    rows = []
    for (frm, to, typ), count in sorted(agg.items(), key=lambda x: -x[1]):
        rows.append({
            "from": members.get(frm), "to": members.get(to),
            "type": typ, "label": AFFECTION_LABELS.get(typ, typ), "count": count,
        })
    return {"week": rows}


# ---------------------------------------------------------------------------
# Calendar / events
# ---------------------------------------------------------------------------
def _add_months(d: date, n: int) -> date:
    from calendar import monthrange
    m = d.month - 1 + n
    y = d.year + m // 12
    m = m % 12 + 1
    return date(y, m, min(d.day, monthrange(y, m)[1]))


def _recurrence_dates(start: date, repeat: str, end: Optional[date], count: Optional[int]) -> List[date]:
    """Concrete occurrence dates for a repeating event. Bounded for safety."""
    if repeat not in ("weekly", "monthly"):
        return [start]
    cap = count if count else (52 if end else 12)
    cap = max(1, min(cap, 366))
    out: List[date] = []
    i = 0
    while len(out) < cap:
        d = start + timedelta(days=7 * i) if repeat == "weekly" else _add_months(start, i)
        if end is not None and d > end:
            break
        out.append(d)
        i += 1
    return out or [start]


async def hydrate_event(e: dict, viewer: Optional[dict] = None) -> dict:
    raw_rsvps = e.get("rsvps") or {}
    e = clean(dict(e))
    parts = []
    for pid in e.get("participant_ids", []):
        m = await db.members.find_one({"member_id": pid}, {"_id": 0})
        if m:
            parts.append(m)
    e["participants"] = parts
    if e.get("owner_member_id"):
        e["owner"] = await db.members.find_one({"member_id": e["owner_member_id"]}, {"_id": 0})
    summary = {"going": 0, "maybe": 0, "declined": 0}
    rsvp_list = []
    for mid, st in raw_rsvps.items():
        if st in summary:
            summary[st] += 1
        m = await db.members.find_one({"member_id": mid}, {"_id": 0})
        if m:
            rsvp_list.append({"member": _member_card(m), "status": st})
    e["rsvps"] = rsvp_list
    e["rsvp_summary"] = summary
    e["my_rsvp"] = raw_rsvps.get(viewer["member_id"]) if viewer else None
    # invited members who haven't responded yet (for host reminders)
    invited = list(e.get("participant_ids") or [])
    if e.get("owner_member_id") and e["owner_member_id"] not in invited:
        invited.append(e["owner_member_id"])
    awaiting = []
    for mid in invited:
        if mid in raw_rsvps:
            continue
        m = await db.members.find_one({"member_id": mid}, {"_id": 0})
        if m:
            awaiting.append(_member_card(m))
    e["awaiting"] = awaiting
    e["awaiting_count"] = len(awaiting)
    return e


def _ics_escape(s: Optional[str]) -> str:
    return (s or "").replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;").replace("\n", "\\n")


def build_event_ics(e: dict, organizer_email: Optional[str] = None) -> str:
    """Build an iCalendar (.ics) REQUEST for an event so it drops into any calendar."""
    uid = f"{e['event_id']}@familyhome"
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    date_s = (e.get("date") or "")[:10]
    end_s = (e.get("end_date") or e.get("date") or "")[:10]
    if e.get("all_day"):
        try:
            end_excl = (date.fromisoformat(end_s) + timedelta(days=1)).isoformat()
        except Exception:
            end_excl = end_s
        dtstart = f"DTSTART;VALUE=DATE:{date_s.replace('-', '')}"
        dtend = f"DTEND;VALUE=DATE:{end_excl.replace('-', '')}"
    else:
        st = (e.get("start_time") or "09:00").replace(":", "")[:4]
        et = (e.get("end_time") or e.get("start_time") or "10:00").replace(":", "")[:4]
        dtstart = f"DTSTART:{date_s.replace('-', '')}T{st}00"
        dtend = f"DTEND:{end_s.replace('-', '')}T{et}00"
    lines = [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//FamilyHome//EN", "CALSCALE:GREGORIAN", "METHOD:REQUEST",
        "BEGIN:VEVENT", f"UID:{uid}", f"DTSTAMP:{stamp}", dtstart, dtend,
        f"SUMMARY:{_ics_escape(e.get('title'))}",
    ]
    if e.get("repeat") in ("weekly", "monthly"):
        freq = "WEEKLY" if e["repeat"] == "weekly" else "MONTHLY"
        rr = f"RRULE:FREQ={freq}"
        if e.get("repeat_count"):
            rr += f";COUNT={int(e['repeat_count'])}"
        elif e.get("repeat_end_date"):
            rr += f";UNTIL={e['repeat_end_date'][:10].replace('-', '')}T235959Z"
        lines.append(rr)
    if e.get("location"):
        lines.append(f"LOCATION:{_ics_escape(e['location'])}")
    if e.get("notes"):
        lines.append(f"DESCRIPTION:{_ics_escape(e['notes'])}")
    if organizer_email:
        lines.append(f"ORGANIZER:mailto:{organizer_email}")
    lines += ["STATUS:CONFIRMED", "END:VEVENT", "END:VCALENDAR"]
    return "\r\n".join(lines) + "\r\n"


async def send_event_invites(e: dict, base_url: str) -> None:
    """Email invited members an event notification with a first-party .ics calendar link."""
    invited = set(e.get("participant_ids") or [])
    if e.get("owner_member_id"):
        invited.add(e["owner_member_id"])
    if not invited:
        return
    recipients = []
    organizer_email = None
    for mid in invited:
        m = await db.members.find_one({"member_id": mid}, {"_id": 0})
        if not m or not m.get("linked_user_id"):
            continue
        u = await db.users.find_one({"user_id": m["linked_user_id"]}, {"_id": 0})
        if u and u.get("email"):
            recipients.append((u["email"], m.get("name") or u.get("name") or "there"))
            if mid == e.get("owner_member_id"):
                organizer_email = u["email"]
    if not recipients:
        return

    try:
        when_date = date.fromisoformat(e["date"][:10]).strftime("%A, %d %B %Y")
    except Exception:
        when_date = e.get("date", "")
    when_time = "All day" if e.get("all_day") else f"{e.get('start_time', '')}–{e.get('end_time', '')}".strip("–")
    ics_url = f"{base_url.rstrip('/')}/api/events/{e['event_id']}/invite.ics"
    subject = f"📅 {e.get('title', 'New event')} — {when_date}"
    loc_row = (f'<tr><td style="padding:2px 0;color:#888">Location</td>'
               f'<td style="padding:2px 0;font-weight:600">{escape(e.get("location") or "")}</td></tr>') if e.get("location") else ""

    for email, name in recipients:
        html = (
            f'<table role="presentation" width="100%" style="max-width:520px;margin:auto;'
            f'font-family:Arial,Helvetica,sans-serif;color:#2C2C28"><tr><td style="padding:24px">'
            f'<p style="font-size:15px">Hi {escape(name)}, you\'re invited to a family event:</p>'
            f'<h2 style="margin:8px 0;color:#FF6B6B">{escape(e.get("title") or "Event")}</h2>'
            f'<table role="presentation" style="font-size:14px;margin:12px 0">'
            f'<tr><td style="padding:2px 0;color:#888;width:90px">When</td>'
            f'<td style="padding:2px 0;font-weight:600">{escape(when_date)} · {escape(when_time)}</td></tr>'
            f'{loc_row}</table>'
            f'<p style="margin:20px 0"><a href="{ics_url}" '
            f'style="background:#FF6B6B;color:#fff;text-decoration:none;padding:12px 22px;'
            f'border-radius:24px;font-weight:bold;display:inline-block">📅 Add to your calendar</a></p>'
            f'<p style="font-size:12px;color:#888;margin-top:24px">Sent by FamilyHome. '
            f'We never ask for your password or payment details by email.</p>'
            f'</td></tr></table>'
        )
        await send_email(to=email, subject=subject, html=html)


@api.get("/events")
async def list_events(user: dict = Depends(get_current_user), start: Optional[str] = None, end: Optional[str] = None):
    fid = require_family(user)
    viewer = await member_for_user(user)
    q = {"family_id": fid}
    if start and end:
        q["date"] = {"$gte": start, "$lte": end}
    events = await db.events.find(q, {"_id": 0}).sort("date", 1).to_list(500)
    return [await hydrate_event(e, viewer) for e in events]


@api.post("/events/{event_id}/rsvp")
async def rsvp_event(event_id: str, body: RsvpIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    if not mine:
        raise HTTPException(status_code=400, detail="No family profile")
    if body.status not in ("going", "maybe", "declined"):
        raise HTTPException(status_code=400, detail="Invalid RSVP status")
    e = await db.events.find_one({"event_id": event_id, "family_id": fid}, {"_id": 0})
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")
    invited = set(e.get("participant_ids") or [])
    if e.get("owner_member_id"):
        invited.add(e["owner_member_id"])
    if mine["member_id"] not in invited:
        raise HTTPException(status_code=403, detail="Only invited members can RSVP")
    rsvps = e.get("rsvps") or {}
    rsvps[mine["member_id"]] = body.status
    await db.events.update_one({"event_id": event_id, "family_id": fid}, {"$set": {"rsvps": rsvps}})
    e = await db.events.find_one({"event_id": event_id, "family_id": fid}, {"_id": 0})
    return await hydrate_event(e, mine)


@api.post("/events/{event_id}/nudge")
async def nudge_event(event_id: str, user: dict = Depends(get_current_user)):
    """Host reminder: gently nudge invited members who haven't RSVP'd yet."""
    fid = require_family(user)
    mine = await member_for_user(user)
    if not mine:
        raise HTTPException(status_code=400, detail="No family profile")
    e = await db.events.find_one({"event_id": event_id, "family_id": fid}, {"_id": 0})
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")
    is_host = e.get("owner_member_id") == mine["member_id"] or mine.get("role") in ("admin", "parent")
    if not is_host:
        raise HTTPException(status_code=403, detail="Only the event host can send reminders")
    raw_rsvps = e.get("rsvps") or {}
    invited = list(e.get("participant_ids") or [])
    if e.get("owner_member_id") and e["owner_member_id"] not in invited:
        invited.append(e["owner_member_id"])
    awaiting_ids = [mid for mid in invited if mid not in raw_rsvps and mid != mine["member_id"]]
    if not awaiting_ids:
        return {"nudged": 0, "names": []}
    awaiting_members = []
    user_ids = []
    for mid in awaiting_ids:
        m = await db.members.find_one({"member_id": mid, "family_id": fid}, {"_id": 0})
        if m:
            awaiting_members.append(m)
            if m.get("linked_user_id"):
                user_ids.append(m["linked_user_id"])
    names = [m.get("name") for m in awaiting_members if m.get("name")]

    try:
        when = date.fromisoformat(e["date"][:10]).strftime("%a %d %b")
    except Exception:
        when = e.get("date", "")
    # post a gentle reminder into the family chat so it's visible in-app
    fam_chat = await db.chats.find_one({"family_id": fid, "type": "family"}, {"_id": 0})
    if fam_chat:
        mention = ", ".join(names)
        text = f"⏰ Reminder from {mine.get('name', 'the host')}: please RSVP to \"{e.get('title')}\" on {when}. Waiting on: {mention}."
        now = now_iso()
        await db.messages.insert_one({
            "message_id": new_id("msg_"), "chat_id": fam_chat["chat_id"], "family_id": fid,
            "sender_member_id": mine["member_id"], "text": text, "media": [], "type": "text", "created_at": now,
        })
        await db.chats.update_one({"chat_id": fam_chat["chat_id"]}, {"$set": {
            "last_message": {"text": "⏰ RSVP reminder", "sender": mine.get("name"), "created_at": now, "type": "text"}}})

    # best-effort push to those awaiting (native only)
    try:
        if user_ids:
            await send_push(user_ids, {
                "title": f"⏰ RSVP: {e.get('title')}",
                "message": f"{mine.get('name', 'The host')} is waiting for your reply for {when}.",
                "action_url": "/(tabs)/calendar",
            }, idempotency_key=f"nudge_{event_id}_{now_iso()[:13]}")
    except Exception as ex:
        logger.warning(f"RSVP nudge push failed (non-blocking): {ex}")
    return {"nudged": len(names), "names": names}


@api.post("/events")
async def create_event(body: EventIn, request: Request, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    viewer = await member_for_user(user)
    color = body.color
    if not color and body.owner_member_id:
        owner = await db.members.find_one({"member_id": body.owner_member_id}, {"_id": 0})
        color = owner["color"] if owner else "#FF6B6B"
    color = color or "#FF6B6B"
    base = body.dict()
    repeat = body.repeat if body.repeat in ("weekly", "monthly") else "none"
    base_url = _public_base_url(request)

    try:
        start_d = date.fromisoformat(body.date[:10])
    except Exception:
        start_d = None
    span = None
    if body.end_date and start_d:
        try:
            span = (date.fromisoformat(body.end_date[:10]) - start_d).days
        except Exception:
            span = None

    if repeat != "none" and start_d:
        end_d = None
        if body.repeat_end_date:
            try:
                end_d = date.fromisoformat(body.repeat_end_date[:10])
            except Exception:
                end_d = None
        occ = _recurrence_dates(start_d, repeat, end_d, body.repeat_count)
        series_id = new_id("ser_")
        docs = []
        for d in occ:
            docs.append({
                **base, "event_id": new_id("evt_"), "family_id": fid, "color": color,
                "series_id": series_id, "repeat": repeat, "created_at": now_iso(),
                "date": d.isoformat(),
                "end_date": (d + timedelta(days=span)).isoformat() if span else base.get("end_date"),
            })
        await db.events.insert_many(docs)
        # one invite email for the series (first occurrence carries the RRULE .ics)
        asyncio.create_task(send_event_invites(clean(dict(docs[0])), base_url))
        return await hydrate_event(docs[0], viewer)

    e = {"event_id": new_id("evt_"), "family_id": fid, **base, "color": color,
         "repeat": "none", "created_at": now_iso()}
    await db.events.insert_one(e)
    asyncio.create_task(send_event_invites(clean(dict(e)), base_url))
    return await hydrate_event(e, viewer)


@api.get("/events/{event_id}/invite.ics")
async def event_invite_ics(event_id: str):
    """Public .ics download so email 'Add to calendar' links work without an auth header."""
    e = await db.events.find_one({"event_id": event_id}, {"_id": 0})
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")
    ics = build_event_ics(e)
    return Response(
        content=ics,
        media_type="text/calendar; charset=utf-8; method=REQUEST",
        headers={"Content-Disposition": f'attachment; filename="{event_id}.ics"'},
    )


@api.patch("/events/{event_id}")
async def update_event(event_id: str, body: EventIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    viewer = await member_for_user(user)
    e = await db.events.find_one({"event_id": event_id, "family_id": fid}, {"_id": 0})
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")
    updates = body.dict()
    if e.get("series_id"):
        # editing a recurring event applies to the whole series, but each
        # occurrence keeps its own date/end_date + recurrence rule.
        for k in ("date", "end_date", "repeat", "repeat_end_date", "repeat_count"):
            updates.pop(k, None)
        await db.events.update_many({"family_id": fid, "series_id": e["series_id"]}, {"$set": updates})
    else:
        await db.events.update_one({"event_id": event_id, "family_id": fid}, {"$set": updates})
    e = await db.events.find_one({"event_id": event_id, "family_id": fid}, {"_id": 0})
    return await hydrate_event(e, viewer)


@api.delete("/events/{event_id}")
async def delete_event(event_id: str, scope: str = "series", user: dict = Depends(get_current_user)):
    fid = require_family(user)
    e = await db.events.find_one({"event_id": event_id, "family_id": fid}, {"_id": 0})
    if e and e.get("series_id") and scope != "single":
        # default for a recurring event: remove the whole series
        await db.events.delete_many({"family_id": fid, "series_id": e["series_id"]})
    else:
        # scope=single (skip just this date) or a one-off event
        await db.events.delete_one({"event_id": event_id, "family_id": fid})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Chores
# ---------------------------------------------------------------------------
def today_str() -> str:
    return date.today().isoformat()


@api.get("/chores")
async def list_chores(user: dict = Depends(get_current_user)):
    fid = require_family(user)
    chores = await db.chores.find({"family_id": fid}, {"_id": 0}).to_list(300)
    out = []
    for c in chores:
        owner = await db.members.find_one({"member_id": c["owner_member_id"]}, {"_id": 0})
        done = await db.chore_completions.find_one(
            {"chore_id": c["chore_id"], "date": today_str()}, {"_id": 0})
        c["owner"] = owner
        c["done_today"] = bool(done)
        out.append(c)
    return out


@api.post("/chores")
async def create_chore(body: ChoreIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    c = {"chore_id": new_id("chore_"), "family_id": fid, **body.dict(), "created_at": now_iso()}
    await db.chores.insert_one(c)
    owner = await db.members.find_one({"member_id": c["owner_member_id"]}, {"_id": 0})
    c = clean(c)
    c["owner"] = owner
    c["done_today"] = False
    return c


@api.post("/chores/{chore_id}/complete")
async def complete_chore(chore_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    c = await db.chores.find_one({"chore_id": chore_id, "family_id": fid}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Chore not found")
    existing = await db.chore_completions.find_one({"chore_id": chore_id, "date": today_str()})
    if not existing:
        mine = await member_for_user(user)
        await db.chore_completions.insert_one({
            "completion_id": new_id("cc_"), "chore_id": chore_id, "family_id": fid,
            "member_id": c["owner_member_id"], "stars": c.get("stars", 1),
            "completed_by_member_id": (mine or {}).get("member_id") or c["owner_member_id"],
            "date": today_str(), "created_at": now_iso(),
        })
    return {"ok": True, "stars": c.get("stars", 1)}


@api.post("/chores/{chore_id}/uncomplete")
async def uncomplete_chore(chore_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    await db.chore_completions.delete_many({"chore_id": chore_id, "date": today_str(), "family_id": fid})
    return {"ok": True}


@api.delete("/chores/{chore_id}")
async def delete_chore(chore_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    await db.chores.delete_one({"chore_id": chore_id, "family_id": fid})
    await db.chore_completions.delete_many({"chore_id": chore_id})
    return {"ok": True}


@api.get("/chores/stars")
async def chore_stars(user: dict = Depends(get_current_user)):
    fid = require_family(user)
    completions = await db.chore_completions.find({"family_id": fid}, {"_id": 0}).to_list(5000)
    tally = {}
    for c in completions:
        tally[c["member_id"]] = tally.get(c["member_id"], 0) + c.get("stars", 1)
    out = []
    for mid, stars in tally.items():
        m = await db.members.find_one({"member_id": mid}, {"_id": 0})
        if m:
            out.append({"member": m, "stars": stars})
    out.sort(key=lambda x: -x["stars"])
    return out


async def _chore_streak(fid: str, member_id: str, chore_ids: list) -> int:
    """Consecutive days (ending today or yesterday) the child completed ALL their chores."""
    if not chore_ids:
        return 0
    n = len(chore_ids)
    comps = await db.chore_completions.find(
        {"family_id": fid, "member_id": member_id, "chore_id": {"$in": chore_ids}}, {"_id": 0}).to_list(5000)
    per_date: dict = {}
    for c in comps:
        per_date.setdefault(c["date"], set()).add(c["chore_id"])
    all_done = {d for d, s in per_date.items() if len(s) >= n}
    today = date.today()
    cur = today if today.isoformat() in all_done else today - timedelta(days=1)
    streak = 0
    while cur.isoformat() in all_done:
        streak += 1
        cur -= timedelta(days=1)
    return streak


def _streak_badge(streak: int) -> Optional[dict]:
    if streak >= 30:
        return {"label": "Legend", "emoji": "👑", "milestone": 30}
    if streak >= 14:
        return {"label": "On Fire", "emoji": "🔥", "milestone": 14}
    if streak >= 7:
        return {"label": "Star Week", "emoji": "🌟", "milestone": 7}
    if streak >= 3:
        return {"label": "Rising Star", "emoji": "⭐", "milestone": 3}
    return None


# ---------------------------------------------------------------------------
# Shopping
# ---------------------------------------------------------------------------
@api.get("/shopping/lists")
async def shopping_lists(user: dict = Depends(get_current_user)):
    fid = require_family(user)
    lists = await db.shopping_lists.find({"family_id": fid}, {"_id": 0}).sort("created_at", 1).to_list(100)
    for l in lists:
        total = await db.shopping_items.count_documents({"list_id": l["list_id"]})
        done = await db.shopping_items.count_documents({"list_id": l["list_id"], "checked": True})
        l["total"] = total
        l["done"] = done
    return lists


@api.post("/shopping/lists")
async def create_shopping_list(body: ShoppingListIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    l = {"list_id": new_id("shl_"), "family_id": fid, "name": body.name, "category": body.category, "created_at": now_iso()}
    await db.shopping_lists.insert_one(l)
    l = clean(l)
    l["total"] = 0
    l["done"] = 0
    return l


@api.delete("/shopping/lists/{list_id}")
async def delete_shopping_list(list_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    await db.shopping_lists.delete_one({"list_id": list_id, "family_id": fid})
    await db.shopping_items.delete_many({"list_id": list_id, "family_id": fid})
    return {"ok": True}


@api.get("/shopping/lists/{list_id}/items")
async def shopping_items(list_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    return await db.shopping_items.find({"list_id": list_id, "family_id": fid}, {"_id": 0}).sort("created_at", 1).to_list(500)


@api.post("/shopping/lists/{list_id}/items")
async def add_shopping_item(list_id: str, body: ShoppingItemIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    item = {
        "item_id": new_id("shi_"), "list_id": list_id, "family_id": fid, "name": body.name,
        "quantity": body.quantity, "category": body.category, "notes": body.notes,
        "checked": False, "added_by": mine["name"] if mine else None, "created_at": now_iso(),
    }
    await db.shopping_items.insert_one(item)
    return clean(item)


@api.post("/shopping/items/{item_id}/toggle")
async def toggle_shopping_item(item_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    item = await db.shopping_items.find_one({"item_id": item_id, "family_id": fid}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    await db.shopping_items.update_one({"item_id": item_id, "family_id": fid}, {"$set": {"checked": not item["checked"]}})
    item["checked"] = not item["checked"]
    return item


@api.delete("/shopping/items/{item_id}")
async def delete_shopping_item(item_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    await db.shopping_items.delete_one({"item_id": item_id, "family_id": fid})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Recipes & Meal Planner
# ---------------------------------------------------------------------------
MEAL_SLOTS = ["breakfast", "lunch", "dinner"]


def _recipe_card(r: dict) -> dict:
    return {
        "recipe_id": r["recipe_id"], "title": r["title"], "photo_url": r.get("photo_url"),
        "ingredient_count": len(r.get("ingredients") or []), "prep_minutes": r.get("prep_minutes"),
    }


@api.get("/recipes")
async def list_recipes(user: dict = Depends(get_current_user)):
    fid = require_family(user)
    return await db.recipes.find({"family_id": fid}, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.post("/recipes")
async def create_recipe(body: RecipeIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    if not body.title.strip():
        raise HTTPException(status_code=400, detail="Give your recipe a name")
    r = {
        "recipe_id": new_id("rcp_"), "family_id": fid, "title": body.title.strip(),
        "description": (body.description or "").strip() or None, "photo_url": body.photo_url,
        "ingredients": [{"name": i.name.strip(), "quantity": (i.quantity or "").strip() or None}
                        for i in body.ingredients if i.name.strip()],
        "prep_minutes": body.prep_minutes,
        "created_by": mine["member_id"] if mine else None, "created_at": now_iso(),
    }
    await db.recipes.insert_one(r)
    return clean(r)


@api.get("/recipes/{recipe_id}")
async def get_recipe(recipe_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    r = await db.recipes.find_one({"recipe_id": recipe_id, "family_id": fid}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Recipe not found")
    r["author"] = await db.members.find_one({"member_id": r.get("created_by")}, {"_id": 0})
    return r


@api.delete("/recipes/{recipe_id}")
async def delete_recipe(recipe_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    r = await db.recipes.find_one({"recipe_id": recipe_id, "family_id": fid}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Recipe not found")
    is_admin = bool(mine and mine.get("role") == "admin")
    if not is_admin and r.get("created_by") != (mine["member_id"] if mine else None):
        raise HTTPException(status_code=403, detail="Only the creator can delete this recipe")
    await db.recipes.delete_one({"recipe_id": recipe_id})
    await db.meal_plans.delete_many({"family_id": fid, "recipe_id": recipe_id})
    return {"ok": True}


@api.get("/meals")
async def get_meals(week_start: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    entries = await db.meal_plans.find(
        {"family_id": fid, "week_start": week_start}, {"_id": 0}).to_list(200)
    out = []
    for e in entries:
        r = await db.recipes.find_one({"recipe_id": e["recipe_id"], "family_id": fid}, {"_id": 0})
        out.append({**e, "recipe": _recipe_card(r) if r else None})
    return {"week_start": week_start, "meals": out}


@api.post("/meals")
async def set_meal(body: MealIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    if body.slot not in MEAL_SLOTS:
        raise HTTPException(status_code=400, detail="Invalid meal slot")
    if not (0 <= body.day <= 6):
        raise HTTPException(status_code=400, detail="Invalid day")
    r = await db.recipes.find_one({"recipe_id": body.recipe_id, "family_id": fid}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Recipe not found")
    await db.meal_plans.delete_many(
        {"family_id": fid, "week_start": body.week_start, "day": body.day, "slot": body.slot})
    entry = {"plan_id": new_id("mp_"), "family_id": fid, "week_start": body.week_start,
             "day": body.day, "slot": body.slot, "recipe_id": body.recipe_id, "created_at": now_iso()}
    await db.meal_plans.insert_one(entry)
    return {**clean(entry), "recipe": _recipe_card(r)}


@api.delete("/meals/{plan_id}")
async def delete_meal(plan_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    await db.meal_plans.delete_one({"plan_id": plan_id, "family_id": fid})
    return {"ok": True}


@api.post("/meals/to-shopping")
async def meals_to_shopping(body: MealToShoppingIn, user: dict = Depends(get_current_user)):
    """Auto-fill a shopping list with every ingredient from the week's planned recipes."""
    fid = require_family(user)
    mine = await member_for_user(user)
    entries = await db.meal_plans.find(
        {"family_id": fid, "week_start": body.week_start}, {"_id": 0}).to_list(200)
    if not entries:
        raise HTTPException(status_code=400, detail="No meals planned for this week yet")

    recipe_ids = list({e["recipe_id"] for e in entries})
    agg: dict = {}  # lower(name) -> {"name", "quantities": [..]}
    for rid in recipe_ids:
        r = await db.recipes.find_one({"recipe_id": rid, "family_id": fid}, {"_id": 0})
        if not r:
            continue
        for ing in r.get("ingredients") or []:
            nm = (ing.get("name") or "").strip()
            if not nm:
                continue
            key = nm.lower()
            agg.setdefault(key, {"name": nm, "quantities": []})
            q = (ing.get("quantity") or "").strip()
            if q:
                agg[key]["quantities"].append(q)
    if not agg:
        raise HTTPException(status_code=400, detail="Your planned recipes have no ingredients yet")

    list_id = body.list_id
    if list_id:
        lst = await db.shopping_lists.find_one({"list_id": list_id, "family_id": fid}, {"_id": 0})
        if not lst:
            raise HTTPException(status_code=404, detail="Shopping list not found")
    else:
        # Reuse the family's existing "Meal Plan" list so repeated taps dedupe instead of piling up.
        lst = await db.shopping_lists.find_one({"family_id": fid, "name": "Meal Plan 🍽️"}, {"_id": 0})
        if lst:
            list_id = lst["list_id"]
        else:
            list_id = new_id("shl_")
            lst = {"list_id": list_id, "family_id": fid, "name": "Meal Plan 🍽️",
                   "category": "Grocery", "created_at": now_iso()}
            await db.shopping_lists.insert_one(lst)

    existing = await db.shopping_items.find({"list_id": list_id}, {"_id": 0, "name": 1}).to_list(2000)
    existing_names = {(i.get("name") or "").lower() for i in existing}
    added = 0
    for key, v in agg.items():
        if key in existing_names:
            continue
        qty = " + ".join(dict.fromkeys(v["quantities"])) or None
        await db.shopping_items.insert_one({
            "item_id": new_id("shi_"), "list_id": list_id, "family_id": fid, "name": v["name"],
            "quantity": qty, "category": "Grocery", "notes": "From meal plan",
            "checked": False, "added_by": mine["name"] if mine else None, "created_at": now_iso(),
        })
        added += 1
    return {"list_id": list_id, "list_name": lst["name"], "added": added, "total_ingredients": len(agg)}



# ---------------------------------------------------------------------------
# To-do lists
# ---------------------------------------------------------------------------
@api.get("/todos/lists")
async def todo_lists(user: dict = Depends(get_current_user)):
    fid = require_family(user)
    lists = await db.todo_lists.find({"family_id": fid}, {"_id": 0}).sort("created_at", 1).to_list(100)
    for l in lists:
        total = await db.todo_items.count_documents({"list_id": l["list_id"]})
        done = await db.todo_items.count_documents({"list_id": l["list_id"], "done": True})
        l["total"] = total
        l["done"] = done
    return lists


@api.post("/todos/lists")
async def create_todo_list(body: TodoListIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    l = {"list_id": new_id("tdl_"), "family_id": fid, "name": body.name, "created_at": now_iso()}
    await db.todo_lists.insert_one(l)
    l = clean(l)
    l["total"] = 0
    l["done"] = 0
    return l


@api.delete("/todos/lists/{list_id}")
async def delete_todo_list(list_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    await db.todo_lists.delete_one({"list_id": list_id, "family_id": fid})
    await db.todo_items.delete_many({"list_id": list_id, "family_id": fid})
    return {"ok": True}


@api.get("/todos/lists/{list_id}/items")
async def todo_items(list_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    items = await db.todo_items.find({"list_id": list_id, "family_id": fid}, {"_id": 0}).sort("created_at", 1).to_list(500)
    for i in items:
        if i.get("assignee_member_id"):
            i["assignee"] = await db.members.find_one({"member_id": i["assignee_member_id"]}, {"_id": 0})
    return items


@api.post("/todos/lists/{list_id}/items")
async def add_todo_item(list_id: str, body: TodoItemIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    item = {
        "item_id": new_id("tdi_"), "list_id": list_id, "family_id": fid, "title": body.title,
        "assignee_member_id": body.assignee_member_id, "due_date": body.due_date,
        "priority": body.priority, "done": False, "created_at": now_iso(),
    }
    await db.todo_items.insert_one(item)
    item = clean(item)
    if body.assignee_member_id:
        item["assignee"] = await db.members.find_one({"member_id": body.assignee_member_id}, {"_id": 0})
    return item


@api.post("/todos/items/{item_id}/toggle")
async def toggle_todo_item(item_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    item = await db.todo_items.find_one({"item_id": item_id, "family_id": fid}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    now_done = not item["done"]
    mine = await member_for_user(user)
    upd = {"done": now_done,
           "done_by_member_id": (mine or {}).get("member_id") if now_done else None,
           "done_at": now_iso() if now_done else None}
    await db.todo_items.update_one({"item_id": item_id, "family_id": fid}, {"$set": upd})
    item.update(upd)
    return item


@api.delete("/todos/items/{item_id}")
async def delete_todo_item(item_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    await db.todo_items.delete_one({"item_id": item_id, "family_id": fid})
    return {"ok": True}


@api.post("/todos/items/{item_id}/nudge")
async def nudge_todo_item(item_id: str, user: dict = Depends(get_current_user)):
    """Gently remind the member a task is assigned to (family chat post + push)."""
    fid = require_family(user)
    mine = await member_for_user(user)
    if not mine:
        raise HTTPException(status_code=400, detail="No family profile")
    item = await db.todo_items.find_one({"item_id": item_id, "family_id": fid}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Task not found")
    if item.get("done"):
        raise HTTPException(status_code=400, detail="That task is already done")
    aid = item.get("assignee_member_id")
    is_owner_or_parent = mine.get("role") in ("admin", "parent") or aid == mine["member_id"]
    if not is_owner_or_parent:
        raise HTTPException(status_code=403, detail="Only a parent can send reminders")
    assignee = await db.members.find_one({"member_id": aid, "family_id": fid}, {"_id": 0}) if aid else None
    who = assignee.get("name") if assignee else "the family"
    fam_chat = await db.chats.find_one({"family_id": fid, "type": "family"}, {"_id": 0})
    if fam_chat:
        mention = f"@{who}" if assignee else "everyone"
        text = f"⏰ Reminder from {mine.get('name', 'a parent')}: {mention}, please finish \"{item.get('title')}\" 🙏"
        now = now_iso()
        await db.messages.insert_one({
            "message_id": new_id("msg_"), "chat_id": fam_chat["chat_id"], "family_id": fid,
            "sender_member_id": mine["member_id"], "text": text, "media": [], "type": "text", "created_at": now,
        })
        await db.chats.update_one({"chat_id": fam_chat["chat_id"]}, {"$set": {
            "last_message": {"text": "⏰ Task reminder", "sender": mine.get("name"), "created_at": now, "type": "text"}}})
    try:
        if assignee and assignee.get("linked_user_id"):
            await send_push([assignee["linked_user_id"]], {
                "title": "⏰ Task reminder",
                "message": f"{mine.get('name', 'A parent')}: please finish \"{item.get('title')}\".",
                "action_url": "/todos",
            }, idempotency_key=f"tasknudge_{item_id}_{now_iso()[:13]}")
    except Exception as ex:
        logger.warning(f"Task nudge push failed (non-blocking): {ex}")
    return {"nudged": 1 if assignee else 0, "name": who}


@api.post("/todos/nudge-overdue")
async def nudge_overdue_tasks(user: dict = Depends(get_current_user)):
    """Remind every assignee who has overdue open tasks — one message per person."""
    fid = require_family(user)
    mine = await member_for_user(user)
    if not mine or mine.get("role") not in ("admin", "parent"):
        raise HTTPException(status_code=403, detail="Only a parent can send reminders")
    today = today_str()
    overdue = await db.todo_items.find(
        {"family_id": fid, "done": {"$ne": True}, "due_date": {"$lt": today, "$ne": None}},
        {"_id": 0}).to_list(500)
    if not overdue:
        return {"nudged": 0, "tasks": 0, "names": []}
    by_assignee: dict = {}
    for it in overdue:
        aid = it.get("assignee_member_id")
        if aid:
            by_assignee.setdefault(aid, []).append(it)
    fam_chat = await db.chats.find_one({"family_id": fid, "type": "family"}, {"_id": 0})
    now = now_iso()
    names: list = []
    push_users: list = []
    msgs: list = []
    for aid, items in by_assignee.items():
        assignee = await db.members.find_one({"member_id": aid, "family_id": fid}, {"_id": 0})
        if not assignee:
            continue
        names.append(assignee.get("name"))
        titles = ", ".join(f"\"{i.get('title')}\"" for i in items[:4])
        more = f" +{len(items) - 4} more" if len(items) > 4 else ""
        n = len(items)
        text = (f"⏰ Reminder from {mine.get('name', 'a parent')}: @{assignee.get('name')}, "
                f"{n} overdue task{'s' if n > 1 else ''} — {titles}{more} 🙏")
        if fam_chat:
            msgs.append({
                "message_id": new_id("msg_"), "chat_id": fam_chat["chat_id"], "family_id": fid,
                "sender_member_id": mine["member_id"], "text": text, "media": [], "type": "text", "created_at": now,
            })
        if assignee.get("linked_user_id"):
            push_users.append(assignee["linked_user_id"])
    if msgs:
        await db.messages.insert_many(msgs)
        await db.chats.update_one({"chat_id": fam_chat["chat_id"]}, {"$set": {
            "last_message": {"text": "⏰ Overdue task reminders", "sender": mine.get("name"), "created_at": now, "type": "text"}}})
    try:
        if push_users:
            await send_push(push_users, {
                "title": "⏰ Overdue task reminder",
                "message": f"{mine.get('name', 'A parent')} reminded you about your overdue tasks.",
                "action_url": "/todos",
            }, idempotency_key=f"overduenudge_{fid}_{now[:13]}")
    except Exception as ex:
        logger.warning(f"Overdue nudge push failed (non-blocking): {ex}")
    return {"nudged": len(names), "tasks": len(overdue), "names": names}


@api.get("/tasks/upcoming")
async def upcoming_tasks(user: dict = Depends(get_current_user)):
    """All open to-dos across every list (family-scoped) for the Calendar Task view.
    Sorted by due date (undated tasks last). Carries assignee + overdue flags."""
    fid = require_family(user)
    mine = await member_for_user(user)
    my_id = mine.get("member_id") if mine else None
    child_ids = {m["member_id"] for m in
                 await db.members.find({"family_id": fid, "is_child": True}, {"member_id": 1, "_id": 0}).to_list(200)}
    lists = await db.todo_lists.find({"family_id": fid}, {"_id": 0}).to_list(100)
    list_names = {l["list_id"]: l.get("name") for l in lists}
    mcache: dict = {}

    async def mcard(mid):
        if not mid:
            return None
        if mid not in mcache:
            mcache[mid] = _member_card(await db.members.find_one({"member_id": mid, "family_id": fid}, {"_id": 0}))
        return mcache[mid]

    def scope(aid):
        return "mine" if aid == my_id else ("kids" if aid in child_ids else "family")

    out = []
    for it in await db.todo_items.find(
            {"family_id": fid, "done": {"$ne": True}}, {"_id": 0}).sort("due_date", 1).to_list(400):
        aid = it.get("assignee_member_id")
        du = _days_until(it.get("due_date")) if it.get("due_date") else None
        out.append({
            "item_id": it["item_id"], "list_id": it.get("list_id"),
            "list_name": list_names.get(it.get("list_id")),
            "title": it.get("title"), "priority": it.get("priority", "normal"),
            "due_date": it.get("due_date"), "days_until_due": du,
            "overdue": du is not None and du < 0,
            "assignee": await mcard(aid), "scope": scope(aid),
        })
    return {"tasks": out, "can_manage": bool(mine and mine.get("role") in ("admin", "parent"))}



# ---------------------------------------------------------------------------
# Home dashboard
# ---------------------------------------------------------------------------
def days_until_birthday(bday: Optional[str]) -> Optional[int]:
    if not bday:
        return None
    try:
        b = datetime.strptime(bday, "%Y-%m-%d").date()
    except ValueError:
        return None
    today = date.today()
    nxt = b.replace(year=today.year)
    if nxt < today:
        nxt = b.replace(year=today.year + 1)
    return (nxt - today).days


async def _family_activity_dates(fid: str, days: int = 120) -> set:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    dates: set = set()
    for coll, field in [("posts", "created_at"), ("affections", "created_at"),
                        ("timeline", "created_at"), ("wishes", "created_at"), ("messages", "created_at")]:
        docs = await db[coll].find({"family_id": fid, field: {"$gte": cutoff}}, {field: 1, "_id": 0}).to_list(8000)
        for d in docs:
            if d.get(field):
                dates.add(d[field][:10])
    cc = await db.chore_completions.find({"family_id": fid}, {"date": 1, "_id": 0}).to_list(8000)
    for d in cc:
        if d.get("date"):
            dates.add(d["date"][:10])
    return dates


def _streak_from_dates(dates: set) -> int:
    if not dates:
        return 0
    cur = date.today()
    if cur.isoformat() not in dates:
        cur = cur - timedelta(days=1)
        if cur.isoformat() not in dates:
            return 0
    streak = 0
    while cur.isoformat() in dates:
        streak += 1
        cur = cur - timedelta(days=1)
    return streak


@api.get("/home")
async def home(user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    fam = await db.families.find_one({"family_id": fid}, {"_id": 0})
    members = await db.members.find({"family_id": fid}, {"_id": 0}).to_list(200)
    t = today_str()

    events_today = await db.events.find({"family_id": fid, "date": t}, {"_id": 0}).sort("start_time", 1).to_list(50)
    events_today = [await hydrate_event(e) for e in events_today]

    chores = await db.chores.find({"family_id": fid}, {"_id": 0}).to_list(200)
    pending_chores = 0
    for c in chores:
        done = await db.chore_completions.find_one({"chore_id": c["chore_id"], "date": t})
        if not done:
            pending_chores += 1

    upcoming_birthdays = []
    for m in members:
        d = days_until_birthday(m.get("birthday"))
        if d is not None and d <= 30:
            upcoming_birthdays.append({"member": m, "days": d})
    upcoming_birthdays.sort(key=lambda x: x["days"])

    unseen_affection = 0
    if mine:
        unseen_affection = await db.affections.count_documents(
            {"family_id": fid, "to_member_id": mine["member_id"], "seen": False})

    recent_posts = await db.posts.count_documents({"family_id": fid})

    shopping = await db.shopping_lists.find({"family_id": fid}, {"_id": 0}).to_list(50)
    shopping_pending = 0
    for l in shopping:
        shopping_pending += await db.shopping_items.count_documents({"list_id": l["list_id"], "checked": False})

    unread_messages = 0
    if mine:
        my_chats = await db.chats.find({"family_id": fid, "member_ids": mine["member_id"]}, {"_id": 0}).to_list(200)
        for ch in my_chats:
            unread_messages += await _unread_count(ch["chat_id"], mine["member_id"])

    mmdd = f"-{t[5:7]}-{t[8:10]}"
    otd = await db.timeline.find({"family_id": fid, "date": {"$regex": f"{mmdd}$"}}, {"_id": 0}).sort("date", -1).to_list(20)
    on_this_day = []
    for e in otd:
        try:
            e["years_ago"] = date.today().year - int(e["date"][:4])
        except ValueError:
            e["years_ago"] = 0
        on_this_day.append(await hydrate_timeline(e))

    family_streak = _streak_from_dates(await _family_activity_dates(fid))

    my_id = mine["member_id"] if mine else None

    # --- Today's planned meals -------------------------------------------------
    monday = date.today() - timedelta(days=date.today().weekday())
    week_start = monday.isoformat()
    day_idx = date.today().weekday()
    slot_order = {"breakfast": 0, "lunch": 1, "dinner": 2}
    meals_today = []
    for e in await db.meal_plans.find({"family_id": fid, "week_start": week_start, "day": day_idx}, {"_id": 0}).to_list(10):
        r = await db.recipes.find_one({"recipe_id": e["recipe_id"], "family_id": fid}, {"_id": 0})
        if r:
            meals_today.append({"slot": e["slot"], "recipe": _recipe_card(r)})
    meals_today.sort(key=lambda x: slot_order.get(x["slot"], 9))

    # --- Family tasks (open + completed today, with who marked done) ----------
    list_names = {l["list_id"]: l["name"] for l in await db.todo_lists.find({"family_id": fid}, {"_id": 0}).to_list(100)}
    child_ids = {m["member_id"] for m in members if m.get("is_child") or m.get("role") == "child"}
    _mcard_cache: dict = {}

    async def _mcard(mid):
        if not mid:
            return None
        if mid in _mcard_cache:
            return _mcard_cache[mid]
        card = _member_card(await db.members.find_one({"member_id": mid}, {"_id": 0}))
        _mcard_cache[mid] = card
        return card

    def _task_scope(aid):
        return "mine" if aid == my_id else ("kids" if aid in child_ids else "family")

    tasks = []
    for it in await db.todo_items.find({"family_id": fid, "done": {"$ne": True}}, {"_id": 0}).sort("due_date", 1).to_list(300):
        aid = it.get("assignee_member_id")
        du = _days_until(it.get("due_date")) if it.get("due_date") else None
        tasks.append({
            "item_id": it["item_id"], "list_id": it.get("list_id"), "list_name": list_names.get(it.get("list_id")),
            "title": it.get("title"), "priority": it.get("priority", "normal"),
            "due_date": it.get("due_date"), "days_until_due": du,
            "overdue": du is not None and du < 0,
            "assignee": await _mcard(aid),
            "scope": _task_scope(aid), "done": False,
        })
    # tasks finished today (so families can see what's already done + who ticked it off)
    tasks_done_today = []
    for it in await db.todo_items.find(
        {"family_id": fid, "done": True, "done_at": {"$gte": t}}, {"_id": 0}
    ).sort("done_at", -1).to_list(60):
        aid = it.get("assignee_member_id")
        tasks_done_today.append({
            "item_id": it["item_id"], "list_id": it.get("list_id"), "list_name": list_names.get(it.get("list_id")),
            "title": it.get("title"), "priority": it.get("priority", "normal"),
            "assignee": await _mcard(aid), "scope": _task_scope(aid),
            "done": True, "done_by": await _mcard(it.get("done_by_member_id")),
            "done_at": it.get("done_at"),
        })

    # --- Kids' chore progress today (with who marked each chore done) ----------
    _comp_today = {cc["chore_id"]: cc for cc in await db.chore_completions.find(
        {"family_id": fid, "date": t}, {"_id": 0}).to_list(500)}
    kids = []
    for m in members:
        if m.get("is_child") or m.get("role") == "child":
            my_chores = [ch for ch in chores if ch.get("owner_member_id") == m["member_id"]]
            chore_list = []
            done = 0
            for ch in my_chores:
                cc = _comp_today.get(ch["chore_id"])
                d = bool(cc)
                if d:
                    done += 1
                chore_list.append({"chore_id": ch["chore_id"], "title": ch.get("title"),
                                   "stars": ch.get("stars", 1), "done_today": d,
                                   "done_by": await _mcard((cc or {}).get("completed_by_member_id")) if d else None})
            chore_ids = [ch["chore_id"] for ch in my_chores]
            streak = await _chore_streak(fid, m["member_id"], chore_ids)
            kids.append({"member": _member_card(m), "done": done, "total": len(my_chores),
                         "chores": chore_list, "streak": streak, "streak_badge": _streak_badge(streak)})

    # --- Shopping preview ------------------------------------------------------
    shopping_preview = []
    for l in shopping:
        for u in await db.shopping_items.find({"list_id": l["list_id"], "checked": False}, {"_id": 0}).sort("created_at", 1).to_list(20):
            shopping_preview.append({"name": u["name"], "quantity": u.get("quantity"),
                                     "list_id": l["list_id"], "list_name": l.get("name")})
    shopping_preview = shopping_preview[:6]

    # --- Coming up: future events (30d) + upcoming birthdays -------------------
    end_iso = (date.today() + timedelta(days=30)).isoformat()
    coming_up = []
    for e in await db.events.find({"family_id": fid, "date": {"$gt": t, "$lte": end_iso}}, {"_id": 0}).sort("date", 1).to_list(50):
        coming_up.append({"kind": "event", "event_id": e["event_id"], "title": e["title"],
                          "date": e["date"], "color": e.get("color"), "days": _days_until(e["date"])})
    for b in upcoming_birthdays:
        coming_up.append({"kind": "birthday", "member": _member_card(b["member"]),
                          "title": f"{b['member']['name']}'s birthday", "days": b["days"]})
    coming_up.sort(key=lambda x: x.get("days") if x.get("days") is not None else 999)
    coming_up = coming_up[:8]

    # --- Vault expiring (viewer-scoped, summary only, no sensitive fields) -----
    vault_expiring = []
    for d in await db.vault_items.find({"family_id": fid, "expiry_date": {"$ne": None}}, {"_id": 0}).to_list(2000):
        du = _days_until(d.get("expiry_date"))
        if du is not None and 0 <= du <= 60 and _can_view_secure(d, mine):
            vault_expiring.append({"item_id": d["item_id"], "title": d.get("title"),
                                   "kind": d.get("kind"), "days_until_expiry": du})
    vault_expiring.sort(key=lambda x: x["days_until_expiry"])
    vault_expiring = vault_expiring[:5]

    # --- Wish list reminder for the nearest birthday (reservation-safe) --------
    wishlist_reminder = None
    if upcoming_birthdays:
        b = upcoming_birthdays[0]
        bm = b["member"]
        docs = await db.wish_items.find(
            {"family_id": fid, "owner_member_id": bm["member_id"], "is_family": {"$ne": True}},
            {"_id": 0}).sort("priority", -1).to_list(50)
        visible = [d for d in docs if _can_view_wish(d, mine)]
        top = [await hydrate_wish(d, mine) for d in visible[:3]]
        if top:
            wishlist_reminder = {"member": _member_card(bm), "days": b["days"], "wishes": top}

    # --- Latest post peek ------------------------------------------------------
    latest = await db.posts.find({"family_id": fid}, {"_id": 0}).sort("created_at", -1).to_list(1)
    latest_post = await hydrate_post(latest[0], fid, my_id) if latest else None

    # --- Family chat peek: pinned + last message -------------------------------
    family_chat_peek = None
    fchat = await db.chats.find_one({"family_id": fid, "type": "family"}, {"_id": 0})
    if fchat:
        pinned = None
        pid = fchat.get("pinned_message_id")
        if pid:
            pm = await db.messages.find_one({"message_id": pid}, {"_id": 0})
            if pm:
                sender = await db.members.find_one({"member_id": pm["sender_member_id"]}, {"_id": 0})
                pinned = {"text": pm.get("text") or "📷 Photo", "sender": _member_card(sender)}
        family_chat_peek = {"chat_id": fchat["chat_id"], "last_message": fchat.get("last_message"), "pinned": pinned}

    # --- Active SOS (for the auto-pinned Home Emergency card) ------------------
    active_sos = await db.sos_alerts.find(
        {"family_id": fid, "status": "active"}, {"_id": 0}).sort("created_at", -1).to_list(10)
    for a in active_sos:
        a["member"] = _member_card(await db.members.find_one({"member_id": a.get("member_id")}, {"_id": 0}))
        if a.get("blood_group") is None and a.get("allergies") is None:
            a["blood_group"], a["allergies"] = await _member_medical(fid, a.get("member_id"))

    # --- Needs attention (prioritised) -----------------------------------------
    def _plural(n):
        return "s" if n != 1 else ""
    needs_attention = []
    if active_sos:
        a0 = active_sos[0]
        needs_attention.append({"key": "sos", "icon": "warning", "tone": "error",
                                "title": f"🚨 {a0.get('member_name', 'Someone')} triggered an SOS",
                                "subtitle": "Open the Emergency Center", "route": "/emergency"})
    overdue_tasks = [tk for tk in tasks if tk["overdue"]]
    if overdue_tasks:
        needs_attention.append({"key": "tasks_overdue", "icon": "alert-circle", "tone": "error",
                                "title": f"{len(overdue_tasks)} overdue task{_plural(len(overdue_tasks))}",
                                "subtitle": overdue_tasks[0]["title"], "route": "/todos"})
    due_today = [tk for tk in tasks if tk.get("days_until_due") == 0]
    if due_today:
        needs_attention.append({"key": "tasks_due", "icon": "time", "tone": "warning",
                                "title": f"{len(due_today)} task{_plural(len(due_today))} due today",
                                "subtitle": due_today[0]["title"], "route": "/todos"})
    if pending_chores:
        needs_attention.append({"key": "chores", "icon": "checkbox", "tone": "info",
                                "title": f"{pending_chores} chore{_plural(pending_chores)} left today",
                                "subtitle": "Review the kids' chores", "route": "/chores"})
    if shopping_pending:
        names = ", ".join([s["name"] for s in shopping_preview[:3]])
        needs_attention.append({"key": "shopping", "icon": "cart", "tone": "success",
                                "title": f"{shopping_pending} item{_plural(shopping_pending)} to buy",
                                "subtitle": names or "Shopping list", "route": "/shopping"})
    if vault_expiring:
        v = vault_expiring[0]
        needs_attention.append({"key": "vault", "icon": "lock-closed", "tone": "warning",
                                "title": f"{v['title']} expires in {v['days_until_expiry']} day{_plural(v['days_until_expiry'])}",
                                "subtitle": "Family Vault", "route": "/vault"})
    tomorrow_iso = (date.today() + timedelta(days=1)).isoformat()
    exp_notices = await db.notices.find({"family_id": fid, "expiry_date": tomorrow_iso}, {"_id": 0}).to_list(20)
    if exp_notices:
        needs_attention.append({"key": "notice_expiring", "icon": "reader", "tone": "info",
                                "title": f"{exp_notices[0]['title']} ends tomorrow",
                                "subtitle": "Family noticeboard", "route": "/notice"})
    for b in upcoming_birthdays:
        if b["days"] <= 7:
            when = "today" if b["days"] == 0 else f"in {b['days']} day{_plural(b['days'])}"
            needs_attention.append({"key": f"bday_{b['member']['member_id']}", "icon": "gift", "tone": "brand",
                                    "title": f"{b['member']['name']}'s birthday {when}",
                                    "subtitle": "Send a wish or a gift",
                                    "route": f"/birthday/{b['member']['member_id']}"})
            break

    # --- Evening recap summary -------------------------------------------------
    chores_done_today = await db.chore_completions.count_documents({"family_id": fid, "date": t})
    today_summary = {
        "events": len(events_today),
        "chores_done": chores_done_today,
        "chores_total": len(chores),
        "tasks_open": len(tasks),
        "loves_today": await db.affections.count_documents({"family_id": fid, "created_at": {"$gte": t}}),
        "posts_today": await db.posts.count_documents({"family_id": fid, "created_at": {"$gte": t}}),
        "memories_today": await db.timeline.count_documents({"family_id": fid, "created_at": {"$gte": t}}),
    }

    # --- Family noticeboard (top active notices) -------------------------------
    notice_docs = await db.notices.find({"family_id": fid}, {"_id": 0}).to_list(500)
    notice_active = [d for d in notice_docs if not d.get("expiry_date") or d["expiry_date"][:10] >= t]
    notice_active.sort(key=lambda d: d.get("created_at", ""), reverse=True)
    notice_active.sort(key=lambda d: not d.get("pinned"))
    notices = []
    for d in notice_active[:3]:
        notices.append({
            "notice_id": d["notice_id"], "title": d.get("title"), "note": d.get("note"),
            "priority": d.get("priority", "normal"), "pinned": bool(d.get("pinned")),
            "expiry_date": d.get("expiry_date"), "photo_url": d.get("photo_url"),
            "reply_count": len(d.get("replies", []) or []),
            "seen_count": len(d.get("seen_by", []) or []),
            "owner": _member_card(await db.members.find_one({"member_id": d.get("owner_member_id")}, {"_id": 0})),
        })

    storage_hint = None
    if mine and mine.get("role") in ("admin", "parent"):
        msg_total = await db.messages.count_documents({"family_id": fid})
        media_files = await db.media.count_documents({"family_id": fid})
        if msg_total >= 800 or media_files >= 120:
            storage_hint = {"messages": msg_total, "media_files": media_files}

    helpers_today = []
    if mine and mine.get("role") in ("admin", "parent"):
        async for h in db.helpers.find({"family_id": fid, "status": "active"}, {"_id": 0}).limit(6):
            htasks = await _helper_today_tasks(h)
            role = ROLE_MAP.get(h.get("role"), ROLE_MAP["custom"])
            helpers_today.append({
                "helper_id": h["helper_id"], "name": h.get("name"),
                "role_label": role["label"], "role_icon": role["icon"], "photo_url": h.get("photo_url"),
                "on_duty": _within_hours(h), "tasks_total": len(htasks),
                "tasks_done": sum(1 for t in htasks if t.get("done")),
                "next_task": next(({"title": t.get("title"), "due_time": t.get("due_time")}
                                   for t in htasks if not t.get("done")), None),
            })

    return {
        "family": fam,
        "me": mine,
        "members": members,
        "events_today": events_today,
        "pending_chores": pending_chores,
        "upcoming_birthdays": upcoming_birthdays,
        "unseen_affection": unseen_affection,
        "recent_posts": recent_posts,
        "shopping_pending": shopping_pending,
        "unread_messages": unread_messages,
        "on_this_day": on_this_day,
        "family_streak": family_streak,
        "meals_today": meals_today,
        "tasks": tasks,
        "tasks_done_today": tasks_done_today,
        "kids": kids,
        "shopping_preview": shopping_preview,
        "coming_up": coming_up,
        "vault_expiring": vault_expiring,
        "wishlist_reminder": wishlist_reminder,
        "latest_post": latest_post,
        "family_chat": family_chat_peek,
        "needs_attention": needs_attention,
        "active_sos": active_sos,
        "today_summary": today_summary,
        "notices": notices,
        "storage_hint": storage_hint,
        "helpers_today": helpers_today,
    }


# ---------------------------------------------------------------------------
# Family noticeboard + dashboard preferences
# ---------------------------------------------------------------------------
async def _hydrate_notice(d: dict, mine: Optional[dict] = None) -> dict:
    d = clean(dict(d))
    d["owner"] = _member_card(await db.members.find_one({"member_id": d.get("owner_member_id")}, {"_id": 0}))
    d["days_until_expiry"] = _days_until(d.get("expiry_date"))
    groups = {}
    for r in d.get("reactions", []) or []:
        g = groups.setdefault(r.get("emoji"), {"emoji": r.get("emoji"), "count": 0, "mine": False})
        g["count"] += 1
        if mine and r.get("member_id") == mine["member_id"]:
            g["mine"] = True
    d["reaction_summary"] = list(groups.values())
    raw_replies = d.get("replies", []) or []
    d["reply_count"] = len(raw_replies)
    replies = []
    for rp in raw_replies:
        replies.append({**rp, "member": _member_card(await db.members.find_one({"member_id": rp.get("member_id")}, {"_id": 0}))})
    d["replies"] = replies
    seen_ids = d.get("seen_by") or []
    d["seen_count"] = len(seen_ids)
    d["seen"] = bool(mine and mine["member_id"] in seen_ids)
    seen_members = []
    for mid in seen_ids:
        mc = _member_card(await db.members.find_one({"member_id": mid}, {"_id": 0}))
        if mc:
            seen_members.append(mc)
    d["seen_members"] = seen_members
    d.pop("seen_by", None)
    d.pop("reactions", None)
    return d


@api.get("/notices")
async def list_notices(user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    t = today_str()
    docs = await db.notices.find({"family_id": fid}, {"_id": 0}).to_list(500)
    active = [d for d in docs if not d.get("expiry_date") or d["expiry_date"][:10] >= t]
    active.sort(key=lambda d: d.get("created_at", ""), reverse=True)
    active.sort(key=lambda d: not d.get("pinned"))
    return [await _hydrate_notice(d, mine) for d in active]


@api.get("/notices/{notice_id}")
async def get_notice(notice_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    d = await db.notices.find_one({"notice_id": notice_id, "family_id": fid}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Notice not found")
    return await _hydrate_notice(d, mine)


@api.post("/notices", status_code=201)
async def create_notice(body: NoticeIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    if not mine:
        raise HTTPException(status_code=400, detail="No family profile")
    if not body.title.strip():
        raise HTTPException(status_code=400, detail="Give your note a title")
    doc = {
        "notice_id": new_id("ntc_"), "family_id": fid, "title": body.title.strip(),
        "note": (body.note or "").strip() or None, "expiry_date": body.expiry_date,
        "priority": body.priority if body.priority in ("normal", "high") else "normal",
        "pinned": bool(body.pinned), "photo_url": body.photo_url, "owner_member_id": mine["member_id"],
        "reactions": [], "replies": [], "seen_by": [], "created_at": now_iso(),
    }
    await db.notices.insert_one(doc)
    return await _hydrate_notice(doc, mine)


@api.patch("/notices/{notice_id}")
async def update_notice(notice_id: str, body: NoticePatch, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    d = await db.notices.find_one({"notice_id": notice_id, "family_id": fid}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Notice not found")
    if not mine or (d.get("owner_member_id") != mine["member_id"] and mine.get("role") not in ("admin", "parent")):
        raise HTTPException(status_code=403, detail="You can't edit this note")
    updates = {k: v for k, v in body.dict().items() if v is not None}
    if updates:
        await db.notices.update_one({"notice_id": notice_id, "family_id": fid}, {"$set": updates})
    d = await db.notices.find_one({"notice_id": notice_id, "family_id": fid}, {"_id": 0})
    return await _hydrate_notice(d, mine)


@api.post("/notices/{notice_id}/react")
async def react_notice(notice_id: str, body: NoticeReactionIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    if not mine:
        raise HTTPException(status_code=400, detail="No family profile")
    d = await db.notices.find_one({"notice_id": notice_id, "family_id": fid}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Notice not found")
    reactions = [r for r in (d.get("reactions") or []) if r.get("member_id") != mine["member_id"]]
    already = any(r.get("member_id") == mine["member_id"] and r.get("emoji") == body.emoji
                  for r in (d.get("reactions") or []))
    if not already:
        reactions.append({"member_id": mine["member_id"], "emoji": body.emoji})
    await db.notices.update_one({"notice_id": notice_id, "family_id": fid}, {"$set": {"reactions": reactions}})
    d = await db.notices.find_one({"notice_id": notice_id, "family_id": fid}, {"_id": 0})
    return await _hydrate_notice(d, mine)


@api.post("/notices/{notice_id}/replies", status_code=201)
async def reply_notice(notice_id: str, body: NoticeReplyIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    if not mine:
        raise HTTPException(status_code=400, detail="No family profile")
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="Write a reply first")
    d = await db.notices.find_one({"notice_id": notice_id, "family_id": fid}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Notice not found")
    reply = {"reply_id": new_id("nr_"), "member_id": mine["member_id"],
             "text": body.text.strip(), "created_at": now_iso()}
    await db.notices.update_one({"notice_id": notice_id, "family_id": fid}, {"$push": {"replies": reply}})
    d = await db.notices.find_one({"notice_id": notice_id, "family_id": fid}, {"_id": 0})
    return await _hydrate_notice(d, mine)


@api.post("/notices/{notice_id}/seen")
async def mark_notice_seen(notice_id: str, user: dict = Depends(get_current_user)):
    """Record that the current member has viewed this notice (for a 'Seen by N')."""
    fid = require_family(user)
    mine = await member_for_user(user)
    if not mine:
        raise HTTPException(status_code=400, detail="No family profile")
    d = await db.notices.find_one({"notice_id": notice_id, "family_id": fid}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Notice not found")
    await db.notices.update_one({"notice_id": notice_id, "family_id": fid},
                                {"$addToSet": {"seen_by": mine["member_id"]}})
    d = await db.notices.find_one({"notice_id": notice_id, "family_id": fid}, {"_id": 0})
    return await _hydrate_notice(d, mine)


@api.delete("/notices/{notice_id}")
async def delete_notice(notice_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    d = await db.notices.find_one({"notice_id": notice_id, "family_id": fid}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Notice not found")
    if not mine or (d.get("owner_member_id") != mine["member_id"] and mine.get("role") not in ("admin", "parent")):
        raise HTTPException(status_code=403, detail="You can't delete this note")
    await db.notices.delete_one({"notice_id": notice_id, "family_id": fid})
    return {"ok": True}


@api.get("/dashboard/prefs")
async def get_dashboard_prefs(user: dict = Depends(get_current_user)):
    require_family(user)
    doc = await db.dashboard_prefs.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not doc:
        return {"order": [], "hidden": [], "pinned": [], "compact": False}
    return {"order": doc.get("order", []), "hidden": doc.get("hidden", []),
            "pinned": doc.get("pinned", []), "compact": bool(doc.get("compact"))}


@api.put("/dashboard/prefs")
async def put_dashboard_prefs(body: DashboardPrefsIn, user: dict = Depends(get_current_user)):
    require_family(user)
    await db.dashboard_prefs.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"user_id": user["user_id"], "order": body.order, "hidden": body.hidden,
                  "pinned": body.pinned, "compact": body.compact}}, upsert=True)
    return {"ok": True, "order": body.order, "hidden": body.hidden, "pinned": body.pinned, "compact": body.compact}


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------
class ChatIn(BaseModel):
    type: str = "direct"           # direct | group
    member_ids: List[str] = []
    name: Optional[str] = None


class MessageIn(BaseModel):
    text: Optional[str] = None
    media: List[MediaItem] = []
    reply_to: Optional[str] = None
    type: str = "text"             # text | image | affection | voice | location | live_location | file
    affection_key: Optional[str] = None
    duration: Optional[int] = None  # ms, for voice notes
    lat: Optional[float] = None
    lng: Optional[float] = None
    live_until: Optional[str] = None   # iso; only for live_location
    file_name: Optional[str] = None
    file_size: Optional[int] = None
    file_mime: Optional[str] = None


class MsgReactIn(BaseModel):
    emoji: str


class PinIn(BaseModel):
    message_id: str


class ChatPatch(BaseModel):
    name: Optional[str] = None
    photo_url: Optional[str] = None
    add_member_ids: List[str] = []
    remove_member_ids: List[str] = []


class RetentionIn(BaseModel):
    days: Optional[int] = None  # None/0 = off; 1, 7, 30, 90


class LocationUpdateIn(BaseModel):
    lat: float
    lng: float


class CleanupIn(BaseModel):
    scope: str                 # "chat_history" | "chat_media"
    older_than_days: int = 0   # 0 = everything


async def get_last_read(chat_id: str, member_id: str) -> Optional[str]:
    r = await db.chat_reads.find_one({"chat_id": chat_id, "member_id": member_id}, {"_id": 0})
    return r["last_read_at"] if r else None


async def _unread_count(chat_id: str, member_id: str) -> int:
    lr = await get_last_read(chat_id, member_id)
    q = {"chat_id": chat_id, "sender_member_id": {"$ne": member_id}}
    if lr:
        q["created_at"] = {"$gt": lr}
    return await db.messages.count_documents(q)


async def hydrate_chat(chat: dict, mine: dict) -> dict:
    members = []
    for mid in chat.get("member_ids", []):
        m = await db.members.find_one({"member_id": mid}, {"_id": 0})
        if m:
            members.append(m)
    display_name = chat.get("name")
    avatar = None
    color = "#D98E5A"
    if chat["type"] == "direct":
        other = next((m for m in members if m["member_id"] != mine["member_id"]), None)
        display_name = other["name"] if other else "Chat"
        avatar = other["photo_url"] if other else None
        color = other["color"] if other else "#FF6B6B"
    elif chat["type"] == "family":
        display_name = display_name or "Family Chat"
        color = "#FF6B6B"
    else:
        display_name = display_name or "Group"
        avatar = chat.get("photo_url")
    out = clean(dict(chat))
    out["members"] = members
    out["display_name"] = display_name
    out["avatar"] = avatar
    out["color"] = color
    out["unread"] = await _unread_count(chat["chat_id"], mine["member_id"])
    out["pinned_message"] = None
    pid = chat.get("pinned_message_id")
    if pid:
        pm = await db.messages.find_one({"message_id": pid, "chat_id": chat["chat_id"]}, {"_id": 0})
        if pm:
            pm["sender"] = await db.members.find_one({"member_id": pm["sender_member_id"]}, {"_id": 0})
            out["pinned_message"] = pm
    return out


async def ensure_family_chat(fid: str, mine: dict) -> dict:
    fam_chat = await db.chats.find_one({"family_id": fid, "type": "family"}, {"_id": 0})
    if not fam_chat:
        members = await db.members.find({"family_id": fid}, {"_id": 0}).to_list(200)
        fam_chat = {
            "chat_id": new_id("chat_"), "family_id": fid, "type": "family", "name": None,
            "member_ids": [m["member_id"] for m in members], "created_by": mine["member_id"],
            "last_message": None, "created_at": now_iso(),
        }
        await db.chats.insert_one(fam_chat)
    else:
        # keep the family chat in sync with any newly added members
        members = await db.members.find({"family_id": fid}, {"_id": 0}).to_list(200)
        all_ids = [m["member_id"] for m in members]
        if set(all_ids) != set(fam_chat.get("member_ids", [])):
            await db.chats.update_one({"chat_id": fam_chat["chat_id"]}, {"$set": {"member_ids": all_ids}})
            fam_chat["member_ids"] = all_ids
    return fam_chat


async def _require_chat(chat_id: str, fid: str, mine: dict) -> dict:
    chat = await db.chats.find_one({"chat_id": chat_id, "family_id": fid}, {"_id": 0})
    if not chat or mine["member_id"] not in chat.get("member_ids", []):
        raise HTTPException(status_code=404, detail="Conversation not found")
    return chat


@api.get("/chats")
async def list_chats(user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    if not mine:
        return []
    await ensure_family_chat(fid, mine)
    chats = await db.chats.find({"family_id": fid, "member_ids": mine["member_id"]}, {"_id": 0}).to_list(200)
    hyd = [await hydrate_chat(ch, mine) for ch in chats]
    hyd.sort(key=lambda c: (c.get("last_message") or {}).get("created_at", "") or c["created_at"], reverse=True)
    return hyd


@api.post("/chats")
async def create_chat(body: ChatIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    if not mine:
        raise HTTPException(status_code=400, detail="No family profile")
    ids = sorted(set(body.member_ids) | {mine["member_id"]})
    if len(ids) < 2:
        raise HTTPException(status_code=400, detail="Pick at least one person")
    if body.type == "direct" and len(ids) == 2:
        existing = await db.chats.find_one(
            {"family_id": fid, "type": "direct", "member_ids": {"$all": ids, "$size": 2}}, {"_id": 0})
        if existing:
            return await hydrate_chat(existing, mine)
    chat = {
        "chat_id": new_id("chat_"), "family_id": fid,
        "type": "direct" if (body.type == "direct" and len(ids) == 2) else "group",
        "name": body.name if body.type != "direct" else None,
        "member_ids": ids, "created_by": mine["member_id"], "last_message": None, "created_at": now_iso(),
    }
    await db.chats.insert_one(chat)
    return await hydrate_chat(chat, mine)


@api.get("/chats/{chat_id}")
async def get_chat(chat_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    chat = await _require_chat(chat_id, fid, mine)
    return await hydrate_chat(chat, mine)


async def _purge_expired_messages(chat: dict):
    """Disappearing messages: delete anything older than the chat's retention window,
    including attached media (frees storage)."""
    days = chat.get("retention_days")
    if not days:
        return
    cutoff = (datetime.now(timezone.utc) - timedelta(days=int(days))).isoformat()
    old = await db.messages.find(
        {"chat_id": chat["chat_id"], "created_at": {"$lt": cutoff}},
        {"media": 1, "message_id": 1, "_id": 0}).to_list(5000)
    if not old:
        return
    for m in old:
        for mi in (m.get("media") or []):
            await _delete_media_file((mi.get("url") or "").replace("/api/files/", ""))
    ids = [m["message_id"] for m in old]
    await db.messages.delete_many({"message_id": {"$in": ids}})
    await db.msg_reactions.delete_many({"message_id": {"$in": ids}})


@api.patch("/chats/{chat_id}/retention")
async def set_retention(chat_id: str, body: RetentionIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    chat = await _require_chat(chat_id, fid, mine)
    if mine.get("role") not in ("admin", "parent"):
        raise HTTPException(status_code=403, detail="Only parents can change disappearing messages")
    days = body.days if body.days in (1, 7, 30, 90) else None
    await db.chats.update_one({"chat_id": chat_id}, {"$set": {"retention_days": days}})
    if days:
        chat["retention_days"] = days
        await _purge_expired_messages(chat)
    return {"ok": True, "retention_days": days}


@api.patch("/chats/{chat_id}/messages/{message_id}/location")
async def update_live_location(chat_id: str, message_id: str, body: LocationUpdateIn,
                               user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    await _require_chat(chat_id, fid, mine)
    msg = await db.messages.find_one({"message_id": message_id, "chat_id": chat_id}, {"_id": 0})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg.get("sender_member_id") != mine["member_id"]:
        raise HTTPException(status_code=403, detail="Only the sender can update this location")
    await db.messages.update_one({"message_id": message_id},
                                 {"$set": {"lat": body.lat, "lng": body.lng, "location_updated_at": now_iso()}})
    return {"ok": True}


@api.post("/chats/{chat_id}/messages/{message_id}/stop-live")
async def stop_live_location(chat_id: str, message_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    await _require_chat(chat_id, fid, mine)
    msg = await db.messages.find_one({"message_id": message_id, "chat_id": chat_id}, {"_id": 0})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg.get("sender_member_id") != mine["member_id"]:
        raise HTTPException(status_code=403, detail="Only the sender can stop sharing")
    await db.messages.update_one({"message_id": message_id}, {"$set": {"live_until": now_iso()}})
    return {"ok": True}


@api.get("/chats/{chat_id}/media")
async def chat_media(chat_id: str, user: dict = Depends(get_current_user)):
    """All photos + files shared in a conversation, newest first (for the gallery)."""
    fid = require_family(user)
    mine = await member_for_user(user)
    chat = await _require_chat(chat_id, fid, mine)
    await _purge_expired_messages(chat)
    photos, files = [], []
    cursor = db.messages.find({"chat_id": chat_id, "type": {"$in": ["image", "file"]}}, {"_id": 0}).sort("created_at", -1)
    async for m in cursor:
        if not m.get("media"):
            continue
        sender = await db.members.find_one({"member_id": m["sender_member_id"]}, {"_id": 0})
        card = _member_card(sender) if sender else None
        if m.get("type") == "image":
            photos.append({"message_id": m["message_id"], "url": m["media"][0]["url"],
                           "created_at": m["created_at"], "sender": card})
        else:
            files.append({"message_id": m["message_id"], "url": m["media"][0]["url"],
                          "file_name": m.get("file_name"), "file_size": m.get("file_size"),
                          "file_mime": m.get("file_mime"), "created_at": m["created_at"], "sender": card})
    return {"photos": photos, "files": files}


@api.get("/chats/{chat_id}/messages")
async def get_messages(chat_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    chat = await _require_chat(chat_id, fid, mine)
    await _purge_expired_messages(chat)
    msgs = await db.messages.find({"chat_id": chat_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    ids = [m["message_id"] for m in msgs]
    rx: dict = {}
    async for r in db.msg_reactions.find({"message_id": {"$in": ids}}, {"_id": 0}):
        rx.setdefault(r["message_id"], []).append(r)
    for m in msgs:
        m["sender"] = await db.members.find_one({"member_id": m["sender_member_id"]}, {"_id": 0})
        summary: dict = {}
        my = None
        for r in rx.get(m["message_id"], []):
            summary[r["emoji"]] = summary.get(r["emoji"], 0) + 1
            if r["member_id"] == mine["member_id"]:
                my = r["emoji"]
        m["reactions"] = summary
        m["my_reaction"] = my
    reads = {}
    async for r in db.chat_reads.find({"chat_id": chat_id}, {"_id": 0}):
        reads[r["member_id"]] = r["last_read_at"]
    cutoff = (datetime.now(timezone.utc) - timedelta(seconds=6)).isoformat()
    typing = []
    async for tdoc in db.typing.find({"chat_id": chat_id, "at": {"$gte": cutoff}}, {"_id": 0}):
        if tdoc["member_id"] != mine["member_id"]:
            tm = await db.members.find_one({"member_id": tdoc["member_id"]}, {"_id": 0})
            if tm:
                typing.append(tm)
    return {"messages": msgs, "reads": reads, "typing": typing}


@api.post("/chats/{chat_id}/messages")
async def send_message(chat_id: str, body: MessageIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    chat = await _require_chat(chat_id, fid, mine)
    await _purge_expired_messages(chat)

    reply_preview = None
    if body.reply_to:
        r = await db.messages.find_one({"message_id": body.reply_to}, {"_id": 0})
        if r:
            rs = await db.members.find_one({"member_id": r["sender_member_id"]}, {"_id": 0})
            snippet = r.get("text") or ("📷 Photo" if r.get("media") else "❤️")
            reply_preview = {"name": rs["name"] if rs else "", "text": snippet}

    msg = {
        "message_id": new_id("msg_"), "chat_id": chat_id, "family_id": fid,
        "sender_member_id": mine["member_id"], "text": body.text, "media": [m.dict() for m in body.media],
        "type": body.type, "affection_key": body.affection_key, "reply_to": body.reply_to,
        "reply_preview": reply_preview, "duration": body.duration,
        "lat": body.lat, "lng": body.lng, "live_until": body.live_until,
        "location_updated_at": now_iso() if body.type in ("location", "live_location") else None,
        "file_name": body.file_name, "file_size": body.file_size, "file_mime": body.file_mime,
        "created_at": now_iso(),
    }
    await db.messages.insert_one(msg)

    if body.type == "affection" and body.affection_key:
        preview = AFFECTION_LABELS.get(body.affection_key, "❤️")
    elif body.type == "voice":
        preview = "🎤 Voice message"
    elif body.type in ("location", "live_location"):
        preview = "📍 Live location" if body.type == "live_location" else "📍 Location"
    elif body.type == "file":
        preview = f"📄 {body.file_name or 'File'}"
    elif body.media:
        preview = body.text or "📷 Photo"
    else:
        preview = body.text or ""
    await db.chats.update_one(
        {"chat_id": chat_id},
        {"$set": {"last_message": {"text": preview, "sender": mine["name"], "created_at": msg["created_at"], "type": body.type}}},
    )
    # sender has implicitly read their own message
    await db.chat_reads.update_one(
        {"chat_id": chat_id, "member_id": mine["member_id"]},
        {"$set": {"last_read_at": msg["created_at"]}}, upsert=True)

    # Push notify the other members (recipients are likely offline).
    try:
        others = [mid for mid in chat.get("member_ids", []) if mid != mine["member_id"]]
        recipients = await _member_user_ids(fid, others, exclude_user=user["user_id"])
        chat_title = chat.get("name") or ("Family Chat" if chat["type"] == "family" else mine["name"])
        push_title = mine["name"] if chat["type"] == "direct" else f"{mine['name']} · {chat_title}"
        await send_push(recipients, {"title": push_title, "message": preview or "New message",
                                     "action_url": f"/chat/{chat_id}"})
    except Exception as e:
        logger.warning(f"message push failed (non-blocking): {e}")

    # Chat → Affection: also record affection for recipients so it shows in the
    # Love timeline and triggers their received-love overlay.
    if body.type == "affection" and body.affection_key:
        for mid in chat.get("member_ids", []):
            if mid == mine["member_id"]:
                continue
            await db.affections.insert_one({
                "affection_id": new_id("aff_"), "family_id": fid, "from_member_id": mine["member_id"],
                "to_member_id": mid, "type": body.affection_key, "message": body.text,
                "is_family": chat["type"] != "direct", "seen": False, "created_at": msg["created_at"],
            })

    msg = clean(msg)
    msg["sender"] = mine
    return msg


@api.post("/chats/{chat_id}/read")
async def mark_chat_read(chat_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    await _require_chat(chat_id, fid, mine)
    await db.chat_reads.update_one(
        {"chat_id": chat_id, "member_id": mine["member_id"]},
        {"$set": {"last_read_at": now_iso()}}, upsert=True)
    return {"ok": True}


@api.post("/chats/{chat_id}/typing")
async def set_typing(chat_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    await _require_chat(chat_id, fid, mine)
    await db.typing.update_one(
        {"chat_id": chat_id, "member_id": mine["member_id"]},
        {"$set": {"at": now_iso()}}, upsert=True)
    return {"ok": True}


@api.post("/messages/{message_id}/react")
async def react_message(message_id: str, body: MsgReactIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    msg = await db.messages.find_one({"message_id": message_id, "family_id": fid}, {"_id": 0})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    existing = await db.msg_reactions.find_one({"message_id": message_id, "member_id": mine["member_id"]}, {"_id": 0})
    if existing and existing["emoji"] == body.emoji:
        await db.msg_reactions.delete_one({"message_id": message_id, "member_id": mine["member_id"]})
    else:
        await db.msg_reactions.update_one(
            {"message_id": message_id, "member_id": mine["member_id"]},
            {"$set": {"emoji": body.emoji, "family_id": fid, "created_at": now_iso()}}, upsert=True)
    return {"ok": True}


@api.post("/chats/{chat_id}/pin")
async def pin_message(chat_id: str, body: PinIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    await _require_chat(chat_id, fid, mine)
    msg = await db.messages.find_one({"message_id": body.message_id, "chat_id": chat_id}, {"_id": 0})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    # single pin per conversation — newest replaces the older one
    await db.chats.update_one({"chat_id": chat_id}, {"$set": {"pinned_message_id": body.message_id}})
    return {"ok": True}


@api.post("/chats/{chat_id}/unpin")
async def unpin_message(chat_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    await _require_chat(chat_id, fid, mine)
    await db.chats.update_one({"chat_id": chat_id}, {"$set": {"pinned_message_id": None}})
    return {"ok": True}


@api.patch("/chats/{chat_id}")
async def update_chat(chat_id: str, body: ChatPatch, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    chat = await _require_chat(chat_id, fid, mine)
    if chat["type"] != "group":
        raise HTTPException(status_code=400, detail="Only custom groups can be edited")
    updates: dict = {}
    if body.name is not None and body.name.strip():
        updates["name"] = body.name.strip()
    if body.photo_url is not None:
        updates["photo_url"] = body.photo_url or None
    ids = set(chat.get("member_ids", []))
    for mid in body.add_member_ids:
        m = await db.members.find_one({"member_id": mid, "family_id": fid}, {"_id": 0})
        if m:
            ids.add(mid)
    for mid in body.remove_member_ids:
        ids.discard(mid)
    ids.add(mine["member_id"])  # keep the current user in the group
    if len(ids) < 2:
        raise HTTPException(status_code=400, detail="A group needs at least 2 people")
    updates["member_ids"] = sorted(ids)
    await db.chats.update_one({"chat_id": chat_id}, {"$set": updates})
    chat = await db.chats.find_one({"chat_id": chat_id}, {"_id": 0})
    return await hydrate_chat(chat, mine)


class TimelineIn(BaseModel):
    title: str
    date: str                       # YYYY-MM-DD
    category: Optional[str] = "📸 Everyday Memories"
    location: Optional[str] = None
    description: Optional[str] = None
    people: List[str] = []
    media: List[MediaItem] = []
    importance: bool = False


async def hydrate_timeline(t: dict, my_member_id: Optional[str] = None) -> dict:
    t = clean(dict(t))
    people = []
    for pid in t.get("people", []):
        m = await db.members.find_one({"member_id": pid}, {"_id": 0})
        if m:
            people.append(m)
    t["people_members"] = people
    tid = t["timeline_id"]
    t["love_count"] = await db.timeline_reactions.count_documents({"timeline_id": tid})
    t["comment_count"] = await db.timeline_comments.count_documents({"timeline_id": tid})
    t["my_love"] = bool(my_member_id) and bool(
        await db.timeline_reactions.find_one({"timeline_id": tid, "member_id": my_member_id}))
    return t


@api.get("/timeline")
async def list_timeline(user: dict = Depends(get_current_user), member_id: Optional[str] = None,
                        category: Optional[str] = None, location: Optional[str] = None):
    fid = require_family(user)
    mine = await member_for_user(user)
    my_id = mine["member_id"] if mine else None
    q = {"family_id": fid}
    if member_id:
        q["people"] = member_id
    if category:
        q["category"] = category
    if location:
        q["location"] = {"$regex": f"^{re.escape(location)}$", "$options": "i"}
    events = await db.timeline.find(q, {"_id": 0}).sort("date", -1).to_list(1000)
    return [await hydrate_timeline(e, my_id) for e in events]


@api.post("/timeline")
async def create_timeline(body: TimelineIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    t = {
        "timeline_id": new_id("tl_"), "family_id": fid, "title": body.title.strip(),
        "date": body.date, "category": body.category, "location": body.location,
        "description": body.description, "people": body.people, "media": [m.dict() for m in body.media],
        "importance": body.importance, "created_by": mine["member_id"] if mine else None,
        "created_at": now_iso(),
    }
    await db.timeline.insert_one(t)
    return await hydrate_timeline(t)


@api.get("/timeline/on-this-day")
async def on_this_day(user: dict = Depends(get_current_user)):
    fid = require_family(user)
    today = date.today()
    mmdd = f"-{today.month:02d}-{today.day:02d}"
    events = await db.timeline.find(
        {"family_id": fid, "date": {"$regex": f"{mmdd}$"}}, {"_id": 0}).sort("date", -1).to_list(100)
    out = []
    for e in events:
        try:
            yr = int(e["date"][:4])
            e["years_ago"] = today.year - yr
        except ValueError:
            e["years_ago"] = 0
        out.append(await hydrate_timeline(e))
    # birthdays today
    birthdays = []
    for m in await db.members.find({"family_id": fid}, {"_id": 0}).to_list(200):
        if m.get("birthday") and m["birthday"].endswith(mmdd):
            birthdays.append(m)
    return {"events": out, "birthdays": birthdays}

@api.get("/timeline/places")
async def timeline_places(user: dict = Depends(get_current_user)):
    """Group memories by location for the 'Places we've been' view."""
    fid = require_family(user)
    events = await db.timeline.find(
        {"family_id": fid, "location": {"$nin": [None, ""]}}, {"_id": 0}).sort("date", -1).to_list(2000)
    groups: dict = {}
    for e in events:
        loc = (e.get("location") or "").strip()
        if not loc:
            continue
        key = loc.lower()
        g = groups.get(key)
        if not g:
            g = {"location": loc, "count": 0, "cover": None, "last_date": e.get("date")}
            groups[key] = g
        g["count"] += 1
        if not g["cover"] and e.get("media"):
            g["cover"] = e["media"][0].get("url")
    return sorted(groups.values(), key=lambda x: x["count"], reverse=True)




@api.get("/timeline/{timeline_id}")
async def get_timeline(timeline_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    t = await db.timeline.find_one({"timeline_id": timeline_id, "family_id": fid}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Memory not found")
    return await hydrate_timeline(t, mine["member_id"] if mine else None)


@api.post("/timeline/{timeline_id}/react")
async def react_timeline(timeline_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    if not mine:
        raise HTTPException(status_code=400, detail="No family profile")
    t = await db.timeline.find_one({"timeline_id": timeline_id, "family_id": fid}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Memory not found")
    existing = await db.timeline_reactions.find_one(
        {"timeline_id": timeline_id, "member_id": mine["member_id"]}, {"_id": 0})
    if existing:
        await db.timeline_reactions.delete_one({"timeline_id": timeline_id, "member_id": mine["member_id"]})
    else:
        await db.timeline_reactions.insert_one({
            "timeline_id": timeline_id, "family_id": fid, "member_id": mine["member_id"],
            "created_at": now_iso(),
        })
    return await hydrate_timeline(t, mine["member_id"])


@api.get("/timeline/{timeline_id}/comments")
async def list_timeline_comments(timeline_id: str, user: dict = Depends(get_current_user)):
    require_family(user)
    comments = await db.timeline_comments.find({"timeline_id": timeline_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    for c in comments:
        c["author"] = await db.members.find_one({"member_id": c["member_id"]}, {"_id": 0})
    return comments


@api.post("/timeline/{timeline_id}/comments")
async def add_timeline_comment(timeline_id: str, body: CommentIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    if not mine:
        raise HTTPException(status_code=400, detail="No family profile")
    c = {
        "comment_id": new_id("tcmt_"), "timeline_id": timeline_id, "family_id": fid,
        "member_id": mine["member_id"], "text": body.text, "created_at": now_iso(),
    }
    await db.timeline_comments.insert_one(c)
    c = clean(c)
    c["author"] = mine
    return c


@api.delete("/timeline/{timeline_id}")
async def delete_timeline(timeline_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    await db.timeline.delete_one({"timeline_id": timeline_id, "family_id": fid})
    await db.timeline_reactions.delete_many({"timeline_id": timeline_id})
    await db.timeline_comments.delete_many({"timeline_id": timeline_id})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Birthday wishes
# ---------------------------------------------------------------------------
class WishIn(BaseModel):
    message: str
    emoji: Optional[str] = "🎂"


@api.get("/birthdays/{member_id}/wishes")
async def list_wishes(member_id: str, user: dict = Depends(get_current_user), year: Optional[int] = None):
    fid = require_family(user)
    m = await db.members.find_one({"member_id": member_id, "family_id": fid}, {"_id": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Member not found")
    yr = year or date.today().year
    wishes = await db.wishes.find(
        {"family_id": fid, "member_id": member_id, "year": yr}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for w in wishes:
        w["from"] = await db.members.find_one({"member_id": w["from_member_id"]}, {"_id": 0})
    return {"member": m, "year": yr, "wishes": wishes}


@api.post("/birthdays/{member_id}/wishes")
async def add_wish(member_id: str, body: WishIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    if not mine:
        raise HTTPException(status_code=400, detail="No family profile")
    m = await db.members.find_one({"member_id": member_id, "family_id": fid}, {"_id": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Member not found")
    if not body.message.strip():
        raise HTTPException(status_code=400, detail="Write a wish first")
    yr = date.today().year
    w = {
        "wish_id": new_id("wish_"), "family_id": fid, "member_id": member_id, "year": yr,
        "from_member_id": mine["member_id"], "message": body.message.strip(),
        "emoji": body.emoji or "🎂", "created_at": now_iso(),
    }
    await db.wishes.insert_one(w)
    try:
        if m.get("linked_user_id") and m["linked_user_id"] != user["user_id"]:
            await send_push([m["linked_user_id"]], {
                "title": f"{mine['name']} sent you a birthday wish 🎂",
                "message": body.message.strip()[:120],
                "action_url": f"/birthday/{member_id}",
            })
    except Exception as e:
        logger.warning(f"birthday wish push failed (non-blocking): {e}")
    w = clean(w)
    w["from"] = mine
    return w


# ---------------------------------------------------------------------------
# This Week's Highlights
# ---------------------------------------------------------------------------
# Star points awarded per action (used by Rewards + weekly Star of the Week).
POINTS = {"post": 10, "love": 5, "memory": 15, "wish": 5, "chore": 8}


async def compute_weekly_stars(fid: str):
    """Per-member star points earned in the last 7 days + the current Star of the Week."""
    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(days=7)).isoformat()
    cutoff_date = (date.today() - timedelta(days=7)).isoformat()
    members = await db.members.find({"family_id": fid}, {"_id": 0}).to_list(200)
    scores = {m["member_id"]: {"member": m, "points": 0} for m in members}

    def add(mid, pts):
        if mid in scores:
            scores[mid]["points"] += pts

    for p in await db.posts.find({"family_id": fid, "created_at": {"$gte": cutoff}}, {"author_member_id": 1, "_id": 0}).to_list(5000):
        add(p.get("author_member_id"), POINTS["post"])
    for a in await db.affections.find({"family_id": fid, "created_at": {"$gte": cutoff}}, {"from_member_id": 1, "_id": 0}).to_list(20000):
        add(a.get("from_member_id"), POINTS["love"])
    for t in await db.timeline.find({"family_id": fid, "created_at": {"$gte": cutoff}}, {"created_by": 1, "_id": 0}).to_list(5000):
        add(t.get("created_by"), POINTS["memory"])
    for w in await db.wishes.find({"family_id": fid, "created_at": {"$gte": cutoff}}, {"from_member_id": 1, "_id": 0}).to_list(5000):
        add(w.get("from_member_id"), POINTS["wish"])
    for cc in await db.chore_completions.find({"family_id": fid, "date": {"$gte": cutoff_date}}, {"member_id": 1, "_id": 0}).to_list(20000):
        add(cc.get("member_id"), POINTS["chore"])

    board = sorted(scores.values(), key=lambda x: x["points"], reverse=True)
    star = board[0] if board and board[0]["points"] > 0 else None
    return board, star


@api.get("/highlights/week")
async def weekly_highlights(user: dict = Depends(get_current_user)):
    fid = require_family(user)
    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(days=7)).isoformat()

    posts = await db.posts.find(
        {"family_id": fid, "created_at": {"$gte": cutoff}}, {"_id": 0}).sort("created_at", -1).to_list(500)
    memories = await db.timeline.find(
        {"family_id": fid, "created_at": {"$gte": cutoff}}, {"_id": 0}).sort("created_at", -1).to_list(500)
    wishes = await db.wishes.find(
        {"family_id": fid, "created_at": {"$gte": cutoff}}, {"_id": 0}).to_list(1000)
    loves = await db.affections.count_documents({"family_id": fid, "created_at": {"$gte": cutoff}})

    _, star_of_week = await compute_weekly_stars(fid)

    def _mini(p):
        return {"id": p.get("post_id"), "caption": p.get("caption"),
                "cover": (p.get("media") or [{}])[0].get("url") if p.get("media") else None}

    return {
        "period": {"from": (now - timedelta(days=6)).date().isoformat(), "to": now.date().isoformat()},
        "counts": {
            "posts": len(posts), "memories": len(memories),
            "wishes": len(wishes), "loves": loves,
        },
        "star_of_week": star_of_week,
        "posts": [_mini(p) for p in posts[:6]],
        "memories": [{"id": m["timeline_id"], "title": m["title"], "date": m["date"],
                      "cover": (m.get("media") or [{}])[0].get("url") if m.get("media") else None}
                     for m in memories[:6]],
    }


# ---------------------------------------------------------------------------
# Time Capsules
# ---------------------------------------------------------------------------
class CapsuleIn(BaseModel):
    message: str
    media: List[MediaItem] = []
    unlock_date: str                # YYYY-MM-DD (must be in the future)


def _capsule_view(cap: dict) -> dict:
    """Hide the contents of a locked capsule to preserve the surprise."""
    locked = cap["unlock_date"] > date.today().isoformat()
    days = 0
    if locked:
        try:
            d = date.fromisoformat(cap["unlock_date"])
            days = (d - date.today()).days
        except ValueError:
            days = 0
    out = {
        "capsule_id": cap["capsule_id"], "unlock_date": cap["unlock_date"],
        "is_locked": locked, "days_until": days, "created_at": cap.get("created_at"),
        "author": cap.get("author"),
    }
    if not locked:
        out["message"] = cap.get("message")
        out["media"] = cap.get("media", [])
    return out


@api.get("/capsules")
async def list_capsules(user: dict = Depends(get_current_user)):
    fid = require_family(user)
    caps = await db.capsules.find({"family_id": fid}, {"_id": 0}).sort("unlock_date", 1).to_list(500)
    for cap in caps:
        cap["author"] = await db.members.find_one({"member_id": cap["author_member_id"]}, {"_id": 0})
    return [_capsule_view(cap) for cap in caps]


@api.post("/capsules")
async def create_capsule(body: CapsuleIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    if not mine:
        raise HTTPException(status_code=400, detail="No family profile")
    if not body.message.strip():
        raise HTTPException(status_code=400, detail="Write a message for your capsule")
    if body.unlock_date <= date.today().isoformat():
        raise HTTPException(status_code=400, detail="Pick a future unlock date")
    cap = {
        "capsule_id": new_id("cap_"), "family_id": fid, "author_member_id": mine["member_id"],
        "message": body.message.strip(), "media": [m.dict() for m in body.media],
        "unlock_date": body.unlock_date, "created_at": now_iso(),
    }
    await db.capsules.insert_one(cap)
    cap = clean(cap)
    cap["author"] = mine
    return _capsule_view(cap)


@api.get("/capsules/{capsule_id}")
async def get_capsule(capsule_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    cap = await db.capsules.find_one({"capsule_id": capsule_id, "family_id": fid}, {"_id": 0})
    if not cap:
        raise HTTPException(status_code=404, detail="Capsule not found")
    cap["author"] = await db.members.find_one({"member_id": cap["author_member_id"]}, {"_id": 0})
    return _capsule_view(cap)


@api.delete("/capsules/{capsule_id}")
async def delete_capsule(capsule_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    cap = await db.capsules.find_one({"capsule_id": capsule_id, "family_id": fid}, {"_id": 0})
    if not cap:
        raise HTTPException(status_code=404, detail="Capsule not found")
    if mine and cap["author_member_id"] != mine["member_id"]:
        raise HTTPException(status_code=403, detail="Only the author can delete this capsule")
    await db.capsules.delete_one({"capsule_id": capsule_id})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Rewards — star points, family streak, badges
# ---------------------------------------------------------------------------
BADGE_DEFS = [
    {"key": "first_post", "label": "First Post", "emoji": "📸", "metric": "posts", "target": 1},
    {"key": "storyteller", "label": "Storyteller", "emoji": "📖", "metric": "memories", "target": 5},
    {"key": "memory_keeper", "label": "Memory Keeper", "emoji": "🏛️", "metric": "memories", "target": 15},
    {"key": "love_bug", "label": "Love Bug", "emoji": "❤️", "metric": "loves", "target": 25},
    {"key": "birthday_star", "label": "Birthday Star", "emoji": "🎂", "metric": "wishes", "target": 5},
    {"key": "chatterbox", "label": "Chatterbox", "emoji": "💬", "metric": "messages", "target": 50},
    {"key": "on_fire", "label": "On Fire", "emoji": "🔥", "metric": "streak", "target": 7},
    {"key": "super_family", "label": "Super Family", "emoji": "🏆", "metric": "points", "target": 200},
]


@api.get("/rewards")
async def rewards(user: dict = Depends(get_current_user)):
    fid = require_family(user)
    members = await db.members.find({"family_id": fid}, {"_id": 0}).to_list(200)

    scores = {m["member_id"]: {"member": m, "points": 0, "posts": 0, "loves": 0, "memories": 0, "wishes": 0, "chores": 0} for m in members}

    def add(mid, key, pts):
        if mid in scores:
            scores[mid]["points"] += pts
            scores[mid][key] += 1

    for p in await db.posts.find({"family_id": fid}, {"author_member_id": 1, "_id": 0}).to_list(5000):
        add(p.get("author_member_id"), "posts", POINTS["post"])
    for a in await db.affections.find({"family_id": fid}, {"from_member_id": 1, "_id": 0}).to_list(20000):
        add(a.get("from_member_id"), "loves", POINTS["love"])
    for t in await db.timeline.find({"family_id": fid}, {"created_by": 1, "_id": 0}).to_list(5000):
        add(t.get("created_by"), "memories", POINTS["memory"])
    for w in await db.wishes.find({"family_id": fid}, {"from_member_id": 1, "_id": 0}).to_list(5000):
        add(w.get("from_member_id"), "wishes", POINTS["wish"])
    for cc in await db.chore_completions.find({"family_id": fid}, {"member_id": 1, "_id": 0}).to_list(20000):
        add(cc.get("member_id"), "chores", POINTS["chore"])

    leaderboard = sorted(scores.values(), key=lambda x: x["points"], reverse=True)

    streak = _streak_from_dates(await _family_activity_dates(fid))
    totals = {
        "posts": await db.posts.count_documents({"family_id": fid}),
        "memories": await db.timeline.count_documents({"family_id": fid}),
        "loves": await db.affections.count_documents({"family_id": fid}),
        "wishes": await db.wishes.count_documents({"family_id": fid}),
        "messages": await db.messages.count_documents({"family_id": fid}),
        "points": sum(s["points"] for s in scores.values()),
        "streak": streak,
    }
    badges = []
    for b in BADGE_DEFS:
        current = totals.get(b["metric"], 0)
        badges.append({**b, "current": min(current, b["target"]), "earned": current >= b["target"]})

    week_board, star_of_week = await compute_weekly_stars(fid)
    return {"leaderboard": leaderboard, "streak": streak, "totals": totals, "badges": badges,
            "week_leaderboard": week_board, "star_of_week": star_of_week}


# ---------------------------------------------------------------------------
# Family Albums
# ---------------------------------------------------------------------------
class AlbumIn(BaseModel):
    title: str
    description: Optional[str] = None


class AlbumPhotosIn(BaseModel):
    media: List[MediaItem] = []


@api.get("/albums")
async def list_albums(user: dict = Depends(get_current_user)):
    fid = require_family(user)
    albums = await db.albums.find({"family_id": fid}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for a in albums:
        a["creator"] = await db.members.find_one({"member_id": a["created_by"]}, {"_id": 0})
        a["photo_count"] = len(a.get("photos", []))
    return albums


@api.post("/albums")
async def create_album(body: AlbumIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    if not mine:
        raise HTTPException(status_code=400, detail="No family profile")
    if not body.title.strip():
        raise HTTPException(status_code=400, detail="Give your album a title")
    a = {
        "album_id": new_id("alb_"), "family_id": fid, "title": body.title.strip(),
        "description": (body.description or "").strip() or None, "created_by": mine["member_id"],
        "cover": None, "photos": [], "created_at": now_iso(),
    }
    await db.albums.insert_one(a)
    a = clean(a)
    a["creator"] = mine
    a["photo_count"] = 0
    return a


@api.get("/albums/{album_id}")
async def get_album(album_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    a = await db.albums.find_one({"album_id": album_id, "family_id": fid}, {"_id": 0})
    if not a:
        raise HTTPException(status_code=404, detail="Album not found")
    a["creator"] = await db.members.find_one({"member_id": a["created_by"]}, {"_id": 0})
    return a


@api.post("/albums/{album_id}/photos")
async def add_album_photos(album_id: str, body: AlbumPhotosIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    a = await db.albums.find_one({"album_id": album_id, "family_id": fid}, {"_id": 0})
    if not a:
        raise HTTPException(status_code=404, detail="Album not found")
    if not mine or a["created_by"] != mine["member_id"]:
        raise HTTPException(status_code=403, detail="Only the album creator can add photos")
    new_photos = [{"photo_id": new_id("ph_"), "url": m.url, "type": m.type,
                   "added_by": mine["member_id"], "created_at": now_iso()} for m in body.media]
    if not new_photos:
        return await get_album(album_id, user)
    update = {"$push": {"photos": {"$each": new_photos}}}
    if not a.get("cover"):
        update["$set"] = {"cover": new_photos[0]["url"]}
    await db.albums.update_one({"album_id": album_id}, update)
    return await get_album(album_id, user)


@api.delete("/albums/{album_id}")
async def delete_album(album_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    a = await db.albums.find_one({"album_id": album_id, "family_id": fid}, {"_id": 0})
    if not a:
        raise HTTPException(status_code=404, detail="Album not found")
    if not mine or a["created_by"] != mine["member_id"]:
        raise HTTPException(status_code=403, detail="Only the album creator can delete this album")
    await db.albums.delete_one({"album_id": album_id})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Global search — people, memories, posts, chats
# ---------------------------------------------------------------------------
@api.get("/search")
async def global_search(q: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    ql = (q or "").strip()
    if len(ql) < 1:
        return {"query": ql, "members": [], "memories": [], "posts": [], "chats": []}
    rx = {"$regex": re.escape(ql), "$options": "i"}

    members = await db.members.find(
        {"family_id": fid, "$or": [{"name": rx}, {"relationship": rx}]}, {"_id": 0}).to_list(50)

    mem_docs = await db.timeline.find(
        {"family_id": fid, "$or": [{"title": rx}, {"location": rx}]}, {"_id": 0}).sort("date", -1).to_list(30)
    memories = [await hydrate_timeline(m, mine["member_id"] if mine else None) for m in mem_docs]

    post_docs = await db.posts.find({"family_id": fid, "caption": rx}, {"_id": 0}).sort("created_at", -1).to_list(30)
    posts = []
    for p in post_docs:
        author = await db.members.find_one({"member_id": p["author_member_id"]}, {"_id": 0})
        posts.append({
            "post_id": p["post_id"], "caption": p.get("caption"), "author": author,
            "cover": (p.get("media") or [{}])[0].get("url") if p.get("media") else None,
            "created_at": p.get("created_at"),
        })

    chats = []
    if mine:
        chat_docs = await db.chats.find({"family_id": fid, "member_ids": mine["member_id"]}, {"_id": 0}).to_list(200)
        for ch in chat_docs:
            h = await hydrate_chat(ch, mine)
            if ql.lower() in (h.get("display_name") or "").lower():
                chats.append(h)

    return {"query": ql, "members": members, "memories": memories, "posts": posts, "chats": chats[:20]}






# ---------------------------------------------------------------------------
# Wish Lists & Gift Planning
# ---------------------------------------------------------------------------
def _is_adult(m: Optional[dict]) -> bool:
    return bool(m and m.get("role") in ("admin", "parent", "adult"))


def _is_grandparent(m: Optional[dict]) -> bool:
    if not m:
        return False
    rel = (m.get("relationship") or "").lower()
    return "grand" in rel or "nani" in rel or "dadi" in rel or "nana" in rel or "dada" in rel


def _member_card(m: Optional[dict]) -> Optional[dict]:
    if not m:
        return None
    return {"member_id": m.get("member_id"), "name": m.get("name"),
            "photo_url": m.get("photo_url"), "color": m.get("color"), "relationship": m.get("relationship")}


def _can_view_wish(item: dict, viewer: Optional[dict]) -> bool:
    """Visibility rules for a wish item (viewer is a member of the same family)."""
    if not viewer:
        return False
    if item.get("is_family"):
        return True
    if viewer["member_id"] == item.get("owner_member_id"):
        return True  # owner always sees their own list
    vis = item.get("visibility", "family")
    if vis == "family":
        return True
    if vis == "parents":
        return viewer.get("role") in ("admin", "parent")
    if vis == "grandparents":
        return _is_grandparent(viewer) or viewer.get("role") in ("admin", "parent")
    if vis == "selected":
        return viewer["member_id"] in (item.get("visible_member_ids") or [])
    return False


async def hydrate_wish(item: dict, viewer: Optional[dict]) -> dict:
    is_owner = bool(viewer and viewer["member_id"] == item.get("owner_member_id"))
    adult_viewer = _is_adult(viewer)
    reserved_by = item.get("reserved_by_member_id")
    reveal = bool(item.get("reveal_buyer"))
    raw_status = item.get("status", "wished")

    out = {
        "wish_id": item["wish_id"], "owner_member_id": item.get("owner_member_id"),
        "is_family": bool(item.get("is_family")),
        "name": item.get("name"), "photo_url": item.get("photo_url"),
        "product_url": item.get("product_url"), "price": item.get("price"),
        "store": item.get("store"), "size": item.get("size"), "color": item.get("color"),
        "notes": item.get("notes"), "priority": item.get("priority", 2),
        "occasion": item.get("occasion"), "category": item.get("category"),
        "visibility": item.get("visibility", "family"),
        "visible_member_ids": item.get("visible_member_ids") or [],
        "created_by": item.get("created_by"), "created_at": item.get("created_at"),
    }

    # Secret Gift Mode: preserve the surprise for the owner (and for children who aren't buyers).
    show_reservation = bool(reserved_by) and ((adult_viewer and not is_owner) or (is_owner and reveal))
    if show_reservation:
        rb = await db.members.find_one({"member_id": reserved_by}, {"_id": 0})
        out["status"] = raw_status
        out["is_reserved"] = True
        out["reserved_by"] = _member_card(rb)
        out["i_reserved"] = bool(viewer and reserved_by == viewer["member_id"])
    else:
        out["status"] = "wished"
        out["is_reserved"] = False
        out["reserved_by"] = None
        out["i_reserved"] = False
    out["can_reserve"] = adult_viewer and not is_owner and not reserved_by and not out["is_family"]
    out["can_edit"] = bool(viewer and (is_owner or viewer.get("role") in ("admin", "parent") or item.get("created_by") == viewer.get("member_id")))
    return out


async def _get_wish_or_404(wish_id: str, fid: str) -> dict:
    item = await db.wish_items.find_one({"wish_id": wish_id, "family_id": fid}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Wish not found")
    return item


@api.get("/wishlists")
async def wishlist_overview(user: dict = Depends(get_current_user)):
    """Hub: each member's wishlist count (only items the viewer may see) + the shared family list."""
    fid = require_family(user)
    viewer = await member_for_user(user)
    members = await db.members.find({"family_id": fid}, {"_id": 0}).to_list(200)
    items = await db.wish_items.find({"family_id": fid}, {"_id": 0}).to_list(5000)

    per_member = {m["member_id"]: 0 for m in members}
    family_count = 0
    for it in items:
        if it.get("is_family"):
            family_count += 1
        elif _can_view_wish(it, viewer):
            oid = it.get("owner_member_id")
            if oid in per_member:
                per_member[oid] += 1

    return {
        "members": [{"member": _member_card(m), "count": per_member.get(m["member_id"], 0),
                     "is_me": bool(viewer and viewer["member_id"] == m["member_id"])} for m in members],
        "family": {"count": family_count},
    }


@api.get("/wishlists/{owner}")
async def wishlist_items(owner: str, user: dict = Depends(get_current_user)):
    """owner = a member_id or the string 'family' for the shared list."""
    fid = require_family(user)
    viewer = await member_for_user(user)
    if owner == "family":
        q = {"family_id": fid, "is_family": True}
        owner_member = None
    else:
        q = {"family_id": fid, "owner_member_id": owner, "is_family": {"$ne": True}}
        owner_member = await db.members.find_one({"member_id": owner, "family_id": fid}, {"_id": 0})
        if not owner_member:
            raise HTTPException(status_code=404, detail="Member not found")
    docs = await db.wish_items.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)
    visible = [d for d in docs if d.get("is_family") or _can_view_wish(d, viewer)]
    items = [await hydrate_wish(d, viewer) for d in visible]
    can_add = owner == "family" or (viewer and (viewer["member_id"] == owner or viewer.get("role") in ("admin", "parent")))
    return {"owner": owner, "owner_member": _member_card(owner_member), "is_family": owner == "family",
            "can_add": bool(can_add), "items": items}


@api.post("/wishlists/{owner}/items", status_code=201)
async def add_wish(owner: str, body: WishItemIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    viewer = await member_for_user(user)
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Give the wish a name")
    is_family = owner == "family"
    if not is_family:
        target = await db.members.find_one({"member_id": owner, "family_id": fid}, {"_id": 0})
        if not target:
            raise HTTPException(status_code=404, detail="Member not found")
        allowed = viewer and (viewer["member_id"] == owner or viewer.get("role") in ("admin", "parent"))
        if not allowed:
            raise HTTPException(status_code=403, detail="You can only add to your own wishlist")
    item = {
        "wish_id": new_id("wish_"), "family_id": fid,
        "owner_member_id": None if is_family else owner, "is_family": is_family,
        "name": body.name.strip(), "photo_url": body.photo_url, "product_url": body.product_url,
        "price": body.price, "store": body.store, "size": body.size, "color": body.color,
        "notes": body.notes, "priority": max(1, min(3, body.priority)),
        "occasion": body.occasion, "category": body.category,
        "visibility": body.visibility if not is_family else "family",
        "visible_member_ids": body.visible_member_ids or [],
        "status": "wished", "reserved_by_member_id": None, "reveal_buyer": False,
        "created_by": viewer["member_id"] if viewer else None, "created_at": now_iso(),
    }
    await db.wish_items.insert_one(item)
    return await hydrate_wish(item, viewer)


@api.get("/wishlists/items/{wish_id}")
async def get_wish(wish_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    viewer = await member_for_user(user)
    item = await _get_wish_or_404(wish_id, fid)
    if not (item.get("is_family") or _can_view_wish(item, viewer)):
        raise HTTPException(status_code=403, detail="You can't view this wish")
    return await hydrate_wish(item, viewer)


@api.patch("/wishlists/items/{wish_id}")
async def edit_wish(wish_id: str, body: WishItemIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    viewer = await member_for_user(user)
    item = await _get_wish_or_404(wish_id, fid)
    is_owner = viewer and viewer["member_id"] == item.get("owner_member_id")
    if not (item.get("is_family") or is_owner or (viewer and viewer.get("role") in ("admin", "parent")) or item.get("created_by") == (viewer or {}).get("member_id")):
        raise HTTPException(status_code=403, detail="You can't edit this wish")
    await db.wish_items.update_one({"wish_id": wish_id}, {"$set": {
        "name": body.name.strip(), "photo_url": body.photo_url, "product_url": body.product_url,
        "price": body.price, "store": body.store, "size": body.size, "color": body.color,
        "notes": body.notes, "priority": max(1, min(3, body.priority)),
        "occasion": body.occasion, "category": body.category,
        "visibility": body.visibility if not item.get("is_family") else "family",
        "visible_member_ids": body.visible_member_ids or [],
    }})
    item = await _get_wish_or_404(wish_id, fid)
    return await hydrate_wish(item, viewer)


@api.delete("/wishlists/items/{wish_id}")
async def delete_wish(wish_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    viewer = await member_for_user(user)
    item = await _get_wish_or_404(wish_id, fid)
    is_owner = viewer and viewer["member_id"] == item.get("owner_member_id")
    if not (item.get("is_family") or is_owner or (viewer and viewer.get("role") in ("admin", "parent")) or item.get("created_by") == (viewer or {}).get("member_id")):
        raise HTTPException(status_code=403, detail="You can't delete this wish")
    await db.wish_items.delete_one({"wish_id": wish_id})
    await db.wish_notes.delete_many({"wish_id": wish_id})
    return {"ok": True}


@api.post("/wishlists/items/{wish_id}/reserve")
async def reserve_wish(wish_id: str, body: WishReserveIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    viewer = await member_for_user(user)
    if not _is_adult(viewer):
        raise HTTPException(status_code=403, detail="Only adults can reserve a gift")
    item = await _get_wish_or_404(wish_id, fid)
    if item.get("is_family"):
        raise HTTPException(status_code=400, detail="Shared family wishes can't be reserved")
    if viewer["member_id"] == item.get("owner_member_id"):
        raise HTTPException(status_code=400, detail="You can't reserve your own wish")
    if item.get("reserved_by_member_id") and item["reserved_by_member_id"] != viewer["member_id"]:
        raise HTTPException(status_code=409, detail="Someone is already getting this gift")
    await db.wish_items.update_one({"wish_id": wish_id}, {"$set": {
        "reserved_by_member_id": viewer["member_id"], "status": "reserved", "reveal_buyer": bool(body.reveal),
    }})
    item = await _get_wish_or_404(wish_id, fid)
    return await hydrate_wish(item, viewer)


@api.post("/wishlists/items/{wish_id}/unreserve")
async def unreserve_wish(wish_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    viewer = await member_for_user(user)
    item = await _get_wish_or_404(wish_id, fid)
    if item.get("reserved_by_member_id") != (viewer or {}).get("member_id"):
        raise HTTPException(status_code=403, detail="Only the person reserving can cancel")
    await db.wish_items.update_one({"wish_id": wish_id}, {"$set": {
        "reserved_by_member_id": None, "status": "wished", "reveal_buyer": False,
    }})
    item = await _get_wish_or_404(wish_id, fid)
    return await hydrate_wish(item, viewer)


@api.post("/wishlists/items/{wish_id}/status")
async def set_wish_status(wish_id: str, body: WishStatusIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    viewer = await member_for_user(user)
    if body.status not in ("wished", "reserved", "purchased", "received"):
        raise HTTPException(status_code=400, detail="Invalid status")
    item = await _get_wish_or_404(wish_id, fid)
    if item.get("reserved_by_member_id") != (viewer or {}).get("member_id"):
        raise HTTPException(status_code=403, detail="Only the person getting the gift can update this")
    await db.wish_items.update_one({"wish_id": wish_id}, {"$set": {"status": body.status}})
    item = await _get_wish_or_404(wish_id, fid)
    return await hydrate_wish(item, viewer)


@api.get("/wishlists/items/{wish_id}/notes")
async def wish_notes(wish_id: str, user: dict = Depends(get_current_user)):
    """Private gift-planning notes — adults only, hidden from the wish owner (Secret Gift Mode)."""
    fid = require_family(user)
    viewer = await member_for_user(user)
    item = await _get_wish_or_404(wish_id, fid)
    is_owner = viewer and viewer["member_id"] == item.get("owner_member_id")
    if not _is_adult(viewer) or is_owner or item.get("is_family"):
        raise HTTPException(status_code=403, detail="Gift planning is private to gift-givers")
    notes = await db.wish_notes.find({"wish_id": wish_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    for n in notes:
        n["member"] = _member_card(await db.members.find_one({"member_id": n["member_id"]}, {"_id": 0}))
    return notes


@api.post("/wishlists/items/{wish_id}/notes", status_code=201)
async def add_wish_note(wish_id: str, body: WishNoteIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    viewer = await member_for_user(user)
    item = await _get_wish_or_404(wish_id, fid)
    is_owner = viewer and viewer["member_id"] == item.get("owner_member_id")
    if not _is_adult(viewer) or is_owner or item.get("is_family"):
        raise HTTPException(status_code=403, detail="Gift planning is private to gift-givers")
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="Empty note")
    note = {"note_id": new_id("wn_"), "wish_id": wish_id, "family_id": fid,
            "member_id": viewer["member_id"], "text": body.text.strip(), "created_at": now_iso()}
    await db.wish_notes.insert_one(note)
    note = clean(note)
    note["member"] = _member_card(viewer)
    return note



# ---------------------------------------------------------------------------
# Family Vault (insurance & important documents)  +  Emergency Center
# ---------------------------------------------------------------------------
def _can_view_secure(item: dict, viewer: Optional[dict]) -> bool:
    """Visibility for Vault items. Family admin can always view (they control access)."""
    if not viewer:
        return False
    if viewer.get("role") == "admin":
        return True
    if item.get("owner_member_id") and item["owner_member_id"] == viewer["member_id"]:
        return True
    # Trusted emergency delegate: view-only access to every child's documents/insurance.
    if viewer.get("_emergency_delegate"):
        kids = viewer.get("_child_member_ids") or set()
        if item.get("owner_member_id") in kids:
            return True
        if any(mid in kids for mid in (item.get("covered_member_ids") or [])):
            return True
    vis = item.get("visibility", "family")
    if vis == "family":
        return True
    if vis == "parents":
        return viewer.get("role") in ("admin", "parent")
    if vis == "grandparents":
        return _is_grandparent(viewer) or viewer.get("role") in ("admin", "parent")
    if vis == "selected":
        return viewer["member_id"] in (item.get("visible_member_ids") or [])
    return False


def _can_edit_secure(item: dict, viewer: Optional[dict]) -> bool:
    if not viewer:
        return False
    if viewer.get("role") in ("admin", "parent"):
        return True
    if item.get("owner_member_id") == viewer.get("member_id"):
        return True
    return item.get("created_by") == viewer.get("member_id")


async def _secure_viewer(user: dict) -> Optional[dict]:
    """member_for_user + trusted-emergency-delegate context for Vault visibility."""
    viewer = await member_for_user(user)
    if not viewer:
        return viewer
    fid = user.get("family_id")
    dele = await db.emergency_delegates.find_one(
        {"family_id": fid, "member_id": viewer["member_id"]}, {"_id": 0})
    if dele:
        viewer["_emergency_delegate"] = True
        members = await db.members.find({"family_id": fid}, {"_id": 0}).to_list(200)
        viewer["_child_member_ids"] = {
            m["member_id"] for m in members if m.get("is_child") or m.get("role") == "child"}
    return viewer


_MEDICAL_DETAIL_FIELDS = ("medication", "conditions", "doctor", "doctor_phone", "hospital",
                          "insurance_provider", "policy_reference", "insurance", "emergency_contact")


def _can_view_medical_detail(viewer: Optional[dict], member_id: str) -> bool:
    """Detailed medical fields (medication/conditions/doctor/hospital/insurance) are
    limited to the member themselves, parents/admin, and a trusted emergency delegate
    (for the children they cover). Blood group + allergies stay family-visible for
    fast emergency access ('Medical at a Glance')."""
    if not viewer:
        return False
    if viewer.get("member_id") == member_id:
        return True
    if viewer.get("role") in ("admin", "parent"):
        return True
    if viewer.get("_emergency_delegate") and member_id in (viewer.get("_child_member_ids") or set()):
        return True
    return False


def _days_until(expiry: Optional[str]) -> Optional[int]:
    if not expiry:
        return None
    try:
        return (date.fromisoformat(expiry[:10]) - date.today()).days
    except ValueError:
        return None


async def hydrate_vault(item: dict, viewer: Optional[dict]) -> dict:
    out = clean(dict(item))
    out["days_until_expiry"] = _days_until(item.get("expiry_date"))
    out["can_edit"] = _can_edit_secure(item, viewer)
    if item.get("owner_member_id"):
        out["owner"] = _member_card(await db.members.find_one({"member_id": item["owner_member_id"]}, {"_id": 0}))
    else:
        out["owner"] = None
    covered = []
    for mid in item.get("covered_member_ids") or []:
        covered.append(_member_card(await db.members.find_one({"member_id": mid}, {"_id": 0})))
    out["covered_members"] = [c for c in covered if c]
    return out


@api.get("/vault/folders")
async def vault_folders(user: dict = Depends(get_current_user)):
    fid = require_family(user)
    folders = await db.vault_folders.find({"family_id": fid}, {"_id": 0}).sort("created_at", 1).to_list(200)
    viewer = await _secure_viewer(user)
    items = await db.vault_items.find({"family_id": fid}, {"_id": 0}).to_list(5000)
    visible = [it for it in items if _can_view_secure(it, viewer)]
    counts: dict = {}
    for it in visible:
        counts[it.get("folder_id")] = counts.get(it.get("folder_id"), 0) + 1
    for f in folders:
        f["count"] = counts.get(f["folder_id"], 0)
    return folders


@api.post("/vault/folders", status_code=201)
async def create_vault_folder(body: VaultFolderIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Folder needs a name")
    f = {"folder_id": new_id("vf_"), "family_id": fid, "name": body.name.strip(),
         "icon": body.icon or "folder", "created_at": now_iso()}
    await db.vault_folders.insert_one(f)
    return {**clean(f), "count": 0}


@api.delete("/vault/folders/{folder_id}")
async def delete_vault_folder(folder_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    viewer = await member_for_user(user)
    if not (viewer and viewer.get("role") in ("admin", "parent")):
        raise HTTPException(status_code=403, detail="Only parents can delete folders")
    await db.vault_folders.delete_one({"folder_id": folder_id, "family_id": fid})
    await db.vault_items.update_many({"family_id": fid, "folder_id": folder_id}, {"$set": {"folder_id": None}})
    return {"ok": True}


@api.get("/vault/items")
async def vault_items(folder_id: Optional[str] = None, kind: Optional[str] = None,
                      user: dict = Depends(get_current_user)):
    fid = require_family(user)
    viewer = await _secure_viewer(user)
    q: dict = {"family_id": fid}
    if folder_id:
        q["folder_id"] = folder_id
    if kind:
        q["kind"] = kind
    docs = await db.vault_items.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)
    visible = [d for d in docs if _can_view_secure(d, viewer)]
    return [await hydrate_vault(d, viewer) for d in visible]


@api.post("/vault/items", status_code=201)
async def create_vault_item(body: VaultItemIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    viewer = await member_for_user(user)
    if not viewer or viewer.get("role") not in ("admin", "parent", "adult"):
        raise HTTPException(status_code=403, detail="Only adults can add to the Family Vault")
    if not body.title.strip():
        raise HTTPException(status_code=400, detail="Give this a title")
    item = {
        "item_id": new_id("vi_"), "family_id": fid, "kind": body.kind if body.kind in ("document", "insurance") else "document",
        "title": body.title.strip(), "folder_id": body.folder_id, "owner_member_id": body.owner_member_id,
        "notes": body.notes, "tags": body.tags or [], "issue_date": body.issue_date, "expiry_date": body.expiry_date,
        "files": [f.model_dump() for f in body.files], "visibility": body.visibility,
        "visible_member_ids": body.visible_member_ids or [],
        "provider": body.provider, "policy_number": body.policy_number, "policy_holder": body.policy_holder,
        "coverage_amount": body.coverage_amount, "premium": body.premium, "agent_contact": body.agent_contact,
        "claims_number": body.claims_number, "emergency_number": body.emergency_number, "website": body.website,
        "covered_member_ids": body.covered_member_ids or [],
        "created_by": viewer["member_id"], "created_at": now_iso(),
    }
    await db.vault_items.insert_one(item)
    return await hydrate_vault(item, viewer)


@api.get("/vault/expiries")
async def vault_expiries(days: int = 180, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    viewer = await _secure_viewer(user)
    docs = await db.vault_items.find({"family_id": fid, "expiry_date": {"$ne": None}}, {"_id": 0}).to_list(2000)
    out = []
    for d in docs:
        du = _days_until(d.get("expiry_date"))
        if du is not None and -3650 <= du <= days and _can_view_secure(d, viewer):
            out.append(await hydrate_vault(d, viewer))
    out.sort(key=lambda x: x.get("days_until_expiry") if x.get("days_until_expiry") is not None else 99999)
    return out


@api.get("/vault/items/{item_id}")
async def get_vault_item(item_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    viewer = await _secure_viewer(user)
    item = await db.vault_items.find_one({"item_id": item_id, "family_id": fid}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    if not _can_view_secure(item, viewer):
        raise HTTPException(status_code=403, detail="You don't have access to this")
    return await hydrate_vault(item, viewer)


@api.patch("/vault/items/{item_id}")
async def edit_vault_item(item_id: str, body: VaultItemIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    viewer = await member_for_user(user)
    item = await db.vault_items.find_one({"item_id": item_id, "family_id": fid}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    if not _can_edit_secure(item, viewer):
        raise HTTPException(status_code=403, detail="You can't edit this")
    await db.vault_items.update_one({"item_id": item_id}, {"$set": {
        "kind": body.kind if body.kind in ("document", "insurance") else item.get("kind", "document"),
        "title": body.title.strip(), "folder_id": body.folder_id, "owner_member_id": body.owner_member_id,
        "notes": body.notes, "tags": body.tags or [], "issue_date": body.issue_date, "expiry_date": body.expiry_date,
        "files": [f.model_dump() for f in body.files], "visibility": body.visibility,
        "visible_member_ids": body.visible_member_ids or [],
        "provider": body.provider, "policy_number": body.policy_number, "policy_holder": body.policy_holder,
        "coverage_amount": body.coverage_amount, "premium": body.premium, "agent_contact": body.agent_contact,
        "claims_number": body.claims_number, "emergency_number": body.emergency_number, "website": body.website,
        "covered_member_ids": body.covered_member_ids or [],
    }})
    item = await db.vault_items.find_one({"item_id": item_id, "family_id": fid}, {"_id": 0})
    return await hydrate_vault(item, viewer)


@api.delete("/vault/items/{item_id}")
async def delete_vault_item(item_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    viewer = await member_for_user(user)
    item = await db.vault_items.find_one({"item_id": item_id, "family_id": fid}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    if not _can_edit_secure(item, viewer):
        raise HTTPException(status_code=403, detail="You can't delete this")
    await db.vault_items.delete_one({"item_id": item_id})
    return {"ok": True}


# ---- Emergency Center ----
@api.get("/emergency/contacts")
async def emergency_contacts(user: dict = Depends(get_current_user)):
    fid = require_family(user)
    docs = await db.emergency_contacts.find({"family_id": fid}, {"_id": 0}).to_list(500)
    docs.sort(key=lambda c: (not c.get("critical"), (c.get("name") or "").lower()))
    return docs


@api.post("/emergency/contacts", status_code=201)
async def add_emergency_contact(body: EmergencyContactIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    viewer = await member_for_user(user)
    if not body.name.strip() or not body.phone.strip():
        raise HTTPException(status_code=400, detail="Name and phone are required")
    c = {"contact_id": new_id("ec_"), "family_id": fid, **body.model_dump(),
         "name": body.name.strip(), "phone": body.phone.strip(),
         "created_by": viewer["member_id"] if viewer else None, "created_at": now_iso()}
    await db.emergency_contacts.insert_one(c)
    return clean(c)


@api.patch("/emergency/contacts/{contact_id}")
async def edit_emergency_contact(contact_id: str, body: EmergencyContactIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    existing = await db.emergency_contacts.find_one({"contact_id": contact_id, "family_id": fid}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Not found")
    await db.emergency_contacts.update_one({"contact_id": contact_id}, {"$set": {
        **body.model_dump(), "name": body.name.strip(), "phone": body.phone.strip()}})
    return clean(await db.emergency_contacts.find_one({"contact_id": contact_id, "family_id": fid}, {"_id": 0}))


@api.delete("/emergency/contacts/{contact_id}")
async def delete_emergency_contact(contact_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    await db.emergency_contacts.delete_one({"contact_id": contact_id, "family_id": fid})
    return {"ok": True}


@api.get("/emergency/instructions")
async def emergency_instructions(user: dict = Depends(get_current_user)):
    fid = require_family(user)
    return await db.emergency_instructions.find({"family_id": fid}, {"_id": 0}).sort("created_at", 1).to_list(200)


@api.post("/emergency/instructions", status_code=201)
async def add_emergency_instruction(body: EmergencyInstructionIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    viewer = await member_for_user(user)
    if not (viewer and viewer.get("role") in ("admin", "parent")):
        raise HTTPException(status_code=403, detail="Only parents can add instructions")
    ins = {"instruction_id": new_id("ei_"), "family_id": fid, "title": body.title.strip(),
           "icon": body.icon or "🚨", "steps": [s for s in body.steps if s.strip()],
           "contact_ids": body.contact_ids or [], "created_at": now_iso()}
    await db.emergency_instructions.insert_one(ins)
    return clean(ins)


@api.patch("/emergency/instructions/{instruction_id}")
async def edit_emergency_instruction(instruction_id: str, body: EmergencyInstructionIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    viewer = await member_for_user(user)
    if not (viewer and viewer.get("role") in ("admin", "parent")):
        raise HTTPException(status_code=403, detail="Only parents can edit instructions")
    if not await db.emergency_instructions.find_one({"instruction_id": instruction_id, "family_id": fid}):
        raise HTTPException(status_code=404, detail="Not found")
    await db.emergency_instructions.update_one({"instruction_id": instruction_id}, {"$set": {
        "title": body.title.strip(), "icon": body.icon or "🚨",
        "steps": [s for s in body.steps if s.strip()], "contact_ids": body.contact_ids or []}})
    return clean(await db.emergency_instructions.find_one({"instruction_id": instruction_id, "family_id": fid}, {"_id": 0}))


@api.delete("/emergency/instructions/{instruction_id}")
async def delete_emergency_instruction(instruction_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    viewer = await member_for_user(user)
    if not (viewer and viewer.get("role") in ("admin", "parent")):
        raise HTTPException(status_code=403, detail="Only parents can delete instructions")
    await db.emergency_instructions.delete_one({"instruction_id": instruction_id, "family_id": fid})
    return {"ok": True}


@api.get("/emergency/plan")
async def get_family_plan(user: dict = Depends(get_current_user)):
    fid = require_family(user)
    plan = await db.family_plans.find_one({"family_id": fid}, {"_id": 0})
    return plan or {"family_id": fid, "last_reviewed": None}


@api.put("/emergency/plan")
async def save_family_plan(body: FamilyPlanIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    viewer = await member_for_user(user)
    if not (viewer and viewer.get("role") in ("admin", "parent")):
        raise HTTPException(status_code=403, detail="Only parents can update the plan")
    data = {**body.model_dump(), "family_id": fid, "last_reviewed": now_iso()}
    await db.family_plans.update_one({"family_id": fid}, {"$set": data}, upsert=True)
    return clean(await db.family_plans.find_one({"family_id": fid}, {"_id": 0}))


@api.get("/emergency/medical")
async def list_medical_cards(user: dict = Depends(get_current_user)):
    """Quick medical view for every member: blood group + allergies (for the SOS screen)."""
    fid = require_family(user)
    members = await db.members.find({"family_id": fid}, {"_id": 0}).to_list(200)
    cards = {c["member_id"]: c for c in await db.medical_cards.find({"family_id": fid}, {"_id": 0}).to_list(500)}
    out = []
    for m in members:
        card = cards.get(m["member_id"]) or {}
        out.append({
            "member": _member_card(m),
            "blood_group": card.get("blood_group"),
            "allergies": card.get("allergies"),
            "has_card": bool(card),
        })
    # members with real info first (blood group or allergies)
    out.sort(key=lambda x: not (x["blood_group"] or x["allergies"]))
    return out


@api.get("/emergency/medical/{member_id}")
async def get_medical_card(member_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    m = await db.members.find_one({"member_id": member_id, "family_id": fid}, {"_id": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Member not found")
    viewer = await _secure_viewer(user)
    can_detail = _can_view_medical_detail(viewer, member_id)
    card = await db.medical_cards.find_one({"member_id": member_id, "family_id": fid}, {"_id": 0})
    if not card:
        return {"member_id": member_id, "member": _member_card(m), "can_view_detail": can_detail}
    out = dict(card)
    out["member"] = _member_card(m)
    out["can_view_detail"] = can_detail
    if not can_detail:
        # keep only the emergency 'at a glance' fields; hide sensitive detail
        for f in _MEDICAL_DETAIL_FIELDS:
            out.pop(f, None)
        out["detail_restricted"] = True
    return out


@api.put("/emergency/medical/{member_id}")
async def save_medical_card(member_id: str, body: MedicalCardIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    viewer = await member_for_user(user)
    m = await db.members.find_one({"member_id": member_id, "family_id": fid}, {"_id": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Member not found")
    # a member can edit their own; parents/admin can edit anyone (they control children's info)
    if not (viewer and (viewer["member_id"] == member_id or viewer.get("role") in ("admin", "parent"))):
        raise HTTPException(status_code=403, detail="You can't edit this medical card")
    data = {**body.model_dump(), "member_id": member_id, "family_id": fid, "updated_at": now_iso()}
    await db.medical_cards.update_one({"member_id": member_id, "family_id": fid}, {"$set": data}, upsert=True)
    card = await db.medical_cards.find_one({"member_id": member_id, "family_id": fid}, {"_id": 0})
    card["member"] = _member_card(m)
    return card


@api.post("/emergency/sos", status_code=201)
async def trigger_sos(body: SosTriggerIn, user: dict = Depends(get_current_user)):
    """Raise a family SOS: alerts the family in chat + push, optionally sharing location."""
    fid = require_family(user)
    me = await member_for_user(user)
    now = now_iso()
    loc = None
    if body.latitude is not None and body.longitude is not None:
        loc = {"latitude": body.latitude, "longitude": body.longitude,
               "maps_url": f"https://www.google.com/maps?q={body.latitude},{body.longitude}"}
    bg, allergies = await _member_medical(fid, (me or {}).get("member_id"))
    alert = {"sos_id": new_id("sos_"), "family_id": fid, "member_id": (me or {}).get("member_id"),
             "member_name": (me or {}).get("name", "Someone"), "location": loc,
             "blood_group": bg, "allergies": allergies,
             "message": (body.message or "").strip() or None, "status": "active", "created_at": now}
    await db.sos_alerts.insert_one(alert)

    # post to the main family chat so everyone sees it immediately
    fam_chat = await db.chats.find_one({"family_id": fid, "type": "family"}, {"_id": 0})
    if fam_chat:
        loc_txt = f"\n📍 Location: {loc['maps_url']}" if loc else ""
        body_txt = f"\n{alert['message']}" if alert["message"] else ""
        text = f"🚨 FAMILY SOS 🚨\n{alert['member_name']} needs help.{body_txt}{loc_txt}"
        await db.messages.insert_one({
            "message_id": new_id("msg_"), "chat_id": fam_chat["chat_id"], "family_id": fid,
            "sender_member_id": alert["member_id"], "text": text, "media": [],
            "type": "text", "created_at": now,
        })
        await db.chats.update_one({"chat_id": fam_chat["chat_id"]}, {"$set": {
            "last_message": {"text": "🚨 Family SOS", "sender": alert["member_name"], "created_at": now, "type": "text"}}})

    members = await db.members.find({"family_id": fid}, {"_id": 0}).to_list(200)
    recipients = [m["linked_user_id"] for m in members
                  if m.get("linked_user_id") and m["linked_user_id"] != user["user_id"]]
    push_ok = False
    try:
        if recipients:
            await send_push(recipients, {
                "title": "🚨 Family SOS",
                "message": f"{alert['member_name']} triggered an SOS alert. Tap to respond.",
                "action_url": "/emergency",
            }, idempotency_key=alert["sos_id"])
        push_ok = True
    except Exception as e:
        logger.warning(f"SOS push failed (non-blocking): {e}")
    return {**clean(alert), "notified": len(recipients), "push_ok": push_ok}


async def _member_medical(fid: str, member_id: Optional[str]):
    """Blood group + allergies for a member (for the SOS banner)."""
    if not member_id:
        return (None, None)
    card = await db.medical_cards.find_one({"family_id": fid, "member_id": member_id}, {"_id": 0})
    return ((card or {}).get("blood_group"), (card or {}).get("allergies"))


@api.get("/emergency/sos/active")
async def active_sos(user: dict = Depends(get_current_user)):
    fid = require_family(user)
    alerts = await db.sos_alerts.find({"family_id": fid, "status": "active"}, {"_id": 0}).sort("created_at", -1).to_list(20)
    for a in alerts:
        a["member"] = _member_card(await db.members.find_one({"member_id": a.get("member_id")}, {"_id": 0}))
        if a.get("blood_group") is None and a.get("allergies") is None:
            a["blood_group"], a["allergies"] = await _member_medical(fid, a.get("member_id"))
    return alerts


@api.post("/emergency/sos/{sos_id}/resolve")
async def resolve_sos(sos_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    await db.sos_alerts.update_one({"sos_id": sos_id, "family_id": fid}, {"$set": {"status": "resolved"}})
    return {"ok": True}


# ---- Trusted emergency access (delegates) ----
@api.get("/emergency/delegates")
async def list_delegates(user: dict = Depends(get_current_user)):
    """Adult relatives granted view-only access to every child's medical + vault info."""
    fid = require_family(user)
    docs = await db.emergency_delegates.find({"family_id": fid}, {"_id": 0}).to_list(50)
    out = []
    for d in docs:
        m = await db.members.find_one({"member_id": d["member_id"], "family_id": fid}, {"_id": 0})
        if m:
            out.append({**clean(d), "member": _member_card(m)})
    return out


@api.post("/emergency/delegates", status_code=201)
async def add_delegate(body: DelegateIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    viewer = await member_for_user(user)
    if not (viewer and viewer.get("role") in ("admin", "parent")):
        raise HTTPException(status_code=403, detail="Only parents can grant emergency access")
    m = await db.members.find_one({"member_id": body.member_id, "family_id": fid}, {"_id": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Member not found")
    if m.get("is_child") or m.get("role") == "child":
        raise HTTPException(status_code=400, detail="Choose an adult relative")
    await db.emergency_delegates.update_one(
        {"family_id": fid, "member_id": body.member_id},
        {"$set": {"family_id": fid, "member_id": body.member_id,
                  "granted_by": viewer["member_id"], "created_at": now_iso()}},
        upsert=True)
    return {"ok": True}


@api.delete("/emergency/delegates/{member_id}")
async def remove_delegate(member_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    viewer = await member_for_user(user)
    if not (viewer and viewer.get("role") in ("admin", "parent")):
        raise HTTPException(status_code=403, detail="Only parents can change emergency access")
    await db.emergency_delegates.delete_one({"family_id": fid, "member_id": member_id})
    return {"ok": True}



# ---------------------------------------------------------------------------
# Media upload / serve
# ---------------------------------------------------------------------------
@api.post("/upload")
async def upload(file: UploadFile = File(...), kind: str = Form("image"), user: dict = Depends(get_current_user)):
    data = await file.read()
    default_ext = {"video": "mp4", "audio": "m4a"}.get(kind, "jpg")
    ext = (file.filename or "file").split(".")[-1].lower() if "." in (file.filename or "") else default_ext
    path = f"{APP_NAME}/uploads/{user['user_id']}/{uuid.uuid4().hex}.{ext}"
    default_ct = {"video": "video/mp4", "audio": "audio/m4a"}.get(kind, "image/jpeg")
    ct = file.content_type or default_ct
    try:
        result = await run_in_threadpool(_put_object, path, data, ct)
    except Exception as e:
        logger.exception("upload failed")
        raise HTTPException(status_code=502, detail=f"Upload failed: {e}")
    await db.media.insert_one({
        "media_id": new_id("md_"), "owner_id": user["user_id"], "family_id": user.get("family_id"),
        "storage_path": result["path"], "content_type": ct, "kind": kind, "created_at": now_iso(),
    })
    return {"path": result["path"], "url": f"/api/files/{result['path']}", "type": kind}


@api.get("/storage/usage")
async def storage_usage(user: dict = Depends(get_current_user)):
    fid = require_family(user)
    msg_total = await db.messages.count_documents({"family_id": fid})
    media_msgs = await db.messages.count_documents({"family_id": fid, "media.0": {"$exists": True}})
    media_files = await db.media.count_documents({"family_id": fid})
    return {"messages": msg_total, "media_messages": media_msgs, "media_files": media_files}


@api.get("/storage/breakdown")
async def storage_breakdown(user: dict = Depends(get_current_user)):
    """Per-month breakdown of family chat data so parents see where space goes."""
    fid = require_family(user)
    pipeline = [
        {"$match": {"family_id": fid}},
        {
            "$group": {
                "_id": {"$substr": ["$created_at", 0, 7]},
                "messages": {"$sum": 1},
                "media": {"$sum": {"$cond": [{"$gt": [{"$size": {"$ifNull": ["$media", []]}}, 0]}, 1, 0]}},
            }
        },
        {"$sort": {"_id": -1}},
        {"$limit": 24},
    ]
    months = []
    async for row in db.messages.aggregate(pipeline):
        key = row.get("_id") or ""
        label = key
        try:
            label = datetime.strptime(key, "%Y-%m").strftime("%B %Y")
        except ValueError:
            pass
        months.append({"month": key, "label": label, "messages": row.get("messages", 0), "media": row.get("media", 0)})
    return {"months": months}


@api.post("/storage/cleanup")
async def storage_cleanup(body: CleanupIn, user: dict = Depends(get_current_user)):
    """Permanently remove old chat data to free space. Parents/admin only."""
    fid = require_family(user)
    mine = await member_for_user(user)
    if not (mine and mine.get("role") in ("admin", "parent")):
        raise HTTPException(status_code=403, detail="Only parents can clear family data")
    days = max(0, int(body.older_than_days or 0))
    q: dict = {"family_id": fid}
    if days > 0:
        q["created_at"] = {"$lt": (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()}
    if body.scope == "chat_media":
        msgs = await db.messages.find({**q, "media.0": {"$exists": True}},
                                      {"media": 1, "message_id": 1, "_id": 0}).to_list(10000)
        removed = 0
        for m in msgs:
            for mi in (m.get("media") or []):
                await _delete_media_file((mi.get("url") or "").replace("/api/files/", ""))
                removed += 1
            await db.messages.update_one(
                {"message_id": m["message_id"]},
                {"$set": {"media": [], "type": "text"},
                 "$unset": {"file_name": "", "file_size": "", "file_mime": ""}})
        return {"ok": True, "media_removed": removed}
    # default: delete whole messages
    msgs = await db.messages.find(q, {"media": 1, "message_id": 1, "_id": 0}).to_list(20000)
    for m in msgs:
        for mi in (m.get("media") or []):
            await _delete_media_file((mi.get("url") or "").replace("/api/files/", ""))
    ids = [m["message_id"] for m in msgs]
    if ids:
        await db.messages.delete_many({"message_id": {"$in": ids}})
        await db.msg_reactions.delete_many({"message_id": {"$in": ids}})
    return {"ok": True, "messages_removed": len(ids)}


async def _serve_file_for_helper(path: str, payload: dict):
    """Media access for helper tokens — least privilege: only files that belong
    to the Care Team chat, this helper's 1:1 chat, or the helper's own uploads."""
    hid, fid = payload.get("helper_id"), payload.get("family_id")
    h = await db.helpers.find_one({"helper_id": hid, "family_id": fid}, {"_id": 0, "status": 1})
    if not h or h.get("status") != "active":
        raise HTTPException(status_code=401, detail="Not authenticated")
    rec = await db.media.find_one({"storage_path": path}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="File not found")
    if rec.get("family_id") not in (fid, None):
        raise HTTPException(status_code=404, detail="File not found")
    url = f"/api/files/{path}"
    allowed = rec.get("owner_id") == hid
    if not allowed:
        allowed = bool(await db.care_team_messages.find_one(
            {"family_id": fid, "$or": [{"photo_url": url}, {"audio_url": url}]}, {"_id": 1}))
    if not allowed:
        allowed = bool(await db.helper_messages.find_one(
            {"helper_id": hid, "$or": [{"photo_url": url}, {"audio_url": url}]}, {"_id": 1}))
    if not allowed:
        raise HTTPException(status_code=404, detail="File not found")
    try:
        content, ct = await run_in_threadpool(_get_object, path)
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")
    return Response(content=content, media_type=ct, headers={"Cache-Control": "private, max-age=86400"})


@api.get("/files/{path:path}")
async def serve_file(path: str, authorization: Optional[str] = Header(None),
                     token: Optional[str] = Query(None)):
    raw = None
    if authorization and authorization.lower().startswith("bearer "):
        raw = authorization.split(" ", 1)[1].strip()
    elif token:
        raw = token
    payload = _decode_token(raw) if raw else None
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if payload.get("account_type") in ("helper", "helper_media"):
        return await _serve_file_for_helper(path, payload)
    u = await db.users.find_one({"user_id": payload.get("user_id")}, {"_id": 0})
    if not u:
        raise HTTPException(status_code=401, detail="Not authenticated")
    viewer_fid = u.get("family_id")  # authoritative family from the live user record
    rec = await db.media.find_one({"storage_path": path}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="File not found")
    owner_fid = rec.get("family_id")
    if owner_fid is None:  # legacy media uploaded before family tagging
        owner = await db.users.find_one({"user_id": rec.get("owner_id")}, {"_id": 0})
        owner_fid = owner.get("family_id") if owner else None
    if owner_fid and owner_fid != viewer_fid:
        raise HTTPException(status_code=404, detail="File not found")
    # If this file belongs to a Vault item, honour that item's per-item visibility.
    vault_item = await db.vault_items.find_one(
        {"family_id": owner_fid, "files.url": f"/api/files/{path}"}, {"_id": 0})
    if vault_item:
        viewer = await _secure_viewer(u)
        if not _can_view_secure(vault_item, viewer):
            raise HTTPException(status_code=404, detail="File not found")
    try:
        content, ct = await run_in_threadpool(_get_object, path)
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")
    return Response(content=content, media_type=ct,
                    headers={"Cache-Control": "private, max-age=86400"})


# ---------------------------------------------------------------------------
# Push notifications (Emergent managed relay)
# ---------------------------------------------------------------------------
class RegisterPushBody(BaseModel):
    user_id: str
    platform: str          # "android" | "ios"
    device_token: str


@api.post("/register-push", status_code=201)
async def register_push(body: RegisterPushBody, user: dict = Depends(get_current_user)):
    # Bind the device registration to the authenticated caller (ignore any
    # client-supplied user_id) so nobody can attach a device to another account.
    payload = {"user_id": user["user_id"], "platform": body.platform, "device_token": body.device_token}
    resp = await _push_client.post("/api/v1/push/users/register", json=payload)
    if resp.status_code == 401:
        raise HTTPException(500, "EMERGENT_PUSH_KEY missing or invalid")
    if resp.status_code >= 500:
        raise HTTPException(502, "Push provider unavailable")
    resp.raise_for_status()
    return {"status": "registered"}


async def send_push(recipients: list, data: dict, idempotency_key: Optional[str] = None) -> None:
    """Relay a push to Emergent's managed service. recipients = list of user_ids."""
    if not recipients:
        return
    if "title" not in data or "message" not in data:
        raise ValueError("data must include title and message")
    for i in range(0, len(recipients), 100):
        chunk = recipients[i:i + 100]
        payload: dict = {"recipients": chunk, "data": data}
        if idempotency_key:
            payload["$idempotency_key"] = f"{idempotency_key}:{i}"
        resp = await _push_client.post("/api/v1/push/trigger", json=payload)
        resp.raise_for_status()


async def _member_user_ids(fid: str, member_ids: list, exclude_user: Optional[str] = None) -> list:
    """Resolve family member_ids -> linked user_ids (only members with accounts)."""
    out = []
    for mid in member_ids:
        m = await db.members.find_one({"member_id": mid}, {"_id": 0})
        if m and m.get("linked_user_id") and m["linked_user_id"] != exclude_user:
            out.append(m["linked_user_id"])
    return out


async def run_morning_reminders():
    """Send an 'On This Day' push once per day to families that have a memory today."""
    today = date.today()
    mmdd = f"-{today.month:02d}-{today.day:02d}"
    families = await db.families.find({}, {"_id": 0}).to_list(5000)
    for fam in families:
        fid = fam["family_id"]
        members = await db.members.find({"family_id": fid}, {"_id": 0}).to_list(200)
        recipients = [m["linked_user_id"] for m in members if m.get("linked_user_id")]

        # On This Day memory
        otd_key = f"otd:{fid}:{today.isoformat()}"
        if not await db.push_log.find_one({"key": otd_key}):
            events = await db.timeline.find(
                {"family_id": fid, "date": {"$regex": f"{mmdd}$"}}, {"_id": 0}).sort("date", -1).to_list(20)
            if events:
                top = events[0]
                try:
                    yrs = today.year - int(top["date"][:4])
                except ValueError:
                    yrs = 0
                when = f"{yrs} year{'s' if yrs != 1 else ''} ago today" if yrs > 0 else "today"
                extra = f" (+{len(events) - 1} more)" if len(events) > 1 else ""
                message = f"{when}: {top['title']}{extra}. Tap to relive this memory."
                try:
                    await send_push(recipients, {"title": "On This Day ✨", "message": message,
                                                 "action_url": f"/timeline/{top['timeline_id']}"},
                                    idempotency_key=otd_key)
                except Exception as e:
                    logger.warning(f"morning reminder push failed for {fid} (non-blocking): {e}")
                await db.push_log.insert_one({"key": otd_key, "created_at": now_iso()})

        # Time capsules unlocking today
        caps = await db.capsules.find(
            {"family_id": fid, "unlock_date": today.isoformat()}, {"_id": 0}).to_list(100)
        for cap in caps:
            cap_key = f"cap:{cap['capsule_id']}"
            if await db.push_log.find_one({"key": cap_key}):
                continue
            author = await db.members.find_one({"member_id": cap["author_member_id"]}, {"_id": 0})
            try:
                await send_push(recipients, {
                    "title": "A time capsule just unlocked ⏳",
                    "message": f"{(author or {}).get('name', 'Someone')} left the family a message. Tap to open it.",
                    "action_url": f"/capsule/{cap['capsule_id']}",
                }, idempotency_key=cap_key)
            except Exception as e:
                logger.warning(f"capsule push failed for {fid} (non-blocking): {e}")
            await db.push_log.insert_one({"key": cap_key, "created_at": now_iso()})

        # Vault items expiring within 30 days -> remind parents/admins once per item per day
        soon_iso = (today + timedelta(days=30)).isoformat()
        vitems = await db.vault_items.find(
            {"family_id": fid, "expiry_date": {"$ne": None, "$gte": today.isoformat(), "$lte": soon_iso}},
            {"_id": 0}).to_list(200)
        parents = [m for m in members if m.get("role") in ("admin", "parent") and m.get("linked_user_id")]
        parent_ids = [m["linked_user_id"] for m in parents]
        for vi in vitems:
            days_left = (date.fromisoformat(vi["expiry_date"][:10]) - today).days
            vkey = f"vaultexp:{vi['item_id']}:{today.isoformat()}"
            if await db.push_log.find_one({"key": vkey}) or not parent_ids:
                continue
            try:
                await send_push(parent_ids, {
                    "title": "Document expiring soon 🔐",
                    "message": f"{vi['title']} expires in {days_left} day{'s' if days_left != 1 else ''}.",
                    "action_url": "/vault",
                }, idempotency_key=vkey)
            except Exception as e:
                logger.warning(f"vault expiry push failed for {fid} (non-blocking): {e}")
            await db.push_log.insert_one({"key": vkey, "created_at": now_iso()})

        # Noticeboard notes expiring tomorrow -> nudge the whole family once per note
        tomorrow = (today + timedelta(days=1)).isoformat()
        exp_notices = await db.notices.find(
            {"family_id": fid, "expiry_date": tomorrow}, {"_id": 0}).to_list(50)
        for ntc in exp_notices:
            nkey = f"noticeexp:{ntc['notice_id']}:{today.isoformat()}"
            if await db.push_log.find_one({"key": nkey}) or not recipients:
                continue
            try:
                await send_push(recipients, {
                    "title": "📌 Noticeboard reminder",
                    "message": f"\"{ntc['title']}\" is due tomorrow.",
                    "action_url": "/notice",
                }, idempotency_key=nkey)
            except Exception as e:
                logger.warning(f"notice expiry push failed for {fid} (non-blocking): {e}")
            await db.push_log.insert_one({"key": nkey, "created_at": now_iso()})


async def morning_reminder_loop():
    while True:
        now = datetime.now(timezone.utc)
        target = now.replace(hour=8, minute=0, second=0, microsecond=0)
        if target <= now:
            target += timedelta(days=1)
        await asyncio.sleep(max(60, (target - now).total_seconds()))
        try:
            await run_morning_reminders()
        except Exception:
            logger.exception("morning reminders loop error")


@api.post("/push/test-reminder")
async def push_test_reminder(user: dict = Depends(get_current_user)):
    """Manually trigger the On This Day push for the caller's family (for testing)."""
    fid = require_family(user)
    today = date.today()
    mmdd = f"-{today.month:02d}-{today.day:02d}"
    events = await db.timeline.find(
        {"family_id": fid, "date": {"$regex": f"{mmdd}$"}}, {"_id": 0}).sort("date", -1).to_list(20)
    if not events:
        return {"sent": 0, "detail": "No memory for today"}
    top = events[0]
    members = await db.members.find({"family_id": fid}, {"_id": 0}).to_list(200)
    recipients = [m["linked_user_id"] for m in members if m.get("linked_user_id")]
    ok = True
    try:
        await send_push(recipients, {"title": "On This Day ✨",
                                     "message": f"Remember: {top['title']}. Tap to relive it.",
                                     "action_url": f"/timeline/{top['timeline_id']}"})
    except Exception as e:
        ok = False
        logger.warning(f"test reminder push failed (expected in preview): {e}")
    return {"recipients": len(recipients), "push_ok": ok}



# ---------------------------------------------------------------------------
# Demo seed
# ---------------------------------------------------------------------------
UN = "https://images.unsplash.com/"
IMG = {
    "cover": UN + "photo-1511895426328-dc8714191300?w=1200&q=80",
    "dad": UN + "photo-1633332755192-727a05c4013d?w=400&q=80",
    "mom": UN + "photo-1544005313-94ddf0286df2?w=400&q=80",
    "son": UN + "photo-1503454537195-1dcabb73ffb9?w=400&q=80",
    "daughter": UN + "photo-1595152772835-219674b2a8a6?w=400&q=80",
    "grandma": UN + "photo-1544717297-fa95b6ee9643?w=400&q=80",
    "post1": UN + "photo-1601288496920-b6154fe3626a?w=1000&q=80",
    "post2": UN + "photo-1476234251651-f353703a034d?w=1000&q=80",
    "post3": UN + "photo-1526976668912-1a811878dd37?w=1000&q=80",
    "post4": UN + "photo-1602343168117-bb8ffe3e2e9f?w=1000&q=80",
    "post5": UN + "photo-1490730141103-6cac27aaab94?w=1000&q=80",
    "story1": UN + "photo-1533738363-b7f9aef128ce?w=800&q=80",
    "story2": UN + "photo-1518791841217-8f162f1e1131?w=800&q=80",
}


@api.post("/seed/demo")
async def seed_demo(user: dict = Depends(get_current_user)):
    if user.get("family_id"):
        raise HTTPException(status_code=400, detail="You already belong to a family")

    today = date.today()
    fid = new_id("fam_")
    fam = {
        "family_id": fid, "name": "The Sharma Family", "cover_photo": IMG["cover"],
        "created_by": user["user_id"], "invite_code": uuid.uuid4().hex[:8].upper(),
        "created_at": now_iso(),
    }
    await db.families.insert_one(fam)

    def bday_near(days_ahead, base_year):
        d = today + timedelta(days=days_ahead)
        return date(base_year, d.month, d.day).isoformat()

    members_def = [
        ("Raj", "Dad", "admin", "#FF6B6B", "1985-03-15", IMG["dad"], False, "Butter Chicken", "Blue", "Cricket, Cooking", True),
        ("Priya", "Mom", "parent", "#D98E5A", "1988-07-22", IMG["mom"], False, "Pasta", "Coral", "Yoga, Reading", False),
        ("Aarav", "Son", "child", "#A3B18A", bday_near(4, 2016), IMG["son"], True, "Pizza", "Green", "Football, Science", False),
        ("Anaya", "Daughter", "child", "#FFD166", "2019-11-03", IMG["daughter"], True, "Ice Cream", "Yellow", "Swimming, Drawing", False),
        ("Meera", "Grandma", "adult", "#8AB07D", "1956-06-04", IMG["grandma"], False, "Rajma Rice", "Sage", "Gardening, Stories", False),
    ]
    mem_ids = {}
    STATUS_SEED = {
        "Raj": ("work", "💼", "At work"),
        "Priya": ("home", "🏡", "At home"),
        "Aarav": ("school", "🏫", "At school"),
        "Anaya": ("home", "🏡", "At home"),
        "Meera": ("available", "🌿", "Available"),
    }
    for name, rel, role, color, bday, photo, is_child, food, fav_color, hobbies, is_me in members_def:
        mid = new_id("mem_")
        mem_ids[name] = mid
        _st = STATUS_SEED.get(name)
        await db.members.insert_one({
            "member_id": mid, "family_id": fid, "name": name, "relationship": rel, "role": role,
            "color": color, "birthday": bday, "photo_url": photo, "is_child": is_child,
            "linked_user_id": user["user_id"] if is_me else None, "favorite_food": food,
            "favorite_color": fav_color, "hobbies": hobbies,
            "status": _st[0] if _st else None, "status_emoji": _st[1] if _st else None,
            "status_label": _st[2] if _st else None, "status_note": None,
            "status_updated_at": now_iso() if _st else None, "created_at": now_iso(),
        })
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"family_id": fid}})

    # family noticeboard
    await db.notices.insert_many([
        {"notice_id": new_id("ntc_"), "family_id": fid, "title": "🏫 School closed this Friday",
         "note": "Parent-teacher meeting — no classes for the kids on Friday.",
         "expiry_date": (today + timedelta(days=5)).isoformat(), "priority": "high", "pinned": True,
         "owner_member_id": mem_ids["Priya"], "created_at": now_iso()},
        {"notice_id": new_id("ntc_"), "family_id": fid, "title": "🔧 Plumber visit Saturday 10am",
         "note": "Please keep the bathroom free in the morning.",
         "expiry_date": (today + timedelta(days=8)).isoformat(), "priority": "normal", "pinned": False,
         "owner_member_id": mem_ids["Raj"], "created_at": now_iso()},
    ])
    posts = [
        ("Aarav", IMG["post1"], "Aarav won the school science competition today! 🏆 So proud of our little scientist.", "Delhi Public School", "🏆 Achievement", 6),
        ("Priya", IMG["post2"], "Sunday family lunch — nothing beats being all together ❤️", "Home", "🍽️ Everyday", 20),
        ("Anaya", IMG["post3"], "Anaya's first swimming medal! 🏅 She was so brave in the water.", "City Aquatics", "🏅 Sports", 30),
        ("Raj", IMG["post4"], "Throwback to our Goa trip — already planning the next one ✈️", "Goa", "✈️ Vacation", 60),
        ("Meera", IMG["post5"], "The garden is finally blooming. Come see it before the rains! 🌸", "Home Garden", "📸 Everyday", 90),
    ]
    reaction_types = ["love", "adore", "hug", "proud", "celebrate", "laugh", "kiss"]
    all_mem = list(mem_ids.values())
    for author, img, cap, loc, cat, days_ago in posts:
        pid = new_id("post_")
        created = (datetime.now(timezone.utc) - timedelta(days=days_ago, hours=2)).isoformat()
        await db.posts.insert_one({
            "post_id": pid, "family_id": fid, "author_member_id": mem_ids[author],
            "caption": cap, "media": [{"url": img, "type": "image"}], "location": loc,
            "category": cat, "created_at": created,
        })
        # reactions from a few members
        for i, mid in enumerate(all_mem[:4]):
            if mid == mem_ids[author]:
                continue
            await db.reactions.insert_one({
                "post_id": pid, "family_id": fid, "member_id": mid,
                "type": reaction_types[i % len(reaction_types)], "created_at": created,
            })
        # a comment
        await db.comments.insert_one({
            "comment_id": new_id("cmt_"), "post_id": pid, "family_id": fid,
            "member_id": mem_ids["Meera" if author != "Meera" else "Raj"],
            "text": "So wonderful! ❤️", "created_at": created,
        })

    # stories (active)
    for author, img, cap in [("Aarav", IMG["story1"], "Football practice 💪"), ("Priya", IMG["story2"], "Family dinner 🍝")]:
        await db.stories.insert_one({
            "story_id": new_id("story_"), "family_id": fid, "author_member_id": mem_ids[author],
            "media_url": img, "type": "image", "caption": cap,
            "created_at": (datetime.now(timezone.utc) - timedelta(hours=3)).isoformat(),
        })

    # events
    events_def = [
        ("Football Practice", 0, "16:00", "17:30", "Community Ground", "sports", "Aarav", ["Aarav", "Raj"]),
        ("School Science Fair", 1, "09:00", "12:00", "Delhi Public School", "school", "Aarav", ["Aarav", "Priya"]),
        ("Doctor Appointment", 2, "11:00", "11:30", "City Clinic", "health", "Anaya", ["Anaya", "Priya"]),
        ("Grandma's Birthday Dinner", 4, "19:00", "22:00", "Home", "birthday", "Meera", ["Raj", "Priya", "Aarav", "Anaya", "Meera"]),
        ("Swimming Class", 3, "17:00", "18:00", "City Aquatics", "sports", "Anaya", ["Anaya"]),
        ("Family Movie Night", 5, "20:00", "22:00", "Home", "family", "Raj", ["Raj", "Priya", "Aarav", "Anaya"]),
    ]
    colors = {m[0]: m[3] for m in members_def}
    for title, days_ahead, st, et, loc, cat, owner, parts in events_def:
        d = (today + timedelta(days=days_ahead)).isoformat()
        await db.events.insert_one({
            "event_id": new_id("evt_"), "family_id": fid, "title": title, "date": d, "end_date": None,
            "start_time": st, "end_time": et, "all_day": False, "location": loc, "notes": None,
            "category": cat, "owner_member_id": mem_ids[owner], "participant_ids": [mem_ids[p] for p in parts],
            "color": colors[owner], "created_at": now_iso(),
        })

    # chores
    chores_def = [
        ("Make Bed", "Aarav", 1, True), ("Feed Bruno", "Aarav", 1, True),
        ("Homework", "Aarav", 2, False), ("Put Clothes Away", "Aarav", 1, False),
        ("Water the Plants", "Anaya", 1, True), ("Tidy Toys", "Anaya", 1, False),
    ]
    for title, owner, stars, done in chores_def:
        cid = new_id("chore_")
        await db.chores.insert_one({
            "chore_id": cid, "family_id": fid, "title": title, "owner_member_id": mem_ids[owner],
            "schedule": "daily", "stars": stars, "instructions": None, "created_at": now_iso(),
        })
        if done:
            await db.chore_completions.insert_one({
                "completion_id": new_id("cc_"), "chore_id": cid, "family_id": fid,
                "member_id": mem_ids[owner], "stars": stars, "date": today_str(), "created_at": now_iso(),
            })

    # shopping
    grocery = new_id("shl_")
    pharmacy = new_id("shl_")
    await db.shopping_lists.insert_one({"list_id": grocery, "family_id": fid, "name": "Grocery", "category": "Grocery", "created_at": now_iso()})
    await db.shopping_lists.insert_one({"list_id": pharmacy, "family_id": fid, "name": "Pharmacy", "category": "Pharmacy", "created_at": now_iso()})
    grocery_items = [("Milk", "2 L", "Dairy", False), ("Eggs", "12", "Dairy", False), ("Bread", "1 loaf", "Bakery", True),
                     ("Apples", "1 kg", "Produce", False), ("Rice", "5 kg", "Pantry", True), ("Chicken", "1 kg", "Meat", False)]
    for name, qty, cat, checked in grocery_items:
        await db.shopping_items.insert_one({
            "item_id": new_id("shi_"), "list_id": grocery, "family_id": fid, "name": name, "quantity": qty,
            "category": cat, "notes": None, "checked": checked, "added_by": "Priya", "created_at": now_iso(),
        })
    for name in ["Vitamin C", "Band-aids"]:
        await db.shopping_items.insert_one({
            "item_id": new_id("shi_"), "list_id": pharmacy, "family_id": fid, "name": name, "quantity": "1",
            "category": None, "notes": None, "checked": False, "added_by": "Raj", "created_at": now_iso(),
        })

    # todos
    tasks = new_id("tdl_")
    packing = new_id("tdl_")
    await db.todo_lists.insert_one({"list_id": tasks, "family_id": fid, "name": "Family Tasks", "created_at": now_iso()})
    await db.todo_lists.insert_one({"list_id": packing, "family_id": fid, "name": "Vacation Packing", "created_at": now_iso()})
    task_items = [("Book dentist for Anaya", "Priya", "high", False, -2), ("Fix the garden gate", "Raj", "normal", False, 3),
                  ("Renew car insurance", "Raj", "high", True, None), ("Plan Grandma's party", "Priya", "high", False, 0)]
    for title, who, prio, done, off in task_items:
        due = (date.today() + timedelta(days=off)).isoformat() if off is not None else None
        await db.todo_items.insert_one({
            "item_id": new_id("tdi_"), "list_id": tasks, "family_id": fid, "title": title,
            "assignee_member_id": mem_ids[who], "due_date": due, "priority": prio, "done": done, "created_at": now_iso(),
        })
    for title, off in [("Sunscreen", 6), ("Swimsuits", 6), ("Chargers", None), ("First-aid kit", None)]:
        due = (date.today() + timedelta(days=off)).isoformat() if off is not None else None
        await db.todo_items.insert_one({
            "item_id": new_id("tdi_"), "list_id": packing, "family_id": fid, "title": title,
            "assignee_member_id": None, "due_date": due, "priority": "normal", "done": False, "created_at": now_iso(),
        })

    # affection to Raj (me)
    aff_def = [
        ("Priya", "hug", "Have a great day at work ❤️", 0),
        ("Aarav", "kiss", "Bye Papa!", 1),
        ("Meera", "love", "Thinking of you all today", 2),
        ("Anaya", "proud", "You're the best Papa!", 1),
    ]
    for frm, typ, msg, days_ago in aff_def:
        await db.affections.insert_one({
            "affection_id": new_id("aff_"), "family_id": fid, "from_member_id": mem_ids[frm],
            "to_member_id": mem_ids["Raj"], "type": typ, "message": msg, "is_family": False,
            "seen": days_ago > 0, "created_at": (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat(),
        })
    # some between others for the love timeline
    extra_aff = [("Priya", "Aarav", "hug"), ("Priya", "Aarav", "hug"), ("Raj", "Aarav", "proud"),
                 ("Aarav", "Priya", "kiss"), ("Meera", "Anaya", "love"), ("Anaya", "Meera", "hug")]
    for frm, to, typ in extra_aff:
        await db.affections.insert_one({
            "affection_id": new_id("aff_"), "family_id": fid, "from_member_id": mem_ids[frm],
            "to_member_id": mem_ids[to], "type": typ, "message": None, "is_family": False,
            "seen": True, "created_at": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),
        })

    # ---- family timeline / Our Family Story ----
    otd_date = date(2019, today.month, today.day).isoformat()
    timeline_def = [
        ("👶 Aarav Was Born", "2016-08-12", "👶 Births", "Delhi", "Our little scientist arrived and changed our world forever.", ["Raj", "Priya", "Aarav"], True, None),
        ("👶 Anaya Was Born", "2019-11-03", "👶 Births", "Delhi", "Our girl joined the family ❤️", ["Raj", "Priya", "Anaya"], True, None),
        ("🏠 We Moved Into Our New Home", "2020-01-10", "🏠 New Homes", "Gurgaon", "First photograph outside the new house.", ["Raj", "Priya", "Aarav", "Anaya"], True, None),
        ("✈️ First Family Trip Abroad", "2022-06-15", "✈️ Vacations", "Dubai", "Five magical days together.", ["Raj", "Priya", "Aarav", "Anaya", "Meera"], False, IMG["post4"]),
        ("🏅 Aarav's First Football Trophy", "2024-03-21", "🏅 Sports", "Community Ground", "So proud of you ❤️", ["Aarav", "Raj"], False, None),
        ("🎂 Grandma's 70th Birthday", "2025-06-04", "🎂 Birthdays", "Home", "A wonderful family celebration.", ["Meera", "Raj", "Priya", "Aarav", "Anaya"], True, IMG["post5"]),
        ("🏆 Aarav Won School Science Competition", (today - timedelta(days=2)).isoformat(), "🏆 Achievements", "Delhi Public School", "First place in the science fair!", ["Aarav", "Priya", "Raj"], True, IMG["post1"]),
        ("✈️ Family Trip to Kerala", otd_date, "✈️ Vacations", "Kerala", "Backwaters, boats and so much fun.", ["Raj", "Priya", "Aarav", "Anaya"], False, IMG["post2"]),
    ]
    for title, d, cat, loc, desc, ppl, imp, img in timeline_def:
        await db.timeline.insert_one({
            "timeline_id": new_id("tl_"), "family_id": fid, "title": title, "date": d,
            "category": cat, "location": loc, "description": desc,
            "people": [mem_ids[p] for p in ppl], "media": [{"url": img, "type": "image"}] if img else [],
            "importance": imp, "created_by": mem_ids["Raj"], "created_at": now_iso(),
        })

    # ---- time capsules ----
    await db.capsules.insert_one({
        "capsule_id": new_id("cap_"), "family_id": fid, "author_member_id": mem_ids["Priya"],
        "message": "To my darling family — by the time this opens I hope Aarav has aced his exams and we've had our beach holiday. Never forget how much I love you all. ❤️",
        "media": [], "unlock_date": (today + timedelta(days=120)).isoformat(), "created_at": now_iso(),
    })
    await db.capsules.insert_one({
        "capsule_id": new_id("cap_"), "family_id": fid, "author_member_id": mem_ids["Raj"],
        "message": "A note from last month: I'm so proud of every single one of you. Here's to many more adventures together! 🥂",
        "media": [{"url": IMG["post4"], "type": "image"}],
        "unlock_date": (today - timedelta(days=30)).isoformat(), "created_at": now_iso(),
    })

    # ---- family album ----
    await db.albums.insert_one({
        "album_id": new_id("alb_"), "family_id": fid, "title": "Goa Getaway ✈️",
        "description": "Our sunny escape to the beaches of Goa.", "created_by": mem_ids["Raj"],
        "cover": IMG["post4"],
        "photos": [
            {"photo_id": new_id("ph_"), "url": IMG["post4"], "type": "image", "added_by": mem_ids["Raj"], "created_at": now_iso()},
            {"photo_id": new_id("ph_"), "url": IMG["post2"], "type": "image", "added_by": mem_ids["Raj"], "created_at": now_iso()},
            {"photo_id": new_id("ph_"), "url": IMG["post1"], "type": "image", "added_by": mem_ids["Raj"], "created_at": now_iso()},
        ],
        "created_at": now_iso(),
    })



    # ---- recipes & weekly meal plan ----
    monday = today - timedelta(days=today.weekday())  # Monday of the current week
    recipe_defs = [
        ("Rajma Chawal 🍛", "Comforting kidney-bean curry with fluffy steamed rice.", 40,
         [("Kidney beans", "2 cups"), ("Onion", "2"), ("Tomato", "3"),
          ("Basmati rice", "3 cups"), ("Ginger-garlic paste", "1 tbsp"), ("Garam masala", "1 tsp")]),
        ("Masala Dosa 🥞", "Crispy dosa with a spiced potato filling.", 30,
         [("Dosa batter", "4 cups"), ("Potato", "4"), ("Onion", "1"),
          ("Mustard seeds", "1 tsp"), ("Curry leaves", "a few")]),
        ("Paneer Butter Masala 🧈", "Creamy tomato-and-butter paneer curry.", 35,
         [("Paneer", "400 g"), ("Tomato", "4"), ("Butter", "50 g"),
          ("Fresh cream", "1/2 cup"), ("Cashews", "10")]),
        ("Veg Pulao 🍚", "Fragrant one-pot rice with mixed vegetables.", 25,
         [("Basmati rice", "2 cups"), ("Mixed vegetables", "2 cups"),
          ("Whole spices", "1 tbsp"), ("Ghee", "2 tbsp")]),
    ]
    rcp_ids = {}
    for title, desc, prep, ings in recipe_defs:
        rid = new_id("rcp_")
        rcp_ids[title] = rid
        await db.recipes.insert_one({
            "recipe_id": rid, "family_id": fid, "title": title, "description": desc,
            "photo_url": None, "ingredients": [{"name": n, "quantity": q} for n, q in ings],
            "prep_minutes": prep, "created_by": mem_ids["Priya"], "created_at": now_iso(),
        })
    plan_defs = [(0, "dinner", "Rajma Chawal 🍛"), (1, "breakfast", "Masala Dosa 🥞"),
                 (2, "dinner", "Paneer Butter Masala 🧈"), (4, "dinner", "Veg Pulao 🍚")]
    for day, slot, title in plan_defs:
        await db.meal_plans.insert_one({
            "plan_id": new_id("mp_"), "family_id": fid, "week_start": monday.isoformat(),
            "day": day, "slot": slot, "recipe_id": rcp_ids[title], "created_at": now_iso(),
        })

    # ---- wish lists ----
    wish_defs = [
        # owner, is_family, name, price, priority, occasion, category, size, color, url, visibility
        ("Aarav", False, "LEGO Space Explorer Set", "₹4,999", 3, "Birthday", "Toys", None, None, "https://lego.com", "family"),
        ("Aarav", False, "New Football Shoes", "₹3,200", 2, "General", "Sports", "UK 6", "Blue", None, "family"),
        ("Aarav", False, "Harry Potter Book Set", "₹2,499", 2, "General", "Books", None, None, None, "family"),
        ("Aarav", False, "Visit Disneyland", None, 3, "Holiday", "Experience", None, None, None, "family"),
        ("Anaya", False, "Watercolour Paint Kit", "₹1,299", 2, "Birthday", "Activities", None, None, None, "family"),
        ("Anaya", False, "Cozy Winter Jacket", "₹2,100", 1, "General", "Clothes", "M", "Pink", None, "family"),
        ("Priya", False, "Noise-cancelling Headphones", "₹8,999", 2, "General", "Gadgets", None, "Black", None, "parents"),
        (None, True, "New Family Television", "₹65,000", 3, "General", "Gadgets", '55"', None, None, "family"),
        (None, True, "Summer Vacation to Goa", None, 3, "Holiday", "Trips", None, None, None, "family"),
        (None, True, "Family Dining Table", "₹22,000", 2, "General", "General", None, None, None, "family"),
    ]
    for owner, is_fam, name, price, prio, occ, cat, size, color, url, vis in wish_defs:
        await db.wish_items.insert_one({
            "wish_id": new_id("wish_"), "family_id": fid,
            "owner_member_id": None if is_fam else mem_ids[owner], "is_family": is_fam,
            "name": name, "photo_url": None, "product_url": url, "price": price,
            "store": None, "size": size, "color": color, "notes": None,
            "priority": prio, "occasion": occ, "category": cat,
            "visibility": vis, "visible_member_ids": [],
            "status": "wished", "reserved_by_member_id": None, "reveal_buyer": False,
            "created_by": mem_ids[owner] if owner else mem_ids["Raj"], "created_at": now_iso(),
        })
    # Grandma has quietly reserved Aarav's LEGO set (Secret Gift Mode demo)
    lego = await db.wish_items.find_one({"family_id": fid, "name": "LEGO Space Explorer Set"}, {"_id": 0})
    if lego:
        await db.wish_items.update_one({"wish_id": lego["wish_id"]}, {"$set": {
            "reserved_by_member_id": mem_ids["Meera"], "status": "reserved", "reveal_buyer": False}})
        await db.wish_notes.insert_one({
            "note_id": new_id("wn_"), "wish_id": lego["wish_id"], "family_id": fid,
            "member_id": mem_ids["Meera"], "text": "I'll pick this up this weekend — let's not tell Aarav! 🤫",
            "created_at": now_iso()})

    # ---- family vault ----
    vf = {}
    for fname, ficon in [("Insurance", "shield-checkmark"), ("Documents", "document-text"),
                         ("Home", "home"), ("Vehicles", "car"), ("Travel", "airplane")]:
        vfid = new_id("vf_")
        vf[fname] = vfid
        await db.vault_folders.insert_one({"folder_id": vfid, "family_id": fid, "name": fname,
                                           "icon": ficon, "created_at": now_iso()})
    exp30 = (today + timedelta(days=30)).isoformat()
    exp15 = (today + timedelta(days=15)).isoformat()
    exp180 = (today + timedelta(days=182)).isoformat()
    vault_items = [
        {"kind": "insurance", "title": "Family Health Insurance", "folder_id": vf["Insurance"],
         "provider": "Star Health", "policy_number": "SH-99823471", "policy_holder": "Raj Sharma",
         "coverage_amount": "₹10,00,000", "premium": "₹24,000 / year", "agent_contact": "Amit · +91 98200 11223",
         "claims_number": "1800-425-2255", "emergency_number": "1800-102-4477", "website": "https://starhealth.in",
         "expiry_date": exp30, "issue_date": (today - timedelta(days=335)).isoformat(),
         "covered_member_ids": [mem_ids["Raj"], mem_ids["Priya"], mem_ids["Aarav"], mem_ids["Anaya"]],
         "visibility": "parents", "notes": "Cashless at all network hospitals."},
        {"kind": "insurance", "title": "Car Insurance — Honda City", "folder_id": vf["Vehicles"],
         "provider": "ICICI Lombard", "policy_number": "IL-CAR-556677", "policy_holder": "Raj Sharma",
         "coverage_amount": "₹6,50,000", "premium": "₹11,500 / year", "claims_number": "1800-2666",
         "expiry_date": exp15, "visibility": "parents"},
        {"kind": "document", "title": "Aarav's Passport", "folder_id": vf["Documents"],
         "owner_member_id": mem_ids["Aarav"], "expiry_date": exp180, "visibility": "parents",
         "notes": "Passport No. K1234567. Renew before travelling."},
        {"kind": "document", "title": "Home Rent Agreement", "folder_id": vf["Home"],
         "visibility": "parents", "notes": "11-month agreement, renews in March."},
    ]
    for vi in vault_items:
        base = {"item_id": new_id("vi_"), "family_id": fid, "folder_id": None, "owner_member_id": None,
                "notes": None, "tags": [], "issue_date": None, "expiry_date": None, "files": [],
                "visibility": "family", "visible_member_ids": [], "provider": None, "policy_number": None,
                "policy_holder": None, "coverage_amount": None, "premium": None, "agent_contact": None,
                "claims_number": None, "emergency_number": None, "website": None, "covered_member_ids": [],
                "created_by": mem_ids["Raj"], "created_at": now_iso()}
        base.update(vi)
        await db.vault_items.insert_one(base)

    # ---- emergency center ----
    ec_defs = [
        ("Raj (Dad)", "Father", "+91 98100 22334", True, "👨", mem_ids["Raj"]),
        ("Priya (Mom)", "Mother", "+91 98100 55667", True, "👩", mem_ids["Priya"]),
        ("Grandma Meera", "Grandmother", "+91 98100 88990", False, "👵", mem_ids["Meera"]),
        ("Dr. Sharma", "Family Doctor", "+91 98111 44556", True, "👨‍⚕️", None),
        ("City Care Hospital", "Hospital", "+91 11 4567 8900", True, "🏥", None),
        ("Ambulance", "Emergency Service", "108", True, "🚑", None),
        ("Police", "Emergency Service", "100", True, "👮", None),
        ("Fire Department", "Emergency Service", "101", True, "🚒", None),
        ("Building Security", "Security", "+91 11 2233 4455", False, "🛡️", None),
        ("Star Health Assist", "Insurance", "1800-425-2255", False, "🩺", None),
    ]
    for name, rel, phone, crit, icon, mid in ec_defs:
        await db.emergency_contacts.insert_one({
            "contact_id": new_id("ec_"), "family_id": fid, "name": name, "relationship": rel,
            "phone": phone, "alt_phone": None, "whatsapp": None, "email": None, "address": None,
            "notes": None, "icon": icon, "critical": crit, "member_id": mid,
            "created_by": mem_ids["Raj"], "created_at": now_iso()})

    ei_defs = [
        ("Fire 🔥", "🔥", ["Leave the house immediately — do not stop for belongings.",
                          "Do NOT use the elevator, take the stairs.",
                          "Meet at the front gate (our family meeting point).",
                          "Call the Fire Department (101).", "Call Mom or Dad."]),
        ("Medical Emergency 🚑", "🚑", ["Call an ambulance (108).", "Contact our family doctor.",
                                       "Open the person's Medical Card for allergies & blood group.",
                                       "Notify Mom and Dad."]),
        ("Child Lost / Separated 🧒", "🧒", ["Stay calm and stay where you are if you're the child.",
                                            "Find a staff member or a police officer.",
                                            "Call Mom or Dad from any phone.",
                                            "Our meeting point is the main entrance."]),
    ]
    for title, icon, steps in ei_defs:
        await db.emergency_instructions.insert_one({
            "instruction_id": new_id("ei_"), "family_id": fid, "title": title, "icon": icon,
            "steps": steps, "contact_ids": [], "created_at": now_iso()})

    await db.family_plans.update_one({"family_id": fid}, {"$set": {
        "family_id": fid, "home_address": "42 Rose Villa, Green Park, New Delhi 110016",
        "meeting_point": "Front gate of the building", "alt_meeting_point": "Green Park Metro Station",
        "parent_numbers": "Raj +91 98100 22334 · Priya +91 98100 55667",
        "neighbour": "Mrs. Kapoor (Flat 3B) +91 98100 77889",
        "school_contact": "DPS Green Park +91 11 2696 0000", "doctor": "Dr. Sharma +91 98111 44556",
        "hospital": "City Care Hospital +91 11 4567 8900", "insurance_number": "Star Health 1800-425-2255",
        "building_security": "+91 11 2233 4455", "notes": "Keep this plan updated every 6 months.",
        "last_reviewed": now_iso()}}, upsert=True)

    await db.medical_cards.insert_one({
        "member_id": mem_ids["Aarav"], "family_id": fid, "blood_group": "O+",
        "allergies": "Peanuts", "medication": "None", "conditions": "Mild asthma",
        "doctor": "Dr. Sharma +91 98111 44556", "hospital": "City Care Hospital",
        "insurance_provider": "Star Health", "policy_reference": "SH-99823471",
        "emergency_contact": "Mom +91 98100 55667", "updated_at": now_iso()})
    await db.medical_cards.insert_one({
        "member_id": mem_ids["Raj"], "family_id": fid, "blood_group": "B+",
        "allergies": "None", "medication": "None", "conditions": "None",
        "doctor": "Dr. Sharma +91 98111 44556", "hospital": "City Care Hospital",
        "insurance_provider": "Star Health", "policy_reference": "SH-99823471",
        "emergency_contact": "Priya +91 98100 55667", "updated_at": now_iso()})




    all_ids = list(mem_ids.values())
    fam_chat_id = new_id("chat_")
    await db.chats.insert_one({
        "chat_id": fam_chat_id, "family_id": fid, "type": "family", "name": None,
        "member_ids": all_ids, "created_by": mem_ids["Raj"], "last_message": None,
        "created_at": now_iso(),
    })
    fam_msgs = [
        ("Priya", "Who's picking up Aarav from football today? 🏈", 180),
        ("Raj", "I've got it 👍", 175),
        ("Meera", "Dinner will be ready by 8 ❤️", 90),
        ("Anaya", "Yaaay rajma rice! 🍚", 60),
    ]
    last = None
    for frm, txt, mins in fam_msgs:
        created = (datetime.now(timezone.utc) - timedelta(minutes=mins)).isoformat()
        await db.messages.insert_one({
            "message_id": new_id("msg_"), "chat_id": fam_chat_id, "family_id": fid,
            "sender_member_id": mem_ids[frm], "text": txt, "media": [], "type": "text",
            "affection_key": None, "reply_to": None, "reply_preview": None, "created_at": created,
        })
        last = {"text": txt, "sender": frm, "created_at": created, "type": "text"}
    await db.chats.update_one({"chat_id": fam_chat_id}, {"$set": {"last_message": last}})

    # a direct chat Priya <-> Raj
    direct_id = new_id("chat_")
    await db.chats.insert_one({
        "chat_id": direct_id, "family_id": fid, "type": "direct", "name": None,
        "member_ids": sorted([mem_ids["Raj"], mem_ids["Priya"]]), "created_by": mem_ids["Priya"],
        "last_message": None, "created_at": now_iso(),
    })
    direct_msgs = [("Priya", "Can you grab milk on the way home?", 200), ("Raj", "Sure! Anything else?", 195), ("Priya", "Just milk, thank you love ❤️", 190)]
    last = None
    for frm, txt, mins in direct_msgs:
        created = (datetime.now(timezone.utc) - timedelta(minutes=mins)).isoformat()
        await db.messages.insert_one({
            "message_id": new_id("msg_"), "chat_id": direct_id, "family_id": fid,
            "sender_member_id": mem_ids[frm], "text": txt, "media": [], "type": "text",
            "affection_key": None, "reply_to": None, "reply_preview": None, "created_at": created,
        })
        last = {"text": txt, "sender": frm, "created_at": created, "type": "text"}
    await db.chats.update_one({"chat_id": direct_id}, {"$set": {"last_message": last}})

    return {"family": clean(fam), "message": "Demo family created"}


# ---------------------------------------------------------------------------
# Trusted Helpers — a separate, restricted principal (NOT family members)
# ---------------------------------------------------------------------------
HELPER_TOKEN_DAYS = 45

PERMISSION_KEYS = [
    "tasks", "calendar", "child_schedule", "meals", "shopping", "emergency_contacts",
    "medical", "documents", "location", "chat", "home_instructions", "pickup_drop",
]
PERMISSION_LABELS = {
    "tasks": "Assigned tasks", "calendar": "Calendar events", "child_schedule": "Child schedule",
    "meals": "Meal instructions", "shopping": "Shopping", "emergency_contacts": "Emergency contacts",
    "medical": "Medical information", "documents": "Documents", "location": "Location",
    "chat": "Parent chat", "home_instructions": "Home instructions", "pickup_drop": "Pickup / drop details",
}
HELPER_ROLES = [
    {"key": "house_help", "label": "House Help", "icon": "🧹", "perms": ["tasks", "home_instructions", "shopping", "chat", "calendar"]},
    {"key": "nanny", "label": "Nanny / Child Caretaker", "icon": "🍼", "perms": ["tasks", "child_schedule", "meals", "calendar", "emergency_contacts", "chat", "pickup_drop"]},
    {"key": "elder_caretaker", "label": "Elder Caretaker", "icon": "🧓", "perms": ["tasks", "calendar", "meals", "emergency_contacts", "chat"]},
    {"key": "cook", "label": "Cook", "icon": "👨‍🍳", "perms": ["tasks", "meals", "shopping", "home_instructions", "chat"]},
    {"key": "driver", "label": "Driver", "icon": "🚗", "perms": ["tasks", "pickup_drop", "location", "emergency_contacts", "chat"]},
    {"key": "tutor", "label": "Tutor", "icon": "📚", "perms": ["tasks", "child_schedule", "calendar", "chat"]},
    {"key": "pet_caretaker", "label": "Pet Caretaker", "icon": "🐾", "perms": ["tasks", "calendar", "chat"]},
    {"key": "nurse", "label": "Nurse", "icon": "⚕️", "perms": ["tasks", "calendar", "medical", "emergency_contacts", "chat"]},
    {"key": "babysitter", "label": "Babysitter", "icon": "🧸", "perms": ["tasks", "child_schedule", "meals", "emergency_contacts", "chat"], "temporary": True},
    {"key": "temporary", "label": "Temporary Helper", "icon": "⏳", "perms": ["tasks", "chat"], "temporary": True},
    {"key": "custom", "label": "Custom Helper", "icon": "✨", "perms": ["tasks", "chat"]},
]
ROLE_MAP = {r["key"]: r for r in HELPER_ROLES}


class HelperAccessIn(BaseModel):
    mode: str = "permanent"                # permanent | dates | temporary
    start_date: Optional[str] = None       # YYYY-MM-DD
    end_date: Optional[str] = None          # YYYY-MM-DD (inclusive)
    days: List[int] = []                    # 0=Mon..6=Sun; [] = every day
    start_time: Optional[str] = None        # HH:MM working hours (soft)
    end_time: Optional[str] = None


class HelperIn(BaseModel):
    name: str
    role: str = "house_help"
    phone: Optional[str] = None
    email: Optional[str] = None
    photo_url: Optional[str] = None
    address: Optional[str] = None
    id_card_url: Optional[str] = None
    assigned_all: bool = False
    assigned_member_ids: List[str] = []
    permissions: Optional[dict] = None      # {key: bool}; None => role defaults
    access: HelperAccessIn = HelperAccessIn()
    username: Optional[str] = None          # optional: parent sets login directly
    pin: Optional[str] = None


class HelperPatch(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    phone: Optional[str] = None
    photo_url: Optional[str] = None
    address: Optional[str] = None
    id_card_url: Optional[str] = None
    assigned_all: Optional[bool] = None
    assigned_member_ids: Optional[List[str]] = None
    permissions: Optional[dict] = None
    access: Optional[HelperAccessIn] = None


class HelperActivateIn(BaseModel):
    code: str
    username: str
    pin: str


class HelperLoginIn(BaseModel):
    username: str
    pin: str


class HelperTaskIn(BaseModel):
    title: str
    instructions: Optional[str] = None
    for_member_id: Optional[str] = None
    due_time: Optional[str] = None          # HH:MM
    priority: str = "normal"                # low | normal | high
    schedule: str = "once"                  # once | daily | weekly | monthly
    days: List[int] = []                    # weekly: 0=Mon..6=Sun
    date: Optional[str] = None              # once: YYYY-MM-DD (default today)
    checklist: List[str] = []
    photo_url: Optional[str] = None
    require_proof: Optional[str] = None     # none | photo | note | confirm
    category: str = "chore"                 # chore | meal | pickup | care | shopping | other
    pickup_from: Optional[str] = None       # pickup tasks
    pickup_to: Optional[str] = None
    dest_lat: Optional[float] = None        # drop-off point (for ETA alerts)
    dest_lng: Optional[float] = None


class HelperTaskPatch(BaseModel):
    title: Optional[str] = None
    instructions: Optional[str] = None
    for_member_id: Optional[str] = None
    due_time: Optional[str] = None
    priority: Optional[str] = None
    schedule: Optional[str] = None
    days: Optional[List[int]] = None
    date: Optional[str] = None
    checklist: Optional[List[str]] = None
    require_proof: Optional[str] = None
    category: Optional[str] = None
    pickup_from: Optional[str] = None
    pickup_to: Optional[str] = None
    dest_lat: Optional[float] = None
    dest_lng: Optional[float] = None


class HelperTaskCompleteIn(BaseModel):
    note: Optional[str] = None
    photo_url: Optional[str] = None
    checklist_done: List[str] = []


class HelperIssueIn(BaseModel):
    reason: str
    note: Optional[str] = None


class HelperChatIn(BaseModel):
    text: Optional[str] = None
    photo_url: Optional[str] = None


class HelperHandoverIn(BaseModel):
    text: str


class HelperTripIn(BaseModel):
    stage: str                              # en_route | picked_up | reached
    note: Optional[str] = None
    proof_url: Optional[str] = None         # optional arrival photo on "reached"


class HelperTripLocIn(BaseModel):
    lat: float
    lng: float


class CareTeamMsgIn(BaseModel):
    text: Optional[str] = None
    photo_url: Optional[str] = None
    audio_url: Optional[str] = None
    audio_dur: Optional[int] = None


class HelperRatingIn(BaseModel):
    rating: str                             # up | down
    note: Optional[str] = None


def make_helper_token(helper_id: str, family_id: str, tv: int, jti: str) -> str:
    payload = {"account_type": "helper", "helper_id": helper_id, "family_id": family_id,
               "tv": tv, "jti": jti,
               "exp": datetime.now(timezone.utc) + timedelta(days=HELPER_TOKEN_DAYS)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def make_helper_media_token(helper_id: str, family_id: str) -> str:
    """Short-lived, read-only token used ONLY in helper media URLs, so the
    helper's login token never travels in a URL (web <img>, audio playback)."""
    payload = {"account_type": "helper_media", "helper_id": helper_id, "family_id": family_id,
               "scope": "media", "exp": datetime.now(timezone.utc) + timedelta(hours=6)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def _resolve_perms(role: str, overrides: Optional[dict]) -> dict:
    defaults = set(ROLE_MAP.get(role, ROLE_MAP["custom"])["perms"])
    perms = {k: (k in defaults) for k in PERMISSION_KEYS}
    perms["tasks"] = True  # a helper always sees their own assigned tasks
    if overrides:
        for k in PERMISSION_KEYS:
            if k in overrides:
                perms[k] = bool(overrides[k])
    perms["tasks"] = True
    return perms


def _helper_access_ok(h: dict) -> bool:
    """Hard access-window check (date range / temporary expiry). Working hours are
    soft and NOT enforced here — permissions remain the real control."""
    acc = h.get("access") or {}
    mode = acc.get("mode", "permanent")
    today = datetime.now(timezone.utc).date()
    if mode in ("dates", "temporary"):
        sd, ed = acc.get("start_date"), acc.get("end_date")
        try:
            if sd and today < datetime.strptime(sd, "%Y-%m-%d").date():
                return False
            if ed and today > datetime.strptime(ed, "%Y-%m-%d").date():
                return False
        except ValueError:
            return True
    return True


def _within_hours(h: dict) -> bool:
    """Soft working-hours/day check for UI hints (never used to block reads)."""
    acc = h.get("access") or {}
    now = datetime.now(timezone.utc)
    days = acc.get("days") or []
    if days and now.weekday() not in days:
        return False
    st, et = acc.get("start_time"), acc.get("end_time")
    if st and et:
        try:
            cur = now.hour * 60 + now.minute
            sh, sm = [int(x) for x in st.split(":")]
            eh, em = [int(x) for x in et.split(":")]
            if not (sh * 60 + sm <= cur < eh * 60 + em):
                return False
        except ValueError:
            return True
    return True


def _shift_status(h: dict) -> Optional[dict]:
    """Shift info for the helper's own reminder banner (reuses working hours).
    Times are compared in UTC, consistent with _within_hours."""
    acc = h.get("access") or {}
    st, et = acc.get("start_time"), acc.get("end_time")
    if not st:
        return None
    try:
        sh, sm = [int(x) for x in st.split(":")]
    except ValueError:
        return None
    now = datetime.now(timezone.utc)
    days = acc.get("days") or []
    today_ok = (not days) or (now.weekday() in days)
    start_min = sh * 60 + sm
    cur = now.hour * 60 + now.minute
    end_min = None
    if et:
        try:
            eh, em = [int(x) for x in et.split(":")]
            end_min = eh * 60 + em
        except ValueError:
            end_min = None
    on_duty = bool(today_ok and cur >= start_min and (end_min is None or cur < end_min))
    minutes_until = (start_min - cur) if (today_ok and cur < start_min) else None
    return {
        "start_time": st, "end_time": et, "today": today_ok, "on_duty": on_duty,
        "minutes_until": minutes_until,
        "reminder": bool(minutes_until is not None and 0 <= minutes_until <= 60),
    }


async def get_current_helper(authorization: Optional[str] = Header(None),
                             token: Optional[str] = Query(None)):
    raw = None
    if authorization and authorization.lower().startswith("bearer "):
        raw = authorization.split(" ", 1)[1].strip()
    elif token:
        raw = token
    if not raw:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(raw, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if payload.get("account_type") != "helper":
        raise HTTPException(status_code=401, detail="Invalid token")
    h = await db.helpers.find_one(
        {"helper_id": payload.get("helper_id"), "family_id": payload.get("family_id")}, {"_id": 0})
    if not h or h.get("status") != "active":
        raise HTTPException(status_code=401, detail="Helper access unavailable")
    if payload.get("tv") != h.get("token_version", 0):
        raise HTTPException(status_code=401, detail="Session expired")
    sess = await db.helper_sessions.find_one({"jti": payload.get("jti"), "revoked_at": None}, {"_id": 0})
    if not sess:
        raise HTTPException(status_code=401, detail="Session expired")
    if not _helper_access_ok(h):
        raise HTTPException(status_code=403, detail="Your access period has ended")
    await db.helper_sessions.update_one({"jti": payload.get("jti")}, {"$set": {"last_seen_at": now_iso()}})
    return h


def require_helper_permission(key: str):
    async def dep(h: dict = Depends(get_current_helper)):
        perms = h.get("permissions") or {}
        if not perms.get(key):
            raise HTTPException(status_code=403, detail="You don't have access to this")
        return h
    return dep


def _helper_can_see_member(h: dict, member_id: Optional[str]) -> bool:
    if not member_id:
        return True
    if h.get("assigned_all"):
        return True
    return member_id in (h.get("assigned_member_ids") or [])


async def _helper_audit(h: dict, action: str, detail: Optional[str] = None):
    await db.helper_audit.insert_one({
        "audit_id": new_id("aud_"), "helper_id": h["helper_id"], "family_id": h["family_id"],
        "action": action, "detail": detail, "created_at": now_iso()})


async def _require_helper_manager(user: dict):
    """Only a parent/admin may manage helpers. Returns the family id."""
    fid = require_family(user)
    mine = await member_for_user(user)
    if not (mine and mine.get("role") in ("admin", "parent")):
        raise HTTPException(status_code=403, detail="Only parents or admins can manage helpers")
    return fid


async def _member_cards(fid: str, ids: List[str]) -> List[dict]:
    out = []
    for mid in ids:
        m = await db.members.find_one({"member_id": mid, "family_id": fid}, {"_id": 0})
        if m:
            out.append({"member_id": mid, "name": m.get("name"), "photo_url": m.get("photo_url"), "color": m.get("color")})
    return out


def helper_public(h: dict) -> dict:
    role = ROLE_MAP.get(h.get("role"), ROLE_MAP["custom"])
    perms = h.get("permissions") or {}
    return {
        "helper_id": h["helper_id"], "family_id": h["family_id"], "name": h.get("name"),
        "role": h.get("role"), "role_label": role["label"], "role_icon": role["icon"],
        "phone": h.get("phone"), "photo_url": h.get("photo_url"), "status": h.get("status"),
        "address": h.get("address"),
        "username": h.get("username"),
        "assigned_all": bool(h.get("assigned_all")), "assigned_member_ids": h.get("assigned_member_ids") or [],
        "permissions": perms, "access": h.get("access") or {},
        "can_access": [PERMISSION_LABELS[k] for k in PERMISSION_KEYS if perms.get(k)],
        "cannot_access": [PERMISSION_LABELS[k] for k in PERMISSION_KEYS if not perms.get(k)],
        "in_hours": _within_hours(h), "created_at": h.get("created_at"),
    }


# --- Parent/admin: manage helpers -----------------------------------------
@api.get("/helpers/roles")
async def helper_roles(user: dict = Depends(get_current_user)):
    await _require_helper_manager(user)
    return {"roles": HELPER_ROLES, "permissions": [{"key": k, "label": PERMISSION_LABELS[k]} for k in PERMISSION_KEYS]}


@api.get("/helpers")
async def list_helpers(user: dict = Depends(get_current_user)):
    fid = await _require_helper_manager(user)
    out = []
    _today_str = datetime.now(timezone.utc).date().isoformat()
    async for h in db.helpers.find({"family_id": fid, "status": {"$ne": "removed"}}, {"_id": 0}).sort("created_at", -1):
        pub = helper_public(h)
        pub["assigned_members"] = await _member_cards(fid, h.get("assigned_member_ids") or [])
        # today's task summary
        tasks = await _helper_today_tasks(h)
        pub["tasks_total"] = len(tasks)
        pub["tasks_done"] = sum(1 for t in tasks if t.get("done"))
        pub["next_task"] = next((t for t in tasks if not t.get("done")), None)
        pub["unread_chat"] = await _helper_unread_for_parent(fid, h["helper_id"])
        ci = await db.helper_checkins.find_one(
            {"helper_id": h["helper_id"], "date": _today_str}, {"_id": 0, "checked_in_at": 1, "checked_out_at": 1})
        pub["checked_in_at"] = (ci or {}).get("checked_in_at")
        pub["checked_out_at"] = (ci or {}).get("checked_out_at")
        out.append(pub)
    return {"helpers": out}


@api.post("/helpers")
async def create_helper(body: HelperIn, request: Request, user: dict = Depends(get_current_user)):
    fid = await _require_helper_manager(user)
    if body.role not in ROLE_MAP:
        raise HTTPException(status_code=400, detail="Unknown helper role")
    # validate assigned members belong to this family
    assigned = []
    if not body.assigned_all:
        for mid in body.assigned_member_ids:
            if await db.members.find_one({"member_id": mid, "family_id": fid}, {"_id": 1}):
                assigned.append(mid)
    hid = new_id("help_")
    doc = {
        "helper_id": hid, "family_id": fid, "name": body.name.strip(),
        "role": body.role, "phone": (body.phone or "").strip() or None,
        "email": (body.email or "").strip().lower() or None, "photo_url": body.photo_url,
        "address": (body.address or "").strip() or None, "id_card_url": body.id_card_url,
        "assigned_all": bool(body.assigned_all), "assigned_member_ids": assigned,
        "permissions": _resolve_perms(body.role, body.permissions),
        "access": body.access.dict(), "status": "pending", "token_version": 0,
        "username": None, "pin_hash": None, "invite_code": None, "invite_expires": None,
        "failed_logins": 0, "locked_until": None,
        "created_by": user["user_id"], "created_at": now_iso(),
    }
    invite_code = None
    # Parent can set a direct username+PIN, OR we mint an invite code for self-activation.
    uname = (body.username or "").strip().lower() or None
    if uname:
        if not re.fullmatch(r"[a-z0-9_.]{3,20}", uname):
            raise HTTPException(status_code=400, detail="Username must be 3–20 letters, numbers, dots or underscores")
        if await db.helpers.find_one({"username": uname}):
            raise HTTPException(status_code=400, detail="That username is already taken")
        if not _valid_pin(body.pin):
            raise HTTPException(status_code=400, detail="PIN must be 4–6 digits")
        doc.update({"username": uname, "pin_hash": pwd_context.hash(body.pin), "status": "active"})
    else:
        invite_code = new_invite_code()
        doc.update({"invite_code": invite_code,
                    "invite_expires": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()})
    await db.helpers.insert_one(doc)
    base = _public_base_url(request)
    pub = helper_public(doc)
    pub["id_card_url"] = doc.get("id_card_url")
    return {"helper": pub, "invite_code": invite_code,
            "invite_link": f"{base}/helper-login?code={invite_code}" if invite_code else None}


@api.get("/helpers/{helper_id}")
async def get_helper(helper_id: str, user: dict = Depends(get_current_user)):
    fid = await _require_helper_manager(user)
    h = await db.helpers.find_one({"helper_id": helper_id, "family_id": fid, "status": {"$ne": "removed"}}, {"_id": 0})
    if not h:
        raise HTTPException(status_code=404, detail="Helper not found")
    pub = helper_public(h)
    pub["assigned_members"] = await _member_cards(fid, h.get("assigned_member_ids") or [])
    pub["has_login"] = bool(h.get("username"))
    pub["invite_code"] = h.get("invite_code")
    pub["id_card_url"] = h.get("id_card_url")
    pub["unread_chat"] = await _helper_unread_for_parent(fid, helper_id)
    ci = await db.helper_checkins.find_one(
        {"helper_id": helper_id, "date": datetime.now(timezone.utc).date().isoformat()},
        {"_id": 0, "checked_in_at": 1, "checked_out_at": 1})
    pub["checked_in_at"] = (ci or {}).get("checked_in_at")
    pub["checked_out_at"] = (ci or {}).get("checked_out_at")
    return {"helper": pub}


@api.patch("/helpers/{helper_id}")
async def patch_helper(helper_id: str, body: HelperPatch, user: dict = Depends(get_current_user)):
    fid = await _require_helper_manager(user)
    h = await db.helpers.find_one({"helper_id": helper_id, "family_id": fid, "status": {"$ne": "removed"}}, {"_id": 0})
    if not h:
        raise HTTPException(status_code=404, detail="Helper not found")
    updates = {}
    if body.name is not None:
        updates["name"] = body.name.strip()
    if body.phone is not None:
        updates["phone"] = body.phone.strip() or None
    if body.photo_url is not None:
        updates["photo_url"] = body.photo_url
    if body.address is not None:
        updates["address"] = body.address.strip() or None
    if body.id_card_url is not None:
        updates["id_card_url"] = body.id_card_url or None
    role = body.role if body.role is not None else h.get("role")
    if body.role is not None:
        if body.role not in ROLE_MAP:
            raise HTTPException(status_code=400, detail="Unknown helper role")
        updates["role"] = body.role
    if body.permissions is not None:
        merged = {**(h.get("permissions") or {}), **body.permissions}
        updates["permissions"] = _resolve_perms(role, merged)
    elif body.role is not None:
        updates["permissions"] = _resolve_perms(role, None)
    if body.assigned_all is not None:
        updates["assigned_all"] = bool(body.assigned_all)
    if body.assigned_member_ids is not None:
        assigned = [mid for mid in body.assigned_member_ids
                    if await db.members.find_one({"member_id": mid, "family_id": fid}, {"_id": 1})]
        updates["assigned_member_ids"] = assigned
    if body.access is not None:
        updates["access"] = body.access.dict()
    if updates:
        await db.helpers.update_one({"helper_id": helper_id, "family_id": fid}, {"$set": updates})
    h2 = await db.helpers.find_one({"helper_id": helper_id, "family_id": fid}, {"_id": 0})
    await _helper_audit(h2, "permissions_changed", "Parent updated helper access")
    pub = helper_public(h2)
    pub["id_card_url"] = h2.get("id_card_url")
    pub["assigned_members"] = await _member_cards(fid, h2.get("assigned_member_ids") or [])
    return {"helper": pub}


@api.post("/helpers/{helper_id}/pause")
async def pause_helper(helper_id: str, user: dict = Depends(get_current_user)):
    fid = await _require_helper_manager(user)
    r = await db.helpers.update_one({"helper_id": helper_id, "family_id": fid, "status": "active"},
                                    {"$set": {"status": "paused"}})
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="Active helper not found")
    return {"ok": True, "status": "paused"}


@api.post("/helpers/{helper_id}/resume")
async def resume_helper(helper_id: str, user: dict = Depends(get_current_user)):
    fid = await _require_helper_manager(user)
    r = await db.helpers.update_one({"helper_id": helper_id, "family_id": fid, "status": "paused"},
                                    {"$set": {"status": "active"}})
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="Paused helper not found")
    return {"ok": True, "status": "active"}


@api.delete("/helpers/{helper_id}")
async def remove_helper(helper_id: str, user: dict = Depends(get_current_user)):
    fid = await _require_helper_manager(user)
    h = await db.helpers.find_one({"helper_id": helper_id, "family_id": fid}, {"_id": 0})
    if not h:
        raise HTTPException(status_code=404, detail="Helper not found")
    await db.helpers.update_one({"helper_id": helper_id, "family_id": fid},
                                {"$set": {"status": "removed", "username": None, "pin_hash": None,
                                          "invite_code": None},
                                 "$inc": {"token_version": 1}})
    await db.helper_sessions.update_many({"helper_id": helper_id, "revoked_at": None},
                                         {"$set": {"revoked_at": now_iso()}})
    return {"ok": True}


@api.post("/helpers/{helper_id}/regenerate-invite")
async def regenerate_helper_invite(helper_id: str, request: Request, user: dict = Depends(get_current_user)):
    fid = await _require_helper_manager(user)
    h = await db.helpers.find_one({"helper_id": helper_id, "family_id": fid, "status": {"$ne": "removed"}}, {"_id": 0})
    if not h:
        raise HTTPException(status_code=404, detail="Helper not found")
    code = new_invite_code()
    await db.helpers.update_one({"helper_id": helper_id, "family_id": fid},
                                {"$set": {"invite_code": code,
                                          "invite_expires": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
                                          "status": "pending", "username": None, "pin_hash": None},
                                 "$inc": {"token_version": 1}})
    await db.helper_sessions.update_many({"helper_id": helper_id, "revoked_at": None},
                                         {"$set": {"revoked_at": now_iso()}})
    base = _public_base_url(request)
    return {"invite_code": code, "invite_link": f"{base}/helper-login?code={code}"}


@api.post("/helpers/{helper_id}/reset-pin")
async def reset_helper_pin(helper_id: str, body: HelperLoginIn, user: dict = Depends(get_current_user)):
    """Parent directly sets/replaces the helper's username + PIN."""
    fid = await _require_helper_manager(user)
    h = await db.helpers.find_one({"helper_id": helper_id, "family_id": fid, "status": {"$ne": "removed"}}, {"_id": 0})
    if not h:
        raise HTTPException(status_code=404, detail="Helper not found")
    uname = (body.username or "").strip().lower()
    if not re.fullmatch(r"[a-z0-9_.]{3,20}", uname or ""):
        raise HTTPException(status_code=400, detail="Username must be 3–20 letters, numbers, dots or underscores")
    clash = await db.helpers.find_one({"username": uname})
    if clash and clash.get("helper_id") != helper_id:
        raise HTTPException(status_code=400, detail="That username is already taken")
    if not _valid_pin(body.pin):
        raise HTTPException(status_code=400, detail="PIN must be 4–6 digits")
    await db.helpers.update_one({"helper_id": helper_id, "family_id": fid},
                                {"$set": {"username": uname, "pin_hash": pwd_context.hash(body.pin),
                                          "status": "active", "invite_code": None,
                                          "failed_logins": 0, "locked_until": None},
                                 "$inc": {"token_version": 1}})
    await db.helper_sessions.update_many({"helper_id": helper_id, "revoked_at": None},
                                         {"$set": {"revoked_at": now_iso()}})
    return {"ok": True, "username": uname, "status": "active"}


@api.get("/helpers/{helper_id}/sessions")
async def helper_sessions(helper_id: str, user: dict = Depends(get_current_user)):
    fid = await _require_helper_manager(user)
    if not await db.helpers.find_one({"helper_id": helper_id, "family_id": fid}, {"_id": 1}):
        raise HTTPException(status_code=404, detail="Helper not found")
    out = await db.helper_sessions.find(
        {"helper_id": helper_id, "revoked_at": None}, {"_id": 0}).sort("last_seen_at", -1).to_list(20)
    return {"sessions": out}


@api.post("/helpers/{helper_id}/signout-all")
async def helper_signout_all(helper_id: str, user: dict = Depends(get_current_user)):
    fid = await _require_helper_manager(user)
    if not await db.helpers.find_one({"helper_id": helper_id, "family_id": fid}, {"_id": 1}):
        raise HTTPException(status_code=404, detail="Helper not found")
    await db.helpers.update_one({"helper_id": helper_id, "family_id": fid}, {"$inc": {"token_version": 1}})
    await db.helper_sessions.update_many({"helper_id": helper_id, "revoked_at": None},
                                         {"$set": {"revoked_at": now_iso()}})
    return {"ok": True}


@api.get("/helpers/{helper_id}/audit")
async def helper_audit_log(helper_id: str, user: dict = Depends(get_current_user)):
    fid = await _require_helper_manager(user)
    if not await db.helpers.find_one({"helper_id": helper_id, "family_id": fid}, {"_id": 1}):
        raise HTTPException(status_code=404, detail="Helper not found")
    out = await db.helper_audit.find({"helper_id": helper_id}, {"_id": 0}).sort("created_at", -1).to_list(60)
    return {"events": out}


# --- Parent/admin: assign & review helper tasks ---------------------------
def helper_task_public(t: dict) -> dict:
    return clean(dict(t))


@api.post("/helpers/{helper_id}/tasks")
async def create_helper_task(helper_id: str, body: HelperTaskIn, user: dict = Depends(get_current_user)):
    fid = await _require_helper_manager(user)
    h = await db.helpers.find_one({"helper_id": helper_id, "family_id": fid, "status": {"$ne": "removed"}}, {"_id": 0})
    if not h:
        raise HTTPException(status_code=404, detail="Helper not found")
    task = {
        "task_id": new_id("htask_"), "helper_id": helper_id, "family_id": fid,
        "title": body.title.strip(), "instructions": (body.instructions or "").strip() or None,
        "for_member_id": body.for_member_id, "due_time": body.due_time,
        "priority": body.priority if body.priority in ("low", "normal", "high") else "normal",
        "schedule": body.schedule if body.schedule in ("once", "daily", "weekly", "monthly") else "once",
        "days": body.days or [], "date": body.date or datetime.now(timezone.utc).date().isoformat(),
        "checklist": body.checklist or [], "photo_url": body.photo_url,
        "require_proof": body.require_proof if body.require_proof in ("photo", "note", "confirm") else None,
        "category": body.category,
        "pickup_from": (body.pickup_from or "").strip() or None,
        "pickup_to": (body.pickup_to or "").strip() or None,
        "dest_lat": body.dest_lat, "dest_lng": body.dest_lng,
        "created_by": user["user_id"], "created_at": now_iso(),
    }
    await db.helper_tasks.insert_one(task)
    return {"task": helper_task_public(task)}


@api.get("/helpers/{helper_id}/tasks")
async def list_helper_tasks(helper_id: str, user: dict = Depends(get_current_user)):
    fid = await _require_helper_manager(user)
    tasks = await db.helper_tasks.find({"helper_id": helper_id, "family_id": fid}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"tasks": tasks}


@api.patch("/helper-tasks/{task_id}")
async def patch_helper_task(task_id: str, body: HelperTaskPatch, user: dict = Depends(get_current_user)):
    fid = await _require_helper_manager(user)
    t = await db.helper_tasks.find_one({"task_id": task_id, "family_id": fid}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    updates = {k: v for k, v in body.dict().items() if v is not None}
    if updates:
        await db.helper_tasks.update_one({"task_id": task_id, "family_id": fid}, {"$set": updates})
    return {"task": await db.helper_tasks.find_one({"task_id": task_id, "family_id": fid}, {"_id": 0})}


@api.delete("/helper-tasks/{task_id}")
async def delete_helper_task(task_id: str, user: dict = Depends(get_current_user)):
    fid = await _require_helper_manager(user)
    await db.helper_tasks.delete_one({"task_id": task_id, "family_id": fid})
    await db.helper_task_completions.delete_many({"task_id": task_id, "family_id": fid})
    return {"ok": True}


@api.get("/helpers/{helper_id}/activity")
async def helper_activity(helper_id: str, user: dict = Depends(get_current_user)):
    fid = await _require_helper_manager(user)
    comps = await db.helper_task_completions.find(
        {"helper_id": helper_id, "family_id": fid}, {"_id": 0}).sort("updated_at", -1).to_list(60)
    tmap = {t["task_id"]: t for t in await db.helper_tasks.find({"helper_id": helper_id}, {"_id": 0}).to_list(500)}
    for c in comps:
        c["task_title"] = (tmap.get(c["task_id"]) or {}).get("title")
    return {"activity": comps}


# --- Parent/admin: private helper chat + handover notes -------------------
async def _get_managed_helper(fid: str, helper_id: str) -> dict:
    h = await db.helpers.find_one(
        {"helper_id": helper_id, "family_id": fid, "status": {"$ne": "removed"}}, {"_id": 0})
    if not h:
        raise HTTPException(status_code=404, detail="Helper not found")
    return h


def helper_msg_public(m: dict) -> dict:
    return {"message_id": m["message_id"], "sender": m.get("sender"),
            "sender_name": m.get("sender_name"), "sender_photo": m.get("sender_photo"),
            "text": m.get("text"), "photo_url": m.get("photo_url"),
            "created_at": m.get("created_at")}


async def _helper_unread_for_parent(fid: str, helper_id: str) -> int:
    return await db.helper_messages.count_documents(
        {"helper_id": helper_id, "family_id": fid, "sender": "helper", "read_by_parent": False})


@api.get("/helpers/{helper_id}/chat")
async def parent_helper_chat(helper_id: str, user: dict = Depends(get_current_user)):
    fid = await _require_helper_manager(user)
    h = await _get_managed_helper(fid, helper_id)
    await db.helper_messages.update_many(
        {"helper_id": helper_id, "family_id": fid, "sender": "helper", "read_by_parent": False},
        {"$set": {"read_by_parent": True}})
    msgs = await db.helper_messages.find(
        {"helper_id": helper_id, "family_id": fid}, {"_id": 0}).sort("created_at", 1).to_list(300)
    return {"messages": [helper_msg_public(m) for m in msgs],
            "helper": {"helper_id": helper_id, "name": h.get("name"), "photo_url": h.get("photo_url"),
                       "can_chat": bool((h.get("permissions") or {}).get("chat"))}}


@api.post("/helpers/{helper_id}/chat")
async def parent_helper_chat_send(helper_id: str, body: HelperChatIn, user: dict = Depends(get_current_user)):
    fid = await _require_helper_manager(user)
    await _get_managed_helper(fid, helper_id)
    text = (body.text or "").strip()
    if not text and not body.photo_url:
        raise HTTPException(status_code=400, detail="Type a message")
    mine = await member_for_user(user)
    doc = {"message_id": new_id("hmsg_"), "helper_id": helper_id, "family_id": fid,
           "sender": "parent", "sender_member_id": (mine or {}).get("member_id"),
           "sender_name": (mine or {}).get("name") or "Family",
           "sender_photo": (mine or {}).get("photo_url"),
           "text": text or None, "photo_url": body.photo_url,
           "read_by_parent": True, "read_by_helper": False, "created_at": now_iso()}
    await db.helper_messages.insert_one(doc)
    return {"message": helper_msg_public(doc)}


@api.get("/helpers/{helper_id}/handover")
async def parent_helper_handover(helper_id: str, user: dict = Depends(get_current_user)):
    fid = await _require_helper_manager(user)
    await _get_managed_helper(fid, helper_id)
    notes = await db.helper_handovers.find(
        {"helper_id": helper_id, "family_id": fid}, {"_id": 0}).sort("created_at", 1).to_list(300)
    return {"notes": notes, "today": datetime.now(timezone.utc).date().isoformat()}


@api.post("/helpers/{helper_id}/handover")
async def parent_helper_handover_add(helper_id: str, body: HelperHandoverIn, user: dict = Depends(get_current_user)):
    fid = await _require_helper_manager(user)
    await _get_managed_helper(fid, helper_id)
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Write a note")
    mine = await member_for_user(user)
    doc = {"handover_id": new_id("hoff_"), "helper_id": helper_id, "family_id": fid,
           "date": datetime.now(timezone.utc).date().isoformat(), "by": "parent",
           "author_id": (mine or {}).get("member_id"),
           "author_name": (mine or {}).get("name") or "Family",
           "author_photo": (mine or {}).get("photo_url"),
           "text": text, "created_at": now_iso()}
    await db.helper_handovers.insert_one(doc)
    return {"note": clean(doc)}


# --- Parent/admin: Care Team group chat (parents + all active helpers) -----
def care_msg_public(m: dict) -> dict:
    return {"message_id": m["message_id"], "sender_type": m.get("sender_type"),
            "sender_id": m.get("sender_id"), "sender_name": m.get("sender_name"),
            "sender_role": m.get("sender_role"), "text": m.get("text"),
            "photo_url": m.get("photo_url"), "audio_url": m.get("audio_url"),
            "audio_dur": m.get("audio_dur"), "created_at": m.get("created_at")}


@api.get("/care-team/chat")
async def parent_care_team(user: dict = Depends(get_current_user)):
    fid = await _require_helper_manager(user)
    mine = await member_for_user(user)
    reader = f"m:{(mine or {}).get('member_id')}"
    await db.care_team_messages.update_many(
        {"family_id": fid, "read_by": {"$ne": reader}}, {"$addToSet": {"read_by": reader}})
    msgs = await db.care_team_messages.find({"family_id": fid}, {"_id": 0}).sort("created_at", 1).to_list(300)
    roster = []
    async for h in db.helpers.find({"family_id": fid, "status": "active"}, {"_id": 0, "name": 1, "role": 1, "photo_url": 1}):
        roster.append({"name": h.get("name"), "role": ROLE_MAP.get(h.get("role"), ROLE_MAP["custom"])["label"], "photo_url": h.get("photo_url")})
    return {"messages": [care_msg_public(m) for m in msgs], "helpers": roster,
            "me": (mine or {}).get("member_id"), "my_type": "parent"}


@api.post("/care-team/chat")
async def parent_care_team_send(body: CareTeamMsgIn, user: dict = Depends(get_current_user)):
    fid = await _require_helper_manager(user)
    text = (body.text or "").strip()
    if not text and not body.photo_url and not body.audio_url:
        raise HTTPException(status_code=400, detail="Type a message")
    mine = await member_for_user(user)
    reader = f"m:{(mine or {}).get('member_id')}"
    doc = {"message_id": new_id("ctm_"), "family_id": fid, "sender_type": "parent",
           "sender_id": (mine or {}).get("member_id"), "sender_name": (mine or {}).get("name") or "Family",
           "sender_role": "Parent", "text": text or None, "photo_url": body.photo_url,
           "audio_url": body.audio_url, "audio_dur": body.audio_dur,
           "read_by": [reader], "created_at": now_iso()}
    await db.care_team_messages.insert_one(doc)
    return {"message": care_msg_public(doc)}


@api.get("/care-team/unread")
async def parent_care_team_unread(user: dict = Depends(get_current_user)):
    fid = await _require_helper_manager(user)
    mine = await member_for_user(user)
    reader = f"m:{(mine or {}).get('member_id')}"
    n = await db.care_team_messages.count_documents(
        {"family_id": fid, "read_by": {"$ne": reader}, "sender_id": {"$ne": (mine or {}).get("member_id")}})
    return {"count": n}


# --- Parent/admin: helper ratings (daily 👍/👎 + note) ---------------------
@api.post("/helpers/{helper_id}/rating")
async def rate_helper(helper_id: str, body: HelperRatingIn, user: dict = Depends(get_current_user)):
    fid = await _require_helper_manager(user)
    await _get_managed_helper(fid, helper_id)
    if body.rating not in ("up", "down"):
        raise HTTPException(status_code=400, detail="Rating must be up or down")
    mine = await member_for_user(user)
    today = datetime.now(timezone.utc).date().isoformat()
    await db.helper_ratings.update_one(
        {"helper_id": helper_id, "family_id": fid, "date": today},
        {"$set": {"rating": body.rating, "note": (body.note or "").strip() or None,
                  "by": (mine or {}).get("member_id"), "by_name": (mine or {}).get("name"),
                  "created_at": now_iso()},
         "$setOnInsert": {"rating_id": new_id("hrate_")}}, upsert=True)
    return {"ok": True, "rating": body.rating}


@api.get("/helpers/{helper_id}/ratings")
async def list_helper_ratings(helper_id: str, user: dict = Depends(get_current_user)):
    fid = await _require_helper_manager(user)
    await _get_managed_helper(fid, helper_id)
    out = await db.helper_ratings.find({"helper_id": helper_id, "family_id": fid}, {"_id": 0}).sort("date", -1).to_list(30)
    today = datetime.now(timezone.utc).date().isoformat()
    return {"ratings": out, "up": sum(1 for r in out if r.get("rating") == "up"),
            "total": len(out), "today": next((r for r in out if r.get("date") == today), None)}


# --- Helper today-task computation (shared) --------------------------------
def _task_due_today(t: dict, today: date) -> bool:
    sched = t.get("schedule", "once")
    if sched == "daily":
        return True
    if sched == "weekly":
        return today.weekday() in (t.get("days") or [])
    if sched == "monthly":
        try:
            base = datetime.strptime(t.get("date") or "", "%Y-%m-%d").date()
            return base.day == today.day
        except ValueError:
            return today.day == 1
    return (t.get("date") or "") == today.isoformat()  # once


async def _helper_today_tasks(h: dict) -> List[dict]:
    today = datetime.now(timezone.utc).date()
    tkey = today.isoformat()
    raw = await db.helper_tasks.find({"helper_id": h["helper_id"], "family_id": h["family_id"]}, {"_id": 0}).to_list(300)
    todays = [t for t in raw if _task_due_today(t, today)]
    out = []
    for t in todays:
        comp = await db.helper_task_completions.find_one(
            {"task_id": t["task_id"], "date": tkey}, {"_id": 0})
        member = None
        if t.get("for_member_id"):
            m = await db.members.find_one({"member_id": t["for_member_id"]}, {"_id": 0})
            if m:
                member = {"member_id": m["member_id"], "name": m.get("name"), "photo_url": m.get("photo_url"), "color": m.get("color")}
        out.append({**t, "member": member,
                    "started": bool(comp and comp.get("started_at")),
                    "done": bool(comp and comp.get("completed_at")),
                    "completion": comp})
    out.sort(key=lambda x: (x.get("done"), x.get("due_time") or "99:99"))
    return out


async def _notify_parents_helper(h: dict, title: str, subtitle: Optional[str] = None,
                                 emoji: str = "🔔", route: Optional[str] = None):
    """Store a helper event; surfaced to parents via /helpers/{id}/activity + audit
    AND the family Notifications Center (helper_events, parents/admins only)."""
    await _helper_audit(h, "event", title + (f" — {subtitle}" if subtitle else ""))
    await db.helper_events.insert_one({
        "event_id": new_id("hev_"), "helper_id": h["helper_id"], "family_id": h["family_id"],
        "emoji": emoji, "title": title, "subtitle": subtitle,
        "route": route or f"/helper/{h['helper_id']}", "created_at": now_iso()})


# --- Helper self-service (helper token) ------------------------------------
@api.post("/helper/activate")
async def helper_activate(body: HelperActivateIn, request: Request):
    code = (body.code or "").strip().upper()
    h = await db.helpers.find_one({"invite_code": code, "status": "pending"}, {"_id": 0})
    exp = h.get("invite_expires") if h else None
    valid = bool(h and exp and exp > now_iso())
    if not valid:
        raise HTTPException(status_code=400, detail="This invite is invalid or has expired. Ask the family for a new one.")
    uname = (body.username or "").strip().lower()
    if not re.fullmatch(r"[a-z0-9_.]{3,20}", uname or ""):
        raise HTTPException(status_code=400, detail="Username must be 3–20 letters, numbers, dots or underscores")
    clash = await db.helpers.find_one({"username": uname})
    if clash and clash.get("helper_id") != h["helper_id"]:
        raise HTTPException(status_code=400, detail="That username is already taken")
    if not _valid_pin(body.pin):
        raise HTTPException(status_code=400, detail="PIN must be 4–6 digits")
    await db.helpers.update_one({"helper_id": h["helper_id"]},
                                {"$set": {"username": uname, "pin_hash": pwd_context.hash(body.pin),
                                          "status": "active", "invite_code": None,
                                          "activated_at": now_iso()}})
    h = await db.helpers.find_one({"helper_id": h["helper_id"]}, {"_id": 0})
    return await _issue_helper_session(h, request)


HELPER_LOGIN_LIMIT = 5
HELPER_LOCK = timedelta(minutes=15)


@api.post("/helper/login")
async def helper_login(body: HelperLoginIn, request: Request):
    uname = (body.username or "").strip().lower()
    ip = _client_ip(request)
    key = f"helper:{uname}:{ip}"
    await _reject_if_locked(key)
    h = await db.helpers.find_one({"username": uname}, {"_id": 0})
    stored = h.get("pin_hash") if (h and h.get("pin_hash")) else DUMMY_BCRYPT_HASH
    ok = _valid_pin(body.pin) and pwd_context.verify(body.pin, stored)
    if not h or not h.get("pin_hash") or not ok:
        await _record_failure(key)
        raise HTTPException(status_code=401, detail="Incorrect username or PIN")
    if h.get("status") == "paused":
        raise HTTPException(status_code=403, detail="Your access is paused. Please contact the family.")
    if h.get("status") != "active":
        raise HTTPException(status_code=403, detail="Your access is no longer available.")
    if not _helper_access_ok(h):
        raise HTTPException(status_code=403, detail="Your access period has ended.")
    await _clear_failures(key)
    return await _issue_helper_session(h, request)


async def _issue_helper_session(h: dict, request: Request) -> dict:
    jti = uuid.uuid4().hex
    tv = h.get("token_version", 0)
    now = datetime.now(timezone.utc)
    await db.helper_sessions.insert_one({
        "session_id": new_id("hs_"), "helper_id": h["helper_id"], "family_id": h["family_id"],
        "jti": jti, "token_version": tv, "created_at": now.isoformat(),
        "expires_at": now + timedelta(days=HELPER_TOKEN_DAYS), "revoked_at": None,
        "last_seen_at": now.isoformat(),
        "device": (request.headers.get("user-agent") or "")[:120] if request else None,
    })
    token = make_helper_token(h["helper_id"], h["family_id"], tv, jti)
    return {"token": token, "media_token": make_helper_media_token(h["helper_id"], h["family_id"]),
            "helper": helper_public(h)}


@api.get("/helper/me")
async def helper_me(h: dict = Depends(get_current_helper)):
    fam = await db.families.find_one({"family_id": h["family_id"]}, {"_id": 0, "name": 1})
    pub = helper_public(h)
    pub["assigned_members"] = await _member_cards(h["family_id"], h.get("assigned_member_ids") or [])
    pub["family_name"] = fam.get("name") if fam else None
    return {"helper": pub, "media_token": make_helper_media_token(h["helper_id"], h["family_id"])}


@api.get("/helper/dashboard")
async def helper_dashboard(h: dict = Depends(get_current_helper)):
    tasks = await _helper_today_tasks(h)
    fam = await db.families.find_one({"family_id": h["family_id"]}, {"_id": 0, "name": 1})
    perms = h.get("permissions") or {}
    unread_chat = 0
    if perms.get("chat"):
        unread_chat = await db.helper_messages.count_documents(
            {"helper_id": h["helper_id"], "family_id": h["family_id"],
             "sender": "parent", "read_by_helper": False})
    today = datetime.now(timezone.utc).date().isoformat()
    handover_today = await db.helper_handovers.count_documents(
        {"helper_id": h["helper_id"], "family_id": h["family_id"], "by": "parent", "date": today})
    care_team_unread = 0
    if perms.get("chat"):
        care_team_unread = await db.care_team_messages.count_documents(
            {"family_id": h["family_id"], "read_by": {"$ne": f"h:{h['helper_id']}"},
             "sender_id": {"$ne": h["helper_id"]}})
    rate_today = await db.helper_ratings.find_one({"helper_id": h["helper_id"], "date": today}, {"_id": 0})
    checkin = await db.helper_checkins.find_one(
        {"helper_id": h["helper_id"], "date": today}, {"_id": 0, "checked_in_at": 1, "checked_out_at": 1})
    return {
        "name": h.get("name"), "role_label": ROLE_MAP.get(h.get("role"), ROLE_MAP["custom"])["label"],
        "family_name": fam.get("name") if fam else None,
        "tasks": tasks, "total": len(tasks), "done": sum(1 for t in tasks if t.get("done")),
        "assigned_members": await _member_cards(h["family_id"], h.get("assigned_member_ids") or []),
        "permissions": perms, "can_chat": bool(perms.get("chat")),
        "can_view_medical": bool(perms.get("medical")),
        "unread_chat": unread_chat, "handover_today": handover_today,
        "care_team_unread": care_team_unread,
        "rated_up_today": bool(rate_today and rate_today.get("rating") == "up"),
        "shift": _shift_status(h),
        "checkin": checkin or None,
        "notif_unread": await _helper_notif_unread(h),
        "media_token": make_helper_media_token(h["helper_id"], h["family_id"]),
    }


# --- Helper self-service: in-portal notifications feed ---------------------
async def _helper_notifications(h: dict, limit: int = 40) -> list:
    """Aggregate an activity feed FOR the helper: parent 1:1 messages, Care Team
    messages from others, parent handover notes, and family ratings/praise."""
    fid = h["family_id"]
    hid = h["helper_id"]
    perms = h.get("permissions") or {}
    items: list = []
    if perms.get("chat"):
        for m in await db.helper_messages.find(
            {"helper_id": hid, "family_id": fid, "sender": "parent"}, {"_id": 0}
        ).sort("created_at", -1).to_list(15):
            preview = m.get("text") or ("📷 Photo" if m.get("photo_url") else "")
            items.append({"kind": "chat", "emoji": "💬",
                          "title": f"{m.get('sender_name') or 'Family'} sent you a message",
                          "subtitle": preview, "route": f"/helper-portal/chat?focus={m.get('message_id')}",
                          "message_id": m.get("message_id"),
                          "created_at": m.get("created_at")})
        for m in await db.care_team_messages.find(
            {"family_id": fid, "sender_id": {"$ne": hid}}, {"_id": 0}
        ).sort("created_at", -1).to_list(15):
            preview = m.get("text") or ("🎤 Voice message" if m.get("audio_url")
                                        else ("📷 Photo" if m.get("photo_url") else ""))
            items.append({"kind": "care_team", "emoji": "👥",
                          "title": f"{m.get('sender_name') or 'Care Team'} · Care Team",
                          "subtitle": preview, "route": f"/helper-portal/care-team?focus={m.get('message_id')}",
                          "message_id": m.get("message_id"),
                          "created_at": m.get("created_at")})
    for n in await db.helper_handovers.find(
        {"helper_id": hid, "family_id": fid, "by": "parent"}, {"_id": 0}
    ).sort("created_at", -1).to_list(10):
        items.append({"kind": "handover", "emoji": "📝",
                      "title": f"{n.get('author_name') or 'Family'} left a handover note",
                      "subtitle": n.get("text"), "route": "/helper-portal/handover",
                      "created_at": n.get("created_at")})
    for r in await db.helper_ratings.find(
        {"helper_id": hid, "family_id": fid}, {"_id": 0}
    ).sort("created_at", -1).to_list(5):
        up = r.get("rating") == "up"
        items.append({"kind": "rating", "emoji": "🌟" if up else "🙏",
                      "title": "You got a 👍 today!" if up else "New feedback from the family",
                      "subtitle": r.get("note"), "route": "/helper-portal",
                      "created_at": r.get("created_at")})
    items = [it for it in items if it.get("created_at")]
    items.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return items[:limit]


async def _helper_notif_unread(h: dict) -> int:
    last = h.get("helper_notifs_read_at") or ""
    items = await _helper_notifications(h)
    return sum(1 for it in items if (it.get("created_at") or "") > last)


@api.get("/helper/notifications")
async def helper_notifications(h: dict = Depends(get_current_helper)):
    items = await _helper_notifications(h)
    last = h.get("helper_notifs_read_at") or ""
    unread = sum(1 for it in items if (it.get("created_at") or "") > last)
    return {"items": items, "unread": unread, "last_read": last or None}


@api.post("/helper/notifications/read")
async def helper_notifications_read(h: dict = Depends(get_current_helper)):
    await db.helpers.update_one({"helper_id": h["helper_id"]},
                                {"$set": {"helper_notifs_read_at": now_iso()}})
    return {"ok": True}


@api.get("/helper/tasks")
async def helper_tasks(date: Optional[str] = None, h: dict = Depends(get_current_helper)):
    return {"tasks": await _helper_today_tasks(h)}


async def _get_helper_task(h: dict, task_id: str) -> dict:
    t = await db.helper_tasks.find_one({"task_id": task_id, "helper_id": h["helper_id"]}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    return t


@api.post("/helper/tasks/{task_id}/start")
async def helper_task_start(task_id: str, h: dict = Depends(get_current_helper)):
    t = await _get_helper_task(h, task_id)
    tkey = datetime.now(timezone.utc).date().isoformat()
    await db.helper_task_completions.update_one(
        {"task_id": task_id, "date": tkey},
        {"$set": {"started_at": now_iso(), "updated_at": now_iso(), "helper_id": h["helper_id"],
                  "family_id": h["family_id"], "status": "in_progress"},
         "$setOnInsert": {"completion_id": new_id("hc_")}}, upsert=True)
    await _notify_parents_helper(h, f"{h.get('name')} started “{t.get('title')}”")
    return {"ok": True}


@api.post("/helper/tasks/{task_id}/complete")
async def helper_task_complete(task_id: str, body: HelperTaskCompleteIn, h: dict = Depends(get_current_helper)):
    t = await _get_helper_task(h, task_id)
    proof = t.get("require_proof")
    if proof == "photo" and not body.photo_url:
        raise HTTPException(status_code=400, detail="This task needs a photo to mark it done")
    if proof == "note" and not (body.note or "").strip():
        raise HTTPException(status_code=400, detail="This task needs a note to mark it done")
    tkey = datetime.now(timezone.utc).date().isoformat()
    at = now_iso()
    await db.helper_task_completions.update_one(
        {"task_id": task_id, "date": tkey},
        {"$set": {"completed_at": at, "updated_at": at, "note": (body.note or "").strip() or None,
                  "photo_url": body.photo_url, "checklist_done": body.checklist_done or [],
                  "helper_id": h["helper_id"], "family_id": h["family_id"], "status": "done"},
         "$setOnInsert": {"completion_id": new_id("hc_")}}, upsert=True)
    tm = datetime.now(timezone.utc).strftime("%-I:%M %p")
    await _notify_parents_helper(h, f"{h.get('name')} completed “{t.get('title')}”", f"at {tm}")
    return {"ok": True, "completed_at": at}


@api.post("/helper/tasks/{task_id}/issue")
async def helper_task_issue(task_id: str, body: HelperIssueIn, h: dict = Depends(get_current_helper)):
    t = await _get_helper_task(h, task_id)
    tkey = datetime.now(timezone.utc).date().isoformat()
    at = now_iso()
    await db.helper_task_completions.update_one(
        {"task_id": task_id, "date": tkey},
        {"$set": {"issue": {"reason": body.reason, "note": (body.note or "").strip() or None, "at": at},
                  "updated_at": at, "status": "issue", "helper_id": h["helper_id"], "family_id": h["family_id"]},
         "$setOnInsert": {"completion_id": new_id("hc_")}}, upsert=True)
    await _notify_parents_helper(h, f"{h.get('name')} needs help with “{t.get('title')}”",
                                 f"{body.reason}" + (f": {body.note}" if body.note else ""))
    return {"ok": True}


@api.post("/helper/tasks/{task_id}/trip")
async def helper_task_trip(task_id: str, body: HelperTripIn, h: dict = Depends(get_current_helper)):
    """Pickup/drop live status flow: en_route → picked_up → reached (completes)."""
    t = await _get_helper_task(h, task_id)
    stage = body.stage
    if stage not in ("en_route", "picked_up", "reached"):
        raise HTTPException(status_code=400, detail="Unknown trip stage")
    tkey = datetime.now(timezone.utc).date().isoformat()
    at = now_iso()
    field = {"en_route": "started_at", "picked_up": "picked_up_at", "reached": "reached_at"}[stage]
    sets = {f"trip.{field}": at, "trip.status": stage, "updated_at": at,
            "helper_id": h["helper_id"], "family_id": h["family_id"]}
    if body.note:
        sets["trip.note"] = body.note.strip()
    if stage == "reached":
        sets["completed_at"] = at
        sets["status"] = "done"
        if body.proof_url:
            sets["trip.proof_url"] = body.proof_url
    else:
        sets["started_at"] = sets.get("started_at") or at
        sets["status"] = "in_progress"
    await db.helper_task_completions.update_one(
        {"task_id": task_id, "date": tkey},
        {"$set": sets, "$setOnInsert": {"completion_id": new_id("hc_")}}, upsert=True)
    who = "the child"
    if t.get("for_member_id"):
        m = await db.members.find_one({"member_id": t["for_member_id"]}, {"_id": 0, "name": 1})
        if m:
            who = (m.get("name") or "the child").split(" ")[0]
    label = {"en_route": "started the trip",
             "picked_up": f"picked up {who}",
             "reached": f"reached {t.get('pickup_to') or 'the destination'}"}[stage]
    sub = t.get("title")
    emoji = "🚗"
    if stage == "reached" and body.proof_url:
        sub = "Arrival photo attached 📸"
        emoji = "📸"
    await _notify_parents_helper(h, f"{h.get('name')} {label}", sub, emoji, f"/helper/{h['helper_id']}")
    return {"ok": True, "stage": stage}


# --- Helper self-service: private parent chat + handover notes -------------
@api.get("/helper/chat")
async def helper_chat_list(h: dict = Depends(require_helper_permission("chat"))):
    await db.helper_messages.update_many(
        {"helper_id": h["helper_id"], "family_id": h["family_id"], "sender": "parent", "read_by_helper": False},
        {"$set": {"read_by_helper": True}})
    msgs = await db.helper_messages.find(
        {"helper_id": h["helper_id"], "family_id": h["family_id"]}, {"_id": 0}).sort("created_at", 1).to_list(300)
    return {"messages": [helper_msg_public(m) for m in msgs]}


@api.post("/helper/chat")
async def helper_chat_send(body: HelperChatIn, h: dict = Depends(require_helper_permission("chat"))):
    text = (body.text or "").strip()
    if not text and not body.photo_url:
        raise HTTPException(status_code=400, detail="Type a message")
    doc = {"message_id": new_id("hmsg_"), "helper_id": h["helper_id"], "family_id": h["family_id"],
           "sender": "helper", "sender_member_id": None, "sender_name": h.get("name"),
           "sender_photo": h.get("photo_url"), "text": text or None, "photo_url": body.photo_url,
           "read_by_parent": False, "read_by_helper": True, "created_at": now_iso()}
    await db.helper_messages.insert_one(doc)
    await _notify_parents_helper(h, f"{h.get('name')} sent a message",
                                 (text or "📷 Photo")[:90], "💬", f"/helper/{h['helper_id']}")
    return {"message": helper_msg_public(doc)}


@api.get("/helper/handover")
async def helper_handover_list(h: dict = Depends(get_current_helper)):
    notes = await db.helper_handovers.find(
        {"helper_id": h["helper_id"], "family_id": h["family_id"]}, {"_id": 0}).sort("created_at", 1).to_list(300)
    return {"notes": notes, "today": datetime.now(timezone.utc).date().isoformat()}


@api.post("/helper/handover")
async def helper_handover_add(body: HelperHandoverIn, h: dict = Depends(get_current_helper)):
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Write a note")
    doc = {"handover_id": new_id("hoff_"), "helper_id": h["helper_id"], "family_id": h["family_id"],
           "date": datetime.now(timezone.utc).date().isoformat(), "by": "helper",
           "author_id": None, "author_name": h.get("name"), "author_photo": h.get("photo_url"),
           "text": text, "created_at": now_iso()}
    await db.helper_handovers.insert_one(doc)
    await _notify_parents_helper(h, f"{h.get('name')} left an end-of-day note",
                                 text[:90], "📝", f"/helper/{h['helper_id']}")
    return {"note": clean(doc)}


# --- Helper self-service: live pickup location, care team, medical ---------
ETA_ALERT_M = 2000                          # notify parents within ~this distance of drop-off


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


@api.post("/helper/tasks/{task_id}/location")
async def helper_task_location(task_id: str, body: HelperTripLocIn, h: dict = Depends(get_current_helper)):
    """Driver shares live GPS DURING an active pickup trip (must Start Trip first).
    When close to the drop-off point, fires a one-time ETA alert to parents."""
    t = await _get_helper_task(h, task_id)
    tkey = datetime.now(timezone.utc).date().isoformat()
    r = await db.helper_task_completions.update_one(
        {"task_id": task_id, "date": tkey},
        {"$set": {"trip.lat": body.lat, "trip.lng": body.lng, "trip.loc_updated_at": now_iso()}})
    if not r.matched_count:
        raise HTTPException(status_code=400, detail="Start the trip before sharing your location")

    eta = None
    if t.get("dest_lat") is not None and t.get("dest_lng") is not None:
        comp = await db.helper_task_completions.find_one({"task_id": task_id, "date": tkey}, {"_id": 0})
        trip = (comp or {}).get("trip") or {}
        dist = _haversine_m(body.lat, body.lng, float(t["dest_lat"]), float(t["dest_lng"]))
        eta = max(1, round(dist / 500))
        if trip.get("status") in ("en_route", "picked_up") and not trip.get("eta_alerted") and dist <= ETA_ALERT_M:
            await db.helper_task_completions.update_one(
                {"task_id": task_id, "date": tkey}, {"$set": {"trip.eta_alerted": True, "trip.eta_min": eta}})
            who = ""
            if t.get("for_member_id"):
                m = await db.members.find_one({"member_id": t["for_member_id"]}, {"_id": 0, "name": 1})
                if m:
                    who = (m.get("name") or "").split(" ")[0]
            dest = t.get("pickup_to") or "the destination"
            await _notify_parents_helper(
                h, f"{h.get('name')} is about {eta} min from {dest}",
                f"With {who}" if who else t.get("title"), "📍", f"/helper/{h['helper_id']}")
    return {"ok": True, "eta_min": eta}


@api.get("/helper/care-team")
async def helper_care_team(h: dict = Depends(require_helper_permission("chat"))):
    fid = h["family_id"]
    reader = f"h:{h['helper_id']}"
    await db.care_team_messages.update_many(
        {"family_id": fid, "read_by": {"$ne": reader}}, {"$addToSet": {"read_by": reader}})
    msgs = await db.care_team_messages.find({"family_id": fid}, {"_id": 0}).sort("created_at", 1).to_list(300)
    return {"messages": [care_msg_public(m) for m in msgs], "me": h["helper_id"], "my_type": "helper"}


@api.post("/helper/care-team")
async def helper_care_team_send(body: CareTeamMsgIn, h: dict = Depends(require_helper_permission("chat"))):
    text = (body.text or "").strip()
    if not text and not body.photo_url and not body.audio_url:
        raise HTTPException(status_code=400, detail="Type a message")
    reader = f"h:{h['helper_id']}"
    role = ROLE_MAP.get(h.get("role"), ROLE_MAP["custom"])["label"]
    doc = {"message_id": new_id("ctm_"), "family_id": h["family_id"], "sender_type": "helper",
           "sender_id": h["helper_id"], "sender_name": h.get("name"), "sender_role": role,
           "text": text or None, "photo_url": body.photo_url,
           "audio_url": body.audio_url, "audio_dur": body.audio_dur,
           "read_by": [reader], "created_at": now_iso()}
    await db.care_team_messages.insert_one(doc)
    preview = text or ("🎤 Voice message" if body.audio_url else "📷 Photo")
    await _notify_parents_helper(h, f"{h.get('name')} posted in the Care Team",
                                 preview[:90], "👥", "/care-team")
    return {"message": care_msg_public(doc)}


@api.get("/helper/medical")
async def helper_medical(h: dict = Depends(require_helper_permission("medical"))):
    """View-only, emergency medical info for the helper's ASSIGNED members only.
    Exposes blood group, allergies, doctor, hospital and emergency contact — NOT
    medications/conditions or insurance/policy numbers."""
    fid = h["family_id"]
    if h.get("assigned_all"):
        mids = [m["member_id"] for m in await db.members.find({"family_id": fid}, {"_id": 0, "member_id": 1}).to_list(200)]
    else:
        mids = h.get("assigned_member_ids") or []
    cards = []
    for mid in mids:
        m = await db.members.find_one({"member_id": mid, "family_id": fid}, {"_id": 0})
        if not m:
            continue
        card = await db.medical_cards.find_one({"member_id": mid, "family_id": fid}, {"_id": 0}) or {}
        cards.append({
            "member": {"member_id": mid, "name": m.get("name"), "photo_url": m.get("photo_url"), "color": m.get("color")},
            "blood_group": card.get("blood_group"), "allergies": card.get("allergies"),
            "doctor": card.get("doctor"), "hospital": card.get("hospital"),
            "emergency_contact": card.get("emergency_contact"),
        })
    return {"cards": cards}


# --- Helper shift check-in / check-out -------------------------------------
@api.post("/helper/checkin")
async def helper_checkin(h: dict = Depends(get_current_helper)):
    today = datetime.now(timezone.utc).date().isoformat()
    existing = await db.helper_checkins.find_one(
        {"helper_id": h["helper_id"], "date": today}, {"_id": 0})
    at = now_iso()
    if existing and existing.get("checked_in_at"):
        return {"ok": True, "checked_in_at": existing["checked_in_at"],
                "checked_out_at": existing.get("checked_out_at")}
    await db.helper_checkins.update_one(
        {"helper_id": h["helper_id"], "date": today},
        {"$set": {"checked_in_at": at, "family_id": h["family_id"]},
         "$setOnInsert": {"checkin_id": new_id("hci_")}}, upsert=True)
    await _notify_parents_helper(h, f"{h.get('name')} checked in for the shift",
                                 "On duty now", "🟢", f"/helper/{h['helper_id']}")
    return {"ok": True, "checked_in_at": at, "checked_out_at": None}


@api.post("/helper/checkout")
async def helper_checkout(h: dict = Depends(get_current_helper)):
    today = datetime.now(timezone.utc).date().isoformat()
    at = now_iso()
    r = await db.helper_checkins.update_one(
        {"helper_id": h["helper_id"], "date": today}, {"$set": {"checked_out_at": at}})
    if not r.matched_count:
        raise HTTPException(status_code=400, detail="Check in first")
    await _notify_parents_helper(h, f"{h.get('name')} checked out",
                                 "Shift ended", "👋", f"/helper/{h['helper_id']}")
    return {"ok": True, "checked_out_at": at}


@api.post("/helper/upload")
async def helper_upload(file: UploadFile = File(...), kind: str = Form("image"), h: dict = Depends(get_current_helper)):
    """Helper-scoped upload (proof photos). Stored under the helper's family."""
    data = await file.read()
    default_ext = {"video": "mp4", "audio": "m4a"}.get(kind, "jpg")
    ext = (file.filename or "file").split(".")[-1].lower() if "." in (file.filename or "") else default_ext
    path = f"{APP_NAME}/helper_uploads/{h['helper_id']}/{uuid.uuid4().hex}.{ext}"
    default_ct = {"video": "video/mp4", "audio": "audio/m4a"}.get(kind, "image/jpeg")
    ct = file.content_type or default_ct
    try:
        result = await run_in_threadpool(_put_object, path, data, ct)
    except Exception as e:
        logger.exception("helper upload failed")
        raise HTTPException(status_code=502, detail=f"Upload failed: {e}")
    await db.media.insert_one({
        "media_id": new_id("md_"), "owner_id": h["helper_id"], "family_id": h["family_id"],
        "storage_path": result["path"], "content_type": ct, "kind": kind, "created_at": now_iso(),
    })
    return {"path": result["path"], "url": f"/api/files/{result['path']}", "type": kind}


@api.post("/helper/signout")
async def helper_signout(authorization: Optional[str] = Header(None), h: dict = Depends(get_current_helper)):
    raw = authorization.split(" ", 1)[1].strip() if authorization else None
    payload = _decode_token(raw) if raw else None
    if payload and payload.get("jti"):
        await db.helper_sessions.update_one({"jti": payload["jti"]}, {"$set": {"revoked_at": now_iso()}})
    return {"ok": True}


# ---------------------------------------------------------------------------
# App wiring
# ---------------------------------------------------------------------------
@api.get("/")
async def root():
    return {"message": "FamilyHome API ❤️"}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    try:
        try:
            await db.users.drop_index("email_1")
        except Exception:
            pass
        await db.users.create_index("email", unique=True, sparse=True)
        await db.users.create_index("user_id", unique=True)
        await db.users.create_index("apple_sub", unique=True, sparse=True)
        await db.members.create_index("family_id")
        await db.posts.create_index("family_id")
        await db.events.create_index([("family_id", 1), ("date", 1)])
        await db.affections.create_index([("family_id", 1), ("to_member_id", 1)])
        try:
            await db.auth_throttles.drop_index("expires_at_1")
        except Exception:
            pass
        await db.auth_throttles.create_index("expires_at")
        try:
            await db.helpers.drop_index("username_1")
        except Exception:
            pass
        await db.helpers.create_index("username", unique=True, name="helper_username_uniq",
                                      partialFilterExpression={"username": {"$type": "string"}})
        await db.helpers.create_index([("family_id", 1), ("status", 1)])
        await db.helpers.create_index("invite_code", sparse=True)
        await db.helper_sessions.create_index("jti", unique=True, sparse=True)
        await db.helper_sessions.create_index([("helper_id", 1), ("revoked_at", 1)])
        await db.helper_tasks.create_index([("helper_id", 1), ("family_id", 1)])
        await db.helper_task_completions.create_index([("task_id", 1), ("date", 1)], unique=True)
        await db.helper_audit.create_index([("helper_id", 1), ("created_at", -1)])
        await db.helper_messages.create_index([("helper_id", 1), ("created_at", 1)])
        await db.helper_handovers.create_index([("helper_id", 1), ("created_at", 1)])
        await db.helper_events.create_index([("family_id", 1), ("created_at", -1)])
        await db.care_team_messages.create_index([("family_id", 1), ("created_at", 1)])
        await db.helper_ratings.create_index([("helper_id", 1), ("date", 1)], unique=True)
        await db.helper_checkins.create_index([("helper_id", 1), ("date", 1)], unique=True)
    except Exception as e:
        logger.warning(f"index setup: {e}")
    try:
        await run_in_threadpool(_init_storage)
        logger.info("storage initialized")
    except Exception as e:
        logger.warning(f"storage init deferred: {e}")
    asyncio.create_task(morning_reminder_loop())


@app.on_event("shutdown")
async def shutdown():
    client.close()
    await _push_client.aclose()
