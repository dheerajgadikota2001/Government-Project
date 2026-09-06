"""
Fetch a page from wherever this runs, and print its structure.

WHY THIS EXISTS
Several AP portals answer only from an Indian IP. They are reachable from the
Cloud Run job in asia-south1 and from nowhere else we develop on, which leaves
an awkward gap: a parser cannot be written for a page nobody working on it can
see. This prints enough structure (title, headings, forms, tables, links) to
write a parser against, and it prints it to the job log, because a Cloud Run
container is destroyed the moment it exits and any file it wrote goes with it.

    python scripts/probe_fetch.py https://goir.ap.gov.in
    python scripts/probe_fetch.py URL1 URL2 --chars 3000

It is a development tool, not part of any scrape. It stores nothing and asserts
nothing about the content. A human reads the output and decides.
"""

import argparse
import asyncio
import re
import sys

import httpx
from bs4 import BeautifulSoup

# The same identification the scrapers use: a real contact, so an administrator
# who sees this in their logs knows who to ask rather than simply blocking it.
# Two agents, chosen with --ua. "bot" is who we are and what every scraper
# sends. "browser" is a stock Chrome string, and it exists for one purpose: a
# portal that answers a browser but times out for the bot is filtering on the
# agent, and a portal that times out for both is filtering on the network. Those
# need different fixes and nothing else tells them apart. A probe is the only
# place this string is used; the scrapers keep identifying themselves.
BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; APFactCheckBot/1.0; +https://apfactcheck.dheeco.com) "
        "citizen transparency platform"
    ),
    "Accept": "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-IN,en;q=0.9,te;q=0.8",
}

RULE = "=" * 74


def squash(text: str) -> str:
    """Collapse the whitespace government pages are generously supplied with."""
    return re.sub(r"\s+", " ", text or "").strip()


def describe(html: str, chars: int) -> None:
    soup = BeautifulSoup(html, "html.parser")

    print(f"  title      : {squash(soup.title.get_text() if soup.title else '')[:160]}")

    headings = [squash(h.get_text())[:90] for h in soup.find_all(["h1", "h2", "h3"])][:12]
    if headings:
        print("  headings   :")
        for h in headings:
            if h:
                print(f"      - {h}")

    # Forms matter most here: a search-driven register (GOIR, e-procurement) is
    # reached by posting this form, not by walking links.
    for i, form in enumerate(soup.find_all("form")[:4], 1):
        fields = []
        for f in form.find_all(["input", "select", "textarea"])[:14]:
            nm = f.get("name") or f.get("id") or "?"
            fields.append(f"{nm}:{f.get('type') or f.name}")
        print(f"  form {i}     : {form.get('method', 'GET').upper()} {form.get('action') or '(self)'}")
        print(f"      fields : {', '.join(fields) or '(none)'}")

    tables = soup.find_all("table")
    print(f"  tables     : {len(tables)}")
    for i, t in enumerate(tables[:3], 1):
        head = [squash(c.get_text())[:26] for c in (t.find_all("th")[:8] or t.find_all("td")[:8])]
        rows = len(t.find_all("tr"))
        print(f"      table {i}: {rows} rows | {' | '.join(head)}")

    links = []
    for a in soup.find_all("a", href=True):
        text = squash(a.get_text())
        if text:
            links.append(f"{text[:52]}  ->  {a['href'][:88]}")
    print(f"  links      : {len(links)} (first 20)")
    for link in links[:20]:
        print(f"      {link}")

    body = squash(soup.get_text())
    print(f"  text ({len(body)} chars, first {chars}):")
    print(f"      {body[:chars]}")


async def probe(url: str, chars: int, timeout: float) -> None:
    print(f"\n{RULE}\nPROBE {url}\n{RULE}")
    try:
        async with httpx.AsyncClient(
            headers=HEADERS, timeout=timeout, follow_redirects=True, verify=True
        ) as client:
            r = await client.get(url)
    except Exception as exc:
        # A TLS failure is worth retrying unverified *for a probe only*: it tells
        # us whether the site is alive behind a broken certificate, which is a
        # different problem from the site being down. Nothing is stored from it.
        print(f"  ERROR      : {type(exc).__name__}: {exc}")
        if "CERTIFICATE_VERIFY_FAILED" in str(exc) or "SSL" in str(exc):
            print("  retrying once with certificate verification OFF (probe only) …")
            try:
                async with httpx.AsyncClient(
                    headers=HEADERS, timeout=timeout, follow_redirects=True, verify=False
                ) as client:
                    r = await client.get(url)
                print("  NOTE       : the site IS alive; its certificate is misconfigured.")
            except Exception as exc2:
                print(f"  ERROR      : still failing unverified: {type(exc2).__name__}: {exc2}")
                return
        else:
            return

    print(f"  status     : {r.status_code}")
    print(f"  final url  : {r.url}")
    print(f"  type       : {r.headers.get('content-type', '?')}")
    print(f"  bytes      : {len(r.content)}")
    ctype = r.headers.get("content-type", "")
    if "html" not in ctype and "xml" not in ctype:
        print("  (not HTML, nothing to describe structurally)")
        return
    describe(r.text, chars)


