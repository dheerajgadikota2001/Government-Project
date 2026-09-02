"""
Recompute the State Facts tenure comparisons from the year-by-year points.

Every indicator on the State Facts page carries two things: the full run of
yearly points as printed in the source table, and a `by_tenure` block that says
what changed under each government. The second is derived from the first. It is
also the part a reader actually reads and quotes, and the part that decides
whether a government looks good or bad — so it is the part that must never be
allowed to drift from its own inputs.

`arith.tenure` already recomputes change and pct — but it does so against the
endpoints the seed stored, so it answers "is the arithmetic right?" and cannot
answer "are these the right two years?". A tenure that quietly lost a year, or
whose span starts a year late, passes it completely.

This check asks the second question. It derives the span from `points` alone:

  years         how many yearly points carry that tenure
  from / to     the first and last of them, by label and value
  any_estimate  whether any point in the span is provisional or revised

The arithmetic is left to `arith.tenure`, so one defect is reported once.

A mismatch is a FAIL, not a warning. A comparison drawn across the wrong years
is not a rounding difference; it is a different claim about a government.

Deliberately not checked here: whether the yearly points match the source
document. That is transcription, it needs the document open beside the seed,
and it is what verify/audit.py's sampling worksheet is for.
"""

from __future__ import annotations

from typing import Any, Iterable

from .base import FAIL, INFO, WARN, Ctx, Finding, check

TENURES = ("tdp1", "ysrcp", "tdp2")


def _pts(ind: dict, tenure: str) -> list[dict]:
    out = [p for p in ind.get("points") or [] if p.get("tenure") == tenure and p.get("value") is not None]
    return sorted(out, key=lambda p: p.get("fy_end") or 0)


@check("audit.tenure", "Tenure comparisons still equal their own yearly points")
def tenure_matches_points(ctx: Ctx) -> Iterable[Finding]:
    seed = ctx.seed("state_facts_seed.json")
    if not isinstance(seed, dict):
        return
    checked = 0
    for ind in seed.get("indicators") or []:
        key = ind.get("key")
        bt = ind.get("by_tenure") or {}
        for tenure in TENURES:
            block = bt.get(tenure)
            if not isinstance(block, dict):
                continue
            pts = _pts(ind, tenure)
            where = f"indicators[{key}].by_tenure.{tenure}"
            checked += 1

            if block.get("years") != len(pts):
                yield Finding(
                    FAIL, "audit.tenure", "state_facts_seed.json", where,
                    f"says {block.get('years')} years but {len(pts)} points carry tenure '{tenure}'",
                    "Recount from points, or correct the tenure tag on the year that moved.",
                    {"stored_years": block.get("years"), "points": len(pts)},
                )

            # A single year cannot be a comparison; the seed correctly nulls those.
            if len(pts) < 2:
                if block.get("change") is not None or block.get("pct") is not None:
                    yield Finding(
                        FAIL, "audit.tenure", "state_facts_seed.json", where,
                        f"publishes a change across {len(pts)} year(s)",
                        "A change needs two years. Null change/pct until the second year is published.",
                    )
                continue

            first, last = pts[0], pts[-1]
            for end, pt in (("from", first), ("to", last)):
                stored = block.get(end) or {}
                if stored.get("value") != pt.get("value") or stored.get("fy_label") != pt.get("fy_label"):
                    yield Finding(
                        FAIL, "audit.tenure", "state_facts_seed.json", f"{where}.{end}",
                        f"says {stored.get('fy_label')}={stored.get('value')} but the "
                        f"{'first' if end == 'from' else 'last'} point of this tenure is "
                        f"{pt.get('fy_label')}={pt.get('value')}",
                        "Copy the endpoint from points, or fix whichever year was edited alone.",
                        {"stored": stored, "from_points": {k: pt.get(k) for k in ("fy_label", "value", "stage")}},
                    )

            # change and pct are arith.tenure's job. The one arithmetic case it
            # cannot express is a percentage off a base of zero, which is not a
            # rounding question but an undefined number on a card.
            if block.get("pct") is not None and first.get("value") in (0, None):
                yield Finding(
                    FAIL, "audit.tenure", "state_facts_seed.json", f"{where}.pct",
                    f"publishes a percentage change from a base of {first.get('value')}",
                    "A percentage change from zero is undefined. Null pct and show the absolute change.",
                )

            saw_estimate = any(p.get("stage") for p in pts)
            if bool(block.get("any_estimate")) != saw_estimate:
                yield Finding(
                    FAIL, "audit.tenure", "state_facts_seed.json", f"{where}.any_estimate",
                    f"says {block.get('any_estimate')} but "
                    f"{'a point in' if saw_estimate else 'no point in'} this span is marked provisional/revised",
                    "This flag is what puts the estimate marker on the comparison. "
                    "An estimate shown as an outcome is the one error this platform must never make.",
                )

    yield Finding(
        INFO, "audit.tenure", "state_facts_seed.json", "-",
        f"recomputed {checked} tenure comparisons from their own yearly points",
        "No action. This is the coverage of this check.",
        {"comparisons": checked},
    )


@check("audit.latest", "The headline figure is the newest point there is")
def latest_is_latest(ctx: Ctx) -> Iterable[Finding]:
    """`latest` is what the card shows before a reader opens anything."""
    seed = ctx.seed("state_facts_seed.json")
    if not isinstance(seed, dict):
        return
    for ind in seed.get("indicators") or []:
        pts = [p for p in ind.get("points") or [] if p.get("value") is not None]
        if not pts:
            continue
        newest = max(pts, key=lambda p: p.get("fy_end") or 0)
        latest = ind.get("latest") or {}
        where = f"indicators[{ind.get('key')}].latest"
        if latest.get("fy_end") != newest.get("fy_end") or latest.get("value") != newest.get("value"):
            yield Finding(
                FAIL, "audit.latest", "state_facts_seed.json", where,
                f"shows {latest.get('fy_label')}={latest.get('value')} but the newest point is "
                f"{newest.get('fy_label')}={newest.get('value')}",
                "The card headline must be the newest year in the series, or the reader is "
                "reading a stale figure as a current one.",
            )
        if bool(latest.get("stage")) != bool(newest.get("stage")):
            yield Finding(
                FAIL, "audit.latest", "state_facts_seed.json", f"{where}.stage",
                "the headline's estimate marker disagrees with the point it comes from",
                "Carry the stage through to `latest`, or the newest figure loses its caveat.",
            )
