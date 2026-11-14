r"""
Fill in the monthly MoSPI readings between the editions the register already holds.

WHY

The register holds MoSPI readings for May 2024, June 2025 and July 2026 onward.
MoSPI published every month in between (July 2025 to June 2026), so a work's
history on the site jumps a year, and a reader cannot see when progress moved
or stalled. When an edition is taken out and imported again, the readings of
the months it covered can also be lost (Tirupati-Pakala-Katpadi, #937, lost
July and August 2026 that way). This fills those months from MoSPI's own
reports, listed by mospi.gov.in itself.

WHAT IT WRITES, AND WHAT IT NEVER DOES

It writes one dated reading per project per month (progress, cumulative
spending, cost), labelled with the report and linked to its PDF. That is all.
It never creates a project, never changes a project's current figures, name or
status, and never matches by name. A report row joins a project only by its
code: the code itself, its legacy code, or the reviewed renumbering map
(mospi_renumbering.json). Rows the register does not hold are counted and left.
Rows listed in mospi_source_errors.json are skipped.

Each report passes the daily importer's own checks before anything is written:
the parsed count must equal the count the report prints, the group totals must
agree, and the cover month must be the month the listing names.

    python scripts/import_mospi_history.py                      (dry run, every missing PAIMANA month)
    python scripts/import_mospi_history.py --from 2025-07 --to 2026-06
    python scripts/import_mospi_history.py --apply              (writes)

A second run changes nothing: a reading already recorded exactly is left alone,
and a different one for the same date is corrected (upsert_observation).
"""

import argparse
import asyncio
import os
import sys
import tempfile
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app.database import get_db_context  # noqa: E402
from app.models.project import Project  # noqa: E402
from app.scrapers.mospi_editions import LIST_ENDPOINT, edition_from_item, list_request  # noqa: E402
from app.scrapers.mospi_layout import check_groups, month_end  # noqa: E402
from app.scrapers.mospi_projects import (  # noqa: E402
    MospiProjectsScraper, drop_source_errors, new_code_for, old_code_for, upsert_observation,
)

PORTAL = "MOSPI_IPMD"
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
          "October", "November", "December"]
# The PAIMANA layout (Table 6, one block per project) starts with the July 2025 report. Earlier
# editions use older layouts and go through scripts/import_mospi_archive.py.
FIRST_PAIMANA = (2025, 7)
# A report whose Andhra Pradesh rows mostly match nothing is a misread or a renumbering nobody has
# reviewed. Below this share nothing from that report is written, and the run says so.
MIN_MATCH_SHARE = 0.6
HEADERS = {"Origin": "https://www.mospi.gov.in", "Referer": "https://www.mospi.gov.in/publications-reports",
           "Content-Type": "application/json", "User-Agent": "APFactCheckDataBuild/1.0 (+https://apfactcheck.dheeco.com)"}


def ym(text: str) -> tuple[int, int]:
    y, m = text.split("-")
    return int(y), int(m)


async def editions(client: httpx.AsyncClient) -> dict:
    """Every flash report mospi.gov.in lists, by (year, month)."""
    out = {}
    for page in range(1, 20):
        r = await client.post(LIST_ENDPOINT, json=list_request(page, 20), headers=HEADERS)
        r.raise_for_status()
        items = r.json().get("data") or []
        if not items:
            break
        for it in items:
            e = edition_from_item(it)
            if e:
                out[(e.year, e.month)] = e
    return out


def codes_for(row: dict) -> list[str]:
    """Every code a register row could carry for this report row: never a name."""
    seen = []
    for c in (row.get("code"), row.get("legacy_code"), old_code_for(row.get("code") or ""),
              new_code_for(row.get("code") or "")):
        if c and c not in seen:
            seen.append(c)
    return seen


def read(scraper: MospiProjectsScraper, path: str, want: tuple[int, int]) -> list[dict]:
    """The report's Andhra Pradesh rows, after the daily importer's own checks. Raises on any doubt."""
    rows, printed_total, cover = scraper._read_report(path)
    if cover and cover != want:
        raise ValueError(f"the cover says {cover[1]}/{cover[0]}, the listing {want[1]}/{want[0]}")
    if printed_total is not None and len(rows) != printed_total:
        raise ValueError(f"parsed {len(rows)} projects, the report prints {printed_total}")
    problem = check_groups(rows, scraper.group_totals)
    if problem:
        raise ValueError(problem)
    ap = [r for r in rows if r.get("state") and "andhra pradesh" in r["state"].lower()]
    keep, _dropped = drop_source_errors(ap)
    return keep


