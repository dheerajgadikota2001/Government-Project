"""
The extractor: the model proposes, the guard pays, the verifier decides.

No test here calls the Claude API. The client is a fake that returns canned JSON and
counts its calls. What they pin down:
  - with the switch off, or the money gone, the fake is never called
  - the call is recorded in the ledger with the tokens the response reported
  - an indicator nobody asked for is dropped, not guessed at
  - a paper longer than the limit is offered in part and the result says so
  - the model's JSON may come inside a code fence or after a sentence
"""

from types import SimpleNamespace

import pytest

from app.config import settings
from app.services.ai_spend import BudgetRefused, GuardLimits, InMemoryLedger, SpendGuard
from app.services.fact_extractor import PaperText, Wanted, build_prompt, extract, parse_facts

PAGES = {
    1: "Cover page of the report.",
    2: "At the end of March 2024 the outstanding liabilities stood at Rs. 4,85,490 crore.",
}
WANTED = [Wanted("outstanding_liabilities", "Outstanding liabilities of the state")]
GOOD = ('{"facts": [{"indicator": "outstanding_liabilities", "value": "4,85,490", "unit": "Rs. crore", '
        '"period": "2023-24", "stage": "A", '
        '"quote": "the outstanding liabilities stood at Rs. 4,85,490 crore", "page": 2}]}')


class FakeClient:
    def __init__(self, text: str = GOOD, tokens=(1500, 200)):
        self.calls = 0
        self.text, self.tokens = text, tokens
        self.messages = self

    async def create(self, **kw):
        self.calls += 1
        self.last = kw
        return SimpleNamespace(
            content=[SimpleNamespace(type="text", text=self.text)],
            usage=SimpleNamespace(input_tokens=self.tokens[0], output_tokens=self.tokens[1]),
        )


def guard(**over) -> SpendGuard:
    lim = GuardLimits(**({"enabled": True, "monthly": 200.0, "daily": 15.0, "run": 5.0} | over))
    return SpendGuard(InMemoryLedger(), lim, run_id="r1")


def paper() -> PaperText:
    return PaperText(url="https://example.test/rbi.pdf", pages=PAGES, sha256="ab" * 32, title="RBI State Finances")


@pytest.mark.asyncio
async def test_a_good_reply_becomes_proposals_with_the_papers_link_and_the_cost_is_recorded():
    client, g = FakeClient(), guard()
    result = await extract(client, g, paper(), WANTED)
    assert client.calls == 1
    p = result.proposals[0]
    assert (p.indicator, p.value, p.page, p.source_url) == ("outstanding_liabilities", "4,85,490", 2, "https://example.test/rbi.pdf")
    assert p.paper_sha256 == "ab" * 32
    row = g.ledger.rows[0]
    assert (row["input_tokens"], row["output_tokens"], row["purpose"]) == (1500, 200, "fact_extract")
    assert result.cost_usd == pytest.approx(1500 * 1e-6 + 200 * 5e-6)


@pytest.mark.asyncio
async def test_switched_off_makes_no_call():
    client = FakeClient()
    with pytest.raises(BudgetRefused):
        await extract(client, guard(enabled=False), paper(), WANTED)
    assert client.calls == 0


@pytest.mark.asyncio
async def test_a_spent_ceiling_makes_no_call():
    client = FakeClient()
    with pytest.raises(BudgetRefused):
        await extract(client, guard(monthly=0.0001), paper(), WANTED)
    assert client.calls == 0


@pytest.mark.asyncio
async def test_an_indicator_nobody_asked_for_is_dropped():
    reply = GOOD.replace("outstanding_liabilities", "something_else")
    result = await extract(FakeClient(reply), guard(), paper(), WANTED)
    assert result.proposals == []


def test_the_models_json_may_sit_in_a_fence_or_after_words_and_junk_is_no_facts():
    assert len(parse_facts("Here you go:\n```json\n" + GOOD + "\n```")) == 1
    assert parse_facts("I could not find anything.") == []
    assert parse_facts("{broken json") == []
    assert parse_facts('{"facts": "nope"}') == []


def test_a_long_paper_is_offered_in_part_and_says_so(monkeypatch):
    long_pages = {n: "x" * 1000 for n in range(1, 11)}
    text, offered = build_prompt(PaperText("u", long_pages), WANTED, max_chars=3500)
    assert offered == 3
    assert "[page 1]" in text and "[page 3]" in text and "[page 4]" not in text


@pytest.mark.asyncio
async def test_partial_read_is_reported(monkeypatch):
    monkeypatch.setattr(settings, "ai_extract_max_chars", 60)
    result = await extract(FakeClient(), guard(), paper(), WANTED)
    assert result.partial and result.pages_offered == 1 and result.pages_total == 2


@pytest.mark.asyncio
async def test_the_rules_go_in_as_the_system_prompt_and_the_page_markers_in_the_message():
    client = FakeClient()
    await extract(client, guard(), paper(), WANTED)
    assert "Never add, subtract" in client.last["system"]
    msg = client.last["messages"][0]["content"]
    assert "[page 2]" in msg and "outstanding_liabilities" in msg
