"""
Do the documents we cite still exist?

Government sites reorganise constantly, and a dead citation is the quietest
kind of rot: the page still renders, the figure still looks checked, and the
link goes nowhere. This is the only check that touches the network, so it is
off by default and run on a schedule rather than on every edit.

Results are cached so a scheduled run costs one request per URL per week rather
than one per run, and so a site that is merely slow today does not get marked
dead.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from typing import Iterable

from .base import FAIL, INFO, WARN, Ctx, Finding, check
from .sources import _source_map, _walk

CACHE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".link-cache.json")
MAX_AGE = 7 * 24 * 3600
UA = "APNaduNedu-linkcheck/1.0 (+citizen transparency platform; contact via the site)"
# A HEAD that a government host rejects is not a dead link; several refuse HEAD
# outright and answer GET perfectly well.
RETRY_GET = {403, 405, 406, 501}


def _cache() -> dict:
    try:
        with open(CACHE, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _save(c: dict) -> None:
    try:
        with open(CACHE, "w", encoding="utf-8") as f:
            json.dump(c, f, indent=1)
    except Exception:
        pass


def _probe(url: str, timeout: float = 12.0) -> tuple[int | None, str]:
    for method in ("HEAD", "GET"):
        req = urllib.request.Request(url, method=method, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.status, ""
        except urllib.error.HTTPError as e:
            if method == "HEAD" and e.code in RETRY_GET:
                continue
            return e.code, e.reason or ""
        except Exception as e:
            if method == "HEAD":
                continue
            return None, type(e).__name__ + ": " + str(e)[:120]
    return None, "unreachable"


@check("links.alive", "Every cited document still resolves")
def alive(ctx: Ctx) -> Iterable[Finding]:
    if os.environ.get("VERIFY_LINKS") != "1":
        yield Finding(
            INFO, "links.alive", "-", "-",
            "skipped (set VERIFY_LINKS=1 to run it)",
            "Run it on a schedule, not on every edit — it is the only check that needs the network.",
        )
        return

    urls: dict[str, list[str]] = {}
    for name, seed in ctx.seeds.items():
        for key, src in _source_map(seed).items():
            for f in ("url", "pdf"):
                u = src.get(f) if isinstance(src, dict) else None
                if isinstance(u, str) and u.startswith("http"):
                    urls.setdefault(u, []).append(f"{name}:sources.{key}.{f}")
        for path, node in _walk(seed):
            for f in ("website", "citizen_portal", "source_url"):
                u = node.get(f)
                if isinstance(u, str) and u.startswith("http"):
                    urls.setdefault(u.split(";")[0].strip(), []).append(f"{name}:{path}.{f}")

    cache, now, checked, dead = _cache(), time.time(), 0, 0
    for url, where in sorted(urls.items()):
        hit = cache.get(url)
        if hit and now - hit.get("at", 0) < MAX_AGE:
            status, reason = hit.get("status"), hit.get("reason", "")
        else:
            status, reason = _probe(url)
            cache[url] = {"status": status, "reason": reason, "at": now}
            checked += 1
        if status is None or status >= 400:
            dead += 1
            sev = FAIL if (status or 0) in (404, 410) else WARN
            yield Finding(
                sev, "links.alive", where[0].split(":")[0], where[0].split(":", 1)[1],
                f"cited document did not respond ({status or reason})",
                "Find where the document moved to and update the link, or record it in "
                "`unavailable` with the menu path a person should follow. A figure whose "
                "document cannot be opened is no longer a checkable figure.",
                {"url": url, "also_cited_at": where[1:6]},
            )
    _save(cache)
    yield Finding(
        INFO, "links.alive", "-", "-",
        f"{len(urls)} cited links, {checked} probed this run, {dead} not responding",
        "No action." if not dead else "See the findings above.",
    )
