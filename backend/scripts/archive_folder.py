"""
Put a folder of downloaded government files into the source archive.

USAGE (from backend/)
    python scripts/archive_folder.py ../sources                 # dry run: what would be stored
    python scripts/archive_folder.py ../sources --estimate      # dry run, and measure compression
    python scripts/archive_folder.py ../sources --apply         # store into the archive in .env
    python scripts/archive_folder.py ../sources --apply --record   # also write the register rows

Safe to run again: a file already archived is recognised by its fingerprint and
skipped, so an interrupted run simply continues. Nothing is ever deleted, from
the folder or from the archive.

What is taken: documents (PDF, Excel, Word, CSV, JSON exports, saved HTML pages)
and any file whose bytes are a PDF whatever its name says (portals serve PDFs as
".download" and ".axd"). What is left out: the style sheets, icons and scripts a
browser saves next to a page in "<name>_files/" folders. They are not evidence.

The manifest (<folder>/_archive_manifest.jsonl) maps every local path to its
fingerprint, so the seeds can cite `archive/files/<sha256>` instead of a path
on one person's computer.
"""

import argparse
import asyncio
import hashlib
import json
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import zstandard  # noqa: E402

from app.services.archive import ZSTD_LEVEL, Archive, from_settings  # noqa: E402

DOC_EXT = {".pdf", ".xls", ".xlsx", ".doc", ".docx", ".csv", ".json", ".html", ".htm", ".txt", ".zip", ".xml"}
MANIFEST = "_archive_manifest.jsonl"


def wanted(path: str) -> bool:
    parts = path.replace("\\", "/").split("/")
    if any(p.endswith("_files") for p in parts[:-1]) or parts[-1] == MANIFEST:
        return False
    if os.path.splitext(path)[1].lower() in DOC_EXT:
        return True
    with open(path, "rb") as fh:
        return fh.read(5) == b"%PDF-"


def scan(folder: str) -> list[str]:
    out = []
    for dirpath, _, files in os.walk(folder):
        for f in sorted(files):
            p = os.path.join(dirpath, f)
            if os.path.isfile(p) and wanted(p):
                out.append(p)
    return sorted(out)


def plan(folder: str, estimate: bool = False) -> dict:
    """Pure enough to test: fingerprints, duplicates and sizes, nothing stored."""
    by_sha: dict[str, list[str]] = defaultdict(list)
    sizes: dict[str, int] = {}
    packed = 0
    cctx = zstandard.ZstdCompressor(level=ZSTD_LEVEL) if estimate else None
    for p in scan(folder):
        data = open(p, "rb").read()
        sha = hashlib.sha256(data).hexdigest()
        if sha not in by_sha and cctx is not None:
            packed += min(len(data), len(cctx.compress(data)))
        by_sha[sha].append(os.path.relpath(p, folder))
        sizes[sha] = len(data)
    total = sum(sizes[s] * len(ps) for s, ps in by_sha.items())
    unique = sum(sizes.values())
    return {
        "files": sum(len(v) for v in by_sha.values()),
        "unique": len(by_sha),
        "total_bytes": total,
        "unique_bytes": unique,
        "estimated_stored_bytes": packed if estimate else None,
        "duplicates": {s: ps for s, ps in by_sha.items() if len(ps) > 1},
    }


async def record(rows: list[dict]) -> None:
    from sqlalchemy.dialects.postgresql import insert
    from app.database import get_db_context
    from app.models.archive import ArchivedFile, ArchivedFileSource
    async with get_db_context() as db:
        for r in rows:
            await db.execute(insert(ArchivedFile).values(
                sha256=r["sha256"], size_bytes=r["size"], stored_bytes=r["stored"], codec=r["codec"],
                content_type=r["content_type"]).on_conflict_do_nothing(index_elements=["sha256"]))
            await db.execute(insert(ArchivedFileSource).values(
                sha256=r["sha256"], url=f"local:{r['path']}",
                note="Downloaded by hand; the government address is to be filled in from the seed that cites it.",
            ).on_conflict_do_nothing(constraint="uq_archived_source_sha_url"))
        await db.commit()


def apply(folder: str, archive: Archive) -> list[dict]:
    rows = []
    with open(os.path.join(folder, MANIFEST), "a", encoding="utf-8") as man:
        for p in scan(folder):
            st = archive.put_file(p)
            row = {"path": os.path.relpath(p, folder).replace("\\", "/"), "sha256": st.sha256, "size": st.size_bytes,
                   "stored": st.stored_bytes, "codec": st.codec, "content_type": st.content_type, "created": st.created}
            if st.created:
                man.write(json.dumps(row) + "\n")
            rows.append(row)
    return rows


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder")
    ap.add_argument("--estimate", action="store_true", help="measure compression in the dry run (slower)")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--record", action="store_true", help="also write archived_files rows (needs DATABASE_URL)")
    a = ap.parse_args()
    folder = os.path.abspath(a.folder)
    if not a.apply:
        p = plan(folder, a.estimate)
        mb = lambda n: f"{n / 1e6:,.1f} MB"  # noqa: E731
        print(f"{p['files']} files, {p['unique']} distinct. {mb(p['total_bytes'])} on disk, {mb(p['unique_bytes'])} once each.")
        if p["estimated_stored_bytes"] is not None:
            print(f"Compressed (lossless): {mb(p['estimated_stored_bytes'])}.")
        for sha, paths in p["duplicates"].items():
            print(f"  same file {sha[:12]}: " + " | ".join(paths))
        print("Dry run: nothing stored. Run again with --apply.")
        return 0
    from app.config import settings
    archive = from_settings(settings)
    rows = apply(folder, archive)
    new = [r for r in rows if r["created"]]
    print(f"{len(rows)} files: {len(new)} stored now, {len(rows) - len(new)} already held.")
    if a.record:
        asyncio.run(record([r | {"stored": r["stored"] if r["stored"] >= 0 else r["size"]} for r in new]))
        print(f"Register: {len(new)} rows written (existing rows left alone).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
