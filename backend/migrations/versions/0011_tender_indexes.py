"""tender indexes: the two the models declare and the first migration never created

WHY
The tenders model declares an index on (status, district) and one on
bid_submission_end. The first migration created separate single-column indexes
on status and district instead, and none on the bid deadline. The tenders page
asks "what is open, in this district, closing soonest", so it filters on status
and district together and sorts by the deadline. Without these two indexes that
query reads the whole table. The table is small today; the index is cheap now
and expensive to forget later.

Every other index the models name already exists under another name (for
example ix_news_category covers what the model calls ix_news_articles_category),
so nothing else is added. scripts/check_db_schema.py now compares by columns, so
a difference in name alone no longer shows up as a gap.

IF NOT EXISTS keeps this safe on a database where the API already created
them at startup.

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-22
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE INDEX IF NOT EXISTS ix_tenders_status_district ON tenders (status, district)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_tenders_bid_end ON tenders (bid_submission_end)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_tenders_bid_end")
    op.execute("DROP INDEX IF EXISTS ix_tenders_status_district")
