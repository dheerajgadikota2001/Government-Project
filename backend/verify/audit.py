"""
Draw a random, reproducible sample of published figures and print a worksheet
for checking each one against the document it claims to come from.

The rest of this harness checks the data against itself: that derived numbers
still equal their inputs, that every source id resolves, that no estimate is
shown as an outcome. None of that can catch a figure that was simply typed in
wrong from the source table. Only opening the document catches that, and there
are far too many figures to open the document for all of them.

So we sample. The sample is drawn with a fixed seed from the content of the
figures themselves, which means:

  * anyone can re-run this and get the same rows, so the sample cannot be
    quietly redrawn until it comes out clean, and
  * changing a figure changes the draw, so a sample cannot be inherited from
    an older version of the data and passed off as current.

Usage (from backend/):

    python -m verify.audit                    # 100 rows, worksheet to stdout
    python -m verify.audit -n 40              # a smaller sitting
    python -m verify.audit --file state_facts_seed.json
    python -m verify.audit --out verify/audit/2026-08-31.md --json ...

Filling it in is the point. A blank verdict column is not an audit.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Keys whose numbers are bookkeeping about the data, not figures about the
# state. Sampling these wastes a checker's afternoon.
STRUCTURAL = {
    "group_rank", "rank", "decimals", "display_divisor", "fy_end", "years",
    "indicator_count", "total_data_points", "mean_points_per_indicator",
    "handbook_edition_tables_total", "handbook_tables_read", "order", "id",
    "sort", "index", "count", "n", "page", "pages", "version", "year", "fy",
    # Identifiers that happen to be numbers. A checker sent to confirm that
    # grant number 35 is really 35 has been sent to do nothing.
    "grant_number", "demand_number", "go_number", "rung", "phase", "ward",
    "division_no", "seat", "constituency_number",
}

import re as _re
_FY = _re.compile(r"(?:^|[.\[])((?:19|20)\d{2}-\d{2})(?:$|[.\]])")

# Figures this platform computes rather than transcribes. The harness already
# recomputes every one of them from its own inputs on every run, so sending a
# person to a PDF to confirm a subtraction we did ourselves is wasted effort —
# and it dilutes a sample whose whole purpose is to test transcription.
DERIVED_LEAVES = {
    "change", "pct", "pct_spent", "share_pct", "pct_of_revenue", "pct_change",
    "interest_pct_of_revenue", "per_capita", "growth", "cagr", "index",
}
DERIVED_PATHS = ("by_tenure", "reconciliation", "rankings")

# Where a figure's provenance tends to be recorded, nearest-first.
SOURCE_KEYS = ("source", "source_id", "source_key", "source_portal", "cost_source_url", "source_url")
LABEL_KEYS = ("label", "title", "name", "fy_label", "indicator", "head", "scheme", "department")


def repo_root() -> str:
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def collect(node, path, ctx, out):
    """Walk a seed, recording every figure with the provenance in scope.

    `ctx` carries the nearest label, unit and source seen on the way down, so a
    value deep in a points array still knows which indicator it belongs to.
    """
    if isinstance(node, dict):
        local = dict(ctx)
        for k in LABEL_KEYS:
            if isinstance(node.get(k), str) and node[k].strip():
                local.setdefault("label_chain", [])
                local["label_chain"] = local.get("label_chain", []) + [node[k].strip()]
                break
        for k in SOURCE_KEYS:
            v = node.get(k)
            if isinstance(v, str) and v.strip():
                local["source"] = v.strip()
                break
            # Several seeds record provenance as a block rather than an id.
            if isinstance(v, dict):
                url = v.get("url") or v.get("pdf")
                title = v.get("publication") or v.get("title")
                if url or title:
                    local["source"] = url or title
                    local["source_title_inline"] = title
                    local["source_url_inline"] = url
                    if v.get("title") and v.get("publication"):
                        local["table"] = v["title"]
                    break
        for k in ("unit_as_printed", "display_unit", "unit"):
            if isinstance(node.get(k), str) and node[k].strip():
                local["unit"] = node[k].strip()
                break
        for k in ("table", "statement", "annexure"):
            if isinstance(node.get(k), str) and node[k].strip():
                local["table"] = node[k].strip()
                break
        for k in ("fy_label", "year"):
            if isinstance(node.get(k), (str, int)) and str(node[k]).strip():
                local["year"] = str(node[k]).strip()
                break
        for k, v in node.items():
            if k.startswith("_") or k in ("sources", "glossary", "_readme"):
                continue
            collect(v, f"{path}.{k}" if path else k, local, out)
        return
    if isinstance(node, list):
        for i, v in enumerate(node):
            collect(v, f"{path}[{i}]", ctx, out)
        return
    if isinstance(node, bool) or node is None:
        return
    if isinstance(node, (int, float)):
        leaf = path.rsplit(".", 1)[-1].split("[")[0]
        if leaf in STRUCTURAL or leaf in DERIVED_LEAVES:
            return
        if any(seg in path for seg in DERIVED_PATHS):
            return
        # Some seeds key a block by financial year rather than storing the year
        # in a field. Without this a checker gets a figure and no year.
        year = ctx.get("year")
        if not year:
            m = _FY.search(path) or _re.search(r"((?:19|20)\d{2}-\d{2})", path)
            if m:
                year = m.group(1)
        out.append({
            "path": path,
            "value": node,
            "label": " › ".join((ctx.get("label_chain") or [])[-3:]),
            "year": year,
            "unit": ctx.get("unit"),
            "source": ctx.get("source"),
            "source_title_inline": ctx.get("source_title_inline"),
            "source_url_inline": ctx.get("source_url_inline"),
            "table": ctx.get("table"),
        })


def resolve_sources(seed):
    """A seed's `sources` block: id -> {title, publisher, url}."""
    s = seed.get("sources") if isinstance(seed, dict) else None
    return s if isinstance(s, dict) else {}


