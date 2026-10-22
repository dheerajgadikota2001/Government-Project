"""
What is happening in each district: the feed the district paper is built from.

Two reads, both plain selects from district_happenings:

    GET /api/v1/districts/{slug}/happenings     one district, newest first
    GET /api/v1/districts/happenings/summary    all 28 districts, counted

Nothing is computed beyond counting rows. A personal list (merit, selection,
seniority, provisional or rejected list, speaking order) comes back as its title,
date and link and nothing more, whatever the row holds; the table already keeps
those rows bare, and this response shape says so a second time, because a
response that grows a field later must not grow it for these rows.

"thin" in the summary means the collectorate site itself posted three or fewer
notices in the window. The paper uses it to say plainly that a district's
edition leans on PIB and Parliament, rather than letting a short page look like
a quiet district.
"""

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants.districts import AP_DISTRICTS, DISTRICT_NAMES, normalise_district
from app.database import get_db
from app.models.district_happening import SOURCE_KINDS
from app.models.district_happening import DistrictHappening as H

router = APIRouter(prefix="/districts", tags=["District happenings"])

DEFAULT_WINDOW_DAYS = 112      # about the four months the October 2026 gathering covered
MAX_LIMIT = 500
THIN_AT_OR_BELOW = 3
_CODE = {d["name"]: d["code"] for d in AP_DISTRICTS}


def _since(since: date | None) -> date:
    return since or (date.today() - timedelta(days=DEFAULT_WINDOW_DAYS))


def _item(r: H) -> dict:
    base = {"id": r.id, "source_kind": r.source_kind, "category": r.category, "title": r.title,
            "date": r.date.isoformat(), "url": r.url, "personal_list": r.personal_list}
    if r.personal_list:
        return base
    return base | {
        "date_end": r.date_end.isoformat() if r.date_end else None,
        "file_url": r.file_url, "summary": r.summary, "figures": r.figures or [], "meta": r.meta or {},
        "first_seen_at": r.first_seen_at.isoformat() if r.first_seen_at else None,
        "last_seen_at": r.last_seen_at.isoformat() if r.last_seen_at else None,
    }


@router.get("/happenings/summary")
async def happenings_summary(
    since: date | None = Query(None, description="First date counted (YYYY-MM-DD). Default: about four months back."),
    db: AsyncSession = Depends(get_db),
):
    """Per district: rows by source and by collectorate category, the newest date per source, and the thin flag."""
    start = _since(since)
    by_source = (await db.execute(
        select(H.district, H.source_kind, func.count(), func.max(H.date))
        .where(H.date >= start).group_by(H.district, H.source_kind)
    )).all()
    by_cat = (await db.execute(
        select(H.district, H.category, func.count())
        .where(H.date >= start, H.source_kind == "district_site").group_by(H.district, H.category)
    )).all()
    out = {n: {"district": n, "slug": _CODE[n], "counts": {k: 0 for k in SOURCE_KINDS}, "newest": {k: None for k in SOURCE_KINDS},
               "district_site_by_category": {}} for n in DISTRICT_NAMES}
    for district, kind, n, newest in by_source:
        if district in out:
            out[district]["counts"][kind] = n
            out[district]["newest"][kind] = newest.isoformat() if newest else None
    for district, cat, n in by_cat:
        if district in out:
            out[district]["district_site_by_category"][cat] = n
    for d in out.values():
        d["thin"] = d["counts"]["district_site"] <= THIN_AT_OR_BELOW
    return {"since": start.isoformat(), "thin_means": f"{THIN_AT_OR_BELOW} or fewer collectorate notices since that date",
            "districts": list(out.values())}


@router.get("/{slug}/happenings")
async def district_happenings(
    slug: str,
    kind: str | None = Query(None, description="district_site, pib or lok_sabha"),
    category: str | None = Query(None),
    since: date | None = Query(None),
    limit: int = Query(50, ge=1, le=MAX_LIMIT),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """One district's notices, releases and answers, newest first."""
    name = normalise_district(slug)
    if name not in DISTRICT_NAMES or (slug != _CODE[name] and slug != name):
        # Exact slug or exact name only: a fuzzy match here would quietly serve one
        # district's feed under another's address.
        raise HTTPException(status_code=404, detail="No district has this slug")
    if kind is not None and kind not in SOURCE_KINDS:
        raise HTTPException(status_code=422, detail=f"kind must be one of {', '.join(SOURCE_KINDS)}")
    start = _since(since)
    where = [H.district == name, H.date >= start]
    if kind:
        where.append(H.source_kind == kind)
    if category:
        where.append(H.category == category)
    total = (await db.execute(select(func.count()).select_from(H).where(*where))).scalar_one()
    rows = (await db.execute(
        select(H).where(*where).order_by(H.date.desc(), H.id.desc()).limit(limit).offset(offset)
    )).scalars().all()
    return {"district": name, "slug": _CODE[name], "since": start.isoformat(), "total": total,
            "limit": limit, "offset": offset, "items": [_item(r) for r in rows]}
