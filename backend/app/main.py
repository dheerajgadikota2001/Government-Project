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
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.middleware import CacheControlMiddleware
from app.database import init_db, close_db, engine
from app.services.cache import close_redis
from app.utils.logger import logger

# Import all routers
from app.routers import (
    community,
    contacts,
    meta,
    projects,
    project_register,
    school_education,
    state_facts,
    tenders,
    news,
    mous,
    documents,
    search,
    voice,
    finances,
    governments,
)


# Rate limiter. Lives in app.rate_limit so routers can tighten single endpoints.
from app.rate_limit import limiter  # noqa: E402


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application startup and shutdown lifecycle.
    Runs once when server starts / stops.
    """
    # Startup
    logger.info(f"Starting {settings.app_name} v{settings.app_version} [{settings.app_env}]")
    # The database check must never keep the API from coming up: on Cloud Run
    # a failed startup means the whole service stays down, whereas a running
    # API with /health reporting "degraded" pages the monitor and recovers on
    # its own once Postgres (or the Cloud SQL socket) is reachable again.
    try:
        await init_db()
    except Exception as exc:  # noqa: BLE001 — any DB failure is reported, not fatal
        logger.error(f"Database not reachable at startup ({type(exc).__name__}: {exc}); "
                     "serving anyway — /health will report degraded until it recovers.")
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
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Gzip compression — reduces bandwidth for large JSON responses
# Especially important for village users on slow mobile connections
app.add_middleware(GZipMiddleware, minimum_size=500)

# Cache-Control headers.
# Added last, so it is the OUTERMOST middleware and stamps the response after
# everything else has finished with it. It denies by default: every response
# leaves as no-store unless its path is on the allowlist in that module.
app.add_middleware(CacheControlMiddleware)

# Rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── Routers ─────────────────────────────────────────────────────────────────

API_V1 = "/api/v1"

# The register goes in FIRST, and the order matters. Both routers live under
# /projects, and projects.router declares GET /projects/{project_id} with an int
# path parameter. FastAPI matches in registration order, so with projects.router
# first, a request for /projects/register was matched against {project_id},
# failed to parse "register" as an int, and returned 422 — the endpoint was
# unreachable no matter what it contained. Specific paths before wildcards.
app.include_router(project_register.router, prefix=API_V1)
app.include_router(projects.router, prefix=API_V1)
app.include_router(tenders.router, prefix=API_V1)
app.include_router(news.router, prefix=API_V1)
app.include_router(mous.router, prefix=API_V1)
app.include_router(documents.router, prefix=API_V1)
app.include_router(search.router, prefix=API_V1)
app.include_router(voice.router, prefix=API_V1)
app.include_router(finances.router, prefix=API_V1)
app.include_router(governments.router, prefix=API_V1)
app.include_router(community.router, prefix=API_V1)
app.include_router(meta.router, prefix=API_V1)
app.include_router(school_education.router, prefix=API_V1)
app.include_router(state_facts.router, prefix=API_V1)
app.include_router(contacts.router, prefix=API_V1)

# ── Health & Info Endpoints ──────────────────────────────────────────────────

@app.get("/health", tags=["System"])
async def health_check():
    """
    Health check for Cloud Run, uptime monitors and load balancers.

    It reports the DATABASE too, on purpose: a container that is up but cannot
    reach Postgres serves no data, and an uptime alert that only pings the
    process would stay green through exactly the outage that matters. Returns
    503 when the database is unreachable so the monitor fires.
    """
    from sqlalchemy import text as _sql_text

    db_ok = True
    db_error = None
    try:
        async with engine.connect() as conn:
            await conn.execute(_sql_text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001 — any failure means "not serving"
        db_ok = False
        db_error = type(exc).__name__

    body = {
        "status": "healthy" if db_ok else "degraded",
        "db": "ok" if db_ok else "unreachable",
        "version": settings.app_version,
        "environment": settings.app_env,
    }
    if db_error:
        body["db_error"] = db_error
    return JSONResponse(status_code=200 if db_ok else 503, content=body)


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
