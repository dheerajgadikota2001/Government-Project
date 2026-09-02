"""
Is each seed the shape the rest of the platform expects — and could it hold a second state?

Two jobs. The first is ordinary: a seed that has lost a required field will not
crash the API, it will render a blank where a figure should be, which is the
failure mode nobody notices.

The second is a bet on the future. Every record carries the state it describes,
even though only Andhra Pradesh has data today. It costs one key now; without
it, adding a second state means touching every seed, every router and every
component, and at that point it never happens. The check nags at WARN rather
than FAIL so it does not block work on data that is already correct.
"""

from __future__ import annotations

import json
import os
from typing import Iterable

from .base import FAIL, INFO, WARN, Ctx, Finding, check

_STATES = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "states.json")

# What each seed must carry for the page that reads it to render at all.
REQUIRED = {
    "finances_seed.json":     ["sources", "series"],
    "state_facts_seed.json":  ["sources", "groups", "indicators"],
    "contacts_seed.json":     ["helplines", "escalations", "departments", "districts"],
    "departments_seed.json":  ["departments", "demand_map", "sources"],
    "projects_seed.json":     [],
    "summits_seed.json":      [],
    "school_education_seed.json": [],
}


def _known_states() -> set[str]:
    try:
        with open(_STATES, encoding="utf-8") as f:
            return {s["key"] for s in json.load(f).get("states", [])}
    except Exception:
        return {"AP"}


@check("schema.required", "Each seed carries the fields its page reads")
def required(ctx: Ctx) -> Iterable[Finding]:
    for name, want in REQUIRED.items():
        seed = ctx.seed(name)
        if seed is None:
            yield Finding(
                WARN, "schema.required", name, "-", "seed file not present",
                "Expected while a section is unbuilt. If the page exists, its API will 500.",
            )
            continue
        if isinstance(seed, dict) and "__load_error__" in seed:
            yield Finding(
                FAIL, "schema.required", name, "-",
                f"is not valid JSON: {seed['__load_error__']}",
                "Fix the file. Nothing downstream ran against it.",
            )
            continue
        for key in want:
            if not isinstance(seed, dict) or key not in seed:
                yield Finding(
                    FAIL, "schema.required", name, key,
                    "required top-level key is missing",
                    "The page that reads this seed will render an empty section rather than "
                    "an error, so this will not announce itself in the browser.",
                )


@check("schema.state", "Every seed says which state it describes")
def state_key(ctx: Ctx) -> Iterable[Finding]:
    known = _known_states()
    for name, seed in ctx.seeds.items():
        if not isinstance(seed, dict) or "__load_error__" in seed:
            continue
        st = seed.get("state")
        if st is None:
            yield Finding(
                WARN, "schema.state", name, "state",
                "has no top-level state key",
                'Add "state": "AP". One key now is the difference between adding a second '
                "state later as a data job and as a rewrite of every seed, router and component.",
            )
        elif st not in known:
            yield Finding(
                FAIL, "schema.state", name, "state",
                f"declares state {st!r}, which is not in verify/states.json",
                "Register the state there first. Nothing in the codebase should be the only "
                "place a state is named.",
                {"known": sorted(known)},
            )


@check("schema.units", "Every figure says what it is measured in")
def units(ctx: Ctx) -> Iterable[Finding]:
    for name, seed in ctx.seeds.items():
        if not isinstance(seed, dict):
            continue
        for ind in seed.get("indicators", []) or []:
            if not ind.get("unit_as_printed"):
                yield Finding(
                    FAIL, "schema.units", name, f"indicators[{ind.get('key')}]",
                    "has no unit as printed in the source",
                    "Record the unit exactly as the document prints it — '₹ Lakh', "
                    "'Thousand Tonnes', 'per 1000 live births'. A number without its unit "
                    "cannot be checked against the document it came from.",
                )
            if ind.get("display_divisor") in (0, None):
                yield Finding(
                    WARN, "schema.units", name, f"indicators[{ind.get('key')}]",
                    "has no display divisor, so the raw figure is shown unscaled",
                    "Set display_divisor and display_unit. A GSDP printed in lakh renders as "
                    "a fifteen-digit number otherwise.",
                )
        for ind in seed.get("indicators", []) or []:
            if ind.get("direction_of_good") not in ("up", "down", "context", "neutral", None):
                yield Finding(
                    FAIL, "schema.units", name, f"indicators[{ind.get('key')}].direction_of_good",
                    f"is {ind.get('direction_of_good')!r}, which the card cannot interpret",
                    "Use up, down or context. Anything unrecognised is treated as context, "
                    "which silently suppresses a verdict that should have been shown.",
                )


@check("schema.coverage", "How much of the record we actually hold")
def coverage(ctx: Ctx) -> Iterable[Finding]:
    """Not a pass/fail. A standing, published count of how thin the data is."""
    for name, seed in ctx.seeds.items():
        if not isinstance(seed, dict):
            continue
        inds = seed.get("indicators") or []
        if inds:
            pts = sum(len(i.get("points") or []) for i in inds)
            est = sum(1 for i in inds if i.get("has_estimates"))
            yield Finding(
                INFO, "schema.coverage", name, "indicators",
                f"{len(inds)} indicators, {pts} figures, {est} containing at least one estimate",
                "No action.",
            )
        gaps = seed.get("unavailable") or []
        if gaps:
            unstated = [g for g in gaps if isinstance(g, dict) and not g.get("what_a_human_should_do")]
            if unstated:
                yield Finding(
                    WARN, "schema.coverage", name, "unavailable",
                    f"{len(unstated)} of {len(gaps)} recorded gaps do not say how to fill them",
                    "Name the site, the menu path and the file. A gap a reader cannot act on "
                    "is an apology; a gap with instructions is an invitation.",
                )
            else:
                yield Finding(
                    INFO, "schema.coverage", name, "unavailable",
                    f"{len(gaps)} gaps recorded, every one with instructions for filling it",
                    "No action.",
                )
