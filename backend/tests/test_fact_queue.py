"""
The review queue: nothing is approved that was not verified, by someone, on a date.

Two layers are tested. The state rules are plain functions. The rest drives a real
database, because the promise that matters is that the DATABASE refuses an approval
that skipped verification, even if a code path forgot to. Tests that need Postgres carry
requires_db, as the rest of the suite does. No model is called.
"""

import pytest
import pytest_asyncio
import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError

from app.database import Base, engine, get_db_context
from app.models.ai_review import AiSpend, ProposedFact
from app.services import fact_queue
from app.services.fact_queue import TransitionRefused, can_move
from app.services.fact_verifier import Proposal

PAGES = {7: "At the end of March 2024 the outstanding liabilities stood at Rs. 4,85,490 crore."}
QUOTE = "the outstanding liabilities stood at Rs. 4,85,490 crore"
TAG = "queue-test"


def proposal(**over) -> Proposal:
    base = dict(indicator=TAG, value="4,85,490", period="2023-24", quote=QUOTE,
                source_url="https://example.test/rbi.pdf", page=7, unit="Rs. crore", stage="A")
    return Proposal(**(base | over))


# the state rules

def test_the_allowed_moves():
    assert can_move("proposed", "verified") and can_move("proposed", "rejected")
    assert can_move("verified", "approved") and can_move("verified", "rejected")
    for final in ("approved", "rejected"):
        for new in ("proposed", "verified", "approved", "rejected"):
            assert not can_move(final, new)
    assert not can_move("proposed", "approved")          # never straight to approved
    assert not can_move("rejected", "approved")


# with a database

@pytest_asyncio.fixture
async def db_ready():
    async with engine.begin() as conn:
        await conn.run_sync(lambda c: Base.metadata.create_all(c, tables=[AiSpend.__table__, ProposedFact.__table__]))
    async with get_db_context() as db:
        await db.execute(sa.delete(ProposedFact).where(ProposedFact.indicator.like(TAG + "%")))
        await db.commit()
    yield
    async with get_db_context() as db:
        await db.execute(sa.delete(ProposedFact).where(ProposedFact.indicator.like(TAG + "%")))
        await db.commit()


@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_a_good_proposal_is_saved_verified_with_its_evidence(db_ready):
    async with get_db_context() as db:
        row = await fact_queue.submit(db, proposal(), PAGES, run_id="r1", model="claude-haiku-4-5")
        assert row.status == "verified" and row.verified_at and row.rejected_at is None
        assert "4,85,490" in row.evidence and row.reasons == []


@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_a_bad_proposal_is_saved_rejected_with_the_reason_and_cannot_be_approved(db_ready):
    async with get_db_context() as db:
        row = await fact_queue.submit(db, proposal(value="9,99,999"), PAGES)
        assert row.status == "rejected" and "the quote does not print" in row.reasons[0]
        with pytest.raises(TransitionRefused, match="only a verified fact"):
            await fact_queue.approve(db, row.id, "Dheeraj")


@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_approval_needs_a_name_and_records_who_and_when(db_ready):
    async with get_db_context() as db:
        row = await fact_queue.submit(db, proposal(), PAGES)
        with pytest.raises(TransitionRefused, match="name"):
            await fact_queue.approve(db, row.id, "  ")
        done = await fact_queue.approve(db, row.id, "Dheeraj")
        assert done.status == "approved" and done.approved_by == "Dheeraj" and done.approved_at
        with pytest.raises(TransitionRefused):                 # final: cannot be approved twice or rejected
            await fact_queue.approve(db, row.id, "Dheeraj")
        with pytest.raises(TransitionRefused):
            await fact_queue.reject(db, row.id, "Dheeraj", "changed my mind")


@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_a_rejection_needs_a_reason_and_keeps_it(db_ready):
    async with get_db_context() as db:
        row = await fact_queue.submit(db, proposal(), PAGES)
        with pytest.raises(TransitionRefused):
            await fact_queue.reject(db, row.id, "Dheeraj", "")
        done = await fact_queue.reject(db, row.id, "Dheeraj", "this is the previous year's figure")
        assert done.status == "rejected" and "previous year" in done.reject_note


@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_a_second_copy_of_an_approved_figure_is_refused_at_submit_and_at_approval(db_ready):
    async with get_db_context() as db:
        first = await fact_queue.submit(db, proposal(), PAGES)
        # A twin that waited in the queue while the first was approved is refused at approval, not doubled.
        twin = await fact_queue.submit(db, proposal(), PAGES)
        assert twin.status == "verified"
        await fact_queue.approve(db, first.id, "Dheeraj")
        with pytest.raises(TransitionRefused, match="already carries this figure"):
            await fact_queue.approve(db, twin.id, "Dheeraj")
        # A new submission of the same figure is rejected by the verifier outright.
        third = await fact_queue.submit(db, proposal(), PAGES)
        assert third.status == "rejected" and "already approved" in third.reasons[0]


@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_waiting_and_counts_see_only_what_a_person_has_not_decided(db_ready):
    async with get_db_context() as db:
        a = await fact_queue.submit(db, proposal(indicator=TAG + "-a"), PAGES)
        await fact_queue.submit(db, proposal(indicator=TAG + "-b", value="1"), PAGES)      # rejected
        c = await fact_queue.submit(db, proposal(indicator=TAG + "-c"), PAGES)
        await fact_queue.approve(db, c.id, "Dheeraj")
        mine = [r.id for r in await fact_queue.waiting(db, limit=500) if r.indicator.startswith(TAG)]
        assert mine == [a.id]
        counts = await fact_queue.counts(db)
        assert counts["approved"] >= 1 and counts["rejected"] >= 1 and counts["verified"] >= 1


@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_the_database_itself_refuses_an_approval_that_skipped_verification(db_ready):
    """A code path that forgot the rule still cannot break it: the constraint says it too."""
    async with get_db_context() as db:
        row = await fact_queue.submit(db, proposal(value="9,99,999"), PAGES)    # rejected, never verified
        with pytest.raises(IntegrityError):
            await db.execute(sa.text(
                "UPDATE proposed_facts SET status = 'approved', approved_at = now(), approved_by = 'x' WHERE id = :i"
            ), {"i": row.id})
        await db.rollback()
        with pytest.raises(IntegrityError):                                      # rejected with no reason at all
            await db.execute(sa.text(
                "INSERT INTO proposed_facts (status, indicator, value, period, quote, source_url, rejected_at) "
                "VALUES ('rejected', :t, '1', 'p', 'q', 'u', now())"), {"t": TAG + "-x"})
        await db.rollback()
