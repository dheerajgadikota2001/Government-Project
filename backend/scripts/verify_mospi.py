"""
Read a whole flash report offline and prove the parser accounts for every row.

    python scripts/verify_mospi.py fetched/mospi_flash.pdf

Prints the national count parsed against the count printed on the report's
overview page, the Andhra Pradesh rows, and Polavaram's figures. Run it on
a new edition before trusting a live import; the suite's fixture covers five
pages, this covers all of them. Takes about half a minute.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pdfplumber  # noqa: E402

from app.scrapers.mospi_layout import (  # noqa: E402
    TABLE_TITLE, extract, overview_project_count, parse_page_words, report_month,
)


def main(path: str) -> int:
    rows, ministry, sector = [], None, None
    printed = cover = None
    with pdfplumber.open(path) as pdf:
        for i, page in enumerate(pdf.pages):
            text = page.extract_text() or ""
            if i == 0:
                cover = report_month(text)
            if printed is None and i < 8:
                printed = overview_project_count(text)
            if text[:40].startswith(TABLE_TITLE):
                blocks, ministry, sector = parse_page_words(page.extract_words(), ministry=ministry, sector=sector)
                for b in blocks:
                    r = extract(b)
                    if r is None:
                        print(f"UNREADABLE block on page {i + 1}: Sl {b.sl} name={' '.join(b.name)[:80]!r}")
                    else:
                        rows.append(r)
            page.flush_cache()

    sls = [r["sl"] for r in rows]
    missing = sorted(set(range(1, (printed or max(sls)) + 1)) - set(sls))
    ap = [r for r in rows if r["state"] and "andhra pradesh" in r["state"].lower()]
    print(f"report month: {cover}")
    print(f"parsed {len(rows)} rows; the overview page prints {printed}; "
          f"{'MATCH' if printed == len(rows) else 'MISMATCH'}")
    print(f"missing serial numbers: {missing[:30]}{' ...' if len(missing) > 30 else ''}")
    print(f"duplicate serial numbers: {len(sls) - len(set(sls))}")
    print(f"Andhra Pradesh rows: {len(ap)} "
          f"({sum(1 for r in ap if r['state'].lower().startswith('multi'))} shared with other states)")
    for r in ap:
        if "polavaram irrigation" in r["name"].lower():
            print("Polavaram:", {k: r[k] for k in ("code", "cost", "expenditure", "progress", "expected")})
    return 0 if printed == len(rows) and not missing else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "fetched/mospi_flash.pdf"))
