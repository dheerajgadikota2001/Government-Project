"""
Read-only check of a running API: does the project register tell the truth about the projects?

Run it right after every API deploy, before anything else:

    python scripts/check_live_register.py                      # production
    python scripts/check_live_register.py http://localhost:8000

It only reads. It compares the register (the page readers see) with the plain project rows the
same API serves, which the register must not change. It needs no saved baseline and no database
access, only the standard library.

Why it exists. On 21 Oct 2026 an API deploy went out from a branch that was 12 commits behind
dheeraj/dev. For a day the register glued words together ("diversionof") in 711 descriptions and
496 titles, and blanked the cost of 56 projects whose paper sits in the Finance Department's
bucket. Every test passed, because the tests used a few invented rows. This check uses the live
rows, so it sees what a reader sees.

Checks
  1. Every register title is exactly the stored title.
  2. A sample of descriptions is exactly the stored description (the register may use a
     hand-built record's text for the few projects that have one; those are skipped).
  3. A project whose paper is in the Finance Department's bucket and has a cost must show
     that cost as the government's.
  4. Government papers are still the large majority of dated events.

Exit code 0 when all pass, 1 when any fail, 2 when the API cannot be read.
"""

import json
import sys
import time
import urllib.error
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "https://apfactcheck.dheeco.com").rstrip("/") + "/api/v1"
FINANCE_BUCKET = "https://s3.ap-south-1.amazonaws.com/apfinance.gov.in/"
SAMPLE = 60


def get(path, tries=3):
    last = None
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(f"{BASE}/{path}", headers={"User-Agent": "register-check"}), timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            last = e
            time.sleep(1.5 * (i + 1))
    print(f"Cannot read {BASE}/{path}: {last}")
    sys.exit(2)


def raw_rows():
    rows, page = [], 1
    while True:
        d = get(f"projects/?page_size=100&page={page}")
        rows += d["items"]
        if not d.get("has_next"):
            return rows
        page += 1


def main():
    register = get("projects/register")
    entries = register["projects"]
    raw = {r["id"]: r for r in raw_rows()}
    print(f"{BASE}: {len(entries)} projects in the register, {len(raw)} stored rows")

    failures = []

    # 1. titles
    bad = [(e["id"], raw[e["id"]]["title"], e["title"]) for e in entries if e["id"] in raw and e["title"] != raw[e["id"]]["title"]]
    print(f"1. titles equal to the stored title: {len(entries) - len(bad)} of {len(entries)}")
    if bad:
        failures.append(f"{len(bad)} register titles differ from the stored title, for example #{bad[0][0]}: {bad[0][1][:60]!r} became {bad[0][2][:60]!r}")

    # 2. descriptions, on an even sample of projects with no hand-built record
    plain = [e for e in entries if not e.get("has_documents")]
    step = max(1, len(plain) // SAMPLE)
    sample = plain[::step][:SAMPLE]
    differ = []
    for e in sample:
        stored = get(f"projects/{e['id']}").get("description")
        if (stored or None) != (e.get("description") or None):
            differ.append((e["id"], (stored or "")[:60], (e.get("description") or "")[:60]))
    print(f"2. descriptions equal to the stored description: {len(sample) - len(differ)} of {len(sample)} sampled")
    if differ:
        failures.append(f"{len(differ)} of {len(sample)} sampled descriptions differ from the stored one, for example #{differ[0][0]}: {differ[0][1]!r} became {differ[0][2]!r}")

    # 3. the Finance Department's bucket is government
    in_bucket = [e for e in entries if (e.get("source_url") or "").startswith(FINANCE_BUCKET)]
    wrong = [e for e in in_bucket if e.get("cost_source_tier") != "government"]
    print(f"3. projects sourced to the Finance bucket shown as government: {len(in_bucket) - len(wrong)} of {len(in_bucket)}")
    if wrong:
        failures.append(f"{len(wrong)} projects sourced to the Finance Department's bucket are labelled {wrong[0].get('cost_source_tier')!r}, for example #{wrong[0]['id']}")

    # 4. dated events are mostly the government's own
    c = register["counts"]
    gov, non = c["government_events"], c["non_government_events"]
    share = gov / (gov + non) if gov + non else 0
    print(f"4. government share of dated events: {gov} of {gov + non} ({share:.0%})")
    if share < 0.9:
        failures.append(f"only {share:.0%} of dated events are labelled government (it was 99% before the 21 Oct deploy)")

    if failures:
        print("\nFAILED")
        for f in failures:
            print(" -", f)
        sys.exit(1)
    print("\nAll checks passed.")


if __name__ == "__main__":
    main()
