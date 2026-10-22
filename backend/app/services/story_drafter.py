"""
Drafting district paper stories from newly gathered official items, step 1.

WHAT HAPPENS EACH RUN, PER DISTRICT
1. Pick the gathered items (district_happenings) that no published edition and no open
   draft has used yet, newest first, never a personal list (merit or selection lists
   are linked by the paper, never written up).
2. A drafter writes one story per item.
3. The editorial gate (app/services/editorial_gate.py) checks every story: the quote is
   in the item's text, every number is the item's own, no party or politician names,
   no dashes. A story that fails goes back to the drafter once, with the gate's exact
   complaints. If it fails again it is dropped and the run says so.
4. The stories that pass are saved as a DRAFT edition. Nothing is shown to readers:
   a person approves and publishes it (app/services/editions.py).

TWO DRAFTERS
- StandInDrafter, the default: free, deterministic, and makes nothing up. It restates
  each item's title as printed, with its source and date. Its drafts are plain, but
  they exercise the whole path (gate, draft, approval) at no cost, and they are honest.
- ClaudeDrafter: writes the stories in plain English and Telugu with the Claude API.
  Used only when STORY_MODEL_ENABLED is true, because every run costs money. Tests
  drive it with a fake client; no test makes a paid call.
"""

from __future__ import annotations

import datetime as dt
import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Optional, Protocol

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.district_edition import DistrictEdition as E
from app.models.district_happening import DistrictHappening as H
from app.services import editions, editorial_gate

log = logging.getLogger(__name__)

WINDOW_DAYS = 30
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
MONTHS_TE = ["జనవరి", "ఫిబ్రవరి", "మార్చి", "ఏప్రిల్", "మే", "జూన్", "జూలై", "ఆగస్టు", "సెప్టెంబర్", "అక్టోబర్", "నవంబర్", "డిసెంబర్"]
SOURCE = {
    "lok_sabha": ("Lok Sabha answer", "లోక్‌సభ జవాబు", "Parliament", "పార్లమెంట్"),
    "pib": ("Press Information Bureau release", "పీఐబీ ప్రకటన", "Centre", "కేంద్రం"),
    "district_site": ("District collectorate notice", "జిల్లా కలెక్టరేట్ నోటీసు", "Collectorate", "కలెక్టరేట్"),
}


def day_en(d: str) -> str:
    y, m, dd = d.split("-")
    return f"{int(dd)} {MONTHS[int(m) - 1]} {y}"


def day_te(d: str) -> str:
    y, m, dd = d.split("-")
    return f"{int(dd)} {MONTHS_TE[int(m) - 1]} {y}"


class Drafter(Protocol):
    name: str
    can_retry: bool

    async def draft(self, district: str, items: list[dict], feedback: Optional[dict[str, list[str]]] = None) -> list[dict]: ...


# ---------------------------------------------------------------- the free stand-in

class StandInDrafter:
    """One story per item, built only from the item's own title, source and date."""

    name = "stand-in drafter (titles as printed)"
    can_retry = False

    async def draft(self, district: str, items: list[dict], feedback: Optional[dict[str, list[str]]] = None) -> list[dict]:
        out = []
        for it in items:
            src_en, src_te, kick_en, kick_te = SOURCE.get(it["source_kind"], SOURCE["district_site"])
            printed = re.sub(r"\s+", " ", it["title"]).strip()
            # The paper's house style has no dashes; a title's dash becomes a comma in the story's own
            # lines. The quote stays the title exactly as printed, which is what the gate matches.
            title = re.sub(r"\s*(?:\u2014|\u2013|--)\s*", ", ", printed).strip(", ")
            d = it["date"]
            out.append({
                "id": f"item-{it['id']}",
                "kicker_en": kick_en, "kicker_te": kick_te,
                "head_en": title if len(title) <= 90 else title[:87].rsplit(" ", 1)[0] + "...",
                "head_te": title if len(title) <= 90 else title[:87].rsplit(" ", 1)[0] + "...",
                "en": f"The {src_en.lower()} of {day_en(d)} for {district} is titled: “{title}”. The full text is at the source.",
                "te": f"{district} జిల్లాకు {day_te(d)}న వచ్చిన {src_te} శీర్షిక: “{title}”. పూర్తి వివరాలు మూలంలో ఉన్నాయి.",
                "date": d,
                "source_en": f"{src_en}, {day_en(d)}", "source_te": f"{src_te}, {day_te(d)}",
                "url": it["url"], "quote": printed,
            })
        return out


# ---------------------------------------------------------------- the Claude API

RULES = """You write short stories for a district paper in Andhra Pradesh, from official items only.
Each story is for a reader in a village: plain words, short sentences, English and Telugu.

Hard rules. A story that breaks one is thrown away.
- Use only facts in the item you are given. Never add a fact, a reason or a consequence the item does not state.
- Every number you write must appear in the item's title, its text or its date, written the same way. Never add, subtract, total, average or compare numbers.
- "quote" must be copied exactly, word for word, from the item's title or text: the sentence your story rests on.
- No political party names. No names of ministers, MPs, MLAs or the Chief Minister; name the department or ministry instead.
- Never use an em dash, an en dash or a double hyphen.
- The Telugu is written fresh in everyday Telugu, not translated word by word. Keep numbers as digits.
- A headline is plain and under 90 characters. "mean_en"/"mean_te" says in one line what it means for a resident, only if the item itself makes that clear; otherwise leave them out.

Answer with JSON only: {"stories": [{"id", "kicker_en", "kicker_te", "head_en", "head_te", "en", "te", "mean_en", "mean_te", "date", "source_en", "source_te", "url", "quote"}]}
Use the item's own url and date (YYYY-MM-DD). id is "item-" followed by the item's id."""


