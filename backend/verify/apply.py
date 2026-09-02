"""
One-time repo patch that makes the harness pass on real data.

Two changes, both of which the harness itself asked for:

1. Stamp `"state": "AP"` on every seed. One key per file now is the difference
   between adding a second state later as a data-collection job and as a rewrite
   of every seed, router and component.

2. Recompute every stored percentage from the stored, rounded figures beside it,
   so that a reader who divides the two numbers on screen gets our number. We
   had been dividing the unrounded originals and displaying the rounded ones,
   which put the arithmetic a tenth of a point out of reach of anyone checking.

Idempotent. Run it, then run the harness.

    cd backend && python -m verify.apply && python -m verify.run
"""

from __future__ import annotations

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SEEDS = os.path.join(ROOT, "backend", "seed")


def _load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def _save(p, d):
    with open(p, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=1)


def main() -> int:
    if not os.path.isdir(SEEDS):
        print(f"no seed directory at {SEEDS}", file=sys.stderr)
        return 1

    stamped = repct = 0
    for name in sorted(os.listdir(SEEDS)):
        if not name.endswith(".json") or ".bak" in name:
            continue
        path = os.path.join(SEEDS, name)
        try:
            d = _load(path)
        except Exception as exc:
            print(f"  skip {name}: {exc}")
            continue
        if not isinstance(d, dict):
            continue
        changed = False

        if d.get("state") != "AP":
            # put it first, so it is the first thing anyone opening the file sees
            d = {"state": "AP", **d}
            stamped += 1
            changed = True

        pvs = d.get("promised_vs_spent")
        if isinstance(pvs, dict):
            for y in pvs.get("years", []) or []:
                for b in y.get("blocks", []) or []:
                    if b.get("promised") and b.get("spent") is not None:
                        v = round(100.0 * b["spent"] / b["promised"], 1)
                        if v != b.get("pct_spent"):
                            b["pct_spent"] = v
                            repct += 1
                            changed = True
            for _fy, secs in (pvs.get("grants") or {}).items():
                for _sec, rows in (secs or {}).items():
                    for g in rows or []:
                        if g.get("promised") and g.get("spent") is not None:
                            v = round(100.0 * g["spent"] / g["promised"], 1)
                            if v != g.get("pct_spent"):
                                g["pct_spent"] = v
                                repct += 1
                                changed = True
            pvs.setdefault("_arithmetic_note",
                           "Every percentage here is exactly what you get by dividing the two rupee "
                           "figures printed beside it. We round the rupee figures first and then "
                           "divide, rather than dividing the unrounded originals, so that a reader "
                           "recomputing from what is on screen gets our answer.")

        if changed:
            _save(path, d)
            print(f"  updated {name}")

    print(f"\n  {stamped} seed(s) stamped with a state key")
    print(f"  {repct} percentage(s) recomputed so they reproduce from the displayed figures")
    print("\n  now run:  python -m verify.run")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
