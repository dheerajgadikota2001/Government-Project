"""ai review: the spend ledger and the proposed facts queue

WHY
Decision D-2026-11-10 (approach A). The model may propose facts from a paper,
a second pass checks each quote and figure against the stored text, and a person
approves before anything reaches a reader. `ai_spend` keeps what each call cost so
the USD 200 monthly ceiling survives restarts. `proposed_facts` is the review
queue, with its state rules written as constraints. See app/models/ai_review.py.

IF NOT EXISTS: the API's startup create_all may already have made a table on a
database where the code ran before the migration (the lesson of 0005). Each table
is created only when absent.

Revision ID: 0016
Revises: 0015
Create Date: 2026-11-10
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0016"
down_revision: Union[str, None] = "0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())

    if not inspector.has_table("ai_spend"):
        op.create_table(
            "ai_spend",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("run_id", sa.String(36), nullable=True),
            sa.Column("purpose", sa.String(40), nullable=False),
            sa.Column("model", sa.String(80), nullable=False),
            sa.Column("input_tokens", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("output_tokens", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("cost_usd", sa.Numeric(12, 6), nullable=False, server_default="0"),
            sa.Column("ok", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.CheckConstraint("input_tokens >= 0 AND output_tokens >= 0 AND cost_usd >= 0", name="ck_ai_spend_not_negative"),
        )
        op.create_index("ix_ai_spend_at", "ai_spend", ["at"])

    if not inspector.has_table("proposed_facts"):
        op.create_table(
            "proposed_facts",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("run_id", sa.String(36), nullable=True),
            sa.Column("status", sa.String(16), nullable=False, server_default="proposed"),
            sa.Column("indicator", sa.String(120), nullable=False),
            sa.Column("value", sa.String(80), nullable=False),
            sa.Column("unit", sa.String(60), nullable=True),
            sa.Column("period", sa.String(40), nullable=False),
            sa.Column("stage", sa.String(16), nullable=True),
            sa.Column("quote", sa.Text(), nullable=False),
            sa.Column("page", sa.Integer(), nullable=True),
            sa.Column("source_url", sa.Text(), nullable=False),
            sa.Column("paper_sha256", sa.String(64), nullable=True),
            sa.Column("evidence", sa.Text(), nullable=True),
            sa.Column("model", sa.String(80), nullable=True),
            sa.Column("reasons", postgresql.JSONB(), nullable=False, server_default="[]"),
            sa.Column("flags", postgresql.JSONB(), nullable=False, server_default="[]"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("approved_by", sa.String(120), nullable=True),
            sa.Column("rejected_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("reject_note", sa.Text(), nullable=True),
            sa.CheckConstraint("status IN ('proposed', 'verified', 'rejected', 'approved')", name="ck_proposed_fact_status"),
            sa.CheckConstraint(
                "status <> 'approved' OR (verified_at IS NOT NULL AND approved_at IS NOT NULL AND approved_by IS NOT NULL)",
                name="ck_proposed_fact_approved_complete",
            ),
            sa.CheckConstraint("status <> 'verified' OR verified_at IS NOT NULL", name="ck_proposed_fact_verified_dated"),
            sa.CheckConstraint(
                "status <> 'rejected' OR (rejected_at IS NOT NULL AND (reject_note IS NOT NULL OR jsonb_array_length(reasons) > 0))",
                name="ck_proposed_fact_rejected_explained",
            ),
        )
        op.create_index("ix_proposed_fact_status_created", "proposed_facts", ["status", "created_at"])
        op.create_index("ix_proposed_fact_key", "proposed_facts", ["indicator", "period", "stage"])


def downgrade() -> None:
    op.drop_index("ix_proposed_fact_key", table_name="proposed_facts")
    op.drop_index("ix_proposed_fact_status_created", table_name="proposed_facts")
    op.drop_table("proposed_facts")
    op.drop_index("ix_ai_spend_at", table_name="ai_spend")
    op.drop_table("ai_spend")
