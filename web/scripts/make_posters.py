"""
Draws the baked pictures ("posters") of the big-work 3D models.

A poster is the model itself, drawn once from the real scene, for each work, each theme (light and
dark) and each box shape (n = phone, w = desktop). The site shows it the instant a model's place
appears, while the live model loads, and for a device that rests the live model. See
src/three/posters.ts for how the site picks one.

Run after any change to a 3D scene (src/three/scenes, core.ts) and after any data refresh that
changes a work's printed share (the Polavaram dam shows its share as solid):

    cd web
    npx vite build --outDir dist-posters --emptyOutDir
    python scripts/make_posters.py --dist dist-posters

Needs: pip install playwright pillow, and a Chromium (playwright install chromium).
It rewrites public/3d/r<REV>/*.webp and src/three/posters.gen.ts. When the scene code has changed since
the last run, it moves to a new r<REV> folder by itself, so no browser keeps an old picture (the site lets
browsers keep pictures for a week); the old folder can then be deleted.

How it stays honest: the poster is rendered by the same page and the same scene code the reader
runs, with the reader's "less motion" setting on so every picture is the model at rest (time 0,
no governor), and the graphics chip reported as a good one so the model is drawn at full level.
"""

import argparse
import functools
import hashlib
import http.server
import io
import re
import sys
import threading
from pathlib import Path

from PIL import Image
from playwright.sync_api import TimeoutError as PlaywrightTimeout
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
GEN = ROOT / "src/three/posters.gen.ts"


def scenes_hash() -> str:
    files = sorted((ROOT / "src/three").glob("scenes/*.ts")) + [ROOT / "src/three/core.ts"]
    return hashlib.sha256("".join(f.read_text(encoding="utf-8").replace("\r", "") for f in files).encode("utf-8")).hexdigest()[:12]


def current_rev() -> int:
    """The picture folder's number: the last one, or the next when the scene code has changed since."""
    old = GEN.read_text(encoding="utf-8") if GEN.exists() else ""
    rev = int(m.group(1)) if (m := re.search(r"POSTER_REV = (\d+)", old)) else 1
    was = m.group(1) if (m := re.search(r"POSTER_SCENES = '([0-9a-f]+)'", old)) else None
    return rev + 1 if was and was != scenes_hash() else rev
SHAPES = {
    # key: (viewport, device scale factor, mobile)
    "n": ({"width": 390, "height": 844}, 2, True),
    "w": ({"width": 1440, "height": 900}, 1.5, False),
}
THEMES = {"l": "light", "d": "dark"}
QUALITY = 80
MAX_KB = 90

# Make the sandbox look like a machine with a good graphics chip, so the model is drawn at full level.
INIT = """
(() => {
  const fake = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)';
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!C) continue;
    const g = C.prototype.getParameter;
    C.prototype.getParameter = function (p) { return p === 0x9246 ? fake : g.call(this, p); };
  }
  Object.defineProperty(navigator, 'deviceMemory', { value: 8, configurable: true });
  // the site's own switch for test machines that draw with software WebGL
  try { localStorage.setItem('apfc-qa-3d', '1') } catch (e) {}
})();
"""
HIDE_ALL_BUT_CANVAS = "*{visibility:hidden!important;background:transparent!important;box-shadow:none!important;border-color:transparent!important}canvas{visibility:visible!important}"


def serve(dist: Path):
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a, **k):
            pass

    handler = functools.partial(Quiet, directory=str(dist))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}"


