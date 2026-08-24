"""Tenders API — browse active and historical government tenders."""

from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.tender import Tender, TenderStatus, TenderType
from app.schemas.common import PaginatedResponse
from app.schemas.tender import TenderOut, TenderListOut
from app.services.cache import cache_response

router = APIRouter(prefix="/tenders", tags=["Tenders"])


@router.get("/", response_model=PaginatedResponse[TenderListOut])
@cache_response(ttl=180)  # 3 min cache — tenders change frequently
async def list_tenders(
    district: Optional[str] = Query(None),
    tender_type: Optional[TenderType] = Query(None),
    status: Optional[TenderStatus] = Query(TenderStatus.ACTIVE),
    department: Optional[str] = Query(None),
    min_value: Optional[float] = Query(None, description="Min estimated value in INR"),
    max_value: Optional[float] = Query(None, description="Max estimated value in INR"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List tenders with filters. Defaults to active tenders only."""
    stmt = select(Tender)

    if district:
        stmt = stmt.where(Tender.district.ilike(f"%{district}%"))
    if tender_type:
        stmt = stmt.where(Tender.tender_type == tender_type)
    if status:
        stmt = stmt.where(Tender.status == status)
    if department:
        stmt = stmt.where(Tender.department.ilike(f"%{department}%"))
    if min_value is not None:
        stmt = stmt.where(Tender.estimated_value >= min_value)
    if max_value is not None:
        stmt = stmt.where(Tender.estimated_value <= max_value)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar_one()

    stmt = stmt.order_by(Tender.bid_submission_end.asc(), Tender.created_at.desc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    tenders = result.scalars().all()

    return PaginatedResponse.build(
        items=[TenderListOut.model_validate(t) for t in tenders],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/closing-soon", response_model=list[TenderListOut])
@cache_response(ttl=300)
async def tenders_closing_soon(
    days: int = Query(7, ge=1, le=30, description="Tenders closing within this many days"),
    db: AsyncSession = Depends(get_db),
):
    """Get tenders whose bid submission deadline is within N days."""
    from datetime import datetime, timedelta, timezone
    deadline = datetime.now(timezone.utc) + timedelta(days=days)
    now = datetime.now(timezone.utc)

    result = await db.execute(
        select(Tender)
        .where(
            Tender.status == TenderStatus.ACTIVE,
            Tender.bid_submission_end >= now,
            Tender.bid_submission_end <= deadline,
        )
        .order_by(Tender.bid_submission_end.asc())
        .limit(50)
    )
    return [TenderListOut.model_validate(t) for t in result.scalars().all()]


@router.get("/{tender_id}", response_model=TenderOut)
@cache_response(ttl=600)
async def get_tender(tender_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Tender).where(Tender.id == tender_id))
    tender = result.scalar_one_or_none()
    if not tender:
        raise HTTPException(status_code=404, detail="Tender not found")
    return TenderOut.model_validate(tender)
