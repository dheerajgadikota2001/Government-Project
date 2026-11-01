"""
A refresh run that covers one group looks at the dates of the groups it did not
cover, and turns their silence into a NEEDS YOU line. Database calls are faked:
the rule under test is the arithmetic and the wording, not SQL.
"""

import asyncio
import importlib.util
import os
import sys
from datetime import datetime, timedelta, timezone

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _load_runner():
    spec = importlib.util.spec_from_file_location("run_all_scrapers", os.path.join(ROOT, "scripts", "run_all_scrapers.py"))
    mod = importlib.util.module_from_spec(spec)
    sys.modules["run_all_scrapers"] = mod
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture
def captured(monkeypatch):
    """Run _alert with every database call faked and catch the report it builds."""
    runner = _load_runner()
    from app.services import alerts, run_recorder
    from app.models.data_update import RunStatus

    box = {}
    last_runs = {}

    async def fake_last_run_at(source):
        return last_runs.get(source)

    async def fake_previous_status(source, run_id):
        return RunStatus.OK

    async def fake_send(report):
        box["report"] = report
        return {"sent": False, "reason": "test"}

    monkeypatch.setattr(run_recorder, "last_run_at", fake_last_run_at)
    monkeypatch.setattr(run_recorder, "previous_status", fake_previous_status)
    monkeypatch.setattr(alerts, "send", fake_send)
    monkeypatch.setattr(alerts, "is_heartbeat_day", lambda: False)

    def run(groups, last_runs_by_source):
        last_runs.clear()
        last_runs.update(last_runs_by_source)
        not_run = [(g, n) for g, n, _ in runner.SCRAPERS if g not in groups]
        asyncio.run(runner._alert("run1", datetime.now(timezone.utc), [], [{"source": "AP CRDA tenders", "count": 1}],
                                  [], [], ["AP CRDA tenders"], [], groups, not_run))
        return box["report"]

    return run, runner


def test_a_daily_group_that_never_ran_is_a_needs_you_line(captured):
    run, runner = captured
    report = run(["tenders"], {})
    titles = [n["title"] for n in report["needs_you"]]
    daily_count = sum(1 for g, _, _ in runner.SCRAPERS if g == "daily")
    assert f"'daily' group has never run in this database ({daily_count} sources)" in titles
    assert any(t.startswith("'documents' group has never run") for t in titles)
    assert report["groups"] == ["tenders"]
    assert len(report["not_run"]) == len(runner.SCRAPERS) - 1


def test_a_daily_group_run_yesterday_is_not_nagged(captured):
    run, runner = captured
    yesterday = datetime.now(timezone.utc) - timedelta(hours=20)
    last = {n: yesterday for g, n, _ in runner.SCRAPERS if g != "tenders"}
    report = run(["tenders"], last)
    assert report["needs_you"] == []


def test_a_daily_group_silent_for_a_month_names_the_days(captured):
    run, runner = captured
    old = datetime.now(timezone.utc) - timedelta(days=32)
    last = {n: old for g, n, _ in runner.SCRAPERS if g != "tenders"}
    report = run(["tenders"], last)
    daily = [n for n in report["needs_you"] if n["title"].startswith("'daily'")]
    assert len(daily) == 1
    assert "not run for 32 days" in daily[0]["title"]
    assert "--only daily" in daily[0]["action"]
    assert "last run " + old.date().isoformat() in daily[0]["detail"]


def test_the_documents_group_gets_a_longer_allowance(captured):
    run, runner = captured
    ten_days = datetime.now(timezone.utc) - timedelta(days=10)
    last = {n: ten_days for g, n, _ in runner.SCRAPERS if g != "tenders"}
    report = run(["tenders"], last)
    titles = [n["title"] for n in report["needs_you"]]
    assert any(t.startswith("'daily' group not run for 10 days") for t in titles)
    assert not any(t.startswith("'documents'") for t in titles)


def test_a_full_run_has_nothing_to_nag_about(captured):
    run, runner = captured
    report = run(runner.GROUPS, {})
    assert report["needs_you"] == []
    assert report["not_run"] == []
