"""
HTTP cache headers — what lets Firebase's CDN absorb traffic instead of Cloud SQL.

THE SHAPE OF THIS FILE IS DELIBERATE: it denies by default.

Every response leaves here as `no-store` unless its path appears in CACHE_RULES.
The opposite arrangement — cache everything, exclude the sensitive bits — is one
forgotten exclusion away from serving a correction reporter's contact details
from a public edge cache. Adding a route to the allowlist later is easy; noticing
a leak is not.

Why `s-maxage` and not just `max-age`:
Firebase Hosting does not cache backend responses by default. `s-maxage` is the
directive shared caches obey — it is what actually moves work off the database.
`max-age` only tells the visitor's own browser. We set both, plus
`stale-while-revalidate` so a reader is never made to wait on a refresh.

The freshness trap this file cannot solve alone:
Firebase Hosting has no purge button for dynamic content — a cached response
expires on its timer and not before. On a platform whose whole purpose is
correcting the public record, waiting five minutes for a fixed figure to reach
every reader is not acceptable. That is what the `?v=` version stamp is for
(see app/routers/meta.py): change the stamp, change every cache key, and the old
responses become unreachable immediately. This middleware sets the timers; the
stamp is the emergency brake.
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

# Path prefix -> how long a shared cache (the CDN) may serve it, in seconds.
# Longest prefixes are matched first, so a specific rule beats a general one.
CACHE_RULES: dict[str, int] = {
    # Curated seed data. Changes only when load_seed_data.py is run by hand.
    "/api/v1/finances": 600,
    "/api/v1/governments": 600,
    "/api/v1/documents": 600,
    "/api/v1/school-education": 600,
    # Records that shift when a scraper or a seed lands.
    "/api/v1/projects": 300,
    "/api/v1/mous": 300,
    # Time-sensitive: shorter timers, because being stale here is visible.
    "/api/v1/tenders": 180,
    "/api/v1/news": 120,
    # The refresh log is the one page whose whole point is being current: a
    # reader checking whether this morning's run landed must not be shown a
    # five-minute-old "no runs yet".
    "/api/v1/meta/updates": 60,
    "/api/v1/search": 60,
}

# Paths that must NEVER carry a public cache header, whatever else matches.
# Checked as substrings so nested routes cannot slip past.
NEVER_CACHE_FRAGMENTS: tuple[str, ...] = (
    "/admin/",        # returns correction reporters' contact details
    "/community",     # a reader must see their own post immediately
    "/meta/version",  # the cache-busting stamp cannot itself be cached
    "/health",        # an uptime check must reach the real container
    "/docs",
    "/redoc",
    "/openapi.json",
)

# Browsers get a short timer; the CDN gets the real one. Serving stale while
# revalidating means a reader on a village connection is never blocked on us.
BROWSER_MAX_AGE = 60
STALE_WHILE_REVALIDATE = 3600

NO_STORE = "no-store, no-cache, must-revalidate, private"


def _shared_ttl(path: str) -> int | None:
    """Seconds a shared cache may keep this path, or None if it must not be cached."""
    if any(fragment in path for fragment in NEVER_CACHE_FRAGMENTS):
        return None
    # Longest prefix wins, so /api/v1/documents/library could be tightened later
    # without disturbing /api/v1/documents.
    for prefix in sorted(CACHE_RULES, key=len, reverse=True):
        if path.startswith(prefix):
            return CACHE_RULES[prefix]
    return None


class CacheControlMiddleware(BaseHTTPMiddleware):
    """Stamp every response with an explicit caching decision.

    Explicit is the point. A response with no Cache-Control header is at the mercy
    of whatever default each cache along the way happens to apply, and those
    defaults differ. Saying `no-store` out loud is safer than saying nothing.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)

        # Only successful reads are ever cacheable. Writes change state; redirects
        # and errors are transient and must not be pinned at an edge.
        if request.method not in ("GET", "HEAD") or not (200 <= response.status_code < 300):
            response.headers["Cache-Control"] = NO_STORE
            return response

        ttl = _shared_ttl(request.url.path)
        if ttl is None:
            response.headers["Cache-Control"] = NO_STORE
            return response

        response.headers["Cache-Control"] = (
            f"public, max-age={BROWSER_MAX_AGE}, s-maxage={ttl}, "
            f"stale-while-revalidate={STALE_WHILE_REVALIDATE}"
        )
        # Responses are identical for every reader — language is chosen in the
        # browser, not negotiated here — so the only axis that varies is encoding.
        existing_vary = response.headers.get("Vary")
        if existing_vary:
            if "accept-encoding" not in existing_vary.lower():
                response.headers["Vary"] = f"{existing_vary}, Accept-Encoding"
        else:
            response.headers["Vary"] = "Accept-Encoding"
        return response
