"""
Build seed/ap_place_index.json from the government's Local Government Directory (LGD).

WHAT IT IS FOR
Official papers often place a work by its mandal or village ("Peddapappuru Mandal",
"Village Madhurapudi") and by a district name that may be out of date. The LGD is the
Government of India's own directory of every village and mandal (sub-district) with its
district under today's boundaries. With it, app/services/project_places.py can put a
reading on today's map when the paper's own district name cannot be trusted.

HOW TO GET THE FILE (a person does this once; the site has a captcha)
    https://lgdirectory.gov.in/downloadDirectory.do
    "All Villages of a State" -> State: Andhra Pradesh -> format HTML -> captcha -> Download
    (the download is a zip with the district, sub-district and village lists; pass the
    village and sub-district files)
HTML is asked for because it needs no extra library to read. A CSV saved from the XLS
works too.

USAGE (from backend/)
    python scripts/build_place_index.py villageofSpecificState*.htm subDistrictofSpecificState*.htm           # dry run
    python scripts/build_place_index.py villageofSpecificState*.htm subDistrictofSpecificState*.htm --write   # writes

The index keeps every district a name belongs to. The resolver uses a name only when it
belongs to exactly one district, so the many villages that share a name across districts
are never used to place anything.

Exit codes: 0 done, 2 the file is not what was expected (nothing written).
"""

import argparse
import csv
import datetime as dt
import io
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "seed", "ap_place_index.json")


def fold(name: str) -> str:
    return " ".join(re.sub(r"[^a-z0-9 ]", " ", (name or "").lower()).split())


def _cell_text(html: str) -> str:
    import html as h
    return " ".join(h.unescape(re.sub(r"<[^>]+>", " ", html)).split())


def rows_from(path: str) -> list[dict]:
    """Rows of the directory's table as dicts keyed by its header.

    The directory's HTML nests its data table inside an outer layout table, and the
    village file is about 60 MB, so rows are read with a plain scan rather than a
    parser that builds the whole tree: every <tr> starts a row, its <td> cells are
    the values, and the header is the row whose first cell is the serial-number column.
    """
    raw = open(path, "rb").read()
    if raw[:4] == b"\xd0\xcf\x11\xe0" or raw[:2] == b"PK":
        raise ValueError("this is a binary Excel file; download the HTML format, or save it as CSV")
    text = raw.decode("utf-8", errors="replace")
    if text.lstrip()[:1] != "<":
        return list(csv.DictReader(io.StringIO(text)))
    head = None
    out = []
    for chunk in re.split(r"<tr\b", text, flags=re.I)[1:]:
        cells = [_cell_text(c) for c in re.findall(r"<t[dh]\b[^>]*>(.*?)</t[dh]>", chunk, flags=re.I | re.S)]
        if not cells:
            continue
        if head is None:
            if re.fullmatch(r"S\.?\s?No\.?", cells[0]):
                head = cells
            continue
        if len(cells) == len(head) and cells[0].isdigit():
            out.append(dict(zip(head, cells)))
    if head is None:
        raise ValueError("no header row (S.No.) in the HTML file")
    return out


def column(head: list[str], *must: str, avoid: tuple = ()) -> str:
    for h in head:
        k = h.lower()
        if all(m in k for m in must) and not any(a in k for a in avoid):
            return h
    raise ValueError(f"no column containing {must}; columns are {head}")


def build(*tables: list[dict]) -> dict:
    """One index from one or more directory tables (the village list, and the sub-district list if given)."""
    mandals: dict[str, set] = {}
    villages: dict[str, set] = {}
    districts = set()
    for rows in tables:
        if not rows:
            raise ValueError("a file has no rows")
        head = list(rows[0].keys())
        c_state = next((h for h in head if "state" in h.lower() and "name" in h.lower()), None)
        c_dist = column(head, "district", "name", avoid=("sub", "local"))
        c_sub = column(head, "sub", "district", "name", avoid=("local",))
        c_vil = next((h for h in head if "village" in h.lower() and "name" in h.lower() and "local" not in h.lower()), None)
        for r in rows:
            if c_state and r.get(c_state) and "andhra" not in r[c_state].lower():
                raise ValueError(f"a row from another state: {r.get(c_state)!r}")
            d = (r.get(c_dist) or "").strip()
            if not d:
                continue
            districts.add(d)
            if r.get(c_sub):
                mandals.setdefault(fold(r[c_sub]), set()).add(d)
            if c_vil and r.get(c_vil):
                villages.setdefault(fold(r[c_vil]), set()).add(d)
    if not 26 <= len(districts) <= 30:
        raise ValueError(f"{len(districts)} districts in the file; Andhra Pradesh has 28 (26 before 2026)")
    return {
        "_readme": "Built by scripts/build_place_index.py from the Local Government Directory. "
                   "Each name lists every district it occurs in; only names in exactly one district are used.",
        "built_on": dt.date.today().isoformat(),
        "districts": sorted(districts),
        "mandals": {k: sorted(v) for k, v in sorted(mandals.items())},
        "villages": {k: sorted(v) for k, v in sorted(villages.items())},
    }


def main(paths: list[str], write: bool) -> int:
    try:
        index = build(*[rows_from(p) for p in paths])
    except ValueError as e:
        print(f"Refused: {e}. Nothing written.")
        return 2
    unique_v = sum(1 for v in index["villages"].values() if len(v) == 1)
    print(f"{len(index['districts'])} districts, {len(index['mandals'])} mandal names, "
          f"{len(index['villages'])} village names ({unique_v} in exactly one district).")
    if not write:
        print("Dry run: nothing written. Run again with --write.")
        return 0
    tmp = OUT + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=0)
    os.replace(tmp, OUT)
    print(f"Written: {OUT}")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Build the place index from the LGD village directory.")
    ap.add_argument("paths", nargs="+", help="the village list, and optionally the sub-district list")
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()
    sys.exit(main(a.paths, a.write))
