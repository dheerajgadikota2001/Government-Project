"""Print what the database actually has, and what Alembic thinks it has.

WHY THIS EXISTS
This project creates its tables two ways: `create_all` at application startup, and
Alembic migrations. When the app has run first, the tables exist but Alembic's
version table still points at an older revision, so `alembic upgrade head` tries to
re-create a table that is already there and dies with DuplicateTable. That looks
alarming and is harmless, but you cannot tell which it is without seeing both
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
    "0004": [],                                  # columns only, checked below
    "0005": ["data_updates"],
    "0006": ["scrape_stats", "source_watch"],
    "0007": ["project_districts"],
}
HEAD = "0007"
MOU_PROVENANCE = ["source_tier", "source_label", "source_caveat", "date_status"]


async def main():
    async with get_db_context() as db:
        tables = {
            r[0] for r in await db.execute(text(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"))
        }
        mou_cols = {
            r[0] for r in await db.execute(text(
                "SELECT column_name FROM information_schema.columns WHERE table_name = 'mous'"))
        } if "mous" in tables else set()
        stamped = [
            r[0] for r in await db.execute(text("SELECT version_num FROM alembic_version"))
        ] if "alembic_version" in tables else []

    from app.config import database_target
    print(f"Database inspected: {database_target()}")
    print(f"Alembic thinks the database is at: {stamped[0] if stamped else 'nothing stamped'}")
    print(f"Newest migration in the repo:      {HEAD}")
    print()
    print("What each revision's tables look like in the real database:")
    present = {}
    for rev, expect in EXPECTED_BY_REVISION.items():
        if rev == "0004":
            have = [c for c in MOU_PROVENANCE if c in mou_cols]
            present[rev] = len(have) == len(MOU_PROVENANCE)
            print(f"  {rev}: mous provenance columns {len(have)}/{len(MOU_PROVENANCE)} "
                  f"{'present' if present[rev] else 'MISSING'}")
            continue
        have = [t for t in expect if t in tables]
        present[rev] = len(have) == len(expect)
        state = "present" if present[rev] else ("PARTIAL" if have else "MISSING")
        print(f"  {rev}: {len(have)}/{len(expect)} tables {state}"
              + ("" if present[rev] else f"   (missing: {', '.join(t for t in expect if t not in tables)})"))
    print()

    # The plan. Walk forward from what Alembic believes. A revision whose
    # objects already exist was built by create_all and must be STAMPED, not
    # run, or Alembic dies on DuplicateTable. One that is absent must be RUN.
    order = list(EXPECTED_BY_REVISION)
    # `real` is the newest revision whose objects, and all older ones, exist.
    real_idx = -1
    for i, rev in enumerate(order):
        if present[rev]:
            real_idx = i
        else:
            break
    real = order[real_idx] if real_idx >= 0 else None
    stamped_rev = stamped[0] if stamped and stamped[0] in order else None
    steps = []
    if stamped_rev and real and order.index(stamped_rev) > order.index(real):
        # The record claims more than the database holds. A stamp was applied
        # without the migration running, so Alembic will skip work that was
        # never done. Wind the record back to the truth first.
        print(f"Alembic is stamped at {stamped_rev} but the newest fully present revision is {real}.")
        print("The record is ahead of the database. Winding it back before applying anything.")
        print()
        steps.append(("stamp", real))
        start_at = order.index(real) + 1
    else:
        start_at = order.index(stamped_rev) + 1 if stamped_rev else 0
    for rev in order[start_at:]:
        steps.append(("stamp" if present[rev] else "upgrade", rev))
    if not steps:
        print("Everything is applied and recorded. Nothing to do.")
        return
    print("Run these, in this order, from the backend folder with the proxy up:")
    for kind, rev in steps:
        print(f"    alembic {kind} {rev}" + ("      # already built by create_all; record it" if kind == "stamp" else "      # actually creates the missing objects"))
    print()
    print("Then run this script again. It should say nothing to do.")


if __name__ == "__main__":
    asyncio.run(main())
