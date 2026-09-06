"""
Every name a router uses must exist in that router.

WHY THIS EXISTS
On 6 Sep 2026 a deploy broke every district page. The cause was one line: a
function was called in app/routers/projects.py and never imported there. Python
raises NameError only when the line runs, and no test ran it, so 92 green tests
shipped a 500 to production.

Undefined names are cheap to find and expensive to miss, so this test walks the
routers and asks the question directly, with no database and no network.
"""
import ast
import builtins
import pathlib

import pytest

ROUTERS = sorted((pathlib.Path(__file__).parent.parent / "app" / "routers").glob("*.py"))


def _defined_at_module_level(tree: ast.Module) -> set[str]:
    """Names an import, assignment or def puts in the module namespace."""
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for a in node.names:
                names.add(a.asname or a.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom):
            for a in node.names:
                names.add(a.asname or a.name)
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.add(node.name)
        elif isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            names.add(node.id)
        elif isinstance(node, ast.arg):
            names.add(node.arg)
        elif isinstance(node, ast.ExceptHandler) and node.name:
            names.add(node.name)
        elif isinstance(node, (ast.comprehension,)):
            for t in ast.walk(node.target):
                if isinstance(t, ast.Name):
                    names.add(t.id)
    return names


@pytest.mark.parametrize("path", ROUTERS, ids=lambda p: p.name)
def test_every_called_name_exists(path):
    tree = ast.parse(path.read_text(encoding="utf-8"))
    known = _defined_at_module_level(tree) | set(dir(builtins))

    called = {
        node.func.id
        for node in ast.walk(tree)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
    }
    missing = sorted(called - known)
    assert not missing, f"{path.name} calls names it never defines or imports: {missing}"
