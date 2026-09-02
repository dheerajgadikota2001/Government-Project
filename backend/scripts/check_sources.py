"""
Source health tracker — pings every government portal this platform depends on
and keeps a PERSISTENT record of which ones work.

WHY THIS IS NOT A SIMPLE STATUS-CODE CHECK
------------------------------------------
On 2026-08-28 we found that openbudgetsindia.org — cited in our Document Library
as a budget-transparency source — had been repurposed into a cricket-betting
affiliate site. It returned HTTP 200. A status-code check passed it as healthy.

A platform whose entire promise is "government sources only" cannot rely on a
200. So every source here carries an `expect` string that MUST appear in the
page body. A 200 whose body no longer looks like the source we catalogued is
reported as CONTENT_MISMATCH — the loudest failure in this file, because it is
the one that quietly poisons the library.

Failures are also CLASSIFIED, because the cause changes what you should do:
  DNS_DEAD         the domain does not resolve — the URL is wrong or the site is gone
  TIMEOUT          resolves but the connection hangs — geo-fence or firewall
  REFUSED          the server answered and refused (401/403) — try a real browser
  NOT_FOUND        404 — the path moved
  SERVER_ERROR     5xx — their side is broken
  TLS_ERROR        certificate/handshake failure — often a www vs non-www problem
  CONTENT_MISMATCH 200, but the page is not what we catalogued  <-- investigate first
  NO_EXPECT        we never wrote an expect string, so this row proves nothing

State is never lost: a source that fails today but worked last week still shows
its Last success date.

Usage:
    python scripts/check_sources.py
    python scripts/check_sources.py --network "India VPN"
    python scripts/check_sources.py --network "home, US"
"""

import json
import sys
import os
from datetime import datetime, timezone

import httpx

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.utils.logger import logger

STATE_FILE = "sources_status.json"
MD_FILE = "SOURCES_STATUS.md"

