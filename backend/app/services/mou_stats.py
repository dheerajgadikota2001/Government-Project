"""
The MoU headline figures, computed in one place.

WHY THIS IS NOT INLINE SQL

The /stats endpoint summed every MoU into one "promised" total. Lulu Group's
2,200 crore mall was in it, and Lulu had walked away; the register itself
says "cancelled". Two stalled commitments were in it too. A cancelled promise
is not a promise any more, so counting it inflated the number on the home
page and the investments page, quietly, on the one figure people quote.

The rule now: the headline counts commitments that are still live. What was
withdrawn or has stalled is still shown, with its own amount, on its own
line, so nothing disappears; it just stops being counted as a promise.

Kept as a pure function over plain rows so the arithmetic is tested without
a database, and so the router and any future page cannot compute two
different totals from the same register.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Optional

# Statuses that no longer describe a live commitment. STALLED is here on
# purpose: the source that recorded it as stalled is saying the money is not
# moving, and a headline that still counts it is making a claim that source
# does not.
NOT_LIVE = frozenset({"cancelled", "stalled"})

TIERS = ("government", "company", "press")


@dataclass(frozen=True)
class MouRow:
    status: str
    source_tier: Optional[str]
    investment_crore: Optional[float]
    expected_employment: Optional[int]
    is_foreign: bool


def _tier(t: Optional[str]) -> str:
    return t if t in TIERS else "unlabelled"


def summarise(rows: Iterable[MouRow]) -> dict:
    rows = list(rows)
    live = [r for r in rows if r.status not in NOT_LIVE]

    total = round(sum(r.investment_crore or 0 for r in live), 2)
    by_tier = {k: {"mous": 0, "investment_crore": 0.0} for k in (*TIERS, "unlabelled")}
    for r in live:
        block = by_tier[_tier(r.source_tier)]
        block["mous"] += 1
        block["investment_crore"] = round(block["investment_crore"] + (r.investment_crore or 0), 2)
    for block in by_tier.values():
        block["share_pct"] = round(100 * block["investment_crore"] / total, 1) if total else 0.0

    not_live = {}
    for status in sorted(NOT_LIVE):
        subset = [r for r in rows if r.status == status]
        not_live[status] = {
            "mous": len(subset),
            "investment_crore": round(sum(r.investment_crore or 0 for r in subset), 2),
        }

    return {
        # Live commitments only. These are the names the pages already read.
        "total_mous": len(live),
        "total_investment_crore": total,
        "total_expected_jobs": int(sum(r.expected_employment or 0 for r in live)),
        "foreign_investments": sum(1 for r in live if r.is_foreign),
        "by_source_tier": by_tier,
        # Everything in the register, so the two numbers can be reconciled.
        "all_recorded": {
            "mous": len(rows),
            "investment_crore": round(sum(r.investment_crore or 0 for r in rows), 2),
        },
        "not_live": not_live,
        "provenance_note": (
            "This total is what has been announced and is still on the table, not what the "
            "government has recorded as invested. Commitments the record marks as cancelled or "
            "stalled are listed separately and left out of it. Each figure below is the part of "
            "the total that comes from that kind of source."
        ),
    }
