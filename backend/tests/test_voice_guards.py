"""
The voice endpoints are the only ones that bill Google per request. These pin
the guards that keep that bill bounded, without ever contacting Google.

Each test overrides settings on the live Settings object and restores it,
because the router reads `settings.voice_enabled` at request time.
"""

import io

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.main import app
from app.routers import voice as voice_router


class _FakeService:
    """Stands in for VoiceService so no test can reach Google by accident."""
    calls: list = []

    async def process_query(self, text, language, district):
        _FakeService.calls.append(("query", len(text)))
        return {"text_response": "ok", "audio_base64": None, "intent": "general", "data": None}

    async def transcribe(self, audio_bytes, content_type, language):
        _FakeService.calls.append(("transcribe", len(audio_bytes)))
        return "transcribed"

    async def get_greeting(self, language):
        _FakeService.calls.append(("greeting", language))
        return ("hello", None)


@pytest.fixture(autouse=True)
def _no_google(monkeypatch):
    monkeypatch.setattr(voice_router, "VoiceService", _FakeService)
    _FakeService.calls.clear()
    voice_router._GREETING_CACHE.clear()
    # Each test starts with a fresh limiter window; otherwise calls made by an
    # earlier test count against this one and the limit test becomes flaky.
    from app.rate_limit import limiter
    limiter.reset()
    yield


@pytest.fixture
def client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.fixture
def voice_on(monkeypatch):
    monkeypatch.setattr(settings, "voice_enabled", True)


# ------------------------------------------------------------- off by default

@pytest.mark.asyncio
async def test_voice_is_off_by_default_and_never_calls_google(client):
    assert settings.voice_enabled is False
    async with client as c:
        q = await c.post("/api/v1/voice/query", json={"text": "hello", "language": "en"})
        g = await c.get("/api/v1/voice/greeting?language=en")
        t = await c.post("/api/v1/voice/transcribe?language=en",
                         files={"audio": ("a.webm", io.BytesIO(b"x" * 10), "audio/webm")})
    assert q.status_code == 503 and q.json()["detail"] == "voice_not_available"
    assert g.status_code == 503
    assert t.status_code == 503
    assert _FakeService.calls == []


# ------------------------------------------------------------------- caps

@pytest.mark.asyncio
async def test_text_over_the_cap_is_rejected_before_any_call(client, voice_on):
    too_long = "x" * (settings.voice_max_text_chars + 1)
    async with client as c:
        r = await c.post("/api/v1/voice/query", json={"text": too_long, "language": "en"})
    assert r.status_code == 422
    assert _FakeService.calls == []


@pytest.mark.asyncio
async def test_text_at_the_cap_is_accepted(client, voice_on):
    async with client as c:
        r = await c.post("/api/v1/voice/query",
                         json={"text": "x" * settings.voice_max_text_chars, "language": "en"})
    assert r.status_code == 200
    assert _FakeService.calls == [("query", settings.voice_max_text_chars)]


@pytest.mark.asyncio
async def test_audio_over_the_cap_is_rejected_without_reading_it_all(client, voice_on):
    big = b"x" * (settings.voice_max_audio_bytes + 4096)
    async with client as c:
        r = await c.post("/api/v1/voice/transcribe?language=en",
                         files={"audio": ("a.webm", io.BytesIO(big), "audio/webm")})
    assert r.status_code == 413
    assert _FakeService.calls == []


@pytest.mark.asyncio
async def test_audio_under_the_cap_is_transcribed(client, voice_on):
    async with client as c:
        r = await c.post("/api/v1/voice/transcribe?language=en",
                         files={"audio": ("a.webm", io.BytesIO(b"x" * 2048), "audio/webm")})
    assert r.status_code == 200
    assert _FakeService.calls == [("transcribe", 2048)]


@pytest.mark.asyncio
async def test_unknown_audio_type_is_refused(client, voice_on):
    async with client as c:
        r = await c.post("/api/v1/voice/transcribe?language=en",
                         files={"audio": ("a.exe", io.BytesIO(b"MZ"), "application/octet-stream")})
    assert r.status_code == 400
    assert _FakeService.calls == []


# --------------------------------------------------------- greeting is cached

@pytest.mark.asyncio
async def test_greeting_is_synthesised_once_per_language(client, voice_on):
    async with client as c:
        for _ in range(3):
            r = await c.get("/api/v1/voice/greeting?language=en")
            assert r.status_code == 200
        await c.get("/api/v1/voice/greeting?language=te")
    assert _FakeService.calls == [("greeting", "en"), ("greeting", "te")]


# ------------------------------------------------------- per-minute limiter

@pytest.mark.asyncio
async def test_query_has_a_tighter_limit_than_the_rest_of_the_api(client, voice_on):
    # The global limit is 100/min. Voice must trip well before that.
    async with client as c:
        codes = []
        for _ in range(settings.voice_per_minute + 2):
            r = await c.post("/api/v1/voice/query", json={"text": "hi", "language": "en"})
            codes.append(r.status_code)
    assert codes[: settings.voice_per_minute] == [200] * settings.voice_per_minute
    assert 429 in codes[settings.voice_per_minute:]