# ---------------------------------------------------------------- WebForms
# GOIR is ASP.NET WebForms: the search is a postback to the same URL carrying
# __VIEWSTATE. A landing page therefore proves nothing about whether the
# register still holds recent orders. Only a search does. This exists to
# answer one question: is the register still being fed, or did it stop when its
# footer says the site was last updated?

# Every hidden input the page issues is carried back, not a fixed list: the
# first attempt sent only the four below and the postback came back with no
# result grid, because __EVENTTARGET, __EVENTARGUMENT and __LASTFOCUS exist on
# this page and ASP.NET treats their absence as "no control raised an event".
VIEWSTATE_FIELDS = ("__VIEWSTATE", "__VIEWSTATEGENERATOR", "__EVENTVALIDATION", "__VIEWSTATEENCRYPTED")
EVENT_FIELDS = ("__EVENTTARGET", "__EVENTARGUMENT", "__LASTFOCUS")

# The register is searched by department and date range, but the control names
# and the date format are the page's business, not ours. Both spellings are
# tried, and every control is printed, so the next run reads the truth off the
# output instead of inheriting this guess.
DATE_FORMATS = ("%d/%m/%Y", "%d-%m-%Y")


async def goir_search(url: str, dept: str, frm: str, to: str, timeout: float) -> None:
    print(f"\n{RULE}\nGOIR SEARCH  dept={dept}  {frm} .. {to}\n{RULE}")
    async with httpx.AsyncClient(
        headers=HEADERS, timeout=timeout, follow_redirects=True
    ) as client:
        try:
            first = await client.get(url)
        except Exception as exc:
            print(f"  ERROR on GET: {type(exc).__name__}: {exc}")
            return
        soup = BeautifulSoup(first.text, "html.parser")

        # Carry every hidden field back verbatim. ASP.NET rejects a postback
        # whose VIEWSTATE it did not issue, so these are not optional.
        payload = {}
        for el in soup.find_all("input", {"type": "hidden"}):
            if el.get("name"):
                payload[el["name"]] = el.get("value", "")
        for f in EVENT_FIELDS:
            payload.setdefault(f, "")
        print("  hidden fields carried:", ", ".join(sorted(payload)) or "(none, postback will fail)")

        # Print every control on the form once, up front. The department select
        # and the two date boxes have to be addressed by their real names, and
        # the previous run guessed them; this is what replaces the guess.
        print("  form controls:")
        for el in soup.select("form input, form select, form textarea"):
            name = el.get("name") or el.get("id")
            if not name or el.get("type") == "hidden":
                continue
            kind = el.get("type") or el.name
            extra = ""
            if el.name == "select":
                opts = [
                    f"{o.get('value','')}={squash(o.get_text())[:28]}"
                    for o in el.find_all("option")[:8]
                ]
                extra = f"  options[{len(el.find_all('option'))}]: " + "; ".join(opts)
            print(f"      {name} :: {kind}{extra}")

        # The search button's own name/value is what tells the page a search was
        # asked for; without it the postback re-renders an empty form.
        button = soup.find("input", {"type": "submit"}) or soup.find("input", {"type": "image"})
        if button is not None and button.get("name"):
            payload[button["name"]] = button.get("value", "Search")
            print(f"  submit control : {button['name']} = {button.get('value', '')!r}")
        else:
            print("  submit control : NOT FOUND, printing the form's controls instead")
            for el in soup.select("form input, form select")[:24]:
                print(f"      {el.get('name') or el.get('id')} :: {el.get('type') or el.name}")

        # Address the real controls: whichever select looks like a department
        # list and whichever text boxes look like the date range. Falling back
        # to the previously guessed names only if nothing matches.
        prefix = "ctl00$ContentPlaceHolder1$"
        dept_field = None
        for el in soup.find_all("select"):
            name = el.get("name") or ""
            if any(k in name.lower() for k in ("dept", "department")):
                dept_field = name
                break
        date_fields = [
            el.get("name") for el in soup.find_all("input")
            if el.get("name") and any(
                k in el.get("name").lower() for k in ("frmdate", "fromdate", "todate", "date")
            ) and el.get("type") != "hidden"
        ]
        print(f"  dept field     : {dept_field or '(not found, using guess)'}")
        print(f"  date fields    : {date_fields or '(not found, using guess)'}")

        payload[dept_field or prefix + "DDLDeptname"] = dept
        if len(date_fields) >= 2:
            payload[date_fields[0]] = frm
            payload[date_fields[1]] = to
        else:
            payload[prefix + "txtfrmdate"] = frm
            payload[prefix + "txttodate"] = to

        try:
            r = await client.post(url, data=payload)
        except Exception as exc:
            print(f"  ERROR on POST: {type(exc).__name__}: {exc}")
            return

    print(f"  status     : {r.status_code}   bytes: {len(r.content)}")
    res = BeautifulSoup(r.text, "html.parser")

    # Report every table with more than a header row: one of them is the result
    # grid, and which one it is should be read off the output, not assumed.
    printed = 0
    for i, t in enumerate(res.find_all("table"), 1):
        rows = t.find_all("tr")
        if len(rows) < 2:
            continue
        printed += 1
        print(f"\n  table {i}: {len(rows)} rows")
        for row in rows[:12]:
            cells = [squash(c.get_text())[:34] for c in row.find_all(["th", "td"])]
            if any(cells):
                print("      | " + " | ".join(cells))
        if printed >= 3:
            break
    if not printed:
        print("  no multi-row table came back. The search returned nothing, or the "
              "postback was rejected. Page text follows:")
        print("     ", squash(res.get_text())[:1200])


