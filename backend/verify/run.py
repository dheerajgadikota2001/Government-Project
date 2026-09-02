"""
The harness.

    python -m verify.run                     # from backend/, human-readable
    python -m verify.run --json report.json  # machine-readable, for the site
    VERIFY_LINKS=1 python -m verify.run      # include the network check

Exit code 1 if anything FAILed, 0 otherwise. Warnings never block: they are
published instead, because a warning that stops the build gets suppressed, and
a suppressed warning is worse than a loud one.

The report is meant to be published. A platform whose whole claim is that its
figures are checkable should be willing to show what it checks, what passed and
what it cannot verify — including on the days the answer is unflattering.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import time

# Allow both `python -m verify.run` from backend/ and `python verify/run.py`.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from verify.checks.base import CHECKS, FAIL, INFO, WARN, Ctx, Finding, sort_findings  # noqa: E402
import verify.checks  # noqa: F401,E402  registers every check


def repo_root() -> str:
    """backend/verify/run.py -> repo root."""
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


BOLD, DIM, RED, YEL, GRN, OFF = "\033[1m", "\033[2m", "\033[31m", "\033[33m", "\033[32m", "\033[0m"


def paint(s: str, c: str, colour: bool) -> str:
    return f"{c}{s}{OFF}" if colour else s


def main() -> int:
    ap = argparse.ArgumentParser(description="Verify every figure this platform publishes.")
    ap.add_argument("--json", metavar="PATH", help="write the full report as JSON")
    ap.add_argument("--repo", default=None, help="repo root (default: inferred)")
    ap.add_argument("--quiet", action="store_true", help="findings only, no per-check lines")
    ap.add_argument("--no-color", action="store_true")
    args = ap.parse_args()

    colour = sys.stdout.isatty() and not args.no_color
    ctx = Ctx(args.repo or repo_root())
    started = time.time()

    findings: list[Finding] = []
    per_check: list[dict] = []

    for key, title, fn in CHECKS:
        t0 = time.time()
        try:
            got = list(fn(ctx))
        except Exception as exc:  # a check that crashes is itself a failure
            got = [Finding(FAIL, key, "-", "-",
                           f"the check itself crashed: {type(exc).__name__}: {exc}",
                           "Fix the check. A harness that dies silently is worse than none.")]
        findings.extend(got)
        counts = {s: sum(1 for f in got if f.severity == s) for s in (FAIL, WARN, INFO)}
        per_check.append({"key": key, "title": title, "ms": int((time.time() - t0) * 1000), **counts})
        if not args.quiet:
            mark = paint("FAIL", RED, colour) if counts[FAIL] else \
                   paint("warn", YEL, colour) if counts[WARN] else paint("ok  ", GRN, colour)
            extra = ""
            if counts[FAIL] or counts[WARN]:
                extra = paint(f"  ({counts[FAIL]} fail, {counts[WARN]} warn)", DIM, colour)
            print(f"  {mark}  {title}{extra}")

    findings = sort_findings(findings)
    fails = [f for f in findings if f.severity == FAIL]
    warns = [f for f in findings if f.severity == WARN]
    infos = [f for f in findings if f.severity == INFO]

    if fails or warns:
        print()
        for f in fails + warns:
            print(paint(f.line(), RED if f.severity == FAIL else YEL, colour))
            print()

    seeds = [n for n in ctx.seeds]
    print()
    print(paint("  " + "-" * 66, DIM, colour))
    print(f"  {len(seeds)} seed files · {len(CHECKS)} checks · {int((time.time()-started)*1000)} ms")
    verdict = (paint(f"{len(fails)} FAIL", RED, colour) if fails else paint("0 FAIL", GRN, colour))
    print(f"  {verdict} · {len(warns)} warn · {len(infos)} info")
    if not fails:
        print(paint("  Every figure traced to a document, every derived number recomputed.", DIM, colour))
    print()

    report = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "repo": ctx.repo,
        "seeds": seeds,
        "checks": per_check,
        "totals": {"fail": len(fails), "warn": len(warns), "info": len(infos)},
        "passed": not fails,
        "findings": [f.as_dict() for f in findings],
    }
    if args.json:
        os.makedirs(os.path.dirname(os.path.abspath(args.json)) or ".", exist_ok=True)
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=1)
        print(f"  report written to {args.json}")

    return 1 if fails else 0


if __name__ == "__main__":
    raise SystemExit(main())
