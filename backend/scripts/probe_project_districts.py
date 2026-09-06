"""
Find, with citations, which districts the unplaced projects actually touch.

THE PROBLEM
Forty-eight projects — Polavaram among them — carry no district, because the
one source they came from (the AP Socio-Economic Survey) prints no district
column. They were shown to readers as "statewide", which the Survey never said
and which is not true: Thotapalli Barrage lies across Parvathipuram Manyam,
Vizianagaram and Srikakulam.

The districts are knowable. The AP Water Resources Department publishes a page
per major project naming the district, the mandals and the ayacut. That is a
government source, which is the only kind this platform can cite.

WHY THIS IS A PROBE AND NOT AN IMPORT
It writes nothing. It fetches, extracts what each page says about location, and
prints a proposal — project, district, role, the sentence it was read from, and
the URL. A person reads that and decides. Filling a district field from a
regex is exactly the kind of confident nonsense the NULL was protecting us
from; the difference between this and an importer is the human in the middle.

WHY IT RUNS IN THE CLOUD RUN JOB
irrigationap.cgg.gov.in answers Indian IPs. It is unreachable from anywhere
else we develop, so this runs where the scrapers run:

    gcloud run jobs execute apnn-probe --region asia-south1 --wait \
      --args="scripts/probe_project_districts.py"

    # narrow it while iterating
    --args="scripts/probe_project_districts.py,--only,Polavaram"
    --args="scripts/probe_project_districts.py,--index-only"

Output goes to the job log, because the container is destroyed when it exits.
"""

import argparse
import asyncio
import json
import os
import re
import sys
from typing import Optional
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.constants.districts import AP_DISTRICTS, normalise_district  # noqa: E402

WRD_BASE = "https://irrigationap.cgg.gov.in/wrd/"
# The department's own project directory. Listed rather than guessed: a wrong
# path here produces a confident empty result, which is the worst outcome.
INDEX_CANDIDATES = (
    "https://irrigationap.cgg.gov.in/wrd/projects",
    "https://irrigationap.cgg.gov.in/wrd/static/approjects/",
    "https://irrigationap.cgg.gov.in/wrd/home",
)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; APFactCheckBot/1.0; +https://apfactcheck.dheeco.com) "
        "citizen transparency platform"
    ),
    "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
    "Accept-Language": "en-IN,en;q=0.9,te;q=0.8",
}

SEED = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "seed", "state_projects_seed.json",
)

RULE = "=" * 74

# Words that decide what a district mention MEANS. A page naming a district
# under "submergence" is making a different claim from one naming it under
# "ayacut", and flattening the two would lose the only part a single district
# column could never carry.
ROLE_HINTS = (
    ("submergence", ("submerg", "displaced", "rehabilitation", "r&r")),
    ("canal", ("canal", "distributary", "branch", "lift", "pipeline")),
    ("ayacut", ("ayacut", "irrigat", "command area", "stabilis", "stabiliz")),
    ("primary", ("located", "situated", "headworks", "barrage across", "dam across",
                 "constructed across", "site")),
)


def squash(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def unplaced_titles() -> list[dict]:
    """The projects with no district, straight from the seed."""
    with open(SEED, encoding="utf-8") as handle:
        data = json.load(handle)
    items = data if isinstance(data, list) else next(
        v for v in data.values() if isinstance(v, list) and v and isinstance(v[0], dict)
    )
    return [p for p in items if not p.get("district")]


def districts_in(text: str) -> list[str]:
    """Every canonical AP district named in a piece of text.

    Matched on the canonical list rather than a general place-name search: the
    point is to produce values the map and the filters can already join on, and
    a mandal name we cannot resolve is worse than nothing.
    """
    found = []
    low = text.lower()
    # AP_DISTRICTS is a list of {code, name, hq} — not bare strings.
    for entry in AP_DISTRICTS:
        name = entry["name"] if isinstance(entry, dict) else str(entry)
        variants = {name.lower()}
        # The department's pages predate the 2022 reorganisation in places and
        # spell several districts their own way.
        variants |= {
            name.lower().replace("dr. b.r. ambedkar ", ""),
            name.lower().replace("sri ", "").replace("s.p.s.r. ", ""),
        }
        if any(v and v in low for v in variants):
            canon = normalise_district(name)
            if canon and canon not in found:
                found.append(canon)
    return found


def role_for(sentence: str) -> str:
    low = sentence.lower()
    for role, words in ROLE_HINTS:
        if any(w in low for w in words):
            return role
    return "stated"


def sentences_naming_districts(html: str) -> list[tuple[str, list[str]]]:
    """Sentences that name at least one district, with the districts they name.

    The sentence is kept because it is the evidence. A proposal that says only
    "Polavaram → East Godavari" asks to be trusted; one that also prints the
    line it was read from can be checked in seconds.
    """
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "nav", "footer"]):
        tag.decompose()
    text = squash(soup.get_text(" "))
    out = []
    for raw in re.split(r"(?<=[.;])\s+", text):
        sentence = squash(raw)
        if len(sentence) < 20 or len(sentence) > 400:
            continue
        names = districts_in(sentence)
        if names:
            out.append((sentence, names))
    return out


