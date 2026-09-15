"""
The gate every scraped row passes through before it can reach the database.

WHY THIS EXISTS
A scraper has four ways to go wrong, and only the first one is loud:

  1. It crashes.                        — obvious, already recorded as FAILED
  2. It finds nothing, run after run.   — quiet; looks identical to "no news"
  3. It re-saves the same rows as new.  — quiet; the register slowly fills with duplicates
  4. It runs cleanly and saves WRONG data. — silent, and the worst of the four

Number 4 is the one that matters here. A government portal moves a column, the
parser keeps parsing, and plausible-looking nonsense is published on a platform
whose entire claim is that its figures are the government's real figures. No
monitor watching run counts or exit codes can see that happen — by every signal
it has, the run was a success.

So the defence is not "alert afterwards", it is "refuse to write". A stale
figure with an honest date is recoverable. A wrong figure presented as sourced
is not.

THE FOUR LAYERS

  1. SHAPE      Did we get the page we expected at all? Row count against the
                last known-good run catches redesigns, login walls and error
                pages served with HTTP 200 — the cases where parsing "succeeds"
                against something that is not the document.

  2. FIELDS     Is each row individually plausible? Dates in range, titles of a
                sane length, URLs on the expected host, enums actually in the
                enum. A few bad rows are dropped and counted; a lot of bad rows
                means the parser is wrong, not the data, and the run aborts.

  3. DRIFT      Does this batch look like the batches before it? Compared as
                STATISTICS, not values — null rate per field, distinct ratio,
                mean title length. Contents change daily; shape does not. A
                field whose null rate jumps from 3% to 71% is a column that
                moved, and this is the only layer that can see that.

  4. KEYS       Is the dedupe key stable? If "new" rows collide with existing
                ones under whitespace/case normalisation, the key is unstable
                and the next run will duplicate everything it just wrote.

WHAT THIS DELIBERATELY DOES NOT DO
It cannot catch a figure the government itself published wrongly, nor a value
correctly parsed from a genuinely relocated table that happens to look right.
That is what the citation and date on every figure are for. Validation narrows
the gap; it never closes it.
"""

from __future__ import annotations

import re
import statistics
from dataclasses import dataclass, field as dc_field
from datetime import date, datetime, timezone
from typing import Any, Callable, Iterable, Optional, Sequence
from urllib.parse import urlparse

from app.utils.logger import logger


class SanityAbort(RuntimeError):
    """Raised to refuse a whole batch.

    A distinct type so the refresh runner can record it as a deliberate refusal
    rather than an unexpected crash — the difference matters on the /updates
    page and in the alert email, where "we chose not to write" reads very
    differently from "the scraper broke".
    """


# --------------------------------------------------------------------------
# Layer 2 — per-field rules
# --------------------------------------------------------------------------

# Government listings are generous with whitespace and occasionally with
# nothing at all. A title of four characters is a parse artefact ("PDF", "S.No"),
# not a document title; one of 900 is usually a whole table cell swallowed whole.
DEFAULT_MIN_TITLE = 8
DEFAULT_MAX_TITLE = 500


