#!/usr/bin/env python3
"""
Regenerates the shipped Material Symbols subset.

Why: the vendored Material Symbols variable font is 3.8 MB — 6,605 icons and
four variable axes — and this app draws about fifty of them. Every first-time
visitor downloaded all 6,605, which on a phone over mobile data was several
seconds of empty icon slots. This script cuts that to the icons the source
actually references (~8 KB, a 99.8% reduction).

The font stays vendored rather than pulled from Google at runtime: some Indian
ISPs block fonts.gstatic.com, and when this font fails to load every icon
degrades to its raw ligature name ("expand_more", "search") as visible text,
which reads as a broken page. This script needs no network either — it cuts the
subset out of the full font already in the repo.

    pip install fonttools brotli        (once)
    python scripts/icon-font.py         (after adding or removing an icon)

Two details that are easy to get wrong and cost most of the win:

1. The unused variable axes are pinned first. Subsetting alone left 2.8 MB
   because the variation data for wght/GRAD/opsz is stored per glyph. FILL is
   deliberately kept live — the bottom nav fills the active icon.
2. Subsetting is done by GLYPH, with layout closure off. Subsetting by text
   keeps almost the whole font: icon names share the same 26 letters, so the
   subsetter follows every ligature those letters can form and drags nearly all
   6,605 icons back in.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
FULL_FONT = SRC / "fonts" / "material-symbols-outlined.woff2"
SUBSET = SRC / "fonts" / "material-symbols-subset.woff2"
MANIFEST = SRC / "fonts" / "icons.generated.json"

# Icons reach the DOM two ways: as the body of a `.material-symbols-outlined`
# span, or as an `icon:`/`icon=` value in a config object a span later renders.
#
# The span body is not always a bare word — several are ternaries
# (`{menuOpen ? 'close' : 'menu'}`, `{isRTL ? 'chevron_left' : 'chevron_right'}`),
# and an earlier version of this scan read only the first token and silently
# dropped the alternatives. So the body is captured whole and every *quoted*
# string inside it is taken; quoting is what separates an icon name from a
# variable like `menuOpen`.
SPAN = re.compile(
    r"class(?:Name)?=\"[^\"]*material-symbols-outlined[^\"]*\"[^>]*>([\s\S]*?)</span>"
)
QUOTED = re.compile(r"['\"]([a-z][a-z0-9_]{2,})['\"]")
BARE = re.compile(r"^[a-z][a-z0-9_]{2,}$")
PROP = re.compile(r"\bicon\s*[:=]\s*['\"]([a-z][a-z0-9_]{2,})['\"]")

# A name->icon map (`const TOPIC_ICONS = { suggestions: 'lightbulb' }`) reaches
# the DOM through a variable, so neither the span scan nor the `icon:` scan sees
# it. Any const whose NAME says ICONS is therefore read whole, and every quoted
# value inside it is treated as an icon.
ICON_MAP = re.compile(r"\b\w*ICONS?\w*\s*=\s*\{([\s\S]*?)\n\}", re.I)


def collect_icons() -> list[str]:
    icons: set[str] = set()
    for path in SRC.rglob("*"):
        if path.suffix not in (".jsx", ".js"):
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        for body in SPAN.findall(text):
            inner = body.strip()
            if "{" not in inner:
                if BARE.match(inner):
                    icons.add(inner)
                continue
            # In a ternary the condition can hold quoted values that are not
            # icons (`filters.order === 'asc' ? 'arrow_upward' : ...`), so only
            # the branches — everything after the first `?` — are read.
            branches = inner.split("?", 1)[1] if "?" in inner else inner
            icons.update(QUOTED.findall(branches))
        icons.update(PROP.findall(text))
        for block in ICON_MAP.findall(text):
            icons.update(QUOTED.findall(block))
    return sorted(icons)


def ligature_map(font) -> dict[str, list[str]]:
    """icon name -> the component glyphs that spell it, read out of GSUB."""
    out: dict[str, list[str]] = {}

    def walk(subtable) -> None:
        table = getattr(subtable, "ligatures", None)
        if not table:
            return
        for first, entries in table.items():
            for lig in entries:
                out[lig.LigGlyph] = [first] + list(lig.Component)

    gsub = font["GSUB"].table
    for lookup in gsub.LookupList.Lookup:
        for subtable in lookup.SubTable:
            # Material Symbols wraps its ligatures in extension lookups (type 7).
            walk(subtable.ExtSubTable if lookup.LookupType == 7 else subtable)
    return out


def main() -> int:
    try:
        from fontTools.ttLib import TTFont
        from fontTools.varLib import instancer
    except ImportError:
        print("icons: fonttools is missing. Run:  pip install fonttools brotli", file=sys.stderr)
        return 1

    icons = collect_icons()
    font = TTFont(FULL_FONT)
    ligatures = ligature_map(font)

    missing = [name for name in icons if name not in ligatures]
    if missing:
        print(
            "icons: these names are not in the font and would render as literal "
            f"text on the page: {', '.join(missing)}",
            file=sys.stderr,
        )
        return 1

    keep: set[str] = set()
    for name in icons:
        keep.add(name)
        keep.update(ligatures[name])  # the letters that spell it, for the ligature rule

    # Pin the axes the CSS never varies; keep FILL, which the active nav item uses.
    pinned = instancer.instantiateVariableFont(
        font, {"wght": 400, "GRAD": 0, "opsz": 24}, inplace=False, optimize=True
    )
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        pinned.flavor = "woff2"
        pinned.save(tmp_path / "pinned.woff2")
        (tmp_path / "glyphs.txt").write_text("\n".join(sorted(keep)), encoding="utf-8")
        subprocess.run(
            [
                sys.executable, "-m", "fontTools.subset",
                str(tmp_path / "pinned.woff2"),
                f"--output-file={SUBSET}",
                "--flavor=woff2",
                f"--glyphs-file={tmp_path / 'glyphs.txt'}",
                # Without this the subsetter follows every ligature the retained
                # letters can form and keeps almost the whole font.
                "--no-layout-closure",
                "--layout-features=liga,dlig,ccmp,locl,rlig,calt",
                "--no-hinting",
            ],
            check=True,
        )

    MANIFEST.write_text(
        json.dumps(
            {
                "note": "Generated by scripts/icon-font.py — do not edit by hand.",
                "generated": date.today().isoformat(),
                "count": len(icons),
                "icons": icons,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    before = FULL_FONT.stat().st_size / 1024
    after = SUBSET.stat().st_size / 1024
    print(
        f"icons: {len(icons)} glyphs — {before:,.0f} KB -> {after:,.1f} KB "
        f"({100 * (1 - after / before):.1f}% smaller)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
