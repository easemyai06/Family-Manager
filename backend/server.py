"""FamilyHome — Private Family Super-App backend.

A single FastAPI service exposing auth, family, feed, stories, affection,
calendar, chores, shopping and to-do APIs backed by MongoDB, plus a rich
demo-family seeder and Emergent Object Storage media upload/serving.
"""
import os
import re
import uuid
import asyncio
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta, date

import jwt
import httpx
import requests
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Header, UploadFile, File, Form, Query
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
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

app = FastAPI(title="FamilyHome API")
api = APIRouter(prefix="/api")


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
    user = await db.users.find_one({"user_id": payload.get("user_id")}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


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


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    password: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class SessionIn(BaseModel):
    session_id: str


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
    color: Optional[str] = None
    birthday: Optional[str] = None
    photo_url: Optional[str] = None
    favorite_food: Optional[str] = None
    favorite_color: Optional[str] = None
    hobbies: Optional[str] = None


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


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------
def public_user(u: dict) -> dict:
    return {
        "user_id": u["user_id"], "name": u.get("name"), "email": u.get("email"),
        "picture": u.get("picture"), "family_id": u.get("family_id"),
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
async def login(body: LoginIn):
    u = await db.users.find_one({"email": body.email.lower()})
    if not u or not u.get("password_hash") or not pwd_context.verify(body.password, u["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
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


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    member = await member_for_user(user)
    return {"user": public_user(user), "member": member}


# ---------------------------------------------------------------------------
# Family & members
# ---------------------------------------------------------------------------
DEFAULT_COLORS = ["#FF6B6B", "#D98E5A", "#A3B18A", "#FFD166", "#8AB07D", "#C96F4A", "#B5835A", "#6B8E5A"]


@api.post("/families")
async def create_family(body: FamilyIn, user: dict = Depends(get_current_user)):
    if user.get("family_id"):
        raise HTTPException(status_code=400, detail="You already belong to a family")
    fid = new_id("fam_")
    fam = {
        "family_id": fid, "name": body.name.strip(), "cover_photo": body.cover_photo,
        "created_by": user["user_id"], "invite_code": uuid.uuid4().hex[:8].upper(),
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
    members = await db.members.find({"family_id": fid}, {"_id": 0}).to_list(200)
    return {"family": fam, "members": members}


@api.get("/families/members")
async def list_members(user: dict = Depends(get_current_user)):
    fid = require_family(user)
    return await db.members.find({"family_id": fid}, {"_id": 0}).to_list(200)


@api.post("/families/members")
async def add_member(body: MemberIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
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
    updates = {k: v for k, v in body.dict().items() if v is not None}
    if updates:
        await db.members.update_one({"member_id": member_id, "family_id": fid}, {"$set": updates})
    return await db.members.find_one({"member_id": member_id, "family_id": fid}, {"_id": 0})


@api.get("/families/invite")
async def get_invite(user: dict = Depends(get_current_user)):
    fid = require_family(user)
    fam = await db.families.find_one({"family_id": fid}, {"_id": 0})
    return {"invite_code": fam["invite_code"], "family_name": fam["name"]}


@api.post("/families/join")
async def join_family(body: dict, user: dict = Depends(get_current_user)):
    if user.get("family_id"):
        raise HTTPException(status_code=400, detail="You already belong to a family")
    code = (body.get("code") or "").strip().upper()
    fam = await db.families.find_one({"invite_code": code}, {"_id": 0})
    if not fam:
        raise HTTPException(status_code=404, detail="Invalid invite code")
    fid = fam["family_id"]
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
async def hydrate_event(e: dict) -> dict:
    e = clean(dict(e))
    parts = []
    for pid in e.get("participant_ids", []):
        m = await db.members.find_one({"member_id": pid}, {"_id": 0})
        if m:
            parts.append(m)
    e["participants"] = parts
    if e.get("owner_member_id"):
        e["owner"] = await db.members.find_one({"member_id": e["owner_member_id"]}, {"_id": 0})
    return e


@api.get("/events")
async def list_events(user: dict = Depends(get_current_user), start: Optional[str] = None, end: Optional[str] = None):
    fid = require_family(user)
    q = {"family_id": fid}
    if start and end:
        q["date"] = {"$gte": start, "$lte": end}
    events = await db.events.find(q, {"_id": 0}).sort("date", 1).to_list(500)
    return [await hydrate_event(e) for e in events]


@api.post("/events")
async def create_event(body: EventIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    color = body.color
    if not color and body.owner_member_id:
        owner = await db.members.find_one({"member_id": body.owner_member_id}, {"_id": 0})
        color = owner["color"] if owner else "#FF6B6B"
    e = {"event_id": new_id("evt_"), "family_id": fid, **body.dict(), "color": color or "#FF6B6B", "created_at": now_iso()}
    await db.events.insert_one(e)
    return await hydrate_event(e)


@api.patch("/events/{event_id}")
async def update_event(event_id: str, body: EventIn, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    await db.events.update_one({"event_id": event_id, "family_id": fid}, {"$set": body.dict()})
    e = await db.events.find_one({"event_id": event_id, "family_id": fid}, {"_id": 0})
    return await hydrate_event(e)


@api.delete("/events/{event_id}")
async def delete_event(event_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
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
        await db.chore_completions.insert_one({
            "completion_id": new_id("cc_"), "chore_id": chore_id, "family_id": fid,
            "member_id": c["owner_member_id"], "stars": c.get("stars", 1),
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
    await db.shopping_items.delete_many({"list_id": list_id})
    return {"ok": True}


@api.get("/shopping/lists/{list_id}/items")
async def shopping_items(list_id: str, user: dict = Depends(get_current_user)):
    require_family(user)
    return await db.shopping_items.find({"list_id": list_id}, {"_id": 0}).sort("created_at", 1).to_list(500)


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
    require_family(user)
    item = await db.shopping_items.find_one({"item_id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    await db.shopping_items.update_one({"item_id": item_id}, {"$set": {"checked": not item["checked"]}})
    item["checked"] = not item["checked"]
    return item


@api.delete("/shopping/items/{item_id}")
async def delete_shopping_item(item_id: str, user: dict = Depends(get_current_user)):
    require_family(user)
    await db.shopping_items.delete_one({"item_id": item_id})
    return {"ok": True}


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
    await db.todo_items.delete_many({"list_id": list_id})
    return {"ok": True}


@api.get("/todos/lists/{list_id}/items")
async def todo_items(list_id: str, user: dict = Depends(get_current_user)):
    require_family(user)
    items = await db.todo_items.find({"list_id": list_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
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
    require_family(user)
    item = await db.todo_items.find_one({"item_id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    await db.todo_items.update_one({"item_id": item_id}, {"$set": {"done": not item["done"]}})
    item["done"] = not item["done"]
    return item


@api.delete("/todos/items/{item_id}")
async def delete_todo_item(item_id: str, user: dict = Depends(get_current_user)):
    require_family(user)
    await db.todo_items.delete_one({"item_id": item_id})
    return {"ok": True}


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
    }


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
    type: str = "text"             # text | image | affection | voice
    affection_key: Optional[str] = None
    duration: Optional[int] = None  # ms, for voice notes


class MsgReactIn(BaseModel):
    emoji: str


class PinIn(BaseModel):
    message_id: str


class ChatPatch(BaseModel):
    name: Optional[str] = None
    photo_url: Optional[str] = None
    add_member_ids: List[str] = []
    remove_member_ids: List[str] = []


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


@api.get("/chats/{chat_id}/messages")
async def get_messages(chat_id: str, user: dict = Depends(get_current_user)):
    fid = require_family(user)
    mine = await member_for_user(user)
    await _require_chat(chat_id, fid, mine)
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
        "reply_preview": reply_preview, "duration": body.duration, "created_at": now_iso(),
    }
    await db.messages.insert_one(msg)

    if body.type == "affection" and body.affection_key:
        preview = AFFECTION_LABELS.get(body.affection_key, "❤️")
    elif body.type == "voice":
        preview = "🎤 Voice message"
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
        "media_id": new_id("md_"), "owner_id": user["user_id"], "storage_path": result["path"],
        "content_type": ct, "kind": kind, "created_at": now_iso(),
    })
    return {"path": result["path"], "url": f"/api/files/{result['path']}", "type": kind}


@api.get("/files/{path:path}")
async def serve_file(path: str, user: dict = Depends(get_current_user)):
    rec = await db.media.find_one({"storage_path": path}, {"_id": 0})
    if not rec:
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
async def register_push(body: RegisterPushBody):
    resp = await _push_client.post("/api/v1/push/users/register", json=body.model_dump())
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
    for name, rel, role, color, bday, photo, is_child, food, fav_color, hobbies, is_me in members_def:
        mid = new_id("mem_")
        mem_ids[name] = mid
        await db.members.insert_one({
            "member_id": mid, "family_id": fid, "name": name, "relationship": rel, "role": role,
            "color": color, "birthday": bday, "photo_url": photo, "is_child": is_child,
            "linked_user_id": user["user_id"] if is_me else None, "favorite_food": food,
            "favorite_color": fav_color, "hobbies": hobbies, "created_at": now_iso(),
        })
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"family_id": fid}})

    # posts
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
    task_items = [("Book dentist for Anaya", "Priya", "high", False), ("Fix the garden gate", "Raj", "normal", False),
                  ("Renew car insurance", "Raj", "high", True), ("Plan Grandma's party", "Priya", "high", False)]
    for title, who, prio, done in task_items:
        await db.todo_items.insert_one({
            "item_id": new_id("tdi_"), "list_id": tasks, "family_id": fid, "title": title,
            "assignee_member_id": mem_ids[who], "due_date": None, "priority": prio, "done": done, "created_at": now_iso(),
        })
    for title in ["Sunscreen", "Swimsuits", "Chargers", "First-aid kit"]:
        await db.todo_items.insert_one({
            "item_id": new_id("tdi_"), "list_id": packing, "family_id": fid, "title": title,
            "assignee_member_id": None, "due_date": None, "priority": "normal", "done": False, "created_at": now_iso(),
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



    # ---- chats ----
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
# App wiring
# ---------------------------------------------------------------------------
@api.get("/")
async def root():
    return {"message": "FamilyHome API ❤️"}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("user_id", unique=True)
        await db.members.create_index("family_id")
        await db.posts.create_index("family_id")
        await db.events.create_index([("family_id", 1), ("date", 1)])
        await db.affections.create_index([("family_id", 1), ("to_member_id", 1)])
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
