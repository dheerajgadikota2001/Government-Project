"""
Build seed/jobs_prices_seed.json from MoSPI's data service.

Usage (from backend/):
    python scripts/build_jobs_prices_seed.py            # dry run: fetch, check, report; writes nothing
    python scripts/build_jobs_prices_seed.py --write    # the same, then write the seed if every gate passed

Then: python -m pytest tests/test_jobs_and_prices.py, read `git diff seed/jobs_prices_seed.json`,
and commit. The commit is the sign-off: nothing reaches the site that a person has not read.

WHEN TO RUN IT
CPI comes out on the 12th of each month (or the next working day), for the month before.
The PLFS quarterly bulletin comes about six weeks after each quarter ends (April to June
2026 was released on 10 August 2026). The source watcher flags both pages when they change.

WHAT A RUN ASKS MoSPI FOR
For Andhra Pradesh and All India: PLFS quarterly bulletin LFPR, WPR and UR (age 15+,
current weekly status) for every year MoSPI lists, and CPI base 2024 general and food
indices for every year MoSPI lists (PLFS from 2025, the redesigned survey). The years come from MoSPI's own metadata, so a new
year joins without a code change. About 70 calls; a few minutes.

Exit codes: 0 done, 2 a gate refused the build (nothing written), 3 MoSPI could not be read.
"""

import argparse
import json
import os
import sys
from datetime import date, datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import settings
from app.services.jobs_prices import QUARTERS, GateFailure, build_seed, validate
from app.services.mospi_data import MospiClient, MospiError

SEED = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "seed", "jobs_prices_seed.json")
PLFS_STATES = {1: "Andhra Pradesh", 99: "All India"}     # PLFS codes
CPI_STATES = {3: "Andhra Pradesh", 1: "All India"}       # CPI codes are different again
CPI_DIVISIONS = {0: "CPI (General)", 1: "Food and beverages"}
# PLFS was redesigned from January 2025. Quarterly bulletins before it covered towns only, under
# the old design, so they are a different series and are left out rather than drawn as one line
# with the new one. (They also carry at least one corrupt cell in MoSPI's service: All India,
# female, urban LFPR for July-September 2020 is served as "20J".) The new series starts with
# April-June 2025, the first bulletin of the new design.
PLFS_FIRST_YEAR = 2025


def fetch(client: MospiClient) -> tuple[list[dict], list[dict]]:
    plfs_years = sorted(int(y["year"]) for y in client.metadata("PLFS", indicator_code=3, frequency_code=2)["year"]
                        if int(y["year"]) >= PLFS_FIRST_YEAR)
    plfs = []
    for indicator in (1, 2, 3):
        for state in PLFS_STATES:
            for year in plfs_years:
                plfs += client.rows("PLFS", {"indicator_code": indicator, "frequency_code": 2, "year": str(year),
                                             "state_code": state, "age_code": 1})
    cpi_years = sorted({int(y["year"]) for y in client.metadata("CPI")["year"]})
    cpi = []
    for state in CPI_STATES:
        for division in CPI_DIVISIONS:
            for year in cpi_years:
                cpi += client.rows("CPI", {"base_year": "2024", "series": "Current", "year": str(year),
                                           "state_code": str(state), "division_code": str(division)})
    # Group-level rows only: a row naming a group, class or item is a different, finer index.
    cpi = [r for r in cpi if not (r.get("group") or r.get("class") or r.get("sub_class") or r.get("item"))]
    return plfs, cpi


def summary(seed: dict) -> str:
    jobs, prices = seed["jobs"]["points"], seed["prices"]["points"]
    q = max(((p["year"], p["quarter"]) for p in jobs if p["place"] == "andhra_pradesh"), key=lambda yq: (yq[0], QUARTERS[yq[1]]))
    ur = next(p["value"] for p in jobs if p["place"] == "andhra_pradesh" and (p["year"], p["quarter"]) == q
              and p["measure"] == "ur" and p["sex"] == "person" and p["area"] == "total")
    m = max((p["year"], p["month"]) for p in prices if p["place"] == "andhra_pradesh")
    cpi = next(p for p in prices if p["place"] == "andhra_pradesh" and (p["year"], p["month"]) == m
               and p["measure"] == "general" and p["area"] == "total")
    return (f"{len(jobs)} job values, {len(prices)} price values.\n"
            f"  Newest quarter {q[1]} {q[0]}: Andhra Pradesh unemployment {ur}% (persons, rural + urban).\n"
            f"  Newest month {m[1]}/{m[0]}: Andhra Pradesh CPI inflation {cpi['inflation']}% ({cpi['stage']}).")


def main(write: bool) -> int:
    started = datetime.now(timezone.utc)
    client = MospiClient(user_agent=settings.scraper_user_agent, log=lambda line: print(line, flush=True))
    try:
        plfs, cpi = fetch(client)
    except MospiError as e:
        print(f"MoSPI could not be read: {e}")
        return 3
    finally:
        client.close()
    # Keep what MoSPI sent, so a refused build can be examined without asking MoSPI again.
    raw = os.path.join(os.path.dirname(SEED), "..", "logs", f"mospi-jobs-prices-{started:%Y%m%d-%H%M%S}.json")
    os.makedirs(os.path.dirname(raw), exist_ok=True)
    with open(raw, "w", encoding="utf-8") as f:
        json.dump({"plfs": plfs, "cpi": cpi}, f, ensure_ascii=False)
    try:
        seed = build_seed(plfs, cpi, read_on=date.today())
    except GateFailure as e:
        print(f"Refused: {e}\nNothing written. What MoSPI sent: {raw}")
        return 2
    previous = json.load(open(SEED, encoding="utf-8")) if os.path.exists(SEED) else None
    try:
        notes = validate(seed, previous)
    except GateFailure as e:
        print(f"Refused: {e}\nNothing written. What MoSPI sent: {raw}")
        return 2
    print(summary(seed))
    print(f"  {client.calls} calls to MoSPI, {client.retries} repeated after a reset, "
          f"{(datetime.now(timezone.utc) - started).seconds}s.")
    for n in notes:
        print("  note:", n)
    if previous and previous["jobs"]["points"] == seed["jobs"]["points"] and previous["prices"]["points"] == seed["prices"]["points"]:
        print("No figure changed since the last seed.")
    if not write:
        print("Dry run: nothing written. Run again with --write to save the seed.")
        return 0
    tmp = SEED + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(seed, f, ensure_ascii=False, indent=1)
        f.write("\n")
    os.replace(tmp, SEED)
    print(f"Written: {SEED}")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Build the jobs and prices seed from MoSPI's data service.")
    ap.add_argument("--write", action="store_true", help="write the seed; without it this is a dry run")
    sys.exit(main(ap.parse_args().write))
