"""Live readings: shaped payloads read from official live dashboards (APWRIMS first).

Revision ID: 0009
Revises: 0008
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "live_readings",
        sa.Column("id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column("source_key", sa.String(length=64), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("as_on", sa.String(length=64), nullable=True),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("payload_sha256", sa.String(length=64), nullable=False),
        sa.UniqueConstraint("source_key", "payload_sha256", name="uq_live_reading_source_payload"),
        sa.CheckConstraint("payload_sha256 ~ '^[0-9a-f]{64}$'", name="ck_live_reading_sha_hex"),
    )
    op.create_index("ix_live_reading_source_read_at", "live_readings", ["source_key", "read_at"])


def downgrade() -> None:
    op.drop_index("ix_live_reading_source_read_at", table_name="live_readings")
    op.drop_table("live_readings")
