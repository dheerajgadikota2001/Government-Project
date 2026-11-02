"""
Compare the bundled CDN edge ranges with the CDN's published list.

The rule in app/client_address.py steps one entry left of a known edge
address. If the CDN adds a range the bundle lacks, readers behind that range
are keyed by the edge address instead of their own, and share one limit. Not
a hole, a degradation, but one to notice. Run weekly in CI; exits 1 on a
difference so the bundle gets refreshed.

    python scripts/check_edge_cidrs.py           # compare
    python scripts/check_edge_cidrs.py --write   # refresh the bundle
"""
import datetime as dt
import json
import os
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUNDLE = os.path.join(ROOT, "app", "data", "edge_cidrs.json")
SOURCE = "https://api.fastly.com/public-ip-list"


def main() -> int:
    live = json.load(urllib.request.urlopen(SOURCE, timeout=30))
    live_set = set(live.get("addresses", [])) | set(live.get("ipv6_addresses", []))
    with open(BUNDLE, encoding="utf-8") as fh:
        bundle = json.load(fh)
    have = set(bundle.get("addresses", [])) | set(bundle.get("ipv6_addresses", []))
    added, gone = sorted(live_set - have), sorted(have - live_set)
    if not added and not gone:
        print(f"edge ranges: bundle matches the published list ({len(have)} ranges)")
        return 0
    print(f"edge ranges differ: {len(added)} new, {len(gone)} withdrawn")
    for c in added:
        print(f"  + {c}")
    for c in gone:
        print(f"  - {c}")
    if "--write" in sys.argv:
        bundle.update({"fetched_on": dt.date.today().isoformat(), "addresses": live.get("addresses", []),
                       "ipv6_addresses": live.get("ipv6_addresses", [])})
        with open(BUNDLE, "w", encoding="utf-8") as fh:
            json.dump(bundle, fh, indent=1)
        print("bundle refreshed; run the tests and commit app/data/edge_cidrs.json")
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
