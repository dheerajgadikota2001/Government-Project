"""
Check every cited source and mail what needs a person.

This is the second scheduled job, and it answers the question the refresh job
cannot: the scrapers can be running perfectly while the *seed* data — the
hand-transcribed figures that carry this platform's headline numbers — quietly
goes a year out of date. Nothing in a scraper run would ever notice.

    python scripts/run_watcher.py                # check and mail
    python scripts/run_watcher.py --dry-run      # check, print, mail nothing
    python scripts/run_watcher.py --list         # what is being watched, no fetches

Run it weekly. The sources it watches publish once or twice a year; checking
139 government pages every morning would be rude to them and pointless to us.
"""

import argparse
import asyncio
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services import alerts
from app.services.source_watch import cited_sources, run_watch
from app.utils.logger import logger


def _needs_you(findings: dict) -> list[dict]:
    """Turn watcher findings into instructions, not observations.

    Whoever reads this is looking at a phone. "The page changed" is a fact they
    then have to think about; "re-check the figures against it" is something
    they can act on or defer.
    """
    items = []
    for f in findings.get("new_edition", []):
        items.append({
            "kind": "new edition",
            "title": f.get("publisher") or f["source_key"],
            "detail": f"Cited: {f.get('cited_date') or 'undated'}\n{f.get('title') or ''}\n{f['detail']}",
            "url": f["url"],
            "action": f"Transcribe the new edition into {f['seed_file']} ({f['source_key']})",
        })
    for f in findings.get("changed", []):
        items.append({
            "kind": "source revised",
            "title": f.get("publisher") or f["source_key"],
            "detail": f"{f.get('title') or ''}\n{f['detail']}",
            "url": f["url"],
            "action": f"Re-check the figures citing {f['source_key']} in {f['seed_file']}",
        })
    return items


async def main(dry_run: bool) -> int:
    started = datetime.now(timezone.utc)
    findings = await run_watch()

    report = {
        "run_id": f"watch-{started:%Y%m%d}",
        "started_at": started,
        "duration_s": (datetime.now(timezone.utc) - started).total_seconds(),
        "needs_you": _needs_you(findings),
        "blocked": [],
        "changed": [],
        "quiet": [],
        "dead": findings.get("dead", []),
        "heartbeat": alerts.is_heartbeat_day(),
    }

    subject, body = alerts.build_body(report)
    if dry_run:
        print(f"SUBJECT: {subject}\n")
        print(body)
        return 0

    result = await alerts.send(report)
    logger.info(f"[watch] alert: {result}")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--dry-run", action="store_true",
                        help="print the email instead of sending it")
    parser.add_argument("--list", action="store_true",
                        help="list the watched citations and exit — no network")
    args = parser.parse_args()

    if args.list:
        sources = cited_sources()
        by_file: dict[str, int] = {}
        for source in sources:
            by_file[source["seed_file"]] = by_file.get(source["seed_file"], 0) + 1
        for name, count in sorted(by_file.items()):
            print(f"{count:4}  {name}")
        print(f"{len(sources):4}  TOTAL")
        raise SystemExit(0)

    raise SystemExit(asyncio.run(main(args.dry_run)))
