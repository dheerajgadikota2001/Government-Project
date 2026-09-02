"""
Load the curated, citation-backed seed data into the database.

Reads seed/projects_seed.json and seed/mous_seed.json — datasets where
every figure was verified against the cited sources (the citations travel
in the JSON files as the audit trail; review them before loading).

Safe to run repeatedly: existing rows are matched by title (projects) /
company_name+title (MoUs) and UPDATED in place rather than duplicated, so
editing the JSON and re-running keeps the database in sync with the file.

Usage:
    python scripts/load_seed_data.py
"""

import asyncio
import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select

from app.database import get_db_context
from app.models.project import Project, ProjectStatus, ProjectType
from app.models.mou import MOU, MOUStatus, MOUSector
from app.utils.logger import logger

SEED_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "seed")


def parse_month(value):
    """'YYYY-MM' -> first-of-month datetime, or None."""
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _check_lengths(entries, label):
    """Fail fast, and say which field on which row is too long.

    The columns are VARCHAR with real limits, so a seed edit that writes a longer
    string dies inside SQLAlchemy's flush with a hundred lines of traceback and no
    mention of the offending row. That happened once with a 129-character
    source_portal. Checking here turns it into one readable line before anything
    touches the database. Keep these limits in step with app/models/.
    """
    limits = {"title": 300, "district": 100, "mandal": 100, "constituency": 100,
              "department": 200, "implementing_agency": 200,
              "source_portal": 100, "source_url": 1000,
              "company_name": 300, "company_origin": 100, "summit_name": 200,
              "source_tier": 20, "source_label": 200, "date_status": 30}
    problems = [
        f"{label} '{str(e.get('title'))[:40]}': {field} is {len(e[field])} chars, "
        f"limit {limit}"
        for e in entries
        for field, limit in limits.items()
        if isinstance(e.get(field), str) and len(e[field]) > limit
    ]
    if problems:
        raise SystemExit(
            "Seed data is too long for the database columns:\n  - "
            + "\n  - ".join(problems)
            + "\nShorten the value in the seed file, or widen the column and migrate."
        )


async def load_projects():
    path = os.path.join(SEED_DIR, "projects_seed.json")
    with open(path, encoding="utf-8") as f:
        entries = json.load(f)["projects"]
    _check_lengths(entries, "project")

    created = updated = 0
    async with get_db_context() as db:
        for e in entries:
            existing = (
                await db.execute(select(Project).where(Project.title == e["title"]))
            ).scalar_one_or_none()

            fields = dict(
                title=e["title"],
                project_type=ProjectType(e["project_type"]),
                status=ProjectStatus(e["status"]),
                district=e.get("district"),
                department=e.get("department"),
                estimated_cost_crore=e.get("estimated_cost_crore"),
                completion_percentage=e.get("completion_percentage"),
                expected_completion=parse_month(e.get("expected_completion")),
                description=e.get("description"),
                source_portal=e.get("source_portal") or "Curated (cited)",
                source_url=e.get("source_url"),
                last_scraped_at=datetime.now(timezone.utc),
            )

            if existing:
                for k, v in fields.items():
                    setattr(existing, k, v)
                updated += 1
            else:
                db.add(Project(**fields))
                created += 1

    logger.info(f"Projects: {created} created, {updated} updated.")


async def load_mous():
    path = os.path.join(SEED_DIR, "mous_seed.json")
    with open(path, encoding="utf-8") as f:
        entries = json.load(f)["mous"]
    _check_lengths(entries, "MoU")

    created = updated = 0
    async with get_db_context() as db:
        for e in entries:
            existing = (
                await db.execute(
                    select(MOU).where(
                        MOU.company_name == e["company_name"], MOU.title == e["title"]
                    )
                )
            ).scalar_one_or_none()

            fields = dict(
                company_name=e["company_name"],
                company_origin=e.get("company_origin"),
                is_foreign_investment=bool(e.get("is_foreign_investment")),
                title=e["title"],
                sector=MOUSector(e["sector"]),
                district=e.get("district"),
                status=MOUStatus(e["status"]),
                investment_crore=e.get("investment_crore"),
                expected_employment=e.get("expected_employment"),
                signed_date=parse_month(e.get("signed_date")),
                summit_name=e.get("summit_name"),
                description=e.get("description"),
                source_portal=e.get("source_portal") or "Curated (cited)",
                source_url=e.get("source_url"),
                # Provenance. These were in the seed file long before there were
                # columns to hold them, so they never reached a reader. They do now.
                source_tier=e.get("source_tier"),
                source_label=e.get("source_label"),
                source_caveat=e.get("source_caveat"),
                date_status=e.get("date_status"),
            )

            if existing:
                for k, v in fields.items():
                    setattr(existing, k, v)
                updated += 1
            else:
                db.add(MOU(**fields))
                created += 1

    logger.info(f"MoUs: {created} created, {updated} updated.")


async def _assert_schema_current():
    """Fail with one readable line if the database is behind the models.

    The MoU provenance columns arrived in migration 0004. Loading the seed against
    a database that has not run it dies deep inside SQLAlchemy with an UndefinedColumn
    error and no hint about what to do. This turns that into an instruction.
    """
    from sqlalchemy import text

    async with get_db_context() as db:
        rows = await db.execute(
            text("SELECT column_name FROM information_schema.columns "
                 "WHERE table_name = 'mous'")
        )
        have = {r[0] for r in rows}
    needed = {"source_tier", "source_label", "source_caveat", "date_status"}
    missing = sorted(needed - have)
    if missing and have:          # empty means the table does not exist yet, which
        raise SystemExit(          # create_all will handle on first startup
            "The database is behind the code. The mous table is missing: "
            + ", ".join(missing)
            + "\nRun the migration first, from the backend directory:\n"
            "    alembic upgrade head"
        )


async def main():
    await _assert_schema_current()
    await load_projects()
    await load_mous()
    logger.info("Done. The citations for every figure remain in the seed/*.json files.")


if __name__ == "__main__":
    asyncio.run(main())
