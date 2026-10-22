"""
WHY THIS TEST EXISTS

The seed put a private company in the "department" field for three curated
projects ("GMR Visakhapatnam International Airport Ltd / AP Airports
Development Corporation"), so the page told readers a company was a
government department. The fix splits the two: the government body stays in
department, the company goes to implementing_agency, and the loader now
writes that column. This pins three things: the loader carries the agency,
an entry without the key leaves the column alone, and no seed department
names a private company again.
"""
import importlib.util
import json
from datetime import datetime, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("load_seed_data", BACKEND / "scripts" / "load_seed_data.py")
loader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(loader)

NOW = datetime(2026, 9, 30, tzinfo=timezone.utc)
SEED = json.loads((BACKEND / "seed" / "projects_seed.json").read_text(encoding="utf-8"))["projects"]


def entry(**over):
    # Type and status taken from a real seed entry, so the test follows the enums.
    base = {"title": "Test project", "project_type": SEED[0]["project_type"], "status": SEED[0]["status"]}
    base.update(over)
    return base


def test_loader_carries_the_implementing_agency():
    fields = loader.project_fields(entry(department="AP Airports Development Corporation (state government company)",
                                         implementing_agency="GMR Visakhapatnam International Airport Ltd (private company)"), NOW)
    assert fields["department"] == "AP Airports Development Corporation (state government company)"
    assert fields["implementing_agency"] == "GMR Visakhapatnam International Airport Ltd (private company)"


def test_an_entry_without_an_agency_leaves_the_column_alone():
    fields = loader.project_fields(entry(department="AP Maritime Board"), NOW)
    assert "implementing_agency" not in fields


def test_no_seed_department_names_a_private_company():
    for e in SEED:
        dept = (e.get("department") or "").lower()
        assert "private" not in dept, f'{e["title"]}: a private company belongs in implementing_agency, not department'
        agency = (e.get("implementing_agency") or "").lower()
        if agency:
            assert agency.split(" (")[0] not in dept, f'{e["title"]}: the agency is repeated inside the department'


def test_the_three_split_entries_as_published():
    by_title = {e["title"]: e for e in SEED}
    bhogapuram = next(e for t, e in by_title.items() if t.startswith("Alluri Sitarama Raju International Airport"))
    assert bhogapuram["implementing_agency"] == "GMR Visakhapatnam International Airport Ltd (private company)"
    assert by_title["JSW Kadapa Steel Plant"]["implementing_agency"] == "JSW Steel (private company)"
    assert by_title["Machilipatnam Port (Bandar Port)"]["department"] == "AP Maritime Board"
