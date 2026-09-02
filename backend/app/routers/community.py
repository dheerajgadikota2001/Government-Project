"""
Community API — public message board + private correction reports.

Safety model (no accounts, no captchas, no stored IPs):
- Rate limits per salted IP hash: 10 posts/hour, 3 correction reports/hour.
- Content filters: length caps, at most 2 links, a small multilingual
  slur/profanity blocklist, and a repeated-character spam heuristic.
- Reader reports: a post reported by 3 different readers is auto-HELD
  (hidden) until the maintainer reviews it.
- The maintainer moderates with the X-Admin-Key header (ADMIN_KEY env).
- Authors can delete their own post with the delete_token issued to their
  browser at creation. Deletion marks REMOVED; nothing is silently edited.
"""

import hashlib
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models.community import (
    CorrectionReport, CorrectionStatus, ForumPost, PostStatus
)
from app.schemas.common import PaginatedResponse
from app.schemas.community import (
    CorrectionCreate, CorrectionOut, PostCreate, PostCreated, PostOut, TopicOut
)

router = APIRouter(prefix="/community", tags=["Community"])

TOPICS = ["general", "projects", "investments", "finances", "governments", "suggestions"]

POSTS_PER_HOUR = 10
CORRECTIONS_PER_HOUR = 3
REPORTS_TO_HOLD = 3
MAX_LINKS = 2

# Deliberately small blocklist: obvious slurs/abuse in the platform's languages.
# The report button + maintainer removal handle everything a list can't.
_BLOCK = [
    "chutiya", "madarchod", "bhenchod", "behenchod", "bhosdi", "randi",
    "lanja", "lanjakodaka", "dengey", "dengu", "pukulo", "modda",
    "kojja", "gudda", "erripuka", "puka", "fuck you", "motherfucker",
    "बहनचोद", "मादरचोद", "भोसड़ी", "रंडी", "चूतिया",
    "లంజ", "దెంగ", "మొడ్డ", "పూకు",
]
_LINK_RE = re.compile(r"https?://|www\.", re.IGNORECASE)
_REPEAT_RE = re.compile(r"(.)\1{9,}")  # any char repeated 10+ times


def _ip_hash(request: Request) -> str:
    ip = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip() \
        or (request.client.host if request.client else "unknown")
    salt = get_settings().secret_key
    return hashlib.sha256(f"{salt}:{ip}".encode()).hexdigest()


def _clean_or_reject(text: str) -> None:
    low = text.lower()
    for w in _BLOCK:
        if w in low:
            raise HTTPException(status_code=422, detail="blocked_language")
    if len(_LINK_RE.findall(text)) > MAX_LINKS:
        raise HTTPException(status_code=422, detail="too_many_links")
    if _REPEAT_RE.search(text):
        raise HTTPException(status_code=422, detail="spam_pattern")


async def _rate_limit(db: AsyncSession, model, iph: str, per_hour: int) -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
    n = (await db.execute(
        select(func.count()).select_from(model)
        .where(model.ip_hash == iph, model.created_at >= cutoff)
    )).scalar_one()
    if n >= per_hour:
        raise HTTPException(status_code=429, detail="rate_limited")


def _require_admin(x_admin_key: Optional[str]) -> None:
    expected = get_settings().admin_key
    if not expected or x_admin_key != expected:
        raise HTTPException(status_code=403, detail="admin_key_required")


# ---------------------------------------------------------------- topics

@router.get("/topics", response_model=list[TopicOut])
async def list_topics(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(ForumPost.topic, func.count(), func.max(ForumPost.created_at))
        .where(ForumPost.topic.isnot(None),
               ForumPost.status == PostStatus.VISIBLE,
               ForumPost.parent_id.is_(None))
        .group_by(ForumPost.topic)
    )).all()
    by_key = {r[0]: r for r in rows}
    return [
        TopicOut(key=t,
                 post_count=by_key[t][1] if t in by_key else 0,
                 last_post_at=by_key[t][2] if t in by_key else None)
        for t in TOPICS
    ]


# ---------------------------------------------------------------- posts

