"""
The AI review layer's two tables: what the model cost, and what it proposed.

WHY THESE TABLES EXIST
Decision D-2026-11-10 (approach A): Claude may read a paper and propose facts, a
second pass checks every quote and figure against the stored paper text, and a
person approves before anything reaches a reader. Two things have to be on the
record for that to be trustworthy.

1. `ai_spend`: one row per model call, with its tokens and cost. The monthly
   ceiling (USD 200) is enforced from these rows, so a restart, a second job or
   a crashed run cannot forget what was already spent. A counter held in memory
   would reset to zero exactly when something went wrong.

2. `proposed_facts`: the review queue. A row is one figure the model says a paper
   prints, with the verbatim quote, the page and the link. The status column is a
   small state machine and the constraints below say it in SQL, so no code path
   can approve a fact that was never verified or reject one without saying why.

Nothing here reaches a reader. Publishing an approved fact into a chart is a
separate, later step with its own gate.
"""

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import (
    BigInteger, Boolean, CheckConstraint, DateTime, Index, Integer, Numeric, String, Text, func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

FACT_STATUSES = ("proposed", "verified", "rejected", "approved")


class AiSpend(Base):
    __tablename__ = "ai_spend"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    run_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    # What the call was for ("fact_extract", later "news_summary"), so the digest can say where money went.
    purpose: Mapped[str] = mapped_column(String(40), nullable=False)
    model: Mapped[str] = mapped_column(String(80), nullable=False)
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Six decimals: a Haiku call can cost a fraction of a cent and a month of them must still add up.
    cost_usd: Mapped[float] = mapped_column(Numeric(12, 6), nullable=False, default=0)
    ok: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    __table_args__ = (
        CheckConstraint("input_tokens >= 0 AND output_tokens >= 0 AND cost_usd >= 0", name="ck_ai_spend_not_negative"),
        Index("ix_ai_spend_at", "at"),
    )


class ProposedFact(Base):
    __tablename__ = "proposed_facts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    run_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="proposed")

    # What the paper says. `value` is kept as printed ("9,74,556"), never as a float,
    # so the review shows the reader's own text and nothing we converted.
    indicator: Mapped[str] = mapped_column(String(120), nullable=False)
    value: Mapped[str] = mapped_column(String(80), nullable=False)
    unit: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    period: Mapped[str] = mapped_column(String(40), nullable=False)
    stage: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)

    # Where it says it.
    quote: Mapped[str] = mapped_column(Text, nullable=False)
    page: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    source_url: Mapped[str] = mapped_column(Text, nullable=False)
    paper_sha256: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    # The words around the quote on that page, copied by the verifier (not the model),
    # so the reviewer sees the context without opening the PDF.
    evidence: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    model: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)

    # Why it failed (reasons) and what a person should look at even though it passed (flags).
    reasons: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, server_default="[]")
    flags: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, server_default="[]")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_by: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    rejected_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    reject_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    __table_args__ = (
        CheckConstraint("status IN ('proposed', 'verified', 'rejected', 'approved')", name="ck_proposed_fact_status"),
        # A fact is approved only after it was verified, by a named person, at a recorded time.
        CheckConstraint(
            "status <> 'approved' OR (verified_at IS NOT NULL AND approved_at IS NOT NULL AND approved_by IS NOT NULL)",
            name="ck_proposed_fact_approved_complete",
        ),
        CheckConstraint("status <> 'verified' OR verified_at IS NOT NULL", name="ck_proposed_fact_verified_dated"),
        # A rejection always says when, and either the verifier's reasons or a person's note.
        CheckConstraint(
            "status <> 'rejected' OR (rejected_at IS NOT NULL AND (reject_note IS NOT NULL OR jsonb_array_length(reasons) > 0))",
            name="ck_proposed_fact_rejected_explained",
        ),
        Index("ix_proposed_fact_status_created", "status", "created_at"),
        Index("ix_proposed_fact_key", "indicator", "period", "stage"),
    )
