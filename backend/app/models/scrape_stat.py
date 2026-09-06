"""
The shape of every batch a scraper has written — the memory drift detection needs.

One row per scraper per run: how many records, how often each watched field was
empty, how distinct the dedupe keys were. No record content is stored here; this
is the outline of a batch, not the batch.

WHY A TABLE AND NOT A LOG
The drift check compares this run against the last few. A Cloud Run container is
destroyed when the job exits, so "the last few runs" cannot live in memory or in
a file — it has to survive in the one place that outlives the container.

Kept deliberately small: the drift check reads at most the last handful of rows
per scraper, and old rows are only useful as history.
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, DateTime, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ScrapeStat(Base):
    __tablename__ = "scrape_stats"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    # Ties this batch to the refresh run it was part of, so a stats row and its
    # data_updates row can be read together.
    run_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    scraper: Mapped[str] = mapped_column(String(100), nullable=False, index=True)

    rows: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # The full summarise() payload: null_rates per field, mean_title_len,
    # distinct_ratio. JSONB rather than columns because the watched fields
    # differ per scraper and adding one must not need a migration.
    stats: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Rows the field checks dropped, and the top reasons — this is what the
    # alert email reports under "blocked writes".
    rejected: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rejected_reason: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Set when the gate refused the whole batch. A refusal is a successful
    # outcome for this table — it means the site kept its last known-good data.
    aborted: Mapped[bool] = mapped_column(nullable=False, default=False)
    abort_reason: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        # The drift check's only query: the last N healthy batches for one scraper.
        Index("ix_scrape_stats_scraper_created", "scraper", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<ScrapeStat {self.scraper} rows={self.rows} aborted={self.aborted}>"
