"""
Projects API — browse and filter AP government projects.
"""

from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.project import Project, ProjectStatus, ProjectType
from app.schemas.common import PaginatedResponse
from app.schemas.project import ProjectOut, ProjectListOut
from app.services.cache import cache_response

router = APIRouter(prefix="/projects", tags=["Projects"])

AP_DISTRICTS = [
    "Anantapur", "Chittoor", "East Godavari", "Guntur", "Krishna",
    "Kurnool", "Nellore", "Prakasam", "Srikakulam", "Visakhapatnam",
    "Vizianagaram", "West Godavari", "YSR Kadapa", "Alluri Sitharama Raju",
    "Anakapalli", "Bapatla", "Eluru", "Konaseema", "Manyam",
    "NTR", "Nandyal", "Palnadu", "Parvathipuram Manyam", "Sri Sathya Sai",
    "Tirupati",
]


@router.get("/", response_model=PaginatedResponse[ProjectListOut])
@cache_response(ttl=300)  # Cache 5 minutes
async def list_projects(
    district: Optional[str] = Query(None, description="Filter by district"),
    project_type: Optional[ProjectType] = Query(None),
    status: Optional[ProjectStatus] = Query(None),
    department: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List all projects with optional filters. Supports pagination."""
    stmt = select(Project)

    if district:
        stmt = stmt.where(Project.district.ilike(f"%{district}%"))
    if project_type:
        stmt = stmt.where(Project.project_type == project_type)
    if status:
        stmt = stmt.where(Project.status == status)
    if department:
        stmt = stmt.where(Project.department.ilike(f"%{department}%"))

    # Total count
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar_one()

    # Paginated results
    stmt = stmt.order_by(Project.updated_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    projects = result.scalars().all()

    return PaginatedResponse.build(
        items=[ProjectListOut.model_validate(p) for p in projects],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/districts", response_model=list[str])
async def get_districts():
    """Return list of all AP districts for filter dropdowns."""
    return sorted(AP_DISTRICTS)


@router.get("/stats")
@cache_response(ttl=600)  # Cache 10 minutes
async def get_project_stats(db: AsyncSession = Depends(get_db)):
    """High-level stats: total projects, total investment, by status."""
    from sqlalchemy import case

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


@router.get("/{project_id}", response_model=ProjectOut)
@cache_response(ttl=600)
async def get_project(project_id: int, db: AsyncSession = Depends(get_db)):
    """Get full details for a single project."""
    from fastapi import HTTPException
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return ProjectOut.model_validate(project)
