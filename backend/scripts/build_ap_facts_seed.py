"""
Build seed/ap_facts/<topic>.json from the gathered datasets.

Each topic was gathered from official sources by hand-checked readers and written
as one dataset.json (sources with sha256, series with points, checks, blocked
sites, gaps). This script copies them into the seed after the same gates the
tests apply, so a broken dataset never reaches the API:

- every point names a source the file lists, and every source has a URL and sha256;
- every series has English and Telugu labels and a unit;
- the local download paths are dropped (they mean nothing on a server);
- the file is refused if it carries words that would mean personal records.

USAGE (from backend/)
    python scripts/build_ap_facts_seed.py --from <folder holding topic/dataset.json>          # dry run
    python scripts/build_ap_facts_seed.py --from <folder> --write
"""

import argparse
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SEED = os.path.join(os.path.dirname(HERE), "seed", "ap_facts")

TOPICS = ["water", "power", "ports", "homes_taps", "births_deaths", "money_flows", "rural_work_food", "district_economy", "district_sites", "more_platforms"]
# Field names that would mean a person's record slipped in. Totals never carry these.
PERSONAL = re.compile(r'"(aadhaar|voter_id|epic|mobile|phone_number|father_name|beneficiary_name|farmer_name|patient_name)"', re.I)


class Refused(Exception):
    pass


def clean(d: dict, topic: str) -> dict:
    if d.get("topic") != topic:
        raise Refused(f"{topic}: file says topic {d.get('topic')!r}")
    for k in ("title_en", "title_te", "why_it_matters_en", "why_it_matters_te", "sources", "series"):
        if not d.get(k):
            raise Refused(f"{topic}: missing {k}")
    ids = set()
    sources = []
    for s in d["sources"]:
        if not s.get("url") or not s.get("by") or not s.get("title"):
            raise Refused(f"{topic}: source {s.get('id')} lacks url, by or title")
        ids.add(s["id"])
        sources.append({k: v for k, v in s.items() if k != "local_file"})
    for se in d["series"]:
        for k in ("id", "en", "te", "points"):
            if not se.get(k):
                raise Refused(f"{topic}: series {se.get('id')} lacks {k}")
        if "unit_en" not in se:
            raise Refused(f"{topic}: series {se['id']} has no unit")
        for p in se["points"]:
            if p.get("source") not in ids:
                raise Refused(f"{topic}: {se['id']} point {p.get('period')} cites unknown source {p.get('source')}")
    text = json.dumps(d, ensure_ascii=False)
    if PERSONAL.search(text):
        raise Refused(f"{topic}: carries a personal-record field ({PERSONAL.search(text).group(1)})")
    out = dict(d)
    out["sources"] = sources
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="src", required=True)
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()
    built, index = {}, []
    for t in TOPICS:
        path = os.path.join(a.src, t, "dataset.json")
        if not os.path.exists(path):
            print(f"skip {t}: no dataset.json")
            continue
        with open(path, encoding="utf-8") as fh:
            d = clean(json.load(fh), t)
        built[t] = d
        pts = sum(len(s["points"]) for s in d["series"])
        index.append({"topic": t, "title_en": d["title_en"], "title_te": d["title_te"],
                      "why_it_matters_en": d["why_it_matters_en"], "why_it_matters_te": d["why_it_matters_te"],
                      "series": len(d["series"]), "points": pts, "sources": len(d["sources"])})
        print(f"{t}: {len(d['series'])} series, {pts} points, {len(d['sources'])} sources")
    if not a.write:
        print("dry run: nothing written (add --write)")
        return 0
    os.makedirs(SEED, exist_ok=True)
    for t, d in built.items():
        with open(os.path.join(SEED, f"{t}.json"), "w", encoding="utf-8") as fh:
            json.dump(d, fh, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(SEED, "index.json"), "w", encoding="utf-8") as fh:
        json.dump({"topics": index}, fh, ensure_ascii=False, indent=1)
    print(f"wrote {len(built)} topics to {SEED}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Refused as r:
        print(f"REFUSED: {r}")
        sys.exit(2)
