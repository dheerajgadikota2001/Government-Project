"""Give a PDF's fonts their letters back, from a glyph map checked by eye.

WHY THIS EXISTS
Two of CAG's Appropriation Accounts for Andhra Pradesh, 2016-17 and 2021-22,
print correctly but carry no text a program can read:
  * 2016-17 was printed through a PostScript driver that turned every letter
    into a Type 3 drawing with no map from glyph to letter (371 fonts, 742
    different glyph shapes);
  * 2021-22 embeds 122 CID fonts with no ToUnicode map (231 shapes).
So the spending of those two years could not be checked against the budget
books, which left 80 department-years unchecked on the site.

A glyph is identified by its shape, not by its code: the codes mean nothing
across fonts, while the same letter has the same outline everywhere in a
book. Each distinct outline was drawn, matched against Liberation Serif and
Sans, and every match was then checked by eye on contact sheets
(scripts/repair_cag_fonts.py makes them); the matcher's mistakes, such as
italic 1 taken for J and bold 5 for $, were corrected by hand. The result is
a map from outline to letter, kept in app/scrapers/glyph_maps/, one file per
book, with the SHA-256 of the exact file it was made from.

repair() adds a ToUnicode map to each font and changes nothing else: every
glyph stays where CAG printed it. It refuses a file whose fingerprint differs
from the map's, and a glyph the map does not know, so a changed file can never
be misread quietly.

Needs pikepdf and fontTools (requirements-data.txt). The API does not.
"""
from __future__ import annotations

import hashlib
import io
import json
from pathlib import Path

MAPS = Path(__file__).resolve().parent / "glyph_maps"
UNKNOWN = "�"   # a font's empty 'missing glyph' box: kept as unknown, never guessed


def sha256(path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def type3_key(charproc_bytes: bytes) -> str:
    return "t3:" + hashlib.sha1(charproc_bytes).hexdigest()


def outline_key(recording) -> str:
    """A CFF glyph's outline as drawn, rounded so the key does not depend on float printing."""
    norm = [[op, [[round(float(x), 4), round(float(y), 4)] for x, y in pts]] for op, pts in recording]
    return "cff:" + hashlib.sha1(json.dumps(norm, separators=(",", ":")).encode()).hexdigest()


def _type3_codes(font):
    """code -> key for a Type 3 font, through its /Differences."""
    import pikepdf

    out, code = {}, None
    for item in font.Encoding.Differences:
        if not isinstance(item, pikepdf.Name):
            code = int(item)
            continue
        proc = font.CharProcs.get(item)
        if proc is not None:
            out[code] = type3_key(proc.read_bytes())
        code += 1
    return out


def _cff_cids(font):
    """cid -> key for a CID font whose program is a CFF (FontFile3)."""
    from fontTools.cffLib import CFFFontSet
    from fontTools.pens.recordingPen import RecordingPen

    desc = font.DescendantFonts[0]
    data = desc.FontDescriptor.FontFile3.read_bytes()
    cs = CFFFontSet()
    cs.decompile(io.BytesIO(data), None)
    top = cs[cs.fontNames[0]]
    cid_keyed = hasattr(top, "ROS")
    out = {}
    for gid, name in enumerate(top.getGlyphOrder()):
        cid = int(name[3:]) if cid_keyed and name.startswith("cid") else gid
        pen = RecordingPen()
        top.CharStrings[name].draw(pen)
        out[cid] = outline_key(pen.value)
    return out


def unreadable_fonts(pdf):
    """Every font with no letters a program can read: (font, kind, {code: key})."""
    seen = set()
    for page in pdf.pages:
        fonts = page.obj.get("/Resources", {}).get("/Font") or {}
        for _, f in fonts.items():
            if f.objgen in seen:
                continue
            seen.add(f.objgen)
            if "/ToUnicode" in f:
                continue
            sub = f.get("/Subtype")
            if sub == "/Type3":
                yield f, "type3", _type3_codes(f)
            elif sub == "/Type0":
                d = f.DescendantFonts[0]
                if d.Subtype == "/CIDFontType0" and "/FontFile3" in d.FontDescriptor:
                    yield f, "cid", _cff_cids(f)


def _cmap(pairs, two_byte: bool) -> bytes:
    lines = ["/CIDInit /ProcSet findresource begin", "12 dict begin", "begincmap",
             "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
             "/CMapName /Adobe-Identity-UCS def", "/CMapType 2 def", "1 begincodespacerange",
             "<0000> <FFFF>" if two_byte else "<00> <FF>", "endcodespacerange"]
    fmt = "<%04X> <%s>" if two_byte else "<%02X> <%s>"
    pairs = sorted(pairs)
    for i in range(0, len(pairs), 100):
        chunk = pairs[i:i + 100]
        lines.append("%d beginbfchar" % len(chunk))
        lines += [fmt % (code, "".join("%04X" % ord(c) for c in text)) for code, text in chunk]
        lines.append("endbfchar")
    lines += ["endcmap", "CMapName currentdict /CMap defineresource pop", "end", "end"]
    return "\n".join(lines).encode()


def load_map(name: str) -> dict:
    return json.loads((MAPS / name).read_text(encoding="utf-8"))


def repair(src, dst, glyph_map: dict) -> dict:
    """Write a copy of src whose unreadable fonts carry a ToUnicode map. Returns counts."""
    import pikepdf

    if sha256(src) != glyph_map["source_sha256"]:
        raise ValueError(f"{src} is not the file this glyph map was made from (SHA-256 differs); "
                         "a new file needs its own map, checked by eye")
    glyphs = glyph_map["glyphs"]
    fonts = missing = 0
    with pikepdf.open(src) as pdf:
        for f, kind, codes in unreadable_fonts(pdf):
            unknown = sorted({k for k in codes.values() if k not in glyphs})
            if unknown:
                missing += len(unknown)
                continue
            pairs = [(c, glyphs[k]) for c, k in codes.items() if not (kind == "cid" and c == 0)]
            f.ToUnicode = pdf.make_stream(_cmap(pairs, two_byte=(kind == "cid")))
            fonts += 1
        if missing:
            raise ValueError(f"{missing} glyph shape(s) in {src} are not in the map; nothing written")
        pdf.save(dst)
    return {"fonts": fonts}
