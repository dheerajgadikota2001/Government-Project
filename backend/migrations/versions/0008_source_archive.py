"""The source archive register: archived_files and archived_file_sources.

The bytes live in the object store, named by SHA-256 (app/services/archive.py).
These tables say which files we hold and where and when each was found.

Revision ID: 0008
Revises: 0007
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "archived_files",
        sa.Column("sha256", sa.String(length=64), primary_key=True),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("stored_bytes", sa.BigInteger(), nullable=False),
        sa.Column("codec", sa.String(length=10), nullable=False),
        sa.Column("content_type", sa.String(length=120), nullable=False),
        sa.Column("page_count", sa.BigInteger(), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("integrity_problem", sa.Text(), nullable=True),
        sa.CheckConstraint("sha256 ~ '^[0-9a-f]{64}$'", name="ck_archived_sha_hex"),
        sa.CheckConstraint("codec in ('zstd','none')", name="ck_archived_codec"),
    )
    op.create_table(
        "archived_file_sources",
        sa.Column("id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column("sha256", sa.String(length=64), sa.ForeignKey("archived_files.sha256", ondelete="CASCADE"), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("page_url", sa.Text(), nullable=True),
        sa.Column("publisher", sa.String(length=200), nullable=True),
        sa.Column("title", sa.String(length=500), nullable=True),
        sa.Column("first_fetched_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_fetched_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.UniqueConstraint("sha256", "url", name="uq_archived_source_sha_url"),
    )
    op.create_index("ix_archived_file_sources_sha256", "archived_file_sources", ["sha256"])
    op.create_index("ix_archived_source_url", "archived_file_sources", ["url"])


def downgrade() -> None:
    op.drop_index("ix_archived_source_url", table_name="archived_file_sources")
    op.drop_index("ix_archived_file_sources_sha256", table_name="archived_file_sources")
    op.drop_table("archived_file_sources")
    op.drop_table("archived_files")
