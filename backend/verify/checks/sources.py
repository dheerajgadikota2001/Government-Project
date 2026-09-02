"""
Does every figure on this platform lead back to a document?

The platform's whole claim is that a reader can check any number against the
government's own record. That claim is only as good as the weakest citation,
so these checks walk every seed looking for a figure whose trail runs cold.

Three ways a trail runs cold, in increasing order of seriousness:
  * a source entry exists but has no URL — the reader is told a document's
    name and left to find it;
  * a record names a source key that is not in the file's source map — the
    citation points at nothing;
  * a record carries a figure and names no source at all.
"""

from __future__ import annotations

import re

from typing import Any, Iterable

from .base import FAIL, INFO, WARN, Ctx, Finding, check

# Keys that carry a citation, across the different seed shapes in this repo.
SOURCE_KEYS = ("source", "doc", "source_key", "src")
# Keys whose value is a URL we expect to be usable.
URL_KEYS = ("url", "pdf", "source_url", "website", "portal", "profile_url")


def _walk(node: Any, path: str = ""):
    """Yield (path, dict) for every object in the tree, depth-first."""
    if isinstance(node, dict):
        yield path, node
        for k, v in node.items():
            yield from _walk(v, f"{path}.{k}" if path else k)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from _walk(v, f"{path}[{i}]")


def _source_map(seed: Any) -> dict:
    """The file's own registry of documents, whatever shape it takes."""
    if not isinstance(seed, dict):
        return {}
    src = seed.get("sources")
    if isinstance(src, dict):
        return src
    if isinstance(src, list):  # departments_seed.json uses a list
        out = {}
        for s in src:
            if isinstance(s, dict):
                key = s.get("key") or s.get("label") or s.get("title")
                if key:
                    out[key] = s
        return out
    return {}


@check("sources.resolve", "Every named source resolves to a document")
def sources_resolve(ctx: Ctx) -> Iterable[Finding]:
    for name, seed in ctx.seeds.items():
        smap = _source_map(seed)
        if not smap:
            continue
        seen: set[str] = set()
        for path, node in _walk(seed):
            if path.startswith("sources"):
                continue
            for k in SOURCE_KEYS:
                v = node.get(k)
                if not isinstance(v, str) or not v:
                    continue
                seen.add(v)
                if v not in smap:
                    yield Finding(
                        FAIL, "sources.resolve", name, f"{path}.{k}",
                        f"cites source key {v!r}, which is not in this file's sources map",
                        "Add the document to `sources`, or correct the key. A citation that "
                        "points at nothing is worse than no citation, because it looks checked.",
                        {"key": v, "known": sorted(smap)[:12]},
                    )
        unused = sorted(set(smap) - seen)
        if unused:
            yield Finding(
                INFO, "sources.resolve", name, "sources",
                f"{len(unused)} source entries are never cited by any record",
                "Harmless, but if one of these was meant to back a figure, that figure is uncited.",
                {"unused": unused[:20]},
            )


@check("sources.url", "Every document has somewhere a reader can go")
def sources_have_urls(ctx: Ctx) -> Iterable[Finding]:
    for name, seed in ctx.seeds.items():
        for key, src in _source_map(seed).items():
            if not isinstance(src, dict):
                continue
            has = any(isinstance(src.get(u), str) and src[u].startswith("http")
                      for u in ("url", "pdf", "url_pattern", "source_url", "link"))
            if not has:
                yield Finding(
                    WARN, "sources.url", name, f"sources.{key}",
                    "names a document but gives no link to it",
                    "Add `url` (the page it is published on) and `pdf` (the file itself) so a "
                    "reader can open it in one click rather than searching for the title.",
                    {"title": src.get("title")},
                )
            # Seeds title a document as `title`, `label` or `name` depending on
            # which shape they use. Any of the three is a real title.
            if not any(src.get(k) for k in ("title", "label", "name")):
                yield Finding(
                    WARN, "sources.url", name, f"sources.{key}",
                    "has no title, so it will render as a bare key",
                    "Give it the document's own printed title, verbatim.",
                )
            if not src.get("publisher"):
                yield Finding(
                    INFO, "sources.url", name, f"sources.{key}",
                    "has no publisher",
                    "Name the body that published it. 'The Reserve Bank reprinting a health "
                    "ministry figure' is a real distinction this platform makes elsewhere.",
                )


@check("sources.section", "Every section's source chips resolve")
def section_sources(ctx: Ctx) -> Iterable[Finding]:
    """`section_sources` drives the little document chips under each chart."""
    for name, seed in ctx.seeds.items():
        if not isinstance(seed, dict):
            continue
        secs = seed.get("section_sources")
        if not isinstance(secs, dict):
            continue
        smap = _source_map(seed)
        for sec, keys in secs.items():
            if not isinstance(keys, list):
                continue
            for k in keys:
                if k not in smap:
                    yield Finding(
                        FAIL, "sources.section", name, f"section_sources.{sec}",
                        f"lists source {k!r}, which is not in the sources map",
                        "The chips under that chart would render blank. Add the document or "
                        "drop the key.",
                    )


