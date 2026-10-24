"""Make or apply a glyph map for a PDF whose fonts carry no readable letters.

    python scripts/repair_cag_fonts.py sheets <file.pdf> <out-folder>
    python scripts/repair_cag_fonts.py apply  <file.pdf> <map.json> <repaired.pdf>

WHY
See app/scrapers/font_repair.py. A glyph map is a claim about what every letter
in a book is, and a wrong letter in a figure would put a wrong figure on the
site, so no map is used until a person has looked at every glyph.

sheets: finds every font without readable letters, draws each distinct glyph
outline, proposes a letter by comparing it with Liberation Serif and Sans, and
writes contact sheets (sheet-0.png, sheet-1.png, ...) and proposed-map.json.
The proposal is marked "reviewed": false. Look at every cell of every sheet;
a cell with "?x" beside its letter is a close call, but the matcher also makes
confident mistakes (in 2016-17 it read bold 5 as $ and italic 1 as J). Correct
the letters in proposed-map.json by the index printed under each cell, set
"reviewed": true and "made", and save it in app/scrapers/glyph_maps/.

apply: writes a copy with a ToUnicode map in each such font. It refuses a file
whose SHA-256 differs from the map's, or one with a glyph the map lacks.

Making sheets needs matplotlib, scipy and the Liberation fonts as well as
requirements-data.txt; applying needs only requirements-data.txt.
"""
from __future__ import annotations

import argparse
import json
import string
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.scrapers import font_repair  # noqa: E402

LIBERATION = Path("/usr/share/fonts/truetype/liberation")
W, H = 56, 64
BOX = (-0.15, 1.15, -0.35, 1.05)   # the em box every glyph is drawn in, so size and baseline count


def _raster(path):
    import numpy as np
    from matplotlib.backends.backend_agg import FigureCanvasAgg
    from matplotlib.figure import Figure
    from matplotlib.patches import PathPatch

    fig = Figure(figsize=(W / 100, H / 100), dpi=100)
    FigureCanvasAgg(fig)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(BOX[0], BOX[1])
    ax.set_ylim(BOX[2], BOX[3])
    ax.axis("off")
    if path is not None and len(path.vertices):
        ax.add_patch(PathPatch(path, facecolor="black", edgecolor="none"))
    fig.canvas.draw()
    return 1.0 - np.asarray(fig.canvas.buffer_rgba())[:, :, 0].astype("float32") / 255.0


def _path(ops):
    """matplotlib Path from (operator, points) pairs in em units."""
    from matplotlib.path import Path as P

    v, c = [], []
    for op, pts in ops:
        if op == "m":
            v.append(pts[0]); c.append(P.MOVETO)
        elif op == "l":
            v.append(pts[0]); c.append(P.LINETO)
        elif op == "c":
            v += pts; c += [P.CURVE4] * len(pts)
        elif op == "q":
            v += pts; c += [P.CURVE3] * len(pts)
        elif op == "z" and v:
            v.append(v[-1]); c.append(P.CLOSEPOLY)
    return P(v, c) if v else None


def _type3_ops(prog: bytes):
    """Operators of a Type 3 glyph program (m l c re h, under one cm), as em-unit outline ops."""
    import re

    import numpy as np

    body = prog.split(b"d1", 1)[1] if b"d1" in prog else prog
    ctm, stack, st, ops = np.eye(3), [], [], []

    def tx(x, y):
        p = np.array([x, y, 1.0]) @ ctm
        return (float(p[0]), float(p[1]))

    for t in re.findall(rb"-?\d*\.\d+|-?\d+|[A-Za-z*]+\d?", body):
        if not t[:1].isalpha():
            st.append(float(t))
            continue
        if t == b"cm":
            a, b, c, d, e, f = st[-6:]
            ctm = np.array([[a, b, 0], [c, d, 0], [e, f, 1]]) @ ctm
        elif t == b"q":
            stack.append(ctm.copy())
        elif t == b"Q":
            ctm = stack.pop() if stack else np.eye(3)
        elif t == b"m":
            ops.append(("m", [tx(*st[-2:])]))
        elif t == b"l":
            ops.append(("l", [tx(*st[-2:])]))
        elif t == b"c":
            ops.append(("c", [tx(*st[-6:-4]), tx(*st[-4:-2]), tx(*st[-2:])]))
        elif t == b"re":
            x, y, w, h = st[-4:]
            ops += [("m", [tx(x, y)]), ("l", [tx(x + w, y)]), ("l", [tx(x + w, y + h)]), ("l", [tx(x, y + h)]), ("z", [])]
        elif t == b"h":
            ops.append(("z", []))
        st = []
    return ops


def _inventory(pdf_path):
    """{key: (outline ops, a font name)} for every glyph of every unreadable font."""
    import io

    import pikepdf
    from fontTools.cffLib import CFFFontSet
    from fontTools.pens.recordingPen import RecordingPen

    shapes = {}
    names = {"moveTo": "m", "lineTo": "l", "curveTo": "c", "qCurveTo": "q", "closePath": "z", "endPath": "z"}
    with pikepdf.open(pdf_path) as pdf:
        for f, kind, codes in font_repair.unreadable_fonts(pdf):
            todo = set(codes.values()) - set(shapes)
            if not todo:
                continue
            if kind == "type3":
                for proc in f.CharProcs.values():
                    b = proc.read_bytes()
                    k = font_repair.type3_key(b)
                    if k in todo:
                        shapes[k] = (_type3_ops(b), str(f.get("/BaseFont", "Type 3")))
            else:
                cs = CFFFontSet()
                cs.decompile(io.BytesIO(f.DescendantFonts[0].FontDescriptor.FontFile3.read_bytes()), None)
                top = cs[cs.fontNames[0]]
                for name in top.getGlyphOrder():
                    pen = RecordingPen()
                    top.CharStrings[name].draw(pen)
                    k = font_repair.outline_key(pen.value)
                    if k in todo:
                        ops = [(names[op], [(x / 1000, y / 1000) for x, y in pts]) for op, pts in pen.value]
                        shapes[k] = (ops, str(f.BaseFont))
    return shapes


