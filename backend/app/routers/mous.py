"""MoU API — investment MoUs signed by AP government.

Same contract as the other list APIs: every filter the frontend renders is
handled server-side here, filter options come from the enums/data rather
than frontend hardcoding, and provenance travels with every row.
"""

import json
import os
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import asc, case, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants.districts import AP_DISTRICTS, normalise_district
from app.constants.tenures import TENURES, tenure_by_key
from app.database import get_db
from app.models.mou import MOU, MOUStatus, MOUSector
from app.schemas.common import PaginatedResponse
from app.schemas.mou import MOUOut, MOUListOut
from app.services.cache import cache_response

router = APIRouter(prefix="/mous", tags=["MoUs & Investments"])

_SUMMITS_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "seed", "summits_seed.json",
)
_summits_cache: dict | None = None


def _load_summits() -> dict:
    global _summits_cache
    if _summits_cache is None:
        with open(_SUMMITS_PATH, encoding="utf-8") as f:
            _summits_cache = json.load(f)
    return _summits_cache

SortField = Literal["investment", "jobs", "signed", "company"]

_SORT_COLUMNS = {
    "investment": MOU.investment_crore,
    "jobs": MOU.expected_employment,
    "signed": MOU.signed_date,
    "company": MOU.company_name,
}


@router.get("/", response_model=PaginatedResponse[MOUListOut])
@cache_response(ttl=600)
async def list_mous(
    q: Optional[str] = Query(None, max_length=200, description="Search company, title, summit"),
    sector: Optional[MOUSector] = Query(None),
    status: Optional[MOUStatus] = Query(None),
    district: Optional[str] = Query(None),
    is_foreign: Optional[bool] = Query(None, description="Filter foreign investments only"),
    min_investment: Optional[float] = Query(None, description="Minimum investment in Crore INR"),
    tenure: Optional[str] = Query(None, description="Government tenure key (tdp1/ysrcp/tdp2): MoUs whose recorded signing date falls inside that tenure"),
    year: Optional[int] = Query(None, ge=1990, le=2100, description="Calendar year of the recorded signing date"),
    undated: Optional[bool] = Query(None, description="True returns only records that publish no signing date"),
    sort: SortField = Query("investment"),
    order: Literal["asc", "desc"] = Query("desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(MOU)
    if q:
        term = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                MOU.company_name.ilike(term),
                MOU.title.ilike(term),
                MOU.description.ilike(term),
                MOU.summit_name.ilike(term),
                MOU.company_origin.ilike(term),
            )
        )
    if sector:
        stmt = stmt.where(MOU.sector == sector)
    if status:
        stmt = stmt.where(MOU.status == status)
    if district:
        canonical = normalise_district(district)
        stmt = stmt.where(MOU.district == canonical) if canonical else stmt.where(
            MOU.district.ilike(f"%{district}%")
        )
    if is_foreign is not None:
        stmt = stmt.where(MOU.is_foreign_investment == is_foreign)
    if min_investment is not None:
        stmt = stmt.where(MOU.investment_crore >= min_investment)
    if tenure:
        t = tenure_by_key(tenure)
        if t:
            stmt = stmt.where(MOU.signed_date >= t["from"], MOU.signed_date <= t["to"])
    if year is not None:
        stmt = stmt.where(func.extract("year", MOU.signed_date) == year)
    if undated is True:
        stmt = stmt.where(MOU.signed_date.is_(None))
    elif undated is False:
        stmt = stmt.where(MOU.signed_date.is_not(None))

    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()

    direction = asc if order == "asc" else desc
    sort_col = _SORT_COLUMNS[sort]
    stmt = stmt.order_by(
        case((sort_col.is_(None), 1), else_=0),  # NULLs always last
        direction(sort_col),
        MOU.id.desc(),
    ).offset((page - 1) * page_size).limit(page_size)

    mous = (await db.execute(stmt)).scalars().all()

    return PaginatedResponse.build(
        items=[MOUListOut.model_validate(m) for m in mous],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/filters")
@cache_response(ttl=600)
async def get_mou_filters(db: AsyncSession = Depends(get_db)):
    """Filter options for the Investments page — enums plus the districts list."""
    summit_rows = await db.execute(
        select(MOU.summit_name)
        .where(MOU.summit_name.is_not(None))
        .distinct()
        .order_by(MOU.summit_name)
    )
    year_rows = await db.execute(
        select(
            func.extract("year", MOU.signed_date).label("y"),
            func.count().label("n"),
        )
        .where(MOU.signed_date.is_not(None))
        .group_by("y")
        .order_by(desc("y"))
    )
    undated_count = (
        await db.execute(
            select(func.count()).select_from(MOU).where(MOU.signed_date.is_(None))
        )
    ).scalar_one()

    return {
        "sectors": [
            {"value": s.value, "label": s.value.replace("_", " ").title()} for s in MOUSector
        ],
        "statuses": [
            {"value": s.value, "label": s.value.replace("_", " ").title()} for s in MOUStatus
        ],
        "districts": AP_DISTRICTS,
        "summits": [row for (row,) in summit_rows.all()],
        "years": [{"value": int(y), "count": n} for y, n in year_rows.all()],
        "undated_count": undated_count,
        "undated_note": (
            "Some commitments are on the public record without a signing date. They cannot "
            "belong to a year or to a government tenure, so every year filter leaves them out. "
            "Use the no date on record option to see them."
        ),
        "sort_options": [
            {"value": "investment", "label": "Investment size"},
            {"value": "jobs", "label": "Expected jobs"},
            {"value": "signed", "label": "Date signed"},
            {"value": "company", "label": "Company (A–Z)"},
        ],
    }


@router.get("/insights")
@cache_response(ttl=600)
async def get_mou_insights(
    tenure: Optional[str] = Query(None, description="Limit every breakdown to MoUs signed in this government's tenure"),
    db: AsyncSession = Depends(get_db),
):
    """
    The top-of-page picture for investments: where the promised money is by
    sector, what happened to the commitments (signed / started / operational
    / stalled / cancelled), and which districts were promised the most.
    Every figure is the announcements' own — an MoU is a promise, not spending.
    """
    t = tenure_by_key(tenure) if tenure else None
    scope = []
    if t:
        scope = [MOU.signed_date >= t["from"], MOU.signed_date <= t["to"]]

    def scoped(stmt):
        return stmt.where(*scope) if scope else stmt

    sector_rows = (await db.execute(scoped(
        select(MOU.sector, func.count(MOU.id),
               func.coalesce(func.sum(MOU.investment_crore), 0),
               func.coalesce(func.sum(MOU.expected_employment), 0))
        ).group_by(MOU.sector)
        .order_by(func.coalesce(func.sum(MOU.investment_crore), 0).desc())
    )).all()

    status_rows = (await db.execute(scoped(
        select(MOU.status, func.count(MOU.id),
               func.coalesce(func.sum(MOU.investment_crore), 0))
        ).group_by(MOU.status)
    )).all()

    district_rows = (await db.execute(scoped(
        select(MOU.district, func.count(MOU.id),
               func.coalesce(func.sum(MOU.investment_crore), 0))
        .where(MOU.district.is_not(None))
        ).group_by(MOU.district)
    )).all()

    year_rows = (await db.execute(scoped(
        select(func.extract("year", MOU.signed_date).label("yr"), func.count(MOU.id),
               func.coalesce(func.sum(MOU.investment_crore), 0))
        .where(MOU.signed_date.is_not(None))
        ).group_by("yr").order_by("yr")
    )).all()

    by_district: dict[str, dict] = {}
    for name, count, cost in district_rows:
        canon = normalise_district(name)
        if not canon:
            continue
        d = by_district.setdefault(canon, {"district": canon, "count": 0, "investment_crore": 0.0})
        d["count"] += count
        d["investment_crore"] += float(cost or 0)
    districts = sorted(by_district.values(), key=lambda d: d["investment_crore"], reverse=True)

    foreign = (await db.execute(scoped(
        select(func.count(MOU.id), func.coalesce(func.sum(MOU.investment_crore), 0))
        .where(MOU.is_foreign_investment == True)  # noqa: E712
    ))).one()
    total = (await db.execute(scoped(select(func.count(MOU.id))))).scalar_one()
    no_district = (await db.execute(scoped(
        select(func.count(MOU.id)).where(MOU.district.is_(None))
    ))).scalar_one()

    return {
        "by_sector": [
            {"sector": s.value if hasattr(s, "value") else str(s), "count": c,
             "investment_crore": round(float(v or 0), 2), "jobs": int(j or 0)}
            for s, c, v, j in sector_rows
        ],
        "by_status": [
            {"status": s.value if hasattr(s, "value") else str(s), "count": c,
             "investment_crore": round(float(v or 0), 2)}
            for s, c, v in status_rows
        ],
        "by_district": [
            {**d, "investment_crore": round(d["investment_crore"], 2)} for d in districts
        ],
        "by_year": [
            {"year": int(y), "count": c, "investment_crore": round(float(v or 0), 2)}
            for y, c, v in year_rows
        ],
        "tenure": ({"key": t["key"], "party": t["party"], "cm": t["cm"], "label": t["label"],
                    "from": t["from"].date().isoformat(),
                    "to": None if t["to"].year >= 2099 else t["to"].date().isoformat()}
                   if t else None),
        "foreign_count": foreign[0] or 0,
        "foreign_crore": round(float(foreign[1] or 0), 2),
        "no_district_count": no_district or 0,
        "total": total or 0,
        "method_note": (
            "Counted from the MoU records. Amounts and job figures are the announcements' own "
            "numbers — a signed MoU is a promise on paper, not money spent or jobs created."
        ),
    }


@router.get("/by-tenure")
@cache_response(ttl=600)
async def get_mous_by_tenure(db: AsyncSession = Depends(get_db)):
    """
    Investment MoUs sliced by government tenure, strictly by the signing
    date on each record. Committed amounts are the announcements' own
    figures — promises, not audited money — and an MoU without a recorded
    signing date is counted as unattributed, never guessed.
    """
    out = []
    for t in TENURES:
        row = (await db.execute(
            select(
                func.count(MOU.id).filter(
                    MOU.signed_date >= t["from"], MOU.signed_date <= t["to"]
                ).label("signed"),
                func.coalesce(func.sum(MOU.investment_crore).filter(
                    MOU.signed_date >= t["from"], MOU.signed_date <= t["to"]
                ), 0).label("investment"),
                func.coalesce(func.sum(MOU.expected_employment).filter(
                    MOU.signed_date >= t["from"], MOU.signed_date <= t["to"]
                ), 0).label("jobs"),
                func.count(MOU.id).filter(
                    MOU.signed_date >= t["from"], MOU.signed_date <= t["to"],
                    MOU.status == MOUStatus.OPERATIONAL,
                ).label("operational"),
                func.count(MOU.id).filter(
                    MOU.signed_date >= t["from"], MOU.signed_date <= t["to"],
                    MOU.expected_employment.is_not(None),
                ).label("with_jobs"),
                func.count(MOU.id).filter(
                    MOU.signed_date >= t["from"], MOU.signed_date <= t["to"],
                    MOU.investment_crore.is_not(None),
                ).label("with_investment"),
            )
        )).one()
        out.append({
            "key": t["key"], "party": t["party"], "cm": t["cm"], "label": t["label"],
            "from": t["from"].date().isoformat(),
            "to": None if t["to"].year >= 2099 else t["to"].date().isoformat(),
            "signed_count": row.signed or 0,
            "investment_crore": round(row.investment or 0, 2),
            "expected_jobs": row.jobs or 0,
            "operational_count": row.operational or 0,
            # Coverage: how many of this tenure's records actually state a
            # figure. Without these, a total reads as a complete tally when it
            # is only the sum of the records that happen to publish a number.
            "with_jobs_count": row.with_jobs or 0,
            "with_investment_count": row.with_investment or 0,
        })

    undated = (await db.execute(
        select(func.count(MOU.id)).where(MOU.signed_date.is_(None))
    )).scalar_one()

    return {
        "tenures": out,
        "unattributed_count": undated or 0,
        "method_note": (
            "Counted by the signing date on each MoU record. Committed amounts are the announcements' "
            "own figures: an MoU is a promise, not money spent. Records without a signing date are "
            "listed as unattributed."
        ),
        "coverage_note": (
            "These totals cover only the MoUs in our register, and only those that publish a figure. "
            "Andhra Pradesh's investment summits announced far more commitments than we have documented "
            "so far, and many published announcements name no jobs figure at all. Read every total here "
            "as a floor built from documented records, never as the state's full investment tally."
        ),
    }


@router.get("/summits")
@cache_response(ttl=900)
async def get_summits(db: AsyncSession = Depends(get_db)):
    """Investment summits since bifurcation, and what the state published about
    how much of it reached the ground.

    Two very different kinds of number live here and they are kept apart on
    purpose. The summit totals and the grounded figures are transcribed from
    government documents, quoted, and each carries the URL it came from. The
    register counts are our own documented records, which are a small floor
    under the state's totals, never a rival estimate of them.
    """
    data = _load_summits()

    register = {}
    rows = (
        await db.execute(
            select(
                func.extract("year", MOU.signed_date).label("y"),
                func.count().label("n"),
                func.sum(MOU.investment_crore).label("crore"),
            )
            .where(MOU.signed_date.is_not(None))
            .group_by("y")
        )
    ).all()
    by_year = {int(y): {"count": n, "investment_crore": float(c or 0)} for y, n, c in rows}

    for s in data["summits"]:
        yr = int(s["start_date"][:4])
        window = by_year.get(yr, {"count": 0, "investment_crore": 0.0})
        register[s["key"]] = {
            "documented_in_same_year": window["count"],
            "documented_investment_crore": window["investment_crore"],
        }

    grounded_totals = {}
    for t in TENURES:
        rows_t = [r for r in data["grounded_by_year"] if r["tenure"] == t["key"]]
        published = [r for r in rows_t if r["investment_crore"] is not None]
        grounded_totals[t["key"]] = {
            "years_covered": len(rows_t),
            "years_published": len(published),
            "sum_published_crore": round(sum(r["investment_crore"] for r in published), 2),
            "sum_published_employment": sum(
                r["employment"] for r in published if r["employment"] is not None
            ),
            "comparable": False,
            "why_not_comparable": (
                "The published years do not use the same definition or the same reporting "
                "period, and the unpublished years are simply blank. A sum across them is a "
                "sum of unlike things. We show it only so you can see how little was published."
            ),
        }

    summit_totals = {}
    for t in TENURES:
        ss = [x for x in data["summits"] if x["tenure"] == t["key"]]
        summit_totals[t["key"]] = {
            "summits": len(ss),
            "mou_count": sum(x["mou_count"] for x in ss if x["mou_count"]),
            "investment_crore": sum(x["investment_crore"] for x in ss if x["investment_crore"]),
            "jobs": sum(x["jobs"] for x in ss if x["jobs"]),
        }

    return {
        "summits": data["summits"],
        "not_a_summit": data["not_a_summit"],
        "definition_warning": data["definition_warning"],
        "grounded_by_year": data["grounded_by_year"],
        "gap_statements": data["gap_statements"],
        "cross_tenure": data["cross_tenure"],
        "by_tenure": {
            t["key"]: {
                "label": t["label"],
                "party": t.get("party"),
                "from": t["from"].date().isoformat(),
                "to": t["to"].date().isoformat(),
                "announced": summit_totals[t["key"]],
                "grounded": grounded_totals[t["key"]],
            }
            for t in TENURES
        },
        "register_overlay": register,
        "register_note": (
            "The register counts below each summit are the commitments we have documented "
            "ourselves with a signing date in that calendar year. They are not the summit's "
            "MoUs. Our register is a floor, and a low one: the state counted its 2025 summit "
            "in the hundreds of agreements and we hold a few dozen records in total."
        ),
    }


@router.get("/stats")
@cache_response(ttl=600)
async def get_mou_stats(db: AsyncSession = Depends(get_db)):
    """
    Total investment stats — and what those totals are actually made of.

    WHY THE BREAKDOWN IS NOT OPTIONAL
    Every MoU card on the page already carries a source-tier badge, because a
    commitment recorded in a G.O. and a commitment a newspaper attributed to a
    minister are not the same kind of fact. The headline total had no such
    label: it summed all of them into one number. On the current register that
    number is about 2 per cent government-recorded and about 59 per cent
    press-reported, and nothing on the page said so.

    So the total still comes back — people look for it, and "what has been
    announced" is a real thing to count — but it never travels without its
    composition. A reader who sees the big figure sees, in the same breath,
    how much of it the government itself has ever written down.
    """
    result = await db.execute(
        select(
            func.count(MOU.id).label("total_mous"),
            func.sum(MOU.investment_crore).label("total_investment_crore"),
            func.sum(MOU.expected_employment).label("total_expected_jobs"),
            func.count(MOU.id).filter(MOU.is_foreign_investment == True).label("foreign_mous"),
        )
    )
    row = result.one()

    tiers = await db.execute(
        select(
            MOU.source_tier,
            func.count(MOU.id).label("mous"),
            func.sum(MOU.investment_crore).label("investment_crore"),
        ).group_by(MOU.source_tier)
    )
    by_tier = {
        "government": {"mous": 0, "investment_crore": 0.0},
        "company": {"mous": 0, "investment_crore": 0.0},
        "press": {"mous": 0, "investment_crore": 0.0},
        "unlabelled": {"mous": 0, "investment_crore": 0.0},
    }
    for tier, mous, crore in tiers:
        key = tier if tier in by_tier else "unlabelled"
        by_tier[key]["mous"] += mous or 0
        by_tier[key]["investment_crore"] = round(
            by_tier[key]["investment_crore"] + (crore or 0), 2
        )

    total = round(row.total_investment_crore or 0, 2)
    for key, block in by_tier.items():
        block["share_pct"] = round(100 * block["investment_crore"] / total, 1) if total else 0.0

    return {
        "total_mous": row.total_mous or 0,
        "total_investment_crore": total,
        "total_expected_jobs": row.total_expected_jobs or 0,
        "foreign_investments": row.foreign_mous or 0,
        "by_source_tier": by_tier,
        "provenance_note": (
            "This total is what has been announced, not what the government has recorded. "
            "Each figure below is the part of it that comes from that kind of source."
        ),
    }


@router.get("/{mou_id}", response_model=MOUOut)
@cache_response(ttl=3600)
async def get_mou(mou_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MOU).where(MOU.id == mou_id))
    mou = result.scalar_one_or_none()
    if not mou:
        raise HTTPException(status_code=404, detail="MOU not found")
    return MOUOut.model_validate(mou)
