"""
Phone check for the one-card-a-screen feed on /cards: no card may draw one block of text on top of another.

    cd web
    npx vite build --outDir dist-check --emptyOutDir
    python scripts/test_cards_fit.py --dist dist-check
    python scripts/test_cards_fit.py --dist dist-check --api https://apfactcheck.dheeco.com   # with today's tender card

Why it exists: on a phone each card has a fixed height. Once, a tall card squeezed its middle part below its
real height, so the big number was painted over the paper line. This opens every card, in English and in
Telugu, at six phone sizes (from a small phone with thick browser bars to a large one) and fails when:
  1. the paper line (footer) is not fully inside the card,
  2. the paper line overlaps the middle part of the card,
  3. the card itself is clipped without a way to reach the rest (the middle part must scroll),
  4. at the sizes in MUST_FIT (390 x 664 and larger, the common case) any card needs scrolling at all.
Below that, a card may scroll inside itself; it is printed as a note, not a failure.
Needs: pip install playwright (and a Chromium). Exit code 0 when everything passes.
"""

import argparse
import functools
import http.server
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

SIZES = [(360, 560), (375, 600), (390, 664), (412, 700), (430, 740), (390, 844)]
MUST_FIT = lambda w, h: w >= 390 and h >= 664
LANG_KEY = "apfc-cards-lang"

MEASURE = """() => [...document.querySelectorAll('[data-feed=cards] article')].map((a, i) => {
  const body = [...a.children].find((k) => k.className.includes('flex-1'));
  const foot = a.querySelector('footer');
  const ar = a.getBoundingClientRect(), fr = foot.getBoundingClientRect(), br = body.getBoundingClientRect();
  return {
    i, title: a.querySelector('h3').textContent.slice(0, 26),
    footInside: fr.top >= ar.top && fr.bottom <= ar.bottom + 1,
    footOverBody: fr.top < br.bottom - 1,
    bodyScrolls: getComputedStyle(body).overflowY === 'auto',
    hidden: Math.max(0, body.scrollHeight - body.clientHeight),
    cardClipped: a.scrollHeight - a.clientHeight > 1 && getComputedStyle(a).overflowY === 'visible',
  }
})"""


def serve(dist: Path):
    # Like the site's own hosting: an address with no file behind it gets the app (index.html).
    class App(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a, **k):
            pass

        def do_GET(self):
            rel = self.path.split("?")[0].lstrip("/")
            if rel and not (dist / rel).exists() and not rel.startswith("api"):
                self.path = "/index.html"
            return super().do_GET()

    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(App, directory=str(dist)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dist", required=True)
    ap.add_argument("--api", help="send /api calls to this address (default: no API, the tender card is then left out)")
    a = ap.parse_args()
    srv, base = serve(Path(a.dist))
    ok = True
    with sync_playwright() as p:
        b = p.chromium.launch()
        for lang in ("en", "te"):
            for w, h in SIZES:
                ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=True, has_touch=True, device_scale_factor=1)
                pg = ctx.new_page()
                if a.api:
                    def proxy(route):
                        route.fulfill(response=route.fetch(url=route.request.url.replace(base, a.api.rstrip("/"))))
                    pg.route("**/api/**", proxy)
                else:
                    pg.route("**/api/**", lambda r: r.abort())
                pg.add_init_script(f"try{{localStorage.setItem('{LANG_KEY}','{lang}')}}catch(e){{}}")
                pg.goto(base + "/cards", wait_until="networkidle")
                pg.wait_for_selector("[data-feed=cards] article")
                pg.wait_for_timeout(800)
                rows = pg.evaluate(MEASURE)
                bad, notes = [], []
                for r in rows:
                    if not r["footInside"] or r["footOverBody"] or not r["bodyScrolls"] or r["cardClipped"]:
                        bad.append(r)
                    elif r["hidden"] > 0:
                        (bad if MUST_FIT(w, h) else notes).append(r)
                tag = f"{lang} {w}x{h}: {len(rows)} cards"
                if len(rows) < 8:
                    bad.append({"title": "fewer than 8 cards found"})
                print(("PASS " if not bad else "FAIL ") + tag + (f", {len(notes)} scroll inside (small screen)" if notes else ""))
                for r in bad:
                    print("   ", r)
                    ok = False
                ctx.close()
        b.close()
    srv.shutdown()
    sys.exit(0 if ok else 1)


main()
