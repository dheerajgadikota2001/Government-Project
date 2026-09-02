"""
ProgressObservation — a dated, cited snapshot of one project's progress.

This is the backbone of per-government attribution. A project row holds the
CURRENT state; observations hold what an official source said the state was
ON A SPECIFIC DATE. With observations at (for example) May 2019, June 2024
and today, the platform can honestly show how much progress happened inside
each government's tenure — every point backed by the document it came from,
never an estimate.

Rows accumulate automatically: each monthly MoSPI flash-report import writes
one observation per project, and archived reports can be backfilled with
scripts/import_mospi_archive.py.
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import (
    BigInteger, DateTime, Float, ForeignKey, String, UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ProgressObservation(Base):
    __tablename__ = "progress_observations"
    __table_args__ = (
        UniqueConstraint(
            "project_id", "observed_date", "source_portal",
            name="uq_progress_obs_project_date_portal",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # The date the SOURCE says this was true (e.g. "as of 30 June 2025") —
    # not the date we imported it.
    observed_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)

    completion_percentage: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cumulative_expenditure_crore: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    estimated_cost_crore: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    status_note: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)

    source_portal: Mapped[str] = mapped_column(String(100), nullable=False)
    source_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    source_label: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
