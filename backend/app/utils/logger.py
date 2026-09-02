"""Centralized logging with loguru — structured, colored, easy to read.

Every line that reaches the console is ALSO written to backend/logs/app.log,
timestamped, rotated at 5 MB with the last 5 files kept — nothing exists only
in the terminal. Standard-library loggers (uvicorn's startup and access lines,
FastAPI, SQLAlchemy warnings, …) are intercepted into the same pipeline, so
the API server's output lands in the file too.
"""

import inspect
import logging
import sys
from pathlib import Path

from loguru import logger

from app.config import settings

# backend/logs/ — anchored to this file so it works no matter which
# directory a script is launched from.
LOG_DIR = Path(__file__).resolve().parents[2] / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

# Remove default handler
logger.remove()

# Console output (unchanged)
logger.add(
    sys.stdout,
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> — <level>{message}</level>",
    level="DEBUG" if settings.debug else "INFO",
    colorize=True,
)

# File output — always on (was production-only). Mirrors the console:
# same level, same lines, plus timestamps. Rotates at 5 MB; keeps the
# 5 most recent files (app.log + rotated ones), so it never grows forever.
logger.add(
    LOG_DIR / "app.log",
    rotation="5 MB",
    retention=5,
    encoding="utf-8",
    level="DEBUG" if settings.debug else "INFO",
    format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} — {message}",
)

# Production keeps a separate long-retention error trail on top of app.log
if settings.is_production:
    logger.add(
        LOG_DIR / "errors.log",
        rotation="50 MB",
        retention="60 days",
        compression="gz",
        encoding="utf-8",
        level="ERROR",
        format="{time} | {level} | {name}:{function}:{line} — {message}",
    )


class InterceptHandler(logging.Handler):
    """Route standard-library log records into loguru (console + file)."""

    def emit(self, record: logging.LogRecord) -> None:
        try:
            level = logger.level(record.levelname).name
        except ValueError:
            level = record.levelno

        # Walk back to the frame that actually issued the log call, so
        # {name}:{function}:{line} shows the real origin, not logging internals.
        frame, depth = inspect.currentframe(), 0
        while frame and (depth == 0 or frame.f_code.co_filename == logging.__file__):
            frame = frame.f_back
            depth += 1

        logger.opt(depth=depth, exception=record.exc_info).log(level, record.getMessage())


# Root stdlib logger: WARNING keeps third-party libraries (httpx, asyncio, …)
# exactly as quiet as they were before — no new console lines appear.
logging.basicConfig(handlers=[InterceptHandler()], level=logging.WARNING, force=True)

# Uvicorn's loggers keep their own INFO level but now flow through loguru,
# so "Application startup complete" and every access line reach app.log.
#
# "sqlalchemy.engine.Engine" is included because SQLAlchemy's echo=True
# (on when DEBUG=true) attaches its own plain stdout handler when that
# logger has none — which would print every SQL line twice (its handler +
# the root intercept) and keep the plain copy out of the file. Owning the
# logger here means each SQL line appears exactly once, on console and in
# app.log alike.
for _name in ("uvicorn", "uvicorn.error", "uvicorn.access", "sqlalchemy.engine.Engine"):
    _lg = logging.getLogger(_name)
    _lg.handlers = [InterceptHandler()]
    _lg.propagate = False

__all__ = ["logger"]
