"""
The source archive: every government file we cite, kept once, byte for byte.

WHY IT EXISTS
Official sites move and die. Nine addresses we relied on were gone by October
2026 (polavaram.gov.in, core.ap.gov.in, apcrda.ap.gov.in and others), and one
(openbudgetsindia.org) now serves betting ads at the same URL. A fact-check that
links to a dead page has nothing left to show. So we keep our own copy of each
file, and we keep it in a way that lets anyone prove it is the government's file
and not ours.

THREE RULES, AND WHY EACH ONE
1. A file is named by its SHA-256 fingerprint. The same file fetched from two
   URLs, or on two dates, is stored once. (On 19 Oct 2026 Dheeraj's sources
   folder held 545 files of which 44 were exact copies.)
2. Compression is lossless only. A stored file unpacks to exactly the bytes the
   portal served, so its fingerprint still matches the one printed on our page,
   and a reader who downloads the same file from the government site gets the
   same fingerprint. We never re-encode a PDF or shrink its images: that would
   save space and destroy the proof. Measured: zstd level 19 takes the 41.3 MB
   Statistical Abstract 2024 to 28.6 MB (69%); JSON and text to 13 to 17%.
   A PDF optimiser that keeps the text identical (qpdf) saved only 3%.
3. Every read is checked. Bytes that do not hash back to their name are never
   served; the caller gets an IntegrityError and the audit script flags the blob.

WHERE THE BYTES LIVE
`LocalBackend` (a folder) for tests and for Dheeraj's PC; `GCSBackend` for
production, one bucket in asia-south1 with a lifecycle that moves old objects
to colder, cheaper classes (deploy/archive/lifecycle.json). The layout is the
same in both, so a folder can be uploaded as it is and moving to another store
later (Cloudflare R2, say) is a copy, not a migration.

    v1/sha256/<first 2 hex>/<next 2 hex>/<64 hex>

What readers download is served by app/routers/archive.py, unpacked on the way
out and cached at the CDN forever, because a fingerprinted URL can never change.
"""

from __future__ import annotations

import hashlib
import mimetypes
import os
import re
from dataclasses import dataclass
from typing import BinaryIO, Iterator, Optional, Protocol

import zstandard

LAYOUT = "v1"
CODEC_ZSTD = "zstd"
CODEC_NONE = "none"
ZSTD_LEVEL = 19
# Keep a file uncompressed unless zstd saves at least this share. Below it the
# unpacking costs more on every download than the storage it saves.
MIN_SAVING = 0.03
CHUNK = 1 << 20

SHA_RE = re.compile(r"^[0-9a-f]{64}$")


class IntegrityError(Exception):
    """Stored bytes do not hash back to the fingerprint they are filed under."""


class NotArchived(KeyError):
    """No blob with this fingerprint."""


@dataclass(frozen=True)
class Stored:
    sha256: str
    size_bytes: int
    stored_bytes: int
    codec: str
    content_type: str
    created: bool          # False when the file was already in the archive (a duplicate)


def key_for(sha: str) -> str:
    if not SHA_RE.match(sha):
        raise ValueError(f"not a sha256 fingerprint: {sha!r}")
    return f"{LAYOUT}/sha256/{sha[:2]}/{sha[2:4]}/{sha}"


