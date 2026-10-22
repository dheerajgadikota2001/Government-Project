"""
Every enum type in a migrated database holds exactly the labels the code writes.

The API's create_all and the alembic migrations are two ways to build the same
database. When they disagree on an enum's labels, the database that was built by
migrations rejects every write of that column. That happened to the refresh log
(fixed by migration 0012): 0005 made 'ok', the model writes 'OK'. Production was
built the other way and never saw it.

This test runs against the test database, which CI builds with `alembic upgrade
head`, so it is the migrations' answer that gets checked.
"""

import pytest
import sqlalchemy as sa

from app.database import get_db_context
from app.models import Base


def model_enums() -> dict[str, list[str]]:
    out = {}
    for table in Base.metadata.tables.values():
        for col in table.columns:
            t = col.type
            if isinstance(t, sa.Enum) and t.name:
                out[t.name] = list(t.enums)
    return out


@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_every_enum_type_holds_the_labels_the_code_writes():
    async with get_db_context() as db:
        rows = (await db.execute(sa.text(
            "SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder) "
            "FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid GROUP BY t.typname"
        ))).all()
    in_db = {name: list(labels) for name, labels in rows}
    wrong = {}
    for name, labels in model_enums().items():
        if name not in in_db:
            wrong[name] = "type missing from the database"
        elif set(labels) - set(in_db[name]):
            wrong[name] = f"code writes {sorted(set(labels) - set(in_db[name]))}, database has {in_db[name]}"
    assert not wrong, wrong
