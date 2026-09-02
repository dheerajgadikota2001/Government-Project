"""mous — carry provenance to the page, not just to the seed file

WHY
Twenty-six of the twenty-eight MoUs on this platform come from a newspaper
report or a company press release rather than a government document. That was
recorded in the seed file months ago as source_tier / source_label /
source_caveat, and then went nowhere: there were no columns to hold it, so the
API never served it and the page never showed it. A reader saw an investment
figure with no indication that the state had never confirmed it.

Every other section of this platform labels where its numbers come from. This
migration is what lets this one do the same. date_status comes along because
three entries have no reliable signing date and the page should say so rather
than print a guess.

Revision ID: 0004
Revises: 0003
Create Date: 2026-08-29

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # government / company / press — how far the figure is from a state document
    op.add_column("mous", sa.Column("source_tier", sa.String(length=20), nullable=True))
    # the sentence shown on the card, e.g. "Press report — not government-confirmed"
    op.add_column("mous", sa.Column("source_label", sa.String(length=200), nullable=True))
    # the longer explanation, shown when the reader opens the entry
    op.add_column("mous", sa.Column("source_caveat", sa.Text(), nullable=True))
    # "undated" where no reliable signing date exists
    op.add_column("mous", sa.Column("date_status", sa.String(length=30), nullable=True))
    op.create_index("ix_mous_source_tier", "mous", ["source_tier"])


def downgrade() -> None:
    op.drop_index("ix_mous_source_tier", table_name="mous")
    op.drop_column("mous", "date_status")
    op.drop_column("mous", "source_caveat")
    op.drop_column("mous", "source_label")
    op.drop_column("mous", "source_tier")
