"""
Does every figure the project register prints come from the government's own record?

This check exists because of a specific mistake. The Amaravati card printed
"Rs 37,702 cr" in the same slot, in the same type, as Bhogapuram's PIB-sourced
Rs 5,640 cr — and the only place that figure appeared was a Deccan Herald report
of what a minister said. The card also called it one of "2 government documents".
Nothing in the pipeline objected, because nothing in the pipeline knew the
difference between a government domain and a newspaper.

The rule the platform is built on is that a figure comes from the government or
it is not shown as a figure. A newspaper can date an event and can carry a claim,
clearly labelled as a claim. It can never be the source of a number.

So: a cost is printed only when the seed names the government document it came
from, that document is on a government domain, and it is one of the project's own
citations. Anything else FAILs. The default is strict on purpose — a cost with no
stated provenance fails rather than passes, because the failure mode this check
was written for was a figure nobody had been asked to justify.
"""

from __future__ import annotations

import re

from .base import FAIL, INFO, WARN, Ctx, Finding, check

SEED = "projects_seed.json"

# Kept in step with source_tier() in app/routers/project_register.py. The host
# decides, not the publisher string: the publisher string is written by hand and
# "News On AIR" and "Deccan Herald" look equally official to a tired reader.
_GOV_SUFFIXES = (".gov.in", ".nic.in", ".gov", ".rbi.org.in")
_GOV_PREFIXES = ("https://s3.ap-south-1.amazonaws.com/apfinance.gov.in/",)
_COMPANY_HOSTS = {
    "www.airindia.com", "airindia.com", "www.gmrgroup.in", "gmrgroup.in",
    "investor.gmraero.com", "publish-p168597-e1857439.adobeaemcloud.com",
    "www.bseindia.com", "www.nseindia.com", "www.jsw.in", "jsw.in",
    "www.adaniports.com", "adaniports.com",
}


def _host(url) -> str:
    m = re.match(r"https?://([^/]+)", str(url or "").strip(), re.I)
    return (m.group(1) if m else "").lower()


def tier(url) -> str:
    if str(url or "").strip().startswith(_GOV_PREFIXES):
        return "government"
    h = _host(url)
    if not h:
        return "press"
    if any(h.endswith(s) for s in _GOV_SUFFIXES):
        return "government"
    if h in _COMPANY_HOSTS:
        return "company"
    return "press"


def _projects(ctx: Ctx):
    return (ctx.seeds.get(SEED) or {}).get("projects", []) or []


@check("register.govsource", "Every printed project cost names a government document")
def govsource(ctx: Ctx):
    for p in _projects(ctx):
        title = p.get("title") or "(untitled)"
        cost = p.get("estimated_cost_crore")
        if cost is None:
            continue
        url = p.get("cost_source_url")
        if not url:
            yield Finding(
                FAIL, "register.govsource", SEED, f"{title}.estimated_cost_crore",
                f"A cost of {cost} crore is printed with no cost_source_url, so nothing "
                f"says which government document it came from.",
                "Add cost_source_url pointing at the government document that states this "
                "figure. If there isn't one, move the figure to reported_cost_crore with a "
                "reported_cost_source and let the card show no published cost.",
                {"cost_crore": cost},
            )
            continue
        t = tier(url)
        if t != "government":
            yield Finding(
                FAIL, "register.govsource", SEED, f"{title}.cost_source_url",
                f"The cost of {cost} crore is sourced to {_host(url)}, which is a "
                f"{t} source, not a government one. It would be printed as the project's cost.",
                "Move it to reported_cost_crore with a reported_cost_source so it appears as a "
                "labelled claim in the timeline, or replace it with a figure from a G.O., a "
                "central ministry release or an audit report.",
                {"host": _host(url), "tier": t, "cost_crore": cost},
            )
            continue
        urls = {c.get("url") for c in (p.get("citations") or [])}
        if url not in urls:
            yield Finding(
                FAIL, "register.govsource", SEED, f"{title}.cost_source_url",
                "The cost points at a document that is not among this project's citations, "
                "so the figure cannot be checked against the record the page shows.",
                "Add that document to the project's citations, or point cost_source_url at "
                "the citation that actually states the figure.",
                {"url": url},
            )


@check("register.claimlabelled", "A figure we could not trace is labelled, not hidden")
def claimlabelled(ctx: Ctx):
    for p in _projects(ctx):
        title = p.get("title") or "(untitled)"
        reported = p.get("reported_cost_crore")
        if reported is None:
            continue
        if p.get("estimated_cost_crore") is not None:
            yield Finding(
                FAIL, "register.claimlabelled", SEED, f"{title}.reported_cost_crore",
                "A project carries both a printed cost and a reported one. A reader cannot "
                "tell which of the two the card is showing.",
                "Keep one. A traced figure belongs in estimated_cost_crore with its "
                "cost_source_url; an untraced one belongs in reported_cost_crore alone.",
            )
        src = p.get("reported_cost_source") or {}
        missing = [k for k in ("claim", "publisher", "url", "date") if not src.get(k)]
        if missing:
            yield Finding(
                FAIL, "register.claimlabelled", SEED, f"{title}.reported_cost_source",
                f"A reported figure of {reported} crore is shown as a claim, but its source is "
                f"missing {', '.join(missing)}. An unattributed claim is worse than no claim.",
                "Fill in every field: what was claimed, who published it, where, and when.",
            )
        else:
            yield Finding(
                INFO, "register.claimlabelled", SEED, f"{title}",
                f"{reported} crore is shown as a labelled {tier(src.get('url'))} claim, not as "
                f"this project's cost ({src.get('publisher')}, {src.get('date')}).",
                "No action — this is the intended handling of an untraced figure.",
            )


@check("register.tiers", "How much of the register is actually the government's record")
def tiers(ctx: Ctx):
    total = {"government": 0, "company": 0, "press": 0}
    for p in _projects(ctx):
        title = p.get("title") or "(untitled)"
        counts = {"government": 0, "company": 0, "press": 0}
        for c in p.get("citations") or []:
            counts[tier(c.get("url"))] += 1
        for k in total:
            total[k] += counts[k]
        nongov = counts["company"] + counts["press"]
        if nongov and counts["government"] == 0:
            yield Finding(
                WARN, "register.tiers", SEED, title,
                f"This project's whole record is {nongov} non-government source(s). The page "
                f"presents the register as the government's own record.",
                "Find at least one G.O., ministry release or audit reference for it, or "
                "consider whether it belongs in the register yet.",
                {**counts},
            )
        elif nongov:
            yield Finding(
                INFO, "register.tiers", SEED, title,
                f"{counts['government']} government, {counts['company']} company, "
                f"{counts['press']} press.",
                "No action — the card and the timeline both label the difference.",
            )
    yield Finding(
        INFO, "register.tiers", SEED, "(register)",
        f"{total['government']} government · {total['company']} company · {total['press']} press "
        f"across the whole register.",
        "No action — recorded so a drift towards press sourcing is visible.",
    )