def capture(browser, base, shape, theme_key, out_dir: Path, only=None):
    viewport, dpr, mobile = SHAPES[shape]
    ctx = browser.new_context(viewport=viewport, device_scale_factor=dpr, is_mobile=mobile, has_touch=mobile,
                              color_scheme=THEMES[theme_key], reduced_motion="reduce")
    ctx.add_init_script(INIT)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(base + "/", wait_until="load")
    page.wait_for_selector("[data-work]", timeout=60000)
    cls = page.evaluate("document.documentElement.className")
    if THEMES[theme_key] not in cls.split():
        sys.exit(f"theme {THEMES[theme_key]} was not applied (html class: {cls!r})")
    works = page.evaluate("[...document.querySelectorAll('[data-work]')].map(a => [Number(a.dataset.work), a.dataset.pct])")
    done = {}
    for i, (wid, tag) in enumerate(works):
        if only and wid not in only:
            continue
        page.locator(f'[data-i="{i}"]').click()
        sel = f'[data-work="{wid}"] div.opacity-100 > canvas'
        try:
            page.wait_for_selector(sel, timeout=240000)  # the airport takes a while on a software renderer
        except PlaywrightTimeout:
            sys.exit(f"work {wid}: the live model never appeared ({errors[-1] if errors else 'no page error'})")
        page.wait_for_timeout(1500)  # shaders, the fade, and a few resting frames
        page.add_style_tag(content=HIDE_ALL_BUT_CANVAS).evaluate("e => { window.__hide = e }")
        png = page.locator(sel).screenshot(omit_background=True)
        page.evaluate("window.__hide && window.__hide.remove()")
        im = Image.open(io.BytesIO(png)).convert("RGBA")
        alpha = im.getchannel("A")
        covered = sum(alpha.histogram()[9:]) / (im.width * im.height)
        if covered < 0.03:
            sys.exit(f"work {wid} ({shape}, {THEMES[theme_key]}): the picture is empty ({covered:.1%} drawn)")
        buf = io.BytesIO()
        im.save(buf, "WEBP", quality=QUALITY, method=6)
        kb = len(buf.getvalue()) / 1024
        if kb > MAX_KB:
            sys.exit(f"work {wid} ({shape}, {THEMES[theme_key]}): {kb:.0f} KB is over the {MAX_KB} KB limit")
        (out_dir / f"w{wid}-{tag}-{theme_key}{shape}.webp").write_bytes(buf.getvalue())
        done[wid] = tag
        print(f"  {shape} {THEMES[theme_key]:5s} work {wid:4d} {im.width}x{im.height} {kb:5.1f} KB, {covered:.0%} drawn")
    ctx.close()
    return done, [w for w, _ in works]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dist", default="dist-posters", help="a built site (vite build), served locally")
    ap.add_argument("--only", help="comma separated work ids, to redo a few")
    a = ap.parse_args()
    only = {int(x) for x in a.only.split(",")} if a.only else None
    dist = (ROOT / a.dist).resolve()
    if not (dist / "index.html").exists():
        sys.exit(f"{dist} has no built site; run: npx vite build --outDir {a.dist} --emptyOutDir")
    rev = current_rev()
    if only and f"POSTER_REV = {rev}\n" not in (GEN.read_text(encoding="utf-8") if GEN.exists() else ""):
        sys.exit("The scene code changed since the pictures were drawn: redraw them all (leave out --only).")
    out_dir = ROOT / "public" / "3d" / f"r{rev}"
    out_dir.mkdir(parents=True, exist_ok=True)
    srv, base = serve(dist)
    seen = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        for shape in SHAPES:
            for tk in THEMES:
                got, home_order = capture(browser, base, shape, tk, out_dir, only)
                for k, v in got.items():
                    if seen.setdefault(k, v) != v:
                        sys.exit(f"work {k}: shape and theme runs disagree on the printed share ({seen[k]} vs {v})")
        browser.close()
    srv.shutdown()
    if only:
        # keep the entries of works not redone
        old = GEN.read_text(encoding="utf-8")
        for k, v in re.findall(r"w(\d+): '([^']+)'", old):
            seen.setdefault(int(k), v)
    # drop pictures of an old printed share or a work no longer listed
    keep = {f"w{k}-{v}-" for k, v in seen.items()}
    for f in out_dir.glob("w*.webp"):
        if not any(f.name.startswith(k) for k in keep):
            f.unlink()
    # Home's order, so the first entry is the work Home opens on (and fetches early)
    order = [k for k in home_order if k in seen] + sorted(k for k in seen if k not in home_order)
    body = ",\n".join(f"  w{k}: '{seen[k]}'" for k in order)
    scenes = scenes_hash()
    GEN.write_text(
        "// Written by scripts/make_posters.py. Do not edit by hand.\n"
        f"export const POSTER_REV = {rev}\n"
        f"/** Fingerprint of the scene code the pictures were drawn from; test:posters fails when the code has moved on. */\n"
        f"export const POSTER_SCENES = '{scenes}'\n"
        "/** w<work id> -> the printed share its pictures show ('plan' when the work has none). The w keeps the\n *  order as written: JavaScript sorts number-like keys, and the first entry is the one Home shows first. */\n"
        f"export const POSTERS: Record<string, string> = {{\n{body},\n}}\n", encoding="utf-8")
    total = sum(f.stat().st_size for f in out_dir.glob("*.webp"))
    print(f"\n{len(seen)} works, {len(list(out_dir.glob('*.webp')))} pictures, {total/1024:.0f} KB in all")


if __name__ == "__main__":
    main()
