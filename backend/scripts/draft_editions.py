"""Draft the next district paper editions from newly gathered official items.

Each district with new items gets one DRAFT edition. Nothing reaches readers until a
person approves and publishes it (POST /api/v1/admin/editions/{id}/approve, then /publish).

The free stand-in drafter is used unless STORY_MODEL_ENABLED=true, which switches to the
Claude API and costs money per run. --model claude refuses to run without that switch,
so a typo cannot start a paid run.

USAGE (from backend/, DATABASE_URL set)
    python scripts/draft_editions.py --all                 every district, stand-in drafter
    python scripts/draft_editions.py --district nandyal --dry-run
    STORY_MODEL_ENABLED=true python scripts/draft_editions.py --all --model claude
"""
import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import settings  # noqa: E402
from app.constants.districts import AP_DISTRICTS, normalise_district  # noqa: E402
from app.database import get_db_context  # noqa: E402
from app.services.story_drafter import ClaudeDrafter, StandInDrafter, draft_district  # noqa: E402


async def main() -> int:
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--all", action="store_true")
    g.add_argument("--district")
    ap.add_argument("--model", choices=["stand-in", "claude"], default="stand-in")
    ap.add_argument("--dry-run", action="store_true", help="draft and gate, save nothing")
    a = ap.parse_args()

    if a.model == "claude" and not settings.story_model_enabled:
        print("Refusing: --model claude needs STORY_MODEL_ENABLED=true (each run costs money).")
        return 2
    drafter = ClaudeDrafter() if a.model == "claude" else StandInDrafter()
    names = [d["name"] for d in AP_DISTRICTS] if a.all else [normalise_district(a.district)]
    if None in names or any(n not in {d["name"] for d in AP_DISTRICTS} for n in names):
        print(f"No district named {a.district!r}.")
        return 2

    print(f"Drafter: {drafter.name}{' (dry run, nothing saved)' if a.dry_run else ''}")
    for name in names:
        async with get_db_context() as db:
            rep = await draft_district(db, name, drafter, save=not a.dry_run)
            if a.dry_run:
                await db.rollback()
        print("  " + rep.line())
        for sid, errs in rep.dropped.items():
            print(f"      dropped {sid}: {errs[0]}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
