"""
Tests for the citation watcher's fingerprint.

The watcher's whole value depends on one property: it must stay silent when a
government page changes its furniture, and speak when it changes its documents.
An alert that fires every morning is worse than no alert, because it feels like
coverage while training its reader to ignore it.
"""

from app.services.source_watch import (
    _document_links, _latest_edition, _newer_than_citation, _stable_signal, cited_sources,
)

PAGE = """
<html><body>
  <div class="banner">Visitors: 1,284,553</div>
  <a href="/reports/fiscal-health-2026.pdf">Fiscal Health Index 2026</a>
  <a href="/reports/annex-2026.xlsx">Annexures 2026</a>
  <a href="/about">About us</a>
  <a href="/contact">Contact</a>
</body></html>
"""

# Same documents, completely different page furniture.
RESTYLED = """
<html><body>
  <header><nav>Home | Publications</nav></header>
  <div class="banner">Visitors: 1,284,999</div>
  <p>Welcome to our newly redesigned website!</p>
  <ul>
    <li><a href="/reports/fiscal-health-2026.pdf">Fiscal Health Index 2026</a></li>
    <li><a href="/reports/annex-2026.xlsx">Annexures 2026</a></li>
  </ul>
  <a href="/about">About us</a>
</body></html>
"""

# A genuinely new edition.
NEW_EDITION = PAGE.replace(
    '<a href="/reports/fiscal-health-2026.pdf">Fiscal Health Index 2026</a>',
    '<a href="/reports/fiscal-health-2026.pdf">Fiscal Health Index 2026</a>\n'
    '  <a href="/reports/fiscal-health-2027.pdf">Fiscal Health Index 2027</a>',
)


def test_only_document_links_are_fingerprinted():
    links = _document_links(PAGE, "https://niti.gov.in")
    assert len(links) == 2
    assert not any("about" in link or "contact" in link for link in links)


def test_a_restyled_page_offering_the_same_documents_is_not_a_change():
    """The single most important property. Government sites restyle constantly."""
    assert _document_links(PAGE, "x") == _document_links(RESTYLED, "x")


def test_a_new_report_is_a_change():
    assert _document_links(PAGE, "x") != _document_links(NEW_EDITION, "x")


def test_session_ids_in_query_strings_are_ignored():
    a = _document_links('<a href="/r/report.pdf?sid=abc123">Report 2026</a>', "x")
    b = _document_links('<a href="/r/report.pdf?sid=zzz999">Report 2026</a>', "x")
    assert a == b


def test_latest_edition_is_read_from_link_text():
    assert _latest_edition(_document_links(NEW_EDITION, "x")) == "2027"


def test_a_scheme_name_is_not_mistaken_for_an_edition_year():
    """'Swarna Andhra @2047' was once read as a publication year."""
    links = _document_links('<a href="/vision.pdf">Swarna Andhra @2047 Vision</a>', "x")
    assert _latest_edition(links) is None


def test_new_edition_only_fires_when_newer_than_what_we_cite():
    assert _newer_than_citation("2027", "2025-12-11", None) is True
    assert _newer_than_citation("2024", "2025-12-11", None) is False
    # Already reported once — do not report it again every run.
    assert _newer_than_citation("2027", "2025-12-11", "2027") is False


def test_the_server_own_freshness_signal_wins_over_our_hash():
    """An ETag is the server's own answer to 'has this changed'. Trust it first."""
    probe = {"etag": 'W/"abc"', "last_modified": "Mon, 01 Sep 2026", "links_hash": "deadbeef"}
    assert _stable_signal(probe) == 'W/"abc"'
    assert _stable_signal({**probe, "etag": None}) == "Mon, 01 Sep 2026"
    assert _stable_signal({"etag": None, "last_modified": None, "links_hash": "deadbeef"}) == "deadbeef"


def test_every_watched_citation_carries_a_url():
    sources = cited_sources()
    assert len(sources) > 100
    assert all(s["url"].startswith("http") for s in sources)
    assert all(s["source_key"] and s["seed_file"] for s in sources)
