from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from app.models.mou import MOUStatus, MOUSector


class MOUOut(BaseModel):
    id: int
    company_name: str
    company_origin: Optional[str] = None
    is_foreign_investment: bool
    title: str
    title_telugu: Optional[str] = None
    description: Optional[str] = None
    description_telugu: Optional[str] = None
    investment_crore: Optional[float] = None
    expected_employment: Optional[int] = None
    sector: MOUSector
    district: Optional[str] = None
    status: MOUStatus
    signed_date: Optional[datetime] = None
    summit_name: Optional[str] = None
    expected_start_date: Optional[datetime] = None
    expected_completion: Optional[datetime] = None
    source_portal: str
    source_url: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class MOUListOut(BaseModel):
    id: int
    company_name: str
    is_foreign_investment: bool
    investment_crore: Optional[float] = None
    expected_employment: Optional[int] = None
    sector: MOUSector
    district: Optional[str] = None
    status: MOUStatus
    signed_date: Optional[datetime] = None
    summit_name: Optional[str] = None

    model_config = {"from_attributes": True}
