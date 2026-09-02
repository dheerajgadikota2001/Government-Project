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

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt


# ── Final image ──────────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

# Runtime dependencies only
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder
COPY --from=builder /root/.local /root/.local

# Copy application code
COPY . .

# Make sure scripts in .local are usable
ENV PATH=/root/.local/bin:$PATH
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
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers ${WEB_CONCURRENCY:-1} --loop uvloop
