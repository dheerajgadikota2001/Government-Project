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

    # ---------------------------------------------------------------- full
    #
    # Everything below is sent ONLY when the caller asks for full=true, and is
    # left unset otherwise, so the register page a phone loads is byte for byte
    # what it was.
    #
    # WHY THEY ARE HERE AT ALL
    #
    # The prerenderer builds all 4,620 static pages from this endpoint, and it
    # renders every field below. None of them were in this schema, so for
    # months it rendered ten fields the endpoint never returns: the page had
    # working code for the project's description, its project code, its
    # implementing agency and its source document link, and printed none of
    # them, on every project, in six languages.
    #
    # It read as missing data. It was not. Every scraper writes a description
    # and all four write good ones, from the AMRUT milestone line to the
    # multi-paragraph Government Order account behind Ramayapatnam Port. The
    # content was written, stored and paid for, and stopped one schema short of
    # the page.
    description: Optional[str] = None
    description_telugu: Optional[str] = None
    external_id: Optional[str] = None
    implementing_agency: Optional[str] = None
    mandal: Optional[str] = None
    constituency: Optional[str] = None
    announced_date: Optional[datetime] = None
    actual_completion: Optional[datetime] = None
    actual_cost_crore: Optional[float] = None
    source_portal: Optional[str] = None
    source_url: Optional[str] = None

    model_config = {"from_attributes": True}

    @classmethod
    def from_project(cls, p, full: bool = False) -> "ProjectListOut":
        """
        A row for the register.

        `full` adds the fields a whole page needs and a card does not. The
        extra fields are not merely None when full is False, they are never
        passed, which leaves them unset: the route serialises with
        exclude_unset, so the slim response carries no extra keys at all and
        the app's payload does not grow by a single byte.
        """
        cover = p.cover_image
        extra = {} if not full else dict(
            description=p.description,
            description_telugu=p.description_telugu,
            external_id=p.external_id,
            implementing_agency=p.implementing_agency,
            mandal=p.mandal,
            constituency=p.constituency,
            announced_date=p.announced_date,
            actual_completion=p.actual_completion,
            actual_cost_crore=p.actual_cost_crore,
            source_portal=p.source_portal,
            source_url=p.source_url,
        )
        return cls(
            **extra,
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
