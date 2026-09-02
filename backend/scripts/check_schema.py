"""Print what the database actually has, and what Alembic thinks it has.

WHY THIS EXISTS
This project creates its tables two ways: `create_all` at application startup, and
Alembic migrations. When the app has run first, the tables exist but Alembic's
version table still points at an older revision, so `alembic upgrade head` tries to
re-create a table that is already there and dies with DuplicateTable. That looks
alarming and is harmless -- but you cannot tell which it is without seeing both
sides. This prints both.

    python scripts/check_schema.py
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.database import get_db_context

EXPECTED_BY_REVISION = {
    "0001": ["projects", "mous", "tenders", "news_articles", "documents"],
    "0002": ["progress_observations"],
    "0003": ["forum_posts", "correction_reports"],
}
MOU_PROVENANCE = ["source_tier", "source_label", "source_caveat", "date_status"]


async def main():
    async with get_db_context() as db:
        tables = {
            r[0]
            for r in await db.execute(
                text("SELECT table_name FROM information_schema.tables "
                     "WHERE table_schema = 'public'")
            )
        }
        stamped = [
            r[0]
            for r in await db.execute(text("SELECT version_num FROM alembic_version"))
        ] if "alembic_version" in tables else []
        mou_cols = {
            r[0]
            for r in await db.execute(
                text("SELECT column_name FROM information_schema.columns "
                     "WHERE table_name = 'mous'")
            )
        }

    print(f"Alembic thinks the database is at: {stamped or 'nothing stamped'}")
    print()
    for rev, expect in EXPECTED_BY_REVISION.items():
        have = [t for t in expect if t in tables]
        miss = [t for t in expect if t not in tables]
        state = "present" if not miss else f"MISSING {', '.join(miss)}"
        print(f"  {rev}: {len(have)}/{len(expect)} tables {state}")

    missing_cols = [c for c in MOU_PROVENANCE if c not in mou_cols]
    print(f"  0004: mous provenance columns "
          f"{'present' if not missing_cols else 'MISSING ' + ', '.join(missing_cols)}")
    print()

    real = max((r for r, e in EXPECTED_BY_REVISION.items()
                if all(t in tables for t in e)), default=None)
    if not missing_cols:
        print("Everything is applied. Nothing to do.")
    elif real and stamped and stamped[0] < real:
        print(f"The tables are really at {real} but Alembic is stamped {stamped[0]} —")
        print("the app's create_all built them, so the migrations were never recorded.")
        print("Tell Alembic the truth, then apply only the new one:")
        print(f"    alembic stamp {real}")
        print("    alembic upgrade head")
    else:
        print("Run:  alembic upgrade head")


if __name__ == "__main__":
    asyncio.run(main())
