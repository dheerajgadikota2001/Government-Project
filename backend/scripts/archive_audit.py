"""
Check that every archived file still unpacks to its own fingerprint.

USAGE (from backend/)
    python scripts/archive_audit.py              # every object in the archive in .env
    python scripts/archive_audit.py --sample 50  # a random 50, for a quick daily run

Exit 1 when any copy fails. A failed copy is never deleted or "repaired" here:
the files route already refuses to serve it (it checks on every origin read),
and a person decides what happened, because the honest fix depends on whether
the bucket or the government changed something.
"""

import argparse
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.archive import Archive, IntegrityError, from_settings  # noqa: E402


def audit(archive: Archive, sample: int | None = None) -> tuple[int, list[str]]:
    keys = list(archive.backend.keys())
    if sample:
        keys = random.sample(keys, min(sample, len(keys)))
    bad = []
    for k in keys:
        sha = k.rsplit("/", 1)[-1]
        try:
            archive.verify(sha)
        except IntegrityError as e:
            bad.append(str(e))
    return len(keys), bad


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sample", type=int)
    a = ap.parse_args()
    from app.config import settings
    n, bad = audit(from_settings(settings), a.sample)
    print(f"Checked {n} file(s); {len(bad)} failed.")
    for b in bad:
        print("  " + b)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
