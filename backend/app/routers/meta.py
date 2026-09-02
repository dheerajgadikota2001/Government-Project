"""
The data-version stamp — the platform's cache escape hatch.

THE PROBLEM THIS SOLVES
Firebase Hosting has no purge button for dynamic content. Once a response is
cached at the edge with `s-maxage=300`, it is served for five minutes and there
is no supported way to revoke it early.

For most sites that is a shrug. For this one it is a real problem: the entire
promise is that the figure on the page is the government's real figure, and the
moment we correct one, the old number should stop being served — not in five
minutes, now.

HOW IT WORKS
The frontend asks this endpoint for a short stamp and appends it to every data
request as `?v=<stamp>`. Caches key on the full URL including the query string,
so changing the stamp changes every cache key at once: the old cached responses
still exist, but nothing asks for them again. That is a global purge in the only
currency a CDN understands.

The stamp is derived from the seed files themselves, so it changes automatically
whenever `load_seed_data.py` is run — nobody has to remember to bump anything.
It also folds in the app version, so a deploy that changes how a figure is
computed busts the cache too.

This endpoint must never be cached itself, which the cache middleware enforces
by matching "/meta/version" in its never-cache list.
"""

import hashlib
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.data_update import DataUpdate

router = APIRouter(prefix="/meta", tags=["System"])

SEED_DIR = Path(__file__).resolve().parent.parent.parent / "seed"


def compute_data_version() -> str:
    """A short stamp that changes whenever the seed data or the app version does.

    Built from each seed file's name, size and modification time rather than its
    contents: hashing tens of megabytes on every call would be its own problem,
    and size-plus-mtime moves whenever a seed is genuinely rewritten. If the seed
    directory is missing entirely we still return a stable stamp rather than
    failing — a missing stamp would silently disable cache-busting, which is a
    worse failure than a coarse one.
    """
    hasher = hashlib.sha256()
    hasher.update(settings.app_version.encode("utf-8"))

    try:
        for path in sorted(SEED_DIR.glob("*.json")):
            stat = path.stat()
            hasher.update(path.name.encode("utf-8"))
            hasher.update(str(stat.st_size).encode("utf-8"))
            hasher.update(str(stat.st_mtime_ns).encode("utf-8"))
    except OSError:
        # Seed directory unreadable in this environment; the app version alone
        # still gives a stamp that changes on deploy.
        hasher.update(b"seed-dir-unreadable")

    return hasher.hexdigest()[:12]


# Computed once at import. A running container's seed files do not change
# underneath it — a seed reload is followed by a restart — and recomputing on
# every request would put a directory stat in the hot path of every page load.
_CACHED_VERSION = compute_data_version()


@router.get("/version")
async def data_version():
    """Return the current data stamp. Never cached.

    The frontend calls this once on load and appends the value to its data
    requests. If this call fails the frontend simply omits the stamp: pages still
    work, they are just subject to the normal timers.
    """
    return {
        "version": _CACHED_VERSION,
        "app_version": settings.app_version,
        "environment": settings.app_env,
    }


# ============================================================
#  What changed, and when — the public refresh log
# ============================================================
#
# A reader who notices a figure move is entitled to ask what changed and where
# it came from. Until this endpoint existed the answer lived in a log file on
# whoever ran the scrapers, which in production is a container that no longer
# exists. `data_updates` holds the record; this serves it.
#
# Deliberately public and unauthenticated: an audit trail nobody can read is
# not an audit trail. The rows carry no personal data, and error text is stored
# first-line-only precisely so it can be shown.

MANUAL_SOURCES: tuple[dict[str, str], ...] = (
    {
        "source": "MoSPI flash report archive",
        "reason": "Older monthly editions are PDFs behind a browser check; each one is downloaded and imported by hand.",
    },
    {
        "source": "AP Socio-Economic Survey volumes",
        "reason": "Published as large annexure PDFs once a year; the irrigation register is transcribed from them by hand.",
    },
    {
        "source": "AP Budget volumes (in-year)",
        "reason": "The budget scraper collects the documents; the figures inside them are read and entered deliberately, not parsed.",
    },
)


@router.get("/updates")
async def data_updates(
    days: int = Query(60, ge=1, le=365, description="How far back to look"),
    limit: int = Query(40, ge=1, le=200, description="Maximum runs to return"),
    db: AsyncSession = Depends(get_db),
):
    """Recent refresh runs, newest first, grouped into one entry per run.

    Grouping happens here rather than in the client because a run is the unit a
    reader thinks in ("the site updated this morning"), while the table stores
    one row per source — six rows for one event.
    """
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = (
        await db.execute(
            select(DataUpdate)
            .where(DataUpdate.started_at >= since)
            .order_by(DataUpdate.started_at.desc(), DataUpdate.id.desc())
        )
    ).scalars().all()

    runs: list[dict] = []
    by_run: dict[str, dict] = {}
    for row in rows:
        run = by_run.get(row.run_id)
        if run is None:
            run = {
                "run_id": row.run_id,
                "started_at": row.started_at,
                "finished_at": row.finished_at,
                "trigger": row.trigger.value,
                "records_new": 0,
                "sources_ok": 0,
                "sources_failed": 0,
                "sources": [],
            }
            by_run[row.run_id] = run
            runs.append(run)

        run["sources"].append(
            {
                "source": row.source,
                "status": row.status.value,
                "records_new": row.records_new,
                "records_updated": row.records_updated,
                "duration_seconds": row.duration_seconds,
                "samples": row.samples or [],
                "error": row.error,
            }
        )
        run["records_new"] += row.records_new
        if row.status.value == "failed":
            run["sources_failed"] += 1
        elif row.status.value == "ok":
            run["sources_ok"] += 1
        # A run's window is the earliest start to the latest finish across its
        # sources, which run one after another.
        if row.started_at and row.started_at < run["started_at"]:
            run["started_at"] = row.started_at
        if row.finished_at and (run["finished_at"] is None or row.finished_at > run["finished_at"]):
            run["finished_at"] = row.finished_at

    # Per-source health: when did each source last succeed, and is it failing
    # now? This is the part that catches a portal that has quietly gone dark.
    health: dict[str, dict] = {}
    for row in sorted(rows, key=lambda r: (r.started_at or since)):
        entry = health.setdefault(
            row.source, {"source": row.source, "last_run": None, "last_success": None, "status": None}
        )
        entry["last_run"] = row.finished_at or row.started_at
        entry["status"] = row.status.value
        if row.status.value == "ok":
            entry["last_success"] = row.finished_at or row.started_at

    return {
        "runs": runs[:limit],
        "sources": sorted(health.values(), key=lambda e: e["source"]),
        "manual_sources": list(MANUAL_SOURCES),
        "window_days": days,
        "generated_at": datetime.now(timezone.utc),
    }
