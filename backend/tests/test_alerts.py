"""
Tests for the alert email.

The rules under test are behavioural, not cosmetic: when it stays quiet, when it
insists on speaking, and whether a reader can act on it without opening anything
else.
"""

from datetime import datetime, timezone

from app.services.alerts import build_body, build_html, should_send

CLEAN = {
    "run_id": "abc123def456", "started_at": datetime(2026, 9, 5, 0, 30, tzinfo=timezone.utc),
    "duration_s": 33, "changed": [{"source": "CRDA tenders", "count": 4}], "quiet": ["NeVA"],
}


def test_a_quiet_run_sends_nothing():
    """A nightly 'all fine' is how the one that mattered gets archived unread."""
    assert should_send(CLEAN) is False


def test_a_quiet_run_still_sends_on_heartbeat_day():
    """Otherwise no email for three weeks cannot be told from a dead scheduler."""
    assert should_send({**CLEAN, "heartbeat": True}) is True


def test_a_blocked_write_always_sends():
    assert should_send({**CLEAN, "blocked": [{"source": "x", "reason": "y"}]}) is True


def test_a_dead_citation_always_sends():
    assert should_send({**CLEAN, "dead": [{"source_key": "k", "url": "u"}]}) is True


def test_the_subject_carries_the_verdict():
    subject, _ = build_body({**CLEAN, "needs_you": [
        {"kind": "new edition", "title": "NITI Fiscal Health", "detail": "", "action": "do it"},
        {"kind": "scraper failing", "title": "CAG", "detail": "", "action": "re-probe"},
    ]})
    assert subject.startswith("[AP FactCheck] 2 need you")
    assert "NITI Fiscal Health" in subject


def test_every_item_that_needs_you_states_an_action():
    _, body = build_body({**CLEAN, "needs_you": [
        {"kind": "new edition", "title": "NITI", "detail": "shows 2026", "action": "transcribe it"},
    ]})
    assert "-> transcribe it" in body


def test_a_blocked_write_says_the_site_is_still_correct():
    """The reader must not read 'blocked' as 'broken'."""
    _, body = build_body({**CLEAN, "blocked": [
        {"source": "District collectorates", "reason": "district NULL rate 3% -> 71%"},
    ]})
    assert "Nothing was written" in body
    assert "last known-good data" in body


def test_times_are_shown_in_ist():
    """00:30 UTC is 06:00 IST. An operational email in UTC invites misreading."""
    _, body = build_body(CLEAN)
    assert "05 Sep 2026 06:00 IST" in body


def test_an_all_clear_body_says_so_explicitly():
    _, body = build_body({**CLEAN, "heartbeat": True})
    assert "NEEDS YOU (0)" in body
    assert "Every source is current" in body


def test_html_escapes_and_does_not_reflow():
    html = build_html("s", "a < b & c\nnext line")
    assert "&lt;" in html and "&amp;" in html
    assert "white-space:pre-wrap" in html


# ---------------------------------------------------------------- transitions
#
# Alerts are about change. These pin the three states a failing source moves
# through: newly broken (email), still broken (heartbeat only), recovered (email).

def test_a_recovery_sends_and_says_nothing_to_do():
    report = {**CLEAN, "recovered": ["AP CRDA tenders"]}
    assert should_send(report) is True
    _, body = build_body(report)
    assert "RECOVERED (1)" in body
    assert "AP CRDA tenders: was failing, ran clean this time. Nothing to do." in body


def test_a_source_still_failing_does_not_send_between_heartbeats():
    report = {**CLEAN, "still_failing": [{"title": "AP CRDA tenders", "detail": "Error: ReadTimeout"}]}
    assert should_send(report) is False
    _, body = build_body(report)
    assert "STILL FAILING" not in body          # not repeated outside the heartbeat


def test_a_source_still_failing_is_listed_in_the_heartbeat():
    report = {**CLEAN, "heartbeat": True,
              "still_failing": [{"title": "AP CRDA tenders", "detail": "Error: ReadTimeout"}]}
    assert should_send(report) is True
    _, body = build_body(report)
    assert "STILL FAILING (1)" in body
    assert "Already reported" in body
    assert "AP CRDA tenders" in body


def test_no_email_ever_contains_an_em_dash():
    # A house rule, and one that a template violates silently.
    full = {**CLEAN, "heartbeat": True,
            "needs_you": [{"kind": "scraper failing", "title": "X", "detail": "Error: ReadTimeout", "action": "probe"}],
            "blocked": [{"source": "Y", "reason": "row floor"}],
            "still_failing": [{"title": "S", "detail": ""}], "recovered": ["R"],
            "dead": [{"source_key": "k", "publisher": "P", "title": "T", "url": "http://x"}]}
    subject, body = build_body(full)
    assert "\u2014" not in subject and "\u2014" not in body
    assert "\u2013" not in subject and "\u2013" not in body


def test_advice_follows_from_the_error_not_a_fixed_guess():
    import importlib.util, pathlib
    spec = importlib.util.spec_from_file_location(
        "ras", pathlib.Path(__file__).parent.parent / "scripts" / "run_all_scrapers.py")
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    assert "--ua browser" in mod._advice("ReadTimeout")
    assert "moved" in mod._advice("Client error '404 Not Found'")
    assert "cloud addresses" in mod._advice("403 Forbidden")
    assert "certificate" in mod._advice("SSL: CERTIFICATE_VERIFY_FAILED")
    assert "moved" not in mod._advice("ReadTimeout")   # the old text, now wrong for a timeout
