"""data_updates — the platform's own audit trail

WHY
Refreshes used to leave a count in a log file on whoever's laptop ran them. In
production the refresh runs in a Cloud Run job whose container is destroyed the
moment it finishes, taking its logs with it — so the record of what changed had
nowhere to live, and the site could not answer the one question a transparency
platform must answer about itself: what was updated, when, and from where.

This table is what the public /updates page reads. One row per source per run,
grouped by run_id. Failures are rows too: a source quietly failing for a week is
exactly what would otherwise go unnoticed until a reader spotted a stale figure.

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-02

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    run_status = sa.Enum("ok", "failed", "skipped", name="run_status")
    run_trigger = sa.Enum("scheduled", "manual", name="run_trigger")

    op.create_table(
        "data_updates",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("source", sa.String(length=200), nullable=False),
        sa.Column("scraper", sa.String(length=100), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_seconds", sa.Float(), nullable=True),
        sa.Column("status", run_status, nullable=False),
        sa.Column("trigger", run_trigger, nullable=False),
        sa.Column("records_new", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("records_updated", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("samples", postgresql.JSONB(astext_type=sa.Text(), none_as_null=True), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_data_updates_run_id", "data_updates", ["run_id"])
    # The page always asks "what happened most recently", never "what happened
    # to this id" — both indexes serve that read.
    op.create_index("ix_data_updates_finished_at", "data_updates", ["finished_at"])
    op.create_index("ix_data_updates_source_finished", "data_updates", ["source", "finished_at"])


def downgrade() -> None:
    op.drop_index("ix_data_updates_source_finished", table_name="data_updates")
    op.drop_index("ix_data_updates_finished_at", table_name="data_updates")
    op.drop_index("ix_data_updates_run_id", table_name="data_updates")
    op.drop_table("data_updates")
    sa.Enum(name="run_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="run_trigger").drop(op.get_bind(), checkfirst=True)
