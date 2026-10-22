"""
The voice agent's loop, driven end to end with a fake Claude and a fake record.

No request leaves the machine and no database is needed. The fake client replays
scripted responses and records what it was sent, so these tests pin the things
that matter on a live call:

  - a tool result reaches the model, and every figure in the answer came from it
  - all of one turn's tool results go back in ONE user message
  - the caller's language is steered by a system message after their words,
    never by editing the cached system prompt
  - "yes, tell me more" carries the previous exchange
  - a refusal or an API failure is spoken as an apology in the caller's language,
    never silence and never an English error on a Telugu call
"""

from __future__ import annotations

import json
import pathlib
from types import SimpleNamespace

import anthropic
import httpx
import pytest
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.main import app
from app.services.voice_agent import agent, tools
from app.services.voice_agent.prompt import system_prompt


# --------------------------------------------------------------------------
# Fakes
# --------------------------------------------------------------------------

def text_block(text):
    return SimpleNamespace(type="text", text=text)


def tool_block(name, tool_input, block_id="tu_1"):
    return SimpleNamespace(type="tool_use", name=name, input=tool_input, id=block_id)


def response(content, stop_reason="end_turn"):
    return SimpleNamespace(
        content=content, stop_reason=stop_reason, model="claude-opus-5-5", stop_details=None,
        usage=SimpleNamespace(input_tokens=100, output_tokens=40,
                              cache_read_input_tokens=0, cache_creation_input_tokens=0),
    )


class FakeMessages:
    def __init__(self, script):
        self.script = list(script)
        self.calls = []

    async def create(self, **kwargs):
        # Snapshot: the loop keeps appending to the same list after this call.
        self.calls.append({**kwargs, "messages": list(kwargs["messages"])})
        item = self.script.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


class FakeClient:
    def __init__(self, script):
        self.beta = SimpleNamespace(messages=FakeMessages(script))


POLAVARAM = {
    "items": [{
        "id": 1, "title": "Polavaram Irrigation Project", "status": "under_construction",
        "district": None, "estimated_cost_crore": 55548.0, "department": "Water Resources",
        "cover_image": None, "image_count": 0,
    }],
    "total": 1,
}


@pytest.fixture
def record():
    """A fake platform API: path -> JSON, and a log of what was asked."""
    asked = []
    pages = {
        "/projects/": POLAVARAM,
        "/contacts/": {
            "emergency": [{"name": "Emergency", "number": "112", "what_for": "police fire ambulance"}],
            "helplines": [{"name": "Pension helpline", "number": "1902", "what_for": "pension complaints"}],
            "escalations": [], "grievance_systems": [], "warning": None,
        },
    }

    async def fetch(path, params):
        asked.append((path, params))
        return pages.get(path, {"error": f"HTTP 404 from {path}"})

    tools.set_fetcher(fetch)
    yield asked
    tools.reset_fetcher()


@pytest.fixture
def install():
    def _install(script):
        fake = FakeClient(script)
        agent.set_client(fake)
        return fake.beta.messages
    yield _install
    agent.set_client(None)


# --------------------------------------------------------------------------
# The loop
# --------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_a_figure_reaches_the_answer_only_through_a_tool(record, install):
    msgs = install([
        response([tool_block("find_projects", {"query": "Polavaram", "district": "", "status": "",
                                               "tenure": "", "limit": 3})], "tool_use"),
        response([text_block("పోలవరం ప్రాజెక్టు అంచనా వ్యయం సుమారు 55 వేల 548 కోట్ల రూపాయలు. ఇంకా వివరంగా కావాలా?")]),
    ])

    reply = await agent.ask("పోలవరం ప్రాజెక్టు ఖర్చు ఎంత?")

    assert reply.tools_used == ["find_projects"]
    assert reply.language == "te"
    assert "55" in reply.answer
    assert record[0][0] == "/projects/" and record[0][1]["q"] == "Polavaram"

    # The second request carried the tool result, as one user message.
    second = msgs.calls[1]["messages"]
    results = second[-1]
    assert results["role"] == "user"
    assert len(results["content"]) == 1
    assert results["content"][0]["type"] == "tool_result"
    assert "55548" in results["content"][0]["content"]
    assert results["content"][0]["is_error"] is False


@pytest.mark.asyncio
async def test_parallel_tool_calls_return_in_one_message(record, install):
    msgs = install([
        response([
            tool_block("find_projects", {"query": "Polavaram", "district": "", "status": "", "tenure": "", "limit": 1}, "a"),
            tool_block("find_help", {"query": "pension"}, "b"),
        ], "tool_use"),
        response([text_block("ok")]),
    ])
    await agent.ask("two things")
    last = msgs.calls[1]["messages"][-1]
    assert [r["tool_use_id"] for r in last["content"]] == ["a", "b"]


@pytest.mark.asyncio
async def test_language_is_steered_after_the_question_not_in_the_cached_prompt(record, install):
    msgs = install([response([text_block("पोलावरम परियोजना की लागत...")])])

    await agent.ask("Polavaram ka kharcha kitna hai?", language="hi")

    call = msgs.calls[0]
    assert call["system"] == system_prompt()          # byte-identical prefix
    assert call["messages"][-1]["role"] == "system"   # steering comes last
    assert "Hindi" in call["messages"][-1]["content"]
    assert call["model"] == "claude-opus-5-5"
    assert call["output_config"] == {"effort": "low"}
    assert call["fallbacks"] == "default"


