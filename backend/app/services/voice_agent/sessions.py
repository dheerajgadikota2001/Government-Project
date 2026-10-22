"""
Short conversation memory, so "yes, tell me more" knows what "more" is about.

Written to Redis when it is configured AND to the in-process store; read from
whichever has it. (`cache_get`/`cache_set` are Redis-only and silently do
nothing without it, which is why the in-process copy is written explicitly.)

Cloud Run may serve consecutive requests from different instances, so production
needs Redis for follow-ups to land; without it each instance remembers only its
own callers.

WHAT IS KEPT, AND FOR HOW LONG
Only the text of the last few exchanges and the caller's chosen language,
for 30 minutes after the last question. No audio, no phone number, no name.
"""

from __future__ import annotations

import secrets
from typing import Optional

from app.services.cache import cache_get, cache_set, local_get, local_set

TTL_SECONDS = 30 * 60
MAX_EXCHANGES = 4


def _key(session_id: str) -> str:
    return f"voice:session:{session_id}"


def new_session_id() -> str:
    return secrets.token_urlsafe(12)


async def load(session_id: Optional[str]) -> tuple[str, list[dict], Optional[str]]:
    if not session_id:
        return new_session_id(), [], None
    data = await _read(session_id)
    return session_id, data.get("history", []), data.get("language")


async def _read(session_id: str) -> dict:
    return await cache_get(_key(session_id)) or local_get(_key(session_id)) or {}


async def save(session_id: str, question: str, answer: str, language: str) -> None:
    data = await _read(session_id)
    history = data.get("history", [])
    history += [{"role": "user", "content": question}, {"role": "assistant", "content": answer}]
    history = history[-2 * MAX_EXCHANGES:]
    value = {"history": history, "language": language}
    await cache_set(_key(session_id), value, ttl=TTL_SECONDS)
    local_set(_key(session_id), value, TTL_SECONDS)
