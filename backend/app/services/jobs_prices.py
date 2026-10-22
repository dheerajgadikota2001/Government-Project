"""
Jobs and prices for Andhra Pradesh, shaped from MoSPI's rows into one seed.

Two official series, both from the National Statistics Office (MoSPI):

  jobs    Periodic Labour Force Survey (PLFS), quarterly bulletin, current weekly
          status, persons aged 15 and above: labour force participation rate,
          worker population ratio and unemployment rate, for Andhra Pradesh and
          All India, by sex and by rural / urban.
  prices  Consumer Price Index, base 2024=100: the general index and the food
          and beverages index, with MoSPI's own inflation rate (change over the
          same month a year earlier), rural / urban / combined.

Every number is MoSPI's, copied as served. Nothing here adds, averages, ranks or
subtracts. The one sum below, the check that unemployment agrees with the other
two rates, is a gate on the data and is never stored or shown.

Two labels MoSPI's service does not carry, and this module adds from MoSPI's
own release practice:
  * the newest CPI month is "provisional": the press release prints it as such
    and finalises it a month later. Every earlier month is "final".
  * a PLFS quarter is printed without a stage, so it carries none.

The gates in validate() decide whether a build may be written at all. A build
that fails one is refused, whatever else it holds, because a seed is what the
site shows.
"""

from __future__ import annotations

from datetime import date

QUARTERS = {"Jan-Mar": 1, "Apr-Jun": 2, "Jul-Sep": 3, "Oct-Dec": 4}
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August",
          "September", "October", "November", "December"]
INDICATORS = {
    "LFPR (Labour Force Participation Rate, in per cent)": "lfpr",
    "WPR (Worker Population Ratio, in per cent)": "wpr",
    "UR (Unemployment Rate, in per cent)": "ur",
}
PLACE = {"Andhra Pradesh": "andhra_pradesh", "All India": "all_india"}
AREA_JOBS = {"rural": "rural", "urban": "urban", "rural + urban": "total"}
AREA_PRICES = {"Rural": "rural", "Urban": "urban", "Combined": "total"}
DIVISIONS = {"CPI (General)": "general", "Food and beverages": "food"}

SOURCES = {
    "mospi_plfs_quarterly": {
        "title": "Periodic Labour Force Survey, Quarterly Bulletin",
        "publisher": "National Statistics Office, Ministry of Statistics and Programme Implementation",
        # MoSPI's home page lists each new bulletin; the source watcher fingerprints its document links.
        "url": "https://www.mospi.gov.in/",
        "checked_against": {
            "release": "PLFS Quarterly Bulletin April-June 2026, released 10 August 2026",
            "url": "https://www.mospi.gov.in/uploads/publications_reports/publications_reports1786356638461_03375143-dcda-4a2e-89bf-036a8c7a87fc_PLFS_QB_April_June_2026.pdf",
        },
        "table": "Detailed Tables 2, 3 and 5 (state-level LFPR, WPR and UR in current weekly status)",
        "originating_agency": "National Statistics Office, MoSPI",
    },
    "mospi_cpi": {
        "title": "Consumer Price Index, monthly press release",
        "publisher": "National Statistics Office, Ministry of Statistics and Programme Implementation",
        "url": "https://www.mospi.gov.in/",
        "checked_against": {
            "release": "CPI press release for September 2026, released 12 October 2026 (Annexure III)",
            "url": "https://www.mospi.gov.in/uploads/latestreleasesfiles/1791801549227-Press%20Release%20for%20the%20month%20of%20September,%202026.pdf",
        },
        "table": "State/UT wise general index and inflation (base 2024=100)",
        "originating_agency": "National Statistics Office, MoSPI",
    },
    "mospi_data_service": {
        "title": "eSankhyiki data service (MCP server over MoSPI's open data API)",
        "publisher": "Ministry of Statistics and Programme Implementation",
        # "endpoint", not "url": it answers POST only, so the source watcher, which reads "url",
        # would call a working service dead. The releases it mirrors are watched above.
        "endpoint": "https://mcp.mospi.gov.in/",
        "table": "PLFS frequency 2 (quarterly bulletin); CPI base year 2024, current series",
        "originating_agency": "National Statistics Office, MoSPI",
    },
}

README = (
    "Jobs and prices for Andhra Pradesh and All India, as MoSPI serves them. Built by "
    "scripts/build_jobs_prices_seed.py from MoSPI's data service, after every gate in "
    "app/services/jobs_prices.py passed. Never edited by hand: rebuild, read the diff, commit."
)


