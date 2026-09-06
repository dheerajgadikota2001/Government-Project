"""
The admin key is the only credential on the platform. Two properties matter:
an unset key is locked, and a wrong key is rejected in constant time.
"""
import pytest
from fastapi import HTTPException

from app.config import settings
from app.routers.community import _require_admin


def test_unset_key_means_locked(monkeypatch):
    monkeypatch.setattr(settings, "admin_key", "")
    with pytest.raises(HTTPException) as e:
        _require_admin("anything")
    assert e.value.status_code == 403


def test_missing_header_is_rejected(monkeypatch):
    monkeypatch.setattr(settings, "admin_key", "correct-horse")
    with pytest.raises(HTTPException):
        _require_admin(None)


def test_wrong_key_is_rejected_and_right_key_passes(monkeypatch):
    monkeypatch.setattr(settings, "admin_key", "correct-horse")
    with pytest.raises(HTTPException):
        _require_admin("correct-hors")           # one byte short, the timing case
    _require_admin("correct-horse")              # no raise


def test_compare_is_constant_time_by_construction():
    # Not a timing measurement, those are flaky in CI. This pins that the
    # implementation calls compare_digest, so a future edit back to != fails.
    import inspect
    from app.routers import community
    src = inspect.getsource(community._require_admin)
    assert "compare_digest" in src
    assert " != " not in src
