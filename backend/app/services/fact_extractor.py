"""
The extractor: Claude reads a paper's text and PROPOSES figures. It decides nothing.

HOW IT FITS (decision D-2026-11-10, approach A)
    scraper stores the paper  ->  extractor proposes  ->  verifier checks the quote
    and figure against the stored text  ->  a person approves  ->  (later) a chart.

WHAT THE MODEL IS ASKED, AND NOT ASKED
It is asked to copy: a figure as printed, the sentence or table row that prints it,
and the page. It is told never to add, subtract, round or convert, and to return
nothing when the paper does not print the figure. None of that is trusted. The
verifier rejects any proposal whose quote is not in the paper, is on another page,
or carries a number the quote does not print. The rules in the prompt only make
good proposals more likely; the checks make bad ones impossible to approve.

MONEY
Every call goes through the spend guard first and is written to the ledger after.
With AI_ASSIST_ENABLED false this module makes no call at all. A paper longer than
ai_extract_max_chars is offered in its first pages only and the result says so, so a
partial read is never taken for a whole one.

NO NETWORK IN TESTS
The client is passed in. Tests give it a fake that returns canned JSON; the real
`anthropic.AsyncAnthropic` is built only by `client_from_settings`, and only when a
key is configured.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any, Mapping, Optional

from app.config import settings
from app.services.ai_spend import SpendGuard, usage_from_response
from app.services.fact_verifier import Proposal

RULES = """You read pages of one official Andhra Pradesh government paper and report figures it prints.
Follow every rule.
1. Report only a figure the text prints. Never add, subtract, divide, round, convert units or estimate.
2. Copy the quote exactly as printed: one sentence or one table row, long enough to hold the figure and its label.
3. Give the page number from the [page N] marker the quote sits under.
4. Use only the indicator keys you are given. If the paper does not print a figure for a key, leave that key out.
5. Give the value as printed (for example 9,74,556), the unit as printed, the period as printed (for example 2024-25),
   and the stage only if the paper names one (actual, revised estimate or budget estimate); otherwise leave it empty.
6. Reply with JSON only, in this shape:
   {"facts": [{"indicator": "", "value": "", "unit": "", "period": "", "stage": "", "quote": "", "page": 0}]}
"""


@dataclass
class PaperText:
    url: str
    pages: Mapping[int, str]
    sha256: Optional[str] = None
    title: str = ""


@dataclass
class Wanted:
    key: str
    label: str


@dataclass
class ExtractResult:
    proposals: list[Proposal] = field(default_factory=list)
    pages_offered: int = 0
    pages_total: int = 0
    cost_usd: float = 0.0

    @property
    def partial(self) -> bool:
        return self.pages_offered < self.pages_total


def client_from_settings() -> Any:
    import anthropic
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set")
    return anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)


def build_prompt(paper: PaperText, wanted: list[Wanted], max_chars: int) -> tuple[str, int]:
    """The user message and how many pages fit. Pages go in order; the first that would overflow stops it."""
    head = f"Paper: {paper.title or paper.url}\nIndicator keys wanted:\n"
    head += "\n".join(f"- {w.key}: {w.label}" for w in wanted) + "\n\n"
    body, used = [], 0
    for n in sorted(paper.pages):
        text = (paper.pages[n] or "").strip()
        chunk = f"[page {n}]\n{text}\n\n"
        if used and used + len(chunk) > max_chars:
            break
        body.append(chunk)
        used += len(chunk)
    return head + "".join(body), len(body)


def parse_facts(text: str) -> list[dict]:
    """The model's JSON, tolerating a code fence or words around it. Anything unreadable is no facts."""
    m = re.search(r"\{[\s\S]*\}", text or "")
    if not m:
        return []
    try:
        data = json.loads(m.group(0))
    except json.JSONDecodeError:
        return []
    facts = data.get("facts") if isinstance(data, dict) else None
    return [f for f in facts or [] if isinstance(f, dict)]


def _page(v: Any) -> Optional[int]:
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


async def extract(client: Any, guard: SpendGuard, paper: PaperText, wanted: list[Wanted], *,
                  model: Optional[str] = None, max_tokens: Optional[int] = None) -> ExtractResult:
    """One call. Raises BudgetRefused (from the guard) before any money is spent."""
    model = model or settings.ai_extract_model
    max_tokens = max_tokens or settings.ai_extract_max_tokens
    prompt, offered = build_prompt(paper, wanted, settings.ai_extract_max_chars)
    await guard.check(model, len(RULES) + len(prompt), max_tokens)

    resp = await client.messages.create(
        model=model, max_tokens=max_tokens, system=RULES,
        messages=[{"role": "user", "content": prompt}],
    )
    tokens_in, tokens_out = usage_from_response(resp)
    cost = await guard.record("fact_extract", model, tokens_in, tokens_out)

    text = "".join(getattr(b, "text", "") for b in resp.content if getattr(b, "type", "") == "text")
    keys = {w.key for w in wanted}
    proposals = []
    for f in parse_facts(text):
        if str(f.get("indicator", "")).strip() not in keys:
            continue          # an indicator nobody asked for is dropped, not guessed at
        proposals.append(Proposal(
            indicator=str(f.get("indicator", "")), value=str(f.get("value", "")), unit=str(f.get("unit", "") or ""),
            period=str(f.get("period", "")), stage=str(f.get("stage", "") or ""), quote=str(f.get("quote", "")),
            page=_page(f.get("page")), source_url=paper.url, paper_sha256=paper.sha256,
        ))
    return ExtractResult(proposals, offered, len(paper.pages), cost)


async def process_paper(db: Any, client: Any, guard: SpendGuard, paper: PaperText, wanted: list[Wanted],
                        run_id: Optional[str] = None) -> dict[str, Any]:
    """Extract, then put every proposal through the queue. Returns the counts the run log and digest use."""
    from app.services import fact_queue

    result = await extract(client, guard, paper, wanted)
    model = settings.ai_extract_model
    verified = rejected = 0
    for p in result.proposals:
        row = await fact_queue.submit(db, p, paper.pages, run_id=run_id, model=model)
        verified += row.status == "verified"
        rejected += row.status == "rejected"
    return {"proposed": len(result.proposals), "verified": verified, "rejected": rejected,
            "partial": result.partial, "pages_offered": result.pages_offered,
            "pages_total": result.pages_total, "cost_usd": result.cost_usd}
