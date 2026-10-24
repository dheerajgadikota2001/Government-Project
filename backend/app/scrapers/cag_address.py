"""Where CAG keeps its report files now, and the old address each file used to have.

WHY THIS EXISTS
In October 2026 CAG moved every report file from cag.gov.in/webroot/uploads/ to
a file store at d1jmc0u14z2tmp.cloudfront.net/uploads/. It kept every file name.
The old addresses now answer "not found", so all 73 CAG reports on our
documents pages had a dead button (found 24 Oct 2026).

On 24 Oct 2026 every one of the 73 old addresses was swapped with current()
and opened: each came back as a real PDF. The swapped set also matched CAG's
own Andhra Pradesh list one for one (73 on the list, 73 ours, none extra).

The rule is kept in one place because three things need it: the scraper, so a
refresh updates the old row instead of saving a second copy of the same
report; migration 0014, which moves the rows already in the database; and the
build, which must never publish an old address again.
"""
import html

LEGACY_PREFIX = "https://cag.gov.in/webroot/uploads/"
CURRENT_PREFIX = "https://d1jmc0u14z2tmp.cloudfront.net/uploads/"


def current(url):
    """The address CAG serves this file from today. Anything that is not a CAG upload is returned unchanged.

    A few older file names hold '&' or an apostrophe. A link read from raw HTML
    carries them as '&amp;' or '&#039;', which is not the file's name, so those
    are turned back into the plain character first.
    """
    if not url:
        return url
    url = html.unescape(url)
    if url.startswith(LEGACY_PREFIX):
        return CURRENT_PREFIX + url[len(LEGACY_PREFIX):]
    return url


def legacy(url):
    """The old cag.gov.in address of a file now on the file store, or None when it is not a CAG file."""
    if url and url.startswith(CURRENT_PREFIX):
        return LEGACY_PREFIX + url[len(CURRENT_PREFIX):]
    return None
