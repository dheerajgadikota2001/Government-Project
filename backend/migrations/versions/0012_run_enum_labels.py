"""refresh-log enum labels: make a migrated database store what the code writes

WHY
The refresh log (data_updates) has two Postgres enum types, run_status and
run_trigger. Migration 0005 created them with lowercase labels ('ok',
'scheduled'). The model declares them with SQLAlchemy's default, which stores
the Python enum's NAME ('OK', 'SCHEDULED'). Production never noticed, because
the API's create_all built those types from the model, uppercase, before 0005
ran. But on any database built by migrations alone (a new staging copy, a
rebuild after a disaster, CI) every refresh fails to record itself with
"invalid input value for enum run_status: OK", and the Updates page goes quiet.

Found on 22 Oct 2026 while seeding a migrated test database. Every other enum
type already matches between the two paths; tests/test_enum_labels_match.py
now holds all of them to it.

WHAT
Rename each lowercase label to its uppercase name, only where the lowercase one
exists. On production (already uppercase) this does nothing. RENAME VALUE keeps
every stored row, since rows point at the label's identity, not its text.

Revision ID: 0012
Revises: 0011
Create Date: 2026-10-22
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0012"
down_revision: Union[str, None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

LABELS = {
    "run_status": ["ok", "failed", "skipped"],
    "run_trigger": ["scheduled", "manual"],
}


def _rename(type_name: str, old: str, new: str) -> None:
    op.execute(f"""
        DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                     WHERE t.typname = '{type_name}' AND e.enumlabel = '{old}') THEN
            ALTER TYPE {type_name} RENAME VALUE '{old}' TO '{new}';
          END IF;
        END $$;
    """)


def upgrade() -> None:
    for type_name, labels in LABELS.items():
        for label in labels:
            _rename(type_name, label, label.upper())


def downgrade() -> None:
    # Back to what 0005 created. Production will then hold lowercase labels too,
    # which the code cannot write; downgrade only to go further back.
    for type_name, labels in LABELS.items():
        for label in labels:
            _rename(type_name, label.upper(), label)
