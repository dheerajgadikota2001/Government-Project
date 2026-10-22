"""
Reservoirs, rainfall, tanks and groundwater, read daily from APWRIMS.

APWRIMS (apwrims.ap.gov.in) is the Water Resources Department's own information
system. Its dashboards are filled from a public JSON API on the same official
host: no login, no key, no cookie. The calls below are the ones the dashboard
itself makes (read from its JavaScript bundle on 21 Oct 2026). We call nothing
else: the bundle also holds login, user and chatbot endpoints, and those are
never touched.

WHAT A READING IS
A dashboard has no edition to cite, so each reading is stored whole in
live_readings with the time we read it and the source's own time stamps. One row
per distinct payload: an unchanged dashboard adds nothing. Values are kept as
the API serves them. Nothing is added, divided or rounded here; the group totals
are APWRIMS's own.

FOUR THINGS THE SOURCE DOES THAT A READER MUST NOT BE MISLED BY
- A reservoir's "current" reading can be days old (Annamayya was served a July
  reading in October). Each reservoir carries its own reading time, and a reading
  more than 3 days older than the date asked for is marked stale.
- A few readings sit above design capacity (barrages at full pond). They are kept
  and marked, never clipped.
- APWRIMS serves rainfall from two sources that disagree badly. We read IMD only,
  and say so in the payload.
- Most minor irrigation tanks are not updated for weeks; the source's own count of
  tanks without a reading in 30 days travels with the figures.

Dates must be yyyyMMdd. A date like 2026-10-21 returns "permission denied".
"""

import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from app.scrapers.base import BaseScraper
from app.scrapers.sanity import SanityAbort
from app.utils.logger import logger

IST = timezone(timedelta(hours=5, minutes=30))
API = "https://apwrims.ap.gov.in/api"
# AP_UUID in the dashboard bundle: the state as a location.
STATE_UUID = "6f86292b-dd9a-4987-bb8f-c3940263b349"
SOURCE = {
    "by": "Water Resources Department, Government of Andhra Pradesh",
    "system": "APWRIMS",
    "url": "https://apwrims.ap.gov.in",
}
STALE_AFTER = timedelta(days=3)


def _num(v: Any) -> Optional[float]:
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def _ts(ms: Any) -> Optional[str]:
    if not isinstance(ms, (int, float)):
        return None
    return datetime.fromtimestamp(ms / 1000, tz=IST).strftime("%Y-%m-%d %H:%M IST")


def fingerprint(payload: dict) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


# ---------------------------------------------------------------- shaping
# Pure functions, so tests can run them on saved responses.

def shape_reservoirs(raw: dict, day: str) -> dict:
    """The wateraudit/component response for one day, as the site needs it."""
    asked = datetime.strptime(day, "%Y%m%d").replace(tzinfo=IST)
    rows = []
    for group in ("major", "medium", "outside_ap"):
        for r in raw.get(group) or []:
            maps = r.get("reservoirDataMap") or {}
            cur = maps.get("current") or {}
            last = maps.get("previousYearCurrent") or {}
            cap = _num(r.get("totalCapacity1"))
            storage = _num(cur.get("totalStorage1"))
            ts = cur.get("eventGenTs")
            stale = bool(isinstance(ts, (int, float)) and datetime.fromtimestamp(ts / 1000, tz=IST) < asked - STALE_AFTER)
            rows.append({
                "name": r.get("locationName"),
                "district": r.get("locationDistrictName"),
                "basin": r.get("basin"),
                "group": group,
                "capacity_tmc": cap,
                "frl_m": _num(r.get("frl")),
                "dead_storage_tmc": _num(r.get("deadStorage")),
                "storage_tmc": storage,
                "level_m": _num(cur.get("totalLevelValue1")),
                "percent_full_as_served": _num(cur.get("percTotStorage")),
                "inflow_cusecs": _num(cur.get("totalInFlow1")),
                "outflow_cusecs": _num(cur.get("totalOutFlow1")),
                "read_at": _ts(ts),
                "stale": stale,
                "above_capacity": bool(cap and storage is not None and storage > cap),
                "last_year_storage_tmc": _num(last.get("totalStorage1")),
                "last_year_level_m": _num(last.get("totalLevelValue1")),
                "last_year_read_at": _ts(last.get("eventGenTs")),
            })
    totals = {}
    for group, t in (raw.get("Total") or {}).items():
        maps = (t or {}).get("reservoirDataMap") or {}
        totals[group] = {
            "capacity_tmc": _num((t or {}).get("totalCapacity1")),
            "storage_tmc": _num((maps.get("current") or {}).get("totalStorage1")),
            "last_year_storage_tmc": _num((maps.get("previousYearCurrent") or {}).get("totalStorage1")),
        }
    return {
        "source": SOURCE, "date": asked.strftime("%Y-%m-%d"),
        "note": "Values as APWRIMS serves them. Group totals are APWRIMS's own. TMC is thousand million cubic feet.",
        "reservoirs": rows, "group_totals": totals,
    }


