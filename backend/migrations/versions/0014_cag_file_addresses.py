"""cag file addresses: move every saved CAG report link to where CAG serves it now

WHY
In October 2026 CAG moved its report files from cag.gov.in/webroot/uploads/ to
d1jmc0u14z2tmp.cloudfront.net/uploads/ and kept every file name. Every one of
our 73 CAG report links answered "not found". On 24 Oct 2026 all 73 swapped
addresses were opened and each was a real PDF, and the swapped set matched
CAG's own list one for one. See app/scrapers/cag_address.py.

Only the start of the address changes, and only on addresses that begin with
the old upload folder. Detail pages and listing pages on cag.gov.in still work
and are left alone.

The scraper also moves a row it finds under the old address, so this
migration and the next refresh agree. Running both is safe: whichever goes
first, the other finds nothing left to move.

Columns that may hold a link to a file: the ones below. A column or table that
is not there on this database is skipped, as in 0005 (the API's create_all can
run before migrations do).

Revision ID: 0014
Revises: 0013
Create Date: 2026-10-24
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0014"
down_revision: Union[str, None] = "0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OLD = "https://cag.gov.in/webroot/uploads/"
NEW = "https://d1jmc0u14z2tmp.cloudfront.net/uploads/"

COLUMNS = [
    ("documents", "source_url"),
    ("documents", "source_page_url"),
    ("document_links", "collected_from_url"),
    ("projects", "source_url"),
    ("project_districts", "source_url"),
    ("progress_observations", "source_url"),
    ("mous", "source_url"),
    ("tenders", "source_url"),
    ("district_happenings", "url"),
    ("district_happenings", "file_url"),
]


def _move(src: str, dst: str) -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    for table, column in COLUMNS:
        if not insp.has_table(table) or column not in {c["name"] for c in insp.get_columns(table)}:
            continue
        # A row is moved only if no other row already holds the new address, so a
        # unique index on the column can never make this migration fail halfway.
        bind.execute(sa.text(f"""
            UPDATE {table} AS t
               SET {column} = :dst || substr(t.{column}, length(:src) + 1)
             WHERE t.{column} LIKE :pattern
               AND NOT EXISTS (
                   SELECT 1 FROM {table} AS o
                    WHERE o.{column} = :dst || substr(t.{column}, length(:src) + 1))
        """), {"src": src, "dst": dst, "pattern": src.replace("_", r"\_") + "%"})


def upgrade() -> None:
    _move(OLD, NEW)


def downgrade() -> None:
    _move(NEW, OLD)
