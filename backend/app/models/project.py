"""
Projects model — tracks government projects in Andhra Pradesh.
Covers infrastructure, roads, dams, power plants, urban development etc.
"""

import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    BigInteger, DateTime, Enum, Float, Index, String, Text, func
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ProjectStatus(str, enum.Enum):
    ANNOUNCED = "announced"       # Project announced / MoU signed
    APPROVED = "approved"         # Government approval received
    TENDERED = "tendered"         # Tenders floated
    UNDER_CONSTRUCTION = "under_construction"
    COMPLETED = "completed"
    DELAYED = "delayed"
    CANCELLED = "cancelled"
    SUSPENDED = "suspended"


class ProjectType(str, enum.Enum):
    INFRASTRUCTURE = "infrastructure"
    ROADS = "roads"
    IRRIGATION = "irrigation"
    POWER = "power"
    INDUSTRIAL = "industrial"
    URBAN_DEVELOPMENT = "urban_development"
    EDUCATION = "education"
    HEALTH = "health"
    AGRICULTURE = "agriculture"
    PORTS = "ports"
    AIRPORTS = "airports"
    RAILWAYS = "railways"
    HOUSING = "housing"
    TOURISM = "tourism"
    IT_TECH = "it_tech"
    OTHER = "other"


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    # Identity
    external_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    title_telugu: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Description
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    description_telugu: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Classification
    project_type: Mapped[ProjectType] = mapped_column(
        Enum(ProjectType), nullable=False, default=ProjectType.OTHER
    )
    status: Mapped[ProjectStatus] = mapped_column(
        Enum(ProjectStatus), nullable=False, default=ProjectStatus.ANNOUNCED
    )

    # Location
    district: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    mandal: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    constituency: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)

    # Financials (in Crores INR)
    estimated_cost_crore: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    actual_cost_crore: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    central_funding_crore: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    state_funding_crore: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Department
    department: Mapped[Optional[str]] = mapped_column(String(200), nullable=True, index=True)
    implementing_agency: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    # Timeline
    announced_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    start_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    expected_completion: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    actual_completion: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completion_percentage: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

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

    # Photographs of the project. Ordered oldest-first so the gallery reads as
    # a progress record. May legitimately be empty — the UI then shows no
    # photo area at all rather than a placeholder.
    images = relationship(
        "ProjectImage",
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="(ProjectImage.sort_order, ProjectImage.captured_date)",
        lazy="selectin",
    )

    # Documents that substantiate this project (sanction G.O.s, budget
    # releases, audit findings…). This is the project page's "Source
    # Documents" section: proof, not decoration.
    document_links = relationship(
        "DocumentLink",
        back_populates="project",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    # Indexes for fast filtering
    __table_args__ = (
        Index("ix_projects_status_district", "status", "district"),
        Index("ix_projects_type_status", "project_type", "status"),
        Index("ix_projects_created_at", "created_at"),
    )

    @property
    def cover_image(self):
        """
        The image to use on a list card, or None.

        Prefers the explicitly flagged cover, else the first image in gallery
        order. Returns None when the project has no photographs, which callers
        must handle by rendering no image at all.
        """
        if not self.images:
            return None
        for img in self.images:
            if img.is_cover:
                return img
        return self.images[0]

    @property
    def has_images(self) -> bool:
        return bool(self.images)

    def __repr__(self) -> str:
        return f"<Project id={self.id} title={self.title[:50]!r} status={self.status}>"
