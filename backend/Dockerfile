# ============================================================
# Production Dockerfile
# Multi-stage build — keeps final image small
# ============================================================

FROM python:3.12-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies into a clean prefix that the final stage copies
# into /usr/local. (An earlier version used `pip install --user`, which put
# everything under /root/.local — unreadable by the non-root appuser the
# final image runs as, so uvicorn failed with "Permission denied" on Cloud Run.)
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt


# ── Final image ──────────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

# Runtime dependencies only
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder into the system prefix (world-readable)
COPY --from=builder /install /usr/local

# Copy application code
COPY . .

ENV PYTHONPATH=/app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Create non-root user for security
RUN useradd --create-home appuser && chown -R appuser:appuser /app
USER appuser

# Cloud Run injects PORT (8080 by default); we honour it, defaulting to 8000 locally.
ENV PORT=8080
EXPOSE 8080

# Health check — Render.com and GCP use this
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f "http://localhost:${PORT:-8000}/health" || exit 1

# Start FastAPI. Shell form so ${PORT} and ${WEB_CONCURRENCY} expand at runtime.
# Cloud Run gives 1 vCPU on the small tier and handles concurrency itself, so one
# worker is the right default there; raise WEB_CONCURRENCY on a bigger machine.
# --proxy-headers/--forwarded-allow-ips: Cloud Run terminates TLS and forwards
# plain HTTP with X-Forwarded-Proto; without these, redirects are built as
# http:// and some clients loop.
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers ${WEB_CONCURRENCY:-1} --loop uvloop --proxy-headers --forwarded-allow-ips="*"
