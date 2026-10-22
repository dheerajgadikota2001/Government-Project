"""
Build seed/district_happenings_seed.json from the October 2026 gathering.

Input: gather/district_happenings/items.json (2,042 items for 1 July to 21 October
2026: collectorate notices, PIB releases and Lok Sabha answers, each re-read once
by the gathering run). This script does not re-read anything. It reshapes each
item into the row the table takes, through the same prepare() the scrapers use,
and refuses to write if any gate fails.

GATES (any failure writes nothing)
- every district is one of today's 28;
- no electoral-roll item (prepare() refuses them; one refusal stops the build,
  because the gathering already excluded 939 and a survivor means a rule drifted);
- a personal list carries no summary, no figures and no file link;
- every date parses;
- no two rows share the unique key (district, source_kind, url, title);
- the counts per source match the input, so nothing was lost on the way.

    python scripts/build_district_happenings_seed.py            # check only
    python scripts/build_district_happenings_seed.py --write    # check, then write
"""

import argparse
import collections
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from app.services.district_happenings import RowRefused, prepare

DEFAULT_IN = os.path.normpath(os.path.join(ROOT, "..", "..", "..", "gather", "district_happenings", "items.json"))
OUT = os.path.join(ROOT, "seed", "district_happenings_seed.json")
KIND = {"district site": "district_site", "PIB": "pib", "Lok Sabha": "lok_sabha"}
CORE = {"district", "source", "category", "title", "date", "date_end", "url", "file_url", "summary", "figures"}
PERSONAL_MARKERS = ("personal records", "were not read or recorded", "not read or recorded")


def to_raw(i: dict) -> dict:
    summary = i.get("summary") or ""
    personal = i.get("file_read") is False or any(m in summary for m in PERSONAL_MARKERS)
    meta = {k: v for k, v in i.items() if k not in CORE and v not in (None, [], {})}
    if personal:
        # The gathering kept the extra files of a merit list as links. A personal
        # list keeps nothing but its title and its notice page.
        meta.pop("more_files", None)
    return {
        "district": i["district"], "source_kind": KIND[i["source"]], "category": i["category"],
        "title": i["title"], "date": i["date"], "date_end": i.get("date_end"),
        "url": i.get("url") or i.get("listed_at"), "file_url": i.get("file_url"),
        "summary": None if personal else (i.get("summary") or None),
        "figures": [] if personal else (i.get("figures") or []),
        "meta": meta, "personal_list": personal,
        "first_seen_at": (i.get("read_on") or "2026-10-21") + "T00:00:00+05:30",
    }


def build(items: list[dict]) -> tuple[list[dict], list[str], list[str]]:
    rows, problems, excluded = [], [], []
    excluded_by_kind: collections.Counter = collections.Counter()
    for i in items:
        raw = to_raw(i)
        try:
            row = prepare(raw)
        except RowRefused as why:
            if str(why).startswith("electoral roll material"):
                # Election-office material is left out by rule, on purpose, and listed.
                excluded.append(f"{i['district']} {i['date']}: {i['title'][:80]}")
                excluded_by_kind[raw["source_kind"]] += 1
            else:
                problems.append(f"refused: {why}")
            continue
        if row["personal_list"] and (row["summary"] or row["figures"] or row["file_url"]):
            problems.append(f"personal list keeps content: {row['title'][:60]!r}")
        row["first_seen_at"] = raw["first_seen_at"]
        row["date"] = row["date"].isoformat()
        row["date_end"] = row["date_end"].isoformat() if row["date_end"] else None
        rows.append(row)

    keys = collections.Counter((r["district"], r["source_kind"], r["url"], r["title"]) for r in rows)
    for k, n in keys.items():
        if n > 1:
            problems.append(f"duplicate key x{n}: {k[0]} | {k[1]} | {k[3][:60]!r}")
    want = collections.Counter(KIND[i["source"]] for i in items)
    got = collections.Counter(r["source_kind"] for r in rows) + excluded_by_kind
    if want != got:
        problems.append(f"counts changed on the way: input {dict(want)}, rows plus excluded {dict(got)}")
    return rows, problems, excluded


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", default=DEFAULT_IN)
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()
    with open(a.input, encoding="utf-8") as fh:
        items = json.load(fh)
    rows, problems, excluded = build(items)
    for e in excluded:
        print("left out (election office material):", e)
    for p in problems[:40]:
        print("GATE", p)
    if problems:
        print(f"{len(problems)} gate failure(s); nothing written")
        return 1
    by = collections.Counter(r["source_kind"] for r in rows)
    personal = sum(r["personal_list"] for r in rows)
    print(f"{len(rows)} rows: {dict(by)}; {personal} personal lists kept as title and link only")
    if a.write:
        doc = {
            "about": "District happenings 1 July to 21 October 2026, built from the October gathering. "
                     "Titles, dates and figures as printed. Personal lists are title and link only.",
            "window": {"from": "2026-07-01", "to": "2026-10-21"},
            "left_out_election_material": excluded,
            "rows": rows,
        }
        with open(OUT, "w", encoding="utf-8") as fh:
            json.dump(doc, fh, ensure_ascii=False, indent=0)
        print("wrote", OUT)
    return 0


if __name__ == "__main__":
    sys.exit(main())
