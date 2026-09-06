"""
The one rate limiter, importable from anywhere.

It used to live inside main.py, which meant a router could not put a tighter
limit on a single endpoint without importing the application module and going
round in a circle. Now routers import `limiter` from here and main.py attaches
it to the app.

Keying by client address is only as good as the address. Behind Firebase and
Cloud Run the real client is somewhere inside X-Forwarded-For, and uvicorn is
started with --forwarded-allow-ips="*", which trusts the leftmost entry. That is
the entry a client controls. Until the position of the trustworthy address is
confirmed against the live deployment (see /meta/whoami), every per-address
limit here is a speed bump for honest traffic, not a wall.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[f"{settings.rate_limit_per_minute}/minute"],
)
