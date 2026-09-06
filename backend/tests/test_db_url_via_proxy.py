"""The proxy rewrite must change the address and nothing else."""
import os
import subprocess
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
from db_url_via_proxy import rewrite  # noqa: E402

SCRIPT = os.path.join(os.path.dirname(__file__), "..", "scripts", "db_url_via_proxy.py")


def test_host_and_port_form_is_repointed():
    out = rewrite("postgresql+asyncpg://apnn:secret@10.20.30.40:5432/applatform", port=5433)
    assert out == "postgresql+asyncpg://apnn:secret@127.0.0.1:5433/applatform"


def test_unix_socket_form_loses_its_host_parameter():
    out = rewrite("postgresql+asyncpg://apnn:secret@/applatform?host=/cloudsql/ap-nadu-nedu:asia-south1:apnn-db", port=5433)
    assert out == "postgresql+asyncpg://apnn:secret@127.0.0.1:5433/applatform"


def test_other_query_parameters_survive():
    out = rewrite("postgresql+asyncpg://apnn:secret@/applatform?host=/cloudsql/x&ssl=require", port=5433)
    assert out == "postgresql+asyncpg://apnn:secret@127.0.0.1:5433/applatform?ssl=require"


def test_password_with_awkward_characters_is_untouched():
    pw = "p%40ss%3Aw%25rd"          # percent-encoded @ : % must not be decoded
    out = rewrite(f"postgresql+asyncpg://apnn:{pw}@10.0.0.1:5432/applatform", port=5433)
    assert out == f"postgresql+asyncpg://apnn:{pw}@127.0.0.1:5433/applatform"


@pytest.mark.parametrize("bad", [
    "mysql://apnn:secret@10.0.0.1:3306/applatform",   # wrong engine
    "postgresql+asyncpg://10.0.0.1:5432/applatform",  # no credentials to keep
    "not a url at all",
])
def test_unusable_input_is_refused(bad):
    with pytest.raises(ValueError):
        rewrite(bad)


def test_cli_reads_env_and_prints_only_the_url():
    env = {**os.environ, "DATABASE_URL_CLOUD": "postgresql+asyncpg://apnn:secret@10.0.0.1:5432/applatform"}
    done = subprocess.run([sys.executable, SCRIPT, "--port", "5433"], env=env, capture_output=True, text=True)
    assert done.returncode == 0
    assert done.stdout.strip() == "postgresql+asyncpg://apnn:secret@127.0.0.1:5433/applatform"
    assert done.stderr == ""


def test_cli_without_the_variable_fails_without_leaking():
    env = {k: v for k, v in os.environ.items() if k != "DATABASE_URL_CLOUD"}
    done = subprocess.run([sys.executable, SCRIPT], env=env, capture_output=True, text=True)
    assert done.returncode == 2
    assert done.stdout == ""
    assert "DATABASE_URL_CLOUD" in done.stderr
