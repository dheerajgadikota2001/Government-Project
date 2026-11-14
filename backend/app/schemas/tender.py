from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel
from app.models.tender import TenderStatus, TenderType


class TenderOut(BaseModel):
    id: int
    tender_id: Optional[str] = None
    nit_number: Optional[str] = None
    title: str
    title_telugu: Optional[str] = None
    description: Optional[str] = None
    description_telugu: Optional[str] = None
    tender_type: TenderType
    status: TenderStatus
    district: Optional[str] = None
    estimated_value: Optional[float] = None
    earnest_money_deposit: Optional[float] = None
    department: Optional[str] = None
    tender_inviting_authority: Optional[str] = None
    published_date: Optional[datetime] = None
    bid_submission_end: Optional[datetime] = None
    bid_opening_date: Optional[datetime] = None
    awarded_to: Optional[str] = None
    awarded_amount: Optional[float] = None
    source_portal: str
    source_url: Optional[str] = None
    document_urls: Optional[List[str]] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class TenderListOut(BaseModel):
    id: int
    tender_id: Optional[str] = None
    title: str
    title_telugu: Optional[str] = None
    tender_type: TenderType
    status: TenderStatus
    district: Optional[str] = None
    estimated_value: Optional[float] = None
    department: Optional[str] = None
    bid_submission_end: Optional[datetime] = None
    published_date: Optional[datetime] = None
    nit_number: Optional[str] = None
    source_portal: Optional[str] = None
    # Where a reader goes next: the board that announced it and the site that holds the bid papers.
    # The list carries them so the page can link each row (added 14 Nov 2026; before that only the
    # detail endpoint did, and the page showed a notice with no way to reach it).
    source_url: Optional[str] = None
    document_urls: Optional[List[str]] = None

    model_config = {"from_attributes": True}
