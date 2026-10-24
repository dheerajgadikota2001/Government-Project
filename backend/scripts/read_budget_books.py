"""
Revised estimates and spending for all forty demands, from the budget books.

    python scripts/read_budget_books.py fetch     # download the books (about 1.2 GB, once)
    python scripts/read_budget_books.py read      # read every demand's totals from them
    python scripts/read_budget_books.py build     # check every figure, print the report
    python scripts/read_budget_books.py build --write   # and write seed/departments_seed.json

WHAT IT READS

Volume III of each budget book from 2015-16 to 2026-27 (17 parts a year) prints a
summary for every demand: Accounts of two years back, Budget and Revised Estimate
of the year before, and the Budget Estimate of the new year. So the book of year Y
gives the revised estimate of Y-1 and the spending (Accounts) of Y-2. The 2016-17
book prints no Accounts column, so the spending of 2014-15 comes from CAG's
Appropriation Accounts for 2014-15, which print it by section.

The same Appropriation Accounts are an independent check on the Accounts column
of the books. Two of them, 2016-17 and 2021-22, print correctly but carry no text
a program can read. Those are read from a copy whose fonts were given their
letters back from a glyph map checked by eye (app/scrapers/font_repair.py, maps
in app/scrapers/glyph_maps/). Their rows pass the same checks as every other year.

WHAT COUNTS AS VERIFIED

A demand's figures from one book are used only when all of these hold:
  A. the gross total minus the recoveries printed under it equals the net total;
  B. charged plus voted equals the total they are printed under, where printed;
  and at least one anchor proves the columns were placed right on that page:
  C. the table's Budget Estimate for the book year equals the grant (voted plus
     charged) printed at the top of the same demand, or
  D. it equals the Budget Estimate already on the site from Volume I/2.
Every book must give all forty demands. If anything fails, build stops and says
what failed. Nothing is filled in, averaged or added up to make a total.

WHICH FIGURE IS SHOWN

The gross total of the demand, because the Budget Estimates on the site (Volume
I/2) are gross, and plan, revised plan and spending must be measured the same way.
The net total and the recoveries are kept beside it. Books before 2017-18 print a
Non-Plan and a Plan summary and no single total; those years carry the two printed
parts and no total. So does 2014-15 spending, in CAG's sections.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from collections import Counter, defaultdict
from decimal import ROUND_DOWN, ROUND_HALF_UP, Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.scrapers.appropriation_accounts import read_summary, readable  # noqa: E402
from app.scrapers import font_repair, positional_text  # noqa: E402
from app.scrapers.budget_demands import page_texts, read_volume  # noqa: E402

SEED = ROOT / "seed" / "departments_seed.json"
CACHE = ROOT.parent / "sources" / "budget_books"
UA = "APFactCheck-budget-reader/1.0 (+https://apfactcheck.dheeco.com)"
BOOKS = ["2015-16", "2016-17", "2017-18", "2018-19", "2019-20", "2020-21", "2021-22",
         "2022-23", "2023-24", "2024-25", "2025-26", "2026-27"]
PARTS = range(1, 18)
ROMANS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV",
          "XVI", "XVII", "XVIII", "XIX", "XX", "XXI", "XXII", "XXIII", "XXIV", "XXV", "XXVI", "XXVII",
          "XXVIII", "XXIX", "XXX", "XXXI", "XXXII", "XXXIII", "XXXIV", "XXXV", "XXXVI", "XXXVII",
          "XXXVIII", "XXXIX", "XL"]
CAG = "https://d1jmc0u14z2tmp.cloudfront.net/uploads/state_accounts_report/"
# CAG's Appropriation Accounts, Andhra Pradesh. The two year-less file names were
# matched to their years by the year printed on their covers.
AA_FILES = {
    "2014-15": "AP_Appropriation_Accounts_2014_15.pdf",
    "2015-16": "AP_Appropriation_Accounts_2015_16.pdf",
    "2016-17": "AP_Appropriation_Accounts_2016_17.PDF",
    "2017-18": "APPR-ACNTS.pdf",
    "2018-19": "account-report-897-05fc9e2d600d7b6-90510120.pdf",
    "2019-20": "account-report-Appropriation-Accounts-2019-20-060b9c6f1902b80-58773987.pdf",
    "2020-21": "account-report-Appropriation-Accounts-2020-2021-0623daff639e5a9-45496256.pdf",
    "2021-22": "account-report-Appropriation-Accounts-2021-22-0641db220000320-07132641.pdf",
    "2022-23": "account-report-Appropriation-Accounts-2022-23-065c4cd689fba81-67734359.pdf",
    "2023-24": "account-report-Appropriation-accounts-2023-24-06734a2d242ea69-40544853.pdf",
    "2024-25": "account-report-Appropriation-Accounts-2024-25-069aadb2aa51e12-42366863.pdf",
}
# CAG books whose text layer cannot be read: the glyph map that gives their fonts their letters
# back, and how the page text is then made. The 2016-17 fonts declare every glyph one em wide,
# so their word gaps are found from where each glyph sits (positional_text); the 2021-22 fonts
# have true widths, and pdftotext reads the repaired copy as it reads any other year.
REPAIRED = {
    "2016-17": ("AA_2016-17.json", "positions"),
    "2021-22": ("AA_2021-22.json", "pdftotext"),
}
READ_FROM_REPAIR = ("CAG's file carries no readable text, so it was read from a copy whose fonts were given "
                    "their letters back, glyph by glyph, from a map checked by eye. Nothing printed was changed.")
CHECK_WORDS = {
    "A": "gross total minus recoveries equals the net total",
    "B": "charged plus voted equals the total",
    "C": "the book's budget estimate on the same row equals the grant printed at the top of the demand",
    "D": "the book's budget estimate on the same row equals Volume I/2",
}
# Books presented after the year before them had ended (after an election), so the
# "revised estimate" they print for that year is close to its final accounts.
LATE_BOOKS = {"2019-20": "July 2019", "2024-25": "November 2024"}
D = Decimal


def book_url(book, part):
    if book in ("2024-25", "2025-26", "2026-27"):
        return "https://apfinance.gov.in/...Bud@et%s/documents/Volume-III-%d.pdf" % (book[2:], part)
    return "https://s3.ap-south-1.amazonaws.com/apfinance.gov.in/uploads/budget-volumes/%s/Volume-III-%d.pdf" % (book, part)


def tenure(year):
    y = int(year[:4])
    return "tdp1" if y <= 2018 else ("ysrcp" if y <= 2023 else "tdp2")


def crore(lakh):
    return float((D(lakh) / 100).quantize(D("0.01"), rounding=ROUND_HALF_UP))


def same_as_site(lakh, site_crore):
    """The site stores crore to two decimals. Older imports sometimes truncated
    (8213,09.50 lakh stored as 8213.09), so a truncated match counts too."""
    x = D(lakh) / 100
    s = D(str(site_crore)).quantize(D("0.01"))
    return s in (x.quantize(D("0.01"), rounding=ROUND_HALF_UP), x.quantize(D("0.01"), rounding=ROUND_DOWN))


# ------------------------------------------------------------------ fetch
def fetch(cache: Path):
    import requests
    cache.mkdir(parents=True, exist_ok=True)
    man_path = cache / "manifest.json"
    manifest = json.loads(man_path.read_text()) if man_path.exists() else {}
    jobs = [("%s/Volume-III-%d.pdf" % (b, n), book_url(b, n)) for b in BOOKS for n in PARTS]
    jobs += [("cag/AA_%s.pdf" % y, CAG + f) for y, f in AA_FILES.items()]
    for rel, url in jobs:
        if manifest.get(rel, {}).get("ok") and (cache / rel).exists():
            continue
        (cache / rel).parent.mkdir(parents=True, exist_ok=True)
        rec = {"ok": False, "url": url}
        for attempt in range(4):
            try:
                r = requests.get(url, headers={"User-Agent": UA}, timeout=(10, 300))
                if r.status_code == 200 and r.content[:4] == b"%PDF":
                    (cache / rel).write_bytes(r.content)
                    rec = {"ok": True, "url": url, "bytes": len(r.content),
                           "sha256": hashlib.sha256(r.content).hexdigest(),
                           "fetched": time.strftime("%Y-%m-%d")}
                    break
                rec["error"] = "HTTP %s" % r.status_code
            except Exception as e:  # network trouble is reported, never hidden
                rec["error"] = "%s: %s" % (type(e).__name__, str(e)[:80])
            time.sleep(3 * (attempt + 1))
        manifest[rel] = rec
        man_path.write_text(json.dumps(manifest, indent=1))
        print(rel, rec.get("bytes") or rec.get("error"), flush=True)
        time.sleep(0.5)  # one request at a time, with a pause: these are public servers
    bad = [k for k, v in manifest.items() if not v.get("ok")]
    print("fetched %d, failed %d" % (len(manifest) - len(bad), len(bad)))
    return not bad


# ------------------------------------------------------------------ read
def read(cache: Path):
    import pdfplumber
    sections, problems, aa = [], [], {}
    for b in BOOKS:
        t0 = time.time()
        for n in PARTS:
            path = cache / b / ("Volume-III-%d.pdf" % n)
            with pdfplumber.open(path) as pdf:
                s, p = read_volume(pdf, b, n, page_texts(path, pdf))
            sections += s
            problems += p
        print(b, "sections", sum(1 for s in sections if s["book"] == b), "%.0fs" % (time.time() - t0), flush=True)
    for y in AA_FILES:
        src = cache / "cag" / ("AA_%s.pdf" % y)
        if y in REPAIRED:
            name, how = REPAIRED[y]
            fixed = cache / "cag" / ("AA_%s.repaired.pdf" % y)
            if not fixed.exists():
                font_repair.repair(src, fixed, font_repair.load_map(name))
            texts = positional_text.page_texts(fixed) if how == "positions" else page_texts(fixed)
        else:
            texts = page_texts(src)
        aa[y] = {"readable": readable(texts), "rows": read_summary(texts, y) if readable(texts) else [],
                 "repaired": y in REPAIRED}
        print("CAG", y, "rows", len(aa[y]["rows"]), "" if aa[y]["readable"] else "(text layer not readable)", flush=True)
    out = {"sections": sections, "problems": problems, "appropriation_accounts": aa}
    (cache / "readings.json").write_text(json.dumps(out, indent=1))
    return out


# ------------------------------------------------------------------ build
def resolve(t):
    """Which printed row is the demand's gross total, and which its net total."""
    def all_nil(e):
        return e is not None and all(c["lakh"] is not None and D(c["lakh"]) == 0 for c in e["columns"])
    if "gross" in t:
        return t["gross"], t.get("net") or t.get("total"), "printed gross total"
    cap_nil = "capital" not in t or all_nil(t["capital"])
    loans_nil = "loans" not in t or all_nil(t["loans"])
    if "total" in t:
        tot = t["total"]
        if not tot.get("recoveries") and "net" not in t and "net_revenue" not in t:
            return tot, None, "printed total, no recoveries printed"
        if "gross_revenue" in t and cap_nil and loans_nil:
            return t["gross_revenue"], tot, "printed gross revenue, capital printed nil"
        return None, None, "gross total not printed"
    if "net" in t and "gross_revenue" in t and cap_nil and loans_nil:
        return t["gross_revenue"], t["net"], "printed gross revenue, capital printed nil"
    return None, None, "no total found"


