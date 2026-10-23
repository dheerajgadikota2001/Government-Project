"""Draws the share pictures: one 1200 x 630 picture per page and language, the one WhatsApp, Facebook, X and Google
show under a link. Run it after the data changes; it draws only the pictures that are missing.

    node scripts/share_specs.mjs        which pictures the site needs (npm run cards does both steps)
    python scripts/make_cards.py        draws the missing ones into .cache/share, removes the ones no page names
    python scripts/make_cards.py --limit 20            a quick trial
    python scripts/make_cards.py --only projects-613   only the pictures whose name contains this
    python scripts/make_cards.py --preview 12          also writes 12 full-colour copies into .cache/share-preview

How it keeps the pictures honest
  * A picture's file name carries a fingerprint of its words and of this script and its template (scripts/share-spec.mjs),
    so a picture is drawn again whenever anything it shows changes, and an old picture is never reused for new figures.
  * The fonts must really load (Geist, Source Serif 4, Noto Sans Telugu). If they did not (no network), it stops, rather
    than drawing a page of pictures in a fallback font.
  * A headline that does not fit even at the smallest size is cut with an ellipsis, and the picture is listed at the end.
  * Pictures are saved as 128-colour PNG: about 30 to 60 KB, far under the 300 KB WhatsApp allows.

Needs: pip install playwright pillow ; playwright install chromium
"""
import argparse, base64, io, json, pathlib, sys, time
from playwright.sync_api import sync_playwright
from PIL import Image

HERE = pathlib.Path(__file__).resolve().parent
WEB = HERE.parent
OUT = WEB / '.cache' / 'share'
PUBLIC = WEB / 'public'
COLOURS = 128


def poster_uri(base):
    """The baked 3D picture of a work, as a data: URL (light theme, wide framing)."""
    f = PUBLIC / (base.lstrip('/') + '-lw.webp')
    if not f.exists():
        raise SystemExit(f'poster missing: {f}')
    return 'data:image/webp;base64,' + base64.b64encode(f.read_bytes()).decode()


def to_png(shot: bytes) -> bytes:
    im = Image.open(io.BytesIO(shot)).convert('RGB')
    q = im.quantize(colors=COLOURS, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    buf = io.BytesIO()
    q.save(buf, format='PNG', optimize=True)
    return buf.getvalue()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--only', default='')
    ap.add_argument('--preview', type=int, default=0)
    ap.add_argument('--redraw', action='store_true', help='draw every picture again, even if it exists')
    a = ap.parse_args()

    specs_file = OUT / 'specs.json'
    if not specs_file.exists():
        raise SystemExit('No specs.json. Run: node scripts/share_specs.mjs')
    specs = json.loads(specs_file.read_text(encoding='utf-8'))
    wanted = {s['file'] for s in specs}
    # pictures no page names any more
    for f in OUT.glob('*.png'):
        if f.name not in wanted:
            f.unlink()
    todo = [s for s in specs if (a.redraw or not (OUT / s['file']).exists()) and a.only in s['file']]
    if a.limit:
        todo = todo[:a.limit]
    print(f'{len(specs)} pictures needed, {len(todo)} to draw.')
    if not todo:
        return

    cut, sizes, t0 = [], [], time.time()
    prev = WEB / '.cache' / 'share-preview'
    if a.preview:
        prev.mkdir(parents=True, exist_ok=True)
        for f in prev.glob('*.png'):
            f.unlink()
    with sync_playwright() as p:
        b = p.chromium.launch()
        page = b.new_page(viewport={'width': 1200, 'height': 630}, device_scale_factor=1)
        page.goto((HERE / 'share-card.html').as_uri(), wait_until='networkidle')
        # the fonts must be the real ones
        for font, sample in (('700 40px Geist', 'Aa0'), ('600 40px "Source Serif 4"', 'Aa'), ('700 40px "Noto Sans Telugu"', 'అఆ')):
            page.evaluate('([f, s]) => document.fonts.load(f, s)', [font, sample])
        loaded = page.evaluate('[...document.fonts].filter(f => f.status === "loaded").map(f => f.family.replace(/"/g, ""))')
        for fam in ('Geist', 'Source Serif 4', 'Noto Sans Telugu'):
            if fam not in loaded:
                raise SystemExit(f'The font {fam} did not load (is the network on?). Nothing drawn.')
        for i, s in enumerate(todo, 1):
            poster = poster_uri(s['spec']['poster']) if s['spec'].get('poster') else None
            res = page.evaluate('([spec, poster]) => draw(spec, poster)', [s['spec'], poster])
            # new text may need glyphs that are not loaded yet; wait for them, then fit again
            page.evaluate('document.fonts.ready')
            res = page.evaluate('([spec, poster]) => draw(spec, poster)', [s['spec'], poster])
            if poster:
                page.wait_for_function('document.getElementById("poster").complete')
            page.evaluate('document.fonts.ready')
            if not res['fitted']:
                cut.append(s['file'])
            shot = page.screenshot(type='png')
            png = to_png(shot)
            if len(png) > 300 * 1024:
                raise SystemExit(f'{s["file"]} is {len(png) // 1024} KB, over the 300 KB WhatsApp allows')
            tmp = OUT / (s['file'] + '.tmp')
            tmp.write_bytes(png)
            tmp.replace(OUT / s['file'])
            sizes.append(len(png))
            if i <= a.preview:
                (prev / s['file']).write_bytes(shot)
            if i % 100 == 0:
                print(f'  {i} of {len(todo)} drawn ({time.time() - t0:.0f} s)')
        b.close()
    print(f'Drew {len(todo)} pictures in {time.time() - t0:.0f} s. Size: average {sum(sizes) // len(sizes) // 1024} KB, largest {max(sizes) // 1024} KB.')
    if cut:
        print(f'{len(cut)} headline(s) did not fit even at the smallest size and were cut with an ellipsis:')
        for f in cut[:20]:
            print('   ', f)


if __name__ == '__main__':
    sys.exit(main())
