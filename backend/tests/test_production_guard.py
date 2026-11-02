"""
Production refuses to start with development defaults.

A running API with the default secret is worse than a failed revision: every
stored IP hash becomes reversible by anyone who reads config.py. Cloud Run
keeps the previous revision serving when a new one fails, so failing closed
costs nothing but a deploy log line.
"""

from app.config import Settings

GOOD = dict(app_env="production", secret_key="x" * 40, admin_key="y" * 32,
            allowed_origins="https://apfactcheck.dheeco.com,https://ap-nadu-nedu.web.app")


def test_a_correct_production_config_has_no_problems():
    assert Settings(**GOOD).production_misconfigurations() == []


def test_development_is_never_blocked():
    assert Settings(app_env="development").production_misconfigurations() == []


def test_the_default_secret_is_refused():
    p = Settings(**{**GOOD, "secret_key": "change-this-in-production"}).production_misconfigurations()
    assert any("SECRET_KEY" in x for x in p)


def test_a_short_secret_is_refused():
    assert any("SECRET_KEY" in x for x in Settings(**{**GOOD, "secret_key": "short"}).production_misconfigurations())


def test_localhost_origins_are_refused():
    p = Settings(**{**GOOD, "allowed_origins": "https://apfactcheck.dheeco.com,http://localhost:5173"}).production_misconfigurations()
    assert any("ALLOWED_ORIGINS" in x for x in p)


def test_an_empty_admin_key_is_refused():
    assert any("ADMIN_KEY" in x for x in Settings(**{**GOOD, "admin_key": ""}).production_misconfigurations())


def test_startup_exits_non_zero_on_a_problem(monkeypatch):
    import asyncio
    from app import main
    monkeypatch.setattr(main.settings, "app_env", "production")
    monkeypatch.setattr(main.settings, "secret_key", "change-this-in-production")
    try:
        asyncio.run(main.lifespan(main.app).__aenter__())
    except SystemExit as exc:
        assert exc.code == 1
    else:
        raise AssertionError("production started with the default secret")
