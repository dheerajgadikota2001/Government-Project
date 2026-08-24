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
    source_url: Optional[str] = None
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
    document_type: DocumentType
    year: Optional[int] = None
    department: Optional[str] = None
    reference_number: Optional[str] = None
    translation_status: DocumentTranslationStatus
    published_date: Optional[datetime] = None

    model_config = {"from_attributes": True}
