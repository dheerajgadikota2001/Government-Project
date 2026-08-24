"""
AI Summarization service — uses Claude API to generate crisp 3-5 sentence
summaries of news articles in both English and Telugu.
"""

from typing import Optional, Tuple
import anthropic

from app.config import settings
from app.utils.logger import logger


class SummarizationService:
    def __init__(self):
        self._client: Optional[anthropic.AsyncAnthropic] = None

    @property
    def client(self) -> anthropic.AsyncAnthropic:
        if self._client is None:
            self._client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        return self._client

    async def summarize_news(
        self, article_text: str, headline: str, source: str
    ) -> Tuple[Optional[str], Optional[str]]:
        """
        Generate crisp English + Telugu summaries of a news article.
        Returns: (english_summary, telugu_summary)
        Designed for village readers — simple language, key facts only.
        """
        if not article_text or len(article_text.strip()) < 100:
            return None, None

        prompt = f"""You are summarizing Andhra Pradesh news for citizens of AP, including people in villages.

Article from {source}:
Headline: {headline}

Full text:
{article_text[:4000]}

Please provide:
1. An English summary (3-5 sentences, plain language, key facts only — who, what, where, how much money involved, impact on common people)
2. A Telugu summary of the same (same style, simple Telugu words that village people will understand, avoid complex Sanskrit words)

Format your response exactly like this:
ENGLISH:
[English summary here]

TELUGU:
[Telugu summary here]"""

        try:
            message = await self.client.messages.create(
                model="claude-haiku-4-5",  # Fast and cheap for summarization
                max_tokens=500,
                messages=[{"role": "user", "content": prompt}],
            )

            response_text = message.content[0].text
            english_summary = None
            telugu_summary = None

            # Parse the response
            if "ENGLISH:" in response_text and "TELUGU:" in response_text:
                parts = response_text.split("TELUGU:")
                english_part = parts[0].replace("ENGLISH:", "").strip()
                telugu_part = parts[1].strip() if len(parts) > 1 else None
                english_summary = english_part
                telugu_summary = telugu_part

            return english_summary, telugu_summary

        except Exception as e:
            logger.error(f"Summarization failed for article '{headline[:50]}': {e}")
            return None, None

    async def summarize_document(self, document_text: str, document_type: str) -> Optional[str]:
        """
        Generate a plain English summary of a government document (budget, GO, report).
        Useful for showing users what a complex document says in simple terms.
        """
        if not document_text or len(document_text.strip()) < 200:
            return None

        prompt = f"""You are explaining a government document to ordinary citizens of Andhra Pradesh.

Document type: {document_type}
Document content:
{document_text[:5000]}

Summarize the key points in 4-6 bullet points using simple, clear language. Focus on:
- What decisions were made
- How much money is involved (if any)
- Who benefits from this
- What will happen next / timelines

Keep it factual. No opinions."""

        try:
            message = await self.client.messages.create(
                model="claude-haiku-4-5",
                max_tokens=400,
                messages=[{"role": "user", "content": prompt}],
            )
            return message.content[0].text
        except Exception as e:
            logger.error(f"Document summarization failed: {e}")
            return None
