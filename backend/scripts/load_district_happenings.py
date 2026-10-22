"""
Load seed/district_happenings_seed.json into district_happenings.

Safe to run any number of times. A row already in the table only has its
last_seen_at moved; nothing is overwritten and nothing is deleted. Every row
goes back through prepare() on the way in, so a seed edited by hand still meets
the same rules as a scraped row (no voter lists, personal lists bare).

    python scripts/load_district_happenings.py
    python scripts/load_district_happenings.py --seed path/to/other_seed.json
"""

import argparse
import asyncio
import json
import os
import sys
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from app.services.district_happenings import prepare_many, upsert

SEED = os.path.join(ROOT, "seed", "district_happenings_seed.json")


def read_seed(path: str) -> tuple[list[dict], list[str]]:
    with open(path, encoding="utf-8") as fh:
        doc = json.load(fh)
    rows, refused = prepare_many(doc["rows"])
    first = {(r["district"], r["source_kind"], r["url"], r["title"]): r.get("first_seen_at") for r in doc["rows"]}
    for r in rows:
        stamp = first.get((r["district"], r["source_kind"], r["url"], r["title"]))
        if stamp:
            r["first_seen_at"] = datetime.fromisoformat(stamp)
    return rows, refused


async def load(path: str = SEED) -> tuple[int, int]:
    from app.database import get_db_context

    rows, refused = read_seed(path)
    if refused:
        # The seed was gated when it was built. A refusal here means it was edited
        # since, and loading the rest would hide that.
        raise SystemExit("seed rows refused, nothing loaded:\n  " + "\n  ".join(refused[:20]))
    async with get_db_context() as db:
        return await upsert(db, rows)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", default=SEED)
    a = ap.parse_args()
    new, again = asyncio.run(load(a.seed))
    print(f"district_happenings: {new} new, {again} already there")
    return 0


if __name__ == "__main__":
    sys.exit(main())
