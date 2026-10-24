"""two document kinds: CAG's state accounts, and laws

WHY
CAG's audited state accounts (Finance Accounts, Appropriation Accounts,
Accounts at a Glance, Monthly Key Indicators) are not audit reports and not
the state's own annual reports, so the documents pages get their own kind for
them (app/scrapers/cag_state_accounts.py). The model stores the enum's NAME,
so the label is 'STATE_ACCOUNTS' (see 0012 and tests/test_enum_labels_match.py).
'LAW' is for the FRBM Act, its Rules and amendments (app/scrapers/ap_finance_library.py):
they bind the government, so filing them as 'policy', which the site explains as
"an intention, not a record of results", would mislead.

IF NOT EXISTS: the API's create_all may already have added it on a database
where the new code started before this migration ran.

Postgres cannot drop one label from an enum type, so downgrade leaves it; a
label no row uses does no harm.

Revision ID: 0015
Revises: 0014
Create Date: 2026-10-24
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0015"
down_revision: Union[str, None] = "0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE documenttype ADD VALUE IF NOT EXISTS 'STATE_ACCOUNTS'")
    op.execute("ALTER TYPE documenttype ADD VALUE IF NOT EXISTS 'LAW'")


def downgrade() -> None:
    pass
