"""MoU API — investment MoUs signed by AP government."""

from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.mou import MOU, MOUStatus, MOUSector
from app.schemas.common import PaginatedResponse
from app.schemas.mou import MOUOut, MOUListOut
from app.services.cache import cache_response

router = APIRouter(prefix="/mous", tags=["MoUs & Investments"])


@router.get("/", response_model=PaginatedResponse[MOUListOut])
@cache_response(ttl=600)
async def list_mous(
    sector: Optional[MOUSector] = Query(None),
    status: Optional[MOUStatus] = Query(None),
    district: Optional[str] = Query(None),
    is_foreign: Optional[bool] = Query(None, description="Filter foreign investments only"),
    min_investment: Optional[float] = Query(None, description="Minimum investment in Crore INR"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(MOU)
    if sector:
        stmt = stmt.where(MOU.sector == sector)
    if status:
        stmt = stmt.where(MOU.status == status)
    if district:
        stmt = stmt.where(MOU.district.ilike(f"%{district}%"))
    if is_foreign is not None:
        stmt = stmt.where(MOU.is_foreign_investment == is_foreign)
    if min_investment is not None:
        stmt = stmt.where(MOU.investment_crore >= min_investment)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar_one()

    stmt = stmt.order_by(MOU.signed_date.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    mous = result.scalars().all()

    return PaginatedResponse.build(
        items=[MOUListOut.model_validate(m) for m in mous],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/stats")
@cache_response(ttl=600)
async def get_mou_stats(db: AsyncSession = Depends(get_db)):
    """Total investment stats — great for dashboard summary cards."""
    result = await db.execute(
        select(
            func.count(MOU.id).label("total_mous"),
            func.sum(MOU.investment_crore).label("total_investment_crore"),
            func.sum(MOU.expected_employment).label("total_expected_jobs"),
            func.count(MOU.id).filter(MOU.is_foreign_investment == True).label("foreign_mous"),
        )
    )
    row = result.one()
    return {
        "total_mous": row.total_mous or 0,
        "total_investment_crore": round(row.total_investment_crore or 0, 2),
        "total_expected_jobs": row.total_expected_jobs or 0,
        "foreign_investments": row.foreign_mous or 0,
    }


@router.get("/{mou_id}", response_model=MOUOut)
@cache_response(ttl=3600)
async def get_mou(mou_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MOU).where(MOU.id == mou_id))
    mou = result.scalar_one_or_none()
    if not mou:
        raise HTTPException(status_code=404, detail="MOU not found")
    return MOUOut.model_validate(mou)
