"""
The one email that says whether this platform is still telling the truth.

WHAT IT IS FOR
Unattended scraping has a specific failure mode: everything keeps running, and
nobody finds out for a month that a source moved. The /updates page records all
of it faithfully, but a page nobody opens is not a monitor. This is the push.

THE RULES IT FOLLOWS, AND WHY

  It only sends when something needs a person. A nightly "all fine" trains the
  reader to archive it unread, and then the one that mattered gets archived too.

  It sends a weekly heartbeat anyway. Alert-on-problem-only cannot distinguish
  "healthy" from "the scheduler died three weeks ago". One quiet Monday email
  makes silence meaningful.

  Every item says what to DO. "CAG scraper failed" is a fact; "portal likely
  moved, needs re-probe" is an instruction. The reader is going to be someone
  glancing at a phone.

  It never repeats a finding it has already reported. Findings carry a
  notified_at; a source that changed last Tuesday is not re-mailed every night
  until it is dealt with.

  Plain text is the primary body. It renders identically everywhere, it is what
  a phone notification previews, and it cannot break. The HTML part is a
  convenience, not the message.

DELIBERATELY NOT DONE
No attachments, no charts, no links that act. The email reports; the platform is
where you look and this session is where you fix. An email that can change data
is a phishing target aimed at the one person who can edit every figure.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx

from app.config import settings
from app.utils.logger import logger

RESEND_ENDPOINT = "https://api.resend.com/emails"

# Indian Standard Time. The readers, the government portals and the person
# receiving this are all on it. UTC timestamps in an operational email are an
# invitation to misread them.
IST = timezone(timedelta(hours=5, minutes=30))

RULE = "─" * 55


def _ist(when: Optional[datetime] = None) -> str:
    return (when or datetime.now(timezone.utc)).astimezone(IST).strftime("%d %b %Y %H:%M IST")


# --------------------------------------------------------------------------
# Body
# --------------------------------------------------------------------------

def build_body(report: dict) -> tuple[str, str]:
    """Render (subject, plain-text body) from one refresh + watch cycle.

    `report` shape:
        needs_you    [{kind, title, detail, action, url}]
        blocked      [{source, reason}]
        changed      [{source, count, note}]
        quiet        [source, ...]
        still_failing [{title, detail}]   failed last run too; heartbeat only
        recovered    [source, ...]       failed last run, fine now
        notes        [{source, note}]    true, worth knowing, not a failure
        dead         [{source_key, publisher, title, url}]
        run_id, started_at, duration_s, heartbeat (bool)
    """
    needs = report.get("needs_you") or []
    blocked = report.get("blocked") or []
    changed = report.get("changed") or []
    quiet = report.get("quiet") or []
    dead = report.get("dead") or []
    still = report.get("still_failing") or []
    notes = report.get("notes") or []

    # Subject carries the verdict, because it is often all that gets read.
    if needs:
        headline = "; ".join(item["title"] for item in needs[:2])
        subject = f"[AP FactCheck] {len(needs)} need you: {headline}"
    elif blocked:
        subject = f"[AP FactCheck] {len(blocked)} write(s) blocked, data held, not lost"
    elif still:
        # "All clear" while six portals are down is the exact sentence that let
        # this go unnoticed. A source that was reported when it broke is not
        # news, but it is not clear either, and the subject is often all that
        # gets read.
        subject = f"[AP FactCheck] {len(still)} source(s) still failing, nothing new"
    else:
        total = sum(item.get("count", 0) for item in changed)
        subject = f"[AP FactCheck] All clear: {len(changed) + len(quiet)} sources, {total} new records"

    lines: list[str] = []

    if needs:
        lines += [f"NEEDS YOU ({len(needs)})", RULE]
        for i, item in enumerate(needs, 1):
            lines.append(f"{i}. {item['kind'].upper()}: {item['title']}")
            for detail in item.get("detail", "").splitlines():
                if detail.strip():
                    lines.append(f"   {detail.strip()}")
            if item.get("url"):
                lines.append(f"   {item['url']}")
            lines.append(f"   -> {item['action']}")
            lines.append("")
    elif still:
        # Deliberately a count and not the list: the detail belongs to the
        # heartbeat, and repeating it nightly is what trains a reader to stop
        # reading. But "every scraper is working" must never print over the top
        # of sources that are not.
        lines += ["NEEDS YOU (0)", RULE,
                  f"Nothing new. {len(still)} source(s) reported earlier are still broken; "
                  "the weekly heartbeat lists them.", ""]
    else:
        lines += ["NEEDS YOU (0)", RULE, "Nothing. Every source is current and every scraper is working.", ""]

    recovered = report.get("recovered") or []
    if recovered:
        lines += [f"RECOVERED ({len(recovered)})", RULE]
        lines += [f"{name}: was failing, ran clean this time. Nothing to do." for name in recovered]
        lines.append("")

    if still and report.get("heartbeat"):
        lines += [f"STILL FAILING ({len(still)})", RULE,
                  "Already reported. Listed here so the weekly picture is complete."]
        for item in still:
            lines.append(f"  {item['title']}" + (f"  ({item['detail']})" if item.get("detail") else ""))
        lines.append("")

    if blocked:
        lines += [f"BLOCKED WRITES ({len(blocked)})", RULE]
        for item in blocked:
            lines.append(f"{item['source']}: refused to save.")
            lines.append(f"  {item['reason']}")
            lines.append("  Nothing was written. The site still shows last known-good data.")
            lines.append("")

    if changed:
        total = sum(item.get("count", 0) for item in changed)
        lines += [f"WHAT CHANGED ({total} new)", RULE]
        width = max(len(item["source"]) for item in changed)
        for item in sorted(changed, key=lambda x: -x.get("count", 0)):
            note = f"  ({item['note']})" if item.get("note") else ""
            lines.append(f"{item['source']:<{width}}  {item.get('count', 0):>4}{note}")
        lines.append("")

    if quiet:
        lines += [f"QUIET, ran clean, nothing new ({len(quiet)})", ", ".join(quiet), ""]

    if notes:
        # Not failures, and not actions. Things that are true about how the run
        # got its data and that a reader would want to know before trusting a
        # date on the site: "this register was read from a local copy, so it
        # cannot have picked up a newer edition".
        lines += [f"WORTH KNOWING ({len(notes)})", RULE]
        for item in notes:
            lines.append(f"{item['source']}: {item['note']}")
        lines.append("")

    lines += [f"DEAD CITATIONS ({len(dead)})"]
    if dead:
        lines.append(RULE)
        for item in dead:
            lines.append(f"{item.get('publisher') or item['source_key']}: {item.get('title') or ''}".strip(": "))
            lines.append(f"  {item['url']}")
            lines.append("  -> the [source] link on the site does not resolve; find the new URL")
        lines.append("")
    else:
        lines.append("")

    lines += [
        RULE,
        f"Run {report.get('run_id', '?')[:8]}, {_ist(report.get('started_at'))}, "
        f"{report.get('duration_s', 0):.0f}s",
        f"{settings.alert_site_url}/updates",
    ]
    if report.get("heartbeat"):
        lines.append("")
        lines.append("(Weekly heartbeat, sent whether or not anything needed you, so that")
        lines.append(" silence from this address means healthy rather than broken.)")

    return subject, "\n".join(lines)


def build_html(subject: str, text: str) -> str:
    """The plain body in a monospace block.

    Not a designed email on purpose. The alignment in the text version carries
    meaning (the counts line up), and reflowing it into paragraphs would lose
    that for no gain. This is an operational message, not a newsletter.
    """
    escaped = (
        text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    )
    return (
        '<div style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;'
        'font-size:13px;line-height:1.55;color:#111;white-space:pre-wrap;'
        'max-width:680px;margin:0 auto;padding:16px">'
        f"{escaped}</div>"
    )


# --------------------------------------------------------------------------
# Sending
# --------------------------------------------------------------------------

def should_send(report: dict) -> bool:
    """Send only when there is something to act on, or it is heartbeat day."""
    if report.get("heartbeat"):
        return True
    return bool(report.get("needs_you") or report.get("blocked")
                or report.get("dead") or report.get("recovered"))


def is_heartbeat_day(now: Optional[datetime] = None) -> bool:
    now = (now or datetime.now(timezone.utc)).astimezone(IST)
    return now.weekday() == settings.alert_heartbeat_weekday


async def send(report: dict) -> dict:
    """Send the alert. Never raises. A failed email must not fail a refresh run.

    Returns a small result the caller can log, including an explicit reason when
    nothing was sent. Silent no-ops are how a monitoring feature comes to be
    believed in without ever having worked.
    """
    subject, text = build_body(report)

    if not settings.resend_api_key:
        logger.warning("[alerts] RESEND_API_KEY not set, alert not sent. Subject was: " + subject)
        return {"sent": False, "reason": "no api key", "subject": subject}
    if not settings.alert_to:
        logger.warning("[alerts] ALERT_TO not set, alert not sent. Subject was: " + subject)
        return {"sent": False, "reason": "no recipient", "subject": subject}
    if not should_send(report):
        logger.info("[alerts] nothing actionable and not heartbeat day, no email sent")
        return {"sent": False, "reason": "nothing to report", "subject": subject}

    payload = {
        "from": settings.alert_from,
        "to": [addr.strip() for addr in settings.alert_to.split(",") if addr.strip()],
        "subject": subject,
        "text": text,
        "html": build_html(subject, text),
    }
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                RESEND_ENDPOINT,
                headers={"Authorization": f"Bearer {settings.resend_api_key}"},
                json=payload,
            )
        if response.status_code >= 300:
            # The body can carry the reason (unverified domain, bad recipient),
            # and that is worth having in the job log, but never the key.
            logger.error(f"[alerts] Resend refused ({response.status_code}): {response.text[:300]}")
            return {"sent": False, "reason": f"http {response.status_code}", "subject": subject}
        logger.info(f"[alerts] sent: {subject}")
        return {"sent": True, "subject": subject, "id": response.json().get("id")}
    except Exception as exc:                       # noqa: BLE001
        logger.error(f"[alerts] send failed: {type(exc).__name__}: {exc}")
        return {"sent": False, "reason": str(exc)[:200], "subject": subject}
