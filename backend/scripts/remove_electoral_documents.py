"""
Remove voter-roll (electoral roll) documents from the register, and keep a record of what went.

The district collectorate sites mix election-office uploads into the same Documents
section as real development papers. Each one is a polling booth's voter list, with every
voter's name, age and house number. This platform does not keep voter lists. The district
scraper skips them on every run (is_electoral_document in app/scrapers/district_documents.py);
this script clears any that got in before the rule knew their shape.

Usage (from backend/):
    python scripts/remove_electoral_documents.py                       # dry run: list them, change nothing
    python scripts/remove_electoral_documents.py --apply --expect 232  # delete exactly the reviewed set

A dry run is the default, because a delete cannot be taken back from the page. --apply
needs --expect N and refuses unless exactly N documents match: if the rule or the data
changed after you read the dry run, nothing is deleted and you look again.

Before anything is deleted, the matching rows are written to logs/removed-electoral-<time>.csv
(titles, offices, links and dates; we never held the files' contents) and printed, one line
each, so a run inside a Cloud Run job leaves its record in Cloud Logging. The CSV stays out
of git with the rest of logs/.

On production, run it as a one-off execution of the refresh job, after that job carries
this code (docs/REFRESH-JOB.md):
    gcloud run jobs execute apnn-refresh --project ap-nadu-nedu --region asia-south1 --wait `
      --args="scripts/remove_electoral_documents.py"
then, when the dry run's count is the one you expect:
    ... --args="scripts/remove_electoral_documents.py,--apply,--expect,232"
"""

import argparse
import asyncio
import csv
import os
import sys
from collections import Counter
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import delete, select

from app.database import get_db_context
from app.models.document import Document
from app.models.document_link import DocumentLink
from app.scrapers.district_documents import is_electoral_document

LOG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "logs")
COLUMNS = ("id", "title", "department", "source_url", "published_date", "retrieved_at")


async def find_matches(db) -> tuple[int, list]:
    rows = (await db.execute(select(
        Document.id, Document.title, Document.department, Document.source_url,
        Document.published_date, Document.retrieved_at,
    ))).all()
    return len(rows), [r for r in rows if r.title and is_electoral_document(r.title)]


def report(total: int, matches: list) -> None:
    """Counts by office, and a few titles from each, so the dry run can be judged by eye."""
    print(f"Scanned {total} documents; {len(matches)} look like voter-roll parts.")
    for office, n in Counter(r.department or "(no office)" for r in matches).most_common():
        print(f"  {n:4d}  {office}")
        for r in [m for m in matches if (m.department or "(no office)") == office][:4]:
            print(f"          e.g. {r.title[:90]}")


def write_record(matches: list) -> str:
    os.makedirs(LOG_DIR, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    path = os.path.join(LOG_DIR, f"removed-electoral-{stamp}.csv")
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(COLUMNS)
        for r in matches:
            w.writerow([getattr(r, c) for c in COLUMNS])
    return path


async def main(apply: bool, expect: int | None) -> int:
    async with get_db_context() as db:
        total, matches = await find_matches(db)
        report(total, matches)

        if not matches:
            print("Nothing to remove.")
            return 0
        if not apply:
            print(f"Dry run: nothing deleted. To delete these, run again with --apply --expect {len(matches)}")
            return 0
        if expect is None:
            print("Refusing: --apply needs --expect N, the count you checked in the dry run.")
            return 2
        if len(matches) != expect:
            print(f"Refusing: {len(matches)} match now, but you expected {expect}. Run the dry run again and check.")
            return 2

        path = write_record(matches)
        # The same record goes to the console too. Run as a Cloud Run job, the container and its
        # logs/ folder are gone a minute later; Cloud Logging keeps these lines.
        for r in matches:
            print(f"removed id={r.id} | {r.department} | {r.title} | {r.source_url}")
        ids = [r.id for r in matches]
        # Links cascade at the database, but say it here too: no row may point at a removed paper.
        await db.execute(delete(DocumentLink).where(DocumentLink.document_id.in_(ids)))
        await db.execute(delete(Document).where(Document.id.in_(ids)))
        await db.commit()

        remaining, still = await find_matches(db)
        print(f"Deleted {len(ids)} voter-roll documents. Record of what went: {path}")
        print(f"Documents now: {remaining} (was {total}). Voter-roll matches left: {len(still)}.")
        return 0 if not still else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Remove voter-roll documents from the register.")
    ap.add_argument("--apply", action="store_true", help="delete; without it this is a dry run")
    ap.add_argument("--expect", type=int, help="with --apply: delete only if exactly this many match")
    ap.add_argument("--dry-run", action="store_true", help="kept for old habits; a dry run is the default")
    args = ap.parse_args()
    sys.exit(asyncio.run(main(apply=args.apply and not args.dry_run, expect=args.expect)))
