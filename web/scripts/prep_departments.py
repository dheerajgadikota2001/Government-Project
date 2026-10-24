"""Department rows for the Money pages, in a compact form.

    python3 scripts/prep_departments.py <departments.json>

<departments.json> is the API's /finances/departments dump (live/departments.json)
or the backend seed (backend/seed/departments_seed.json); both have the same
"departments" list. Writes the "departments" and "dept_books" keys of
src/data/money.json and leaves every other key alone.

Why compact: 40 demands x 13 years x 3 stages is about 1,400 figures, each with
its paper and page. Written out in full that is over 400 KB on a page people open
on phones. Here each paper's address is written once in "dept_books" and a row
points to it; the page builds the plain-words location from the row.

Row keys:
  y   year                      s    'BE', 'RE' or 'A' (accounts, what was spent)
  t   gross total as printed, crore; null when the paper prints parts and no total
  n   net total after recoveries, when it differs from t
  parts  [[label, crore, pdf page], ...] when printed in parts (Non-Plan and Plan,
         or CAG's sections); never added up here
  src key into dept_books       pp   PDF page of the figure
  late 1 when the book came after the year had ended, so its RE is near the accounts
  cag  'm' matches CAG's audited accounts (within Rs 10,000), 'c' agrees within 0.1 per
       cent, 'd' differs by more, 'u' CAG's file has no readable text, 'x' not compared. When it differs: cagp [[section, crore], ...] as CAG
       prints them, cagsrc the CAG file, cagpp its PDF page
  alt  {t, src, pp}: the same budget's other volume prints a different BE
  np1  1 when the book printed a Non-Plan summary only, so that is the total
  p2   1 when CAG's book covers the undivided state's 1 April to 1 June 2014 as well
"""
import hashlib
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
MONEY = HERE.parent / "src" / "data" / "money.json"
STAGE = {"BE": "BE", "RE": "RE", "Actual": "A"}
CAG_CODE = {"matches": "m", "close": "c", "differs": "d", "CAG's file has no readable text": "u", "not compared": "x"}


def key_for(url, cag_year=None):
    """A short, stable key for a paper's address: v12/<year>, v3/<year>/<part>, cag/<year>."""
    m = re.search(r"budget-volumes/(\d{4}-\d{2})/Volume-(I-2|III-(\d+))\.pdf$", url) or \
        re.search(r"Bud@et(\d\d-\d\d)/documents/Volume-(I-2|III-(\d+))\.pdf$", url)
    if m:
        yr = m.group(1) if len(m.group(1)) == 7 else "20" + m.group(1)
        return "v12/%s" % yr if m.group(2) == "I-2" else "v3/%s/%s" % (yr, m.group(3))
    if "state_accounts_report" in url and cag_year:
        return "cag/%s" % cag_year
    return "u/" + hashlib.md5(url.encode()).hexdigest()[:10]


def compact(dep_list):
    books, out = {}, []
    for d in dep_list:
        rows = []
        for r in d["rows"]:
            k = key_for(r["source_url"], cag_year=r["year"])
            books[k] = r["source_url"]
            row = {"y": r["year"], "s": STAGE[r["stage"]], "t": r.get("total_crore")}
            if r.get("net_crore") is not None and r.get("total_crore") is not None and abs(r["net_crore"] - r["total_crore"]) >= 0.005:
                row["n"] = r["net_crore"]
            if r.get("parts"):
                row["parts"] = [[p["label"], p["crore"], p.get("pdf_page")] for p in r["parts"]]
            if r.get("two_periods"):
                row["p2"] = 1
                if r.get("total_crore") is not None:
                    row["np1"] = 1
            row["src"] = k
            if r.get("pdf_page"):
                row["pp"] = r["pdf_page"]
            if r["stage"] == "RE" and "after the year" in (r.get("note") or ""):
                row["late"] = 1
            c = r.get("cag_check")
            if c:
                row["cag"] = CAG_CODE.get(c["result"], "x")
                if c["result"] == "differs":
                    row["cagp"] = [[p["label"], p["crore"]] for p in c.get("parts", [])]
                    kc = key_for(c["url"], cag_year=r["year"])
                    books[kc] = c["url"]
                    row["cagsrc"] = kc
                    if c.get("pdf_page"):
                        row["cagpp"] = c["pdf_page"]
            if r.get("second_print"):
                sp = r["second_print"]
                ks = key_for(sp["source_url"])
                books[ks] = sp["source_url"]
                row["alt"] = {"t": sp["total_crore"], "src": ks, "pp": sp.get("pdf_page")}
            rows.append(row)
        out.append({"no": d["demand_no"], "name": d["department"], "rows": rows})
    return out, books


def main():
    src = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    deps, books = compact(src["departments"])
    money = json.loads(MONEY.read_text(encoding="utf-8"))
    money["departments"] = deps
    money["dept_books"] = dict(sorted(books.items()))
    MONEY.write_text(json.dumps(money, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    n = sum(len(d["rows"]) for d in deps)
    print("departments: %d demands, %d rows, %d papers; money.json %d KB" % (len(deps), n, len(books), MONEY.stat().st_size // 1024))


if __name__ == "__main__":
    main()
