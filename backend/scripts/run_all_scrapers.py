"""
Run the scrapers and record what each one did.

This is the one command that refreshes the platform's data, and it is what the
Cloud Run job executes on a schedule. Every scraper dedupes against the
database, so it is always safe to re-run.

    python scripts/run_all_scrapers.py                     # everything
    python scripts/run_all_scrapers.py --only tenders      # just the fast group
    python scripts/run_all_scrapers.py --only news
    python scripts/run_all_scrapers.py --trigger scheduled # how the job calls it

GROUPS
Sources move at different speeds, and pretending otherwise wastes both our time
and the portals'. Audit reports and budget volumes appear a few times a month;
tenders and news change through the day. So the schedule runs `daily` once each
morning and `tenders`/`news` on their own shorter cycles.

WHAT IT WRITES
Each scraper's outcome becomes a row in data_updates — source, duration,
records found, and the first line of the error if it broke. That table is what
the public /updates page reads. A scraper that fails is recorded and the run
carries on: one dead portal must never cost us the other five.
"""

import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.scrapers.amrut_projects import AmrutProjectsScraper
from app.scrapers.ap_finance_budget import APFinanceBudgetScraper
from app.scrapers.cag_documents import CAGDocumentsScraper
from app.scrapers.crda_tenders import CrdaTendersScraper
from app.scrapers.district_documents import DistrictDocumentsScraper
from app.scrapers.mospi_projects import MospiProjectsScraper
from app.scrapers.neva_notices import NevaNoticesScraper
from app.models.data_update import RunTrigger
from app.services.run_recorder import new_run_id, track
from app.utils.logger import logger

# (group, public source name, scraper class). The source name is what appears on
# the /updates page, so it matches the wording on the Data Sources page rather
# than the class name.
SCRAPERS = [
    ("daily", "NeVA assembly notice board", NevaNoticesScraper),
    ("daily", "CAG audit reports", CAGDocumentsScraper),
    ("daily", "AP Finance budget volumes", APFinanceBudgetScraper),
    ("daily", "District collectorates (26 districts)", DistrictDocumentsScraper),
    ("daily", "AMRUT 2.0 urban projects (MoHUA)", AmrutProjectsScraper),
    ("daily", "Central-sector projects (MoSPI flash report)", MospiProjectsScraper),
    ("tenders", "AP CRDA tenders", CrdaTendersScraper),
]

GROUPS = sorted({group for group, _, _ in SCRAPERS})


async def main(groups: list[str], trigger: RunTrigger) -> int:
    run_id = new_run_id()
    selected = [row for row in SCRAPERS if row[0] in groups]
    if not selected:
        logger.error(f"No scrapers in group(s) {groups}. Known groups: {', '.join(GROUPS)}")
        return 2

    logger.info(f"Refresh run {run_id} — {len(selected)} source(s), trigger={trigger.value}")
    summary: list[tuple[str, str]] = []

    for _group, name, cls in selected:
        logger.info(f"=== {name} ===")
        async with track(run_id, name, cls, trigger) as slot:
            slot["records_new"] = await cls().scrape()
        if slot.get("failed"):
            summary.append((name, "FAILED"))
        else:
            summary.append((name, f"{slot['records_new']} new"))

    logger.info("=" * 50)
    logger.info(f"Run {run_id} summary:")
    for name, outcome in summary:
        logger.info(f"  {name}: {outcome}")

    # A non-zero exit is what makes Cloud Scheduler mark the run failed and
    # trigger the alert, so a run where every source broke must not look fine.
    failed = [name for name, outcome in summary if outcome == "FAILED"]
    if failed and len(failed) == len(summary):
        logger.error("Every source failed — exiting non-zero so the job is flagged.")
        return 1
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--only", choices=GROUPS, action="append", help="run only this group (repeatable)")
    parser.add_argument("--trigger", choices=[t.value for t in RunTrigger], default=RunTrigger.MANUAL.value,
                        help="who started this run; the Cloud Run job passes 'scheduled'")
    args = parser.parse_args()
    raise SystemExit(asyncio.run(main(args.only or GROUPS, RunTrigger(args.trigger))))
