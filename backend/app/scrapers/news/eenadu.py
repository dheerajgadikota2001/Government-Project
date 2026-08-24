"""Eenadu (Telugu newspaper) news scraper."""
from app.scrapers.news.base_news import BaseNewsScraper
from app.models.news import NewsSource, NewsCategory


class EenaduScraper(BaseNewsScraper):
    PORTAL_NAME = "Eenadu"
    RSS_URL = "https://www.eenadu.net/rss/telugu-news.xml"
    NEWS_SOURCE = NewsSource.EENADU
    SOURCE_NAME = "Eenadu"
    DEFAULT_CATEGORY = NewsCategory.POLITICS