@dataclass(frozen=True)
class FieldRule:
    """One field's plausibility contract.

    Every bound is optional. A rule that sets nothing still enforces `required`,
    which is the check most worth having: a field that silently becomes NULL for
    every row is exactly what a moved column looks like from the inside.
    """

    required: bool = False
    min_len: Optional[int] = None
    max_len: Optional[int] = None
    # Dates (accepts date/datetime). `max_year_ahead` guards the "Swarna Andhra
    # @2047" class of bug, where a title's number is mistaken for a year.
    min_year: Optional[int] = None
    max_year_ahead: Optional[int] = None
    # URLs must stay on a host we expect. A parser that starts following an ad
    # network or a CDN redirect is not scraping the government any more.
    host_suffix: Optional[str] = None
    # Numbers: an order-of-magnitude fence, not a business rule.
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    choices: Optional[frozenset] = None
    # Escape hatch for anything the above cannot express. Returns None if fine,
    # or a short reason string.
    custom: Optional[Callable[[Any], Optional[str]]] = None

    def check(self, value: Any) -> Optional[str]:
        """Return None if acceptable, else a short human reason."""
        if value is None or (isinstance(value, str) and not value.strip()):
            return "missing" if self.required else None

        if isinstance(value, str):
            text = value.strip()
            if self.min_len is not None and len(text) < self.min_len:
                return f"too short ({len(text)} chars)"
            if self.max_len is not None and len(text) > self.max_len:
                return f"too long ({len(text)} chars)"
            if self.host_suffix is not None:
                host = (urlparse(text).hostname or "").lower()
                if not host.endswith(self.host_suffix.lower()):
                    return f"unexpected host {host!r}"

        if isinstance(value, (date, datetime)):
            year = value.year
            if self.min_year is not None and year < self.min_year:
                return f"year {year} before {self.min_year}"
            if self.max_year_ahead is not None:
                horizon = datetime.now(timezone.utc).year + self.max_year_ahead
                if year > horizon:
                    return f"year {year} beyond {horizon}"

        if isinstance(value, (int, float)) and not isinstance(value, bool):
            if self.min_value is not None and value < self.min_value:
                return f"{value} below {self.min_value}"
            if self.max_value is not None and value > self.max_value:
                return f"{value} above {self.max_value}"

        if self.choices is not None:
            raw = getattr(value, "value", value)
            if raw not in self.choices:
                return f"{raw!r} not an allowed value"

        if self.custom is not None:
            return self.custom(value)

        return None


# --------------------------------------------------------------------------
# The per-scraper declaration
# --------------------------------------------------------------------------

@dataclass(frozen=True)
class SanitySpec:
    """What a healthy batch from one scraper looks like.

    Deliberately declarative. Eleven scrapers adopting eleven hand-rolled
    validators would drift apart within a month; eleven scrapers declaring
    eleven small specs against one enforcement path will not.
    """

    # Layer 1 — a batch smaller than this is never legitimate for this source.
    min_rows: int = 1
    # ...and a batch under this fraction of the last known-good run is treated
    # as a redesign. 0.5 is deliberately loose: registers genuinely shrink when
    # a portal archives old entries, and a gate that fires on ordinary variation
    # is a gate that gets disabled.
    row_floor_ratio: float = 0.5

    # Layer 2
    fields: dict[str, FieldRule] = dc_field(default_factory=dict)
    # Above this share of rejected rows the parser is wrong, not the page.
    max_reject_ratio: float = 0.2
    # ...but not below this many rejected rows, whatever the share. A ratio has
    # no meaning on a tiny batch: a district collectorate whose page holds two
    # documents, one of them titled "Notice", is 50% rejected and perfectly
    # healthy. Three bad rows is the smallest number that can describe a parser
    # rather than an unusual page.
    min_rejects_to_abort: int = 3

    # Layer 3 — fields whose null rate is watched across runs. Defaults to every
    # declared field, which is usually what you want.
    drift_fields: Optional[tuple[str, ...]] = None
    # An absolute jump in null rate (0.30 = 30 percentage points) that means a
    # column moved. Absolute, not relative: 0%→30% and 40%→70% are both alarming,
    # but a relative test calls the first infinite and the second unremarkable.
    max_null_rate_jump: float = 0.30
    # Below this many baseline runs, drift cannot be judged and is skipped. A
    # cold start must never block a scrape.
    min_baseline_runs: int = 3

    # Layer 4 — the field carrying the stable per-record identity.
    key_field: Optional[str] = None
    # Share of rows that must carry a usable key.
    min_key_coverage: float = 0.95


# --------------------------------------------------------------------------
# Batch statistics — the memory that makes layer 3 possible
# --------------------------------------------------------------------------

