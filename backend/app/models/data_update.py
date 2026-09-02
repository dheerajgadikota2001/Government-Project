"""
The platform's own audit trail — one row per source per refresh run.

WHY THIS TABLE EXISTS
Until now a scraper run left a count in a log file on whoever's machine ran it.
That was survivable while refreshes happened by hand on a laptop; it is not
survivable in production, where the refresh runs in a Cloud Run job whose
container is destroyed the moment it finishes and takes its logs with it.

It also answers a question the platform has to be able to answer about itself.
The whole claim is that every figure comes from a government document. A reader
who sees a number change is entitled to ask what changed, when, and from which
source — and "check my terminal" is not an answer. These rows are what the
public /updates page is built from.

WHAT A ROW MEANS
One row is one source's part of one run: "the CAG scraper ran at 06:00 on
2 September, took 40 seconds, found 3 documents it had not seen before". Runs
are grouped by `run_id`, so the page can present a refresh as a single event
even though six scrapers took part.

Failures are recorded, not swallowed. A source that has been failing for a week
is exactly the thing that would otherwise go unnoticed until someone spotted a
stale figure on the site.
"""

import enum
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import BigInteger, DateTime, Enum, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class RunStatus(str, enum.Enum):
    OK = "ok"            # ran to completion, whether or not it found anything
    FAILED = "failed"    # raised — the portal was down, the page moved, we broke
    SKIPPED = "skipped"  # deliberately not run (e.g. --only excluded it)


class RunTrigger(str, enum.Enum):
    SCHEDULED = "scheduled"  # Cloud Scheduler
    MANUAL = "manual"        # someone ran the script


class DataUpdate(Base):
    __tablename__ = "data_updates"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    # Groups the several sources that took part in one refresh.
    run_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    # Human-readable source name, matching the labels used on the Data Sources
    # page so a reader can connect the two ("CAG audit reports").
    source: Mapped[str] = mapped_column(String(200), nullable=False)
    # The scraper class, for when a name is edited later and history must still
    # line up.
    scraper: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_seconds: Mapped[Optional[float]] = mapped_column(nullable=True)

    status: Mapped[RunStatus] = mapped_column(
        Enum(RunStatus, name="run_status"), nullable=False, default=RunStatus.OK
    )
    trigger: Mapped[RunTrigger] = mapped_column(
        Enum(RunTrigger, name="run_trigger"), nullable=False, default=RunTrigger.MANUAL
    )

    records_new: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    records_updated: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Up to five of the new items, as [{"title": ..., "url": ...}].
    # Stored rather than joined because the items live in four different tables
    # and a reader only wants to see what arrived, not to navigate a schema.
    #
    # none_as_null matters here: without it SQLAlchemy writes the JSON scalar
    # `null` instead of SQL NULL, and every jsonb_* query over the column then
    # errors with "cannot get array length of a scalar".
    samples: Mapped[Optional[list[dict[str, Any]]]] = mapped_column(
        JSONB(none_as_null=True), nullable=True
    )

    # First line of the exception. Deliberately not the whole traceback: this is
    # a public page, and stack traces leak paths and library versions.
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        # The page always asks "what happened most recently", never "what
        # happened to this id".
        Index("ix_data_updates_finished_at", "finished_at"),
        Index("ix_data_updates_source_finished", "source", "finished_at"),
    )

    def __repr__(self) -> str:
        return f"<DataUpdate {self.source} {self.status} +{self.records_new}>"