def check_section(sec, site_be):
    """Checks A to E for one demand section. Returns (result dict, verified)."""
    g, net, how = resolve(sec["totals"])
    if g is None:
        return {"why": how}, False
    cols = g["columns"]
    res = {"gross": g, "net": net, "how": how, "checks": {}}
    rec = g.get("recoveries")
    if net:
        ok = True
        for i, c in enumerate(cols):
            gv, nv = c["lakh"], net["columns"][i]["lakh"]
            if gv is None and nv is None:
                continue
            rv = D(rec[i]) if rec and rec[i] is not None else D(0)
            if gv is None or nv is None or D(gv) + rv != D(nv):
                ok = False
        res["checks"]["A"] = ok
    for e in (g, net):
        if e and e.get("charged") and e.get("voted"):
            ok = all(c["lakh"] is None or D(e["charged"][i] or 0) + D(e["voted"][i] or 0) == D(c["lakh"])
                     for i, c in enumerate(e["columns"]))
            res["checks"]["B"] = res["checks"].get("B", True) and ok
    be = cols[-1]["lakh"]
    if sec.get("grant_voted_be") and be is not None:
        res["checks"]["C"] = D(sec["grant_voted_be"]) + D(sec.get("sums_charged_be") or 0) == D(be)
    if sec["section"] == "ALL" and site_be is not None and be is not None:
        res["checks"]["D"] = same_as_site(be, site_be)
    verified = res["checks"].get("A", True) and res["checks"].get("B", True) and \
        (res["checks"].get("C") is True or res["checks"].get("D") is True)
    return res, verified