async def fetch(client: httpx.AsyncClient, url: str) -> Optional[str]:
    try:
        response = await client.get(url, timeout=45, follow_redirects=True)
    except Exception as exc:                       # noqa: BLE001
        print(f"    ! {type(exc).__name__}: {exc}")
        return None
    print(f"    {response.status_code} {len(response.content):>8} bytes  {url}")
    return response.text if response.status_code == 200 else None


async def find_index(client: httpx.AsyncClient) -> list[tuple[str, str]]:
    """Project links from whichever index page answers."""
    for candidate in INDEX_CANDIDATES:
        html = await fetch(client, candidate)
        if not html:
            continue
        soup = BeautifulSoup(html, "html.parser")
        links = []
        for a in soup.find_all("a", href=True):
            label = squash(a.get_text())
            href = a["href"]
            if len(label) < 6:
                continue
            if re.search(r"project|barrage|reservoir|scheme|dam|lift", label, re.I) \
               or re.search(r"approjects", href, re.I):
                links.append((label, urljoin(candidate, href)))
        if links:
            print(f"  index: {candidate} → {len(links)} project link(s)")
            return links
    return []


def match(title: str, links: list[tuple[str, str]]) -> list[tuple[str, str]]:
    """Candidate pages for one project title, by shared significant words."""
    stop = {"project", "scheme", "the", "of", "and", "lift", "irrigation", "ap",
            "andhra", "pradesh", "trail", "ses"}
    want = {w for w in re.findall(r"[a-z]+", title.lower()) if len(w) > 3 and w not in stop}
    scored = []
    for label, url in links:
        have = {w for w in re.findall(r"[a-z]+", label.lower()) if len(w) > 3}
        overlap = want & have
        if overlap:
            scored.append((len(overlap), label, url))
    scored.sort(reverse=True)
    return [(label, url) for _, label, url in scored[:3]]


async def main(only: Optional[str], index_only: bool) -> int:
    projects = unplaced_titles()
    if only:
        projects = [p for p in projects if only.lower() in (p.get("title") or "").lower()]
    print(f"{len(projects)} project(s) with no district on record\n")

    async with httpx.AsyncClient(headers=HEADERS) as client:
        print("Looking for the department's project index…")
        links = await find_index(client)
        if not links:
            print("\n  No index page answered. Nothing can be proposed without one —\n"
                  "  paste the output above and the real path can be read off it.")
            return 1
        if index_only:
            for label, url in links[:80]:
                print(f"  {label[:62]:62}  {url}")
            return 0

        print(f"\n{RULE}\nPROPOSALS — nothing below has been written anywhere\n{RULE}")
        proposals = []
        for project in projects:
            title = project.get("title") or ""
            print(f"\n■ {title}")
            candidates = match(title, links)
            if not candidates:
                print("    no candidate page — needs a different source")
                continue
            for label, url in candidates[:1]:
                print(f"  ↳ {label}")
                html = await fetch(client, url)
                if not html:
                    continue
                hits = sentences_naming_districts(html)
                if not hits:
                    print("    page found, but it names no district we recognise")
                    continue
                seen = set()
                for sentence, names in hits[:6]:
                    role = role_for(sentence)
                    for name in names:
                        if (name, role) in seen:
                            continue
                        seen.add((name, role))
                        print(f"    {name:28} {role:12} “{sentence[:110]}”")
                        proposals.append({
                            "project_title": title,
                            "external_id": project.get("external_id"),
                            "district": name, "role": role,
                            "source_url": url, "source_title": label,
                            "source_quote": sentence[:400],
                        })
            await asyncio.sleep(1.5)                # be polite to the department

        print(f"\n{RULE}\n{len(proposals)} proposal(s). JSON follows — review every line "
              f"before any of it becomes data.\n{RULE}")
        print(json.dumps(proposals, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--only", help="only projects whose title contains this")
    parser.add_argument("--index-only", action="store_true",
                        help="print the department's project links and stop")
    args = parser.parse_args()
    raise SystemExit(asyncio.run(main(args.only, args.index_only)))