async def raw_dump(url: str, pattern: str, context: int, timeout: float) -> None:
    """
    Print the raw HTML around a pattern.

    `describe()` above summarises structure, which is the right default but
    throws away the attributes that decide behaviour. The AP Legislature bills
    page is the case in point: the summary said "form 1: POST (self)" with one
    select, and a parser written from that posted the term and silently got the
    default term back three times. What was missing was in the tag itself:
    the action URL and Liferay's portlet routing parameters.
    """
    print(f"\n{RULE}\nRAW  {url}   /{pattern}/\n{RULE}")
    try:
        async with httpx.AsyncClient(headers=HEADERS, timeout=timeout, follow_redirects=True) as client:
            r = await client.get(url)
    except Exception as exc:
        print(f"  ERROR: {type(exc).__name__}: {exc}")
        return

    html = r.text
    print(f"  status {r.status_code}   {len(html)} chars")
    hits = list(re.finditer(pattern, html, re.I))
    print(f"  {len(hits)} match(es) for /{pattern}/\n")
    for i, m in enumerate(hits[:6], 1):
        start = max(0, m.start() - context // 3)
        end = min(len(html), m.end() + context)
        print(f"  --- match {i} @ {m.start()} " + "-" * 52)
        print(html[start:end])
        print()

async def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("urls", nargs="+")
    p.add_argument("--chars", type=int, default=1500, help="characters of page text to print")
    p.add_argument("--timeout", type=float, default=45.0)
    p.add_argument("--ua", choices=["bot", "browser"], default="bot",
                   help="which User-Agent to send; see BROWSER_UA for why 'browser' exists")
    p.add_argument("--goir-search", metavar="DEPT",
                   help="run a GOIR postback search for this department code, e.g. ICD01")
    p.add_argument("--raw", metavar="PATTERN",
                   help="print the RAW html around each match of this regex. Structure "
                        "summaries hide the attributes that decide how a form submits: "
                        "action, method, onchange, the portlet routing params. Those "
                        "are exactly what a parser has to get right.")
    p.add_argument("--raw-context", type=int, default=700,
                   help="characters of raw html to print either side of a --raw match")
    p.add_argument("--from-date", default="01/01/2026")
    p.add_argument("--to-date", default="31/12/2026")
    args = p.parse_args()
    if args.ua == "browser":
        HEADERS["User-Agent"] = BROWSER_UA
        print(f"(sending a browser User-Agent for this probe)")
    for url in args.urls:
        if args.goir_search and "goir" in url:
            await goir_search(url, args.goir_search, args.from_date, args.to_date, args.timeout)
        if args.raw:
            await raw_dump(url, args.raw, args.raw_context, args.timeout)
        else:
            await probe(url, args.chars, args.timeout)
    print(f"\n{RULE}\nprobe finished\n{RULE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