def col(e, kind):
    for i, c in enumerate(e["columns"]):
        if c["kind"] == kind:
            return i, c
    return None, None


def build(cache: Path, write: bool):
    data = json.loads((cache / "readings.json").read_text())
    seed = json.loads(SEED.read_text())
    site_be = {(d["demand_no"], r["year"]): r["total_crore"] for d in seed["departments"] for r in d["rows"] if r["stage"] == "BE"}
    failures = []
    # one record per book, demand and section
    secs = {}
    for s in data["sections"]:
        secs.setdefault((s["book"], s["demand"], s["section"]), s)
    for b in BOOKS:
        have = {d for (bb, d, _) in secs if bb == b}
        miss = [r for r in ROMANS if r not in have]
        if miss:
            failures.append("%s: demands not found: %s" % (b, ", ".join(miss)))
    for p in data["problems"]:
        failures.append("%s demand %s %s: %s (page %s)" % (p["book"], p["demand"], p["section"], p["why"], p.get("page")))
    checked = {}
    for k, s in secs.items():
        res, _ = check_section(s, site_be.get((s["demand"], s["book"])))
        res["sec"] = s
        checked[k] = res
    # Books with Non-Plan and Plan summaries: the two printed budget estimates of the
    # book year must together equal the one figure Volume I/2 prints (a check only;
    # the sum is never shown).
    for (b, dem, sec), res in checked.items():
        if sec == "ALL" or "gross" not in res:
            continue
        pair = [checked.get((b, dem, x)) for x in ("NON-PLAN", "PLAN")]
        site = site_be.get((dem, b))
        if site is None or any(p is None or "gross" not in p for p in pair if p is not None):
            continue
        tot = sum(D(p["gross"]["columns"][-1]["lakh"] or 0) for p in pair if p is not None)
        res["checks"]["D"] = same_as_site(tot, site)
    for k, res in checked.items():
        c = res.get("checks") or {}
        ok = "gross" in res and c.get("A", True) and c.get("B", True) and (c.get("C") is True or c.get("D") is True)
        if not ok:
            failures.append("%s demand %s %s: not verified %s" % (k[0], k[1], k[2], c or res.get("why")))
    # ---- CAG: grant totals for the check, and the parts of 2014-15
    aa_tot, aa_rows, aa_ok = defaultdict(D), defaultdict(list), {}
    for y, v in data["appropriation_accounts"].items():
        aa_ok[y] = v["readable"]
        for r in v["rows"]:
            aa_rows[(y, r["grant"])].append(r)
            if r["section"] != "Public Debt":
                aa_tot[(y, r["grant"])] += D(r["expenditure_thousand"]) / 100  # in lakh
    # ---- rows
    new_rows = defaultdict(list)
    report = Counter()
    for (b, dem, sec), res in sorted(checked.items()):
        if "gross" not in res:
            continue
        g, net, s = res["gross"], res["net"], res["sec"]
        i_re, c_re = col(g, "re")
        i_ac, c_ac = col(g, "accounts")
        base = {"book": b, "volume": "III/%d" % s["part"], "pdf_page": g["page"], "source_url": book_url(b, s["part"]),
                "checks": [CHECK_WORDS[k] for k, v in sorted(res["checks"].items()) if v is True], "basis": res["how"]}
        for stage, i, c in (("RE", i_re, c_re), ("Actual", i_ac, c_ac)):
            if c is None or c["lakh"] is None or c["year"] < "2014-15":
                continue  # 2013-14 and before are the undivided state
            colname = ("Revised Estimate %s" if stage == "RE" else "Accounts %s") % c["year"]
            entry = dict(base, year=c["year"], stage=stage, section=sec, column=colname,
                         gross_lakh=c["lakh"], printed_gross=c["printed"], label=g["label"])
            if net:
                entry["net_lakh"] = net["columns"][i]["lakh"]
                entry["printed_net"] = net["columns"][i]["printed"]
            if g.get("recoveries"):
                entry["recoveries_lakh"] = g["recoveries"][i]
            for part in ("gross_revenue", "capital", "loans"):
                e = s["totals"].get(part)
                if e and e["columns"][i]["lakh"] is not None:
                    entry[part + "_lakh"] = e["columns"][i]["lakh"]
            if g.get("charged") and g.get("voted"):
                entry["charged_lakh"], entry["voted_lakh"] = g["charged"][i], g["voted"][i]
            new_rows[(dem, c["year"], stage)].append(entry)
    out_rows = defaultdict(list)
    for (dem, year, stage), entries in new_rows.items():
        if len(entries) > 1 and any(e["section"] == "ALL" for e in entries):
            failures.append("%s %s %s: printed in more than one book" % (dem, year, stage))
            continue
        if entries[0]["section"] == "ALL":
            e = entries[0]
            row = {
                "year": year, "tenure": tenure(year), "stage": stage,
                "total_crore": crore(e["gross_lakh"]),
                # with no recoveries printed, net is the gross; with recoveries and no net row, net is not read
                "net_crore": crore(e["net_lakh"]) if e.get("net_lakh") else (
                    crore(e["gross_lakh"]) if not e.get("recoveries_lakh") or D(e["recoveries_lakh"]) == 0 else None),
                "recoveries_crore": crore(e["recoveries_lakh"]) if e.get("recoveries_lakh") else 0.0,
                "split_type": "revenue_capital",
                "revenue_crore": crore(e["gross_revenue_lakh"]) if e.get("gross_revenue_lakh") else None,
                "capital_crore": crore(e["capital_lakh"]) if e.get("capital_lakh") else None,
                "loans_crore": crore(e["loans_lakh"]) if e.get("loans_lakh") else None,
                "charged_crore": crore(e["charged_lakh"]) if e.get("charged_lakh") else None,
                "voted_crore": crore(e["voted_lakh"]) if e.get("voted_lakh") else None,
                "printed": {"gross": e["printed_gross"], "net": e.get("printed_net"), "unit": "Rupees in lakh"},
                "source_url": e["source_url"], "book": e["book"], "volume": e["volume"], "pdf_page": e["pdf_page"],
                "page": "Volume %s of the %s budget, PDF page %d: Demand %s summary, column '%s', row '%s'" % (
                    e["volume"], e["book"], e["pdf_page"], dem, e["column"], e["label"]),
                "checks": e["checks"],
            }
            if stage == "RE" and e["book"] in LATE_BOOKS:
                row["note"] = ("This book was presented in %s, after the year %s had ended, so its revised "
                               "estimate for that year is close to the final accounts." % (LATE_BOOKS[e["book"]], year))
            if stage == "Actual":
                row["cag_check"] = cag_check(dem, year, D(e["gross_lakh"]), aa_ok, aa_tot, aa_rows)
                report["cag " + row["cag_check"]["result"]] += 1
            out_rows[dem].append(row)
            report[stage] += 1
        else:
            parts = sorted(entries, key=lambda e: 0 if e["section"] == "NON-PLAN" else 1)
            row = {
                "year": year, "tenure": tenure(year), "stage": stage,
                "total_crore": None, "split_type": "plan_nonplan",
                "parts": [{"label": "Non-Plan" if p["section"] == "NON-PLAN" else "Plan",
                           "crore": crore(p["gross_lakh"]),
                           "net_crore": crore(p["net_lakh"]) if p.get("net_lakh") else crore(p["gross_lakh"]),
                           "printed": p["printed_gross"], "pdf_page": p["pdf_page"]} for p in parts],
                "source_url": parts[0]["source_url"], "book": parts[0]["book"], "volume": parts[0]["volume"],
                "pdf_page": parts[0]["pdf_page"],
                "page": "Volume %s of the %s budget: %s, column '%s'" % (
                    parts[0]["volume"], parts[0]["book"],
                    " and ".join("%s summary on PDF page %d" % ("Non-Plan" if p["section"] == "NON-PLAN" else "Plan", p["pdf_page"]) for p in parts),
                    parts[0]["column"]),
                "checks": sorted(set(c for p in parts for c in p["checks"])),
            }
            if len(parts) == 1:
                # the demand has a Non-Plan section only: that printed total is the demand's total
                row["total_crore"] = row["parts"][0]["crore"]
                row["net_crore"] = row["parts"][0]["net_crore"]
                row["note"] = "The book prints a Non-Plan summary only for this demand, so its total is the demand's total."
            else:
                row["note"] = ("The book prints this year in two parts, Non-Plan and Plan, on separate pages, "
                               "and no single total for the demand.")
            out_rows[dem].append(row)
            report[stage + " (two parts)" if len(parts) > 1 else stage] += 1
    # ---- 2014-15 spending from CAG's sections
    for dem in ROMANS:
        rows = aa_rows.get(("2014-15", dem), [])
        if not rows:
            failures.append("2014-15 CAG: grant %s not found" % dem)
            continue
        bad = [r for r in rows if not r["arithmetic_ok"] or r["attribution"] == "not confirmed"]
        if bad:
            failures.append("2014-15 CAG grant %s: %d rows not confirmed" % (dem, len(bad)))
            continue
        parts = [{"label": "%s, %s" % (r["section"], r["vc"].lower()), "crore": crore(D(r["expenditure_thousand"]) / 100),
                  "printed": r["printed"][1], "unit": "Rupees in thousand", "pdf_page": r["pdf_page"]}
                 for r in rows if r["section"] != "Public Debt"]
        debt = [r for r in rows if r["section"] == "Public Debt"]
        row = {"year": "2014-15", "tenure": "tdp1", "stage": "Actual", "total_crore": None,
               "split_type": "cag_sections", "parts": parts,
               "source_url": CAG + AA_FILES["2014-15"], "book": "CAG Appropriation Accounts 2014-15",
               "pdf_page": rows[0]["pdf_page"],
               "page": "Appropriation Accounts 2014-15 (CAG), Summary of Appropriation Accounts, PDF page %d: grant %s, column 'Expenditure'" % (rows[0]["pdf_page"], dem),
               "checks": ["grant minus expenditure equals the saving or excess printed", "figures found on the grant's own pages"],
               "two_periods": True,
               "note": ("The 2016-17 budget book, which would print the Accounts of 2014-15, has no Accounts column. "
                        "CAG's audited accounts print this grant by section and give no single total. CAG's book for "
                        "2014-15 covers two periods together: the undivided state from 1 April to 1 June 2014, and the "
                        "new state from 2 June 2014 to 31 March 2015.")}
        if debt:
            row["note"] += " Repayment of public debt, printed under this grant, is left out as the budget books do."
        out_rows[dem].append(row)
        report["Actual 2014-15 (CAG sections)"] += 1
    # ---- report
    print("\n".join(sorted("%s: %d" % kv for kv in report.items())))
    if failures:
        print("\nNOT WRITTEN. %d problems:" % len(failures))
        for f in failures[:60]:
            print("  " + f)
        return False
    missing = [(d, y, st) for d in ROMANS for st, years in (("RE", range(2014, 2026)), ("Actual", range(2014, 2025)))
               for y in ["%d-%02d" % (yy, (yy + 1) % 100) for yy in years]
               if not any(r["year"] == y and r["stage"] == st for r in out_rows[d])]
    if missing:
        print("\nNOT WRITTEN. Missing figures: %s" % missing[:20])
        return False
    if write:
        write_seed(seed, out_rows, checked)
        print("\nwrote", SEED)
    return True


