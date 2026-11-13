"""Where the data build reads and writes. One place, so the build runs the same on any machine.

Until 11 Nov 2026 fetch_live.py and prep_data.py pointed at a private work folder. The build could
only run there, so the site's built data stayed at the day of the last private run (22 Oct) while
the refresh job kept the database current. Every path now hangs off this folder, and the two
settings below can be changed from the environment without editing a script.

    AP_LIVE_DIR   where the API dumps are kept between the fetch and the build (default web/.live, not in git)
    AP_API_BASE   the API to read (default the live site)
"""
import os
from pathlib import Path

WEB = Path(__file__).resolve().parent.parent
LIVE = Path(os.environ.get('AP_LIVE_DIR') or WEB / '.live')
INPUTS = WEB / 'data-inputs'
API = (os.environ.get('AP_API_BASE') or 'https://apfactcheck.dheeco.com/api/v1').rstrip('/')
