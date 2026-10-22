"""
Our dated copies of government files, served byte for byte.

GET /api/v1/archive/files/{sha256}          the original file, unpacked
GET /api/v1/archive/files/{sha256}/sources  where and when we found it

A page always links the government's own address first and offers ours as the
backup ("our copy, fetched <date>, fingerprint <sha256>"). The fingerprint is
the URL, so the bytes behind it can never change: the CDN may keep them for a
year (see IMMUTABLE_PATTERN in app/middleware/cache_headers.py), and the
origin, the bucket and the database are touched once per file, not per reader.

Every response from the files route is sandboxed. We archive HTML pages too,
and an archived page served from our own origin would otherwise run its
scripts as us. `Content-Security-Policy: sandbox` and `nosniff` make every
archived file inert; HTML is also sent as a download, never rendered inline.
"""

import mimetypes

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.archive import ArchivedFileSource
from app.services.archive import SHA_RE, IntegrityError, NotArchived, get_archive

router = APIRouter(prefix="/archive", tags=["Source archive"])

CHUNKED_ABOVE = 30 * 1024 * 1024
INLINE_TYPES = {"application/pdf", "image/png", "image/jpeg", "text/plain"}


def _check(sha: str) -> str:
    sha = sha.lower()
    if not SHA_RE.match(sha):
        raise HTTPException(status_code=404, detail="Not a file fingerprint")
    return sha


@router.get("/files/{sha256}")
def archived_file(sha256: str):
    sha = _check(sha256)
    archive = get_archive()
    try:
        chunks, meta = archive.stream(sha)
    except NotArchived:
        raise HTTPException(status_code=404, detail="We do not hold a copy of this file")
    except IntegrityError:
        # Never serve a copy that fails its fingerprint. The audit script reports it.
        raise HTTPException(status_code=503, detail="Our copy failed its fingerprint check and is withheld")
    ctype = meta.get("content_type") or "application/octet-stream"
    ext = mimetypes.guess_extension(ctype) or ""
    disposition = "inline" if ctype in INLINE_TYPES else "attachment"
    headers = {
        "ETag": f'"{sha}"',
        "X-Content-SHA256": sha,
        "Content-Disposition": f'{disposition}; filename="{sha[:12]}{ext}"',
        "Content-Security-Policy": "sandbox",
        "X-Content-Type-Options": "nosniff",
    }
    # Cloud Run caps a response with a declared length at 32 MiB; a chunked one
    # streams past that. So large files go out chunked (budget volumes and the
    # Statistical Abstract are 30 to 45 MB), small ones say their length.
    if meta.get("size") and int(meta["size"]) <= CHUNKED_ABOVE:
        headers["Content-Length"] = meta["size"]
    return StreamingResponse(chunks, media_type=ctype, headers=headers)


@router.get("/files/{sha256}/sources")
async def archived_file_sources(sha256: str, db: AsyncSession = Depends(get_db)):
    sha = _check(sha256)
    rows = (await db.execute(
        select(ArchivedFileSource).where(ArchivedFileSource.sha256 == sha).order_by(ArchivedFileSource.first_fetched_at)
    )).scalars().all()
    if not rows:
        raise HTTPException(status_code=404, detail="No source recorded for this file")
    return {"sha256": sha, "sources": [{
        "url": r.url, "page_url": r.page_url, "publisher": r.publisher, "title": r.title,
        "first_fetched_at": r.first_fetched_at.isoformat() if r.first_fetched_at else None,
        "last_fetched_at": r.last_fetched_at.isoformat() if r.last_fetched_at else None,
        "note": r.note,
    } for r in rows]}