def check_reservoirs(p: dict) -> None:
    rows = p["reservoirs"]
    major = [r for r in rows if r["group"] == "major"]
    if len(rows) < 100:
        raise SanityAbort(f"only {len(rows)} reservoirs served; a normal day has about 125")
    if len(major) < 25:
        raise SanityAbort(f"only {len(major)} major reservoirs served; a normal day has 34")
    with_storage = sum(1 for r in major if r["storage_tmc"] is not None)
    if with_storage < 0.8 * len(major):
        raise SanityAbort(f"{len(major) - with_storage} of {len(major)} major reservoirs have no storage figure")
    t = p["group_totals"].get("major") or {}
    if not t.get("capacity_tmc") or t.get("storage_tmc") is None:
        raise SanityAbort("the major group total is missing")
    if not (0 <= t["storage_tmc"] <= 1.1 * t["capacity_tmc"]):
        raise SanityAbort(f"major storage {t['storage_tmc']} is outside 0 to capacity {t['capacity_tmc']}")
    # Reservoirs in other states (upstream dams APWRIMS also watches) have no AP district.
    if any(not r["name"] or (r["group"] != "outside_ap" and not r["district"]) for r in rows):
        raise SanityAbort("a reservoir in AP came without a name or district")


def shape_rainfall(raw: list, start: str, end: str) -> dict:
    rows = []
    for r in raw or []:
        m = (r.get("responseMap") or {}).get("monm") or {}
        rows.append({
            "district": r.get("locName"),
            "actual_mm": _num(m.get("actual")),
            "normal_mm": _num(m.get("normal")),
            "deviation_pct_as_served": _num(m.get("deviation")),
        })
    return {
        "source": SOURCE | {"data_source": "IMD, as served by APWRIMS"},
        "window": {"from": datetime.strptime(start, "%Y%m%d").strftime("%Y-%m-%d"),
                   "to": datetime.strptime(end, "%Y%m%d").strftime("%Y-%m-%d")},
        "note": "Rain since 1 June (the water year), against the normal for the same days. APWRIMS also serves a second rainfall source that disagrees; we read IMD only.",
        "districts": rows,
    }


def check_rainfall(p: dict) -> None:
    rows = p["districts"]
    if len(rows) < 26:
        raise SanityAbort(f"rainfall for only {len(rows)} districts; expected 28 and a total")
    if sum(1 for r in rows if r["actual_mm"] is not None) < 0.9 * len(rows):
        raise SanityAbort("too many districts without an actual rainfall figure")
    if any(r["actual_mm"] is not None and not (0 <= r["actual_mm"] <= 5000) for r in rows):
        raise SanityAbort("a rainfall figure is outside 0 to 5,000 mm for the season")


