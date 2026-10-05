"""
The conversation loop: one spoken question in, one spoken answer out.

MODEL AND SETTINGS
claude-opus-5-5 at effort "low". A caller is waiting on a phone; most questions
need one or two lookups and a short story, which low effort handles. Raise it per
request (`effort=`) for the "more detail" turn if evaluation shows it helps.
Thinking is always on for this model; it is not configured here.

Server-side refusal fallback is enabled ("fallbacks": "default"). If the model's
safety classifier declines a request, the API re-runs it on a fallback model in
the same call rather than leaving the caller with silence.

CACHING
The tool definitions and the system prompt are identical on every request, so
they form a cached prefix. Per-request steering (the caller's chosen language)
goes in a mid-conversation system message AFTER the user's words, so it never
breaks that prefix.

MEMORY BETWEEN TURNS
Only the plain text of each finished exchange is kept (see sessions.py). That is
what makes "yes, tell me more" work. Tool results and thinking from earlier turns
are not replayed: each new turn re-reads the record through the tools, so a
figure is never repeated from a stale copy.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any, Optional

import anthropic

from app.config import settings
from app.services.voice_agent import sessions
from app.services.voice_agent.prompt import system_prompt
from app.services.voice_agent.tools import TOOL_DEFINITIONS, run_tool
from app.utils.logger import logger

MODEL = "claude-opus-5-5"
FALLBACK_BETA = "server-side-fallback-2026-07-01"
MAX_TOOL_ROUNDS = 6
MAX_TOKENS = 8000

LANGUAGE_NOTES = {
    "te": "Default to Telugu, in Telugu script. If the caller speaks Hindi or English, or asks for another language, follow them.",
    "hi": "The caller has chosen Hindi. Answer in Hindi, in Devanagari script, until they ask otherwise.",
    "en": "The caller has chosen English. Answer in simple spoken English.",
}

# Said when the model cannot answer at all. Kept in each language so a caller
# never hears silence or an English error on a Telugu call.
SORRY = {
    "te": "క్షమించండి, ఇప్పుడు సమాధానం చెప్పలేకపోతున్నాను. కొద్దిసేపటి తర్వాత మళ్ళీ అడగండి.",
    "hi": "माफ़ कीजिए, अभी जवाब नहीं दे पा रहा हूँ। थोड़ी देर बाद फिर से पूछिए।",
    "en": "Sorry, I cannot answer that right now. Please ask again in a little while.",
}

_client: Optional[anthropic.AsyncAnthropic] = None


def client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        # Empty key falls through to the SDK's own credential resolution.
        _client = anthropic.AsyncAnthropic(
            api_key=settings.anthropic_api_key or None, timeout=45.0, max_retries=1,
        )
    return _client


def set_client(fake: Any) -> None:
    """Tests swap in a fake client so no request leaves the machine."""
    global _client
    _client = fake


@dataclass
class AgentReply:
    answer: str
    language: str
    session_id: str
    tools_used: list[str] = field(default_factory=list)
    stop_reason: Optional[str] = None
    model: Optional[str] = None
    usage: dict = field(default_factory=dict)


def detect_language(text: str, default: str = "te") -> str:
    """Which script the answer is in, so the app picks the right voice."""
    if re.search(r"[ఀ-౿]", text):
        return "te"
    if re.search(r"[ऀ-ॿ]", text):
        return "hi"
    if re.search(r"[A-Za-z]", text):
        return "en"
    return default


def _text_of(content: list[Any]) -> str:
    return " ".join(b.text for b in content if getattr(b, "type", None) == "text").strip()


def _usage(response: Any) -> dict:
    u = getattr(response, "usage", None)
    if u is None:
        return {}
    return {k: getattr(u, k, None) for k in (
        "input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens")}


async def ask(text: str, session_id: Optional[str] = None, language: Optional[str] = None,
              effort: str = "low") -> AgentReply:
    """Answer one question in the context of the caller's session."""
    session_id, history, remembered_language = await sessions.load(session_id)
    language = language or remembered_language or "te"

    messages: list[dict] = [*history, {"role": "user", "content": text}]
    # Steering after the user's words keeps the cached prefix intact.
    messages.append({"role": "system", "content": LANGUAGE_NOTES.get(language, LANGUAGE_NOTES["te"])})

    tools_used: list[str] = []
    totals: dict = {}
    response = None

    for _round in range(MAX_TOOL_ROUNDS + 1):
        try:
            response = await client().beta.messages.create(
                model=MODEL,
                max_tokens=MAX_TOKENS,
                system=system_prompt(),
                tools=TOOL_DEFINITIONS,
                messages=messages,
                output_config={"effort": effort},
                cache_control={"type": "ephemeral"},
                betas=[FALLBACK_BETA],
                fallbacks="default",
            )
        except anthropic.APIStatusError as exc:
            logger.error(f"[voice-agent] API error {exc.status_code}: {exc.message}")
            return AgentReply(SORRY.get(language, SORRY["te"]), language, session_id, tools_used, "api_error")
        except anthropic.APIConnectionError as exc:
            logger.error(f"[voice-agent] connection error: {exc}")
            return AgentReply(SORRY.get(language, SORRY["te"]), language, session_id, tools_used, "connection_error")

        for k, v in _usage(response).items():
            if v is not None:
                totals[k] = totals.get(k, 0) + v

        if response.stop_reason == "refusal":
            logger.warning(f"[voice-agent] refusal after fallbacks: {getattr(response, 'stop_details', None)}")
            return AgentReply(SORRY.get(language, SORRY["te"]), language, session_id, tools_used,
                              "refusal", getattr(response, "model", None), totals)

        if response.stop_reason != "tool_use":
            break

        # Append the whole assistant turn unchanged (thinking blocks included):
        # this turn's history stays append-only.
        messages.append({"role": "assistant", "content": response.content})
        results = []
        for block in response.content:
            if getattr(block, "type", None) != "tool_use":
                continue
            tools_used.append(block.name)
            output, is_error = await run_tool(block.name, block.input)
            results.append({"type": "tool_result", "tool_use_id": block.id,
                            "content": output, "is_error": is_error})
        # All results of one turn go back in a single user message.
        messages.append({"role": "user", "content": results})
    else:
        logger.warning("[voice-agent] tool round limit reached")

    answer = _text_of(response.content) if response is not None else ""
    if not answer:
        answer = SORRY.get(language, SORRY["te"])

    spoken_language = detect_language(answer, language)
    # A caller who asked for Hindi keeps Hindi on the next turn without asking again.
    await sessions.save(session_id, text, answer, spoken_language)

    logger.info(
        f"[voice-agent] session={session_id} tools={tools_used} stop={response.stop_reason if response else None} "
        f"usage={json.dumps(totals)}"
    )
    return AgentReply(answer, spoken_language, session_id, tools_used,
                      getattr(response, "stop_reason", None), getattr(response, "model", None), totals)
