"""Batch statistics and cited-source watching.

Two tables that let the platform check itself:

  scrape_stats — the shape of every batch a scraper wrote, so the next run can
  tell "the data changed" from "the parser broke". Without a persisted baseline
  a Cloud Run job has no memory at all: the container that ran yesterday is gone.

  source_watch — one row per citation URL in the seed files, so a new edition,
  a revised page or a dead link is noticed by the platform rather than by a
  reader.

Revision ID: 0006
Revises: 0005
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "scrape_stats",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("scraper", sa.String(length=100), nullable=False),
        sa.Column("rows", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("stats", postgresql.JSONB(astext_type=sa.Text()), nullable=False,
                  server_default=sa.text("'{}'::jsonb")),
        sa.Column("rejected", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rejected_reason", sa.String(length=500), nullable=True),
        sa.Column("aborted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("abort_reason", sa.String(length=1000), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_scrape_stats_run_id", "scrape_stats", ["run_id"])
    op.create_index("ix_scrape_stats_scraper", "scrape_stats", ["scraper"])
    op.create_index("ix_scrape_stats_scraper_created", "scrape_stats", ["scraper", "created_at"])

    op.create_table(
        "source_watch",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("source_key", sa.String(length=120), nullable=False),
        sa.Column("seed_file", sa.String(length=120), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("publisher", sa.String(length=200), nullable=True),
        sa.Column("title", sa.String(length=600), nullable=True),
        sa.Column("cited_date", sa.String(length=20), nullable=True),
        sa.Column("http_status", sa.Integer(), nullable=True),
        sa.Column("etag", sa.String(length=200), nullable=True),
        sa.Column("last_modified", sa.String(length=100), nullable=True),
        sa.Column("links_hash", sa.String(length=64), nullable=True),
        sa.Column("latest_edition", sa.String(length=20), nullable=True),
        sa.Column("state", sa.String(length=20), nullable=False, server_default="ok"),
        sa.Column("pending_fingerprint", sa.String(length=64), nullable=True),
        sa.Column("pending_since", sa.DateTime(timezone=True), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("muted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("first_seen_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        sa.Column("last_checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_changed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("consecutive_failures", sa.Integer(), nullable=False, server_default="0"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_source_watch_source_key", "source_watch", ["source_key"])
    op.create_index("ix_source_watch_state", "source_watch", ["state"])
    op.create_index("ix_source_watch_key_file", "source_watch",
                    ["source_key", "seed_file"], unique=True)
    op.create_index("ix_source_watch_state_confirmed", "source_watch",
                    ["state", "confirmed_at"])


def downgrade() -> None:
    op.drop_index("ix_source_watch_state_confirmed", table_name="source_watch")
    op.drop_index("ix_source_watch_key_file", table_name="source_watch")
    op.drop_index("ix_source_watch_state", table_name="source_watch")
    op.drop_index("ix_source_watch_source_key", table_name="source_watch")
    op.drop_table("source_watch")
    op.drop_index("ix_scrape_stats_scraper_created", table_name="scrape_stats")
    op.drop_index("ix_scrape_stats_scraper", table_name="scrape_stats")
    op.drop_index("ix_scrape_stats_run_id", table_name="scrape_stats")
    op.drop_table("scrape_stats")
