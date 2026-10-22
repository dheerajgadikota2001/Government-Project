"""
Run the scrapers and record what each one did.

This is the one command that refreshes the platform's data, and it is what the
Cloud Run job executes on a schedule. Every scraper dedupes against the
database, so it is always safe to re-run.

    python scripts/run_all_scrapers.py                     # everything
    python scripts/run_all_scrapers.py --only tenders      # just the fast group
    python scripts/run_all_scrapers.py --only news
    python scripts/run_all_scrapers.py --trigger scheduled # how a scheduled run calls it
    python scripts/run_all_scrapers.py --skip tenders --trigger scheduled   # the Cloud Run job
    python scripts/run_all_scrapers.py --only tenders --trigger scheduled   # the GitHub Actions job

GROUPS
Sources move at different speeds, and pretending otherwise wastes both our time
and the portals'. Audit reports and budget volumes appear a few times a month;
tenders and news change through the day. So the schedule runs `daily` once each
morning and `tenders`/`news` on their own shorter cycles.

WHAT IT WRITES
Each scraper's outcome becomes a row in data_updates: source, duration,
records found, and the first line of the error if it broke. That table is what
the public /updates page reads. A scraper that fails is recorded and the run
carries on: one dead portal must never cost us the other five.
"""

import argparse
from datetime import datetime, timezone
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.scrapers.amrut_projects import AmrutProjectsScraper
from app.scrapers.apwrims_water import ApwrimsWaterScraper
from app.scrapers.ap_finance_budget import APFinanceBudgetScraper
from app.scrapers.ap_legislature_bills import APLegislatureBillsScraper
from app.scrapers.apsdps_publications import APSDPSPublicationsScraper
from app.scrapers.cse_statistics import CSEStatisticsScraper
from app.scrapers.cag_documents import CAGDocumentsScraper
from app.scrapers.crda_tenders import CrdaTendersScraper
from app.scrapers.district_documents import DistrictDocumentsScraper
from app.scrapers.district_notices import DistrictNoticesScraper
from app.scrapers.mospi_projects import MospiProjectsScraper
from app.scrapers.neva_notices import NevaNoticesScraper
from app.scrapers.pib_ap import PibApScraper
from app.scrapers.ppa_reports import PPAReportsScraper
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
    ("daily", "District collectorates (27 of 28 districts)", DistrictDocumentsScraper),
    ("daily", "AMRUT 2.0 urban projects (MoHUA)", AmrutProjectsScraper),
    ("daily", "Central-sector projects (MoSPI flash report)", MospiProjectsScraper),
    # Live dashboard: today's reservoirs, season rainfall, tanks and (monthly) groundwater.
    ("daily", "Reservoirs, rainfall and groundwater (APWRIMS)", ApwrimsWaterScraper),
    # What each district is doing: collectorate notices (28 sites) and PIB releases
    # that name an AP place. Both feed the district paper. Lok Sabha answers come per
    # session through scripts/import_lok_sabha_session.py, not from here.
    ("daily", "District notices (28 collectorate sites)", DistrictNoticesScraper),
    ("daily", "PIB releases naming AP places", PibApScraper),
    ("tenders", "AP CRDA tenders", CrdaTendersScraper),
    # Document registers. These publish a few times a month at most, so they
    # sit in their own group rather than being re-walked every morning
    # alongside the sources that actually change daily.
    ("documents", "AP Legislature bills", APLegislatureBillsScraper),
    ("documents", "AP Economics & Statistics publications", APSDPSPublicationsScraper),
    ("documents", "AP School Education statistics", CSEStatisticsScraper),
    ("documents", "Polavaram Project Authority reports", PPAReportsScraper),
]

GROUPS = sorted({group for group, _, _ in SCRAPERS})