async def import_one(edition, ap_rows: list[dict], apply: bool) -> dict:
    observed = month_end(edition.year, edition.month)
    # The reading's cost is the REVISED cost the report prints, or nothing: the daily importer's rule. A report that
    # prints the revised cost as a bare 0.00 (August 2026) has not stated it, and the ORIGINAL cost is a different
    # figure. The first run of this script (14 Nov 2026) fell back to the original cost and wrote it as the cost then
    # stated on 111 August readings; --repair-cost takes those back out (repair_cost below).
    # The same words every other MoSPI reading carries ("MoSPI flash report, September 2026").
    label = f"MoSPI flash report, {MONTHS[edition.month - 1]} {edition.year}"
    stats = Counter()
    async with get_db_context() as db:
        by_code = {p.external_id: p.id for p in (await db.execute(
            select(Project).where(Project.source_portal == PORTAL))).scalars().all()}
        plan = []
        for r in ap_rows:
            pid = next((by_code[c] for c in codes_for(r) if c in by_code), None)
            if pid is None:
                stats["not_in_register"] += 1
                continue
            plan.append((pid, r))
        stats["matched"] = len(plan)
        share = len(plan) / max(1, len(ap_rows))
        if share < MIN_MATCH_SHARE:
            stats["refused"] = 1
            return {"label": label, "share": share, **stats}
        for pid, r in plan:
            outcome = await upsert_observation(
                db, pid, observed, progress=r.get("progress"), expenditure=r.get("expenditure"),
                cost=r.get("cost"), portal=PORTAL, url=edition.url, label=label)
            stats[{0: "already", 1: "added", 2: "corrected"}[outcome]] += 1
        if apply:
            await db.commit()
        else:
            await db.rollback()
    return {"label": label, "share": share, **stats}


async def repair_cost(edition, ap_rows: list[dict], apply: bool) -> dict:
    """
    Clear a reading's cost where this script wrote the original cost in place of an unstated revised cost.

    A reading is cleared only when all of these hold: it is this edition's reading (same date, portal and PDF),
    the report gives no revised cost for that row, and the stored cost equals the row's original cost. A cost
    the report does state is never touched, and neither is any other field.
    """
    from app.models.progress_observation import ProgressObservation
    observed = month_end(edition.year, edition.month)
    stats = Counter()
    async with get_db_context() as db:
        by_code = {p.external_id: p.id for p in (await db.execute(
            select(Project).where(Project.source_portal == PORTAL))).scalars().all()}
        for r in ap_rows:
            if r.get("cost") is not None or r.get("cost_original") is None:
                continue
            pid = next((by_code[c] for c in codes_for(r) if c in by_code), None)
            if pid is None:
                continue
            obs = (await db.execute(select(ProgressObservation).where(
                ProgressObservation.project_id == pid, ProgressObservation.observed_date == observed,
                ProgressObservation.source_portal == PORTAL, ProgressObservation.source_url == edition.url,
            ))).scalars().first()
            if obs is None or obs.estimated_cost_crore is None:
                continue
            if abs(float(obs.estimated_cost_crore) - float(r["cost_original"])) < 0.005:
                obs.estimated_cost_crore = None
                stats["cleared"] += 1
            else:
                stats["kept_other_figure"] += 1
        if apply:
            await db.commit()
        else:
            await db.rollback()
    return stats


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="start", default="2025-07")
    ap.add_argument("--to", dest="end", default=None, help="last month, YYYY-MM (default: the month before the newest)")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--repair-cost", action="store_true",
                    help="only clear costs the first run wrote from the original cost (see repair_cost)")
    args = ap.parse_args()

    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
        listed = await editions(client)
        newest = max(listed)
        start, end = max(ym(args.start), FIRST_PAIMANA), ym(args.end) if args.end else None
        months = [k for k in sorted(listed) if k >= start and (k <= end if end else k < newest)]
        print(f"{len(listed)} editions listed; importing {len(months)}: {[f'{m}/{y}' for y, m in months]}")
        failed = 0
        for key in months:
            e = listed[key]
            scraper = MospiProjectsScraper()
            with tempfile.TemporaryDirectory() as tmp:
                r = await client.get(e.url, headers={"User-Agent": HEADERS["User-Agent"]})
                if not r.content.startswith(b"%PDF"):
                    print(f"  {e.label}: the address did not return a PDF; skipped")
                    failed += 1
                    continue
                path = os.path.join(tmp, "report.pdf")
                with open(path, "wb") as f:
                    f.write(r.content)
                try:
                    rows = read(scraper, path, key)
                except Exception as ex:  # a check refused the report: nothing from it is written
                    print(f"  {e.label}: refused, {ex}")
                    failed += 1
                    continue
            if args.repair_cost:
                fixed = await repair_cost(e, rows, args.apply)
                print(f"  MoSPI flash report, {MONTHS[e.month - 1]} {e.year}: {fixed.get('cleared', 0)} costs cleared, "
                      f"{fixed.get('kept_other_figure', 0)} kept (a different figure): {'written' if args.apply else 'dry run'}")
                continue
            s = await import_one(e, rows, args.apply)
            verdict = "REFUSED (too few rows match the register)" if s.get("refused") else (
                "written" if args.apply else "dry run")
            print(f"  {s['label']}: {len(rows)} AP rows, {s.get('matched', 0)} matched ({s['share']:.0%}), "
                  f"{s.get('added', 0)} added, {s.get('corrected', 0)} corrected, {s.get('already', 0)} already "
                  f"recorded, {s.get('not_in_register', 0)} not in the register: {verdict}")
            failed += bool(s.get("refused"))
    if not args.apply:
        print("dry run: nothing was written. Re-run with --apply.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
