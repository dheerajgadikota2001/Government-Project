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
from pathlib import Path

from fastapi import APIRouter

from app.config import settings

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