class GateFailure(ValueError):
    """The build broke a rule a published seed must keep. Nothing is written."""


def _num(v, row: dict | None = None) -> float:
    """A figure as MoSPI printed it, or a refusal naming the row. Never a guess at what was meant."""
    if v is None or str(v).strip() in ("", "-", "NA", "N.A."):
        raise GateFailure(f"a blank value where a figure belongs: {v!r} in {row}")
    try:
        return float(str(v).replace(",", ""))
    except ValueError:
        raise GateFailure(f"a value that is not a number: {v!r} in {row}") from None


def job_points(rows: list[dict]) -> list[dict]:
    """MoSPI's PLFS rows to our points. A row we do not recognise stops the build."""
    out = []
    for r in rows:
        if r.get("indicator") not in INDICATORS or r.get("state") not in PLACE:
            raise GateFailure(f"an unexpected PLFS row: {r}")
        if r.get("quarter") not in QUARTERS or r.get("sector") not in AREA_JOBS:
            raise GateFailure(f"an unexpected PLFS period or area: {r}")
        out.append({
            "measure": INDICATORS[r["indicator"]],
            "place": PLACE[r["state"]],
            "year": int(r["year"]),
            "quarter": r["quarter"],
            "sex": r["gender"],
            "area": AREA_JOBS[r["sector"]],
            "value": _num(r["value"], r),
            "unit": "%",
            "source": "mospi_plfs_quarterly",
        })
    return sorted(out, key=lambda p: (p["measure"], p["place"], p["year"], QUARTERS[p["quarter"]], p["sex"], p["area"]))


def price_points(rows: list[dict]) -> list[dict]:
    """MoSPI's CPI rows to our points, with the newest month marked provisional."""
    out = []
    for r in rows:
        if r.get("division") not in DIVISIONS or r.get("state") not in ("Andhra Pradesh", "All India"):
            raise GateFailure(f"an unexpected CPI row: {r}")
        if r.get("month") not in MONTHS or r.get("sector") not in AREA_PRICES:
            raise GateFailure(f"an unexpected CPI period or area: {r}")
        out.append({
            "measure": DIVISIONS[r["division"]],
            "place": PLACE[r["state"]],
            "year": int(r["year"]),
            "month": MONTHS.index(r["month"]) + 1,
            "area": AREA_PRICES[r["sector"]],
            "index": _num(r["index"], r),
            # The base-2024 series starts in January 2025, and MoSPI's service gives no inflation rate for
            # any month of 2025: there is no year-earlier month on the new base. Blank stays blank.
            "inflation": _num(r["inflation"], r) if r.get("inflation") not in (None, "") else None,
            "base": "2024=100",
            "source": "mospi_cpi",
        })
    newest = max(((p["year"], p["month"]) for p in out), default=None)
    for p in out:
        p["stage"] = "provisional" if (p["year"], p["month"]) == newest else "final"
    return sorted(out, key=lambda p: (p["measure"], p["place"], p["year"], p["month"], p["area"]))


def build_seed(plfs_rows: list[dict], cpi_rows: list[dict], read_on: date) -> dict:
    jobs, prices = job_points(plfs_rows), price_points(cpi_rows)
    return {
        "_readme": README,
        "read_on": read_on.isoformat(),
        "sources": SOURCES,
        "jobs": {
            "what": "Of people aged 15 and above, the share in the labour force (LFPR), the share working (WPR), "
                    "and of those in the labour force, the share without work (UR). Current weekly status: "
                    "what a person did in the seven days before the survey.",
            "points": jobs,
        },
        "prices": {
            "what": "How much the prices of what households buy changed against the same month a year earlier, "
                    "with the index itself (2024 = 100).",
            "points": prices,
        },
        "counts": {"job_points": len(jobs), "price_points": len(prices)},
    }


def _latest(points: list[dict], period) -> tuple:
    return max(period(p) for p in points)


