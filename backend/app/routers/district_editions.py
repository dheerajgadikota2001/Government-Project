"""
District paper editions over HTTP.

Public (readers): published editions only.
    GET  /api/v1/districts/{slug}/editions            numbers and dates, newest first
    GET  /api/v1/districts/{slug}/editions/latest     the newest published edition
    GET  /api/v1/districts/{slug}/editions/{number}   one published edition

Maintainer (X-Admin-Key): the whole life of an edition.
    POST /api/v1/admin/editions                        save a draft (the editorial gate runs first)
    GET  /api/v1/admin/editions?status=draft           drafts waiting for a person
    GET  /api/v1/admin/editions/{id}
    POST /api/v1/admin/editions/{id}/approve           a person's yes; audio is requested here
    POST /api/v1/admin/editions/{id}/publish           next number for the district; readers see it
    POST /api/v1/admin/editions/{id}/reject
    POST /api/v1/admin/editions/{id}/audio             the recording job reports a CDN address

A draft never leaves the admin routes: the public routes filter on status in the query
itself, not after loading.
"""

from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants.districts import AP_DISTRICTS, DISTRICT_NAMES, normalise_district
from app.database import get_db
from app.models.district_edition import STATUSES
from app.models.district_edition import DistrictEdition as E
from app.routers.community import _require_admin   # one admin gate for the whole API (tests/test_admin_gate.py)
from app.services import editions as svc

public_router = APIRouter(prefix="/districts", tags=["District paper"])
admin_router = APIRouter(prefix="/admin/editions", tags=["District paper (maintainer)"])
_CODE = {d["name"]: d["code"] for d in AP_DISTRICTS}


def _district(slug: str) -> str:
    name = normalise_district(slug)
    if name not in DISTRICT_NAMES or (slug != _CODE[name] and slug != name):
        raise HTTPException(status_code=404, detail="No district has this slug")
    return name


def _refused(e: svc.EditionError) -> HTTPException:
    return HTTPException(status_code=409, detail={"code": e.code, "detail": e.detail})


# ---------------------------------------------------------------- public

def _published(name: str):
    return select(E).where(E.district == name, E.status == "published")


@public_router.get("/{slug}/editions")
async def list_editions(slug: str, db: AsyncSession = Depends(get_db)):
    name = _district(slug)
    rows = (await db.execute(_published(name).order_by(E.number.desc()))).scalars().all()
    return {"district": name, "slug": _CODE[name], "editions": [
        {"number": r.number, "published_at": r.published_at.isoformat(), "stories": len(r.content.get("lead") or []),
         "audio": r.audio_status == "ready"} for r in rows]}


@public_router.get("/{slug}/editions/latest")
async def latest_edition(slug: str, db: AsyncSession = Depends(get_db)):
    name = _district(slug)
    ed = (await db.execute(_published(name).order_by(E.number.desc()).limit(1))).scalar_one_or_none()
    if not ed:
        raise HTTPException(status_code=404, detail="no_edition_yet")
    return svc.public(ed)


@public_router.get("/{slug}/editions/{number}")
async def one_edition(slug: str, number: int, db: AsyncSession = Depends(get_db)):
    name = _district(slug)
    ed = (await db.execute(_published(name).where(E.number == number))).scalar_one_or_none()
    if not ed:
        raise HTTPException(status_code=404, detail="no_such_edition")
    return svc.public(ed)


# ---------------------------------------------------------------- maintainer

class DraftIn(BaseModel):
    district: str = Field(..., description="Slug or exact name")
    content: dict
    written_by: str = Field(..., min_length=2, max_length=120)
    note: Optional[str] = Field(None, max_length=2000)


class ApproveIn(BaseModel):
    note: Optional[str] = Field(None, max_length=2000)
    checked_raw_files: bool = Field(False, description="A person read the raw files the gate could not")


class NoteIn(BaseModel):
    note: Optional[str] = Field(None, max_length=2000)


class AudioIn(BaseModel):
    url: Optional[str] = Field(None, max_length=1000)
    failed: bool = False


async def _get(db: AsyncSession, edition_id: int) -> E:
    ed = await db.get(E, edition_id)
    if not ed:
        raise HTTPException(status_code=404, detail="no_such_edition")
    return ed


@admin_router.post("", status_code=201)
async def create(body: DraftIn, x_admin_key: Optional[str] = Header(None), db: AsyncSession = Depends(get_db)):
    _require_admin(x_admin_key)
    try:
        ed = await svc.create_draft(db, _district(body.district), body.content, body.written_by, body.note)
    except svc.EditionError as e:
        raise _refused(e)
    await db.commit()
    return svc.admin(ed)


@admin_router.get("")
async def list_admin(status: Optional[str] = Query(None), x_admin_key: Optional[str] = Header(None), db: AsyncSession = Depends(get_db)):
    _require_admin(x_admin_key)
    stmt = select(E).order_by(E.created_at.desc(), E.id.desc()).limit(200)
    if status:
        if status not in STATUSES:
            raise HTTPException(status_code=422, detail=f"status must be one of {', '.join(STATUSES)}")
        stmt = stmt.where(E.status == status)
    return [svc.admin(r) for r in (await db.execute(stmt)).scalars().all()]


@admin_router.get("/{edition_id}")
async def get_admin(edition_id: int, x_admin_key: Optional[str] = Header(None), db: AsyncSession = Depends(get_db)):
    _require_admin(x_admin_key)
    return svc.admin(await _get(db, edition_id))


async def _act(db: AsyncSession, edition_id: int, fn, *args):
    ed = await _get(db, edition_id)
    try:
        await fn(db, ed, *args)
    except svc.EditionError as e:
        await db.rollback()
        raise _refused(e)
    await db.commit()
    return svc.admin(ed)


@admin_router.post("/{edition_id}/approve")
async def approve(edition_id: int, body: ApproveIn, x_admin_key: Optional[str] = Header(None), db: AsyncSession = Depends(get_db)):
    _require_admin(x_admin_key)
    return await _act(db, edition_id, svc.approve, body.note, body.checked_raw_files)


@admin_router.post("/{edition_id}/publish")
async def publish(edition_id: int, x_admin_key: Optional[str] = Header(None), db: AsyncSession = Depends(get_db)):
    _require_admin(x_admin_key)
    return await _act(db, edition_id, svc.publish)


@admin_router.post("/{edition_id}/reject")
async def reject(edition_id: int, body: NoteIn, x_admin_key: Optional[str] = Header(None), db: AsyncSession = Depends(get_db)):
    _require_admin(x_admin_key)
    return await _act(db, edition_id, svc.reject, body.note)


@admin_router.post("/{edition_id}/audio")
async def audio(edition_id: int, body: AudioIn, x_admin_key: Optional[str] = Header(None), db: AsyncSession = Depends(get_db)):
    _require_admin(x_admin_key)
    if not body.failed and not (body.url or "").startswith("https://"):
        raise HTTPException(status_code=422, detail="audio url must be https")
    return await _act(db, edition_id, svc.set_audio, body.url, body.failed)
