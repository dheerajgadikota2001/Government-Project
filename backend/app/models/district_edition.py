"""
One edition of a district paper (మన జిల్లా పత్రిక): the lead stories a reader sees, as approved.

THE RULES THIS TABLE KEEPS (decided by Dheeraj, 21 Oct 2026)

- A new edition only when an official source has published something new for the
  district. A draft names the gathered items (district_happenings rows) it is built
  from; items already used by a published edition do not count as new.
- Every edition is approved by a person before any reader sees it. A draft is never
  served by a public endpoint.
- Editions are numbered, dated and kept. The number is given at publishing, so a
  rejected draft leaves no gap. Published rows are never edited or deleted.
- Recorded audio is made only for an approved text. The database refuses a row that
  asks for audio before approval, so no code path can spend money speaking a draft.

STATUS
    draft      written (by a person, or by a model and checked by the editorial gate)
    approved   a person read it and said yes; audio may now be made
    published  readers see it, under its number
    rejected   a person said no; kept for the record, never shown

The content is JSON with the same shape as web/editorial/<slug>.json: {"district",
"lead": [story, ...]}, each story carrying its url, quote, date and both languages.
"""

import datetime as dt

from sqlalchemy import BigInteger, CheckConstraint, DateTime, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

STATUSES = ("draft", "approved", "published", "rejected")
AUDIO_STATUSES = ("none", "requested", "ready", "failed")


class DistrictEdition(Base):
    __tablename__ = "district_editions"
    __table_args__ = (
        UniqueConstraint("district", "number", name="uq_district_edition_number"),
        Index("ix_district_edition_district_status", "district", "status"),
        CheckConstraint("status IN ('draft', 'approved', 'published', 'rejected')", name="ck_district_edition_status"),
        CheckConstraint("audio_status IN ('none', 'requested', 'ready', 'failed')", name="ck_district_edition_audio_status"),
        # A published edition has a number and was approved first.
        CheckConstraint("status <> 'published' OR (number IS NOT NULL AND approved_at IS NOT NULL AND published_at IS NOT NULL)",
                        name="ck_district_edition_published_complete"),
        # Only a published edition has a number.
        CheckConstraint("number IS NULL OR status = 'published'", name="ck_district_edition_number_only_published"),
        # Audio is never asked for, or kept, before a person approved the text.
        CheckConstraint("audio_status = 'none' OR approved_at IS NOT NULL", name="ck_district_edition_audio_after_approval"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    district: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="draft")
    number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    content: Mapped[dict] = mapped_column(JSONB, nullable=False)
    # The district_happenings rows the stories are built from, and those of them no earlier
    # published edition used: the "what is new" that justifies an edition.
    item_ids: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    new_item_ids: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    # The editorial gate's answer when the draft was saved, and again at approval.
    gate: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    # Who or what wrote the text: "Dheeraj", "stand-in drafter", or the model's id.
    written_by: Mapped[str] = mapped_column(String(120), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    approved_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    published_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejected_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    audio_status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="none")
    audio_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    audio_requested_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
