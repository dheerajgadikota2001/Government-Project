"""
Document model — official government documents (budgets, bills, policy orders, reports).
"""

import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, DateTime, Enum, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class DocumentType(str, enum.Enum):
    BUDGET = "budget"
    ASSEMBLY_BILL = "assembly_bill"
    GO = "government_order"          # G.O. Ms. No. — Government Orders
    POLICY = "policy"
    ANNUAL_REPORT = "annual_report"
    AUDIT_REPORT = "audit_report"
    WHITE_PAPER = "white_paper"
    PRESS_RELEASE = "press_release"
    MOU_DOCUMENT = "mou_document"
    PROJECT_REPORT = "project_report"
    OTHER = "other"


class DocumentTranslationStatus(str, enum.Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    NOT_NEEDED = "not_needed"   # e.g., document is already in Telugu


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    # Identity
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    title_telugu: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Classification
    document_type: Mapped[DocumentType] = mapped_column(
        Enum(DocumentType), nullable=False, default=DocumentType.OTHER, index=True
    )
    year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    department: Mapped[Optional[str]] = mapped_column(String(200), nullable=True, index=True)
    reference_number: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)  # GO No., Bill No., etc.

    # Description
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    description_telugu: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # File info
    file_size_bytes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    file_type: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # pdf, docx etc.
    page_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Storage
    source_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)   # Original govt URL
    storage_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)  # Our GCS copy URL
    source_portal: Mapped[str] = mapped_column(String(100), nullable=False)

    # Translation
    translation_status: Mapped[DocumentTranslationStatus] = mapped_column(
        Enum(DocumentTranslationStatus),
        nullable=False,
        default=DocumentTranslationStatus.PENDING,
        index=True,
    )
    translated_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)      # Telugu full text (for small docs)
    translated_storage_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)  # For large docs

    # Dates
    published_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Audit
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    last_scraped_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_documents_type_year", "document_type", "year"),
        Index("ix_documents_department", "department"),
    )

    def __repr__(self) -> str:
        return f"<Document id={self.id} type={self.document_type} title={self.title[:50]!r}>"
