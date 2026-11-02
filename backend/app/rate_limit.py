"""
The one rate limiter, importable from anywhere.

It used to live inside main.py, which meant a router could not put a tighter
limit on a single endpoint without importing the application module and going
round in a circle. Now routers import `limiter` from here and main.py attaches
it to the app.

Keying by client address is only as good as the address. The key comes from
app.client_address, which reads X-Forwarded-For from the right (the entries
proxies appended) and never the leftmost entry a client can write. It used to
take the leftmost, so a client that changed that header got a fresh limit on
every request.
"""
from slowapi import Limiter

from app.client_address import client_address
from app.config import settings

limiter = Limiter(
    key_func=client_address,
    default_limits=[f"{settings.rate_limit_per_minute}/minute"],
)
