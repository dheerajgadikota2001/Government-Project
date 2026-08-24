"""
Database setup — async SQLAlchemy with connection pooling.
Designed for high concurrency (1 lakh users).
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import settings
from app.utils.logger import logger


# Create async engine with connection pool tuned for scale
engine = create_async_engine(
    settings.database_url,
    pool_size=settings.database_pool_size,         # base pool size
    max_overflow=settings.database_max_overflow,    # extra connections under load
    pool_pre_ping=True,                             # verify connection health before use
    pool_recycle=3600,                              # recycle connections every 1 hour
    echo=settings.debug,                            # log SQL in dev only
)

# Session factory
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,  # don't expire objects after commit (safer for async)
    autocommit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency — yields a DB session per request,
    auto-commits on success, rolls back on error.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


@asynccontextmanager
async def get_db_context() -> AsyncGenerator[AsyncSession, None]:
    """
    Context manager version for use outside of FastAPI route handlers
    (e.g., Celery tasks, scrapers).
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db():
    """Create all tables on startup (if they don't exist)."""
    async with engine.begin() as conn:
        from app.models import Base as ModelsBase  # noqa: import triggers model registration
        await conn.run_sync(ModelsBase.metadata.create_all)
    logger.info("Database tables verified/created.")


async def close_db():
    """Dispose engine on shutdown."""
    await engine.dispose()
    logger.info("Database connections closed.")