@check("sources.https", "Links are https and not obviously dead")
def link_shape(ctx: Ctx) -> Iterable[Finding]:
    """Shape only — reachability is a separate, network-bound check."""
    for name, seed in ctx.seeds.items():
        for path, node in _walk(seed):
            for k in URL_KEYS:
                v = node.get(k)
                if not isinstance(v, str) or not v.strip():
                    continue
                for one in [p.strip() for p in v.split(";")]:
                    if not one:
                        continue
                    if not one.lower().startswith(("http://", "https://")):
                        # Several seeds legitimately hold a phone number or a
                        # bare hostname in these fields; only flag things that
                        # look like they were meant to be links.
                        if "." in one and " " not in one:
                            yield Finding(
                                WARN, "sources.https", name, f"{path}.{k}",
                                f"looks like a link but has no scheme: {one!r}",
                                "Write the full https:// address, so it is clickable and so the "
                                "link checker can reach it.",
                            )
                        continue
                    if one.lower().startswith("http://"):
                        yield Finding(
                            WARN, "sources.https", name, f"{path}.{k}",
                            "is a plain http link",
                            "Use https. Several government hosts redirect, and a mixed-content "
                            "link is blocked outright in some browsers.",
                            {"url": one},
                        )

# Fields the pages resolve with firstUrl() before rendering: in these, a
# labelled list or a trailing note is a deliberate convention, and the check
# must judge the address the reader actually gets, not the raw string.
EXTRACTS_FIRST_URL = {"portal", "source_url", "url"}

# A citation a reader cannot open is not a citation. But almost nothing about
# whether a URL resolves can be read off its shape, and this check learned that
# the hard way: it first treated '...' and '@' inside a path as proof of a
# mangled address, and reported 17 working government PDFs as dead. The AP
# Finance Department really does serve its budget volumes out of a directory
# named '...Bud@et26-27'. Ugly is not the same as broken.
#
# So the shape rules here are only the ones where the string cannot be a usable
# href no matter what any server does with it. Everything else — including
# every odd-looking but well-formed path — is left to links.alive, which asks
# the server instead of guessing.
_UNUSABLE = (
    ("{", "has an unsubstituted '{...}' template slot"),
    ("TODO", "is marked TODO"),
    ("XXX", "is marked XXX"),
    ("example.com", "points at example.com"),
    ("localhost", "points at localhost"),
)


def _first_url(piece: str) -> "str | None":
    """The address a reader gets — the rule Contacts.jsx's firstUrl() uses."""
    m = re.search(r"https?://\S+", piece)
    if not m:
        return None
    url = m.group(0)
    return url if "(" in url else url.rstrip(")")


@check("sources.openable", "Every cited link is an address that can actually be opened")
def link_openable(ctx: Ctx) -> Iterable[Finding]:
    """Shape again, but the part that decides whether a reader gets anywhere.

    `sources.https` asks whether a link is written safely. This asks whether it
    is written at all. A placeholder URL passes every scheme test ever written,
    renders as an ordinary blue link, and fails only in the hands of the one
    reader who tries to check a figure — the only reader this platform is for.

    One finding per distinct bad address per file: 212 rows sharing four broken
    links are four problems, not 212.
    """
    seen: set = set()

    def once(kind: str, name: str, url: str) -> bool:
        if (kind, name, url) in seen:
            return False
        seen.add((kind, name, url))
        return True

    for name, seed in ctx.seeds.items():
        for path, node in _walk(seed):
            for k in URL_KEYS:
                v = node.get(k)
                if not isinstance(v, str) or not v.strip():
                    continue
                where = f"{path}.{k}"
                # ';' separates several citations in one field — the seed's own
                # convention, and what sources.https already assumes.
                for piece in [q.strip() for q in v.split(";")]:
                    if not piece.lower().startswith(("http://", "https://")):
                        continue

                    if k in EXTRACTS_FIRST_URL:
                        # Judge what the page renders, not the annotation.
                        link = _first_url(piece)
                        if not link:
                            continue
                    elif " (" in piece or " and http" in piece or " / http" in piece:
                        # Handed to href whole, so the note lands in the href.
                        if once("prose", name, piece):
                            yield Finding(
                                FAIL, "sources.openable", name, where,
                                f"holds commentary or a second address inside one link: {piece!r}",
                                "Separate citations with ';' as the rest of this seed does and move "
                                "any note into its own field, or resolve this field through the "
                                "page's firstUrl() helper. As written the whole string becomes the "
                                "href and nothing opens.",
                                {"url": piece},
                            )
                        continue
                    else:
                        link = piece

                    rest = link.split("://", 1)[1]

                    # A deliberate template the caller must fill in: legitimate
                    # in a seed, fatal if it ever reaches the page.
                    if "<" in rest and ">" in rest:
                        if once("template", name, link):
                            yield Finding(
                                WARN, "sources.openable", name, where,
                                f"is a template, not an address: {link!r}",
                                "Confirm the page substitutes the placeholder before rendering the "
                                "link. If it cannot, store one worked example instead.",
                                {"url": link},
                            )
                        continue

                    why = next((r for m, r in _UNUSABLE if m in rest), None)
                    if why is None and " " in rest:
                        why = "contains a raw space, which browsers and the link checker both mangle"
                    if why and once("mangled", name, link):
                        yield Finding(
                            FAIL, "sources.openable", name, where,
                            f"cited link {why}: {link!r}",
                            "Write an address a browser can actually request. This check only "
                            "reports strings that cannot be a usable href at all; whether a "
                            "well-formed URL is alive is links.alive's question, not this one.",
                            {"url": link},
                        )
