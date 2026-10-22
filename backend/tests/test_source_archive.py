"""
The source archive keeps each government file once, byte for byte, and never
serves a copy that fails its fingerprint.

What these tests guard against, in order of how badly it would hurt:
- a reader downloads our copy and it is not the government's file (a codec bug,
  a tampered or damaged object): the site's whole claim rests on this not happening;
- an archived HTML page runs its scripts on our origin;
- the same file is stored many times (the reason for the design);
- a CDN keeps the wrong thing, or keeps a file list forever.
"""

import hashlib
import importlib.util
import os
import pathlib

import pytest
from fastapi.testclient import TestClient

from app.middleware.cache_headers import IMMUTABLE, IMMUTABLE_PATTERN, _shared_ttl
from app.services import archive as arc

ROOT = pathlib.Path(__file__).parents[1]
PDF = b"%PDF-1.7\n" + b"budget volume page text " * 4000 + b"\n%%EOF"


@pytest.fixture()
def store(tmp_path):
    a = arc.Archive(arc.LocalBackend(str(tmp_path / "archive")))
    arc.set_archive_for_tests(a)
    yield a
    arc.set_archive_for_tests(None)


def test_a_file_comes_back_byte_for_byte_and_is_stored_smaller(store):
    st = store.put_bytes(PDF, filename="Volume-I-2.pdf")
    assert st.sha256 == hashlib.sha256(PDF).hexdigest() and st.created
    assert st.codec == "zstd" and st.stored_bytes < len(PDF) // 10
    assert st.content_type == "application/pdf"
    assert store.get_bytes(st.sha256) == PDF


def test_the_same_file_twice_is_stored_once(store):
    a = store.put_bytes(PDF, filename="a.pdf")
    b = store.put_bytes(PDF, filename="copy of a.download")
    assert a.sha256 == b.sha256 and a.created and not b.created
    assert len(list(store.backend.keys())) == 1


def test_a_file_compression_cannot_help_is_kept_as_it_is(store):
    noise = os.urandom(50_000)
    st = store.put_bytes(noise)
    assert st.codec == "none" and st.stored_bytes == len(noise)
    assert store.get_bytes(st.sha256) == noise


