"""
AP Politics Platform — FastAPI Application Entry Point
Aggregates Andhra Pradesh government data: projects, tenders, MoUs, news, documents.
Serves 1 lakh+ concurrent users with Redis caching, async DB, and multilingual support.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.config import settings
from app.database import init_db, close_db
from app.services.cache import close_redis
from app.utils.logger import logger

# Import all routers
from app.routers import (
    projects,
    tenders,
    news,
    mous,
    documents,
    search,
    voice,
)


# Rate limiter — prevents abuse (100 requests/minute per IP by default)
limiter = Limiter(key_func=get_remote_address, default_limits=[f"{settings.rate_limit_per_minute}/minute"])


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application startup and shutdown lifecycle.
    Runs once when server starts / stops.
    """
    # Startup
    logger.info(f"Starting {settings.app_name} v{settings.app_version} [{settings.app_env}]")
    await init_db()
    logger.info("Application ready.")

    yield  # Application runs here

    # Shutdown
    logger.info("Shutting down...")
    await close_db()
    await close_redis()
    logger.info("Shutdown complete.")


# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "Public API for AP Politics Platform — aggregates Andhra Pradesh government data "
        "including projects, tenders, MoUs, investments, news, and official documents. "
        "Supports English and Telugu (తెలుగు)."
    ),
    docs_url="/docs" if not settings.is_production else None,   # Disable Swagger in prod
    redoc_url="/redoc" if not settings.is_production else None,
    lifespan=lifespan,
)

# ── Middleware ──────────────────────────────────────────────────────────────

# CORS — allow frontend and mobile apps to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=False,   # No auth cookies (public platform)
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Gzip compression — reduces bandwidth for large JSON responses
# Especially important for village users on slow mobile connections
app.add_middleware(GZipMiddleware, minimum_size=500)

# Rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── Routers ─────────────────────────────────────────────────────────────────

API_V1 = "/api/v1"

app.include_router(projects.router, prefix=API_V1)
app.include_router(tenders.router, prefix=API_V1)
app.include_router(news.router, prefix=API_V1)
app.include_router(mous.router, prefix=API_V1)
app.include_router(documents.router, prefix=API_V1)
app.include_router(search.router, prefix=API_V1)
app.include_router(voice.router, prefix=API_V1)

# ── Health & Info Endpoints ──────────────────────────────────────────────────

@app.get("/health", tags=["System"])
async def health_check():
    """Health check endpoint — used by Render.com, GCP, load balancers."""
    return {
        "status": "healthy",
        "version": settings.app_version,
        "environment": settings.app_env,
    }


@app.get("/", tags=["System"])
async def root():
    """API root — quick info for developers."""
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "docs": "/docs",
        "health": "/health",
        "api": f"{API_V1}/",
        "supported_languages": ["en", "te"],
        "voice_assistant": settings.voice_assistant_name,
    }


# ── Global Error Handlers ────────────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception on {request.url}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Our team has been notified."},
    )
