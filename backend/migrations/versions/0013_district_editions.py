"""district editions: the district paper's editions, draft to published

WHY
Each district paper edition is approved by a person before any reader sees it,
numbered at publishing, and kept (Dheeraj, 21 Oct 2026). Recorded audio is made
only for an approved text. This table holds the editions and states those rules
as constraints, so no code path can show a draft or speak one. See
app/models/district_edition.py.

IF NOT EXISTS / create_all: the API's startup create_all may already have made
this table on a database where the code ran before the migration (the lesson of
0005). The table is created only when absent.

Revision ID: 0013
Revises: 0012
Create Date: 2026-10-22
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0013"
down_revision: Union[str, None] = "0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if sa.inspect(op.get_bind()).has_table("district_editions"):
        return
    op.create_table(
        "district_editions",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("district", sa.String(64), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="draft"),
        sa.Column("number", sa.Integer(), nullable=True),
        sa.Column("content", postgresql.JSONB(), nullable=False),
        sa.Column("item_ids", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("new_item_ids", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("gate", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("written_by", sa.String(120), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("audio_status", sa.String(16), nullable=False, server_default="none"),
        sa.Column("audio_url", sa.Text(), nullable=True),
        sa.Column("audio_requested_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("district", "number", name="uq_district_edition_number"),
        sa.CheckConstraint("status IN ('draft', 'approved', 'published', 'rejected')", name="ck_district_edition_status"),
        sa.CheckConstraint("audio_status IN ('none', 'requested', 'ready', 'failed')", name="ck_district_edition_audio_status"),
        sa.CheckConstraint("status <> 'published' OR (number IS NOT NULL AND approved_at IS NOT NULL AND published_at IS NOT NULL)",
                           name="ck_district_edition_published_complete"),
        sa.CheckConstraint("number IS NULL OR status = 'published'", name="ck_district_edition_number_only_published"),
        sa.CheckConstraint("audio_status = 'none' OR approved_at IS NOT NULL", name="ck_district_edition_audio_after_approval"),
    )
    op.create_index("ix_district_edition_district_status", "district_editions", ["district", "status"])


def downgrade() -> None:
    op.drop_index("ix_district_edition_district_status", table_name="district_editions")
    op.drop_table("district_editions")
