"""
Application configuration — reads from environment variables / .env file.
All settings in one place, strongly typed via Pydantic.
"""

from functools import lru_cache
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # App
    app_env: str = "development"
    app_name: str = "AP Politics Platform"
    app_version: str = "1.0.0"
    debug: bool = False
    secret_key: str = "change-this-in-production"

    # Database
    database_url: str = "postgresql+asyncpg://postgres:password@localhost:5432/applatform"
    database_pool_size: int = 20
    database_max_overflow: int = 10

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Google Cloud
    google_application_credentials: str = ""
    google_cloud_project: str = ""
    gcs_bucket_name: str = "ap-platform-documents"

    # Anthropic / Claude
    anthropic_api_key: str = ""

    # Firebase
    firebase_credentials_path: str = ""

    # Elasticsearch
    elasticsearch_url: str = "http://localhost:9200"
    elasticsearch_index_prefix: str = "applatform"

    # Celery
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"

    # Rate limiting
    rate_limit_per_minute: int = 100

    # Scraper
    scraper_user_agent: str = "APPoliticsPlatform/1.0 (Public Data Aggregator)"
    scraper_request_delay: float = 2.0
    scraper_timeout: int = 30

    # CORS
    allowed_origins: str = "http://localhost:3000"

    # Voice assistant
    voice_assistant_name: str = "Mitra"

    @property
    def allowed_origins_list(self) -> List[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def elasticsearch_projects_index(self) -> str:
        return f"{self.elasticsearch_index_prefix}_projects"

    @property
    def elasticsearch_tenders_index(self) -> str:
        return f"{self.elasticsearch_index_prefix}_tenders"

    @property
    def elasticsearch_news_index(self) -> str:
        return f"{self.elasticsearch_index_prefix}_news"


@lru_cache()
def get_settings() -> Settings:
    """Cached settings instance — only reads .env once."""
    return Settings()


settings = get_settings()
