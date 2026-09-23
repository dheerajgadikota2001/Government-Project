r"""
The PAIMANA renumbering, offline: propose which old row each new row is,
and check the reviewed map before anyone trusts it.

WHY A SCRIPT AND NOT THE DAILY JOB

The July 2026 flash report renumbered every project and reworded most
names, so the importer's code and exact-title matching found five rows in a
hundred and the register grew a duplicate for the rest. The matcher in
app/scrapers/mospi_match.py finds the rest on evidence (cost to the paisa,
chainages, package numbers, approval month), but it proposes; a person
reads the evidence and the accepted pairs go into
app/scrapers/mospi_renumbering.json, which is the only thing the importer
follows. A heuristic that runs unattended every night could one day merge a
new package into its neighbour and rewrite a real project's history.

USAGE (from backend\)

    python scripts/mospi_renumbering.py rows --pdf fetched/FR_JUNE_2025.pdf --layout table7 --out june.json
    python scripts/mospi_renumbering.py rows --pdf fetched/mospi_flash.pdf --layout paimana --out july.json
    python scripts/mospi_renumbering.py propose --old june.json --new july.json
    python scripts/mospi_renumbering.py check

`rows` writes the Andhra Pradesh rows of one report as JSON (the same shape
as tests/fixtures/mospi_ap_rows_*.json). `propose` prints three lists: the
pairs the matcher accepts with the evidence for each, the new rows nobody
claims with their two nearest old rows, and the old rows nobody claims with
their nearest free new row. `check` verifies every pair in the map against
the fixtures: both codes exist, no code is used twice, the sectors agree,
and every pair states its evidence.
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.scrapers.mospi_match import Candidate, assign, lexicon_for, rank  # noqa: E402
from app.scrapers.mospi_projects import (  # noqa: E402
    RENUMBERING_FILE, SECTOR_TYPE, MospiProjectsScraper, sector_type,
)

FIXTURES = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tests", "fixtures")
OLD_FIXTURE = os.path.join(FIXTURES, "mospi_ap_rows_june2025.json")
NEW_FIXTURE = os.path.join(FIXTURES, "mospi_ap_rows_july2026.json")


def _iso(d):
    return d.strftime("%Y-%m-%d") if d else None


def rows_from_pdf(path: str, layout: str) -> list[dict]:
    """The Andhra Pradesh rows of one report, in the fixture shape."""
    scraper = MospiProjectsScraper()
    out = []
    if layout == "table7":
        for raw in scraper._parse_table7(path):
            r = MospiProjectsScraper._extract(raw)
            state = raw.get("state") or ""
            if not r or "andhra" not in state.lower():
                continue
            pt = SECTOR_TYPE.get((r["sector"] or "").upper())
            out.append({
                "code": r["code"], "name": r["name"], "state": state, "sector": r["sector"],
                "ptype": pt.value if pt else "infrastructure",
                "approval": _iso(r["approval"]), "cost_original": r["cost_original"],
                "cost_revised": r["cost_revised"], "progress": r["progress"],
            })
    else:
        rows, printed, _ = scraper._read_report(path)
        if printed is not None and len(rows) != printed:
            sys.exit(f"parsed {len(rows)} rows but the report says {printed}; refusing to write")
        for r in rows:
            if not r["state"] or "andhra pradesh" not in r["state"].lower():
                continue
            out.append({
                "code": r["code"], "name": r["name"], "state": r["state"], "sector": r["sector"],
                "ptype": sector_type(r["sector"]).value,
                "approval": _iso(r["approval"]), "cost_original": r["cost_original"],
                "cost_revised": r["cost"], "progress": r["progress"],
            })
    return out


def _dt(s):
    return datetime.strptime(s, "%Y-%m-%d").replace(tzinfo=timezone.utc) if s else None


def candidates_of(old_rows: list[dict]) -> list[Candidate]:
    """Old rows as the register would hold them: one cost, the anticipated
    figure when the report printed one."""
    return [
        Candidate(key=r["code"], title=r["name"], approval=_dt(r["approval"]),
                  cost=r["cost_revised"] if r["cost_revised"] else r["cost_original"],
                  progress=r["progress"], ptype=r["ptype"])
        for r in old_rows
    ]


def news_of(new_rows: list[dict]) -> tuple[list[dict], list[str]]:
    news = [{"name": r["name"], "approval": _dt(r["approval"]), "cost_original": r["cost_original"],
             "cost": r["cost_revised"], "progress": r["progress"]} for r in new_rows]
    return news, [r["ptype"] for r in new_rows]


def propose(old_rows: list[dict], new_rows: list[dict]) -> None:
    cands = candidates_of(old_rows)
    news, types = news_of(new_rows)
    lex = lexicon_for(news, cands)
    out = assign(news, cands, types)
    taken = {id(m.candidate) for m in out.values()}

    print(f"{len(new_rows)} new rows against {len(old_rows)} old rows: {len(out)} pairs, "
          f"{len(new_rows) - len(out)} new rows unclaimed, {len(cands) - len(taken)} old rows unclaimed\n")
    print("PAIRS (copy the ones that hold up into mospi_renumbering.json)")
    for i, m in sorted(out.items(), key=lambda kv: new_rows[kv[0]]["code"]):
        r = new_rows[i]
        print(f'  {{"new": "{r["code"]}", "old": "{m.candidate.key}", "how": "matched", "evidence": "{m.why}"}}')
        print(f"      new: {r['name'][:110]}")
        print(f"      old: {m.candidate.title[:110]}")
    print("\nNEW ROWS NOBODY CLAIMS (nearest two old rows, for a person to judge)")
    for i, r in enumerate(new_rows):
        if i in out:
            continue
        print(f"  {r['code']} {r['name'][:100]} | {r['approval']} | cost {r['cost_original']} / {r['cost_revised']} | {r['progress']}%")
        for s in rank(news[i], cands, types[i], lex)[:2]:
            print(f"      [{s.score:+d}] {s.candidate.key} {s.candidate.title[:90]} ({s.why or 'nothing in common'})")
    print("\nOLD ROWS NOBODY CLAIMS (finished, dropped, or reworded past recognition)")
    free = [i for i in range(len(new_rows)) if i not in out]
    for c in cands:
        if id(c) in taken:
            continue
        best = max((rank(news[i], [c], types[i], lex)[0] for i in free), key=lambda m: m.score, default=None)
        line = f"  {c.key} {c.title[:100]}"
        if best is not None and best.score > 0:
            line += f"  ~ nearest free new row scores {best.score:+d} ({best.why})"
        print(line)


def check(old_rows: list[dict], new_rows: list[dict], path: str = RENUMBERING_FILE) -> list[str]:
    """Every way the map can be wrong, as a list of complaints (empty is good)."""
    with open(path, encoding="utf-8") as f:
        doc = json.load(f)
    old = {r["code"]: r for r in old_rows}
    new = {r["code"]: r for r in new_rows}
    problems: list[str] = []
    seen_new: set[str] = set()
    seen_old: set[str] = set()
    for p in doc["pairs"]:
        tag = f"{p.get('new')} <- {p.get('old')}"
        if p.get("how") not in ("matched", "reviewed"):
            problems.append(f"{tag}: 'how' must be matched or reviewed")
        if not (p.get("evidence") or "").strip():
            problems.append(f"{tag}: no evidence stated")
        if p["new"] in seen_new or p["old"] in seen_old:
            problems.append(f"{tag}: a code is used twice")
        seen_new.add(p["new"])
        seen_old.add(p["old"])
        if p["new"] not in new:
            problems.append(f"{tag}: new code is not in the new edition's Andhra Pradesh rows")
        if p["old"] not in old:
            problems.append(f"{tag}: old code is not in the old edition's Andhra Pradesh rows")
        if p["new"] in new and p["old"] in old and new[p["new"]]["ptype"] != old[p["old"]]["ptype"]:
            problems.append(f"{tag}: sectors differ ({new[p['new']]['ptype']} vs {old[p['old']]['ptype']})")
    return problems


def _load(path: str) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        return json.load(f)["rows"]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("rows", help="write one report's Andhra Pradesh rows as JSON")
    r.add_argument("--pdf", required=True)
    r.add_argument("--layout", choices=("table7", "paimana"), required=True)
    r.add_argument("--edition", default="", help='e.g. "MoSPI flash report, June 2025"')
    r.add_argument("--out", required=True)
    p = sub.add_parser("propose", help="print the matcher's pairs and what it could not place")
    p.add_argument("--old", required=True, help="rows JSON of the older edition")
    p.add_argument("--new", required=True, help="rows JSON of the newer edition")
    c = sub.add_parser("check", help="verify mospi_renumbering.json against the fixtures")
    c.add_argument("--old", default=OLD_FIXTURE)
    c.add_argument("--new", default=NEW_FIXTURE)
    args = ap.parse_args()

    if args.cmd == "rows":
        rows = rows_from_pdf(args.pdf, args.layout)
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump({"edition": args.edition, "layout": args.layout, "rows": rows}, f, indent=0, ensure_ascii=False)
        print(f"{len(rows)} Andhra Pradesh rows written to {args.out}")
    elif args.cmd == "propose":
        propose(_load(args.old), _load(args.new))
    else:
        problems = check(_load(args.old), _load(args.new))
        if problems:
            print("\n".join(problems))
            sys.exit(1)
        with open(RENUMBERING_FILE, encoding="utf-8") as f:
            n = len(json.load(f)["pairs"])
        print(f"mospi_renumbering.json: {n} pairs, all consistent with the fixtures")


if __name__ == "__main__":
    main()
