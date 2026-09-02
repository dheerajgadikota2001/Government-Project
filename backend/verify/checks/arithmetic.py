"""
Recompute every derived number and see whether it still says what it says.

Nothing on this platform is modelled, but a few numbers are computed: a
percentage, a difference between two years, a share of revenue. Each one is
stored beside the figures it came from, which means each one can be recomputed
and compared. A stored percentage that no longer matches its own inputs is the
signature of a seed edited in one place and not the other — the commonest way a
careful dataset goes quietly wrong.

Tolerances are tight on purpose. These are not measurements; they are divisions
of numbers we already hold, so the only allowed difference is rounding.
"""

from __future__ import annotations

from typing import Any, Iterable

from .base import FAIL, WARN, Ctx, Finding, check

EPS_PCT = 0.06     # stored to 1-2 decimals, so half a unit in the last place
EPS_ABS = 0.02


def _close(a: float, b: float, eps: float) -> bool:
    return a is not None and b is not None and abs(a - b) <= eps


@check("arith.interest", "Interest share equals interest divided by revenue")
def interest_share(ctx: Ctx) -> Iterable[Finding]:
    seed = ctx.seed("finances_seed.json")
    if not isinstance(seed, dict):
        return
    for y in (seed.get("committed", {}) or {}).get("years", []) or []:
        ip, rr, stored = y.get("interest_payments"), y.get("revenue_receipts"), y.get("interest_pct_of_revenue")
        if ip is None or rr in (None, 0) or stored is None:
            continue
        want = round(100.0 * ip / rr, 2)
        if not _close(stored, want, EPS_PCT):
            yield Finding(
                FAIL, "arith.interest", "finances_seed.json",
                f"committed.years[{y.get('fy_label')}].interest_pct_of_revenue",
                f"stores {stored} but {ip} / {rr} is {want}",
                "Recompute the field, or correct whichever of the two inputs was edited. "
                "This number is the headline of a whole section.",
            )
        gap, stored_gap = rr - (y.get("revenue_expenditure") or 0), y.get("revenue_gap")
        if y.get("revenue_expenditure") is not None and stored_gap is not None \
           and not _close(stored_gap, round(gap, 2), EPS_ABS):
            yield Finding(
                FAIL, "arith.interest", "finances_seed.json",
                f"committed.years[{y.get('fy_label')}].revenue_gap",
                f"stores {stored_gap} but receipts minus expenditure is {round(gap, 2)}",
                "Recompute the field.",
            )


@check("arith.spent", "Percent spent equals spent divided by voted")
def promised_vs_spent(ctx: Ctx) -> Iterable[Finding]:
    seed = ctx.seed("finances_seed.json")
    if not isinstance(seed, dict):
        return
    pvs = seed.get("promised_vs_spent") or {}
    for y in pvs.get("years", []) or []:
        for b in y.get("blocks", []) or []:
            p, s, stored = b.get("promised"), b.get("spent"), b.get("pct_spent")
            if p in (None, 0) or s is None or stored is None:
                continue
            want = round(100.0 * s / p, 1)
            if not _close(stored, want, EPS_PCT):
                yield Finding(
                    FAIL, "arith.spent", "finances_seed.json",
                    f"promised_vs_spent.years[{y.get('fy_label')}].{b.get('section')}/{b.get('voted_or_charged')}",
                    f"stores {stored}% but {s} / {p} is {want}%",
                    "Recompute. This figure is quoted as a headline sentence on the page.",
                )
    for fy, blocks in (pvs.get("grants") or {}).items():
        for sec, rows in (blocks or {}).items():
            for g in rows or []:
                p, s, stored = g.get("promised"), g.get("spent"), g.get("pct_spent")
                if p in (None, 0) or s is None or stored is None:
                    continue
                want = round(100.0 * s / p, 1)
                if not _close(stored, want, EPS_PCT):
                    yield Finding(
                        FAIL, "arith.spent", "finances_seed.json",
                        f"promised_vs_spent.grants.{fy}.{sec}[{g.get('grant_no')}]",
                        f"stores {stored}% but {s} / {p} is {want}%",
                        "Recompute.",
                    )