# (name, url, category, expect, notes)
#   expect — a string that MUST appear in the response body (case-insensitive).
#            Chosen from content actually observed on the page. If it disappears,
#            the domain has changed hands or the page has been gutted.
#            Set to None ONLY if you genuinely cannot pick one; the row will be
#            reported as NO_EXPECT so it never masquerades as a passing check.
SOURCES = [
    # --- Core financial record -------------------------------------------------
    ("AP Finance Department", "https://apfinance.gov.in", "Projects/Budgets",
     "budget", "Budgets, fund releases, expenditure statements. Use the non-www host: www.apfinance.gov.in fails the TLS handshake."),
    ("AP Finance — budget documents index", "https://apfinance.gov.in/budget.html", "Projects/Budgets",
     "demands for grants", "Full budget repository FY2026-27 back to FY2014-15."),
    ("AP Finance — budget speeches", "https://apfinance.gov.in/budget-speech.html", "Projects/Budgets",
     "speech", "Lists only the current year; there is no previous-speeches archive page."),
    ("CAG — AG (Audit) Andhra Pradesh", "https://cag.gov.in/ag/andhra-pradesh/en/audit-report", "Documents",
     "audit report", "Audit reports and state finance reports. Replaces agap.cag.gov.in, which times out."),

    # --- Projects and schemes --------------------------------------------------
    ("Nadu Nedu works MIS (STMSWorks)", "https://schoolinfra.ap.gov.in/stmsworks/Public/MISPublic.aspx", "Projects",
     "mis", "School infrastructure MIS. Moved here from nadunedu.se.ap.gov.in, which no longer resolves."),
    ("Polavaram Project Authority", "https://ppa.gov.in", "Projects",
     "polavaram", "Replaces polavaram.gov.in, which does not resolve."),
    ("APCRDA (Amaravati)", "https://crda.ap.gov.in", "Projects",
     "amaravati", "Master plans, resettlement documents, and a live tenders/auctions table."),
    ("NHAI", "https://nhai.gov.in", "Projects",
     None, "JavaScript application shell — a plain fetch cannot read it. Needs a browser."),
    ("South Central Railway", "https://scr.indianrailways.gov.in", "Projects",
     "railway", "Visakhapatnam-HQ railway zone projects."),
    ("MoSPI PAIMANA / IPMD", "https://www.mospi.gov.in/infrastructure-and-project-monitoring-division-ipmd", "Projects",
     None, "JavaScript application shell — needs a browser."),

    # --- Departments -----------------------------------------------------------
    ("Commissioner of School Education", "https://cse.ap.gov.in", "Education",
     "school education", "Notifications, RTE 12(1)(c), academic calendars."),
    ("Health, Medical & Family Welfare", "https://hmfw.ap.gov.in", "Health",
     "health", "Facility counts and health programme pages."),
    ("AP State Development Planning Society", "https://apsdps.ap.gov.in", "Statistics",
     "andhra", "Planning Department statistics and the weather station network."),

    # --- Investments -----------------------------------------------------------
    ("AP Economic Development Board", "https://apedb.gov.in", "Investments/MoUs",
     "andhra", "Investment promotion. Replaces apedb.ap.gov.in, which times out. Content is dated."),
    ("AP Industries Department", "https://www.apindustries.gov.in", "Investments/MoUs",
     None, "Only the www host answers, and it returns a thin page. Deep paths still fail."),
    ("Press Information Bureau", "https://pib.gov.in", "News/Investments",
     "press information bureau", "Official Government of India press releases."),

    # --- Legislature -----------------------------------------------------------
    ("NeVA — legislature portal", "https://neva.gov.in", "Projects/Documents",
     "neva", "Assembly Q&A. Previously mislabelled as blocked to us; it is not."),
    ("AP Legislature", "https://aplegislature.org", "Legislature",
     None, "Returns HTTP 403 to automated requests. Likely home of the missing 2023-24 budget speech."),

    # --- Districts and press ---------------------------------------------------
    ("District network (Visakhapatnam sample)", "https://visakhapatnam.ap.gov.in", "Districts",
     "visakhapatnam", "26 uniform district sites: documents, press, RTI."),
    ("AP I&PR press releases", "https://ipr.ap.nic.in", "News",
     None, "Reachable, but the site's own content was last updated in July 2014. Live is not current."),

    # --- Tenders ---------------------------------------------------------------
    ("CPPP — Central Public Procurement", "https://eprocure.gov.in/cppp/", "Tenders",
     "tender", "Central tenders located in AP. Portal answers; every search is captcha-gated."),
    ("AP e-Procurement Portal", "https://www.apeprocurement.gov.in", "Tenders",
     "tender", "State tender system. Times out from outside India."),
    ("AP e-Procurement — tender subdomain", "https://tender.apeprocurement.gov.in", "Tenders",
     "tender", "Actual tender listing system. Times out from outside India."),

    # --- Known blocked or dead — kept so the block itself stays documented -----
    ("Government Orders Issue Register (GOIR)", "https://goir.ap.gov.in", "Documents/MoUs",
     "government order", "Every G.O. since June 2008. Resolves but times out from outside India. Holds G.O.Rt.55 (the Nadu Nedu renaming) and the Phase I/II sanction orders."),
    ("A.P. e-Gazette", "https://apegazette.cgg.gov.in", "Documents",
     "gazette", "Answers and refuses with HTTP 403 — a refusal, not a timeout. A browser may succeed."),
    ("RTI 4(1)(b) disclosures", "https://rti.ap.gov.in", "Documents",
     "right to information", "Domain no longer resolves. sic.ap.gov.in also times out."),
    ("CM CORE Dashboard", "https://core.ap.gov.in", "Projects",
     "dashboard", "Domain no longer resolves in DNS."),
    ("AP Open Data", "https://ap.data.gov.in", "Projects",
     "data", "Host is up but disallows automated retrieval via robots.txt."),

    # --- News ------------------------------------------------------------------
    ("Eenadu", "https://www.eenadu.net", "News",
     "eenadu", "Homepage reachable; RSS feed confirmed dead 2026-08-24. Claims only, never a source of figures."),
    ("Sakshi", "https://www.sakshi.com", "News",
     "sakshi", "Homepage reachable; RSS feed confirmed dead 2026-08-24. Claims only, never a source of figures."),
]

