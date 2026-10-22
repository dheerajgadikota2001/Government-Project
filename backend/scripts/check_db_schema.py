"""Read-only report of what a database really contains, next to what alembic believes.

WHY THIS EXISTS
The API creates any missing table by itself when it starts (app/database.py,
init_db). That is handy, but it means a database can hold tables that alembic
never ran a migration for. Then `alembic upgrade head` tries to create them
again and stops with "already exists". This script shows exactly which case a
database is in before anything is changed.

It only runs SELECTs and never writes. It prints names and counts, no row data
and no connection details.

USAGE (from backend/, with DATABASE_URL set to the proxied URL)
    python scripts/check_db_schema.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import sqlalchemy as sa  # noqa: E402

from app.models import Base  # noqa: E402  (importing registers every model)

# The table (or tables) each migration creates, from the migration files.
MIGRATION_TABLES = {
    "0005": ["data_updates"],
    "0006": ["scrape_stats", "source_watch"],
    "0007": ["project_districts"],
    "0008": ["archived_files", "archived_file_sources"],
    "0009": ["live_readings"],
    "0010": ["district_happenings"],
}


def main() -> int:
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        print("DATABASE_URL is not set.")
        return 2
    eng = sa.create_engine(url.replace("+asyncpg", ""))   # a plain postgresql:// URL uses psycopg2
    with eng.connect() as c:
        c.execute(sa.text("SET TRANSACTION READ ONLY"))
        insp = sa.inspect(c)
        tables = set(insp.get_table_names())

        if "alembic_version" in tables:
            ver = [r[0] for r in c.execute(sa.text("SELECT version_num FROM alembic_version"))]
        else:
            ver = []
        print(f"alembic_version: {ver or 'none'}")
        print()

        print("Each migration, and whether its tables are already in the database:")
        for rev, names in MIGRATION_TABLES.items():
            have = [n for n in names if n in tables]
            state = "ALL PRESENT" if len(have) == len(names) else ("PARTLY" if have else "absent")
            print(f"  {rev}  {state:12} {', '.join(names)}")
        print()

        enums = [r[0] for r in c.execute(sa.text("SELECT typname FROM pg_type WHERE typtype = 'e' ORDER BY 1"))]
        print(f"enum types in the database: {', '.join(enums) or 'none'}")
        print()

        print("Row counts (names and numbers only):")
        for t in ["projects", "project_districts", "data_updates", "district_happenings", "archived_files", "live_readings"]:
            if t in tables:
                n = c.execute(sa.text(f'SELECT count(*) FROM "{t}"')).scalar()
                print(f"  {t:24} {n}")
            else:
                print(f"  {t:24} (no such table)")
        if "projects" in tables:
            n = c.execute(sa.text("SELECT count(*) FROM projects WHERE district IS NOT NULL AND btrim(district) <> ''")).scalar()
            print(f"  projects naming a district  {n}   (0007 copies each of these into project_districts)")
        print()

        c.rollback()

    # Compare the tables these migrations create with what the code expects: missing
    # columns and indexes. Each table gets its own short connection, so one dropped
    # connection to a small database cannot hide the rest of the report.
    problems = []
    for rev, names in MIGRATION_TABLES.items():
        for name in names:
            if name not in tables:
                continue
            table = Base.metadata.tables[name]
            for attempt in (1, 2, 3):
                try:
                    with eng.connect() as c2:
                        insp2 = sa.inspect(c2)
                        cols = {x["name"] for x in insp2.get_columns(name)}
                        have_ix = {x["name"] for x in insp2.get_indexes(name)}
                    break
                except sa.exc.OperationalError:
                    cols, have_ix = None, None
            if cols is None:
                problems.append(f"could not read {name} (connection dropped three times)")
                continue
            for col in table.columns:
                if col.name not in cols:
                    problems.append(f"column missing: {name}.{col.name}")
            for ix in table.indexes:
                if ix.name and ix.name not in have_ix:
                    problems.append(f"index missing: {name}.{ix.name}")
    print("Tables from migrations 0005 to 0010, compared with the code's models:")
    if problems:
        for p in problems:
            print("  " + p)
    else:
        print("  nothing missing")
    return 0


if __name__ == "__main__":
    sys.exit(main())
