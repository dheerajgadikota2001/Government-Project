"""
Block until a local TCP port answers, or give up.

    python scripts/wait_port.py 5435 40                 # wait until it answers
    python scripts/wait_port.py 5435 --must-be-free     # fail if something already owns it

Exists because the tenders batch file starts the Cloud SQL proxy and the very
next line needs it; a proxy takes a second or two to bind, and a scraper that
runs before it does records a connection error as if the portal had failed.
A multi-line loop cannot live inside a .bat's python -c, so it lives here.
"""
import socket
import sys
import time


def is_listening(port: int) -> bool:
    with socket.socket() as s:
        s.settimeout(1)
        try:
            s.connect(("127.0.0.1", port))
            return True
        except OSError:
            return False


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    port = int(args[0]) if args else 5435
    limit = float(args[1]) if len(args) > 1 else 40.0
    if "--must-be-free" in sys.argv:
        # The opposite question, asked before the proxy starts. If something is
        # already on this port the proxy will fail to bind and quit, and the
        # scraper would then talk to that something, which is exactly how a
        # month of runs went to a laptop database. Refuse instead.
        if is_listening(port):
            print(f"port {port} is already taken by another process; refusing to start the proxy behind it")
            return 1
        return 0
    started = time.time()
    while time.time() - started < limit:
        with socket.socket() as s:
            s.settimeout(1)
            try:
                s.connect(("127.0.0.1", port))
                return 0
            except OSError:
                time.sleep(1)
    print(f"port {port} never answered within {limit:.0f}s")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
