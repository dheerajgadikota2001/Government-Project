"""
Prove that every district the map counts can actually be opened.

WHY THIS EXISTS
On 6 Sep 2026 the map showed 16 projects in Ananthapuramu and opening it showed
none. Six districts behaved that way and 110 projects were unreachable, while
the API answered 200 to every request. Nothing failed, so nothing alerted.

The counts fold scraper spellings onto the canonical district name; the list
query compared that canonical name against the raw column. Two sides of the
same question, answered differently. This script asks both sides and reports
any district where they disagree.

Run it after a deploy, or after any scraper adds district values:

    python scripts/check_district_reachability.py                  # local .env
    APNN_ENV_FILE=.env.cloud python scripts/check_district_reachability.py

Exit code 0 when every counted district can be opened, 1 when any cannot, so
it can sit in CI or a scheduled job without anyone reading the output.
"""
import asyncio

from sqlalchemy import func, or_, select, union

from app.config import database_target
from app.constants.districts import normalise_district, spellings_folding_to
from app.database import get_db_context
from app.models.project import Project
from app.models.project_district import ProjectDistrict


async def main() -> int:
    print(f"Database: {database_target()}")

    async with get_db_context() as db:
        stored = (await db.execute(
            select(Project.district).where(Project.district.is_not(None)).distinct()
        )).scalars().all()

        # The counts, folded exactly as /projects/insights folds them.
        placement = union(
            select(ProjectDistrict.project_id.label("pid"),
                   ProjectDistrict.district.label("district")),
            select(Project.id.label("pid"), Project.district.label("district"))
            .where(Project.district.is_not(None), func.btrim(Project.district) != ""),
        ).subquery("placement")

        rows = (await db.execute(
            select(placement.c.district, func.count(func.distinct(Project.id)))
            .join(placement, placement.c.pid == Project.id)
            .group_by(placement.c.district)
        )).all()

        counts: dict[str, int] = {}
        unmatched: dict[str, int] = {}
        for raw, n in rows:
            canon = normalise_district(raw)
            if canon:
                counts[canon] = counts.get(canon, 0) + n
            else:
                unmatched[raw] = unmatched.get(raw, 0) + n

        linked = (await db.execute(
            select(ProjectDistrict.district).distinct()
        )).scalars().all()

        broken, hidden = [], 0
        for canon, count in sorted(counts.items(), key=lambda kv: -kv[1]):
            spellings = spellings_folding_to(canon, stored) or [canon]
            link_spellings = spellings_folding_to(canon, linked) or [canon]
            reachable = (await db.execute(
                select(func.count(func.distinct(Project.id))).where(
                    or_(
                        select(ProjectDistrict.id).where(
                            ProjectDistrict.project_id == Project.id,
                            ProjectDistrict.district.in_(link_spellings),
                        ).exists(),
                        Project.district.in_(spellings),
                    )
                )
            )).scalar_one()

            mark = "ok " if reachable == count else "BAD"
            if reachable != count:
                broken.append((canon, count, reachable))
                hidden += max(count - reachable, 0)
            print(f"  {mark} {canon:<32} map {count:>4}   opens {reachable:>4}")

    print()
    if unmatched:
        # Not a failure: these are stored spellings no rule recognises yet. They
        # are counted nowhere on the map either, so say so rather than hide it.
        print("Stored district values that match no canonical name:")
        for raw, n in sorted(unmatched.items(), key=lambda kv: -kv[1]):
            print(f"  {raw!r}: {n} project(s)")
        print()

    if broken:
        print(f"{len(broken)} district(s) cannot be opened, hiding {hidden} project(s):")
        for canon, count, reachable in broken:
            print(f"  {canon}: map says {count}, opening returns {reachable}")
        return 1

    print(f"All {len(counts)} counted districts open correctly.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
