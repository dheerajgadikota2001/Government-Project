"""community — public message board (forum_posts) and private correction_reports

No accounts, no raw IPs (salted hash only), no silent edits. Correction
reports are private to the maintainer; forum posts are public with
reader-report auto-hold and maintainer removal.

Revision ID: 0003
Revises: 0002
Create Date: 2026-08-27

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

post_status = sa.Enum("VISIBLE", "HELD", "REMOVED", name="poststatus")
correction_status = sa.Enum("NEW", "REVIEWED", "FIXED", "REJECTED", name="correctionstatus")


def upgrade() -> None:
    op.create_table(
        "forum_posts",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("topic", sa.String(length=50), nullable=True),
        sa.Column("page_key", sa.String(length=100), nullable=True),
        sa.Column("parent_id", sa.BigInteger(), nullable=True),
        sa.Column("display_name", sa.String(length=40), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("lang", sa.String(length=5), nullable=False, server_default="en"),
        sa.Column("status", post_status, nullable=False, server_default="VISIBLE"),
        sa.Column("report_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reply_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ip_hash", sa.String(length=64), nullable=True),
        sa.Column("delete_token", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["parent_id"], ["forum_posts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_forum_posts_topic", "forum_posts", ["topic"])
    op.create_index("ix_forum_posts_page_key", "forum_posts", ["page_key"])
    op.create_index("ix_forum_posts_parent_id", "forum_posts", ["parent_id"])
    op.create_index("ix_forum_posts_status", "forum_posts", ["status"])
    op.create_index("ix_forum_posts_ip_hash", "forum_posts", ["ip_hash"])
    op.create_index("ix_forum_posts_created_at", "forum_posts", ["created_at"])
    op.create_index("ix_forum_topic_status_created", "forum_posts", ["topic", "status", "created_at"])
    op.create_index("ix_forum_page_status_created", "forum_posts", ["page_key", "status", "created_at"])

    op.create_table(
        "correction_reports",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("page_key", sa.String(length=200), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("contact", sa.String(length=200), nullable=True),
        sa.Column("lang", sa.String(length=5), nullable=False, server_default="en"),
        sa.Column("status", correction_status, nullable=False, server_default="NEW"),
        sa.Column("admin_note", sa.Text(), nullable=True),
        sa.Column("ip_hash", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_correction_reports_status", "correction_reports", ["status"])
    op.create_index("ix_correction_reports_created_at", "correction_reports", ["created_at"])


def downgrade() -> None:
    op.drop_table("correction_reports")
    op.drop_table("forum_posts")
    correction_status.drop(op.get_bind(), checkfirst=True)
    post_status.drop(op.get_bind(), checkfirst=True)
