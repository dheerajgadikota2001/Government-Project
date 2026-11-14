"""
Every PDF reader releases each page with close(), never only flush_cache().

flush_cache() leaves the page's text-layout cache behind, about 6 MB a page. On
the 158-page March 2026 MoSPI report that held 892 MB by the last page, and the
history import ran out of Cloud Run's 1 GiB (14 Nov 2026). close() clears both
caches: 63 MB for the same report, and a closed page still reads correctly if it
is opened again. The daily MoSPI import uses the same reader, so a larger month
would have stopped the morning refresh the same way.
"""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def test_no_reader_only_flushes_a_page():
    offenders = []
    for path in list((ROOT / "app").rglob("*.py")) + list((ROOT / "scripts").rglob("*.py")):
        for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if re.search(r"\.flush_cache\(\)", line) and not line.lstrip().startswith("#"):
                offenders.append(f"{path.relative_to(ROOT)}:{n}")
    assert offenders == [], "use page.close(); flush_cache() keeps the text-layout cache: " + ", ".join(offenders)