def shape_tanks(raw: list) -> dict:
    rows = []
    for r in raw or []:
        t = (r.get("locationStructureInfoMap") or {}).get("MI_TANK") or {}
        rows.append({
            "district": r.get("locationName"),
            "tanks": _num(t.get("count")),
            "capacity_tmc": _num(t.get("capacity")),
            "storage_tmc": _num(t.get("currentStorage")),
            "last_year_storage_tmc": _num(t.get("lastYearSameDateStorageValue")),
            "not_updated_30_days": _num(t.get("noLatestDataFor30Days")),
        })
    return {"source": SOURCE, "note": "Minor irrigation tanks, last known reading. Many tanks are not updated for weeks; the count of those travels with each row.", "districts": rows}


def check_tanks(p: dict) -> None:
    if len(p["districts"]) < 26:
        raise SanityAbort(f"tank figures for only {len(p['districts'])} districts")


def shape_groundwater(raw: list, month_end: str) -> dict:
    rows = []
    for r in raw or []:
        g = r.get("groundwaterDataMap") or {}
        rows.append({
            "district": r.get("locationName"),
            "depth_m": _num((g.get("currentAvailable") or {}).get("totalLevelValue1")),
            "last_year_depth_m": _num((g.get("previousYearCurrent") or {}).get("totalLevelValue1")),
        })
    return {"source": SOURCE, "month_end": datetime.strptime(month_end, "%Y%m%d").strftime("%Y-%m-%d"),
            "note": "Depth to groundwater in metres below ground: a bigger number means the water is deeper.", "districts": rows}


def check_groundwater(p: dict) -> None:
    rows = p["districts"]
    if len(rows) < 26:
        raise SanityAbort(f"groundwater for only {len(rows)} districts")
    if any(r["depth_m"] is not None and not (0 <= r["depth_m"] <= 200) for r in rows):
        raise SanityAbort("a groundwater depth is outside 0 to 200 m")


