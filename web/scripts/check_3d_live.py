"""
Browser check of the 3D models on the Home page, run against a built site (served locally) or any address.

    cd web
    npx vite build --outDir dist-check --emptyOutDir
    python scripts/check_3d_live.py --dist dist-check            # a built site
    python scripts/check_3d_live.py --url https://apfactcheck.dheeco.com

It opens Home as a phone, then as a desktop, and checks:
  1. The first work's baked picture is on screen before its live model (when pictures exist).
  2. The next work's picture is already there before the reader swipes to it.
  3. Swiping through several works brings each live model up, and letting a model go never marks
     the device as slow. (Closing a model once did: the browser reports a model's own clean-up the same
     way as a graphics chip being taken away, and the site saved "slow" for fourteen days.)
  4. Nothing in the page throws.
Needs: pip install playwright (and a Chromium). Exit code 0 when everything passes.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from make_posters import INIT, ROOT, serve
from playwright.sync_api import sync_playwright

ok = True


def expect(name, cond, more=""):
    global ok
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f": {more}"))
    ok = ok and bool(cond)


def level(page):
    return page.evaluate("localStorage.getItem('apfc-3d-level')")


def live(page, wid):
    return page.locator(f'[data-work="{wid}"] div.opacity-100 > canvas').count() > 0


def poster_loaded(page, wid):
    return page.evaluate("(w) => { const i = document.querySelector(`[data-work=\"${w}\"] img[draggable=false]`); return !!i && i.complete && i.naturalWidth > 0 }", wid)


def run(browser, base, name, viewport, dpr, mobile):
    print(f"\n{name}")
    # "Less motion" keeps the model at rest and the speed governor off: a software renderer is slow by nature
    # and would (rightly) be stepped down, which is not what this check is about.
    ctx = browser.new_context(viewport=viewport, device_scale_factor=dpr, is_mobile=mobile, has_touch=mobile, color_scheme="light", reduced_motion="reduce")
    ctx.add_init_script(INIT)
    ctx.add_init_script("document.addEventListener('load', (e) => { const t = e.target; if (t && t.tagName === 'IMG' && /\\/3d\\/r/.test(t.src) && window.__posterAt == null) window.__posterAt = performance.now() }, true)")
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(base + "/", wait_until="commit")
    page.wait_for_selector("[data-work]", timeout=120000)
    works = page.evaluate("[...document.querySelectorAll('[data-work]')].map(a => Number(a.dataset.work))")
    first, second = works[0], works[1]
    for _ in range(1200):
        if live(page, first):
            break
        page.wait_for_timeout(100)
    # 1 and 2: pictures first. Times come from inside the page, so a busy page cannot skew them.
    t = page.evaluate("({ poster: window.__posterAt ?? null, built: (performance.getEntriesByName('3d:compile')[0] ?? null) && (performance.getEntriesByName('3d:compile')[0].startTime + performance.getEntriesByName('3d:compile')[0].duration), engine: (performance.getEntriesByType('resource').find(r => /\\/core-/.test(r.name)) ?? {}).startTime ?? null })")
    if t["poster"] is None:
        print("   no baked pictures on this build (they are not required to run the rest)")
    else:
        print(f"   picture loaded at {t['poster']/1000:.1f} s, engine asked for at {(t['engine'] or 0)/1000:.1f} s, live model drawn at {(t['built'] or 0)/1000:.1f} s (software graphics: slow by nature)")
        expect("the first work's picture arrived before its live model", t["built"] is None or t["poster"] < t["built"])
        expect("the next work's picture is ready before the swipe", poster_loaded(page, second))
    expect("the first live model comes up", live(page, first), "it never appeared")
    expect("no slow mark after the first model", level(page) is None, level(page))
    # 3: swipe through several works, back and forth
    for wid in [works[3], works[5], works[0], works[2]]:
        page.locator(f'[data-i="{works.index(wid)}"]').click()
        for _ in range(900):
            if live(page, wid):
                break
            page.wait_for_timeout(100)
        expect(f"work {wid}: its live model comes up", live(page, wid), "it never appeared")
        expect(f"work {wid}: no slow mark saved", level(page) is None, level(page))
    expect("nothing in the page threw", not errors, errors[:2])
    ctx.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dist")
    ap.add_argument("--url")
    a = ap.parse_args()
    if not a.dist and not a.url:
        sys.exit("give --dist <built site> or --url <address>")
    srv = None
    base = a.url.rstrip("/") if a.url else None
    if a.dist:
        srv, base = serve((ROOT / a.dist).resolve())
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        run(b, base, "Phone", {"width": 390, "height": 844}, 2, True)
        run(b, base, "Desktop", {"width": 1440, "height": 900}, 1, False)
        b.close()
    if srv:
        srv.shutdown()
    print("\nAll checks passed." if ok else "\nFAILED")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
