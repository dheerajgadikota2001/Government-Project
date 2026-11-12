"""
The review queue: where a proposed fact waits for a person.

THE STATES
    proposed  -> verified | rejected     (the verifier decides, in the same call that saves it)
    verified  -> approved | rejected     (a named person decides)
    approved, rejected                   (final)

`proposed` exists so that a crash between saving and verifying leaves a row that
says exactly that, not a fact that looks checked. In normal running a row spends
no time there.

Only `approved` rows can ever reach a reader, and publishing them into a chart is a
later, separate step. Approval records who approved and when. The database says the
same rules as constraints (see app/models/ai_review.py), so a path that skips this
module still cannot approve an unverified fact.

APPROVAL RE-CHECKS THE ONE RULE THAT CAN CHANGE WHILE A FACT WAITS: another fact for
the same indicator, period and stage may have been approved in the meantime. If it
carries the same figure, this one is refused as a duplicate instead of doubled.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Mapping, Optional

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_review import ProposedFact
from app.services.editorial_gate import nums
from app.services.fact_verifier import KnownFact, Proposal, fold, verify

TRANSITIONS: dict[str, set[str]] = {
    "proposed": {"verified", "rejected"},
    "verified": {"approved", "rejected"},
    "approved": set(),
    "rejected": set(),
}


class TransitionRefused(Exception):
    """The move is not allowed. The message says why."""


def can_move(current: str, new: str) -> bool:
    return new in TRANSITIONS.get(current, set())


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def known_facts(db: AsyncSession, exclude_id: Optional[int] = None) -> list[KnownFact]:
    q = sa.select(ProposedFact).where(ProposedFact.status == "approved")
    if exclude_id is not None:
        q = q.where(ProposedFact.id != exclude_id)
    rows = (await db.execute(q)).scalars().all()
    return [KnownFact(r.id, r.indicator, r.period, r.stage or "", r.value) for r in rows]


async def submit(db: AsyncSession, proposal: Proposal, pages: Mapping[int, str], *,
                 run_id: Optional[str] = None, model: Optional[str] = None) -> ProposedFact:
    """Save a proposal and verify it. The row comes back verified or rejected."""
    row = ProposedFact(
        run_id=run_id, status="proposed", indicator=proposal.indicator.strip(), value=proposal.value.strip(),
        unit=(proposal.unit or "").strip() or None, period=proposal.period.strip(),
        stage=(proposal.stage or "").strip() or None, quote=proposal.quote.strip(), page=proposal.page,
        source_url=proposal.source_url.strip(), paper_sha256=proposal.paper_sha256, model=model,
        reasons=[], flags=[],
    )
    db.add(row)
    await db.flush()

    verdict = verify(proposal, pages, await known_facts(db))
    row.flags = verdict.flags
    row.evidence = verdict.evidence
    now = _now()
    if verdict.ok:
        row.status, row.verified_at = "verified", now
    else:
        row.status, row.rejected_at, row.reasons = "rejected", now, verdict.reasons
    await db.commit()
    return row


async def _locked(db: AsyncSession, fact_id: int) -> ProposedFact:
    row = (await db.execute(
        sa.select(ProposedFact).where(ProposedFact.id == fact_id).with_for_update()
    )).scalar_one_or_none()
    if row is None:
        raise TransitionRefused(f"fact #{fact_id} does not exist")
    return row


async def approve(db: AsyncSession, fact_id: int, by: str) -> ProposedFact:
    if not (by or "").strip():
        raise TransitionRefused("approval needs the name of the person approving")
    row = await _locked(db, fact_id)
    if not can_move(row.status, "approved"):
        raise TransitionRefused(f"fact #{fact_id} is {row.status}; only a verified fact can be approved")

    key = (fold(row.indicator), fold(row.period), fold(row.stage))
    for k in await known_facts(db, exclude_id=row.id):
        if (fold(k.indicator), fold(k.period), fold(k.stage)) == key and nums(k.value) == nums(row.value):
            raise TransitionRefused(f"fact #{k.id} already carries this figure for the same indicator, period and stage")

    row.status, row.approved_at, row.approved_by = "approved", _now(), by.strip()
    await db.commit()
    return row


async def reject(db: AsyncSession, fact_id: int, by: str, note: str) -> ProposedFact:
    if not (by or "").strip() or not (note or "").strip():
        raise TransitionRefused("a rejection needs who rejected it and why")
    row = await _locked(db, fact_id)
    if not can_move(row.status, "rejected"):
        raise TransitionRefused(f"fact #{fact_id} is {row.status}; it cannot be rejected now")
    row.status, row.rejected_at, row.reject_note = "rejected", _now(), f"{by.strip()}: {note.strip()}"
    await db.commit()
    return row


async def waiting(db: AsyncSession, limit: int = 50) -> list[ProposedFact]:
    """Verified facts a person has not yet decided on, oldest first."""
    q = sa.select(ProposedFact).where(ProposedFact.status == "verified").order_by(ProposedFact.created_at).limit(limit)
    return list((await db.execute(q)).scalars().all())


async def counts(db: AsyncSession) -> dict[str, int]:
    rows = (await db.execute(
        sa.select(ProposedFact.status, sa.func.count()).group_by(ProposedFact.status)
    )).all()
    out = {s: 0 for s in TRANSITIONS}
    out.update({s: int(n) for s, n in rows})
    return out
