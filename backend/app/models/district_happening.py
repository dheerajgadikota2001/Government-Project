"""
What is happening in each district: one row per official notice, release or answer.

Three official streams feed this table, and they are kept apart by source_kind
because a reader weighs them differently:

- district_site: the collectorate's own notice board on its S3WaaS site
  (announcements, tenders, recruitment, press releases, events).
- pib: Press Information Bureau releases that name a place in the district.
- lok_sabha: answers laid in the Lok Sabha that name the district, loaded per session.

A row is what the source printed, never our reading of it. Titles are kept as
printed (some are in Telugu), dates are the source's own, and figures carry
their as-printed text. The district paper picks from these rows; it does not
write into them.

Personal lists (merit, selection, seniority, provisional and rejected lists,
speaking orders) are recorded by title and a link to the official page only.
Their files are never downloaded, so summary, figures and file_url stay empty
by construction. The check constraint below makes that a database promise, not
a habit.

Rows are never deleted by the app. last_seen_at moves forward each time a run
sees the row again, which is how a notice that vanished from the source can be
told apart from one that is still listed.
"""

# The column is called `date`, so the type is reached through the module: inside the
# class body a bare `date` would already mean the column by the time date_end is read.
import datetime as dt

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

SOURCE_KINDS = ("district_site", "pib", "lok_sabha")


class DistrictHappening(Base):
    __tablename__ = "district_happenings"
    __table_args__ = (
        UniqueConstraint("district", "source_kind", "url", "title", name="uq_district_happening_key"),
        Index("ix_district_happening_district_date", "district", "date"),
        Index("ix_district_happening_kind_date", "source_kind", "date"),
        CheckConstraint("source_kind IN ('district_site', 'pib', 'lok_sabha')", name="ck_district_happening_kind"),
        CheckConstraint(
            "NOT personal_list OR (summary IS NULL AND file_url IS NULL AND figures = '[]'::jsonb)",
            name="ck_district_happening_personal_list_bare",
        ),
        CheckConstraint("content_sha256 ~ '^[0-9a-f]{64}$'", name="ck_district_happening_sha_hex"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    district: Mapped[str] = mapped_column(String(64), nullable=False)
    source_kind: Mapped[str] = mapped_column(String(16), nullable=False)
    # announcement, tender, recruitment, press release, event, document, parliament answer
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    date: Mapped[dt.date] = mapped_column(Date, nullable=False)
    date_end: Mapped[dt.date | None] = mapped_column(Date, nullable=True)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    file_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    figures: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    meta: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    personal_list: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    first_seen_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_seen_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    content_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
