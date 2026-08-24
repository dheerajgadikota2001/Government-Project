"""
Translation service — English ↔ Telugu using Google Cloud Translation API.
Includes batching, caching, and fallback handling.
"""

from typing import Optional
from google.cloud import translate_v2 as translate

from app.config import settings
from app.services.cache import cache_get, cache_set
from app.utils.logger import logger


class TranslationService:
    def __init__(self):
        self._client: Optional[translate.Client] = None

    @property
    def client(self) -> translate.Client:
        if self._client is None:
            self._client = translate.Client()
        return self._client

    async def translate_to_telugu(self, text: str) -> Optional[str]:
        """
        Translate English text to Telugu.
        Results are cached in Redis for 24 hours to avoid repeat API calls.
        """
        if not text or not text.strip():
            return None

        # Check cache first
        import hashlib
        cache_key = f"applatform:translate:te:{hashlib.md5(text.encode()).hexdigest()}"
        cached = await cache_get(cache_key)
        if cached:
            return cached

        try:
            result = self.client.translate(text, target_language="te", source_language="en")
            translated = result["translatedText"]

            # Cache for 24 hours
            await cache_set(cache_key, translated, ttl=86400)
            return translated

        except Exception as e:
            logger.error(f"Translation failed: {e}")
            return None

    async def translate_to_english(self, text: str) -> Optional[str]:
        """Translate Telugu text to English."""
        if not text or not text.strip():
            return None

        import hashlib
        cache_key = f"applatform:translate:en:{hashlib.md5(text.encode()).hexdigest()}"
        cached = await cache_get(cache_key)
        if cached:
            return cached

        try:
            result = self.client.translate(text, target_language="en", source_language="te")
            translated = result["translatedText"]
            await cache_set(cache_key, translated, ttl=86400)
            return translated
        except Exception as e:
            logger.error(f"Translation to English failed: {e}")
            return None

    async def translate_fields(self, data: dict, fields: list[str]) -> dict:
        """
        Translate multiple fields of a dict to Telugu.
        Returns a new dict with _telugu suffix fields added.

        Usage:
            translated = await service.translate_fields(
                {"title": "Polavaram Dam Project", "description": "..."},
                fields=["title", "description"]
            )
            # Returns: {"title_telugu": "...", "description_telugu": "..."}
        """
        result = {}
        for field in fields:
            if field in data and data[field]:
                telugu = await self.translate_to_telugu(str(data[field]))
                result[f"{field}_telugu"] = telugu
        return result

    async def detect_language(self, text: str) -> str:
        """Detect the language of input text. Returns ISO code (te, en, etc.)"""
        try:
            result = self.client.detect_language(text)
            return result["language"]
        except Exception:
            return "en"  # Default to English