@pytest.mark.asyncio
async def test_yes_tell_me_more_carries_the_previous_exchange(record, install):
    msgs = install([
        response([text_block("పోలవరం గురించి చిన్న కథ. ఇంకా వివరంగా కావాలా?")]),
        response([text_block("సరే, వివరంగా చెబుతాను...")]),
    ])

    first = await agent.ask("పోలవరం గురించి చెప్పండి")
    await agent.ask("అవును", session_id=first.session_id)

    history = msgs.calls[1]["messages"]
    assert history[0] == {"role": "user", "content": "పోలవరం గురించి చెప్పండి"}
    assert history[1]["role"] == "assistant" and "ఇంకా వివరంగా" in history[1]["content"]
    assert history[2] == {"role": "user", "content": "అవును"}


@pytest.mark.asyncio
async def test_a_chosen_language_sticks_for_the_next_question(record, install):
    msgs = install([
        response([text_block("ज़रूर, हिंदी में बताता हूँ।")]),
        response([text_block("ठीक है।")]),
    ])
    first = await agent.ask("Hindi mein bataiye", language="hi")
    second = await agent.ask("aur batao", session_id=first.session_id)
    assert second.language == "hi"
    assert "Hindi" in msgs.calls[1]["messages"][-1]["content"]


@pytest.mark.asyncio
async def test_a_refusal_is_an_apology_in_the_callers_language(record, install):
    install([response([], "refusal")])
    reply = await agent.ask("ఏదో ప్రశ్న")
    assert reply.answer == agent.SORRY["te"]
    assert reply.stop_reason == "refusal"


@pytest.mark.asyncio
async def test_an_api_outage_is_an_apology_not_a_crash(record, install):
    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    install([anthropic.APIConnectionError(request=request)])
    reply = await agent.ask("question", language="hi")
    assert reply.answer == agent.SORRY["hi"]


@pytest.mark.asyncio
async def test_the_loop_stops_after_the_round_limit(record, install):
    looping = [response([tool_block("find_help", {"query": "x"})], "tool_use")
               for _ in range(agent.MAX_TOOL_ROUNDS + 1)]
    install(looping)
    reply = await agent.ask("loop")
    assert len(reply.tools_used) == agent.MAX_TOOL_ROUNDS + 1
    assert reply.answer == agent.SORRY["te"]   # no text came back, so no silence either


# --------------------------------------------------------------------------
# The tools
# --------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_an_unknown_tool_or_bad_arguments_is_an_error_result(record):
    out, is_error = await tools.run_tool("no_such_tool", {})
    assert is_error
    out, is_error = await tools.run_tool("find_help", {"wrong": 1})
    assert is_error and "bad arguments" in out


@pytest.mark.asyncio
async def test_a_missing_record_is_an_error_the_model_can_say_aloud(record):
    out, is_error = await tools.run_tool("project_detail", {"project_id": 999})
    assert is_error and "404" in out


def test_large_results_are_cut_with_a_note():
    out = tools._out({"x": "a" * (tools.MAX_CHARS * 2)})
    assert len(out) < tools.MAX_CHARS + 200
    assert out.endswith("more specific tool]")


def test_every_tool_is_strict_and_every_field_is_required():
    for t in tools.TOOL_DEFINITIONS:
        schema = t["input_schema"]
        assert t["strict"] is True
        assert schema["additionalProperties"] is False
        assert set(schema["required"]) == set(schema["properties"])
        assert t["name"] in tools.HANDLERS


def test_the_prompt_forbids_numbers_from_memory_and_party_judgements():
    p = system_prompt()
    assert "Never use a number from your own memory" in p
    assert "Never praise, blame or rate any party" in p
    assert settings.voice_assistant_name in p


def test_script_detection_picks_the_voice():
    assert agent.detect_language("పోలవరం") == "te"
    assert agent.detect_language("पोलावरम") == "hi"
    assert agent.detect_language("Polavaram") == "en"


# --------------------------------------------------------------------------
# The endpoint
# --------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_the_endpoint_is_off_until_switched_on(monkeypatch):
    monkeypatch.setattr(settings, "voice_agent_enabled", False)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.post("/api/v1/voice/ask", json={"text": "hello"})
    assert r.status_code == 503


@pytest.mark.asyncio
async def test_the_endpoint_answers_when_on(monkeypatch, record, install):
    monkeypatch.setattr(settings, "voice_agent_enabled", True)
    install([response([text_block("నమస్కారం! ఏం తెలుసుకోవాలనుకుంటున్నారు?")])])
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.post("/api/v1/voice/ask", json={"text": "నమస్కారం"})
    assert r.status_code == 200
    body = r.json()
    assert body["language"] == "te"
    assert body["session_id"]
    assert body["assistant_name"] == settings.voice_assistant_name


@pytest.mark.asyncio
async def test_the_endpoint_rejects_an_unsupported_language(monkeypatch):
    monkeypatch.setattr(settings, "voice_agent_enabled", True)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.post("/api/v1/voice/ask", json={"text": "hi", "language": "fr"})
    assert r.status_code == 422


def test_every_eval_case_is_well_formed():
    path = pathlib.Path(__file__).with_name("voice_agent_eval.json")
    cases = json.loads(path.read_text(encoding="utf-8"))["cases"]
    ids = {c["id"] for c in cases}
    assert len(ids) == len(cases) >= 30
    for c in cases:
        assert c["language"] in {"te", "hi", "en"}
        assert c["question"] and c["review"]
        assert all(t in tools.HANDLERS for t in c["expect_tools_any"])
        assert c.get("follow_up_of") in (None, *ids)
        assert agent.detect_language(c["question"]) in {"te", "hi", "en"}
