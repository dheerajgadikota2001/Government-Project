"""
Add photographs to projects — with provenance, or not at all.

A photograph of a public works project is evidence. Evidence without a source
is worthless, and a borrowed or invented picture is worse than none: this
loader therefore REFUSES any image row that does not carry a credit, a licence
and the page it came from.

Usage
-----
    python scripts/add_project_images.py images.json            # dry run
    python scripts/add_project_images.py images.json --commit   # write

Input file: a JSON list. Match a project either by "project_id" or by
"match_title" (a distinctive fragment of its title — the script refuses if the
fragment matches anything other than exactly one project).

    [
      {
        "match_title": "Bhogapuram",
        "url": "https://static.pib.gov.in/.../airport-terminal.jpg",
        "captured_date": "2026-08-01",
        "kind": "progress",
        "caption": "Terminal building on the day of inauguration",
        "credit": "Press Information Bureau, Government of India",
        "license": "GODL-India",
        "source_url": "https://pib.gov.in/PressReleasePage.aspx?PRID=2292165",
        "is_cover": true
      }
    ]

Where to find images you are allowed to use
-------------------------------------------
  * PIB (pib.gov.in) press releases — Government Open Data Licence (India).
    Give credit = "Press Information Bureau, Government of India".
  * The implementing agency's own site (NHAI, APCRDA, GMR/GVIAL, port
    authorities) — check the page's terms; many permit reuse with credit.
  * Wikimedia Commons — check EACH file's licence (CC-BY, CC-BY-SA, public
    domain); record the exact licence string and the file page as source_url.
  * Your own photographs — credit = your name, license = "own photograph".

Do NOT paste in an image found through a search engine with no licence: the
loader will reject it, and rightly.

For a year-by-year progress strip, add one row per year with the real
captured_date on each — the project page groups them by year automatically.
"""
import asyncio
import json
import sys
from datetime import datetime

from sqlalchemy import select

sys.path.insert(0, ".")
from app.database import async_session  # noqa: E402
from app.models.project import Project  # noqa: E402
from app.models.project_image import ProjectImage, ImageKind  # noqa: E402

REQUIRED = ("url", "credit", "license", "source_url")


def _parse_date(v):
    if not v:
        return None
    for fmt in ("%Y-%m-%d", "%Y-%m", "%Y"):
        try:
            return datetime.strptime(v, fmt)
        except ValueError:
            continue
    raise ValueError(f"unreadable date: {v!r} (use YYYY-MM-DD)")


async def main(path: str, commit: bool):
    rows = json.load(open(path, encoding="utf-8"))
    if not isinstance(rows, list):
        sys.exit("The file must contain a JSON list of image records.")

    added = skipped = 0
    async with async_session() as db:
        for i, r in enumerate(rows, 1):
            missing = [k for k in REQUIRED if not r.get(k)]
            if missing:
                print(f"  [{i}] REFUSED — missing {', '.join(missing)}. "
                      f"A photograph without provenance is not evidence.")
                skipped += 1
                continue

            if r.get("project_id"):
                proj = (await db.execute(
                    select(Project).where(Project.id == int(r["project_id"]))
                )).scalar_one_or_none()
            else:
                frag = (r.get("match_title") or "").strip()
                if not frag:
                    print(f"  [{i}] REFUSED — needs project_id or match_title.")
                    skipped += 1
                    continue
                found = (await db.execute(
                    select(Project).where(Project.title.ilike(f"%{frag}%"))
                )).scalars().all()
                if len(found) != 1:
                    print(f"  [{i}] REFUSED — {frag!r} matches {len(found)} projects; "
                          f"be more specific or use project_id.")
                    skipped += 1
                    continue
                proj = found[0]

            if proj is None:
                print(f"  [{i}] REFUSED — no such project.")
                skipped += 1
                continue

            exists = (await db.execute(
                select(ProjectImage).where(
                    ProjectImage.project_id == proj.id,
                    ProjectImage.url == r["url"],
                )
            )).scalars().first()
            if exists:
                print(f"  [{i}] already on record for {proj.title[:44]}…")
                skipped += 1
                continue

            img = ProjectImage(
                project_id=proj.id,
                url=r["url"],
                thumbnail_url=r.get("thumbnail_url"),
                kind=ImageKind(r.get("kind", "progress")),
                caption=r.get("caption"),
                captured_date=_parse_date(r.get("captured_date")),
                credit=r["credit"],
                source_name=r.get("source_name"),
                source_url=r["source_url"],
                license=r["license"],
                is_cover=bool(r.get("is_cover")),
                sort_order=r.get("sort_order", 0),
            )
            db.add(img)
            added += 1
            print(f"  [{i}] + {proj.title[:44]}… "
                  f"({r.get('captured_date') or 'no date'}, {r['license']})")

        if commit and added:
            await db.commit()
            print(f"\nCommitted {added} photograph(s).")
        else:
            print(f"\nDry run — {added} would be added, {skipped} skipped. "
                  f"Re-run with --commit to write.")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    asyncio.run(main(sys.argv[1], "--commit" in sys.argv))
