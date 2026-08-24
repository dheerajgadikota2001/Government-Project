"""Centralized logging with loguru — structured, colored, easy to read."""

import sys
from loguru import logger
from app.config import settings

# Remove default handler
logger.remove()

# Console output
logger.add(
    sys.stdout,
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> — <level>{message}</level>",
    level="DEBUG" if settings.debug else "INFO",
    colorize=True,
)

# File output (production)
if settings.is_production:
    logger.add(
        "logs/app.log",
        rotation="100 MB",
        retention="30 days",
        compression="gz",
        level="INFO",
        format="{time} | {level} | {name}:{function}:{line} — {message}",
    )
    logger.add(
        "logs/errors.log",
        rotation="50 MB",
        retention="60 days",
        compression="gz",
        level="ERROR",
    )

__all__ = ["logger"]
