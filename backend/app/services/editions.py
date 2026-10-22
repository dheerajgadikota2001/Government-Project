"""
District paper editions: draft, approve, publish, and audio after approval.

Every rule here is also a database constraint (app/models/district_edition.py), so a
mistake in this file fails loudly instead of showing a reader something unapproved.
"""

from __future__ import annotations

import datetime as dt
import logging

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.district_edition import DistrictEdition as E
from app.models.district_happening import DistrictHappening as H
from app.services import editorial_gate

log = logging.getLogger(__name__)


class EditionError(Exception):
    """A request the rules refuse. `code` is the short reason the API returns."""

    def __init__(self, code: str, detail: str = ""):
        super().__init__(detail or code)
        self.code = code
        self.detail = detail


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


async def items_for(db: AsyncSession, district: str, urls: list[str]) -> dict[str, list[dict]]:
    """This district's gathered items for the given urls, as the gate reads them."""
    if not urls:
        return {}
    rows = (await db.execute(select(H).where(H.district == district, H.url.in_(urls)))).scalars().all()
    out: dict[str, list[dict]] = {}
    for r in rows:
        out.setdefault(r.url, []).append({"id": r.id, "title": r.title, "summary": r.summary, "date": r.date.isoformat(),
                                          "personal_list": r.personal_list})
    return out


async def used_by_published(db: AsyncSession, district: str) -> set[int]:
    """Every gathered item an already published edition of this district was built from."""
    rows = (await db.execute(select(E.item_ids).where(E.district == district, E.status == "published"))).scalars().all()
    return {int(i) for ids in rows for i in (ids or [])}


async def gate(db: AsyncSession, district: str, content: dict) -> tuple[editorial_gate.GateResult, list[int]]:
    urls = [s.get("url") for s in content.get("lead") or [] if s.get("url")]
    by_url = await items_for(db, district, urls)
    result = editorial_gate.check_edition(content, by_url)
    # A personal list (merit or selection list) is never a story: the paper links such lists, it does not write them up.
    for st in content.get("lead") or []:
        if any(x["personal_list"] for x in by_url.get(st.get("url") or "", [])):
            result.errors.append(f"{st.get('id', '?')}: points at a personal list, which is never written up")
    ids = sorted({x["id"] for xs in by_url.values() for x in xs})
    return result, ids


async def create_draft(db: AsyncSession, district: str, content: dict, written_by: str, note: str | None = None) -> E:
    """Save a draft after the gate. Refused when nothing in it is new since the last published edition."""
    if content.get("district") not in (None, district):
        raise EditionError("district_mismatch", f"content names {content.get('district')!r}, not {district!r}")
    content = {**content, "district": district}
    result, ids = await gate(db, district, content)
    used = await used_by_published(db, district)
    new = [i for i in ids if i not in used]
    if used and not new:
        raise EditionError("nothing_new", "every item in this draft was already in a published edition")
    ed = E(district=district, status="draft", content=content, item_ids=ids, new_item_ids=new,
           gate=result.as_dict() | {"checked_at": _now().isoformat()}, written_by=written_by[:120], note=note)
    db.add(ed)
    await db.flush()
    return ed


async def approve(db: AsyncSession, ed: E, note: str | None = None, checked_raw_files: bool = False) -> E:
    """A person's yes. The gate runs again on today's data first. Audio is asked for here, never earlier."""
    if ed.status != "draft":
        raise EditionError("not_a_draft", f"edition is {ed.status}")
    result, ids = await gate(db, ed.district, ed.content)
    ed.gate = result.as_dict() | {"checked_at": _now().isoformat()}
    if not result.ok:
        raise EditionError("gate_failed", "; ".join(result.errors[:5]))
    if result.needs_person and not checked_raw_files:
        raise EditionError("needs_person_check", "; ".join(result.needs_person[:5]))
    ed.item_ids = ids
    ed.status = "approved"
    ed.approved_at = _now()
    if note:
        ed.note = note
    await request_audio(ed)
    await db.flush()
    return ed


async def publish(db: AsyncSession, ed: E) -> E:
    """Give the next number for the district and show it to readers. Two publishes at once cannot share a number."""
    if ed.status != "approved":
        raise EditionError("not_approved", f"edition is {ed.status}")
    # One district at a time: a transaction-scoped lock keyed on the district name.
    await db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": "edition:" + ed.district})
    last = (await db.execute(select(func.max(E.number)).where(E.district == ed.district))).scalar_one()
    ed.number = (last or 0) + 1
    ed.status = "published"
    ed.published_at = _now()
    await db.flush()
    return ed


async def reject(db: AsyncSession, ed: E, note: str | None = None) -> E:
    if ed.status not in ("draft", "approved"):
        raise EditionError("cannot_reject", f"edition is {ed.status}")
    ed.status = "rejected"
    ed.rejected_at = _now()
    ed.audio_status = "none" if ed.audio_status == "requested" else ed.audio_status
    if note:
        ed.note = note
    await db.flush()
    return ed


async def set_audio(db: AsyncSession, ed: E, url: str | None, failed: bool = False) -> E:
    """The recording job reports back: a CDN address for the approved text, or a failure."""
    if ed.approved_at is None:
        raise EditionError("not_approved", "audio is only for an approved text")
    ed.audio_status = "failed" if failed else "ready"
    ed.audio_url = None if failed else url
    await db.flush()
    return ed


# ---------------------------------------------------------------- audio

def audio_script(content: dict, lang: str = "te") -> str:
    """The words a recording reads: each story's headline, then its body, then its source, in order.
    Nothing is added that is not on the page, so the audio says exactly what was approved."""
    parts = []
    for st in content.get("lead") or []:
        head, body, src = st.get(f"head_{lang}"), st.get(lang), st.get(f"source_{lang}")
        parts.append(". ".join(x.strip().rstrip(".") for x in (head, body) if x) + ".")
        if src:
            parts.append(("మూలం: " if lang == "te" else "Source: ") + src.strip().rstrip(".") + ".")
    return "\n\n".join(parts)


async def request_audio(ed: E) -> None:
    """Mark the approved text for recording. The recording itself (Google Cloud Text-to-Speech,
    Telugu Chirp 3 HD voice) runs as a separate job that reads requested rows and reports back
    through set_audio, so an API request never waits on it and a draft can never reach it."""
    if ed.approved_at is None:   # also refused by the database
        raise EditionError("not_approved", "audio is only for an approved text")
    ed.audio_status = "requested"
    ed.audio_requested_at = _now()
    log.info("edition %s of %s approved; audio requested (%d characters)", ed.id, ed.district, len(audio_script(ed.content)))


def public(ed: E) -> dict:
    """What a reader may see of an edition. Drafts never reach this function from a public route."""
    return {
        "district": ed.district, "number": ed.number,
        "published_at": ed.published_at.isoformat() if ed.published_at else None,
        "lead": ed.content.get("lead") or [], "none_reason_en": ed.content.get("none_reason_en"),
        "new_items": len(ed.new_item_ids or []),
        "audio_url": ed.audio_url if ed.audio_status == "ready" else None,
    }


def admin(ed: E) -> dict:
    return public(ed) | {
        "id": ed.id, "status": ed.status, "written_by": ed.written_by, "note": ed.note, "gate": ed.gate,
        "item_ids": ed.item_ids, "new_item_ids": ed.new_item_ids, "audio_status": ed.audio_status,
        "created_at": ed.created_at.isoformat() if ed.created_at else None,
        "approved_at": ed.approved_at.isoformat() if ed.approved_at else None,
        "rejected_at": ed.rejected_at.isoformat() if ed.rejected_at else None,
    }