# Sources deliberately REMOVED, and why. Kept here so nobody re-adds them.
RETIRED = [
    ("Open Budgets India", "https://openbudgetsindia.org",
     "REMOVED 2026-08-28: the domain was repurposed and now serves cricket-betting "
     "affiliate content. It still returns HTTP 200, which is exactly why this script "
     "now asserts page content instead of trusting a status code."),
    ("Polavaram (old host)", "https://polavaram.gov.in", "REMOVED 2026-08-28: does not resolve. Use ppa.gov.in."),
    ("Nadu Nedu MIS (old host)", "https://nadunedu.se.ap.gov.in",
     "REMOVED 2026-08-28: does not resolve. Use schoolinfra.ap.gov.in."),
    ("AG (A&E) portal", "https://agap.cag.gov.in",
     "REMOVED 2026-08-28: times out. Use cag.gov.in/ag/andhra-pradesh/en/audit-report."),
]


def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"sources": {}}


def save_state(state):
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)


def classify_exception(exc) -> str:
    """Map a transport exception to one of our failure classes.

    The distinction matters operationally: a DNS failure means the URL is wrong
    and no amount of networking will fix it, while a timeout means the address is
    real and an India-routed request might succeed.
    """
    text = f"{type(exc).__name__}: {exc}".lower()
    if "name or service not known" in text or "nodename nor servname" in text \
            or "getaddrinfo" in text or "name resolution" in text:
        return "DNS_DEAD"
    if "timeout" in text or "timed out" in text:
        return "TIMEOUT"
    if "ssl" in text or "certificate" in text or "handshake" in text:
        return "TLS_ERROR"
    return "CONNECT_ERROR"


def check(url: str, expect):
    """Return (ok, klass, detail, final_url).

    ok is True ONLY when the request succeeded AND the expected content was
    found. A 200 that no longer contains `expect` is a failure, not a pass.
    """
    try:
        r = httpx.get(
            url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
            timeout=20,
            follow_redirects=True,
        )
    except Exception as exc:  # noqa: BLE001 — every transport failure is a source failure
        return False, classify_exception(exc), f"{type(exc).__name__}: {exc}", None

    final = str(r.url)
    code = r.status_code

    if code in (401, 403):
        return False, "REFUSED", f"HTTP {code} — server answered and refused", final
    if code == 404:
        return False, "NOT_FOUND", f"HTTP {code} — path moved or gone", final
    if code >= 500:
        return False, "SERVER_ERROR", f"HTTP {code}", final
    if code >= 400:
        return False, "REFUSED", f"HTTP {code}", final

    if expect is None:
        return False, "NO_EXPECT", (
            f"HTTP {code} but no expect string is defined for this source, so this "
            f"check proves nothing about the content"
        ), final

    body = (r.text or "").lower()
    if expect.lower() not in body:
        return False, "CONTENT_MISMATCH", (
            f"HTTP {code} but the page no longer contains {expect!r}. "
            f"The domain may have changed hands or the page been gutted — "
            f"open it by eye before trusting anything cited from it"
        ), final

    return True, "OK", f"HTTP {code}, content confirmed", final


