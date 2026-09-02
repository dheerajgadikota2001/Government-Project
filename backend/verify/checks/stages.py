"""
Is an estimate ever shown as an outcome?

This is the check the platform exists for. A budget estimate and an audited
account are different kinds of statement. Drawn in the same series with the
same weight, they produce a chart that tells a lie without containing a single
false number — which is the hardest kind of error to spot and the easiest to
make.

It has caught real defects already: a capital-outlay figure of 32,713 that was
a budget estimate sitting beside audited years where the audited number was
16,141; a market-borrowings column that covered six months of the year and read
as a collapse; a highway length measured to December standing in for a year end.
"""

from __future__ import annotations

import re
from typing import Any, Iterable

from .base import FAIL, INFO, WARN, Ctx, Finding, check

ESTIMATE_STAGES = {"RE", "BE", "PE", "AE", "QE"}
KNOWN_STAGES = ESTIMATE_STAGES | {"A"}

# Wording that means a figure does not cover the period its neighbours cover.
PART_YEAR = re.compile(
    r"part[- ]year|april[-–—\s]*september|upto end[-–—\s]*december|"
    r"up to end[-–—\s]*december|first half|h1\b|q[1-3]\b|nine months|six months",
    re.I,
)


def _series_of(seed: Any):
    """Yield (path, list-of-points) for anything that looks like a year series."""
    if isinstance(seed, dict):
        for k, v in seed.items():
            if k == "points" and isinstance(v, list) and v and isinstance(v[0], dict) \
               and ("fy_end" in v[0] or "fy_label" in v[0] or "year" in v[0]):
                yield k, v
            else:
                yield from (( f"{k}.{p}" if p else k, s) for p, s in _series_of(v))
    elif isinstance(seed, list):
        if seed and isinstance(seed[0], dict) and "fy_end" in seed[0] and "value" in seed[0]:
            yield "", seed
        for i, v in enumerate(seed):
            yield from ((f"[{i}].{p}" if p else f"[{i}]", s) for p, s in _series_of(v))


def _label(node: dict, fallback: str) -> str:
    for k in ("key", "indicator", "label", "id"):
        if isinstance(node.get(k), str):
            return node[k]
    return fallback


@check("stages.mixed", "A series never mixes stages without saying so")
def mixed_stages(ctx: Ctx) -> Iterable[Finding]:
    for name, seed in ctx.seeds.items():
        if not isinstance(seed, dict):
            continue
        for ind in seed.get("indicators", []) or []:
            pts = ind.get("points") or []
            if not pts:
                continue
            stages = {p.get("stage") for p in pts}
            bad = {s for s in stages if s is not None and s not in KNOWN_STAGES}
            if bad:
                yield Finding(
                    FAIL, "stages.mixed", name, f"indicators[{ind.get('key')}]",
                    f"uses stage markers this platform does not define: {sorted(bad)}",
                    "Use A, RE, BE, PE — or add the new marker to KNOWN_STAGES and to the "
                    "`facts.stage.*` translation keys, so it renders as words rather than a code.",
                )
            has_est = any(p.get("stage") in ESTIMATE_STAGES for p in pts)
            if has_est and not ind.get("has_estimates"):
                yield Finding(
                    FAIL, "stages.mixed", name, f"indicators[{ind.get('key')}].has_estimates",
                    "contains estimate-stage points but is not flagged as containing estimates",
                    "Set has_estimates. The card uses this flag to draw estimates lighter and to "
                    "stamp them; without it an estimate renders exactly like an audited figure.",
                )
            if not has_est and ind.get("has_estimates"):
                yield Finding(
                    WARN, "stages.mixed", name, f"indicators[{ind.get('key')}].has_estimates",
                    "is flagged as containing estimates but no point carries an estimate stage",
                    "Either the flag is stale or a stage marker was lost. Re-run the stage join.",
                )
            # A tenure aggregate that leans on an estimate must admit it.
            for tk, b in (ind.get("by_tenure") or {}).items():
                if not isinstance(b, dict) or not b.get("from"):
                    continue
                span = [p for p in pts if not p.get("undivided")
                        and _in_span(p, b)]
                leans = any(p.get("stage") in ESTIMATE_STAGES for p in span)
                if leans and not b.get("any_estimate"):
                    yield Finding(
                        FAIL, "stages.mixed", name,
                        f"indicators[{ind.get('key')}].by_tenure.{tk}",
                        "reports a change under a government using at least one estimate, "
                        "without marking it",
                        "Set any_estimate on that span. The card prints 'includes an estimate' "
                        "from this flag; a change computed against a budget estimate is a "
                        "comparison with a plan, not with an outcome.",
                    )


