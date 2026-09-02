"""
DocumentLink — the provenance bridge between a document and the thing it
substantiates (a project, an MoU, or a tender).

This table is what lets a project page say, verifiably:
"We gathered these documents from this particular government page —
 read them in the Documents section."

Every link records not just WHICH document supports WHICH entity, but the
exact page the document was collected from and when — so any claim on the
platform can be traced back to a government-published file in two clicks.
"""

import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    BigInteger, DateTime, Enum, ForeignKey, Index, String, Text, func,
    CheckConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class LinkRole(str, enum.Enum):
    """Why this document is attached to the entity."""
    SANCTION_ORDER = "sanction_order"       # The G.O. sanctioning the work
    BUDGET_ALLOCATION = "budget_allocation" # Budget line / funds release order
    TENDER_NOTICE = "tender_notice"         # NIT / bid documents
    PROGRESS_REPORT = "progress_report"     # Official progress / review report
    AUDIT_FINDING = "audit_finding"         # CAG or departmental audit
    AGREEMENT = "agreement"                 # MoU text, concession agreement
    CLEARANCE = "clearance"                 # Environmental / DPR approvals
    REFERENCE = "reference"                 # General supporting document


class DocumentLink(Base):
    __tablename__ = "document_links"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    document_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Exactly one of these is set — enforced by the check constraint below.
    project_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True
    )
    mou_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("mous.id", ondelete="CASCADE"), nullable=True, index=True
    )
    tender_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("tenders.id", ondelete="CASCADE"), nullable=True, index=True
    )

    role: Mapped[LinkRole] = mapped_column(
        Enum(LinkRole), nullable=False, default=LinkRole.REFERENCE
    )

    # Provenance of the LINK itself: the exact government page where this
    # document was found while researching this entity, and when.
    collected_from_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    collected_from_title: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    collected_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Free-text note shown to readers, e.g.
    # "Sanction order for Phase 1 civil works, published on the GOIR portal."
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    document = relationship("Document", back_populates="links")
    project = relationship("Project", back_populates="document_links")

    __table_args__ = (
        # A link must point at exactly one entity.
        CheckConstraint(
            "(CASE WHEN project_id IS NOT NULL THEN 1 ELSE 0 END"
            " + CASE WHEN mou_id IS NOT NULL THEN 1 ELSE 0 END"
            " + CASE WHEN tender_id IS NOT NULL THEN 1 ELSE 0 END) = 1",
            name="ck_document_links_exactly_one_entity",
        ),
        Index("ix_document_links_project", "project_id", "document_id"),
        Index("ix_document_links_mou", "mou_id", "document_id"),
        Index("ix_document_links_tender", "tender_id", "document_id"),
    )

    def __repr__(self) -> str:
        target = self.project_id or self.mou_id or self.tender_id
        return f"<DocumentLink doc={self.document_id} -> {target} role={self.role}>"