def _norm_key(value: Any) -> str:
    """Whitespace- and case-insensitive form of a dedupe key.

    Two keys that differ only by a stray non-breaking space are the same record
    to a human and two records to a database. Comparing on this form is how we
    notice a key that looks stable and is not.
    """
    return re.sub(r"\s+", " ", str(value or "")).strip().casefold()


def summarise(rows: Sequence[dict], spec: SanitySpec) -> dict:
    """The shape of a batch, as numbers that survive the batch itself.

    Stored per run and compared on the next one. Nothing here identifies a
    record — this is the outline of the data, not the data.
    """
    n = len(rows)
    # None means "watch every declared field", which is the useful default.
    # An empty tuple means "watch none", and it has to be distinguished from
    # None rather than tested for truth: `() or fields` is `fields`, so a
    # scraper that switched drift off got every field watched instead. The
    # district scraper has carried `drift_fields=()` and a comment explaining
    # why since the day the gate was written, and drift was on the whole time.
    watched = tuple(spec.fields.keys()) if spec.drift_fields is None else spec.drift_fields

    null_rates = {}
    for name in watched:
        missing = sum(
            1 for r in rows
            if r.get(name) is None
            or (isinstance(r.get(name), str) and not r[name].strip())
        )
        null_rates[name] = round(missing / n, 4) if n else 0.0

    titles = [str(r.get("title") or "") for r in rows]
    key_values = (
        [_norm_key(r.get(spec.key_field)) for r in rows if r.get(spec.key_field)]
        if spec.key_field else []
    )

    return {
        "rows": n,
        "null_rates": null_rates,
        "mean_title_len": round(statistics.fmean(len(t) for t in titles), 2) if titles else 0.0,
        # 1.0 means every row is distinct. A collapse toward 0 means the parser
        # is emitting the same record repeatedly — the header row, usually.
        "distinct_ratio": round(len(set(key_values)) / n, 4) if (n and key_values) else 0.0,
    }


# --------------------------------------------------------------------------
# The gate
# --------------------------------------------------------------------------

@dataclass
class GateResult:
    """What the gate let through, and what it stopped."""
    rows: list[dict]
    rejected: list[tuple[dict, str]]
    stats: dict

    @property
    def rejected_summary(self) -> str:
        if not self.rejected:
            return ""
        reasons: dict[str, int] = {}
        for _, why in self.rejected:
            reasons[why] = reasons.get(why, 0) + 1
        top = sorted(reasons.items(), key=lambda kv: -kv[1])[:3]
        return "; ".join(f"{why} ({n})" for why, n in top)


