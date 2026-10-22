"""Tenders API — browse active and historical government tenders."""

from datetime import timedelta
from typing import Optional
from zoneinfo import ZoneInfo
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

    # The id ends the sort, so tenders closing the same day keep one order from page to page.
    stmt = stmt.order_by(Tender.bid_submission_end.asc(), Tender.created_at.desc(), Tender.id.desc())
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


@router.get("/register/summary")
@cache_response(ttl=300)
async def register_summary(db: AsyncSession = Depends(get_db)):
    """
    What the tender register actually holds, so the page can state its own
    coverage instead of implying it covers Andhra Pradesh.

    Returns the count per status (the Active/Expired tabs read their own
    numbers from here rather than paging to find out), the portals those rows
    came from, and the date range on record. Nothing is estimated: every
    number is a row count.
    """
    by_status = {s.value: 0 for s in TenderStatus}
    rows = await db.execute(
        select(Tender.status, func.count()).group_by(Tender.status)
    )
    for status, n in rows.all():
        by_status[status.value if hasattr(status, "value") else str(status)] = n

    portals = await db.execute(
        select(
            Tender.source_portal,
            func.count(),
            func.count().filter(Tender.status == TenderStatus.ACTIVE),
        )
        .group_by(Tender.source_portal)
        .order_by(func.count().desc())
    )
    portal_rows = [
        {"portal": p or "unattributed", "total": int(n or 0), "active": int(a or 0)}
        for p, n, a in portals.all()
    ]

    span = (await db.execute(
        select(func.min(Tender.published_date), func.max(Tender.published_date))
    )).one()

    # Open means the last day to bid has not passed, in India time. The portal's
    # own "active" flag can lag behind the date, so the date decides; the site's
    # pages use the same rule. Counting here means Home can say how many are open
    # without downloading the whole register.
    today, start = _ist_today()
    open_today = (await db.execute(
        select(func.count()).where(Tender.bid_submission_end >= start)
    )).scalar_one()

    # How many close on each of the next seven India days, today included.
    ist_day = func.date(func.timezone(IST_NAME, Tender.bid_submission_end))
    week = await db.execute(
        select(ist_day, func.count())
        .where(Tender.bid_submission_end >= start, Tender.bid_submission_end < start + timedelta(days=7))
        .group_by(ist_day)
        .order_by(ist_day)
    )

    return {
        "total": sum(by_status.values()),
        "by_status": by_status,
        "portals": portal_rows,
        "earliest_published": span[0],
        "latest_published": span[1],
        "read_on": today.isoformat(),
        "open_today": int(open_today or 0),
        "closing_next_7_days": [{"day": d.isoformat(), "count": int(n)} for d, n in week.all()],
    }


IST_NAME = "Asia/Kolkata"


def _ist_today():
    """Today's date in India, and the moment it began, as an aware UTC datetime."""
    from datetime import datetime, timezone as tz
    ist = ZoneInfo(IST_NAME)
    today = datetime.now(ist).date()
    start = datetime(today.year, today.month, today.day, tzinfo=ist).astimezone(tz.utc)
    return today, start
