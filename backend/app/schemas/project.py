from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models.project import ProjectStatus, ProjectType
from app.models.project_image import ImageKind


class ProjectImageOut(BaseModel):
    """
    A single photograph. Always carries its attribution — a picture without
    a source is not publishable on a transparency platform.
    """
    id: int
    url: str
    thumbnail_url: Optional[str] = None
    kind: ImageKind
    caption: Optional[str] = None
    caption_telugu: Optional[str] = None
    captured_date: Optional[datetime] = None
    credit: Optional[str] = None
    source_name: Optional[str] = None
    source_url: Optional[str] = None
    license: Optional[str] = None
    is_cover: bool = False
    width: Optional[int] = None
    height: Optional[int] = None

    model_config = {"from_attributes": True}


class ProjectOut(BaseModel):
    id: int
    external_id: Optional[str] = None  # the code this project carries in its source document
    title: str
    title_telugu: Optional[str] = None
    description: Optional[str] = None
    description_telugu: Optional[str] = None
    project_type: ProjectType
    status: ProjectStatus
    district: Optional[str] = None
    mandal: Optional[str] = None
    constituency: Optional[str] = None
    estimated_cost_crore: Optional[float] = None
    actual_cost_crore: Optional[float] = None
    department: Optional[str] = None
    implementing_agency: Optional[str] = None
    announced_date: Optional[datetime] = None
    start_date: Optional[datetime] = None
    expected_completion: Optional[datetime] = None
    actual_completion: Optional[datetime] = None
    completion_percentage: Optional[float] = None
    source_portal: str
    source_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    # Full gallery, oldest first. An empty list is a valid, common answer —
    # the client must render no photo section in that case.
    images: list[ProjectImageOut] = []

    model_config = {"from_attributes": True}


class ProjectListOut(BaseModel):
    id: int
    title: str
    title_telugu: Optional[str] = None
    project_type: ProjectType
    status: ProjectStatus
    district: Optional[str] = None
    estimated_cost_crore: Optional[float] = None
    department: Optional[str] = None
    expected_completion: Optional[datetime] = None
    completion_percentage: Optional[float] = None

    # Cover only — list responses stay small. None means the card renders
    # without a photo area.
    cover_image: Optional[ProjectImageOut] = None
    image_count: int = 0

    # When the record last changed. The sitemap is built from this list, and
    # Google uses lastmod to decide which of 4,700 URLs to recrawl first. The
    # field was missing from the list, so the generator quietly wrote no
    # lastmod at all and the sitemap went out that way. One timestamp per row
    # is the cost of a crawler knowing what moved.
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

    @classmethod
    def from_project(cls, p) -> "ProjectListOut":
        cover = p.cover_image
        return cls(
            id=p.id,
            updated_at=getattr(p, "updated_at", None),
            title=p.title,
            title_telugu=p.title_telugu,
            project_type=p.project_type,
            status=p.status,
            district=p.district,
            estimated_cost_crore=p.estimated_cost_crore,
            department=p.department,
            expected_completion=p.expected_completion,
            completion_percentage=p.completion_percentage,
            cover_image=ProjectImageOut.model_validate(cover) if cover else None,
            image_count=len(p.images or []),
        )
