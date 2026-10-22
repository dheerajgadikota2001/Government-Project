"""
Load one Lok Sabha session's district items into district_happenings.

There is no daily Lok Sabha scraper, on purpose. Answers are laid in sessions
(three a year), each answer is a PDF whose district tables come in a dozen
layouts, and every table row has to be re-found by a second extraction before
it may be shown. That is a reading job done once per session and checked, not a
job for a morning cron. This script is the last step of it: it takes the
session's built items and stores them through the same prepare() and upsert()
the scrapers use, so the rules (28 districts, dates, no duplicates) are the same.

INPUT SHAPE (the ls_items.json the gathering writes)
A JSON list of objects with: district, title ("Unstarred Q.No.841: ..."), date
(the answer date), url (the answer PDF on sansad.in), file_url, summary ("District
row as printed: ..." with the table's header lines quoted, or "Answer text as
printed: ..."), figures (values in printed order, each with as_printed), and
optional map ("13", "26" or "28": which district map the table is printed on),
question_no, question_type, check (how the row was re-found).

HOW THE NEXT SESSION IS ADDED
1. Download the session's AP answers from sansad.in with the gathering's
   ls_dl.py (the Lok Sabha search, filtered to answers that name Andhra Pradesh,
   an AP place, or were asked by an AP member).
2. Build ls_items.json with ls_build.py, then run its verify step so every table
   row is re-found by pdftotext -raw. Rows that fail are kept with their figures
   removed, never with a guess.
3. Read the KNOWN ISSUES below against the new file; extend ls_build.py's name
   table if a spelling was missed. Do not patch values in the JSON by hand.
4. python scripts/import_lok_sabha_session.py path/to/ls_items.json --session "Monsoon 2026"
   It is safe to re-run: rows already present only have last_seen_at moved.

KNOWN ISSUES IN THE MONSOON 2026 FILE (20 July to 12 August 2026)
Recorded here, not patched, because a corrected value has to come from the PDF
and a re-run of the checked build, not from an edit to the output.
- District rows printed as "Y.S.R.", "Y.S.R" or "Visakhapatanam" were not
  matched by the name table, so YSR Kadapa (and Visakhapatnam in Q3685) has no
  row for those tables even though the PDF prints one. Q3685, Q2274, Q841 and
  Q1213 are confirmed cases.
- Q1213 (internship offers) is tagged map "28" but is a 26-district table, and it
  prints three rounds (I, II and III as on 15.07.2026). The stored row is round I
  only; read the PDF before showing it as the district's total.
- Q841's district table numbers its rows 1 to 28 with 14 and 17 missing; the 26
  rows add up to the printed total, so it is a 26-district table.
"""

import argparse
import asyncio
import collections
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from app.services.district_happenings import prepare_many

CORE = {"district", "source", "category", "title", "date", "date_end", "url", "file_url", "summary", "figures"}


def to_raw(i: dict, session: str) -> dict:
    meta = {k: v for k, v in i.items() if k not in CORE and k != "local_file" and v not in (None, [], {})}
    meta["session"] = session
    return {
        "district": i["district"], "source_kind": "lok_sabha", "category": "parliament answer",
        "title": i["title"], "date": i["date"], "date_end": i.get("date_end"),
        "url": i["url"], "file_url": i.get("file_url"), "summary": i.get("summary"),
        "figures": i.get("figures") or [], "meta": meta,
    }


def build(items: list[dict], session: str) -> tuple[list[dict], list[str]]:
    rows, refused = prepare_many(to_raw(i, session) for i in items)
    dup = [k for k, n in collections.Counter((r["district"], r["url"], r["title"]) for r in rows).items() if n > 1]
    return rows, refused + [f"duplicate: {k[0]} {k[2][:60]}" for k in dup]


async def load(rows: list[dict]) -> tuple[int, int]:
    from app.database import get_db_context
    from app.services.district_happenings import upsert

    async with get_db_context() as db:
        return await upsert(db, rows)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("items")
    ap.add_argument("--session", required=True, help='for example "Monsoon 2026"')
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    with open(a.items, encoding="utf-8") as fh:
        items = json.load(fh)
    rows, problems = build(items, a.session)
    for p in problems[:30]:
        print("REFUSED", p)
    if problems:
        print(f"{len(problems)} problem(s); nothing loaded")
        return 1
    print(f"{len(rows)} rows ready for {len({r['district'] for r in rows})} districts")
    if a.dry_run:
        return 0
    new, again = asyncio.run(load(rows))
    print(f"lok_sabha: {new} new, {again} already there")
    return 0


if __name__ == "__main__":
    sys.exit(main())