def _items_for_prompt(items: list[dict]) -> str:
    keep = ("id", "source_kind", "category", "title", "summary", "date", "url")
    return json.dumps([{k: it.get(k) for k in keep} for it in items], ensure_ascii=False)


def parse_stories(text: str) -> list[dict]:
    """The model's JSON, tolerating a code fence or words around it. Anything unreadable is no stories."""
    m = re.search(r"\{[\s\S]*\}", text or "")
    if not m:
        return []
    try:
        data = json.loads(m.group(0))
    except json.JSONDecodeError:
        return []
    stories = data.get("stories") if isinstance(data, dict) else None
    return [s for s in stories or [] if isinstance(s, dict)]


class ClaudeDrafter:
    can_retry = True

    def __init__(self, client: Any = None, model: Optional[str] = None):
        self.model = model or settings.story_model
        self.name = f"Claude API ({self.model})"
        self._client = client

    def client(self) -> Any:
        if self._client is None:
            import anthropic
            if not settings.anthropic_api_key:
                raise RuntimeError("ANTHROPIC_API_KEY is not set")
            self._client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        return self._client

    async def draft(self, district: str, items: list[dict], feedback: Optional[dict[str, list[str]]] = None) -> list[dict]:
        msg = f"District: {district}\nItems:\n{_items_for_prompt(items)}"
        if feedback:
            msg += "\n\nYour earlier stories for these items failed the checks below. Write them again, fixing exactly these:\n"
            msg += "\n".join(f"- {sid}: {'; '.join(errs)}" for sid, errs in feedback.items())
        resp = await self.client().messages.create(
            model=self.model, max_tokens=4000, system=RULES,
            messages=[{"role": "user", "content": msg}],
        )
        text = "".join(getattr(b, "text", "") for b in resp.content if getattr(b, "type", "") == "text")
        return parse_stories(text)


def drafter_from_settings() -> Drafter:
    return ClaudeDrafter() if settings.story_model_enabled else StandInDrafter()


# ---------------------------------------------------------------- one district's run

@dataclass
class RunReport:
    district: str
    items_offered: int = 0
    stories_kept: int = 0
    retried: list[str] = field(default_factory=list)
    dropped: dict[str, list[str]] = field(default_factory=dict)
    edition_id: Optional[int] = None
    skipped: Optional[str] = None

    def line(self) -> str:
        if self.skipped:
            return f"{self.district}: {self.skipped}"
        return (f"{self.district}: {self.items_offered} new items, {self.stories_kept} stories kept"
                f"{f', {len(self.retried)} retried' if self.retried else ''}"
                f"{f', {len(self.dropped)} dropped' if self.dropped else ''}"
                f"{f', draft {self.edition_id}' if self.edition_id else ''}")


async def new_items(db: AsyncSession, district: str, limit: int, today: Optional[dt.date] = None) -> list[dict]:
    """Items no published edition and no open draft has used yet, newest first."""
    open_rows = (await db.execute(select(E.item_ids).where(E.district == district, E.status.in_(("draft", "approved", "published"))))).scalars().all()
    used = {int(i) for ids in open_rows for i in (ids or [])}
    since = (today or dt.date.today()) - dt.timedelta(days=WINDOW_DAYS)
    rows = (await db.execute(
        select(H).where(H.district == district, H.date >= since, H.personal_list.is_(False))
        .order_by(H.date.desc(), H.id.desc()).limit(limit + len(used))
    )).scalars().all()
    out = [{"id": r.id, "source_kind": r.source_kind, "category": r.category, "title": r.title, "summary": r.summary,
            "date": r.date.isoformat(), "url": r.url} for r in rows if r.id not in used]
    return out[:limit]


def _gate_each(stories: list[dict], by_url: dict[str, list[dict]]) -> tuple[list[dict], dict[str, list[str]]]:
    good, bad, seen = [], {}, set()
    for st in stories:
        sid = str(st.get("id") or f"story-{len(good) + len(bad)}")
        if sid in seen:
            continue
        seen.add(sid)
        r = editorial_gate.check_story(st, by_url.get(st.get("url") or "", []))
        if r.ok and not r.needs_person:
            good.append(st)
        else:
            bad[sid] = r.errors + r.needs_person
    return good, bad


async def draft_district(db: AsyncSession, district: str, drafter: Drafter, max_items: Optional[int] = None,
                         today: Optional[dt.date] = None, save: bool = True) -> RunReport:
    rep = RunReport(district)
    items = await new_items(db, district, max_items or settings.story_max_items, today)
    rep.items_offered = len(items)
    if not items:
        rep.skipped = "nothing new"
        return rep
    by_url: dict[str, list[dict]] = {}
    for it in items:
        by_url.setdefault(it["url"], []).append(it)

    good, bad = _gate_each(await drafter.draft(district, items), by_url)
    if bad and drafter.can_retry:
        rep.retried = sorted(bad)
        again_items = [it for it in items if f"item-{it['id']}" in bad] or items
        good2, bad = _gate_each(await drafter.draft(district, again_items, feedback=bad), by_url)
        have = {s["id"] for s in good}
        good += [s for s in good2 if s.get("id") not in have]
    rep.dropped = bad
    rep.stories_kept = len(good)
    if not good:
        rep.skipped = f"no story passed the gate ({len(bad)} dropped)"
        return rep
    if not save:
        return rep
    note = rep.line() + (("\nDropped: " + "; ".join(f"{k}: {v[0]}" for k, v in bad.items())) if bad else "")
    ed = await editions.create_draft(db, district, {"district": district, "lead": good}, drafter.name, note=note[:2000])
    rep.edition_id = ed.id
    return rep
