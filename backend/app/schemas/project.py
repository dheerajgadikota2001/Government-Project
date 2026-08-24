from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from app.models.project import ProjectStatus, ProjectType


class ProjectOut(BaseModel):
    id: int
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

    model_config = {"from_attributes": True}
