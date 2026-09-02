"""
Government tenures of Andhra Pradesh since bifurcation — the swearing-in
boundaries used everywhere a record is attributed to a government. One
definition, imported by every router that slices by tenure, so the split
can never drift between pages.
"""

from datetime import datetime, timezone

TENURES = [
    {
        "key": "tdp1",
        "party": "TDP",
        "cm": "N. Chandrababu Naidu",
        "label": "TDP (Naidu) 2014–19",
        "from": datetime(2014, 6, 8, tzinfo=timezone.utc),
        "to": datetime(2019, 5, 29, 23, 59, 59, tzinfo=timezone.utc),
    },
    {
        "key": "ysrcp",
        "party": "YSRCP",
        "cm": "Y.S. Jagan Mohan Reddy",
        "label": "YSRCP (Jagan) 2019–24",
        "from": datetime(2019, 5, 30, tzinfo=timezone.utc),
        "to": datetime(2024, 6, 11, 23, 59, 59, tzinfo=timezone.utc),
    },
    {
        "key": "tdp2",
        "party": "TDP-led NDA",
        "cm": "N. Chandrababu Naidu",
        "label": "TDP-led NDA (Naidu) 2024–",
        "from": datetime(2024, 6, 12, tzinfo=timezone.utc),
        "to": datetime(2099, 12, 31, tzinfo=timezone.utc),
    },
]

TENURE_KEYS = {t["key"] for t in TENURES}


def tenure_by_key(key: str):
    return next((t for t in TENURES if t["key"] == key), None)
