"""progress_observations — dated, cited snapshots of project progress

The foundation for per-government attribution: each row records what an
official source said a project's progress/cost/expenditure was on a
specific date. Written automatically by the MoSPI importer on every run
and backfillable from archived flash reports.

Revision ID: 0002
Revises: 0001
Create Date: 2026-08-25

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "progress_observations",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("project_id", sa.BigInteger(), nullable=False),
        sa.Column("observed_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completion_percentage", sa.Float(), nullable=True),
        sa.Column("cumulative_expenditure_crore", sa.Float(), nullable=True),
        sa.Column("estimated_cost_crore", sa.Float(), nullable=True),
        sa.Column("status_note", sa.String(length=300), nullable=True),
        sa.Column("source_portal", sa.String(length=100), nullable=False),
        sa.Column("source_url", sa.String(length=1000), nullable=True),
        sa.Column("source_label", sa.String(length=200), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "project_id", "observed_date", "source_portal",
            name="uq_progress_obs_project_date_portal",
        ),
    )
    op.create_index("ix_progress_observations_project_id", "progress_observations", ["project_id"])
    op.create_index("ix_progress_observations_observed_date", "progress_observations", ["observed_date"])


def downgrade() -> None:
    op.drop_index("ix_progress_observations_observed_date", table_name="progress_observations")
    op.drop_index("ix_progress_observations_project_id", table_name="progress_observations")
    op.drop_table("progress_observations")
