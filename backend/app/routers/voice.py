"""
Voice Assistant API — "Mitra" voice processing endpoints.
Handles STT (speech to text), intent parsing, and TTS (text to speech) responses.
"""

import base64
from fastapi import APIRouter, HTTPException, UploadFile, File, Query
from pydantic import BaseModel
from typing import Optional

from app.config import settings
from app.services.voice import VoiceService

router = APIRouter(prefix="/voice", tags=["Voice Assistant"])


class VoiceQueryRequest(BaseModel):
    """Text-based voice query (after client-side STT)."""
    text: str
    language: str = "te"   # te=Telugu, en=English
    district: Optional[str] = None


class VoiceResponse(BaseModel):
    text_response: str               # Response text (in requested language)
    audio_base64: Optional[str]      # Base64 encoded MP3 audio
    intent: str                      # What we understood: project_status, news, tender_search etc.
    data: Optional[dict] = None      # Supporting data returned


@router.post("/query", response_model=VoiceResponse)
async def voice_query(request: VoiceQueryRequest):
    """
    Process a text voice query and return text + audio response.
    Client sends transcribed text → we parse intent → fetch data → generate spoken response.
    """
    service = VoiceService()
    return await service.process_query(
        text=request.text,
        language=request.language,
        district=request.district,
    )


@router.post("/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(...),
    language: str = Query("te", pattern="^(te|en)$"),
):
    """
    Transcribe uploaded audio file to text.
    Client records audio → uploads here → gets back transcribed text.
    Then call /voice/query with the transcribed text.
    Supports WAV, WEBM, OGG formats.
    """
    if audio.content_type not in ["audio/wav", "audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg"]:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio format: {audio.content_type}. Use WAV, WebM, OGG, or MP4."
        )

    audio_bytes = await audio.read()
    if len(audio_bytes) > 10 * 1024 * 1024:  # 10MB limit
        raise HTTPException(status_code=413, detail="Audio file too large. Max 10MB.")

    service = VoiceService()
    transcription = await service.transcribe(audio_bytes, audio.content_type, language)

    return {
        "transcription": transcription,
        "language": language,
        "detected_language": language,  # Could add auto-detection later
    }


@router.get("/greeting")
async def get_greeting(language: str = Query("te", pattern="^(te|en)$")):
    """
    Get Mitra's welcome greeting audio.
    Called when user first opens the voice assistant.
    """
    service = VoiceService()
    greeting_text, audio_b64 = await service.get_greeting(language)
    return {
        "text": greeting_text,
        "audio_base64": audio_b64,
        "assistant_name": settings.voice_assistant_name,
    }
