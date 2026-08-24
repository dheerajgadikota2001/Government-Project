"""Sakshi (Telugu newspaper) news scraper."""
from app.scrapers.news.base_news import BaseNewsScraper
from app.models.news import NewsSource, NewsCategory


class SakshiScraper(BaseNewsScraper):
    PORTAL_NAME = "Sakshi"
    RSS_URL = "https://www.sakshi.com/rss.xml"
    NEWS_SOURCE = NewsSource.SAKSHI
    SOURCE_NAME = "Sakshi"
    DEFAULT_CATEGORY = NewsCategory.POLITICS