@check("arith.grants", "Grant rows add up to the block they belong to")
def grants_reconcile(ctx: Ctx) -> Iterable[Finding]:
    """
    The Appropriation Accounts print a grand total. If our grant rows do not add
    to the block total we transcribed from the same volume, a row was dropped or
    double-counted, and no amount of care downstream will find it.
    """
    seed = ctx.seed("finances_seed.json")
    if not isinstance(seed, dict):
        return
    pvs = seed.get("promised_vs_spent") or {}
    want_section = {"capital_voted": ("Capital", "Voted"), "revenue_voted": ("Revenue", "Voted")}
    for y in pvs.get("years", []) or []:
        fy = y.get("fy_label")
        rows_by_sec = (pvs.get("grants") or {}).get(fy) or {}
        for key, (section, vc) in want_section.items():
            rows = rows_by_sec.get(key) or []
            if not rows:
                continue
            block = next((b for b in y.get("blocks", [])
                          if b.get("section") == section and b.get("voted_or_charged") == vc), None)
            if not block:
                continue
            for field in ("promised", "spent"):
                total = sum(r[field] for r in rows if r.get(field) is not None)
                printed = block.get(field)
                if printed in (None, 0):
                    continue
                drift = abs(total - printed) / printed * 100
                if drift > 0.5:
                    yield Finding(
                        FAIL, "arith.grants", "finances_seed.json",
                        f"promised_vs_spent.grants.{fy}.{key}",
                        f"{field}: {len(rows)} grant rows sum to {total:,.2f} against a printed "
                        f"block total of {printed:,.2f} ({drift:.2f}% apart)",
                        "A row is missing, duplicated, or attached to the wrong grant. Re-read "
                        "the Summary of Appropriation Accounts for that year and reconcile "
                        "before this is shown to anyone.",
                        {"sum": round(total, 2), "printed": printed},
                    )
                elif drift > 0.01:
                    yield Finding(
                        WARN, "arith.grants", "finances_seed.json",
                        f"promised_vs_spent.grants.{fy}.{key}",
                        f"{field}: rows sum to {total:,.2f} against {printed:,.2f} — "
                        f"{drift:.3f}% apart, consistent with rounding",
                        "Probably the volume's own rounding. Worth recording, not worth blocking.",
                    )


@check("arith.tenure", "A per-government change equals its own two endpoints")
def tenure_math(ctx: Ctx) -> Iterable[Finding]:
    for name, seed in ctx.seeds.items():
        if not isinstance(seed, dict):
            continue
        for ind in seed.get("indicators", []) or []:
            pts = {str(p.get("fy_label")): p for p in ind.get("points") or []}
            for tk, b in (ind.get("by_tenure") or {}).items():
                if not isinstance(b, dict) or not b.get("from") or not b.get("to"):
                    continue
                f, t = b["from"], b["to"]
                # the endpoints must still exist, and still hold those values
                for end, lab in ((f, "from"), (t, "to")):
                    live = pts.get(str(end.get("fy_label")))
                    if live is None:
                        yield Finding(
                            FAIL, "arith.tenure", name,
                            f"indicators[{ind.get('key')}].by_tenure.{tk}.{lab}",
                            f"names year {end.get('fy_label')!r}, which is no longer in the series",
                            "The span was computed against a point that has since been removed. "
                            "Rebuild by_tenure from the surviving points.",
                        )
                        continue
                    if live.get("value") != end.get("value"):
                        yield Finding(
                            FAIL, "arith.tenure", name,
                            f"indicators[{ind.get('key')}].by_tenure.{tk}.{lab}",
                            f"holds {end.get('value')} for {end.get('fy_label')} but the series "
                            f"now says {live.get('value')}",
                            "Rebuild by_tenure. The stored change is against a stale value.",
                        )
                if b.get("change") is not None:
                    want = round(t.get("value", 0) - f.get("value", 0), 4)
                    if not _close(b["change"], want, EPS_ABS):
                        yield Finding(
                            FAIL, "arith.tenure", name,
                            f"indicators[{ind.get('key')}].by_tenure.{tk}.change",
                            f"stores {b['change']} but the endpoints differ by {want}",
                            "Recompute.",
                        )
                if b.get("pct") is not None and f.get("value"):
                    want = round(100.0 * (t["value"] - f["value"]) / f["value"], 1)
                    if not _close(b["pct"], want, EPS_PCT):
                        yield Finding(
                            FAIL, "arith.tenure", name,
                            f"indicators[{ind.get('key')}].by_tenure.{tk}.pct",
                            f"stores {b['pct']}% but the endpoints give {want}%",
                            "Recompute. This percentage is the number on the card.",
                        )
