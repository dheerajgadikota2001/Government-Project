"""
WHY THIS TEST EXISTS

The browser cache window was 60 seconds. Nothing was broken by that, and the
cost never appeared in a log: a reader who had been on the site for more than
a minute and then switched language refetched every figure on the page in
order to read the same numbers in a different script. Switching language is a
full page load, so it was the whole page's data, every time.

It was safe to raise because a correction has never depended on this timer.
Every API call the app makes carries a version stamp in its query string, so
the instant the stamp moves the old response is at a URL nobody asks for any
more. The stamp itself keeps a 30 second window, and that is the number that
governs how fast a correction reaches a reader.

So this file pins down the two things that make the longer window safe, rather
than the number itself:

  1. the version stamp stays short, because it is the propagation mechanism
  2. the things that must never be cached still never are

If someone later raises the stamp's window to match the rest, corrections stop
propagating and every page keeps serving the old figures for five minutes with
nothing anywhere reporting a problem.
"""
import pytest

from app.middleware.cache_headers import (
    BROWSER_MAX_AGE,
    FRESHNESS_OVERRIDES,
    NEVER_CACHE_FRAGMENTS,
    STALE_WHILE_REVALIDATE,
)

VERSION_PATH = "/api/v1/meta/version"


def test_version_stamp_stays_far_fresher_than_the_data_it_governs():
    """The stamp is how a correction reaches a reader. It must not drift up."""
    assert VERSION_PATH in FRESHNESS_OVERRIDES, (
        "the version stamp lost its own freshness window; it would now be "
        "cached as long as the data, and a correction could not propagate"
    )
    stamp_max_age, stamp_swr = FRESHNESS_OVERRIDES[VERSION_PATH]
    assert stamp_max_age <= 30, f"the version stamp is cached for {stamp_max_age}s"
    assert stamp_swr <= 30, (
        f"the stamp may be served {stamp_swr}s stale, so a correction would be "
        "invisible for that long even though the data behind it had changed"
    )
    assert stamp_max_age < BROWSER_MAX_AGE, (
        "the stamp is no fresher than the data it is meant to invalidate"
    )


def test_a_reader_is_never_blocked_on_a_refresh():
    """stale-while-revalidate is what keeps a slow connection from waiting."""
    assert STALE_WHILE_REVALIDATE >= BROWSER_MAX_AGE, (
        "an expired entry would now block the reader on a network round trip "
        "instead of being served instantly and refreshed behind them"
    )


def test_the_browser_window_is_deliberate():
    """Not a magic number: too short refetches constantly, too long is a day."""
    assert 60 <= BROWSER_MAX_AGE <= 3600, f"unexplained value {BROWSER_MAX_AGE}"


@pytest.mark.parametrize("fragment", ["/admin/", "/community", "/health"])
def test_private_and_live_paths_are_still_never_publicly_cached(fragment):
    """Raising the window must not have loosened anything it should not."""
    assert fragment in NEVER_CACHE_FRAGMENTS
