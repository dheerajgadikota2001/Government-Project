"""
Put the project place readings that land on today's districts into project_districts.

The readings live in seed/project_place_claims_seed.json and are served to readers as
they are, by the register API. This script does the other half: it adds a district link
for every reading that app/services/project_places.py can place on today's map, so the
district filters and the map count those projects too.

USAGE (from backend/)
    python scripts/apply_project_places.py            # dry run: shows what would be added
    python scripts/apply_project_places.py --apply    # writes the links

Safe to run again: a link already present is left alone. It only adds rows. When a reading
is later corrected in the seed, the old link is removed by hand after reading the diff,
because deleting rows on a guess is how a correct district silently disappears.

Refuses to write (exit 2) when:
- a reading names a project that is not in the database, or whose title does not start
  with the words the seed expects (a wrong id would place the wrong project);

A reading placed in a district the site does not list (a district formed after this
code was written) is listed as waiting, not refused: it already shows on the project page
with today's district named. Markapuram and Polavaram are listed since the move to 28.
"""

import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select                                          # noqa: E402

from app.constants.districts import DISTRICT_NAMES                     # noqa: E402
from app.database import get_db_context                                # noqa: E402
from app.models.project import Project                                 # noqa: E402
from app.models.project_district import DistrictRole, ProjectDistrict  # noqa: E402
from app.services.project_places import load, readings_by_project      # noqa: E402

ROLE = {"route": DistrictRole.SPANS, "served": DistrictRole.SERVED}


def plan_links(readings: dict, projects: dict) -> tuple[list[dict], list[str], list[str]]:
    """The links to add, the problems that stop the run, and the readings placed in a
    district the site does not list. Pure, so it can be tested."""
    links, problems, waiting = [], [], []
    for (portal, ext), rows in readings.items():
        p = projects.get((portal, ext))
        if p is None:
            problems.append(f"{portal} {ext}: no such project in the database")
            continue
        placed = [r for r in rows if r["today"]["district"]]
        located = {r["today"]["district"] for r in placed if r["meaning"] == "located"}
        for r in placed:
            d = r["today"]["district"]
            if d not in DISTRICT_NAMES:
                # A district the site does not list. The reading still shows as printed
                # with today's district named; only the map link waits.
                waiting.append(f"{portal} {ext}: {d}")
                continue
            if r["meaning"] == "located":
                role = DistrictRole.PRIMARY if len(located) == 1 else DistrictRole.SPANS
            else:
                role = ROLE[r["meaning"]]
            links.append({
                "project_id": p["id"], "district": d, "role": role,
                "source_url": None if r["source"]["url"] == "title" else r["source"]["url"],
                "source_title": r["source"]["title"][:500],
                "source_quote": r["quote"],
                "note": f"As printed: {r['district_as_printed']} ({r['source'].get('date') or 'undated'}). {r['today']['why']}",
            })
    return links, problems, waiting


async def main(apply: bool) -> int:
    seed, index = load()
    readings = readings_by_project(seed, index)
    async with get_db_context() as db:
        rows = (await db.execute(select(Project.id, Project.source_portal, Project.external_id, Project.title))).all()
        projects = {(r.source_portal, r.external_id): {"id": r.id, "title": r.title} for r in rows if r.external_id}
        # A key that points at the wrong project is the worst error this script can make.
        for c in seed["claims"]:
            k = (c["project"]["source_portal"], c["project"]["external_id"])
            p = projects.get(k)
            if p and not (p["title"] or "").lower().startswith(c["project"]["title_starts"].lower()):
                print(f"Refused: {k} is titled {p['title']!r}, the seed expects {c['project']['title_starts']!r}.")
                return 2
        links, problems, waiting = plan_links(readings, projects)
        if waiting:
            print("Waiting: districts the site does not list (shown on the project page, not linked yet):\n  " + "\n  ".join(waiting))
        if problems:
            print("Refused:\n  " + "\n  ".join(problems))
            return 2
        have = {(pid, d, role) for pid, d, role in (await db.execute(
            select(ProjectDistrict.project_id, ProjectDistrict.district, ProjectDistrict.role))).all()}
        todo = [l for l in links if (l["project_id"], l["district"], l["role"]) not in have]
        print(f"{sum(len(v) for v in readings.values())} readings for {len(readings)} projects; "
              f"{len(links)} placed on today's districts; {len(todo)} links to add.")
        for l in todo:
            print(f"  + p{l['project_id']:<5} {l['district']:28} {l['role']}")
        if not apply:
            print("Dry run: nothing written. Run again with --apply.")
            return 0
        for l in todo:
            db.add(ProjectDistrict(**l))
        await db.commit()
        print(f"Added {len(todo)} link(s).")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true")
    sys.exit(asyncio.run(main(ap.parse_args().apply)))
