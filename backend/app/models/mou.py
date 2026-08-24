"""
MOU (Memorandum of Understanding) model.
Tracks investment MoUs signed at summits like CII Partnership Summit,
Global Investors Summit, etc.
"""

import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, DateTime, Enum, Float, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class MOUStatus(str, enum.Enum):
    SIGNED = "signed"
    INVESTMENT_STARTED = "investment_started"
    OPERATIONAL = "operational"
    STALLED = "stalled"
    CANCELLED = "cancelled"


class MOUSector(str, enum.Enum):
    MANUFACTURING = "manufacturing"
    IT_TECH = "it_tech"
    PHARMA = "pharma"
    AGRICULTURE = "agriculture"
    FOOD_PROCESSING = "food_processing"
    TEXTILES = "textiles"
    RENEWABLE_ENERGY = "renewable_energy"
    INFRASTRUCTURE = "infrastructure"
    REAL_ESTATE = "real_estate"
    TOURISM = "tourism"
    EDUCATION = "education"
    HEALTHCARE = "healthcare"
    LOGISTICS = "logistics"
    PORTS = "ports"
    AEROSPACE = "aerospace"
    DEFENCE = "defence"
    OTHER = "other"


class MOU(Base):
    __tablename__ = "mous"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    # Company details
    company_name: Mapped[str] = mapped_column(String(300), nullable=False, index=True)
    company_origin: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # India / USA / Japan etc.
    is_foreign_investment: Mapped[bool] = mapped_column(default=False)

    # MOU details
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    title_telugu: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    description_telugu: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Investment details
    investment_crore: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # Crore INR
    expected_employment: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    sector: Mapped[MOUSector] = mapped_column(Enum(MOUSector), nullable=False, default=MOUSector.OTHER)

    # Location
    district: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    location_description: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)

    # Status
    status: Mapped[MOUStatus] = mapped_column(Enum(MOUStatus), nullable=False, default=MOUStatus.SIGNED, index=True)

    # Key dates
    signed_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    summit_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)  # CII Summit 2024 etc.
    expected_start_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    expected_completion: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    actual_start_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Source
    source_portal: Mapped[str] = mapped_column(String(100), nullable=False)
    source_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)

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
        Index("ix_mous_sector_status", "sector", "status"),
        Index("ix_mous_signed_date", "signed_date"),
    )

    def __repr__(self) -> str:
        return f"<MOU id={self.id} company={self.company_name!r} investment={self.investment_crore}Cr>"
