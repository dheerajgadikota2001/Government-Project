"""
The one place that decides which address a request came from.

WHY THIS EXISTS
Every per-address rule (the API rate limit, the community board's posts per
hour, the IP hash stored with a post) used to take the leftmost entry of
X-Forwarded-For. That entry is written by the client. A client that sends a
fresh X-Forwarded-For on every request got a fresh identity each time, so
every per-address limit was a speed bump for honest traffic and nothing for
anyone else.

HOW THE HEADER IS BUILT
Proxies append; they do not prepend. So the rightmost entries are the ones
written by machines we know, and the leftmost are whatever the client sent.
Behind Firebase Hosting the chain reaching Cloud Run is

    <anything the client wrote>, <reader's address>, <Firebase edge address>

and a request that comes straight to the run.app address is

    <anything the client wrote>, <caller's address>

So the rule is: take the rightmost entry; if it belongs to a known edge
network (Firebase Hosting's CDN), step one to the left. Never step further.
That gives the reader's address behind Firebase and the caller's own address
when the service is hit directly, and a forged leftmost entry is never read.

The edge ranges come from the CDN's published list, bundled here and checked
on a schedule; the setting TRUSTED_EDGE_CIDRS overrides the bundle. The
observation that fixed the rule is /api/v1/meta/whoami on the live service.
"""
from __future__ import annotations

import ipaddress
import json
import os
from functools import lru_cache
from typing import Optional

from starlette.requests import Request

_BUNDLED = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "edge_cidrs.json")


@lru_cache(maxsize=1)
def edge_networks() -> tuple[ipaddress.IPv4Network | ipaddress.IPv6Network, ...]:
    """The CDN address ranges a request may legitimately arrive through."""
    from app.config import settings
    raw = (settings.trusted_edge_cidrs or "").strip()
    if raw:
        cidrs = [c.strip() for c in raw.split(",") if c.strip()]
    else:
        with open(_BUNDLED, encoding="utf-8") as fh:
            data = json.load(fh)
        cidrs = list(data.get("addresses", [])) + list(data.get("ipv6_addresses", []))
    return tuple(ipaddress.ip_network(c, strict=False) for c in cidrs)


def _parse(value: str) -> Optional[ipaddress.IPv4Address | ipaddress.IPv6Address]:
    try:
        return ipaddress.ip_address(value.strip())
    except ValueError:
        return None


def is_edge(address: str) -> bool:
    ip = _parse(address)
    return ip is not None and any(ip in net for net in edge_networks())


def client_address(request: Request) -> str:
    """The address per-client rules key on. Never an entry the client could have written."""
    forwarded = request.headers.get("x-forwarded-for", "")
    chain = [p.strip() for p in forwarded.split(",") if p.strip()]
    peer = request.client.host if request.client else "unknown"
    if not chain:
        return peer
    rightmost = chain[-1]
    if _parse(rightmost) is None:
        # Not an address at all: a malformed header. Fall back to the socket peer,
        # which no client can write.
        return peer
    if is_edge(rightmost) and len(chain) >= 2 and _parse(chain[-2]) is not None:
        return chain[-2]
    return rightmost


def explain(request: Request) -> dict:
    """What the rule saw and why it chose what it chose. For /meta/whoami."""
    forwarded = request.headers.get("x-forwarded-for", "")
    chain = [p.strip() for p in forwarded.split(",") if p.strip()]
    rightmost = chain[-1] if chain else None
    return {
        "chosen": client_address(request),
        "chain": chain,
        "rightmost_is_edge": bool(rightmost and is_edge(rightmost)),
        "edge_ranges": len(edge_networks()),
        "rule": ("second from the right, because the rightmost is a known edge" if rightmost and is_edge(rightmost) and len(chain) >= 2
                 else "rightmost entry" if rightmost else "socket peer, no X-Forwarded-For"),
    }
