"""
Ask the live API the questions a reader asks, and fail loudly if it cannot answer.

WHY THIS EXISTS
On 6 Sep 2026 a deploy took every district page from working to a 500. The unit
tests passed, 92 of them, because not one of them calls this API over HTTP. The
error was a missing import: a name used in a function nobody exercised. Python
does not notice that until the line runs, and the line only runs when a real
reader opens a district.

So this script is the check that matches how the site actually fails. It makes
real requests against a running API and looks at the status codes. It takes
about five seconds and it costs nothing.

RUN IT AFTER EVERY BACKEND DEPLOY:

    python scripts/smoke_api.py                                  # live site
    python scripts/smoke_api.py --base-url http://127.0.0.1:8001 # local

Exit code 0 when everything answers, 1 when anything does not, so it can gate a
deploy in CI as easily as a person can read it.

It only ever sends GET requests to public endpoints, so it is safe to point at
production.
"""
import argparse
import asyncio
import uuid
from urllib.parse import quote

import httpx

DEFAULT_BASE = "https://apfactcheck.dheeco.com"

# The endpoints a first-time visitor touches, plus the ones with a history of
# breaking quietly. Each entry: label, path, and what proves it really worked.
CHECKS = [
    ("version",            "/api/v1/meta/version",                      None),
    ("home stats",         "/api/v1/projects/stats",                    None),
    ("map counts",         "/api/v1/projects/insights",                 "by_district"),
    ("project list",       "/api/v1/projects/?page_size=3",             "items"),
    ("free text search",   "/api/v1/projects/?q=road&page_size=3",      "items"),
    ("statewide filter",   "/api/v1/projects/?placement=statewide&page_size=3", "items"),
    ("unstated filter",    "/api/v1/projects/?placement=unstated&page_size=3",  "items"),
    ("tenders",            "/api/v1/tenders/?page_size=3",              "items"),
    ("tenders closing",    "/api/v1/tenders/closing-soon",              None),
    ("what changed",       "/api/v1/meta/updates",                      None),
    ("finances",           "/api/v1/finances/",                         None),
    ("governments",        "/api/v1/governments/",                      None),
    ("documents",          "/api/v1/documents/?page_size=3",            "items"),
    ("register",           "/api/v1/projects/register",                 "projects"),
]


async def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base-url", default=DEFAULT_BASE)
    ap.add_argument("--timeout", type=float, default=30.0)
    args = ap.parse_args()
    base = args.base_url.rstrip("/")

    print(f"Smoke test against {base}\n")
    failures: list[str] = []

    async with httpx.AsyncClient(timeout=args.timeout, follow_redirects=True) as client:

        # Every request carries a value nothing has seen before. The API caches
        # list responses for five minutes, and on 6 Sep 2026 this script read
        # that cache seconds after a deploy and reported six districts still
        # broken when they were already fixed. The false alarm was harmless.
        # The same flaw in reverse is not: a cached good response would let a
        # broken deploy pass. A check that can be answered from cache is not a
        # check of the thing you just deployed.
        run_id = uuid.uuid4().hex[:12]

        async def check(label: str, path: str, expect_key: str | None) -> dict | None:
            fresh = path + ("&" if "?" in path else "?") + f"_smoke={run_id}"
            try:
                r = await client.get(base + fresh)
            except Exception as exc:                       # noqa: BLE001
                print(f"  FAIL {label:<20} {type(exc).__name__}: {exc}")
                failures.append(label)
                return None

            if r.status_code != 200:
                print(f"  FAIL {label:<20} HTTP {r.status_code}  {path}")
                failures.append(label)
                return None

            body = None
            try:
                body = r.json()
            except Exception:                              # noqa: BLE001
                print(f"  FAIL {label:<20} response was not JSON  {path}")
                failures.append(label)
                return None

            # A 200 that carries none of the shape the page needs is still a
            # failure, just a quieter one.
            if expect_key and expect_key not in body:
                print(f"  FAIL {label:<20} 200 but no '{expect_key}' in the body")
                failures.append(label)
                return None

            print(f"  ok   {label:<20} {path}")
            return body

        for label, path, expect_key in CHECKS:
            await check(label, path, expect_key)

        # Every district the map offers must open. This is the check that the
        # 6 Sep outage would have failed on its first request.
        print()
        insights = await check("map counts (again)", "/api/v1/projects/insights", "by_district")
        districts = [d["district"] for d in (insights or {}).get("by_district", []) if d.get("count")]
        if not districts:
            print("  FAIL districts        the map reports no districts at all")
            failures.append("districts")
        else:
            print(f"  checking all {len(districts)} districts the map counts")
            empty = []
            for name in districts:
                path = f"/api/v1/projects/?district={quote(name)}&page_size=3"
                body = await check(f"  {name[:18]}", path, "items")
                if body is not None and body.get("total", 0) == 0:
                    empty.append(name)
            if empty:
                # Not a hard failure: a count and an empty list disagree, which
                # is a data problem, not a broken service. Say it plainly.
                print(f"\n  WARNING {len(empty)} district(s) count projects but open empty:")
                for name in empty:
                    print(f"    {name}")

    print()
    if failures:
        print(f"{len(failures)} check(s) failed: {', '.join(failures[:8])}")
        return 1
    print("All checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