class ApwrimsWaterScraper(BaseScraper):
    PORTAL_NAME = "APWRIMS"
    BASE_URL = "https://apwrims.ap.gov.in"

    async def _post(self, path: str, body: dict) -> Any:
        url = f"{API}/{path}"
        try:
            resp = await self.client.post(url, json=body, headers={"Content-Type": "application/json", "Accept": "application/json"})
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:                     # noqa: BLE001
            self.fetch_failures.append((url, f"{type(exc).__name__}: {exc}" if str(exc) else type(exc).__name__))
            raise
        if isinstance(data, dict) and str(data.get("status", "")).lower() == "permission denied":
            self.fetch_failures.append((url, "permission denied"))
            raise RuntimeError(f"{path}: permission denied")
        self.fetch_ok += 1
        return data

    async def _save(self, key: str, payload: dict, as_on: Optional[str]) -> int:
        from sqlalchemy.dialects.postgresql import insert
        from app.database import get_db_context
        from app.models.live_reading import LiveReading

        async with get_db_context() as db:
            res = await db.execute(
                insert(LiveReading)
                .values(source_key=key, as_on=as_on, payload=payload, payload_sha256=fingerprint(payload))
                .on_conflict_do_nothing(constraint="uq_live_reading_source_payload")
            )
            return res.rowcount or 0

    async def _part(self, key: str, call, shape, check, as_on) -> tuple[int, Optional[str]]:
        """Read, shape, check and store one part. A refusal comes back as text, so one
        part that changed shape does not stop the others; any other error propagates."""
        payload = shape(await call())
        try:
            check(payload)
        except SanityAbort as abort:
            logger.warning(f"[{self.PORTAL_NAME}] refused {key}: {abort}")
            return 0, f"{key}: {abort}"
        return await self._save(key, payload, as_on(payload)), None

    async def _groundwater_call(self) -> Optional[tuple]:
        """Groundwater changes monthly. Returns (raw, month_end) for the month APWRIMS
        says is out, or None when it names no month."""
        latest = await self.fetch_json(f"{API}/gw/latestGWDataTp")
        ym = str((latest or {}).get("LastUpdatedIn") or "")
        if not (len(ym) == 6 and ym.isdigit()):
            self.note(f"groundwater: APWRIMS named no month ({ym!r}); skipped")
            return None
        y, m = int(ym[:4]), int(ym[4:])
        month_end = (datetime(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1)).strftime("%Y%m%d")
        raw = await self._post("v2/gwlevels/table", {
            "aggr": "SUM", "component": "GROUNDWATER", "summary": False, "sUUID": STATE_UUID, "pDate": "2018",
            "timePeriod": "MONSOON", "src": "AWS", "page": "MANUAL", "source": "MANUAL", "cType": "DISTRICT",
            "pUUID": STATE_UUID, "sDate": month_end, "eDate": month_end, "view": "ADMIN", "lType": "STATE",
            "format": "yyyyMMdd"})
        return raw, month_end

    async def scrape(self) -> int:
        now = datetime.now(IST)
        day = now.strftime("%Y%m%d")
        # The water year starts on 1 June.
        season_start = f"{now.year if now.month >= 6 else now.year - 1}0601"
        saved = 0
        failure: Optional[BaseException] = None
        refused: list[str] = []
        gw: dict = {}

        async def gw_call():
            got = await self._groundwater_call()
            if got is None:
                return None
            gw["month_end"] = got[1]
            return got[0]

        steps = [
            ("apwrims.reservoirs",
             lambda: self._post("wateraudit/data/component", {"data": {
                 "page": "waterbalance", "component": "RESERVOIR", "period": "MONSOON", "view": "Admin",
                 "locations": [], "locType": "State", "startDate": day, "endDate": day}}),
             lambda raw: shape_reservoirs(raw, day), check_reservoirs, lambda p: p["date"]),
            ("apwrims.rainfall",
             lambda: self._post("rf/rfTable", {
                 "aggr": "SUM", "component": "rainfall", "summary": True, "sUUID": STATE_UUID, "format": "yyyyMMdd",
                 "pDate": "2018", "src": "IMD", "sDate": season_start, "eDate": day, "cType": "DISTRICT",
                 "pUUID": STATE_UUID, "view": "ADMIN", "lType": "STATE", "timePeriod": "monsoon"}),
             lambda raw: shape_rainfall(raw, season_start, day), check_rainfall, lambda p: p["window"]["to"]),
            ("apwrims.tanks",
             lambda: self._post("v2/wcs/table", {
                 "structureType": "MI_TANK", "cMDType": "ALL", "cType": "DISTRICT", "sUUID": STATE_UUID,
                 "pUUID": STATE_UUID, "view": "ADMIN", "lType": "STATE", "timePeriod": "LASTKNOWN", "src": "AWS"}),
             shape_tanks, check_tanks, lambda p: now.strftime("%Y-%m-%d")),
            ("apwrims.groundwater", gw_call,
             lambda raw: None if raw is None else shape_groundwater(raw, gw["month_end"]),
             lambda p: None if p is None else check_groundwater(p),
             lambda p: p["month_end"]),
        ]
        for key, call, shape, check, as_on in steps:
            try:
                if key == "apwrims.groundwater":
                    raw = await call()
                    if raw is None:
                        continue
                    n, why = await self._part(key, lambda r=raw: _const(r), shape, check, as_on)
                else:
                    n, why = await self._part(key, call, shape, check, as_on)
                saved += n
                if why:
                    refused.append(why)
            except Exception as exc:                 # noqa: BLE001
                # Parked for finish(), which raises it after the other parts have had their turn.
                failure = failure or exc
                logger.error(f"[{self.PORTAL_NAME}] {key} failed: {exc}")

        if failure is None and refused:
            # Some part changed shape and was not stored. Whatever else was stored stays;
            # the run is recorded as a refusal so the email names the part.
            self.log_done(saved)
            raise SanityAbort("; ".join(refused) + f" ({saved} other reading(s) stored)")
        return self.finish(saved, failure)


async def _const(v):
    return v
