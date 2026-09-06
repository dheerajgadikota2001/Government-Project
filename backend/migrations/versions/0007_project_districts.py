"""Many districts per project, each with its own citation.

A single `projects.district` string cannot describe Thotapalli Barrage
(Parvathipuram Manyam + Vizianagaram + Srikakulam) or Polavaram (dam in Eluru,
submergence in Alluri Sitharama Raju and East Godavari, canals to Visakhapatnam
and Krishna). Forty-eight projects were left with a NULL district as a result
and presented to readers as "statewide", which the source never said.

`projects.district` is kept as the primary district so existing filters and
indexes keep working while this table is filled.

Revision ID: 0007
Revises: 0006
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "project_districts",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("project_id", sa.BigInteger(), nullable=False),
        sa.Column("district", sa.String(length=100), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False, server_default="stated"),
        sa.Column("source_url", sa.Text(), nullable=True),
        sa.Column("source_title", sa.String(length=500), nullable=True),
        sa.Column("source_quote", sa.Text(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "district", "role", name="uq_project_district_role"),
    )
    op.create_index("ix_project_districts_project_id", "project_districts", ["project_id"])
    op.create_index("ix_project_districts_district", "project_districts", ["district"])
    op.create_index("ix_project_districts_district_role", "project_districts", ["district", "role"])

    # Every project that already names a district gets its primary row, so the
    # new table is complete for existing data the moment it exists and the map
    # can read from it without a second migration. The citation is the project's
    # own source document — the same one the district was read from.
    op.execute("""
        INSERT INTO project_districts (project_id, district, role, source_url, source_title, note)
        SELECT id, district, 'primary', source_url, title,
               'Backfilled from the project record''s own district field.'
        FROM projects
        WHERE district IS NOT NULL AND btrim(district) <> ''
        ON CONFLICT (project_id, district, role) DO NOTHING
    """)


def downgrade() -> None:
    op.drop_index("ix_project_districts_district_role", table_name="project_districts")
    op.drop_index("ix_project_districts_district", table_name="project_districts")
    op.drop_index("ix_project_districts_project_id", table_name="project_districts")
    op.drop_table("project_districts")
