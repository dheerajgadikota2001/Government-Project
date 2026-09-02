r"""
Load the state irrigation project register (seed/state_projects_seed.json)
into the projects + progress_observations tables.

What this fixes: AP publishes no online project register, so the platform's
project list came from central portals (MoSPI, AMRUT) and a handful of curated
entries — state flagships like Veligonda, Handri-Neeva and Galeru-Nagari
returned zero search results. The seed transcribes the government's own
project-wise tables from the Socio-Economic Survey editions on hand
(2017-18, 2018-19, 2020-21, 2021-22, 2024-25), figures verbatim, and this
script turns each edition's row into a dated ProgressObservation so a
project page shows the government's own trail — including percentages that
move backwards between editions.

Safe to re-run: projects upsert on external_id (title refreshed, curated
fields updated); observations upsert on (project, observed_date, portal).
Entries with "attach_to_title" add observations to an EXISTING project
(e.g. Polavaram, already curated) instead of creating a duplicate.

Usage (from backend\):
    python scripts/load_state_projects.py
"""

import asyncio
import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select

from app.database import get_db_context
from app.models.progress_observation import ProgressObservation
from app.models.project import Project, ProjectStatus, ProjectType
from app.utils.logger import logger

SEED = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    "seed", "state_projects_seed.json")
PORTAL = "AP_SES"  # observation source_portal key (unique per (project, date, portal))


def _date(s: str) -> datetime:
    return datetime.strptime(s, "%Y-%m-%d").replace(tzinfo=timezone.utc)


async def main():
    with open(SEED, encoding="utf-8") as f:
        entries = json.load(f)["projects"]

    created = updated = attached = obs_new = obs_upd = 0
    async with get_db_context() as db:
        for e in entries:
            attach = e.get("attach_to_title")
            if attach:
                project = (await db.execute(
                    select(Project).where(Project.title == attach)
                )).scalar_one_or_none()
                if project is None:
                    logger.warning(f"attach_to_title {attach!r} not found — skipping "
                                   f"{e['external_id']} (load the curated seed first).")
                    continue
                attached += 1
            else:
                project = (await db.execute(
                    select(Project).where(Project.external_id == e["external_id"])
                )).scalar_one_or_none()
                fields = dict(
                    external_id=e["external_id"],
                    title=e["title"],
                    project_type=ProjectType(e["project_type"]),
                    status=ProjectStatus(e["status"]),
                    district=e.get("district"),
                    department=e.get("department"),
                    estimated_cost_crore=e.get("estimated_cost_crore"),
                    completion_percentage=e.get("completion_percentage"),
                    description=e.get("description"),
                    source_portal=e.get("source_portal") or "AP Socio-Economic Survey",
                    source_url=e.get("source_url"),
                    last_scraped_at=datetime.now(timezone.utc),
                )
                if project:
                    for k, v in fields.items():
                        setattr(project, k, v)
                    updated += 1
                else:
                    project = Project(**fields)
                    db.add(project)
                    await db.flush()  # need project.id for observations
                    created += 1

            for o in e.get("observations", []):
                when = _date(o["observed_date"])
                # Observations default to the SES portal key; a press-tier point
                # (e.g. an inauguration reported before any G.O. exists) carries
                # its own source_portal so tiers never blur.
                portal = o.get("source_portal") or PORTAL
                existing = (await db.execute(
                    select(ProgressObservation).where(
                        ProgressObservation.project_id == project.id,
                        ProgressObservation.observed_date == when,
                        ProgressObservation.source_portal == portal,
                    )
                )).scalar_one_or_none()
                vals = dict(
                    completion_percentage=o.get("completion_percentage"),
                    cumulative_expenditure_crore=o.get("cumulative_expenditure_crore"),
                    estimated_cost_crore=o.get("estimated_cost_crore"),
                    status_note=(o.get("status_note") or "")[:300] or None,
                    source_label=(o.get("source_label") or "")[:200] or None,
                    source_url=o.get("source_url"),
                )
                if existing:
                    for k, v in vals.items():
                        setattr(existing, k, v)
                    obs_upd += 1
                else:
                    db.add(ProgressObservation(
                        project_id=project.id, observed_date=when,
                        source_portal=portal, **vals,
                    ))
                    obs_new += 1
        await db.commit()

    logger.info(
        f"State projects register: {created} projects created, {updated} updated, "
        f"{attached} observation-only attachments; observations {obs_new} new, {obs_upd} refreshed."
    )


if __name__ == "__main__":
    asyncio.run(main())
