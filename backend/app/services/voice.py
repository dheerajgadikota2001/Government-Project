"""
Voice Assistant "Mitra" service.
Handles: STT transcription, intent parsing, data fetching, TTS response generation.
"""

import base64
from typing import Optional, Tuple
from google.cloud import speech, texttospeech

from app.config import settings
from app.utils.logger import logger


# Intent patterns — maps user queries to intents
INTENT_PATTERNS = {
    "project_status": [
        "project", "projects", "ప్రాజెక్ట్", "ప్రాజెక్టులు",
        "పని", "నిర్మాణం", "construction", "development",
    ],
    "tender_search": [
        "tender", "tenders", "టెండర్", "టెండర్లు",
        "contract", "bid", "బిడ్",
    ],
    "news": [
        "news", "latest", "వార్తలు", "వార్త", "today", "నేడు",
        "what happened", "ఏం జరిగింది",
    ],
    "investment": [
        "investment", "invest", "పెట్టుబడి", "mou", "company",
        "jobs", "ఉద్యోగాలు", "factory", "కర్మాగారం",
    ],
    "budget": [
        "budget", "బడ్జెట్", "expenditure", "ఖర్చు", "allocation",
        "funds", "నిధులు",
    ],
}


class VoiceService:
    def __init__(self):
        self._stt_client = None
        self._tts_client = None

    @property
    def stt_client(self):
        if self._stt_client is None:
            self._stt_client = speech.SpeechClient()
        return self._stt_client

    @property
    def tts_client(self):
        if self._tts_client is None:
            self._tts_client = texttospeech.TextToSpeechClient()
        return self._tts_client

    async def transcribe(
        self, audio_bytes: bytes, content_type: str, language: str = "te"
    ) -> str:
        """
        Transcribe audio to text using Google Speech-to-Text.
        Telugu BCP-47 code: te-IN
        English BCP-47 code: en-IN (Indian English accent model)
        """
        language_code = "te-IN" if language == "te" else "en-IN"

        # Map content types to Google encoding
        encoding_map = {
            "audio/wav": speech.RecognitionConfig.AudioEncoding.LINEAR16,
            "audio/webm": speech.RecognitionConfig.AudioEncoding.WEBM_OPUS,
            "audio/ogg": speech.RecognitionConfig.AudioEncoding.OGG_OPUS,
            "audio/mp4": speech.RecognitionConfig.AudioEncoding.MP3,
            "audio/mpeg": speech.RecognitionConfig.AudioEncoding.MP3,
        }
        encoding = encoding_map.get(content_type, speech.RecognitionConfig.AudioEncoding.LINEAR16)

        config = speech.RecognitionConfig(
            encoding=encoding,
            language_code=language_code,
            alternative_language_codes=["en-IN"],  # Fallback if Telugu fails
            enable_automatic_punctuation=True,
            model="latest_long",
        )
        audio = speech.RecognitionAudio(content=audio_bytes)

        try:
            response = self.stt_client.recognize(config=config, audio=audio)
            if response.results:
                return response.results[0].alternatives[0].transcript
        except Exception as e:
            logger.error(f"STT transcription failed: {e}")

        return ""

    def _parse_intent(self, text: str) -> str:
        """Simple keyword-based intent detection."""
        text_lower = text.lower()
        for intent, keywords in INTENT_PATTERNS.items():
            for kw in keywords:
                if kw.lower() in text_lower:
                    return intent
        return "general"

    async def _generate_audio(self, text: str, language: str) -> Optional[str]:
        """
        Convert text to speech and return base64-encoded MP3.
        Uses Google WaveNet voices for natural-sounding Telugu/English.
        """
        lang_code = "te-IN" if language == "te" else "en-IN"
        # WaveNet voices sound most natural
        voice_name = "te-IN-Standard-A" if language == "te" else "en-IN-Wavenet-A"

        synthesis_input = texttospeech.SynthesisInput(text=text)
        voice = texttospeech.VoiceSelectionParams(
            language_code=lang_code,
            name=voice_name,
        )
        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3,
            speaking_rate=0.9,   # Slightly slower — easier to understand
            pitch=0.0,
        )

        try:
            response = self.tts_client.synthesize_speech(
                input=synthesis_input, voice=voice, audio_config=audio_config
            )
            return base64.b64encode(response.audio_content).decode("utf-8")
        except Exception as e:
            logger.error(f"TTS synthesis failed: {e}")
            return None

    async def process_query(self, text: str, language: str, district: Optional[str]) -> dict:
        """
        Main voice query processing pipeline.
        Parse intent → fetch relevant data → generate text response → generate audio.
        """
        intent = self._parse_intent(text)
        response_text = await self._build_response(text, intent, language, district)
        audio_b64 = await self._generate_audio(response_text, language)

        return {
            "text_response": response_text,
            "audio_base64": audio_b64,
            "intent": intent,
            "data": None,
        }

    async def _build_response(
        self, query: str, intent: str, language: str, district: Optional[str]
    ) -> str:
        """
        Build a natural language response based on intent.
        Fetches live data from DB and formats it for voice delivery.
        """
        # These responses will be wired to real DB data in subsequent sprints.
        # Placeholder responses for initial testing:
        name = settings.voice_assistant_name

        if language == "te":
            responses = {
                "news": f"నేను తాజా ఆంధ్రప్రదేశ్ వార్తలను తెస్తున్నాను. దయచేసి వేచి ఉండండి.",
                "project_status": f"మీరు అడిగిన ప్రాజెక్ట్ సమాచారం కోసం వెతుకుతున్నాను.",
                "tender_search": f"ఆంధ్రప్రదేశ్ లో తాజా టెండర్లు తెస్తున్నాను.",
                "investment": f"ఆంధ్రప్రదేశ్ లో పెట్టుబడుల వివరాలు తెస్తున్నాను.",
                "budget": f"ఆంధ్రప్రదేశ్ బడ్జెట్ వివరాలు తెస్తున్నాను.",
                "general": f"నేను {name}ని. మీకు ఆంధ్రప్రదేశ్ ప్రభుత్వ పనుల గురించి సమాచారం ఇవ్వగలను. మీరు ఏమి తెలుసుకోవాలనుకుంటున్నారు?",
            }
        else:
            responses = {
                "news": "Fetching the latest news from Andhra Pradesh for you.",
                "project_status": "Searching for project information. Please wait.",
                "tender_search": "Looking up the latest government tenders in Andhra Pradesh.",
                "investment": "Fetching investment and MoU details for Andhra Pradesh.",
                "budget": "Retrieving Andhra Pradesh budget documents.",
                "general": f"I am {name}, your AP government information assistant. What would you like to know about?",
            }

        return responses.get(intent, responses["general"])

    async def get_greeting(self, language: str) -> Tuple[str, Optional[str]]:
        """Return the opening greeting text and audio."""
        name = settings.voice_assistant_name

        if language == "te":
            text = (
                f"నమస్కారం! నేను {name}ని. "
                f"నేను మీకు ఆంధ్రప్రదేశ్ ప్రభుత్వ పనులు, టెండర్లు, పెట్టుబడులు మరియు వార్తల గురించి "
                f"సమాచారం ఇవ్వగలను. మీరు ఏమి తెలుసుకోవాలనుకుంటున్నారు?"
            )
        else:
            text = (
                f"Hello! I am {name}, your Andhra Pradesh government information assistant. "
                f"I can help you with information about government projects, tenders, investments, "
                f"and the latest news. What would you like to know?"
            )

        audio_b64 = await self._generate_audio(text, language)
        return text, audio_b64
