from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from app.models.document import DocumentType, DocumentTranslationStatus


class DocumentOut(BaseModel):
    id: int
    title: str
    title_telugu: Optional[str] = None
    description: Optional[str] = None
    description_telugu: Optional[str] = None
    document_type: DocumentType
    year: Optional[int] = None
    department: Optional[str] = None
    reference_number: Optional[str] = None
    file_size_bytes: Optional[int] = None
    file_type: Optional[str] = None
    page_count: Optional[int] = None
    # Provenance — the whole point of this platform. Every document must be
    # able to say where it came from and when we collected it.
    source_url: Optional[str] = None
    source_portal: str
    source_page_url: Optional[str] = None
    source_page_title: Optional[str] = None
    retrieved_at: Optional[datetime] = None
    storage_url: Optional[str] = None
    translation_status: DocumentTranslationStatus
    translated_storage_url: Optional[str] = None
    published_date: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentListOut(BaseModel):
    id: int
    title: str
    title_telugu: Optional[str] = None
    description: Optional[str] = None
    document_type: DocumentType
    year: Optional[int] = None
    department: Optional[str] = None
    reference_number: Optional[str] = None
    # Provenance fields the UI renders on every row ("From <portal> · fetched <date>")
    source_url: Optional[str] = None
    source_portal: str
    source_page_url: Optional[str] = None
    retrieved_at: Optional[datetime] = None
    file_size_bytes: Optional[int] = None
    translation_status: DocumentTranslationStatus
    published_date: Optional[datetime] = None

    model_config = {"from_attributes": True}


class DocumentStatsOut(BaseModel):
    """Real counts from the database — never hardcoded in the frontend."""
    total: int
    by_type: dict[str, int]


class DocumentFiltersOut(BaseModel):
    """The filter options that actually exist in the data right now."""
    document_types: list[str]
    years: list[int]
    departments: list[str]
    source_portals: list[str]