def _in_span(point: dict, b: dict) -> bool:
    f, t = b.get("from") or {}, b.get("to") or {}
    lo, hi = f.get("fy_label"), t.get("fy_label")
    if lo is None or hi is None:
        return False
    return str(lo) <= str(point.get("fy_label", "")) <= str(hi)


@check("stages.partyear", "No part-year figure stands in a full-year series")
def part_year(ctx: Ctx) -> Iterable[Finding]:
    for name, seed in ctx.seeds.items():
        for path, pts in _series_of(seed):
            for p in pts:
                if not isinstance(p, dict):
                    continue
                text = " ".join(str(p.get(k) or "") for k in ("caveat", "note", "stage_note",
                                                              "stage_as_printed", "fy_label"))
                if PART_YEAR.search(text):
                    yield Finding(
                        FAIL, "stages.partyear", name, f"{path} · {p.get('fy_label')}",
                        "is a part-year figure sitting in a series of full years",
                        "Remove the point or move it to its own clearly-labelled series. A "
                        "footnote inside a bar chart is invisible: the reader sees a collapse "
                        "that did not happen.",
                        {"value": p.get("value"), "text": text.strip()[:180]},
                    )


@check("stages.undivided", "A pre-2014 figure never enters a per-government change")
def undivided_leak(ctx: Ctx) -> Iterable[Finding]:
    """
    Andhra Pradesh was divided on 2 June 2014. A figure for the undivided state
    and one for the residuary state are measurements of different places. Sliding
    one into a per-government comparison manufactures a change out of a border.
    """
    for name, seed in ctx.seeds.items():
        if not isinstance(seed, dict):
            continue
        for ind in seed.get("indicators", []) or []:
            pts = ind.get("points") or []
            for tk, b in (ind.get("by_tenure") or {}).items():
                if not isinstance(b, dict) or not b.get("from"):
                    continue
                leaked = [p for p in pts if p.get("undivided") and _in_span(p, b)]
                if leaked:
                    yield Finding(
                        FAIL, "stages.undivided", name,
                        f"indicators[{ind.get('key')}].by_tenure.{tk}",
                        f"spans {len(leaked)} undivided-Andhra-Pradesh year(s)",
                        "Recompute the span over residuary-state years only. Comparing the "
                        "undivided state with the residuary one measures the 2014 border, "
                        "not a government.",
                        {"years": [p.get("fy_label") for p in leaked]},
                    )
            first_res = ind.get("first_residuary")
            if any(p.get("undivided") for p in pts) and not first_res:
                yield Finding(
                    WARN, "stages.undivided", name, f"indicators[{ind.get('key')}]",
                    "has undivided years but records no first residuary year",
                    "Set first_residuary so the page can say where the comparable series starts.",
                )


@check("stages.nulls", "No missing year is drawn as a zero")
def null_values(ctx: Ctx) -> Iterable[Finding]:
    for name, seed in ctx.seeds.items():
        for path, pts in _series_of(seed):
            for p in pts:
                if isinstance(p, dict) and "value" in p and p["value"] is None:
                    yield Finding(
                        FAIL, "stages.nulls", name, f"{path} · {p.get('fy_label')}",
                        "carries a null value inside a plotted series",
                        "Drop the point at seed-build time. A null reaching a chart becomes a "
                        "zero-height bar, which reads as 'nothing happened that year' rather "
                        "than 'we do not have that year'.",
                    )
