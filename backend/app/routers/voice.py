"""
Voice assistant endpoints ("Mitra"): speech to text, intent, text to speech.

COST, STATED PLAINLY
Every call here can bill Google. /transcribe sends audio to Speech-to-Text,
charged per 15 seconds. /query and /greeting send text to Text-to-Speech,
charged per character. Nothing else on this platform costs money per request,
so this router carries guards the others do not:

  1. An off switch, off by default. Nothing in the frontend uses these yet.
  2. A cap on text length and audio size, checked before Google is contacted.
  3. A tighter per-minute limit than the rest of the API.
  4. The greeting, which never changes, is synthesised once per language and
     then served from memory.

A per-day budget is the missing fourth guard. It needs a shared counter (a
table) to hold across Cloud Run instances, and it is deliberately deferred to
the day the voice UI is actually built.
"""

from fastapi import APIRouter, File, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel, Field
from typing import Optional, Tuple

from app.config import settings
from app.rate_limit import limiter
from app.services.voice import VoiceService

router = APIRouter(prefix="/voice", tags=["Voice Assistant"])

ALLOWED_AUDIO = {"audio/wav", "audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg"}


def _require_enabled() -> None:
    if not settings.voice_enabled:
        # 503, not 404: the route exists, the feature is switched off. A client
        # can show "not available yet" instead of "broken".
        raise HTTPException(status_code=503, detail="voice_not_available")


class VoiceQueryRequest(BaseModel):
    """Text-based voice query (after client-side STT)."""
    # max_length is enforced by Pydantic before the handler runs, so an
    # oversized body is a 422 and Google is never contacted.
    text: str = Field(min_length=1, max_length=settings.voice_max_text_chars)
    language: str = Field("te", pattern="^(te|en)$")
    district: Optional[str] = Field(None, max_length=100)


class VoiceResponse(BaseModel):
    text_response: str
    audio_base64: Optional[str]
    intent: str
    data: Optional[dict] = None


@router.post("/query", response_model=VoiceResponse)
@limiter.limit(f"{settings.voice_per_minute}/minute")
async def voice_query(request: Request, payload: VoiceQueryRequest):
    """Text in, spoken answer out. Capped and rate limited, see module docstring."""
    _require_enabled()
    service = VoiceService()
    return await service.process_query(
        text=payload.text, language=payload.language, district=payload.district,
    )


@router.post("/transcribe")
@limiter.limit(f"{settings.voice_per_minute}/minute")
async def transcribe_audio(
    request: Request,
    audio: UploadFile = File(...),
    language: str = Query("te", pattern="^(te|en)$"),
):
    """Audio in, text out. Size is checked while reading, not after."""
    _require_enabled()
    if audio.content_type not in ALLOWED_AUDIO:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio format: {audio.content_type}. Use WAV, WebM, OGG, or MP4.",
        )

    # Read one byte past the cap. If we get it, the upload is too big, and we
    # stop without buffering the rest of a file someone chose to make huge.
    limit = settings.voice_max_audio_bytes
    audio_bytes = await audio.read(limit + 1)
    if len(audio_bytes) > limit:
        raise HTTPException(status_code=413, detail=f"Audio too large. Max {limit // 1024} KB.")

    service = VoiceService()
    transcription = await service.transcribe(audio_bytes, audio.content_type, language)
    return {"transcription": transcription, "language": language, "detected_language": language}


class AskRequest(BaseModel):
    """One spoken question, already turned into text by the app or the browser."""
    text: str = Field(min_length=1, max_length=settings.voice_agent_max_question_chars)
    # Omit to keep the session's language (Telugu for a new session).
    language: Optional[str] = Field(None, pattern="^(te|hi|en)$")
    # Omit on the first question; send back the one returned so "yes, more"
    # follows on from the last answer.
    session_id: Optional[str] = Field(None, max_length=64, pattern="^[A-Za-z0-9_-]+$")


class AskResponse(BaseModel):
    answer: str
    language: str
    session_id: str
    assistant_name: str


@router.post("/ask", response_model=AskResponse)
@limiter.limit(f"{settings.voice_per_minute}/minute")
async def ask_agent(request: Request, payload: AskRequest):
    """The voice agent's brain: a question in Telugu, Hindi or English in, a short
    spoken-style answer out, every figure read from this platform's own record."""
    if not settings.voice_agent_enabled:
        raise HTTPException(status_code=503, detail="voice_agent_not_available")
    from app.services.voice_agent import ask

    reply = await ask(payload.text, session_id=payload.session_id, language=payload.language)
    return AskResponse(answer=reply.answer, language=reply.language,
                       session_id=reply.session_id, assistant_name=settings.voice_assistant_name)


# The greeting is the same words every time. Synthesising it on every open
# was a paid call for a constant; one per language per process is the ceiling.
_GREETING_CACHE: dict[str, Tuple[str, Optional[str]]] = {}


@router.get("/greeting")
async def get_greeting(language: str = Query("te", pattern="^(te|en)$")):
    """Mitra's opening line, text and audio."""
    _require_enabled()
    if language not in _GREETING_CACHE:
        service = VoiceService()
        _GREETING_CACHE[language] = await service.get_greeting(language)
    text, audio_b64 = _GREETING_CACHE[language]
    return {"text": text, "audio_base64": audio_b64, "assistant_name": settings.voice_assistant_name}
