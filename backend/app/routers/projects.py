"""
Projects API — browse and filter AP government projects.

Every filter exposed here is one the frontend actually renders, and every
filter the frontend renders is handled here. Filters that cannot be applied
server-side do not belong in the UI.
"""

from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import asc, case, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants.districts import AP_DISTRICTS, normalise_district
from app.constants.tenures import TENURES, tenure_by_key
from app.database import get_db
from app.models.project import Project, ProjectStatus, ProjectType
from app.schemas.common import PaginatedResponse
from app.schemas.project import ProjectListOut, ProjectOut
from app.services.cache import cache_response

router = APIRouter(prefix="/projects", tags=["Projects"])

SortField = Literal["updated", "cost", "progress", "completion_date", "title"]

_SORT_COLUMNS = {
    "updated": Project.updated_at,
    "cost": Project.estimated_cost_crore,
    "progress": Project.completion_percentage,
    "completion_date": Project.expected_completion,
    "title": Project.title,
}


@router.get("/", response_model=PaginatedResponse[ProjectListOut])
@cache_response(ttl=300)  # Cache 5 minutes
async def list_projects(
    q: Optional[str] = Query(None, description="Free text over title, description, department"),
    district: Optional[str] = Query(None, description="Any of the 26 AP districts (name or slug)"),
    project_type: Optional[ProjectType] = Query(None),
    status: Optional[ProjectStatus] = Query(None),
    department: Optional[str] = Query(None),
    mandal: Optional[str] = Query(None),
    constituency: Optional[str] = Query(None),
    min_cost_crore: Optional[float] = Query(None, ge=0),
    max_cost_crore: Optional[float] = Query(None, ge=0),
    min_progress: Optional[float] = Query(None, ge=0, le=100),
    max_progress: Optional[float] = Query(None, ge=0, le=100),
    has_images: Optional[bool] = Query(None, description="Only projects that have photographs"),
    tenure: Optional[str] = Query(None, description="Government tenure key (tdp1/ysrcp/tdp2): projects whose recorded announcement date falls inside that tenure"),
    sort: SortField = Query("updated"),
    order: Literal["asc", "desc"] = Query("desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List projects with filters, sorting and pagination."""
    stmt = select(Project)

    if q:
        term = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Project.title.ilike(term),
                Project.title_telugu.ilike(term),
                Project.description.ilike(term),
                Project.department.ilike(term),
                Project.implementing_agency.ilike(term),
                Project.external_id.ilike(term),
            )
        )

    if district:
        # Accept a slug, a legacy name, or the canonical name — all resolve
        # to one canonical value before hitting the column.
        canonical = normalise_district(district)
        stmt = stmt.where(Project.district == canonical) if canonical else stmt.where(
            Project.district.ilike(f"%{district}%")
        )

    if project_type:
        stmt = stmt.where(Project.project_type == project_type)
    if status:
        stmt = stmt.where(Project.status == status)
    if department:
        stmt = stmt.where(Project.department.ilike(f"%{department}%"))
    if mandal:
        stmt = stmt.where(Project.mandal.ilike(f"%{mandal}%"))
    if constituency:
        stmt = stmt.where(Project.constituency.ilike(f"%{constituency}%"))

    if min_cost_crore is not None:
        stmt = stmt.where(Project.estimated_cost_crore >= min_cost_crore)
    if max_cost_crore is not None:
        stmt = stmt.where(Project.estimated_cost_crore <= max_cost_crore)
    if min_progress is not None:
        stmt = stmt.where(Project.completion_percentage >= min_progress)
    if max_progress is not None:
        stmt = stmt.where(Project.completion_percentage <= max_progress)

    if tenure:
        t = tenure_by_key(tenure)
        if t:
            stmt = stmt.where(
                Project.announced_date >= t["from"], Project.announced_date <= t["to"]
            )

    if has_images is not None:
        from app.models.project_image import ProjectImage
        exists_images = select(ProjectImage.id).where(
            ProjectImage.project_id == Project.id
        ).exists()
        stmt = stmt.where(exists_images if has_images else ~exists_images)

    # Count before pagination
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()

    direction = asc if order == "asc" else desc
    sort_col = _SORT_COLUMNS[sort]
    # NULLs always last, whichever direction — a project with no cost recorded
    # should never head a list sorted by cost.
    stmt = stmt.order_by(
        case((sort_col.is_(None), 1), else_=0),
        direction(sort_col),
        Project.id.desc(),
    ).offset((page - 1) * page_size).limit(page_size)

    projects = (await db.execute(stmt)).scalars().unique().all()

    return PaginatedResponse.build(
        items=[ProjectListOut.from_project(p) for p in projects],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/districts")
@cache_response(ttl=600)
async def get_districts():
    """
    All 26 AP districts for filter dropdowns.

    Returns name, slug and headquarters so the frontend never hardcodes its
    own list and can never drift from what the data actually uses.
    """
    return AP_DISTRICTS


@router.get("/filters")
@cache_response(ttl=600)
async def get_filter_options(db: AsyncSession = Depends(get_db)):
    """
    Everything a filter bar needs, in one call: districts, the enum options,
    and the departments that actually appear in the data.
    """
    dept_rows = await db.execute(
        select(Project.department, func.count(Project.id))
        .where(Project.department.is_not(None))
        .group_by(Project.department)
        .order_by(func.count(Project.id).desc())
    )
    return {
        "districts": AP_DISTRICTS,
        "project_types": [
            {"value": t.value, "label": t.value.replace("_", " ").title()} for t in ProjectType
        ],
        "statuses": [
            {"value": s.value, "label": s.value.replace("_", " ").title()} for s in ProjectStatus
        ],
        "departments": [{"name": name, "count": count} for name, count in dept_rows.all()],
        "sort_options": [
            {"value": "updated", "label": "Recently updated"},
            {"value": "cost", "label": "Estimated cost"},
            {"value": "progress", "label": "Completion %"},
            {"value": "completion_date", "label": "Expected completion"},
            {"value": "title", "label": "Name (A–Z)"},
        ],
    }


@router.get("/insights")
@cache_response(ttl=600)
async def get_project_insights(
    tenure: Optional[str] = Query(None, description="Limit every breakdown to projects announced in this government's tenure"),
    db: AsyncSession = Depends(get_db),
):
    """
    The handful of numbers worth showing at the top of the register: how the
    projects break down by status, by kind of work, by district, and by the
    government that announced them. Everything is counted from the records
    themselves; nothing is modelled or estimated.

    With ?tenure=, every breakdown is limited to projects whose recorded
    ANNOUNCEMENT date falls inside that government's term — the same rule the
    rest of the site uses, so the numbers here always agree with the register.
    """
    t = tenure_by_key(tenure) if tenure else None
    scope = []
    if t:
        scope = [Project.announced_date >= t["from"], Project.announced_date <= t["to"]]

    def scoped(stmt):
        return stmt.where(*scope) if scope else stmt

    status_rows = (await db.execute(scoped(
        select(Project.status, func.count(Project.id),
               func.coalesce(func.sum(Project.estimated_cost_crore), 0))
        ).group_by(Project.status)
    )).all()

    type_rows = (await db.execute(scoped(
        select(Project.project_type, func.count(Project.id),
               func.coalesce(func.sum(Project.estimated_cost_crore), 0))
        ).group_by(Project.project_type)
        .order_by(func.coalesce(func.sum(Project.estimated_cost_crore), 0).desc())
    )).all()

    district_rows = (await db.execute(scoped(
        select(Project.district, func.count(Project.id),
               func.coalesce(func.sum(Project.estimated_cost_crore), 0))
        .where(Project.district.is_not(None))
        ).group_by(Project.district)
    )).all()

    # Announcements year by year inside the scope — the shape of a term.
    year_rows = (await db.execute(scoped(
        select(func.extract("year", Project.announced_date).label("yr"),
               func.count(Project.id),
               func.coalesce(func.sum(Project.estimated_cost_crore), 0))
        .where(Project.announced_date.is_not(None))
        ).group_by("yr").order_by("yr")
    )).all()

    agency_rows = (await db.execute(scoped(
        select(Project.implementing_agency, func.count(Project.id))
        .where(Project.implementing_agency.is_not(None))
        ).group_by(Project.implementing_agency)
        .order_by(func.count(Project.id).desc()).limit(6)
    )).all()

    # District labels in the raw records carry scraper spellings; fold them
    # onto the canonical district before showing them.
    by_district: dict[str, dict] = {}
    unmatched = 0
    for name, count, cost in district_rows:
        canon = normalise_district(name)
        if not canon:
            unmatched += count
            continue
        d = by_district.setdefault(canon, {"district": canon, "count": 0, "cost_crore": 0.0})
        d["count"] += count
        d["cost_crore"] += float(cost or 0)
    districts = sorted(by_district.values(), key=lambda d: d["count"], reverse=True)

    statewide = (await db.execute(scoped(
        select(func.count(Project.id)).where(Project.district.is_(None))
    ))).scalar_one()

    with_progress = (await db.execute(scoped(
        select(func.count(Project.id)).where(Project.completion_percentage.is_not(None))
    ))).scalar_one()
    total = (await db.execute(scoped(select(func.count(Project.id))))).scalar_one()
    avg_progress = (await db.execute(scoped(
        select(func.avg(Project.completion_percentage))
        .where(Project.completion_percentage.is_not(None))
    ))).scalar_one()

    return {
        "by_status": [
            {"status": s.value if hasattr(s, "value") else str(s),
             "count": c, "cost_crore": round(float(v or 0), 2)}
            for s, c, v in status_rows
        ],
        "by_type": [
            {"type": t.value if hasattr(t, "value") else str(t),
             "count": c, "cost_crore": round(float(v or 0), 2)}
            for t, c, v in type_rows
        ],
        "by_district": [
            {**d, "cost_crore": round(d["cost_crore"], 2)} for d in districts
        ],
        "by_year": [
            {"year": int(y), "count": c, "cost_crore": round(float(v or 0), 2)}
            for y, c, v in year_rows
        ],
        "by_agency": [{"agency": a, "count": c} for a, c in agency_rows],
        "tenure": ({"key": t["key"], "party": t["party"], "cm": t["cm"], "label": t["label"],
                    "from": t["from"].date().isoformat(),
                    "to": None if t["to"].year >= 2099 else t["to"].date().isoformat()}
                   if t else None),
        "average_published_progress": round(float(avg_progress), 1) if avg_progress is not None else None,
        "statewide_count": statewide or 0,
        "unmatched_district_count": unmatched,
        "with_published_progress": with_progress or 0,
        "total": total or 0,
        "method_note": (
            "Counted straight from the project records. District spellings from the source "
            "documents are folded onto the canonical district name; projects recorded as "
            "statewide have no district and are counted separately."
        ),
    }


@router.get("/by-tenure")
@cache_response(ttl=600)
async def get_projects_by_tenure(db: AsyncSession = Depends(get_db)):
    """
    What each government's tenure shows in the project register — counted
    strictly by the dates ON the records: announced during the tenure,
    works begun during it, completed during it. A project with no recorded
    date cannot be attributed and is counted as exactly that, never guessed
    into a tenure.
    """
    out = []
    for t in TENURES:
        row = (await db.execute(
            select(
                func.count(Project.id).filter(
                    Project.announced_date >= t["from"], Project.announced_date <= t["to"]
                ).label("announced"),
                func.coalesce(func.sum(Project.estimated_cost_crore).filter(
                    Project.announced_date >= t["from"], Project.announced_date <= t["to"]
                ), 0).label("announced_cost"),
                func.count(Project.id).filter(
                    Project.start_date >= t["from"], Project.start_date <= t["to"]
                ).label("started"),
                func.count(Project.id).filter(
                    Project.actual_completion >= t["from"], Project.actual_completion <= t["to"]
                ).label("completed"),
            )
        )).one()
        out.append({
            "key": t["key"], "party": t["party"], "cm": t["cm"], "label": t["label"],
            "from": t["from"].date().isoformat(),
            "to": None if t["to"].year >= 2099 else t["to"].date().isoformat(),
            "announced_count": row.announced or 0,
            "announced_cost_crore": round(row.announced_cost or 0, 2),
            "started_count": row.started or 0,
            "completed_count": row.completed or 0,
        })

    undated = (await db.execute(
        select(func.count(Project.id)).where(Project.announced_date.is_(None))
    )).scalar_one()
    pre = (await db.execute(
        select(func.count(Project.id)).where(Project.announced_date < TENURES[0]["from"])
    )).scalar_one()

    return {
        "tenures": out,
        "unattributed_count": undated or 0,
        "pre_bifurcation_count": pre or 0,
        "method_note": (
            "Counted by the dates recorded on each project — announcement, works-start and completion. "
            "Records without a published date are listed as unattributed; we never guess a tenure."
        ),
    }


@router.get("/stats")
@cache_response(ttl=600)  # Cache 10 minutes
async def get_project_stats(db: AsyncSession = Depends(get_db)):
    """High-level stats: total projects, total investment, by status."""
    result = await db.execute(
        select(
            func.count(Project.id).label("total"),
            func.sum(Project.estimated_cost_crore).label("total_investment_crore"),
            func.sum(case((Project.status == ProjectStatus.COMPLETED, 1), else_=0)).label("completed"),
            func.sum(case((Project.status == ProjectStatus.UNDER_CONSTRUCTION, 1), else_=0)).label("ongoing"),
            func.sum(case((Project.status == ProjectStatus.ANNOUNCED, 1), else_=0)).label("announced"),
            func.sum(case((Project.status == ProjectStatus.DELAYED, 1), else_=0)).label("delayed"),
        )
    )
    row = result.one()
    return {
        "total_projects": row.total or 0,
        "total_investment_crore": round(row.total_investment_crore or 0, 2),
        "completed": row.completed or 0,
        "ongoing": row.ongoing or 0,
        "announced": row.announced or 0,
        "delayed": row.delayed or 0,
    }


@router.get("/{project_id}/extras")
@cache_response(ttl=600)
async def get_project_extras(project_id: int, db: AsyncSession = Depends(get_db)):
    """Everything attached to a project beyond its core row — photographs,
    linked government documents, and dated progress observations. Every list
    may legitimately be empty; the frontend renders nothing for empty lists
    rather than inventing content."""
    from app.models.project_image import ProjectImage
    from app.models.document_link import DocumentLink
    from app.models.document import Document
    from app.models.progress_observation import ProgressObservation

    images = (await db.execute(
        select(ProjectImage).where(ProjectImage.project_id == project_id)
        .order_by(ProjectImage.sort_order, ProjectImage.captured_date)
    )).scalars().all()

    links = (await db.execute(
        select(DocumentLink, Document)
        .join(Document, Document.id == DocumentLink.document_id)
        .where(DocumentLink.project_id == project_id)
    )).all()

    observations = (await db.execute(
        select(ProgressObservation).where(ProgressObservation.project_id == project_id)
        .order_by(ProgressObservation.observed_date)
    )).scalars().all()

    return {
        "images": [{
            "url": im.url, "thumbnail_url": im.thumbnail_url,
            "kind": im.kind.value if im.kind else None, "caption": im.caption,
            "captured_date": im.captured_date.isoformat() if im.captured_date else None,
            "credit": im.credit, "source_url": im.source_url, "license": im.license,
            "is_cover": bool(im.is_cover),
        } for im in images],
        "documents": [{
            "role": dl.role.value if dl.role else None,
            "title": doc.title, "reference_number": doc.reference_number,
            "source_portal": doc.source_portal, "source_url": doc.source_url,
            "note": dl.note, "collected_from_url": dl.collected_from_url,
            "collected_from_title": dl.collected_from_title,
            "collected_at": dl.collected_at.isoformat() if dl.collected_at else None,
        } for dl, doc in links],
        "observations": [{
            "observed_date": ob.observed_date.isoformat(),
            "completion_percentage": ob.completion_percentage,
            "cumulative_expenditure_crore": ob.cumulative_expenditure_crore,
            "estimated_cost_crore": ob.estimated_cost_crore,
            "status_note": ob.status_note,
            "source_label": ob.source_label, "source_url": ob.source_url,
        } for ob in observations],
    }


_NEWS_STOPWORDS = {
    "construction", "constn", "development", "upgradation", "rehabilitation", "providing",
    "project", "projects", "works", "work", "phase", "package", "scheme", "andhra", "pradesh",
    "improvement", "widening", "including", "associated", "facility", "facilities", "system",
    "infrastructure", "national", "state", "district", "new", "existing", "various", "misc",
    "supply", "water", "road", "roads", "bridge", "building", "plant", "line", "extension",
    "international", "airport", "terminal", "railway", "station", "irrigation", "highway",
    "paved", "shoulders", "configuration", "lane", "lanes", "section", "sector", "doubling",
    "electrification", "corridor", "greenfield", "brownfield", "expansion", "modernisation",
}


def _distinctive_tokens(title: str, limit: int = 5) -> list[str]:
    """The words of a project title that are distinctive enough to search
    news by — proper-noun-ish tokens, not generic works vocabulary."""
    import re
    seen, out = set(), []
    for w in re.findall(r"[A-Za-z]{5,}", title or ""):
        lw = w.lower()
        if lw in _NEWS_STOPWORDS or lw in seen:
            continue
        seen.add(lw)
        out.append(w)
        if len(out) >= limit:
            break
    return out


@router.get("/{project_id}/news")
@cache_response(ttl=600)
async def get_project_news(project_id: int, db: AsyncSession = Depends(get_db)):
    """News articles that mention this project's name — matched automatically
    on the distinctive words of its title, and labeled with which word
    matched. This is a name-match, not an editorial judgment: the reader is
    told exactly why each article appears."""
    from app.models.news import NewsArticle

    row = (await db.execute(select(Project.title).where(Project.id == project_id))).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Project not found")

    tokens = _distinctive_tokens(row)
    if not tokens:
        return {"matched_on": [], "articles": []}

    conds = [
        NewsArticle.headline.ilike(f"%{t}%") | NewsArticle.summary.ilike(f"%{t}%")
        for t in tokens
    ]
    stmt = (
        select(NewsArticle)
        .where(or_(*conds))
        .order_by(NewsArticle.published_at.desc().nulls_last())
        .limit(6)
    )
    articles = (await db.execute(stmt)).scalars().all()

    def matched(a):
        hay = f"{a.headline or ''} {a.summary or ''}".lower()
        return [t for t in tokens if t.lower() in hay]

    return {
        "matched_on": tokens,
        "articles": [{
            "id": a.id, "headline": a.headline, "summary": a.summary,
            "source_name": a.source_name, "source_url": a.source_url,
            "published_at": a.published_at.isoformat() if a.published_at else None,
            "matched_words": matched(a),
        } for a in articles],
    }


@router.get("/{project_id}", response_model=ProjectOut)
@cache_response(ttl=600)
async def get_project(project_id: int, db: AsyncSession = Depends(get_db)):
    """
    Full details for a single project, including its photo gallery.

    `images` may be an empty list; that is not an error condition and the
    client should render no photo section rather than a placeholder.
    """
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.unique().scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return ProjectOut.model_validate(project)


@router.get("/{project_id}/documents")
@cache_response(ttl=600)
async def get_project_documents(project_id: int, db: AsyncSession = Depends(get_db)):
    """
    The government documents that substantiate this project — the project
    page's "Source Documents" section.

    Each entry answers three provenance questions a reader might ask:
      1. What is this document?      (title, type, reference number)
      2. Where did it come from?     (portal, the exact page it was found on)
      3. When did we collect it?     (collected_at / retrieved_at)

    Ordered by role so sanction orders and budget releases appear before
    general references. An empty list is a valid answer — the client should
    render no section rather than inventing citations.
    """
    from app.models.document_link import DocumentLink

    exists = await db.execute(select(Project.id).where(Project.id == project_id))
    if exists.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Project not found")

    result = await db.execute(
        select(DocumentLink)
        .where(DocumentLink.project_id == project_id)
        .order_by(DocumentLink.role, DocumentLink.created_at)
    )
    links = result.scalars().unique().all()

    return [
        {
            "link_id": link.id,
            "role": link.role.value,
            "note": link.note,
            "collected_from_url": link.collected_from_url,
            "collected_from_title": link.collected_from_title,
            "collected_at": link.collected_at,
            "document": {
                "id": link.document.id,
                "title": link.document.title,
                "title_telugu": link.document.title_telugu,
                "document_type": link.document.document_type.value,
                "reference_number": link.document.reference_number,
                "department": link.document.department,
                "published_date": link.document.published_date,
                "source_portal": link.document.source_portal,
                "source_url": link.document.source_url,
                "source_page_url": link.document.source_page_url,
                "source_page_title": link.document.source_page_title,
                "retrieved_at": link.document.retrieved_at,
                "sha256": link.document.sha256,
            },
        }
        for link in links
    ]
