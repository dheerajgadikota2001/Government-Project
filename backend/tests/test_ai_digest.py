"""
The daily AI digest: what is waiting, what was thrown out, what it cost.

The wording and the "worth an email" rules are pure and tested without a database.
The block must show up in the alert email only when the AI layer is on or has been used,
and it must make an email worth sending on a day when every scraper was quiet.
"""

import pytest
import pytest_asyncio
import sqlalchemy as sa

from app.config import settings
from app.services import ai_digest, alerts
from app.services.ai_digest import lines, needs_attention

BASE = dict(enabled=True, waiting=0, oldest_waiting_days=None, proposed_day=0, verified_day=0, rejected_day=0,
            today_usd=0.0, month_usd=0.0, monthly_ceiling_usd=200.0, daily_cap_usd=15.0, stopped_reason=None)


def digest(**over) -> dict:
    return BASE | over


def quiet_report(**over) -> dict:
    return {"run_id": "abcdef123456", "started_at": None, "duration_s": 12, "needs_you": [], "blocked": [],
            "changed": [], "quiet": ["A", "B"], "still_failing": [], "recovered": [], "notes": [], "dead": [],
            "heartbeat": False, "groups": ["daily"], "not_run": []} | over


def test_nothing_waiting_and_money_fine_is_not_worth_an_email():
    assert not needs_attention(digest())
    assert not needs_attention(None)


def test_waiting_facts_a_stop_or_eighty_percent_of_the_ceiling_are_worth_an_email():
    assert needs_attention(digest(waiting=3))
    assert needs_attention(digest(stopped_reason="the monthly ceiling would be passed"))
    assert needs_attention(digest(month_usd=160.0))
    assert not needs_attention(digest(month_usd=159.0))


def test_the_wording_says_what_to_do_and_what_it_cost():
    text = "\n".join(lines(digest(waiting=3, oldest_waiting_days=2.0, proposed_day=5, verified_day=3,
                                  rejected_day=2, today_usd=0.42, month_usd=12.5)))
    assert "Waiting for your approval: 3 verified fact(s), the oldest 2 day(s) old." in text
    assert "python scripts/review_queue.py list" in text
    assert "Thrown out by the checks: 2" in text
    assert "$0.42 today, $12.50 this month (6% of the $200 monthly ceiling)" in text
    assert "Stopped" not in text and "Warning" not in text


def test_a_warning_and_a_stop_are_stated_plainly():
    text = "\n".join(lines(digest(month_usd=170.0, stopped_reason="this month so far $170.00 would pass the ceiling")))
    assert "Warning: 80% of the monthly ceiling is used" in text
    assert "Stopped: this month so far" in text


def test_a_switched_off_layer_says_so_and_never_blames_the_checks():
    text = "\n".join(lines(digest(enabled=False)))
    assert "switched off" in text and "Waiting for your approval: none." in text


def test_the_block_is_in_the_alert_email_and_makes_a_quiet_day_worth_sending():
    report = quiet_report(ai_digest=digest(waiting=2, oldest_waiting_days=1.0))
    subject, body = alerts.build_body(report)
    assert "AI REVIEW" in body and "Waiting for your approval: 2" in body
    assert alerts.should_send(report)
    assert not alerts.should_send(quiet_report(ai_digest=digest()))
    assert "AI REVIEW" not in alerts.build_body(quiet_report())[1]        # no block when there is no digest


# the numbers, from a database

@pytest_asyncio.fixture
async def clean():
    from app.database import Base, engine, get_db_context
    from app.models.ai_review import AiSpend, ProposedFact
    async with engine.begin() as conn:
        await conn.run_sync(lambda c: Base.metadata.create_all(c, tables=[AiSpend.__table__, ProposedFact.__table__]))
    async with get_db_context() as db:
        await db.execute(sa.delete(ProposedFact))
        await db.execute(sa.delete(AiSpend))
        await db.commit()
    yield
    async with get_db_context() as db:
        await db.execute(sa.delete(ProposedFact))
        await db.execute(sa.delete(AiSpend))
        await db.commit()


@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_collect_is_none_when_the_layer_is_off_and_unused(clean, monkeypatch):
    from app.database import get_db_context
    monkeypatch.setattr(settings, "ai_assist_enabled", False)
    async with get_db_context() as db:
        assert await ai_digest.collect(db) is None


@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_collect_counts_waiting_rejected_and_spend(clean, monkeypatch):
    from app.database import get_db_context
    from app.models.ai_review import AiSpend
    from app.services import fact_queue
    from app.services.fact_verifier import Proposal

    monkeypatch.setattr(settings, "ai_assist_enabled", True)
    pages = {1: "the outstanding liabilities stood at Rs. 4,85,490 crore at the end of March 2024"}
    ok = Proposal("digest-a", "4,85,490", "2023-24", "outstanding liabilities stood at Rs. 4,85,490 crore",
                  "https://example.test/x.pdf", 1, "Rs. crore", "A")
    async with get_db_context() as db:
        await fact_queue.submit(db, ok, pages)
        await fact_queue.submit(db, Proposal("digest-b", "9", "2023-24", "outstanding liabilities stood at Rs. 4,85,490 crore",
                                             "https://example.test/x.pdf", 1), pages)
        db.add(AiSpend(purpose="fact_extract", model="claude-haiku-4-5", input_tokens=1000, output_tokens=100, cost_usd=0.25))
        await db.commit()
        d = await ai_digest.collect(db)
    assert d["enabled"] and d["waiting"] == 1 and d["rejected_day"] == 1 and d["proposed_day"] == 2
    assert d["today_usd"] == pytest.approx(0.25) and d["month_usd"] == pytest.approx(0.25)
    assert d["monthly_ceiling_usd"] == 200.0
