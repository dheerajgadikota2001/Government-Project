"""
Ask the OSV database about every pinned package in the given requirement files.

Standard library only, so it runs in CI before anything is installed and on a
laptop with no extra tools. Prints each package with an open advisory and
exits 1 if there is any. The query is by exact pinned version, which is what
the image installs; transitive packages are covered when the pins are checked
again after `pip freeze` (see the security review of 1 Nov 2026).

    python scripts/audit_pins.py requirements.txt requirements-data.txt
"""
import json
import re
import sys
import urllib.request

OSV = "https://api.osv.dev/v1/querybatch"


def pins(paths: list[str]) -> list[tuple[str, str]]:
    out = []
    for path in paths:
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                line = line.split("#", 1)[0].strip()
                if "==" not in line:
                    continue
                name, version = line.split("==", 1)
                out.append((re.split(r"\[", name)[0].strip().lower(), version.strip()))
    return out


def main(paths: list[str]) -> int:
    wanted = pins(paths)
    queries = [{"package": {"name": n, "ecosystem": "PyPI"}, "version": v} for n, v in wanted]
    bad = 0
    for i in range(0, len(queries), 100):
        batch = queries[i:i + 100]
        req = urllib.request.Request(OSV, data=json.dumps({"queries": batch}).encode(),
                                     headers={"Content-Type": "application/json"})
        results = json.load(urllib.request.urlopen(req, timeout=60))["results"]
        for q, r in zip(batch, results):
            vulns = r.get("vulns") or []
            if vulns:
                bad += 1
                ids = ", ".join(v["id"] for v in vulns[:5])
                print(f"ADVISORY {q['package']['name']}=={q['version']}: {len(vulns)} ({ids})")
    print(f"{len(wanted)} pinned packages checked, {bad} with open advisories")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:] or ["requirements.txt"]))
