"""
The spend guard: no model call is made unless the money is there for it.

These run with no database and no network: the guard takes a ledger, and the tests
give it an in-memory one. What they pin down:
  - the master switch, the run cap, the day cap and the month ceiling each stop a call
  - the check counts the WORST CASE of the call about to be made, not only what is spent
  - the ledger decides: yesterday's and last month's spend are not today's
  - it fails closed: an unreadable ledger refuses, and a cost that could not be written
    down stops the rest of the run
  - an unknown model is priced at the most expensive entry, so it can only be stricter
"""

import json
from datetime import datetime, timedelta, timezone

import pytest

from app.config import settings
from app.services import ai_spend
from app.services.ai_spend import (
    BudgetRefused, GuardLimits, IST, InMemoryLedger, SpendGuard, cost_usd, estimate_worst_case, price_for,
)

NOW = datetime(2026, 11, 12, 9, 0, tzinfo=IST)


def limits(**over) -> GuardLimits:
    base = dict(enabled=True, monthly=200.0, daily=15.0, run=5.0)
    return GuardLimits(**(base | over))


def guard(ledger=None, **over) -> SpendGuard:
    return SpendGuard(ledger or InMemoryLedger(), limits(**over), run_id="r1", now=lambda: NOW)


def spent(ledger: InMemoryLedger, usd: float, when: datetime = NOW) -> None:
    ledger.rows.append({"at": when, "cost_usd": usd})


# prices

def test_known_model_price_and_cost():
    assert price_for("claude-haiku-4-5") == (1.0, 5.0)
    # 1,000,000 tokens in and 200,000 out on Haiku: $1.00 + $1.00
    assert cost_usd("claude-haiku-4-5", 1_000_000, 200_000) == pytest.approx(2.0)


def test_unknown_model_is_priced_at_the_most_expensive_entry():
    assert price_for("some-future-model") == (5.0, 25.0)


def test_price_override_is_read_and_a_bad_one_fails_loudly(monkeypatch):
    monkeypatch.setattr(settings, "ai_price_table", json.dumps({"claude-haiku-4-5": [2.0, 9.0]}))
    assert price_for("claude-haiku-4-5") == (2.0, 9.0)
    monkeypatch.setattr(settings, "ai_price_table", "{not json")
    with pytest.raises(ValueError):
        ai_spend.price_table()


def test_worst_case_counts_the_whole_output_and_a_pessimistic_prompt():
    est = estimate_worst_case("claude-haiku-4-5", prompt_chars=40_000, max_tokens=3000)
    # 20,000 input tokens at $1 and 3,000 output tokens at $5 per million
    assert est == pytest.approx(0.02 + 0.015)


# the four rules

@pytest.mark.asyncio
async def test_switched_off_means_no_call_whatever_else_is_set():
    g = guard(enabled=False)
    with pytest.raises(BudgetRefused, match="switched off"):
        await g.check("claude-haiku-4-5", 1000, 100)
    assert g.stopped_reason and "switched off" in g.stopped_reason


@pytest.mark.asyncio
async def test_a_small_call_inside_every_limit_passes_and_returns_its_estimate():
    est = await guard().check("claude-haiku-4-5", 4000, 1000)
    assert est == pytest.approx(2000 / 1e6 + 1000 * 5 / 1e6)


@pytest.mark.asyncio
async def test_run_cap_stops_the_call_that_would_cross_it():
    g = guard(run=0.05)
    g.run_spent = 0.04
    with pytest.raises(BudgetRefused, match="run cap"):
        await g.check("claude-haiku-4-5", 20_000, 3000)       # worst case about $0.025


@pytest.mark.asyncio
async def test_day_cap_counts_the_worst_case_not_just_what_is_spent():
    ledger = InMemoryLedger()
    spent(ledger, 14.99)
    with pytest.raises(BudgetRefused, match="daily cap"):
        await guard(ledger).check("claude-haiku-4-5", 20_000, 3000)   # 14.99 + 0.035 is over 15


@pytest.mark.asyncio
async def test_month_ceiling_stops_everything_even_on_a_quiet_day():
    ledger = InMemoryLedger()
    for day in range(1, 12):
        spent(ledger, 18.2, NOW.replace(day=day))                 # 200.2 over eleven days, none today
    with pytest.raises(BudgetRefused, match="monthly ceiling"):
        await guard(ledger).check("claude-haiku-4-5", 1000, 100)


@pytest.mark.asyncio
async def test_yesterday_and_last_month_do_not_count_against_today_or_this_month():
    ledger = InMemoryLedger()
    spent(ledger, 14.9, NOW - timedelta(days=1))                  # yesterday: not today
    spent(ledger, 190.0, NOW.replace(month=10, day=30))           # last month: not this month
    await guard(ledger).check("claude-haiku-4-5", 4000, 1000)     # must not raise


@pytest.mark.asyncio
async def test_the_day_is_indias_day_not_utc():
    # 00:30 IST on 12 Nov is 19:00 UTC on 11 Nov. Spend from 23:00 IST on 11 Nov is yesterday.
    just_after_midnight = datetime(2026, 11, 12, 0, 30, tzinfo=IST)
    ledger = InMemoryLedger()
    spent(ledger, 14.99, datetime(2026, 11, 11, 23, 0, tzinfo=IST))
    g = SpendGuard(ledger, limits(), now=lambda: just_after_midnight)
    await g.check("claude-haiku-4-5", 20_000, 3000)


# failing closed

class BrokenReads(InMemoryLedger):
    async def total_since(self, since):
        raise ConnectionError("db down")


class BrokenWrites(InMemoryLedger):
    async def add(self, **row):
        raise ConnectionError("db down")


@pytest.mark.asyncio
async def test_an_unreadable_ledger_refuses_the_call():
    with pytest.raises(BudgetRefused, match="not spending blind"):
        await guard(BrokenReads()).check("claude-haiku-4-5", 1000, 100)


@pytest.mark.asyncio
async def test_a_cost_that_could_not_be_written_stops_the_rest_of_the_run():
    g = guard(BrokenWrites())
    await g.check("claude-haiku-4-5", 1000, 100)
    cost = await g.record("fact_extract", "claude-haiku-4-5", 1000, 100)     # does not raise
    assert cost > 0 and g.run_spent == pytest.approx(cost)
    with pytest.raises(BudgetRefused, match="could not be written down"):
        await g.check("claude-haiku-4-5", 1000, 100)


@pytest.mark.asyncio
async def test_record_writes_the_row_and_the_run_total_grows():
    ledger = InMemoryLedger()
    g = guard(ledger)
    await g.record("fact_extract", "claude-haiku-4-5", 10_000, 1_000)
    row = ledger.rows[0]
    assert row["purpose"] == "fact_extract" and row["run_id"] == "r1"
    assert row["cost_usd"] == pytest.approx(0.015) and g.run_spent == pytest.approx(0.015) and g.calls == 1


def test_default_limits_are_the_owners_ceiling():
    assert settings.ai_monthly_ceiling_usd == 200.0
    assert settings.ai_assist_enabled is False          # a deliberate switch, never a default