class SanityGate:
    """Runs the four layers over one batch. Raises SanityAbort to refuse it."""

    def __init__(self, scraper_name: str, spec: SanitySpec, baseline: Sequence[dict] = ()):
        self.scraper_name = scraper_name
        self.spec = spec
        # Most recent first; the summaries of previous successful runs.
        self.baseline = list(baseline)

    # -- layer 1 ----------------------------------------------------------
    def check_shape(self, row_count: int) -> None:
        spec = self.spec
        if row_count < spec.min_rows:
            raise SanityAbort(
                f"{self.scraper_name}: parsed {row_count} row(s), expected at least "
                f"{spec.min_rows} — the page layout changed or it is not the page "
                "we think it is. Nothing written."
            )
        if self.baseline:
            last_good = max(b.get("rows", 0) for b in self.baseline)
            floor = last_good * spec.row_floor_ratio
            if last_good and row_count < floor:
                raise SanityAbort(
                    f"{self.scraper_name}: parsed {row_count} rows against a recent "
                    f"best of {last_good} (floor {floor:.0f}). That is a redesign or a "
                    "truncated response, not a quiet week. Nothing written."
                )

    # -- layer 2 ----------------------------------------------------------
    def filter_rows(self, rows: Iterable[dict]) -> tuple[list[dict], list[tuple[dict, str]]]:
        kept: list[dict] = []
        rejected: list[tuple[dict, str]] = []
        for row in rows:
            problem = None
            for name, rule in self.spec.fields.items():
                why = rule.check(row.get(name))
                if why:
                    problem = f"{name}: {why}"
                    break
            (kept.append(row) if problem is None else rejected.append((row, problem)))

        total = len(kept) + len(rejected)
        if (total and len(rejected) >= self.spec.min_rejects_to_abort
                and (len(rejected) / total) > self.spec.max_reject_ratio):
            reasons: dict[str, int] = {}
            for _, why in rejected:
                reasons[why] = reasons.get(why, 0) + 1
            worst = sorted(reasons.items(), key=lambda kv: -kv[1])[:3]
            detail = "; ".join(f"{why} x{n}" for why, n in worst)
            raise SanityAbort(
                f"{self.scraper_name}: {len(rejected)} of {total} rows failed field "
                f"checks ({detail}). At that rate the parser is wrong, not the data. "
                "Nothing written."
            )
        return kept, rejected

    # -- layer 4 ----------------------------------------------------------
    def check_keys(self, rows: Sequence[dict]) -> None:
        key = self.spec.key_field
        if not key or not rows:
            return
        present = [r for r in rows if r.get(key) not in (None, "")]
        coverage = len(present) / len(rows)
        if coverage < self.spec.min_key_coverage:
            raise SanityAbort(
                f"{self.scraper_name}: only {coverage:.0%} of rows carry a {key!r} "
                f"(need {self.spec.min_key_coverage:.0%}). Without a stable key the "
                "next run duplicates everything this one writes. Nothing written."
            )
        normalised = [_norm_key(r[key]) for r in present]
        if len(set(normalised)) < len(set(str(r[key]) for r in present)):
            raise SanityAbort(
                f"{self.scraper_name}: {key!r} values collide once whitespace and case "
                "are normalised — the key is not stable. Nothing written."
            )

    # -- layer 3 ----------------------------------------------------------
    def check_drift(self, stats: dict) -> None:
        spec = self.spec
        if len(self.baseline) < spec.min_baseline_runs:
            logger.debug(
                f"[{self.scraper_name}] drift check skipped — {len(self.baseline)} "
                f"baseline run(s), need {spec.min_baseline_runs}"
            )
            return

        for name, rate in stats.get("null_rates", {}).items():
            history = [
                b["null_rates"][name] for b in self.baseline
                if name in b.get("null_rates", {})
            ]
            if len(history) < spec.min_baseline_runs:
                continue
            # Median, not mean: one previous bad run must not drag the baseline
            # toward the thing we are trying to detect.
            usual = statistics.median(history)
            if rate - usual > spec.max_null_rate_jump:
                raise SanityAbort(
                    f"{self.scraper_name}: {name!r} is empty on {rate:.0%} of rows, "
                    f"against {usual:.0%} normally. That is a column that moved, not "
                    "a change in the data. Nothing written."
                )

        if spec.key_field:
            history = [b["distinct_ratio"] for b in self.baseline if b.get("distinct_ratio")]
            if len(history) >= spec.min_baseline_runs:
                usual = statistics.median(history)
                now = stats.get("distinct_ratio", 0.0)
                # Half the usual distinctness means the parser has started
                # emitting the same record over and over.
                if usual > 0 and now < usual / 2:
                    raise SanityAbort(
                        f"{self.scraper_name}: only {now:.0%} of rows are distinct, "
                        f"against {usual:.0%} normally — the parser is repeating itself. "
                        "Nothing written."
                    )

    # -- the whole gate ---------------------------------------------------
    def run(self, rows: Sequence[dict]) -> GateResult:
        """Apply all four layers. Returns what may be written, or raises."""
        self.check_shape(len(rows))
        kept, rejected = self.filter_rows(rows)
        self.check_keys(kept)
        stats = summarise(kept, self.spec)
        self.check_drift(stats)

        if rejected:
            logger.warning(
                f"[{self.scraper_name}] dropped {len(rejected)} of {len(rows)} rows: "
                f"{GateResult(kept, rejected, stats).rejected_summary}"
            )
        return GateResult(rows=kept, rejected=rejected, stats=stats)
