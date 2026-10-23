"""
Draws the site's icons from one shape (a blue rounded square with a white tick).

    cd web
    python scripts/make_icons.py public

Writes favicon.svg, favicon.ico (48, 32 and 16 px), apple-touch-icon.png (180, square, the phone rounds it),
icon-192.png and icon-512.png (rounded, "any" purpose in manifest.webmanifest) and icon-maskable-512.png (the
tick sits inside the middle 60 percent, so any phone mask keeps it). Needs: pip install playwright pillow.
The colour is the site's brand blue (--brand in src/index.css). Change it there and here together.
"""
import sys, io, pathlib
from playwright.sync_api import sync_playwright
from PIL import Image
OUT = pathlib.Path(sys.argv[1])
BLUE = '#2453D6'
def svg(size, kind):
    if kind == 'round':
        return f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="{BLUE}"/><path d="M17 33.5l10.5 10.5L47.5 20" fill="none" stroke="#fff" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    if kind == 'full':      # no rounded corners: the phone adds its own mask
        return f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 64 64"><rect width="64" height="64" fill="{BLUE}"/><path d="M17 33.5l10.5 10.5L47.5 20" fill="none" stroke="#fff" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    # maskable: the tick sits inside the central 60 percent, the safe zone
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 64 64"><rect width="64" height="64" fill="{BLUE}"/><path d="M22 33l7.5 7.5L43 24.5" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
(OUT / 'favicon.svg').write_text(svg(64, 'round').replace('width="64" height="64" ', ''), encoding='utf-8')
jobs = [('icon-192.png', 192, 'round'), ('icon-512.png', 512, 'round'), ('icon-maskable-512.png', 512, 'maskable'), ('apple-touch-icon.png', 180, 'full'), ('_f48.png', 48, 'round'), ('_f32.png', 32, 'round'), ('_f16.png', 16, 'round')]
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
    for name, size, kind in jobs:
        pg.set_viewport_size({'width': size, 'height': size})
        pg.set_content(f'<html><body style="margin:0;background:transparent">{svg(size, kind)}</body></html>')
        (OUT / name).write_bytes(pg.screenshot(omit_background=True, clip={'x': 0, 'y': 0, 'width': size, 'height': size}))
    b.close()
ims = [Image.open(OUT / f'_f{s}.png').convert('RGBA') for s in (48, 32, 16)]
ims[0].save(OUT / 'favicon.ico', sizes=[(48, 48), (32, 32), (16, 16)], append_images=ims[1:])
for s in (48, 32, 16): (OUT / f'_f{s}.png').unlink()
for f in sorted(OUT.glob('icon*')) + [OUT/'favicon.ico', OUT/'favicon.svg', OUT/'apple-touch-icon.png']: print(f.name, f.stat().st_size)
