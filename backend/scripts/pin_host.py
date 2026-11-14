r"""
Find a working address for a government host whose name servers come and go.

WHY

The tenders run failed on 5, 9, 10, 13 and 14 Nov 2026 with "Temporary failure
in name resolution" for crda.ap.gov.in. Checked on 14 Nov: the name servers
for ap.gov.in (dns*.ap.gov.in) stop answering for stretches. Google's public
resolver then returns SERVFAIL ("No Reachable Authority at delegation
ap.gov.in"), Cloudflare answers only while it still holds a cached copy, and
GitHub's runner gets whichever it gets. The site itself was up the whole time:
from an Indian network, 103.129.75.59 served the tender page with a valid
certificate.

WHAT IT DOES

    python scripts/pin_host.py crda.ap.gov.in --last-known 103.129.75.59

Tries, in order: the machine's own resolver, Cloudflare over HTTPS, Google over
HTTPS, then the last known address. The first that answers wins, but only
after a TLS handshake to that address proves it serves a valid certificate for
the host. So a stale or wrong address can never be used quietly: it fails the
check and the next route is tried.

Prints "ADDRESS HOST" for /etc/hosts when the machine's own resolver failed and
another route worked, nothing when the resolver worked (no pin needed). The
route taken goes to stderr for the run log. Exit 0 when the host is reachable
by some route, 2 when no route works (the scrape then fails and alerts as before).
"""

import argparse
import json
import socket
import ssl
import sys
import urllib.request

DOH = (
    ("cloudflare", "https://cloudflare-dns.com/dns-query?name={host}&type=A"),
    ("google", "https://dns.google/resolve?name={host}&type=A"),
)


def system_resolves(host: str) -> bool:
    try:
        return bool(socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP))
    except OSError:
        return False


def doh_address(url: str, timeout: float = 10.0) -> str | None:
    """The first A record a DNS-over-HTTPS resolver gives, or None."""
    try:
        req = urllib.request.Request(url, headers={"accept": "application/dns-json"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = json.loads(r.read().decode("utf-8"))
    except (OSError, ValueError):
        return None
    if data.get("Status") != 0:
        return None
    for a in data.get("Answer") or []:
        if a.get("type") == 1 and a.get("data"):
            return a["data"]
    return None


def serves_host(ip: str, host: str, timeout: float = 15.0) -> bool:
    """True when ip completes a TLS handshake with a certificate valid for host."""
    ctx = ssl.create_default_context()
    try:
        with socket.create_connection((ip, 443), timeout=timeout) as sock:
            with ctx.wrap_socket(sock, server_hostname=host):
                return True
    except (OSError, ssl.SSLError):
        return False


def choose(host: str, last_known: str | None, *, resolve=system_resolves, doh=doh_address,
           verify=serves_host, log=lambda m: print(m, file=sys.stderr)) -> tuple[str, str | None]:
    """Return (route, address to pin). Address is None when the system resolver works or nothing does."""
    if resolve(host):
        log(f"{host}: the system resolver answers; no pin needed")
        return "system", None
    log(f"{host}: the system resolver gave no answer")
    for name, template in DOH:
        ip = doh(template.format(host=host))
        if not ip:
            log(f"{host}: {name} gave no answer")
            continue
        if verify(ip, host):
            log(f"{host}: {name} gave {ip}, and it serves a valid certificate for {host}")
            return name, ip
        log(f"{host}: {name} gave {ip}, but it does not serve a valid certificate for {host}; not used")
    if last_known:
        if verify(last_known, host):
            log(f"{host}: using the last known address {last_known}; it serves a valid certificate")
            return "last-known", last_known
        log(f"{host}: the last known address {last_known} does not serve {host} any more")
    log(f"{host}: no route works")
    return "none", None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("host")
    ap.add_argument("--last-known", default=None, help="address to fall back to, checked like any other")
    args = ap.parse_args()
    route, ip = choose(args.host, args.last_known)
    if ip:
        print(f"{ip} {args.host}")
    return 2 if route == "none" else 0


if __name__ == "__main__":
    sys.exit(main())
