"""
Rewrite the production database URL so it goes through a local Cloud SQL proxy.

WHY THIS EXISTS
The DATABASE_URL secret in Secret Manager is written for Cloud Run, where the
database is reached at its own address. A GitHub runner cannot reach that
address; it reaches the Cloud SQL Auth Proxy on 127.0.0.1 instead. The user,
password and database name stay exactly as they are; only the host and port
change. Keeping one secret and rewriting the host here beats keeping a second
copy of the password that someone must remember to rotate.

HOW IT IS CALLED
    DATABASE_URL_CLOUD=<secret> python scripts/db_url_via_proxy.py --port 5433

The input comes from an environment variable, never from the command line,
so it does not appear in a process listing. The only thing written to stdout
is the rewritten URL; the caller masks it before anything else can log it.
Errors go to stderr and never include the URL.

WHAT IT ACCEPTS
    postgresql+asyncpg://user:pw@10.0.0.5:5432/applatform
    postgresql+asyncpg://user:pw@/applatform?host=/cloudsql/project:region:db
Both become
    postgresql+asyncpg://user:pw@127.0.0.1:5433/applatform
The password is handled as raw text, never decoded and re-encoded, so a
password with %, @ or : in it survives untouched.
"""
import argparse
import os
import sys
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


def rewrite(url: str, host: str = "127.0.0.1", port: int = 5432) -> str:
    """Return `url` with its network address replaced by host:port."""
    parts = urlsplit(url)
    if not parts.scheme or "postgres" not in parts.scheme:
        raise ValueError("not a postgres URL")

    # Everything before the last "@" in the netloc is the credentials, kept raw.
    netloc = parts.netloc
    userinfo = netloc.rsplit("@", 1)[0] if "@" in netloc else ""
    if not userinfo:
        raise ValueError("URL carries no user credentials")
    new_netloc = f"{userinfo}@{host}:{port}"

    # The unix-socket form carries the address as ?host=/cloudsql/...; a proxy
    # connection has no use for it and asyncpg would try to honour it.
    query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if k != "host"]

    return urlunsplit((parts.scheme, new_netloc, parts.path, urlencode(query), parts.fragment))


def main() -> int:
    parser = argparse.ArgumentParser(description="Rewrite DATABASE_URL_CLOUD to point at a local proxy.")
    parser.add_argument("--from-env", default="DATABASE_URL_CLOUD", help="environment variable holding the cloud URL")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=5432)
    args = parser.parse_args()

    raw = os.environ.get(args.from_env, "").strip()
    if not raw:
        print(f"{args.from_env} is empty or unset; nothing to rewrite.", file=sys.stderr)
        return 2
    try:
        print(rewrite(raw, args.host, args.port))
    except ValueError as exc:
        print(f"could not rewrite {args.from_env}: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
