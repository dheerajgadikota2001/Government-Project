"""
Tenders model — all government tenders published on AP eProcurement and department portals.
"""

import enum
from datetime import datetime
from typing import List, Optional

from sqlalchemy import (
    BigInteger, DateTime, Enum, Float, Index, String, Text, func
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class TenderStatus(str, enum.Enum):
    ACTIVE = "active"           # Accepting bids
    CLOSED = "closed"           # Bid submission deadline passed
    AWARDED = "awarded"         # Contract awarded
    CANCELLED = "cancelled"
    CORRIGENDUM = "corrigendum" # Amendment issued


class TenderType(str, enum.Enum):
    WORKS = "works"             # Construction, civil works
    GOODS = "goods"             # Equipment, materials purchase
    SERVICES = "services"       # Consultancy, IT, maintenance
    AUCTION = "auction"
    EOI = "eoi"                 # Expression of Interest
    RFP = "rfp"                 # Request for Proposal
    OTHER = "other"


class Tender(Base):
    __tablename__ = "tenders"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    # AP eProcurement reference IDs
    tender_id: Mapped[Optional[str]] = mapped_column(String(100), unique=True, nullable=True, index=True)
    nit_number: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)  # Notice Inviting Tender number

    # Details
    title: Mapped[str] = mapped_column(String(1000), nullable=False)
    title_telugu: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    description_telugu: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Classification
    tender_type: Mapped[TenderType] = mapped_column(
        Enum(TenderType), nullable=False, default=TenderType.WORKS
    )
    status: Mapped[TenderStatus] = mapped_column(
        Enum(TenderStatus), nullable=False, default=TenderStatus.ACTIVE, index=True
    )

    # Location
    district: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    location_description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Financials (INR)
    estimated_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    earnest_money_deposit: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Department
    department: Mapped[Optional[str]] = mapped_column(String(200), nullable=True, index=True)
    division: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    tender_inviting_authority: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)

    # Key Dates
    published_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    document_download_start: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    document_download_end: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    bid_submission_start: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    bid_submission_end: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    bid_opening_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Award details (populated when status=AWARDED)
    awarded_to: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    awarded_amount: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    awarded_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Source
    source_portal: Mapped[str] = mapped_column(String(100), nullable=False)
    source_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    document_urls: Mapped[Optional[List[str]]] = mapped_column(ARRAY(String), nullable=True)

    # Translation status
    is_translated: Mapped[bool] = mapped_column(default=False)

    # Audit
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    last_scraped_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_tenders_status_district", "status", "district"),
        Index("ix_tenders_bid_end", "bid_submission_end"),
        Index("ix_tenders_department", "department"),
    )

    def __repr__(self) -> str:
        return f"<Tender id={self.id} tender_id={self.tender_id!r} status={self.status}>"
