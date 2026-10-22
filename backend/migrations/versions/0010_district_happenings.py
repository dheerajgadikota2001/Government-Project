"""District happenings: collectorate notices, PIB releases and Lok Sabha answers per district.

Revision ID: 0010
Revises: 0009
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "district_happenings",
        sa.Column("id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column("district", sa.String(length=64), nullable=False),
        sa.Column("source_kind", sa.String(length=16), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("date_end", sa.Date(), nullable=True),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("file_url", sa.Text(), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("figures", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("meta", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("personal_list", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("content_sha256", sa.String(length=64), nullable=False),
        sa.UniqueConstraint("district", "source_kind", "url", "title", name="uq_district_happening_key"),
        sa.CheckConstraint("source_kind IN ('district_site', 'pib', 'lok_sabha')", name="ck_district_happening_kind"),
        sa.CheckConstraint(
            "NOT personal_list OR (summary IS NULL AND file_url IS NULL AND figures = '[]'::jsonb)",
            name="ck_district_happening_personal_list_bare",
        ),
        sa.CheckConstraint("content_sha256 ~ '^[0-9a-f]{64}$'", name="ck_district_happening_sha_hex"),
    )
    op.create_index("ix_district_happening_district_date", "district_happenings", ["district", "date"])
    op.create_index("ix_district_happening_kind_date", "district_happenings", ["source_kind", "date"])


def downgrade() -> None:
    op.drop_index("ix_district_happening_kind_date", table_name="district_happenings")
    op.drop_index("ix_district_happening_district_date", table_name="district_happenings")
    op.drop_table("district_happenings")