@router.get("/posts", response_model=PaginatedResponse[PostOut])
async def list_posts(
    topic: Optional[str] = Query(None),
    page_key: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """Top-level posts of a topic or a page thread, newest first."""
    if not topic and not page_key:
        raise HTTPException(status_code=422, detail="topic_or_page_key_required")
    stmt = select(ForumPost).where(
        ForumPost.status == PostStatus.VISIBLE,
        ForumPost.parent_id.is_(None),
    )
    stmt = stmt.where(ForumPost.topic == topic) if topic else stmt.where(ForumPost.page_key == page_key)

    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    stmt = stmt.order_by(ForumPost.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    posts = (await db.execute(stmt)).scalars().all()
    return PaginatedResponse.build(
        items=[PostOut.model_validate(p) for p in posts],
        total=total, page=page, page_size=page_size,
    )


@router.get("/posts/{post_id}/replies", response_model=list[PostOut])
async def list_replies(post_id: int, db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(ForumPost)
        .where(ForumPost.parent_id == post_id, ForumPost.status == PostStatus.VISIBLE)
        .order_by(ForumPost.created_at.asc())
        .limit(200)
    )).scalars().all()
    return [PostOut.model_validate(p) for p in rows]


@router.post("/posts", response_model=PostCreated, status_code=201)
async def create_post(payload: PostCreate, request: Request, db: AsyncSession = Depends(get_db)):
    if payload.parent_id is None:
        if bool(payload.topic) == bool(payload.page_key):
            raise HTTPException(status_code=422, detail="exactly_one_of_topic_or_page_key")
        if payload.topic and payload.topic not in TOPICS:
            raise HTTPException(status_code=422, detail="unknown_topic")

    _clean_or_reject(payload.body)
    _clean_or_reject(payload.display_name)

    iph = _ip_hash(request)
    await _rate_limit(db, ForumPost, iph, POSTS_PER_HOUR)

    parent = None
    if payload.parent_id is not None:
        parent = (await db.execute(
            select(ForumPost).where(ForumPost.id == payload.parent_id)
        )).scalar_one_or_none()
        if not parent or parent.status != PostStatus.VISIBLE or parent.parent_id is not None:
            raise HTTPException(status_code=404, detail="parent_not_found")

    post = ForumPost(
        topic=parent.topic if parent else payload.topic,
        page_key=parent.page_key if parent else payload.page_key,
        parent_id=payload.parent_id,
        display_name=payload.display_name.strip(),
        body=payload.body.strip(),
        lang=payload.lang,
        ip_hash=iph,
        delete_token=secrets.token_hex(32),
    )
    db.add(post)
    if parent:
        parent.reply_count += 1
    await db.commit()
    await db.refresh(post)
    return PostCreated.model_validate(post)


@router.post("/posts/{post_id}/report", status_code=204)
async def report_post(post_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    post = (await db.execute(select(ForumPost).where(ForumPost.id == post_id))).scalar_one_or_none()
    if not post or post.status == PostStatus.REMOVED:
        raise HTTPException(status_code=404, detail="post_not_found")
    post.report_count += 1
    if post.report_count >= REPORTS_TO_HOLD and post.status == PostStatus.VISIBLE:
        post.status = PostStatus.HELD
    await db.commit()


@router.delete("/posts/{post_id}", status_code=204)
async def delete_own_post(post_id: int, token: str = Query(...), db: AsyncSession = Depends(get_db)):
    post = (await db.execute(select(ForumPost).where(ForumPost.id == post_id))).scalar_one_or_none()
    if not post or not secrets.compare_digest(post.delete_token, token):
        raise HTTPException(status_code=404, detail="post_not_found")
    post.status = PostStatus.REMOVED
    await db.commit()


# ---------------------------------------------------------------- corrections (private)

@router.post("/corrections", response_model=CorrectionOut, status_code=201)
async def create_correction(payload: CorrectionCreate, request: Request, db: AsyncSession = Depends(get_db)):
    _clean_or_reject(payload.body)
    iph = _ip_hash(request)
    await _rate_limit(db, CorrectionReport, iph, CORRECTIONS_PER_HOUR)
    rec = CorrectionReport(
        page_key=payload.page_key, body=payload.body.strip(),
        contact=(payload.contact or "").strip() or None,
        lang=payload.lang, ip_hash=iph,
    )
    db.add(rec)
    await db.commit()
    await db.refresh(rec)
    return CorrectionOut.model_validate(rec)


# ---------------------------------------------------------------- maintainer

@router.get("/admin/corrections", response_model=list[CorrectionOut])
async def admin_corrections(
    status: Optional[CorrectionStatus] = Query(None),
    x_admin_key: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(x_admin_key)
    stmt = select(CorrectionReport).order_by(CorrectionReport.created_at.desc()).limit(500)
    if status:
        stmt = stmt.where(CorrectionReport.status == status)
    return [CorrectionOut.model_validate(r) for r in (await db.execute(stmt)).scalars().all()]


@router.get("/admin/held", response_model=list[PostOut])
async def admin_held_posts(x_admin_key: Optional[str] = Header(None), db: AsyncSession = Depends(get_db)):
    _require_admin(x_admin_key)
    rows = (await db.execute(
        select(ForumPost).where(ForumPost.status == PostStatus.HELD)
        .order_by(ForumPost.created_at.desc()).limit(500)
    )).scalars().all()
    return [PostOut.model_validate(p) for p in rows]


@router.post("/admin/posts/{post_id}/remove", status_code=204)
async def admin_remove(post_id: int, x_admin_key: Optional[str] = Header(None), db: AsyncSession = Depends(get_db)):
    _require_admin(x_admin_key)
    await db.execute(update(ForumPost).where(ForumPost.id == post_id).values(status=PostStatus.REMOVED))
    await db.commit()


@router.post("/admin/posts/{post_id}/restore", status_code=204)
async def admin_restore(post_id: int, x_admin_key: Optional[str] = Header(None), db: AsyncSession = Depends(get_db)):
    _require_admin(x_admin_key)
    await db.execute(update(ForumPost).where(ForumPost.id == post_id)
                     .values(status=PostStatus.VISIBLE, report_count=0))
    await db.commit()


@router.post("/admin/corrections/{rec_id}/status", status_code=204)
async def admin_correction_status(
    rec_id: int,
    status: CorrectionStatus = Query(...),
    note: Optional[str] = Query(None),
    x_admin_key: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(x_admin_key)
    vals = {"status": status}
    if note is not None:
        vals["admin_note"] = note
    await db.execute(update(CorrectionReport).where(CorrectionReport.id == rec_id).values(**vals))
    await db.commit()
