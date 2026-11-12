"""
The whole approach A path in one test, with a fake model and a real database:

    paper text -> extractor proposes -> verifier checks -> queue -> digest -> a person approves

It exists because each piece has its own tests and the promise is about the chain: a
fabricated figure from the model must never get as far as the waiting list, the spend must
be on the ledger, and the digest must tell the owner what is waiting. No paid call is made.
"""

from types import SimpleNamespace

import pytest
import pytest_asyncio
import sqlalchemy as sa

from app.config import settings
from app.database import Base, engine, get_db_context
from app.models.ai_review import AiSpend, ProposedFact
from app.services import ai_digest, alerts, fact_queue
from app.services.ai_spend import DbLedger, GuardLimits, SpendGuard
from app.services.fact_extractor import PaperText, Wanted, process_paper

TAG = "flow-test"
PAGES = {
    4: "At the end of March 2024 the outstanding liabilities stood at Rs. 4,85,490 crore.",
    5: "Guarantees given by the state stood at Rs. 1,25,000 crore at the end of March 2024.",
}
WANTED = [Wanted(TAG + "-liabilities", "Outstanding liabilities"), Wanted(TAG + "-guarantees", "Guarantees given")]

REPLY = """{"facts": [
 {"indicator": "%(a)s", "value": "4,85,490", "unit": "Rs. crore", "period": "2023-24", "stage": "A",
  "quote": "the outstanding liabilities stood at Rs. 4,85,490 crore", "page": 4},
 {"indicator": "%(b)s", "value": "1,50,000", "unit": "Rs. crore", "period": "2023-24", "stage": "A",
  "quote": "Guarantees given by the state stood at Rs. 1,50,000 crore", "page": 5}
]}""" % {"a": TAG + "-liabilities", "b": TAG + "-guarantees"}


class FakeClient:
    def __init__(self):
        self.calls = 0
        self.messages = self

    async def create(self, **kw):
        self.calls += 1
        return SimpleNamespace(content=[SimpleNamespace(type="text", text=REPLY)],
                               usage=SimpleNamespace(input_tokens=2000, output_tokens=300))


@pytest_asyncio.fixture
async def clean():
    async with engine.begin() as conn:
        await conn.run_sync(lambda c: Base.metadata.create_all(c, tables=[AiSpend.__table__, ProposedFact.__table__]))

    async def wipe():
        async with get_db_context() as db:
            await db.execute(sa.delete(ProposedFact))
            await db.execute(sa.delete(AiSpend))
            await db.commit()
    await wipe()
    yield
    await wipe()


@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_a_made_up_figure_never_reaches_the_waiting_list_and_the_owner_is_told(clean, monkeypatch):
    monkeypatch.setattr(settings, "ai_assist_enabled", True)
    guard = SpendGuard(DbLedger(), GuardLimits(True, 200.0, 15.0, 5.0), run_id="flow-1")
    client = FakeClient()
    paper = PaperText("https://example.test/rbi.pdf", PAGES, "cd" * 32, "RBI State Finances")

    async with get_db_context() as db:
        summary = await process_paper(db, client, guard, paper, WANTED, run_id="flow-1")
        assert client.calls == 1
        assert (summary["proposed"], summary["verified"], summary["rejected"]) == (2, 1, 1)
        assert summary["partial"] is False

        waiting = await fact_queue.waiting(db)
        assert [w.indicator for w in waiting] == [TAG + "-liabilities"]        # the 1,50,000 guess is not here
        rejected = (await db.execute(sa.select(ProposedFact).where(ProposedFact.status == "rejected"))).scalars().one()
        assert rejected.indicator == TAG + "-guarantees"
        assert "not in the paper text" in rejected.reasons[0]                   # the model changed the quote too

        digest = await ai_digest.collect(db)
    assert digest["waiting"] == 1 and digest["rejected_day"] == 1
    assert digest["today_usd"] == pytest.approx(2000 * 1e-6 + 300 * 5e-6)      # the call is on the ledger
    report = {"needs_you": [], "blocked": [], "changed": [], "quiet": ["X"], "dead": [], "recovered": [],
              "still_failing": [], "notes": [], "heartbeat": False, "groups": ["daily"], "not_run": [],
              "run_id": "flow-1x", "started_at": None, "duration_s": 3, "ai_digest": digest}
    assert alerts.should_send(report)
    assert "Waiting for your approval: 1" in alerts.build_body(report)[1]

    async with get_db_context() as db:
        done = await fact_queue.approve(db, waiting[0].id, "Dheeraj")
        assert done.status == "approved"
        assert (await ai_digest.collect(db))["waiting"] == 0


@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_with_the_switch_off_nothing_is_called_and_nothing_is_queued(clean, monkeypatch):
    from app.services.ai_spend import BudgetRefused
    guard = SpendGuard(DbLedger(), GuardLimits(False, 200.0, 15.0, 5.0), run_id="flow-2")
    client = FakeClient()
    async with get_db_context() as db:
        with pytest.raises(BudgetRefused):
            await process_paper(db, client, guard, PaperText("u", PAGES), WANTED)
        assert client.calls == 0
        assert await fact_queue.waiting(db) == []
