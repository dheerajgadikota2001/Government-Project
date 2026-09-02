"""
The shape of a check, and the shape of what it finds.

A check answers one question about the data and returns findings. It never
prints, never exits, and never repairs anything — repairing quietly is how a
wrong number survives. Its job is to say precisely what is wrong, where, and
what a person should do about it.

Severity is a promise about consequence:

  FAIL  something on the public site would be wrong, or a figure would be
        presented as something it is not. The build stops.
  WARN  something is unverifiable, thinner than it looks, or drifting. The
        build continues, and the finding is published.
  INFO  a fact about coverage worth recording — how many years, how many
        sources, what is missing and why.

There is no severity for "probably fine".
"""

from __future__ import annotations

import dataclasses
import json
import os
from typing import Any, Callable, Iterable

FAIL, WARN, INFO = "FAIL", "WARN", "INFO"
_ORDER = {FAIL: 0, WARN: 1, INFO: 2}


@dataclasses.dataclass
class Finding:
    """One thing a check found.

    `where` is a path into the data, not a line number — line numbers move
    when a file is reformatted, and a seed file is reformatted often. A path
    like `indicators[capital_outlay].points[2025]` survives that.

    `fix` is not optional in spirit. A finding a person cannot act on is a
    complaint, and this harness does not exist to complain.
    """

    severity: str
    check: str
    file: str
    where: str
    what: str
    fix: str
    detail: dict[str, Any] = dataclasses.field(default_factory=dict)

    def as_dict(self) -> dict:
        return dataclasses.asdict(self)

    def line(self) -> str:
        return f"[{self.severity}] {self.check} · {self.file} · {self.where}\n      {self.what}\n      → {self.fix}"


class Ctx:
    """Everything a check is allowed to look at.

    Seeds are loaded once and shared. A check that mutates them is a bug;
    nothing here writes.
    """

    def __init__(self, repo_root: str):
        self.repo = repo_root
        self.seed_dir = os.path.join(repo_root, "backend", "seed")
        self.locale_dir = os.path.join(repo_root, "ap-nadu-nedu", "src", "i18n", "locales")
        self.src_dir = os.path.join(repo_root, "ap-nadu-nedu", "src")
        self._seeds: dict[str, Any] | None = None

    @property
    def seeds(self) -> dict[str, Any]:
        if self._seeds is None:
            self._seeds = {}
            if not os.path.isdir(self.seed_dir):
                return self._seeds
            for name in sorted(os.listdir(self.seed_dir)):
                # .bak-* files are a working habit in this repo, not data.
                if not name.endswith(".json") or ".bak" in name:
                    continue
                path = os.path.join(self.seed_dir, name)
                try:
                    with open(path, encoding="utf-8") as f:
                        self._seeds[name] = json.load(f)
                except Exception as exc:  # a malformed seed is itself a finding
                    self._seeds[name] = {"__load_error__": str(exc)}
        return self._seeds

    def seed(self, name: str) -> Any:
        return self.seeds.get(name)


CHECKS: list[tuple[str, str, Callable[[Ctx], Iterable[Finding]]]] = []


def check(key: str, title: str):
    """Register a check. Order of registration is order of reporting."""
    def deco(fn):
        CHECKS.append((key, title, fn))
        return fn
    return deco


def sort_findings(findings: list[Finding]) -> list[Finding]:
    return sorted(findings, key=lambda f: (_ORDER.get(f.severity, 9), f.check, f.file, f.where))