def sheets(pdf_path, out: Path):
    import numpy as np
    from fontTools.pens.basePen import BasePen
    from fontTools.ttLib import TTFont
    from PIL import Image, ImageDraw, ImageFont
    from scipy.ndimage import gaussian_filter, shift

    out.mkdir(parents=True, exist_ok=True)
    chars = [c for c in string.printable if c.strip()] + ["₹", "…", "–", "—", "‘", "’"]
    refs = []
    for fam in ("Serif", "Sans"):
        for style in ("Regular", "Bold", "Italic", "BoldItalic"):
            font = TTFont(str(LIBERATION / f"Liberation{fam}-{style}.ttf"))
            cmap, gs, upm = font.getBestCmap(), font.getGlyphSet(), font["head"].unitsPerEm
            for ch in chars:
                if ord(ch) not in cmap:
                    continue
                ops = []

                class Pen(BasePen):
                    def _moveTo(self, p): ops.append(("m", [(p[0] / upm, p[1] / upm)]))
                    def _lineTo(self, p): ops.append(("l", [(p[0] / upm, p[1] / upm)]))
                    def _curveToOne(self, a, b, c): ops.append(("c", [(q[0] / upm, q[1] / upm) for q in (a, b, c)]))
                    def _closePath(self): ops.append(("z", []))

                gs[cmap[ord(ch)]].draw(Pen(gs))
                refs.append((ch, gaussian_filter(_raster(_path(ops)), 1.2).ravel()))
    R = np.stack([r[1] for r in refs])
    R = R - R.mean(1, keepdims=True)
    R /= np.linalg.norm(R, axis=1, keepdims=True) + 1e-9

    shapes = _inventory(pdf_path)
    proposal = {}
    for k, (ops, _) in shapes.items():
        p = _path(ops)
        if p is None:
            proposal[k] = (" ", 1.0, "")
            continue
        img, best = _raster(p), None
        for dx in (-2, -1, 0, 1, 2):
            for dy in (-2, -1, 0, 1, 2):
                g = gaussian_filter(shift(img, (dy, dx), order=0), 1.2).ravel()
                g = g - g.mean()
                n = np.linalg.norm(g)
                if n and (best is None or (R @ (g / n)).max() > best.max()):
                    best = R @ (g / n)
        order = np.argsort(-best)
        first = refs[order[0]][0]
        runner = next(i for i in order if refs[i][0] != first)
        margin = float(best[order[0]] - best[runner])
        proposal[k] = (first, margin, refs[runner][0])

    keys = sorted(proposal, key=lambda k: (proposal[k][0], -proposal[k][1]))
    label = ImageFont.load_default()
    cols, cw, chh, per = 20, 60, 92, 200
    for s in range(0, len(keys), per):
        page = keys[s:s + per]
        im = Image.new("L", (cols * cw, ((len(page) + cols - 1) // cols) * chh), 255)
        d = ImageDraw.Draw(im)
        for i, k in enumerate(page):
            x, y = (i % cols) * cw, (i // cols) * chh
            p = _path(shapes[k][0])
            a = _raster(p) if p is not None else np.zeros((H, W))
            im.paste(Image.fromarray((255 - a * 255).astype("uint8")), (x + 2, y + 2))
            ch, margin, runner = proposal[k]
            d.rectangle([x, y, x + cw - 1, y + chh - 1], outline=180)
            d.text((x + 3, y + 66), (ch if ch != " " else "sp") + (f"  ?{runner}" if margin < 0.05 else ""), fill=0, font=label)
            d.text((x + 3, y + 78), str(s + i), fill=110, font=label)
        im.save(out / f"sheet-{s // per}.png")
    doc = {"book": Path(pdf_path).name, "source_sha256": font_repair.sha256(pdf_path), "reviewed": False,
           "order": keys, "glyphs": {k: proposal[k][0] for k in keys}}
    (out / "proposed-map.json").write_text(json.dumps(doc, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"{len(keys)} glyph shapes; sheets and proposed-map.json in {out}. Check every cell before use.")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="step", required=True)
    a = sub.add_parser("sheets")
    a.add_argument("pdf", type=Path)
    a.add_argument("out", type=Path)
    b = sub.add_parser("apply")
    b.add_argument("pdf", type=Path)
    b.add_argument("map", type=Path)
    b.add_argument("dst", type=Path)
    args = ap.parse_args()
    if args.step == "sheets":
        sheets(args.pdf, args.out)
    else:
        m = json.loads(args.map.read_text(encoding="utf-8"))
        if m.get("reviewed") is False:
            raise SystemExit("this map has not been checked by eye yet; see the steps at the top of this script")
        print(font_repair.repair(args.pdf, args.dst, m))


if __name__ == "__main__":
    main()
