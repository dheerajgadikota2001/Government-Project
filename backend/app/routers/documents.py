"""Documents API — government documents with on-demand Telugu translation."""

from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.document import Document, DocumentType, DocumentTranslationStatus
from app.schemas.common import PaginatedResponse
from app.schemas.document import DocumentOut, DocumentListOut
from app.services.cache import cache_response
from app.tasks.translation_tasks import translate_document_task

router = APIRouter(prefix="/documents", tags=["Documents"])


@router.get("/", response_model=PaginatedResponse[DocumentListOut])
@cache_response(ttl=600)
async def list_documents(
    document_type: Optional[DocumentType] = Query(None),
    year: Optional[int] = Query(None),
    department: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Document)
    if document_type:
        stmt = stmt.where(Document.document_type == document_type)
    if year:
        stmt = stmt.where(Document.year == year)
    if department:
        stmt = stmt.where(Document.department.ilike(f"%{department}%"))

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar_one()

    stmt = stmt.order_by(Document.published_date.desc(), Document.created_at.desc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    docs = result.scalars().all()

    return PaginatedResponse.build(
        items=[DocumentListOut.model_validate(d) for d in docs],
        total=total,
        page=page,
        page_size=page_size,
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