def cag_check(dem, year, gross_lakh, aa_ok, aa_tot, aa_rows):
    url = CAG + AA_FILES.get(year, "")
    if year not in aa_ok:
        return {"result": "no CAG accounts for this year"}
    if not aa_ok[year]:
        return {"result": "CAG's file has no readable text", "url": url}
    if dem == "IX":
        return {"result": "not compared", "why": "this demand carries public debt, which the two papers treat differently", "url": url}
    rows = aa_rows.get((year, dem), [])
    how = {"how": READ_FROM_REPAIR} if year in REPAIRED else {}
    if not rows or any(r["attribution"] == "not confirmed" for r in rows):
        return {"result": "not compared", "why": "CAG's rows for this grant could not all be confirmed", "url": url, **how}
    a = aa_tot[(year, dem)]
    res = {"cag_lakh": str(a), "url": url, "pdf_page": rows[0]["pdf_page"], **how}
    if abs(a - gross_lakh) <= D("0.10"):
        res["result"] = "matches"
    else:
        # within 0.1 per cent is reported as agreeing closely; beyond that both papers are shown
        res["result"] = "close" if abs(gross_lakh - a) <= abs(gross_lakh) / 1000 else "differs"
        res["difference_crore"] = crore(gross_lakh - a)
        # what CAG prints for the grant, section by section; shown as printed, never added up
        res["parts"] = [{"label": "%s, %s" % (r["section"], r["vc"].lower()),
                         "crore": crore(D(r["expenditure_thousand"]) / 100), "printed": r["printed"][1]}
                        for r in rows if r["section"] != "Public Debt"]
    return res