def validate(seed: dict, previous: dict | None = None) -> list[str]:
    """Raise GateFailure on anything a published seed must not carry; return notes worth reading."""
    notes: list[str] = []
    jobs, prices = seed["jobs"]["points"], seed["prices"]["points"]
    if not jobs or not prices:
        raise GateFailure("jobs or prices came back empty")

    # 1. One value per cell. A duplicate means two rows claim the same place, time and group.
    for name, pts, key in (("jobs", jobs, lambda p: (p["measure"], p["place"], p["year"], p["quarter"], p["sex"], p["area"])),
                           ("prices", prices, lambda p: (p["measure"], p["place"], p["year"], p["month"], p["area"]))):
        keys = [key(p) for p in pts]
        if len(keys) != len(set(keys)):
            dup = next(k for k in keys if keys.count(k) > 1)
            raise GateFailure(f"{name}: two values for {dup}")

    # 2. Values a rate or an index can actually take.
    for p in jobs:
        if not 0 <= p["value"] <= 100:
            raise GateFailure(f"jobs: {p['measure']} {p['value']} is not a percentage ({p})")
    for p in prices:
        if not 0 < p["index"] < 1000:
            raise GateFailure(f"prices: index {p['index']} is not plausible ({p})")
        if p["inflation"] is not None and not -30 <= p["inflation"] <= 60:
            raise GateFailure(f"prices: inflation {p['inflation']} is not plausible ({p})")

    # 3. The newest quarter and month are complete for Andhra Pradesh: a reader must never see
    #    the newest figure for one group next to an older one for another, unannounced.
    ap_jobs = [p for p in jobs if p["place"] == "andhra_pradesh"]
    yq = _latest(ap_jobs, lambda p: (p["year"], QUARTERS[p["quarter"]]))
    newest_q = [p for p in ap_jobs if (p["year"], QUARTERS[p["quarter"]]) == yq]
    for m in ("lfpr", "wpr", "ur"):
        cells = {(p["sex"], p["area"]) for p in newest_q if p["measure"] == m}
        want = {(s, a) for s in ("male", "female", "person") for a in ("rural", "urban", "total")}
        if cells != want:
            raise GateFailure(f"jobs: the newest quarter {yq} is missing {sorted(want - cells)} for {m}")
    ap_prices = [p for p in prices if p["place"] == "andhra_pradesh"]
    ym = _latest(ap_prices, lambda p: (p["year"], p["month"]))
    for m in ("general", "food"):
        cells = {p["area"] for p in ap_prices if (p["year"], p["month"]) == ym and p["measure"] == m}
        if cells != {"rural", "urban", "total"}:
            raise GateFailure(f"prices: the newest month {ym} is incomplete for {m}: {sorted(cells)}")
        if any(p["inflation"] is None for p in ap_prices if (p["year"], p["month"]) == ym and p["measure"] == m):
            raise GateFailure(f"prices: the newest month {ym} has no inflation rate for {m}")

    # 4. The three job rates must agree: UR = (LFPR - WPR) / LFPR, up to MoSPI's rounding to
    #    one decimal. A row from the wrong table or a shifted column breaks this at once.
    by = {(p["measure"], p["place"], p["year"], p["quarter"], p["sex"], p["area"]): p["value"] for p in jobs}
    for (m, place, y, q, s, a), ur in by.items():
        if m != "ur":
            continue
        lf, wp = by.get(("lfpr", place, y, q, s, a)), by.get(("wpr", place, y, q, s, a))
        if lf and wp is not None and lf > 0:
            implied = (lf - wp) / lf * 100
            # Rounding three one-decimal figures moves the implied rate further when the base is small.
            if abs(implied - ur) > 0.15 + 10 / lf:
                raise GateFailure(f"jobs: UR {ur} does not agree with LFPR {lf} and WPR {wp} for {place} {y} {q} {s} {a}")

    # 5. Exactly one provisional CPI month, and it is the newest.
    prov = {(p["year"], p["month"]) for p in prices if p["stage"] == "provisional"}
    if prov != {_latest(prices, lambda p: (p["year"], p["month"]))}:
        raise GateFailure(f"prices: provisional months {sorted(prov)} are not just the newest")

    # 6. Against the last published seed: nothing may disappear, and every change is named.
    if previous:
        for name, key, val in (("jobs", lambda p: (p["measure"], p["place"], p["year"], p["quarter"], p["sex"], p["area"]), lambda p: p["value"]),
                               ("prices", lambda p: (p["measure"], p["place"], p["year"], p["month"], p["area"]), lambda p: (p["index"], p["inflation"]))):
            old = {key(p): val(p) for p in previous[name]["points"]}
            new = {key(p): val(p) for p in seed[name]["points"]}
            gone = sorted(set(old) - set(new))
            if gone:
                raise GateFailure(f"{name}: {len(gone)} published values would disappear, first {gone[0]}")
            changed = [(k, old[k], new[k]) for k in old if old[k] != new[k]]
            for k, a, b in changed:
                notes.append(f"{name}: {k} changed from {a} to {b} (MoSPI revised it, or a provisional month became final)")
            added = len(set(new) - set(old))
            if added:
                notes.append(f"{name}: {added} new values")
    return notes
