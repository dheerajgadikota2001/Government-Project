"""Documents API — government documents with on-demand Telugu translation.

Filter options and stats come from the database itself, never from
hardcoded lists — so the frontend's dropdowns can only ever offer values
that actually exist in the data.
"""

from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.document import Document, DocumentType, DocumentTranslationStatus
from app.schemas.common import PaginatedResponse
from app.schemas.document import (
    DocumentOut,
    DocumentListOut,
    DocumentStatsOut,
    DocumentFiltersOut,
)
from app.services.cache import cache_response
from app.tasks.translation_tasks import translate_document_task

router = APIRouter(prefix="/documents", tags=["Documents"])

SORTABLE = {
    "date": Document.published_date,
    "title": Document.title,
    "year": Document.year,
    "retrieved": Document.retrieved_at,
}


import json as _json
import os as _os

_LIB_PATH = _os.path.join(
    _os.path.dirname(_os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))),
    "seed", "document_library_seed.json",
)
_lib_cache: dict | None = None


def _load_library() -> dict:
    global _lib_cache
    if _lib_cache is None:
        with open(_LIB_PATH, encoding="utf-8") as f:
            _lib_cache = _json.load(f)
    return _lib_cache


@router.get("/library")
@cache_response(ttl=600)
async def get_document_library():
    """The full document library: every official series the platform draws on.

    Served verbatim from the seed. Filtering happens client-side — the library
    is small enough, and the reader gets instant filters with no round trips.
    """
    return _load_library()


@router.get("/", response_model=PaginatedResponse[DocumentListOut])
@cache_response(ttl=600)
async def list_documents(
    q: Optional[str] = Query(None, max_length=200, description="Search in title / reference number"),
    document_type: Optional[DocumentType] = Query(None),
    year: Optional[int] = Query(None),
    department: Optional[str] = Query(None),
    source_portal: Optional[str] = Query(None),
    sort: str = Query("date", pattern="^(date|title|year|retrieved)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Document)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            Document.title.ilike(like)
            | Document.reference_number.ilike(like)
            | Document.description.ilike(like)
        )
    if document_type:
        stmt = stmt.where(Document.document_type == document_type)
    if year:
        stmt = stmt.where(Document.year == year)
    if department:
        stmt = stmt.where(Document.department.ilike(f"%{department}%"))
    if source_portal:
        stmt = stmt.where(Document.source_portal == source_portal)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar_one()

    col = SORTABLE[sort]
    ordered = col.asc().nulls_last() if order == "asc" else col.desc().nulls_last()
    stmt = stmt.order_by(ordered, Document.created_at.desc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    docs = result.scalars().all()

    return PaginatedResponse.build(
        items=[DocumentListOut.model_validate(d) for d in docs],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/stats", response_model=DocumentStatsOut)
@cache_response(ttl=600)
async def get_document_stats(db: AsyncSession = Depends(get_db)):
    """Live counts straight from the documents table."""
    total = (await db.execute(select(func.count()).select_from(Document))).scalar_one()
    rows = (
        await db.execute(
            select(Document.document_type, func.count()).group_by(Document.document_type)
        )
    ).all()
    return DocumentStatsOut(
        total=total,
        by_type={dt.value: count for dt, count in rows},
    )


@router.get("/filters", response_model=DocumentFiltersOut)
@cache_response(ttl=600)
async def get_document_filters(db: AsyncSession = Depends(get_db)):
    """Distinct filter values present in the data right now."""
    types = (
        (await db.execute(select(Document.document_type).distinct())).scalars().all()
    )
    years = (
        (
            await db.execute(
                select(Document.year)
                .where(Document.year.is_not(None))
                .distinct()
                .order_by(Document.year.desc())
            )
        )
        .scalars()
        .all()
    )
    departments = (
        (
            await db.execute(
                select(Document.department)
                .where(Document.department.is_not(None))
                .distinct()
                .order_by(Document.department)
            )
        )
        .scalars()
        .all()
    )
    portals = (
        (
            await db.execute(
                select(Document.source_portal).distinct().order_by(Document.source_portal)
            )
        )
        .scalars()
        .all()
    )
    return DocumentFiltersOut(
        document_types=[t.value for t in types],
        years=list(years),
        departments=list(departments),
        source_portals=list(portals),
    )


@router.get("/{doc_id}", response_model=DocumentOut)
@cache_response(ttl=3600)
async def get_document(doc_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return DocumentOut.model_validate(doc)


@router.post("/{doc_id}/translate")
async def request_translation(doc_id: int, db: AsyncSession = Depends(get_db)):
    """
    Request Telugu translation for a document.
    Translation runs async in the background via Celery.
    Poll GET /{doc_id} to check translation_status.
    """
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.translation_status == DocumentTranslationStatus.COMPLETED:
        return {"message": "Already translated", "status": "completed"}

    if doc.translation_status == DocumentTranslationStatus.IN_PROGRESS:
        return {"message": "Translation in progress", "status": "in_progress"}

    # Kick off async translation job
    translate_document_task.delay(doc_id)

    return {"message": "Translation queued", "status": "pending", "doc_id": doc_id}
