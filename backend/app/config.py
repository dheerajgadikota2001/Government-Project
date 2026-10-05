"""
Application configuration: reads from environment variables / .env file.
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

    # Maintainer key for community moderation endpoints (X-Admin-Key header)
    admin_key: str = ""

    # Alerts: Resend. The API key lives in Secret Manager and is injected as an
    # environment variable; it is never written to a file in this repo.
    #
    # `alert_from` defaults to Resend's sandbox sender, which needs no DNS setup
    # and delivers only to the address on the Resend account. Point it at a
    # verified domain (alerts@dheeco.com) once dheeco.com is verified in Resend.
    # With no key or no recipient the alerting layer stays inert and says so:
    # a monitoring feature that fails silently is worse than none.
    resend_api_key: str = ""
    alert_from: str = "AP FactCheck <onboarding@resend.dev>"
    alert_to: str = ""
    alert_site_url: str = "https://apfactcheck.dheeco.com"
    # Sent even when there is nothing wrong, so that silence is never ambiguous:
    # no email for three weeks should mean healthy, not a dead scheduler.
    alert_heartbeat_weekday: int = 0          # Monday


    # Scraper
    # What every government portal sees in its logs. It names the site so an
    # administrator can look us up, and nothing else: the old value carried
    # a contact address on a domain we never owned.
    scraper_user_agent: str = "APFactCheckBot/1.0 (+https://apfactcheck.dheeco.com; independent citizen project)"
    scraper_request_delay: float = 2.0
    scraper_timeout: int = 30

    # CORS
    allowed_origins: str = "http://localhost:3000,http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174,http://localhost:5175,http://127.0.0.1:5175,http://localhost:4173,http://127.0.0.1:4173"

    # Voice assistant
    voice_assistant_name: str = "Mitra"
    # Voice is OFF by default. As of 6 Sep 2026 nothing in the frontend calls
    # these endpoints (the button shows a "coming soon" toast), yet they were
    # public and every call billed Google Speech and Text-to-Speech to us. An
    # unused feature that can run up an invoice stays off until it is used.
    # When it is switched on, the caps below bound the worst case per request
    # and per minute. A per-day budget is deliberately not built yet: it needs
    # a table and a migration, and that is worth doing when the feature exists.
    voice_enabled: bool = False
    voice_max_text_chars: int = 300        # TTS bills per character
    voice_max_audio_bytes: int = 1_048_576 # STT bills per 15 s; 1 MB is ~30 s of webm
    voice_per_minute: int = 5              # on top of the global limit
    # The voice agent's brain (POST /voice/ask) bills Anthropic per request, so
    # it has its own off switch, separate from the Google speech endpoints: the
    # brain can be tried as text before any speech service is paid for.
    voice_agent_enabled: bool = False
    voice_agent_max_question_chars: int = 500

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
    """Cached settings instance. Reads one env file, once.

    Which file is chosen by APNN_ENV_FILE and defaults to .env. This exists
    because a laptop has two databases within reach, the local one for
    development and the production one through the Cloud SQL proxy, and on
    6 Sep 2026 they were both called `applatform` on the same port number, so a
    run meant for production quietly wrote to the laptop for weeks. Making the
    file an explicit choice is the difference between "which database?" being
    a question and being an accident.
    """
    import os
    return Settings(_env_file=os.environ.get("APNN_ENV_FILE", ".env"))


def database_target(url: str | None = None) -> str:
    """The database a run is about to touch, with the password removed.

    Printed at the top of every scraper run and schema check, because a log
    that does not say where the data went is a log that can lie by omission.
    """
    from urllib.parse import urlsplit
    p = urlsplit(url or get_settings().database_url)
    host = p.hostname or "(unix socket)"
    port = f":{p.port}" if p.port else ""
    where = p.path.lstrip("/") or "?"
    via = " via " + p.query if p.query else ""
    return f"{host}{port}/{where}{via}"


settings = get_settings()
