"""
Base news scraper — handles RSS feeds and HTML scraping for AP news portals.
All news scrapers extend this.
"""

from datetime import datetime, timezone
from typing import Optional
import feedparser

from app.scrapers.base import BaseScraper
from app.database import get_db_context
from app.models.news import NewsArticle, NewsCategory, NewsSource
from app.services.summarization import SummarizationService
from app.utils.logger import logger


class BaseNewsScraper(BaseScraper):
    """
    News scrapers typically use RSS feeds when available (faster, cleaner).
    Falls back to HTML scraping when no RSS exists.
    """

    RSS_URL: str = ""
    NEWS_SOURCE: NewsSource = NewsSource.OTHER
    SOURCE_NAME: str = ""
    DEFAULT_CATEGORY: NewsCategory = NewsCategory.OTHER

    async def scrape(self) -> int:
        """Scrape latest articles from RSS feed."""
        self.log_start()
        total = 0

        try:
            articles = await self._fetch_rss()
            if articles:
                total = await self._save_articles(articles)
        except Exception as e:
            self.log_error("News scrape failed", e)
        finally:
            await self.close()

        self.log_done(total)
        return total

    async def _fetch_rss(self) -> list[dict]:
        """Parse RSS feed and return list of article dicts."""
        if not self.RSS_URL:
            return []

        try:
            response = await self.fetch(self.RSS_URL)
            feed = feedparser.parse(response.text)

            articles = []
            for entry in feed.entries:
                article = {
                    "headline": entry.get("title", "").strip(),
                    "source_url": entry.get("link", ""),
                    "published_at": self._parse_rss_date(entry.get("published")),
                    "image_url": self._extract_image(entry),
                    "full_text": entry.get("summary", "") or entry.get("content", [{}])[0].get("value", ""),
                    "source": self.NEWS_SOURCE,
                    "source_name": self.SOURCE_NAME,
                    "category": self.DEFAULT_CATEGORY,
                }
                if article["headline"] and article["source_url"]:
                    articles.append(article)

            return articles

        except Exception as e:
            logger.warning(f"[{self.PORTAL_NAME}] RSS fetch failed: {e}")
            return []

    def _parse_rss_date(self, date_str: Optional[str]) -> Optional[datetime]:
        if not date_str:
            return None
        try:
            import email.utils
            return datetime(*email.utils.parsedate(date_str)[:6], tzinfo=timezone.utc)
        except Exception:
            return None

    def _extract_image(self, entry) -> Optional[str]:
        """Try to extract image URL from RSS entry."""
        # Try media:content tag
        media = entry.get("media_content", [])
        if media and isinstance(media, list):
            return media[0].get("url")
        # Try enclosure
        enclosures = entry.get("enclosures", [])
        if enclosures and "image" in enclosures[0].get("type", ""):
            return enclosures[0].get("href")
        return None

    async def _save_articles(self, articles: list[dict]) -> int:
        """Save new articles to DB. Deduplicates by source_url. Triggers AI summarization."""
        saved = 0
        summarizer = SummarizationService()

        async with get_db_context() as db:
            from sqlalchemy import select
            for a in articles:
                try:
                    # Dedup check
                    existing = await db.execute(
                        select(NewsArticle).where(NewsArticle.source_url == a["source_url"])
                    )
                    if existing.scalar_one_or_none():
                        continue  # Already have this article

                    # AI summarization (in-line for now; move to async task at scale)
                    summary_en, summary_te = await summarizer.summarize_news(
                        article_text=a.get("full_text", ""),
                        headline=a.get("headline", ""),
                        source=a.get("source_name", ""),
                    )

                    article = NewsArticle(
                        headline=a["headline"],
                        summary=summary_en,
                        summary_telugu=summary_te,
                        full_text=a.get("full_text"),
                        category=a.get("category", NewsCategory.OTHER),
                        source=a["source"],
                        source_name=a["source_name"],
                        source_url=a["source_url"],
                        image_url=a.get("image_url"),
                        published_at=a.get("published_at"),
                        is_summarized=bool(summary_en),
                        is_translated=bool(summary_te),
                    )
                    db.add(article)
                    saved += 1

                except Exception as e:
                    logger.warning(f"[{self.PORTAL_NAME}] Failed to save article: {e}")

        return saved
