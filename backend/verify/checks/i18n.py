"""
Would any reader see a raw key, or an English string, where their language should be?

Six languages ship at exact key parity. Parity is not a nicety here: a missing
key falls back to English, which means a Telugu reader silently gets an English
sentence in the middle of a Telugu page and has no way to know the site is not
finished. So the harness treats a gap as a defect rather than a to-do.

It also checks the other direction — every key the code asks for must exist —
because a typo'd key renders as the key itself, which looks like a broken site.
"""

from __future__ import annotations

import json
import os
import re
from typing import Iterable

from .base import FAIL, INFO, WARN, Ctx, Finding, check

# t('some.key') and t("some.key"), plus the nav tables that pass keys as data.
T_CALL = re.compile(r"""\bt\(\s*['"]([A-Za-z0-9_.]+)['"]""")
KEY_PROP = re.compile(r"""\bkey:\s*['"]((?:nav|depts|facts|contacts)\.[A-Za-z0-9_.]+)['"]""")
PLACEHOLDER = re.compile(r"\{([A-Za-z0-9_]+)\}")
# Keys that exist only as documentation examples inside the i18n layer itself.
DOC_KEYS = {"a.b", "x.one", "x.other"}


def _leaves(o, pre="") -> dict:
    out = {}
    for k, v in (o or {}).items():
        p = f"{pre}{k}"
        if isinstance(v, dict):
            out.update(_leaves(v, p + "."))
        else:
            out[p] = v
    return out


def _locales(ctx: Ctx) -> dict[str, dict]:
    out = {}
    if not os.path.isdir(ctx.locale_dir):
        return out
    for f in sorted(os.listdir(ctx.locale_dir)):
        if f.endswith(".json") and ".bak" not in f:
            try:
                with open(os.path.join(ctx.locale_dir, f), encoding="utf-8") as fh:
                    out[f[:-5]] = _leaves(json.load(fh))
            except Exception as exc:
                out[f[:-5]] = {"__load_error__": str(exc)}
    return out


@check("i18n.parity", "All six languages carry exactly the same keys")
def parity(ctx: Ctx) -> Iterable[Finding]:
    locs = _locales(ctx)
    if "en" not in locs:
        yield Finding(FAIL, "i18n.parity", "locales", "en.json",
                      "the English catalogue is missing or unreadable",
                      "Every other language falls back to English. Without it the site renders keys.")
        return
    en = set(locs["en"])
    for code, cat in locs.items():
        if code == "en":
            continue
        missing, extra = sorted(en - set(cat)), sorted(set(cat) - en)
        if missing:
            yield Finding(
                FAIL, "i18n.parity", f"{code}.json", "keys",
                f"{len(missing)} keys are missing, so those strings render in English",
                "Translate them. A reader who chose Telugu and gets an English paragraph has no "
                "way to tell whether the site is broken or the fact is untranslatable.",
                {"missing": missing[:25], "total_missing": len(missing)},
            )
        if extra:
            yield Finding(
                WARN, "i18n.parity", f"{code}.json", "keys",
                f"{len(extra)} keys exist here but not in English",
                "Usually a leftover from a renamed key. Remove them, or add the English.",
                {"extra": extra[:25]},
            )
    yield Finding(INFO, "i18n.parity", "locales", "-",
                  f"{len(locs)} languages, {len(en)} keys each", "No action.")


@check("i18n.used", "Every key the code asks for exists")
def keys_used(ctx: Ctx) -> Iterable[Finding]:
    locs = _locales(ctx)
    en = set(locs.get("en", {}))
    if not en or not os.path.isdir(ctx.src_dir):
        return
    used: set[str] = set()
    for root, _dirs, files in os.walk(ctx.src_dir):
        for fn in files:
            if not fn.endswith((".jsx", ".js")) or ".bak" in fn:
                continue
            try:
                s = open(os.path.join(root, fn), encoding="utf-8").read()
            except Exception:
                continue
            used |= set(T_CALL.findall(s)) | set(KEY_PROP.findall(s))
    missing = sorted(k for k in used - en if k not in DOC_KEYS)
    if missing:
        yield Finding(
            FAIL, "i18n.used", "locales/en.json", "keys",
            f"{len(missing)} keys are requested by the code but do not exist",
            "Add them. A missing key renders as the key itself, which is the most visibly "
            "broken thing a page can do.",
            {"missing": missing[:30]},
        )
    else:
        yield Finding(INFO, "i18n.used", "locales/en.json", "keys",
                      f"all {len(used)} keys used in the code exist", "No action.")


@check("i18n.placeholders", "A translation never loses a placeholder")
def placeholders(ctx: Ctx) -> Iterable[Finding]:
    locs = _locales(ctx)
    en = locs.get("en") or {}
    for code, cat in locs.items():
        if code == "en":
            continue
        for k, v in cat.items():
            if k not in en or not isinstance(v, str) or not isinstance(en[k], str):
                continue
            want, got = set(PLACEHOLDER.findall(en[k])), set(PLACEHOLDER.findall(v))
            if want != got:
                yield Finding(
                    FAIL, "i18n.placeholders", f"{code}.json", k,
                    f"placeholders differ from English: expected {sorted(want)}, found {sorted(got)}",
                    "Restore the exact braces. A dropped placeholder means a number never "
                    "appears; an invented one renders literally as {name} on the page.",
                )


@check("i18n.digits", "Numbers stay in Latin digits in every language")
def digits(ctx: Ctx) -> Iterable[Finding]:
    """
    Telugu, Tamil, Devanagari and Odia all have their own numerals. Newspapers in
    those languages set data in Latin digits, and every chart axis on this site
    does too — a translation that switches numerals makes the prose disagree with
    the chart beside it.
    """
    ranges = [(0x0966, 0x096F), (0x09E6, 0x09EF), (0x0B66, 0x0B6F),
              (0x0BE6, 0x0BEF), (0x0C66, 0x0C6F), (0x0660, 0x0669), (0x06F0, 0x06F9)]
    def native(ch: str) -> bool:
        c = ord(ch)
        return any(lo <= c <= hi for lo, hi in ranges)
    for code, cat in _locales(ctx).items():
        for k, v in cat.items():
            if isinstance(v, str) and any(native(ch) for ch in v):
                yield Finding(
                    WARN, "i18n.digits", f"{code}.json", k,
                    "contains non-Latin numerals",
                    "Use Latin digits (1, 2, 3). The charts do, and the prose has to match them.",
                    {"text": v[:80]},
                )