async def main(groups: list[str], trigger: RunTrigger) -> int:
    run_id = new_run_id()
    selected = [row for row in SCRAPERS if row[0] in groups]
    if not selected:
        logger.error(f"No scrapers in group(s) {groups}. Known groups: {', '.join(GROUPS)}")
        return 2

    logger.info(f"Refresh run {run_id}: {len(selected)} source(s), trigger={trigger.value}")
    from app.config import database_target
    logger.info(f"Database: {database_target()}")
    started = datetime.now(timezone.utc)
    summary: list[tuple[str, str]] = []

    # The three buckets the alert email is built from. They are kept apart on
    # purpose: "refused to write" and "crashed" look identical in a log and mean
    # opposite things to whoever reads the email. One is the safety net working.
    blocked: list[dict] = []
    changed: list[dict] = []
    quiet: list[str] = []
    broke: list[dict] = []
    notes: list[dict] = []

    for _group, name, cls in selected:
        logger.info(f"=== {name} ===")
        # The instance is held rather than thrown away inline, because a scraper
        # has something to say beyond its count: which requests failed, and
        # whether it read a local copy instead of the portal.
        scraper = cls()
        async with track(run_id, name, cls, trigger) as slot:
            slot["records_new"] = await scraper.scrape()

        for text in getattr(scraper, "notes", []):
            notes.append({"source": name, "note": text})

        if slot.get("blocked"):
            # Deliberate refusal, not a crash. Nothing was written and the site
            # still serves its last known-good data, which is the outcome the
            # sanity layers exist to produce. track() sets this flag; it cannot
            # be caught here, because track() handles the exception itself so
            # that one dead portal never stops the other ten.
            blocked.append({"source": name, "reason": slot["blocked"]})
            summary.append((name, "BLOCKED"))
        elif slot.get("failed"):
            saved = slot.get("records_new") or 0
            summary.append((name, "FAILED" + (f", {saved} saved first" if saved else "")))
            broke.append({
                "source": name,
                "error": str(slot.get("error") or "")[:300],
                "saved": saved,
            })
        else:
            count = slot.get("records_new") or 0
            summary.append((name, f"{count} new"))
            (changed.append({"source": name, "count": count}) if count else quiet.append(name))

    logger.info("=" * 50)
    logger.info(f"Run {run_id} summary:")
    for name, outcome in summary:
        logger.info(f"  {name}: {outcome}")

    # A non-zero exit is what makes Cloud Scheduler mark the run failed and
    # trigger the alert, so a run where every source broke must not look fine.
    ok_sources = [name for name, outcome in summary if not outcome.startswith(("FAILED", "BLOCKED"))]
    await _alert(run_id, started, blocked, changed, quiet, broke, ok_sources, notes)

    failed = [item["source"] for item in broke]
    if failed:
        logger.error(f"{len(failed)} of {len(summary)} source(s) failed: {', '.join(failed)}")
    if failed and len(failed) == len(summary):
        logger.error("Every source failed. Exiting non-zero so the job is flagged.")
        return 1
    # A partial failure deliberately still exits zero. Cloud Run retries a failed
    # job, and retrying the whole run because one portal was down would re-walk
    # ten healthy government sites for nothing. The email is the channel for a
    # partial failure; the exit code is for a run that achieved nothing at all.
    return 0


def _advice(error: str) -> str:
    """One line of what to do, chosen from the error rather than guessed.

    The old text said "portal likely moved" for every failure, including a
    timeout, which is the opposite of moved. The reader acts on this line, so it
    has to follow from the evidence.
    """
    e = (error or "").lower()
    if "timeout" in e:
        return "Portal did not answer in time from Cloud Run. Probe it with --ua browser to tell an IP block from an agent block."
    if "404" in e or "not found" in e:
        return "Page is gone. Portal likely moved; re-probe and update the URL."
    if "403" in e or "forbidden" in e:
        return "Portal refused us outright. Check robots.txt and whether it blocks cloud addresses."
    if "ssl" in e or "certificate" in e:
        return "Their certificate is broken. Probe with verify off to confirm the site is alive."
    if "connect" in e:
        return "Could not reach the host at all. Check DNS and whether the portal is down for everyone."
    return "Read the error above; re-probe the portal before changing the parser."