def main():
    network_tag = "unspecified"
    if "--network" in sys.argv:
        idx = sys.argv.index("--network")
        if idx + 1 < len(sys.argv):
            network_tag = sys.argv[idx + 1]

    state = load_state()
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    for name, url, category, expect, notes in SOURCES:
        entry = state["sources"].setdefault(name, {
            "url": url, "category": category, "notes": notes,
            "last_success": None, "last_checked": None, "last_status": None,
            "last_class": None, "consecutive_fails": 0, "checked_from": None,
        })
        entry["url"] = url
        entry["category"] = category
        entry["notes"] = notes

        logger.info(f"Checking {name} ...")
        ok, klass, detail, final_url = check(url, expect)
        entry["last_checked"] = now
        entry["checked_from"] = network_tag
        entry["last_class"] = klass
        entry["last_status"] = "OK" if ok else f"{klass} — {detail}"
        if final_url and final_url != url:
            entry["redirected_to"] = final_url
        if ok:
            entry["last_success"] = now
            entry["consecutive_fails"] = 0
            logger.info(f"{name}: OK")
        else:
            entry["consecutive_fails"] = entry.get("consecutive_fails", 0) + 1
            if klass == "CONTENT_MISMATCH":
                logger.error(f"{name}: CONTENT MISMATCH — {detail}")
            else:
                logger.warning(f"{name}: {klass} ({detail})")

    state["retired"] = [{"name": n, "url": u, "why": w} for n, u, w in RETIRED]
    save_state(state)

    rows = list(state["sources"].items())

    def sort_key(item):
        _, e = item
        # Content mismatches first — they are the dangerous ones, then longest-broken.
        mismatch = e.get("last_class") != "CONTENT_MISMATCH"
        working = e["last_status"] == "OK"
        return (mismatch, working, -e.get("consecutive_fails", 0))

    rows.sort(key=sort_key)
    working_count = sum(1 for _, e in rows if e["last_status"] == "OK")
    mismatches = [n for n, e in rows if e.get("last_class") == "CONTENT_MISMATCH"]

    lines = [
        "# Source Health — Running Tracker",
        "",
        f"Last updated: {now}  ·  Last check run from: **{network_tag}**",
        f"**{working_count}/{len(rows)} confirmed reachable AND serving the expected content.**",
        "",
        "This checker does not trust HTTP 200. Every source carries an `expect` string "
        "that must appear on the page; a 200 whose body no longer matches is reported as "
        "**CONTENT_MISMATCH**, because that is how a citation quietly rots. "
        "(On 2026-08-28 openbudgetsindia.org — cited in our library — was found to have "
        "become a betting affiliate site while still returning 200.)",
        "",
        "Failure classes: `DNS_DEAD` the domain does not resolve · `TIMEOUT` resolves but "
        "hangs, typically a geo-fence · `REFUSED` answered with 401/403, try a browser · "
        "`NOT_FOUND` the path moved · `TLS_ERROR` handshake failed, often www vs non-www · "
        "`CONTENT_MISMATCH` investigate immediately · `NO_EXPECT` no assertion defined, "
        "so the row proves nothing.",
        "",
        "Run `python scripts/check_sources.py --network \"where you are\"` from different "
        "networks. A source that fails from the US but succeeds from an India VPN is "
        "geo-fenced, not dead — and that distinction decides whether hosting a fetcher "
        "in an Indian region would fix it.",
        "",
    ]

    if mismatches:
        lines += [
            "> ## ⚠ CONTENT MISMATCH — act on these first",
            "> These addresses answered normally but no longer contain what we catalogued:",
            "> " + ", ".join(f"**{m}**" for m in mismatches),
            "> Open each by eye. If a domain has changed hands, remove the citation before "
            "anything else — a wrong link on a transparency platform is worse than a missing one.",
            "",
        ]

    lines += [
        "| Source | Category | Class | Status | Last checked | Last success | Fails in a row | Notes |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for name, e in rows:
        klass = e.get("last_class") or "—"
        icon = "✅" if e["last_status"] == "OK" else ("🚨" if klass == "CONTENT_MISMATCH" else "❌")
        lines.append(
            f"| {name} | {e['category']} | `{klass}` | {icon} {e['last_status']} | "
            f"{e['last_checked']} | {e['last_success'] or '—'} | "
            f"{e['consecutive_fails']} | {e['notes']} |"
        )

    lines += ["", "## Retired sources — do not re-add", ""]
    for n, u, w in RETIRED:
        lines.append(f"- **{n}** (`{u}`) — {w}")

    with open(MD_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    logger.info(
        f"Updated {MD_FILE} and {STATE_FILE} — {working_count}/{len(rows)} fully verified "
        f"(from: {network_tag}). Content mismatches: {len(mismatches)}."
    )


if __name__ == "__main__":
    main()
