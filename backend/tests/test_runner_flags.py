"""--only and --skip must compose into the group list before anything touches the database."""
import os
import subprocess
import sys

SCRIPT = os.path.join(os.path.dirname(__file__), "..", "scripts", "run_all_scrapers.py")


def _run(*flags):
    return subprocess.run([sys.executable, SCRIPT, *flags], capture_output=True, text=True,
                          cwd=os.path.join(os.path.dirname(__file__), ".."))


def test_only_and_skip_of_the_same_group_leaves_nothing_and_says_so():
    done = _run("--only", "tenders", "--skip", "tenders")
    assert done.returncode == 2, done.stderr[-500:]
    assert "No scrapers in group(s) []" in (done.stdout + done.stderr)


def test_help_names_the_skip_flag():
    done = _run("--help")
    assert done.returncode == 0
    assert "--skip" in done.stdout and "tenders" in done.stdout