async def _alert(run_id, started, blocked, changed, quiet, broke, ok_sources, notes=None) -> None:
    """Assemble the run into the alert report and hand it to the sender.

    Never raises. An email that cannot be sent is a nuisance; a refresh run that
    dies because of one is a self-inflicted outage.
    """
    try:
        from app.services import alerts

        # Change, not state. A source that failed last time too goes in the
        # heartbeat's STILL FAILING list rather than back into NEEDS YOU; a
        # source that was failing and is now fine is worth one email of its own,
        # because "it fixed itself" is a fact a person wants to stop worrying about.
        from app.models.data_update import RunStatus
        from app.services.run_recorder import (
            crossed_an_escalation, failure_streak, previous_status,
        )

        now = datetime.now(timezone.utc)
        needs_you, still_failing, recovered = [], [], []
        for item in broke:
            prev = await previous_status(item["source"], run_id)
            saved = item.get("saved") or 0
            detail = f"Error: {item['error']}" if item.get("error") else ""
            if saved:
                # Without this the email reads as though nothing was collected,
                # and someone goes looking for rows that are already there.
                detail = (detail + "\n" if detail else "") + \
                    f"{saved} record(s) were saved before it broke; the rest of this source was not read."
            entry = {
                "kind": "scraper failing",
                "title": item["source"],
                "detail": detail,
                "action": _advice(item.get("error", "")),
            }
            if prev != RunStatus.FAILED:
                needs_you.append(entry)
                continue

            # Already reported when it first broke. Re-report it as the streak
            # lengthens, so one missed email cannot turn into months of silence.
            streak = await failure_streak(item["source"], run_id)
            if streak:
                streak_started_at, previous_run_at = streak
                days_now = (now - streak_started_at).total_seconds() / 86400
                days_before = (previous_run_at - streak_started_at).total_seconds() / 86400
                if crossed_an_escalation(days_now, days_before):
                    entry["kind"] = "scraper failing for days"
                    entry["detail"] = (
                        f"Failing since {streak_started_at.date().isoformat()}, "
                        f"{days_now:.0f} days. " + entry["detail"]
                    ).strip()
                    needs_you.append(entry)
                    continue
                entry["detail"] = f"failing {days_now:.0f} days"
            still_failing.append(entry)
        for name in ok_sources:
            if await previous_status(name, run_id) == RunStatus.FAILED:
                recovered.append(name)
        report = {
            "run_id": run_id,
            "started_at": started,
            "duration_s": (datetime.now(timezone.utc) - started).total_seconds(),
            "needs_you": needs_you,
            "blocked": blocked,
            "changed": changed,
            "quiet": quiet,
            "still_failing": still_failing,
            "recovered": recovered,
            "notes": notes or [],
            "dead": [],
            "heartbeat": alerts.is_heartbeat_day(),
        }
        result = await alerts.send(report)
        logger.info(f"[alerts] {result}")
    except Exception as exc:                        # noqa: BLE001
        logger.warning(f"[alerts] skipped: {type(exc).__name__}: {exc}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--only", choices=GROUPS, action="append", help="run only this group (repeatable)")
    parser.add_argument("--skip", choices=GROUPS, action="append",
                        help="run everything except this group (repeatable). The Cloud Run job passes "
                             "--skip tenders because crda.ap.gov.in blocks Google's network; tenders "
                             "refresh from GitHub Actions instead (.github/workflows/tenders-refresh.yml)")
    parser.add_argument("--trigger", choices=[t.value for t in RunTrigger], default=RunTrigger.MANUAL.value,
                        help="who started this run; scheduled runs pass 'scheduled'")
    args = parser.parse_args()
    groups = [g for g in (args.only or GROUPS) if g not in (args.skip or [])]
    raise SystemExit(asyncio.run(main(groups, RunTrigger(args.trigger))))