def write_seed(seed, out_rows, checked):
    order = {"BE": 0, "RE": 1, "Actual": 2}
    for dep in seed["departments"]:
        keep = [r for r in dep["rows"] if r["stage"] == "BE"]
        for r in keep:
            fix_be(dep["demand_no"], r, checked)
        dep["rows"] = sorted(keep + out_rows[dep["demand_no"]], key=lambda r: (r["year"], order[r["stage"]]))
    seed["how_to_read"]["body"] = HOW_TO_READ
    seed["caveats"] = [c for c in seed["caveats"] if c["title"] != "These are budget estimates, not spending"] + CAVEATS
    seed["sources"] = SOURCES
    SEED.write_text(json.dumps(seed, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def fix_be(dem, row, checked):
    """Two fixes to Budget Estimate rows, both from Volume III of the same book:
    a value stored truncated instead of rounded, and a figure that Volume III of
    the same budget prints differently from Volume I/2 (both are then shown)."""
    res = checked.get((row["year"], dem, "ALL"))
    if not res or "gross" not in res:
        return
    be = res["gross"]["columns"][-1]["lakh"]
    if same_as_site(be, row["total_crore"]):
        rounded = crore(be)
        if rounded != row["total_crore"]:
            row["note"] = ((row.get("note") or "") + " Rounded to two decimals from the printed %s lakh; it was stored cut off, as %s." % (
                res["gross"]["columns"][-1]["printed"], row["total_crore"])).strip()
            row["total_crore"] = rounded
    else:
        sec = res["sec"]
        row["second_print"] = {
            "total_crore": crore(be), "printed": res["gross"]["columns"][-1]["printed"],
            "source_url": book_url(row["year"], sec["part"]), "pdf_page": res["gross"]["page"],
            "page": "Volume III/%d of the %s budget, PDF page %d: Demand %s summary, column 'Budget Estimate %s'" % (
                sec["part"], row["year"], res["gross"]["page"], dem, row["year"]),
            "note": "Volume III of the same budget prints a different budget estimate for this demand than Volume I/2. Both are official; both are shown."}


HOW_TO_READ = (
    "Andhra Pradesh's budget is voted demand by demand, forty demands, one broad department each. "
    "Demand 12 is School Education, demand 33 is Major and Medium Irrigation. The numbering is stable across every year here. "
    "The same year appears three times as the estimate hardens: BE is the budget estimate made before the year starts, "
    "RE is the revised estimate made during it, and Actual is what the accounts recorded. All forty demands have BE for all "
    "thirteen years from 2014-15, RE from 2014-15 to 2025-26 and Actual from 2014-15 to 2024-25. Every figure is the demand's "
    "gross total as the book prints it; the net total after recoveries is kept beside it. Up to 2016-17 the books printed each "
    "demand in two parts, Non-Plan and Plan, and those years show the two printed parts, not a total of our own. "
    "Spending for 2014-15 comes from CAG's audited Appropriation Accounts, because no budget book prints it by demand; "
    "CAG's book for that year covers the undivided state from 1 April to 1 June 2014 together with the new state from 2 June 2014.")

CAVEATS = [
    {"title": "Every figure is the gross total, as printed",
     "body": "The budget estimates come from Volume I/2, which prints each demand's gross total. Revised estimates and spending "
             "come from Volume III, which prints gross, recoveries and net. Gross is shown everywhere so the three can be compared; "
             "the net figure is kept beside it."},
    {"title": "Two printed parts are not added up",
     "body": "The books of 2015-16 and 2016-17 print each demand's Non-Plan and Plan figures on separate pages and give no total. "
             "Spending in 2014-15 is printed by CAG section by section, for the undivided state's 1 April to 1 June 2014 and the "
             "new state's 2 June 2014 to 31 March 2015 together. Those years show the printed parts side by side."},
    {"title": "Books presented after an election",
     "body": "The 2019-20 book was presented in July 2019 and the 2024-25 book in November 2024, after the year before had ended. "
             "Their revised estimates for 2018-19 and 2023-24 are close to the final accounts: for 2023-24 they are the same figure "
             "for 38 of the 40 demands."},
    {"title": "Spending is checked against CAG",
     "body": "Each year's Accounts in the budget books are compared with CAG's Appropriation Accounts for the same grant. "
             "Most match to within Rs 10,000, and some more agree to within 0.1 per cent. Where they differ by more, the difference "
             "often comes in pairs: money shown under one demand "
             "in CAG's accounts and under a related demand in the later book, which restates old accounts in its own demand "
             "structure. Both figures are shown. CAG's files for 2016-17 and 2021-22 print correctly but carry no readable text; "
             "they were read from copies whose fonts were given their letters back, and their rows pass the same checks. "
             "Demand IX is not compared because the two papers treat public debt differently."},
]

SOURCES = [
    {"label": "Demands for Grants, Volume I/2 (Statement of Demands for Grants)",
     "note": "Budget estimate of every demand, one line each", "url_pattern": "https://s3.ap-south-1.amazonaws.com/apfinance.gov.in/uploads/budget-volumes/{year}/Volume-I-2.pdf",
     "years": "2014-15 to 2023-24; from 2024-25 at apfinance.gov.in/...Bud@et{yy-yy}/documents/Volume-I-2.pdf"},
    {"label": "Demands for Grants, Volume III/1 to III/17 (estimates of expenditure by demand)",
     "note": "Each demand's summary: Accounts, budget and revised estimate", "url_pattern": "https://s3.ap-south-1.amazonaws.com/apfinance.gov.in/uploads/budget-volumes/{year}/Volume-III-{part}.pdf",
     "years": "2015-16 to 2023-24; from 2024-25 at apfinance.gov.in/...Bud@et{yy-yy}/documents/Volume-III-{part}.pdf"},
    {"label": "Appropriation Accounts, Andhra Pradesh (CAG)",
     "note": "Audited spending by grant and section; used for 2014-15 and as a check on the other years",
     "url_pattern": CAG + "{file}", "years": "2014-15 to 2024-25"},
]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("step", choices=["fetch", "read", "build"])
    ap.add_argument("--cache", type=Path, default=CACHE)
    ap.add_argument("--write", action="store_true", help="build: write seed/departments_seed.json")
    a = ap.parse_args()
    if a.step == "fetch":
        sys.exit(0 if fetch(a.cache) else 1)
    if a.step == "read":
        read(a.cache)
        return
    sys.exit(0 if build(a.cache, a.write) else 1)


if __name__ == "__main__":
    main()
