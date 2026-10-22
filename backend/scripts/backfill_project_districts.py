"""Copy each project's own district into project_districts (the data step of migration 0007).

WHY THIS EXISTS
Migration 0007 creates project_districts and then fills it from projects.district.
On a database where the API had already created the empty table itself, alembic
was told the migration was done without it ever running, so the fill never
happened. This script does only that fill. It is safe to run twice: a row that
is already there is skipped (ON CONFLICT DO NOTHING).

USAGE (from backend/, DATABASE_URL set to the proxied URL)
    python scripts/backfill_project_districts.py
"""
import os
import sys

import sqlalchemy as sa

SQL = """
    INSERT INTO project_districts (project_id, district, role, source_url, source_title, note)
    SELECT id, district, 'primary', source_url, title,
           'Backfilled from the project record''s own district field.'
    FROM projects
    WHERE district IS NOT NULL AND btrim(district) <> ''
    ON CONFLICT (project_id, district, role) DO NOTHING
"""


def main() -> int:
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        print("DATABASE_URL is not set.")
        return 2
    eng = sa.create_engine(url.replace("+asyncpg", ""))
    with eng.begin() as c:   # one transaction: all rows or none
        before = c.execute(sa.text("SELECT count(*) FROM project_districts")).scalar()
        c.execute(sa.text(SQL))
        after = c.execute(sa.text("SELECT count(*) FROM project_districts")).scalar()
    print(f"project_districts: {before} before, {after} after, {after - before} added")
    return 0


if __name__ == "__main__":
    sys.exit(main())