def test_a_damaged_copy_is_never_served(store, tmp_path):
    st = store.put_bytes(PDF)
    path = store.backend._path(arc.key_for(st.sha256))
    raw = bytearray(open(path, "rb").read())
    raw[len(raw) // 2] ^= 0xFF
    open(path, "wb").write(bytes(raw))
    with pytest.raises(arc.IntegrityError):
        store.verify(st.sha256)
    from app.main import app
    r = TestClient(app).get(f"/api/v1/archive/files/{st.sha256}")
    assert r.status_code == 503


def test_a_swapped_file_under_a_real_name_is_caught(store):
    st = store.put_bytes(PDF)
    other = store.put_bytes(PDF + b" edited")
    p1, p2 = (store.backend._path(arc.key_for(s)) for s in (st.sha256, other.sha256))
    open(p1, "wb").write(open(p2, "rb").read())
    with pytest.raises(arc.IntegrityError):
        store.verify(st.sha256)


def test_pdfs_with_odd_names_are_recognised_by_their_bytes():
    assert arc.sniff_content_type(b"%PDF-1.4", "DownloadFile.axd") == "application/pdf"
    assert arc.sniff_content_type(b"\xd0\xcf\x11\xe0....", "report.download") == "application/vnd.ms-excel"
    assert arc.sniff_content_type(b"<!DOCTYPE html><html>", "page") == "text/html"


def test_keys_are_fingerprints_only():
    with pytest.raises(ValueError):
        arc.key_for("../../etc/passwd")
    assert arc.key_for("ab" * 32).startswith("v1/sha256/ab/ab/")


# ---------------------------------------------------------------- the route

def test_the_route_serves_the_original_sandboxed(store):
    st = store.put_bytes(PDF, filename="v.pdf")
    from app.main import app
    r = TestClient(app).get(f"/api/v1/archive/files/{st.sha256}")
    assert r.status_code == 200 and r.content == PDF
    assert r.headers["content-type"].startswith("application/pdf")
    assert r.headers["x-content-sha256"] == st.sha256
    assert r.headers["content-security-policy"] == "sandbox"
    assert r.headers["cache-control"] == IMMUTABLE


def test_an_archived_web_page_is_a_download_and_cannot_run(store):
    page = b"<!DOCTYPE html><html><script>alert(document.cookie)</script></html>"
    st = store.put_bytes(page, filename="saved.html")
    from app.main import app
    r = TestClient(app).get(f"/api/v1/archive/files/{st.sha256}")
    assert r.status_code == 200
    assert r.headers["content-disposition"].startswith("attachment")
    assert r.headers["content-security-policy"] == "sandbox"
    assert r.headers["x-content-type-options"] == "nosniff"


def test_unknown_and_malformed_fingerprints_are_404_and_never_cached(store):
    from app.main import app
    c = TestClient(app)
    for path in ("/api/v1/archive/files/" + "0" * 64, "/api/v1/archive/files/not-a-hash"):
        r = c.get(path)
        assert r.status_code == 404
        assert "no-store" in r.headers["cache-control"]


def test_only_the_fingerprinted_file_is_immutable():
    sha = "ab" * 32
    assert IMMUTABLE_PATTERN.match(f"/api/v1/archive/files/{sha}")
    assert not IMMUTABLE_PATTERN.match(f"/api/v1/archive/files/{sha}/sources")
    assert _shared_ttl(f"/api/v1/archive/files/{sha}/sources") == 600


# ---------------------------------------------------------------- the scripts

def _load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_the_folder_plan_finds_duplicates_and_skips_page_assets(tmp_path):
    af = _load("archive_folder")
    (tmp_path / "budget").mkdir()
    (tmp_path / "budget" / "v1.pdf").write_bytes(PDF)
    (tmp_path / "budget" / "v1 (1).pdf").write_bytes(PDF)
    (tmp_path / "budget" / "DownloadFile.axd").write_bytes(PDF + b"x")
    (tmp_path / "page_files").mkdir()
    (tmp_path / "page_files" / "style.css").write_bytes(b"body{}")
    (tmp_path / "page_files" / "scan.pdf").write_bytes(b"%PDF- asset")
    p = af.plan(str(tmp_path), estimate=True)
    assert p["files"] == 3 and p["unique"] == 2
    assert len(p["duplicates"]) == 1
    assert p["estimated_stored_bytes"] < p["unique_bytes"] // 10


def test_applying_twice_stores_nothing_new_and_the_audit_passes(tmp_path):
    af, au = _load("archive_folder"), _load("archive_audit")
    src = tmp_path / "src"
    src.mkdir()
    (src / "a.pdf").write_bytes(PDF)
    (src / "b.json").write_bytes(b'{"rows": [' + b'{"x": 1},' * 500 + b'{"x": 2}]}')
    a = arc.Archive(arc.LocalBackend(str(tmp_path / "arch")))
    first = af.apply(str(src), a)
    second = af.apply(str(src), a)
    assert sum(r["created"] for r in first) == 2 and sum(r["created"] for r in second) == 0
    assert (src / "_archive_manifest.jsonl").read_text().count("\n") == 2
    n, bad = au.audit(a)
    assert n == 2 and bad == []


def test_the_gcs_backend_never_overwrites():
    calls = {}

    class Blob:
        def __init__(self, name): self.name, self.metadata = name, None
        def exists(self): return False
        def upload_from_string(self, data, content_type, if_generation_match):
            calls.update(data=data, ct=content_type, gen=if_generation_match, meta=self.metadata)

    class Bucket:
        def blob(self, name): return Blob(name)

    class Client:
        def bucket(self, name): return Bucket()

    a = arc.Archive(arc.GCSBackend("b", client=Client()))
    st = a.put_bytes(PDF, filename="v.pdf")
    assert calls["gen"] == 0 and calls["ct"] == "application/zstd"
    assert calls["meta"]["sha256"] == st.sha256 and calls["meta"]["content_type"] == "application/pdf"
