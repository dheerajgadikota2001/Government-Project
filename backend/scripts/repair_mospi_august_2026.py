r"""
Repair the MoSPI rows that the 30 September 2026 refresh wrote wrong.

WHAT WENT WRONG

That refresh ran the old reader on the August 2026 flash report. Two things
in that report broke it: the revised cost prints as a bare 0.00, and each
group total prints on three lines. On the 110 Andhra Pradesh projects the
site already tracked, 66 costs changed to figures no report states
(Polavaram Rs 10,151.04 crore instead of Rs 55,548.87 crore, 5 at Rs 0),
103 changed sector (most to "Real Estate") and project type with it, and the
first project of each group had the section heading stuck to its name.
Three new projects were created with the same faults.

WHAT THIS DOES, IN ORDER

1. Checks it is pointed at the database you mean (prints it) and that the
   local July 2026 report is the exact file (sha256).
2. Takes the August edition back out: deletes the 3 rows it created and its
   observations on the rest (scripts/mospi_undo_edition.py).
3. Re-imports July 2026 from the local copy, which puts back every July
   figure, title, sector and type (the fixed reader, pinned to July, with
   the sector-change guard allowed because restoring sectors is the point).
4. Imports August 2026 again with the fixed reader: costs kept from July,
   progress and dates from August, sectors and titles as printed.
5. Checks the result and says PASS or FAIL for each point.

Rehearsed on a copy built the way production was (the September dump, July
imported, then August with the old reader): the copy matched production
exactly on all 158 MoSPI rows, and after this repair it matched, field by
field and observation by observation, a database that imported July and then
August with the fixed reader and never went wrong.

USAGE (from backend\, with the Cloud SQL proxy running and DATABASE_URL set)

    python scripts\repair_mospi_august_2026.py            (checks only; changes nothing)
    python scripts\repair_mospi_august_2026.py --apply    (repairs, then checks)
"""

import argparse
import asyncio
import hashlib
import os
import subprocess
import sys

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND)

from sqlalchemy import func, select  # noqa: E402

from app.config import database_target  # noqa: E402
from app.database import get_db_context  # noqa: E402
from app.models.project import Project  # noqa: E402

PORTAL = "MOSPI_IPMD"
JULY_URL = ("https://www.mospi.gov.in/uploads/publications_reports/publications_reports1787656864174_"
            "db1695c9-b038-4c20-964f-8cf5f2cdda5f_FlashReport_July_2026_.pdf")
AUGUST_URL = ("https://www.mospi.gov.in/uploads/publications_reports/publications_reports1790332216620_"
              "28c59057-0b69-44af-8989-d192bc3e65bf_FlashReport_August_2026.pdf")
JULY_SHA256 = "dcf52cea3b2ed6f97a49739af833f877c2afb55f61d5c43cb162f97ef6f3a9f3"
LOCAL_PDF = os.environ.get("MOSPI_FLASH_PDF", os.path.join(BACKEND, "fetched", "mospi_flash.pdf"))
HEADINGS = ("Ministry ", "Department ", "Water Resources ", "Waste & Water ", "Oil & Gas ",
            "Transmission & Distribution Trans", "Roads & Highways ", "Railways ")
PIN_VARS = ("MOSPI_FLASH_URL", "MOSPI_FLASH_AS_OF", "MOSPI_FORCE", "MOSPI_ALLOW_SECTOR_CHANGES",
            "MOSPI_FLASH_LABEL")


def run(args: list[str], extra_env: dict[str, str]) -> None:
    env = {k: v for k, v in os.environ.items() if k not in PIN_VARS}
    env.update(extra_env)
    print(f"\n>>> {' '.join(args)}" + (f"   ({', '.join(f'{k}={v}' for k, v in extra_env.items())})" if extra_env else ""))
    done = subprocess.run([sys.executable, *args], cwd=BACKEND, env=env)
    if done.returncode != 0:
        sys.exit(f"stopped: that step failed (exit {done.returncode}). Nothing after it was run.")


async def state() -> dict:
    async with get_db_context() as db:
        rows = (await db.execute(select(Project).where(Project.source_portal == PORTAL))).scalars().all()
    by_code = {p.external_id: p for p in rows}
    august = [p for p in rows if p.source_url == AUGUST_URL]
    pol = by_code.get("701415")
    return {
        "rows": len(rows),
        "august_rows": len(august),
        "real_estate": sum(1 for p in august if p.department == "Real Estate"),
        "zero_cost": sum(1 for p in rows if p.estimated_cost_crore == 0),
        "heading_titles": [p.title for p in rows if p.title.startswith(HEADINGS)],
        "polavaram": (pol.estimated_cost_crore, pol.department, pol.completion_percentage,
                      pol.expected_completion.strftime("%Y-%m") if pol and pol.expected_completion else None) if pol else None,
    }


def report(s: dict) -> bool:
    checks = [
        ("113 rows carry the August report", s["august_rows"] == 113),
        ("no more than 3 August rows say Real Estate (July printed 3)", s["real_estate"] <= 3),
        ("no MoSPI project costs Rs 0", s["zero_cost"] == 0),
        ("no title starts with a section heading", not s["heading_titles"]),
        ("Polavaram: Rs 55,548.87 crore, Water Resources, 86.2%, due 2027-06",
         s["polavaram"] == (55548.87, "Water Resources", 86.2, "2027-06")),
    ]
    for label, ok in checks:
        print(f"  {'PASS' if ok else 'FAIL'}  {label}")
    if s["heading_titles"]:
        print("        titles:", "; ".join(t[:70] for t in s["heading_titles"][:5]))
    print(f"        (Polavaram now: {s['polavaram']}; MoSPI rows: {s['rows']})")
    return all(ok for _, ok in checks)


async def main(apply: bool) -> None:
    # One event loop for the whole run: the database pool must not outlive the
    # loop that opened its connections (tests/conftest.py tells that story).

    print(f"database: {database_target()}")
    if not os.path.exists(LOCAL_PDF):
        sys.exit(f"stopped: {LOCAL_PDF} is missing; it must be the July 2026 report")
    digest = hashlib.sha256(open(LOCAL_PDF, "rb").read()).hexdigest()
    if digest != JULY_SHA256:
        sys.exit(f"stopped: {LOCAL_PDF} is not the July 2026 report (sha256 {digest[:16]}...)")
    print(f"local July 2026 report: {LOCAL_PDF} (sha256 matches)")

    print("\nas it stands:")
    report(await state())
    if not apply:
        print("\nchecks only: nothing changed. Re-run with --apply to repair.")
        return

    run(["scripts/mospi_undo_edition.py", "--url", AUGUST_URL, "--apply"], {})
    run(["scripts/rescrape_mospi.py"], {
        "MOSPI_FLASH_URL": JULY_URL, "MOSPI_FLASH_AS_OF": "2026-07-31",
        "MOSPI_FORCE": "1", "MOSPI_ALLOW_SECTOR_CHANGES": "1",
    })
    run(["scripts/rescrape_mospi.py"], {})

    print("\nafter the repair:")
    ok = report(await state())
    print("\nREPAIRED" if ok else "\nNOT REPAIRED: send Claude the lines above")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="repair; without it, only check")
    asyncio.run(main(parser.parse_args().apply))