def sniff_content_type(data_head: bytes, filename: Optional[str] = None) -> str:
    """The type a browser needs to open the file. The bytes win over the name,
    because portals serve PDFs as `.download` and `.axd` (both seen in our folder)."""
    if data_head.startswith(b"%PDF"):
        return "application/pdf"
    if data_head.startswith(b"\xd0\xcf\x11\xe0"):
        return "application/vnd.ms-excel"
    if data_head.startswith(b"PK\x03\x04") and filename and filename.lower().endswith(".xlsx"):
        return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    if data_head.startswith(b"\x89PNG"):
        return "image/png"
    if data_head[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if filename:
        guessed, _ = mimetypes.guess_type(filename)
        if guessed:
            return guessed
    head = data_head.lstrip()[:15].lower()
    if head.startswith(b"<!doctype html") or head.startswith(b"<html"):
        return "text/html"
    if head[:1] in (b"{", b"["):
        return "application/json"
    return "application/octet-stream"


# ------------------------------------------------------------------ backends

class Backend(Protocol):
    def exists(self, key: str) -> bool: ...
    def put(self, key: str, data: bytes, metadata: dict[str, str], content_type: str) -> None: ...
    def open(self, key: str) -> tuple[BinaryIO, dict[str, str]]: ...
    def keys(self) -> Iterator[str]: ...


class LocalBackend:
    """A folder with the same layout as the bucket. Metadata sits beside each
    object as a small sidecar, so the folder can be uploaded to a bucket as is."""

    def __init__(self, root: str):
        self.root = os.path.abspath(root)

    def _path(self, key: str) -> str:
        return os.path.join(self.root, *key.split("/"))

    def exists(self, key: str) -> bool:
        return os.path.exists(self._path(key))

    def put(self, key: str, data: bytes, metadata: dict[str, str], content_type: str) -> None:
        path = self._path(key)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        # Write then rename, so a crash never leaves half a file under a real name.
        tmp = path + ".part"
        with open(tmp, "wb") as fh:
            fh.write(data)
        # `content_type` in the metadata is the original file's; the stored object's own
        # type (application/zstd when packed) is kept apart so the two are never confused.
        meta = dict(metadata, object_content_type=content_type)
        with open(path + ".meta", "w", encoding="utf-8") as fh:
            fh.write("\n".join(f"{k}={v}" for k, v in sorted(meta.items())))
        os.replace(tmp, path)

    def open(self, key: str) -> tuple[BinaryIO, dict[str, str]]:
        path = self._path(key)
        if not os.path.exists(path):
            raise NotArchived(key)
        meta: dict[str, str] = {}
        if os.path.exists(path + ".meta"):
            for line in open(path + ".meta", encoding="utf-8").read().splitlines():
                k, _, v = line.partition("=")
                meta[k] = v
        return open(path, "rb"), meta

    def keys(self) -> Iterator[str]:
        base = os.path.join(self.root, LAYOUT, "sha256")
        for dirpath, _, files in os.walk(base):
            for f in files:
                if SHA_RE.match(f):
                    yield key_for(f)


class GCSBackend:
    """Google Cloud Storage. Objects are never overwritten (if_generation_match=0),
    so two scrapers racing to store the same file cannot corrupt each other."""

    def __init__(self, bucket_name: str, client=None):
        if client is None:
            from google.cloud import storage  # imported here so tests need no credentials
            client = storage.Client()
        self.bucket = client.bucket(bucket_name)

    def exists(self, key: str) -> bool:
        return self.bucket.blob(key).exists()

    def put(self, key: str, data: bytes, metadata: dict[str, str], content_type: str) -> None:
        blob = self.bucket.blob(key)
        blob.metadata = metadata
        try:
            blob.upload_from_string(data, content_type=content_type, if_generation_match=0)
        except Exception as e:  # PreconditionFailed: someone stored it first, which is fine
            if getattr(e, "code", None) == 412:
                return
            raise

    def open(self, key: str) -> tuple[BinaryIO, dict[str, str]]:
        blob = self.bucket.get_blob(key)
        if blob is None:
            raise NotArchived(key)
        meta = dict(blob.metadata or {})
        meta.setdefault("content_type", blob.content_type or "application/octet-stream")
        return blob.open("rb"), meta

    def keys(self) -> Iterator[str]:
        for blob in self.bucket.list_blobs(prefix=f"{LAYOUT}/sha256/"):
            if SHA_RE.match(blob.name.rsplit("/", 1)[-1]):
                yield blob.name


# ------------------------------------------------------------------ the archive

class Archive:
    def __init__(self, backend: Backend):
        self.backend = backend

    def put_bytes(self, data: bytes, filename: Optional[str] = None,
                  content_type: Optional[str] = None) -> Stored:
        sha = hashlib.sha256(data).hexdigest()
        key = key_for(sha)
        ctype = content_type or sniff_content_type(data[:64], filename)
        if self.backend.exists(key):
            return Stored(sha, len(data), -1, "", ctype, created=False)

        packed = zstandard.ZstdCompressor(level=ZSTD_LEVEL, write_checksum=True).compress(data)
        if len(packed) <= len(data) * (1 - MIN_SAVING):
            body, codec = packed, CODEC_ZSTD
        else:
            body, codec = data, CODEC_NONE
        # Prove the round trip before it is filed: a codec bug found here costs
        # nothing; found by a reader, it costs the site's word.
        if codec == CODEC_ZSTD and hashlib.sha256(zstandard.ZstdDecompressor().decompress(body)).hexdigest() != sha:
            raise IntegrityError(f"{sha}: compressed copy does not unpack to the original")

        metadata = {"sha256": sha, "size": str(len(data)), "codec": codec, "content_type": ctype}
        self.backend.put(key, body, metadata, ctype if codec == CODEC_NONE else "application/zstd")
        return Stored(sha, len(data), len(body), codec, ctype, created=True)

    def put_file(self, path: str) -> Stored:
        with open(path, "rb") as fh:
            return self.put_bytes(fh.read(), filename=os.path.basename(path))

    def has(self, sha: str) -> bool:
        return self.backend.exists(key_for(sha))

    def info(self, sha: str) -> dict[str, str]:
        fh, meta = self.backend.open(key_for(sha))
        fh.close()
        return meta

    def _chunks(self, sha: str) -> tuple[Iterator[bytes], dict[str, str]]:
        fh, meta = self.backend.open(key_for(sha))
        codec = meta.get("codec", CODEC_NONE)

        def gen() -> Iterator[bytes]:
            with fh:
                src: BinaryIO = zstandard.ZstdDecompressor().stream_reader(fh) if codec == CODEC_ZSTD else fh
                while True:
                    block = src.read(CHUNK)
                    if not block:
                        break
                    yield block

        return gen(), meta

    def verify(self, sha: str) -> int:
        """Unpack and hash the stored copy without holding it in memory.
        Returns the original size; raises IntegrityError on any mismatch."""
        chunks, meta = self._chunks(sha)
        h, n = hashlib.sha256(), 0
        try:
            for block in chunks:
                h.update(block)
                n += len(block)
        except zstandard.ZstdError as e:
            raise IntegrityError(f"{sha}: stored copy does not unpack ({e})") from e
        if h.hexdigest() != sha:
            raise IntegrityError(f"{sha}: stored copy hashes to {h.hexdigest()}")
        if meta.get("size") and int(meta["size"]) != n:
            raise IntegrityError(f"{sha}: size {n} does not match the recorded {meta['size']}")
        return n

    def stream(self, sha: str) -> tuple[Iterator[bytes], dict[str, str]]:
        """The original bytes, in chunks, checked first. A reader is never sent a
        byte of a copy that fails its fingerprint. The check reads the object once
        more, which only happens on a CDN miss (the URL is immutable)."""
        self.verify(sha)
        return self._chunks(sha)

    def get_bytes(self, sha: str) -> bytes:
        chunks, _ = self.stream(sha)
        return b"".join(chunks)


def from_settings(settings) -> Archive:
    """`ARCHIVE_BACKEND=gcs` with `ARCHIVE_BUCKET`, or `local` with `ARCHIVE_LOCAL_ROOT`."""
    if settings.archive_backend == "gcs":
        if not settings.archive_bucket:
            raise RuntimeError("ARCHIVE_BACKEND=gcs needs ARCHIVE_BUCKET")
        return Archive(GCSBackend(settings.archive_bucket))
    return Archive(LocalBackend(settings.archive_local_root))


_singleton: Optional[Archive] = None


def get_archive() -> Archive:
    global _singleton
    if _singleton is None:
        from app.config import settings
        _singleton = from_settings(settings)
    return _singleton


def set_archive_for_tests(archive: Optional[Archive]) -> None:
    global _singleton
    _singleton = archive


__all__ = ["Archive", "LocalBackend", "GCSBackend", "Stored", "IntegrityError", "NotArchived",
           "key_for", "sniff_content_type", "from_settings", "get_archive", "set_archive_for_tests"]
