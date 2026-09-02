"""
Do two independent government sources still tell the same story?

Some figures reach this platform twice, through publication chains that never
touch each other — the Reserve Bank reprinting a state figure, and the state's
own Statement of Fiscal Policy printing it directly. Where both are showing
audited accounts, they are the same number by two routes, and they must agree.
When they stop agreeing, one of them was edited wrongly, and this is the only
place that will notice.

The check has a second, less obvious half. Some official figures legitimately
disagree — the auditor and the central bank group debt differently, and that
disagreement is the subject of an entire section of this site. So those pairs
are guarded in reverse: if they ever start agreeing, someone has flattened a
real difference, and that is a defect too.

One thing this check will not do is compare an estimate with an outcome. A
budget estimate for 2024-25 and the audited account for 2024-25 differ by more
than a factor of two on capital outlay, and both are correct. Comparing them
and calling the gap an error would train everyone to ignore the harness.
"""

from __future__ import annotations

import json
import os
from typing import Any, Iterable

from .base import FAIL, INFO, WARN, Ctx, Finding, check

ESTIMATES = {"RE", "BE", "PE", "AE", "QE"}
_REG = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    "reconciliations.json")


def _registry() -> dict:
    try:
        with open(_REG, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _dig(obj: Any, dotted: str):
    for part in dotted.split("."):
        if obj is None:
            return None
        obj = obj.get(part) if isinstance(obj, dict) else None
    return obj


def _points(ctx: Ctx, spec: dict) -> dict[int, dict]:
    """Resolve one side of a pair to {fy_end: point}."""
    seed = ctx.seed(spec["file"])
    if not isinstance(seed, dict):
        return {}
    if "indicator" in spec:
        ind = next((i for i in seed.get("indicators", []) or []
                    if i.get("key") == spec["indicator"]), None)
        if not ind:
            return {}
        return {p["fy_end"]: {"value": p.get("value"), "stage": p.get("stage"),
                              "label": p.get("fy_label")}
                for p in ind.get("points", []) if p.get("fy_end") is not None}
    rows = _dig(seed, spec.get("path", "")) or []
    if isinstance(rows, dict):
        rows = rows.get("years") or []
    out: dict[int, dict] = {}
    match = spec.get("match") or {}
    field = spec.get("field")
    for row in rows if isinstance(rows, list) else []:
        if not isinstance(row, dict):
            continue
        if match and any(row.get(k) != v for k, v in match.items()):
            continue
        # a series row carries its own points; a year row is itself a point
        if "points" in row and isinstance(row["points"], list):
            for p in row["points"]:
                if p.get("fy_end") is not None:
                    out[p["fy_end"]] = {"value": p.get("value"),
                                        "stage": p.get("stage"),
                                        "label": p.get("fy_label") or p.get("fy_end")}
            continue
        fy = row.get("fy_end")
        if fy is None:
            continue
        out[fy] = {"value": row.get(field) if field else row.get("value"),
                   "stage": row.get("stage"), "label": row.get("fy_label") or fy}
    return out


def _open_case(reg: dict, pair_id: str, fy: int) -> dict | None:
    """An unexplained disagreement we have already recorded, if this is one."""
    for case in reg.get("investigating", []) or []:
        if case.get("pair") == pair_id and fy in (case.get("fy_end") or []):
            return case
    return None


def _audited(p: dict) -> bool:
    """A reading counts as audited when it is marked A, or marked nothing at all
    in a source that only marks its estimates."""
    return p.get("stage") in (None, "A", "")


@check("reconcile.agree", "Independent sources agree where both are audited")
def must_agree(ctx: Ctx) -> Iterable[Finding]:
    reg = _registry()
    for pair in reg.get("must_agree", []):
        L, R = _points(ctx, pair["left"]), _points(ctx, pair["right"])
        if not L or not R:
            yield Finding(
                WARN, "reconcile.agree", pair["left"]["file"], pair["id"],
                "one side of this pair resolved to nothing, so it was not checked",
                "Either a seed was renamed or an indicator key changed. A reconciliation that "
                "silently stops running is worse than one that fails.",
                {"left_points": len(L), "right_points": len(R)},
            )
            continue
        tol = float(pair.get("tolerance_pct", 0.5))
        checked = skipped = 0
        for fy in sorted(set(L) & set(R)):
            a, b = L[fy], R[fy]
            if a.get("value") is None or b.get("value") is None:
                continue
            if pair.get("audited_only") and not (_audited(a) and _audited(b)):
                skipped += 1
                continue
            checked += 1
            base = max(abs(b["value"]), 1e-9)
            drift = abs(a["value"] - b["value"]) / base * 100
            if drift <= tol:
                continue
            # A disagreement we have already looked at and written down is a
            # warning, not a failure. It stays visible and stays published; it
            # just does not hold the build hostage while it is being chased.
            note = _open_case(reg, pair["id"], fy)
            if note:
                yield Finding(
                    WARN, "reconcile.agree", pair["left"]["file"], f"{pair['id']} · {a['label']}",
                    f"known unexplained disagreement: {a['value']:,.2f} against {b['value']:,.2f} "
                    f"({drift:.2f}% apart) — open since {note.get('opened')}",
                    "Not a blocker, but not resolved either. " + (note.get("what_would_settle_it") or ""),
                    {"what_we_know": note.get("what_we_know"), "left": a, "right": b,
                     "drift_pct": round(drift, 3)},
                )
                continue
            if True:
                yield Finding(
                    FAIL, "reconcile.agree", pair["left"]["file"], f"{pair['id']} · {a['label']}",
                    f"two independent sources give {a['value']:,.2f} and {b['value']:,.2f} "
                    f"for the same audited year — {drift:.2f}% apart, tolerance {tol}%",
                    "Re-read both documents for that year before publishing. One of these was "
                    "transcribed wrongly, or an estimate has lost its stage marker and is being "
                    "compared as though it were an outcome.",
                    {"why": pair.get("why"), "left": a, "right": b, "drift_pct": round(drift, 3)},
                )
        if checked == 0:
            yield Finding(
                WARN, "reconcile.agree", pair["left"]["file"], pair["id"],
                "no year had audited readings on both sides, so nothing was compared",
                "Expected while a series is young. If it persists, the stage markers on one "
                "side are missing and the guard is not actually guarding anything.",
                {"skipped_estimate_years": skipped},
            )
        else:
            yield Finding(
                INFO, "reconcile.agree", pair["left"]["file"], pair["id"],
                f"{checked} audited year(s) agree within {tol}%"
                + (f"; {skipped} estimate year(s) correctly not compared" if skipped else ""),
                "No action.", {"why": pair.get("why")},
            )


@check("reconcile.open", "Unexplained disagreements are still being chased")
def open_cases(ctx: Ctx) -> Iterable[Finding]:
    """
    Every disagreement we have not explained, listed by name. An entry leaves
    this list by being resolved or by being moved to `known_divergence` with a
    reason — never by widening a tolerance until it passes.
    """
    reg = _registry()
    cases = reg.get("investigating", []) or []
    if not cases:
        yield Finding(INFO, "reconcile.open", "reconciliations.json", "investigating",
                      "no unexplained disagreements are open", "No action.")
        return
    for case in cases:
        yield Finding(
            WARN, "reconcile.open", "reconciliations.json", case.get("pair", "?"),
            f"open since {case.get('opened')}, years {case.get('fy_end')}: {case.get('what_we_know')}",
            case.get("what_would_settle_it") or "No resolution path recorded — record one.",
        )


@check("reconcile.diverge", "A documented disagreement has not been flattened")
def known_divergence(ctx: Ctx) -> Iterable[Finding]:
    reg = _registry()
    for pair in reg.get("known_divergence", []):
        L, R = _points(ctx, pair["left"]), _points(ctx, pair["right"])
        years = sorted(set(L) & set(R))
        if not years:
            yield Finding(
                WARN, "reconcile.diverge", pair["left"]["file"], pair["id"],
                "the two series no longer share a single year, so the disagreement cannot be shown",
                "Check that both source families are still being ingested. This pair is the "
                "evidence behind a section of the site.",
            )
            continue
        floor = float(pair.get("expect_min_diff_pct", 1.0))
        worst = 0.0
        for fy in years:
            a, b = L[fy].get("value"), R[fy].get("value")
            if a is None or b is None:
                continue
            worst = max(worst, abs(a - b) / max(abs(b), 1e-9) * 100)
        if worst < floor:
            yield Finding(
                FAIL, "reconcile.diverge", pair["left"]["file"], pair["id"],
                f"two sources that should disagree now differ by at most {worst:.2f}% "
                f"(expected at least {floor}%)",
                "Someone has probably overwritten one series with the other. These figures are "
                "supposed to differ — the difference is the content. Restore both readings.",
                {"why": pair.get("why")},
            )
        else:
            yield Finding(
                INFO, "reconcile.diverge", pair["left"]["file"], pair["id"],
                f"still differ by up to {worst:.1f}% across {len(years)} shared years, as expected",
                "No action.", {"why": pair.get("why")},
            )