def main() -> int:
    ap = argparse.ArgumentParser(description="Sample published figures for checking against source documents.")
    ap.add_argument("-n", "--number", type=int, default=100, help="how many figures to draw (default 100)")
    ap.add_argument("--file", action="append", help="restrict to these seed files (repeatable)")
    ap.add_argument("--out", help="write the worksheet here instead of stdout")
    ap.add_argument("--json", help="also write the sample as JSON")
    ap.add_argument("--repo", default=None)
    args = ap.parse_args()

    seed_dir = os.path.join(args.repo or repo_root(), "backend", "seed")
    rows, per_file, sources_by_file = [], {}, {}
    section_sources_by_file: dict = {}
    for name in sorted(os.listdir(seed_dir)):
        if not name.endswith(".json") or ".bak" in name:
            continue
        if args.file and name not in args.file:
            continue
        with open(os.path.join(seed_dir, name), encoding="utf-8") as f:
            seed = json.load(f)
        sources_by_file[name] = resolve_sources(seed)
        ss = seed.get("section_sources") if isinstance(seed, dict) else None
        section_sources_by_file[name] = ss if isinstance(ss, dict) else {}
        got: list[dict] = []
        collect(seed, "", {}, got)
        for r in got:
            r["file"] = name
        per_file[name] = len(got)
        rows.extend(got)

    if not rows:
        print("No figures found. Wrong --file, or wrong repo root.", file=sys.stderr)
        return 1

    # Seed the draw from the figures themselves: same data, same sample;
    # changed data, changed sample. Neither can be chosen after the fact.
    digest = hashlib.sha256(
        "\n".join(f"{r['file']}|{r['path']}|{r['value']}" for r in rows).encode()
    ).hexdigest()
    rng = random.Random(int(digest[:16], 16))
    n = min(args.number, len(rows))
    sample = sorted(rng.sample(rows, n), key=lambda r: (r["file"], r["path"]))

    for r in sample:
        if not r["source"]:
            # Some seeds record provenance per section rather than per figure.
            # section_sources is keyed by the page section, which is not
            # always the first path segment.
            head = r["path"].split(".")[0]
            section = {"promised_vs_spent": "promised"}.get(head, head)
            ids = section_sources_by_file.get(r["file"], {}).get(section)
            if isinstance(ids, list) and ids:
                r["source"] = ids[0]
                r["source_note"] = f"section cites {len(ids)} source(s); first shown"
        src = sources_by_file.get(r["file"], {}).get(r["source"] or "", {})
        r["source_title"] = (src.get("title") or r.get("source_title_inline")
                             or (r["source"] if r["source"] else None))
        r["source_publisher"] = src.get("publisher") or src.get("publication")
        r["source_url"] = (src.get("url") or r.get("source_url_inline")
                           or (r["source"] if str(r.get("source") or "").startswith("http") else None))

    today = dt.date.today().isoformat()
    lines = [
        f"# Figure audit — sample of {n}",
        "",
        f"Drawn {today} from {len(rows):,} published figures across {len(per_file)} seed files.",
        f"Draw id `{digest[:16]}` — re-running on unchanged data reproduces this exact sample.",
        "",
        "Check each figure against the document named in its row and write the verdict:",
        "**ok** (matches), **wrong** (does not match — record what the document says),",
        "**untraceable** (the document does not carry this figure at all), or",
        "**blocked** (could not open the source; say why).",
        "",
        "A row left blank is not a pass.",
        "",
        "## Population",
        "",
        "| Seed file | Figures |",
        "|---|---:|",
    ]
    for k, v in sorted(per_file.items(), key=lambda kv: -kv[1]):
        lines.append(f"| `{k}` | {v:,} |")
    lines += ["", "## Sample", "",
              "| # | Figure | Year | Value | Unit | Source | Table / statement | Verdict | What the document says |",
              "|---:|---|---|---:|---|---|---|---|---|"]
    for i, r in enumerate(sample, 1):
        label = (r["label"] or r["path"]).replace("|", "/")
        val = f"{r['value']:,}" if isinstance(r["value"], (int, float)) else r["value"]
        lines.append(
            f"| {i} | {label}<br>`{r['file']} · {r['path']}` | {r['year'] or '—'} | {val} | "
            f"{r['unit'] or '—'} | {r['source_title'] or '—'} | {r['table'] or '—'} |  |  |"
        )
    lines += ["", "## Result", "",
              "| Verdict | Rows |", "|---|---:|",
              "| ok |  |", "| wrong |  |", "| untraceable |  |", "| blocked |  |", "",
              "Any `wrong` row is a defect in the published data, not in this worksheet: "
              "correct the seed, then re-run `python -m verify.run` before the next draw.", ""]
    text = "\n".join(lines)

    if args.out:
        os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(text)
        print(f"worksheet → {args.out}  ({n} of {len(rows):,} figures, draw {digest[:16]})")
    else:
        print(text)

    if args.json:
        os.makedirs(os.path.dirname(os.path.abspath(args.json)), exist_ok=True)
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump({"drawn": today, "draw_id": digest[:16], "population": len(rows),
                       "per_file": per_file, "sample": sample}, f, ensure_ascii=False, indent=2)
        print(f"sample    → {args.json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
