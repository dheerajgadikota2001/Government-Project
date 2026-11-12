"""
The spend guard: no model call is made unless the money is there to pay for it.

WHY THIS EXISTS
The owner set a ceiling of USD 200 a month for Claude API spend (D-2026-11-10).
A ceiling that lives in a note is not a ceiling. This module is the one place a
call has to pass before it is made, and the one place that writes down what it
cost afterwards.

THE RULES, in the order they are checked
1. The master switch. AI_ASSIST_ENABLED is false until the owner has seen the
   cost sheet and said yes. Off means no call, whatever else is configured.
2. The run cap. One run may not spend more than ai_run_cap_usd. A retry loop that
   goes wrong is bounded here, in minutes, not at the end of the month.
3. The day cap, from the ledger, by India's calendar day.
4. The month ceiling, from the ledger, by India's calendar month.

Each check adds the WORST CASE of the call about to be made, not just what was
already spent: the prompt at a pessimistic characters-per-token rate, and the
full max_tokens of output. A guard that only looks backwards lets the call that
crosses the line go through.

TWO CHOICES THAT FAIL CLOSED
- If the ledger cannot be read, the call is refused. Spending without knowing
  what has been spent is the failure this module exists to prevent.
- If a call happened and writing its cost failed, the guard refuses every
  further call in that run. The money was spent; the record is what is missing.

PRICES
The table below is USD per million tokens (input, output). A model not in the
table is priced at the most expensive entry, so a new model name can only make
the guard stricter. Confirm the figures against Anthropic's pricing page before
the switch is turned on, and override them with AI_PRICE_TABLE if they differ.
The cost sheet the owner approves is built from this table.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Optional, Protocol

from app.config import settings
from app.utils.logger import logger

IST = timezone(timedelta(hours=5, minutes=30))

BUILT_IN_PRICES: dict[str, tuple[float, float]] = {
    "claude-haiku-4-5": (1.0, 5.0),
    "claude-sonnet-4-5": (3.0, 15.0),
    "claude-opus-4-5": (5.0, 25.0),
}

# Telugu and table-heavy PDF text can run close to one token per character, so the
# estimate assumes two characters per token. Over-estimating only makes the guard
# stricter, which is the safe direction.
CHARS_PER_TOKEN = 2.0


class BudgetRefused(Exception):
    """The call must not be made. The message says why, in words for the digest."""


def price_table() -> dict[str, tuple[float, float]]:
    table = dict(BUILT_IN_PRICES)
    raw = (settings.ai_price_table or "").strip()
    if raw:
        try:
            for model, pair in json.loads(raw).items():
                table[str(model)] = (float(pair[0]), float(pair[1]))
        except (ValueError, TypeError, IndexError, AttributeError) as exc:
            # A typo here would silently fall back to prices the owner meant to replace.
            raise ValueError(f"AI_PRICE_TABLE is not valid: {exc}") from exc
    return table


def price_for(model: str, table: Optional[dict[str, tuple[float, float]]] = None) -> tuple[float, float]:
    table = table or price_table()
    if model in table:
        return table[model]
    return max(table.values(), key=lambda p: p[1])


def cost_usd(model: str, input_tokens: int, output_tokens: int) -> float:
    pin, pout = price_for(model)
    return (input_tokens * pin + output_tokens * pout) / 1_000_000


def estimate_worst_case(model: str, prompt_chars: int, max_tokens: int) -> float:
    return cost_usd(model, math.ceil(prompt_chars / CHARS_PER_TOKEN), max_tokens)


def usage_from_response(resp: Any) -> tuple[int, int]:
    usage = getattr(resp, "usage", None)
    return int(getattr(usage, "input_tokens", 0) or 0), int(getattr(usage, "output_tokens", 0) or 0)


def day_start(now: datetime) -> datetime:
    n = now.astimezone(IST)
    return n.replace(hour=0, minute=0, second=0, microsecond=0)


def month_start(now: datetime) -> datetime:
    return day_start(now).replace(day=1)


# the ledger

class Ledger(Protocol):
    async def total_since(self, since: datetime) -> float: ...
    async def add(self, **row: Any) -> None: ...


class InMemoryLedger:
    """For tests and dry runs. Production uses DbLedger."""

    def __init__(self) -> None:
        self.rows: list[dict[str, Any]] = []

    async def total_since(self, since: datetime) -> float:
        return sum(r["cost_usd"] for r in self.rows if r["at"] >= since)

    async def add(self, **row: Any) -> None:
        self.rows.append(row)


class DbLedger:
    async def total_since(self, since: datetime) -> float:
        import sqlalchemy as sa
        from app.database import get_db_context
        from app.models.ai_review import AiSpend

        async with get_db_context() as db:
            total = (await db.execute(
                sa.select(sa.func.coalesce(sa.func.sum(AiSpend.cost_usd), 0)).where(AiSpend.at >= since)
            )).scalar_one()
        return float(total)

    async def add(self, **row: Any) -> None:
        from app.database import get_db_context
        from app.models.ai_review import AiSpend

        async with get_db_context() as db:
            db.add(AiSpend(**row))
            await db.commit()


# the guard

@dataclass
class GuardLimits:
    enabled: bool
    monthly: float
    daily: float
    run: float

    @classmethod
    def from_settings(cls) -> "GuardLimits":
        return cls(settings.ai_assist_enabled, settings.ai_monthly_ceiling_usd,
                   settings.ai_daily_cap_usd, settings.ai_run_cap_usd)


class SpendGuard:
    def __init__(self, ledger: Optional[Ledger] = None, limits: Optional[GuardLimits] = None,
                 run_id: Optional[str] = None, now: Optional[Callable[[], datetime]] = None):
        self.ledger = ledger or DbLedger()
        self.limits = limits or GuardLimits.from_settings()
        self.run_id = run_id
        self._now = now or (lambda: datetime.now(timezone.utc))
        self.run_spent = 0.0
        self.calls = 0
        self.stopped_reason: Optional[str] = None
        self._blind = False

    def _refuse(self, reason: str) -> BudgetRefused:
        self.stopped_reason = reason
        logger.warning(f"[ai_spend] refused: {reason}")
        return BudgetRefused(reason)

    async def check(self, model: str, prompt_chars: int, max_tokens: int) -> float:
        """Raise BudgetRefused, or return the worst-case cost of the call about to be made."""
        lim = self.limits
        if not lim.enabled:
            raise self._refuse("AI assist is switched off (AI_ASSIST_ENABLED is false)")
        if self._blind:
            raise self._refuse("a call's cost could not be written down earlier in this run, so no more calls")
        est = estimate_worst_case(model, prompt_chars, max_tokens)

        if self.run_spent + est > lim.run:
            raise self._refuse(f"this run has spent ${self.run_spent:.2f}; the next call could cost "
                               f"${est:.2f} and would pass the ${lim.run:.2f} run cap")
        now = self._now()
        try:
            today = await self.ledger.total_since(day_start(now))
            month = await self.ledger.total_since(month_start(now))
        except Exception as exc:                              # noqa: BLE001
            raise self._refuse(f"the spend ledger could not be read ({type(exc).__name__}); not spending blind")
        if today + est > lim.daily:
            raise self._refuse(f"today so far ${today:.2f}; the next call could cost ${est:.2f} "
                               f"and would pass the ${lim.daily:.2f} daily cap")
        if month + est > lim.monthly:
            raise self._refuse(f"this month so far ${month:.2f}; the next call could cost ${est:.2f} "
                               f"and would pass the ${lim.monthly:.2f} monthly ceiling")
        return est

    async def record(self, purpose: str, model: str, input_tokens: int, output_tokens: int, ok: bool = True) -> float:
        cost = cost_usd(model, input_tokens, output_tokens)
        self.run_spent += cost
        self.calls += 1
        try:
            await self.ledger.add(at=self._now(), run_id=self.run_id, purpose=purpose, model=model,
                                  input_tokens=input_tokens, output_tokens=output_tokens, cost_usd=cost, ok=ok)
        except Exception as exc:                              # noqa: BLE001
            self._blind = True
            logger.error(f"[ai_spend] could not write a ${cost:.4f} call to the ledger: {type(exc).__name__}: {exc}")
        return cost
