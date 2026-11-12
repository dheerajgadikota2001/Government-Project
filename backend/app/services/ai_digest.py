"""
The daily AI digest: one block in the alert email that answers three questions.

    What is waiting for my approval?
    What did the checks throw out, and was anything stopped?
    How much has the model cost, against the ceiling?

WHY IT LIVES IN THE EXISTING ALERT EMAIL
A second email would be a second thing to read, and the owner asked for one daily
place to cross-check before going ahead (D-2026-11-10). The block appears only when
the AI layer is on or has ever been used. Before that it would be a nightly line
about a feature that does nothing, and lines like that teach a reader to stop reading.

WHAT COUNTS AS "NEEDS YOU"
Verified facts waiting for a decision, a stop caused by a cap or ceiling, or spend
at 80% of the monthly ceiling. Any of these makes the email worth sending even on a
day when every scraper was quiet. See alerts.should_send.

`collect` reads the database. `lines` and `needs_attention` are pure, so the wording
and the rules are tested without one.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from app.config import settings

WARN_AT = 0.8
RULE = "\u2500" * 55          # the same rule line the rest of the email draws


def needs_attention(d: Optional[dict[str, Any]]) -> bool:
    if not d:
        return False
    ceiling = d.get("monthly_ceiling_usd") or 0
    near = ceiling > 0 and d.get("month_usd", 0) >= WARN_AT * ceiling
    return bool(d.get("waiting") or d.get("stopped_reason") or near)


def lines(d: dict[str, Any]) -> list[str]:
    out = ["AI REVIEW", RULE]
    if not d.get("enabled"):
        out.append("AI assist is switched off. Nothing new is being proposed.")

    waiting = d.get("waiting", 0)
    if waiting:
        oldest = d.get("oldest_waiting_days")
        age = f", the oldest {oldest:.0f} day(s) old" if oldest is not None else ""
        out.append(f"Waiting for your approval: {waiting} verified fact(s){age}.")
        out.append("  -> python scripts/review_queue.py list")
    else:
        out.append("Waiting for your approval: none.")

    out.append(f"Proposed in the last day: {d.get('proposed_day', 0)}. "
               f"Verified: {d.get('verified_day', 0)}. Thrown out by the checks: {d.get('rejected_day', 0)} "
               "(each one keeps its reason; nothing to do).")

    month, ceiling = d.get("month_usd", 0.0), d.get("monthly_ceiling_usd", 0.0)
    share = f" ({100 * month / ceiling:.0f}% of the ${ceiling:.0f} monthly ceiling)" if ceiling else ""
    out.append(f"AI spend: ${d.get('today_usd', 0.0):.2f} today, ${month:.2f} this month{share}.")
    if ceiling and month >= WARN_AT * ceiling:
        out.append(f"  Warning: {int(WARN_AT * 100)}% of the monthly ceiling is used. The guard stops all calls at the ceiling.")
    if d.get("stopped_reason"):
        out.append(f"Stopped: {d['stopped_reason']}.")
    out.append("")
    return out


async def collect(db: Any, stopped_reason: Optional[str] = None,
                  now: Optional[datetime] = None) -> Optional[dict[str, Any]]:
    """The digest's numbers, or None when the AI layer is off and has never been used."""
    import sqlalchemy as sa
    from app.models.ai_review import AiSpend, ProposedFact
    from app.services.ai_spend import day_start, month_start

    now = now or datetime.now(timezone.utc)
    ever = (await db.execute(sa.select(sa.func.count()).select_from(ProposedFact))).scalar_one() \
        + (await db.execute(sa.select(sa.func.count()).select_from(AiSpend))).scalar_one()
    if not settings.ai_assist_enabled and not ever:
        return None

    async def spend_since(since: datetime) -> float:
        total = (await db.execute(
            sa.select(sa.func.coalesce(sa.func.sum(AiSpend.cost_usd), 0)).where(AiSpend.at >= since)
        )).scalar_one()
        return float(total)

    day_ago = now - timedelta(days=1)
    by_status = dict((await db.execute(
        sa.select(ProposedFact.status, sa.func.count()).where(ProposedFact.created_at >= day_ago)
        .group_by(ProposedFact.status)
    )).all())
    waiting, oldest = (await db.execute(
        sa.select(sa.func.count(), sa.func.min(ProposedFact.created_at)).where(ProposedFact.status == "verified")
    )).one()

    return {
        "enabled": settings.ai_assist_enabled,
        "waiting": int(waiting),
        "oldest_waiting_days": ((now - oldest).total_seconds() / 86400) if oldest else None,
        "proposed_day": sum(int(n) for n in by_status.values()),
        "verified_day": int(by_status.get("verified", 0)) + int(by_status.get("approved", 0)),
        "rejected_day": int(by_status.get("rejected", 0)),
        "today_usd": await spend_since(day_start(now)),
        "month_usd": await spend_since(month_start(now)),
        "monthly_ceiling_usd": settings.ai_monthly_ceiling_usd,
        "daily_cap_usd": settings.ai_daily_cap_usd,
        "stopped_reason": stopped_reason,
    }
