"""
Document model — official government documents (budgets, bills, policy orders, reports).

Provenance is the whole point of this table: every document row must be able
to answer "which government portal published this, on which page did we find
it, and when did we last check". Rows that cannot answer that should not be
shown to the public.
"""

import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, DateTime, Enum, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

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

    # Storage & provenance
    source_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)   # Direct URL of the file on the govt portal
    storage_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)  # Our cached copy (GCS)
    source_portal: Mapped[str] = mapped_column(String(100), nullable=False)          # e.g. "GOIR", "AP Finance", "CAG"

    # The PAGE the file was found on — distinct from the file URL itself.
    # This is what lets the UI say "collected from this particular page".
    source_page_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    source_page_title: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Integrity: SHA-256 of the file as retrieved. If the portal later serves
    # different bytes at the same URL, we can prove what we actually mirrored.
    sha256: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    retrieved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

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

    # Entities this document substantiates (projects, MoUs, tenders).
    links = relationship(
        "DocumentLink",
        back_populates="document",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    __table_args__ = (
        Index("ix_documents_type_year", "document_type", "year"),
        Index("ix_documents_department", "department"),
    )

    def __repr__(self) -> str:
        return f"<Document id={self.id} type={self.document_type} title={self.title[:50]!r}>"
