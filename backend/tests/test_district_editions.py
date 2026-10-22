"""
District paper editions: a reader sees only what a person approved, numbered and kept.

These tests drive the real endpoints and a real database. They pin the promises:
  - a draft or an approved-but-unpublished edition is never served publicly
  - the editorial gate runs on save and again at approval, and approval refuses a failing story
  - audio is requested at approval and never before (also a database constraint)
  - numbers are given at publishing, 1, 2, 3, per district, and a draft with nothing new is refused
  - the story pipeline drafts only from new items, never from a personal list, and its model
    path retries a failed story once with the gate's own words, then drops it and says so
No test calls the Claude API: the model path runs on a fake client.
"""

import datetime as dt
import hashlib
from types import SimpleNamespace

import pytest
import pytest_asyncio
import sqlalchemy as sa
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, insert

from app.config import settings
from app.database import get_db_context
from app.main import app
from app.models.district_edition import DistrictEdition
from app.models.district_happening import DistrictHappening
from app.services import editions as svc
from app.services.story_drafter import ClaudeDrafter, StandInDrafter, draft_district, parse_stories

DISTRICT, SLUG = "Nandyal", "nandyal"
MARK = "https://example.test/editions-test/"
KEY = "test-admin-key"
TODAY = dt.date.today()


def happening(n: int, title: str, summary: str | None = None, personal: bool = False, days_ago: int = 1, kind: str = "district_site") -> dict:
    return dict(district=DISTRICT, source_kind=kind, category="announcement", title=title, summary=None if personal else summary,
                date=TODAY - dt.timedelta(days=days_ago), url=f"{MARK}{n}", personal_list=personal,
                content_sha256=hashlib.sha256(f"{n}{title}".encode()).hexdigest())


def battery(**over) -> dict:
    return story(4, head_en="A 1200 MWh battery store for Nandyal", head_te="నంద్యాలకు 1200 MWh బ్యాటరీ నిల్వ",
                 en="SECI will build a 1200 MWh battery store at Nandyal.", te="SECI నంద్యాలలో 1200 MWh బ్యాటరీ నిల్వ కేంద్రం నిర్మిస్తుంది.",
                 quote="SECI will be developing a 1200 MWh Battery Energy Storage System at Nandyal") | over


def story(n: int, **over) -> dict:
    s = {"id": f"s{n}", "kicker_en": "Water", "kicker_te": "నీరు",
         "head_en": "Tap connections reach 120 villages", "head_te": "120 గ్రామాలకు కుళాయి కనెక్షన్లు",
         "en": "The collectorate says tap connections now reach 120 villages.", "te": "120 గ్రామాలకు కుళాయి కనెక్షన్లు చేరాయని కలెక్టరేట్ చెప్పింది.",
         "date": (TODAY - dt.timedelta(days=1)).isoformat(), "source_en": "Collectorate notice", "source_te": "కలెక్టరేట్ నోటీసు",
         "url": f"{MARK}{n}", "quote": "tap connections now reach 120 villages"}
    return s | over


@pytest_asyncio.fixture
async def seeded(monkeypatch):
    monkeypatch.setattr(settings, "admin_key", KEY)
    rows = [
        happening(1, "Jal Jeevan progress report", "In the district, tap connections now reach 120 villages."),
        happening(2, "Notice on rural roads – 45 km sanctioned", "Roads of 45 km were sanctioned for repair."),
        happening(3, "Merit list for staff nurse posts", personal=True),
        happening(4, "PIB: Battery storage of 1200 MWh at Nandyal", "SECI will be developing a 1200 MWh Battery Energy Storage System at Nandyal", kind="pib"),
    ]
    async with get_db_context() as db:
        await db.execute(delete(DistrictEdition).where(DistrictEdition.district == DISTRICT))
        await db.execute(delete(DistrictHappening).where(DistrictHappening.url.like(MARK + "%")))
        await db.execute(insert(DistrictHappening), rows)
    yield
    async with get_db_context() as db:
        await db.execute(delete(DistrictEdition).where(DistrictEdition.district == DISTRICT))
        await db.execute(delete(DistrictHappening).where(DistrictHappening.url.like(MARK + "%")))


def client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


H = {"X-Admin-Key": KEY}


@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_life_of_an_edition(seeded):
    async with client() as c:
        assert (await c.post("/api/v1/admin/editions", json={"district": SLUG, "content": {"lead": [story(1)]}, "written_by": "test"})).status_code == 403
        r = await c.post("/api/v1/admin/editions", headers=H, json={"district": SLUG, "content": {"lead": [story(1)]}, "written_by": "Dheeraj"})
        assert r.status_code == 201, r.text
        ed = r.json()
        assert ed["status"] == "draft" and ed["gate"]["ok"] and ed["number"] is None and ed["audio_status"] == "none"

        # A draft is invisible to readers.
        assert (await c.get(f"/api/v1/districts/{SLUG}/editions/latest")).status_code == 404
        assert (await c.get(f"/api/v1/districts/{SLUG}/editions")).json()["editions"] == []

        # Publishing before approval is refused.
        assert (await c.post(f"/api/v1/admin/editions/{ed['id']}/publish", headers=H)).json()["detail"]["code"] == "not_approved"

        r = await c.post(f"/api/v1/admin/editions/{ed['id']}/approve", headers=H, json={"note": "read it"})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "approved" and r.json()["audio_status"] == "requested"
        # Approved is still not public.
        assert (await c.get(f"/api/v1/districts/{SLUG}/editions/latest")).status_code == 404

        r = await c.post(f"/api/v1/admin/editions/{ed['id']}/publish", headers=H)
        assert r.json()["number"] == 1 and r.json()["status"] == "published"
        latest = (await c.get(f"/api/v1/districts/{SLUG}/editions/latest")).json()
        assert latest["number"] == 1 and latest["lead"][0]["id"] == "s1" and latest["audio_url"] is None
        assert "gate" not in latest and "written_by" not in latest and "id" not in latest

        # The recording arrives.
        assert (await c.post(f"/api/v1/admin/editions/{ed['id']}/audio", headers=H, json={"url": "http://x/a.mp3"})).status_code == 422
        await c.post(f"/api/v1/admin/editions/{ed['id']}/audio", headers=H, json={"url": "https://cdn.test/nandyal-1.mp3"})
        assert (await c.get(f"/api/v1/districts/{SLUG}/editions/1")).json()["audio_url"] == "https://cdn.test/nandyal-1.mp3"

        # The same items again: nothing new, refused.
        r = await c.post("/api/v1/admin/editions", headers=H, json={"district": SLUG, "content": {"lead": [story(1)]}, "written_by": "tester"})
        assert r.status_code == 409 and r.json()["detail"]["code"] == "nothing_new"

        # A new item makes edition 2.
        s4 = battery()
        ed2 = (await c.post("/api/v1/admin/editions", headers=H, json={"district": SLUG, "content": {"lead": [s4]}, "written_by": "tester"})).json()
        assert ed2["new_item_ids"] and ed2["gate"]["ok"], ed2
        await c.post(f"/api/v1/admin/editions/{ed2['id']}/approve", headers=H, json={})
        assert (await c.post(f"/api/v1/admin/editions/{ed2['id']}/publish", headers=H)).json()["number"] == 2
        assert [e["number"] for e in (await c.get(f"/api/v1/districts/{SLUG}/editions")).json()["editions"]] == [2, 1]


@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_the_gate_stops_approval(seeded):
    bad = [
        story(1, en="Tap connections reach 120 villages, 30 more than last year."),          # a number of our own
        story(2, head_en="Roads – sanctioned", quote="Roads of 45 km were sanctioned for repair."),   # an en dash
        story(3, quote="Merit list for staff nurse posts", head_en="Merit list out", en="A merit list is out.", te="మెరిట్ జాబితా వచ్చింది.", head_te="మెరిట్ జాబితా"),
        story(9, url=MARK + "999"),                                                            # not a gathered item
    ]
    async with client() as c:
        ed = (await c.post("/api/v1/admin/editions", headers=H, json={"district": SLUG, "content": {"lead": bad}, "written_by": "tester"})).json()
        errs = " | ".join(ed["gate"]["errors"])
        assert not ed["gate"]["ok"]
        assert "['30']" in errs and "'–'" in errs and "personal list" in errs and "not an item gathered" in errs
        r = await c.post(f"/api/v1/admin/editions/{ed['id']}/approve", headers=H, json={})
        assert r.status_code == 409 and r.json()["detail"]["code"] == "gate_failed"
        assert (await c.get(f"/api/v1/admin/editions/{ed['id']}", headers=H)).json()["audio_status"] == "none"


@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_the_database_refuses_audio_before_approval_and_numbers_on_drafts(seeded):
    async with get_db_context() as db:
        with pytest.raises(sa.exc.IntegrityError):
            await db.execute(insert(DistrictEdition).values(district=DISTRICT, content={}, written_by="t", audio_status="requested"))
        await db.rollback()
        with pytest.raises(sa.exc.IntegrityError):
            await db.execute(insert(DistrictEdition).values(district=DISTRICT, content={}, written_by="t", status="draft", number=5))
        await db.rollback()
        with pytest.raises(sa.exc.IntegrityError):
            await db.execute(insert(DistrictEdition).values(district=DISTRICT, content={}, written_by="t", status="published"))
        await db.rollback()


def test_audio_reads_only_what_was_approved():
    content = {"lead": [story(1), story(2, head_te="రోడ్లు", te="45 కి.మీ. రోడ్లు మంజూరు.", source_te="కలెక్టరేట్")]}
    te = svc.audio_script(content, "te")
    assert te.startswith("120 గ్రామాలకు కుళాయి కనెక్షన్లు. 120 గ్రామాలకు")
    assert "మూలం: కలెక్టరేట్ నోటీసు." in te and "రోడ్లు. 45 కి.మీ. రోడ్లు మంజూరు." in te
    assert "Tap" not in te


# ---------------------------------------------------------------- the pipeline

@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_stand_in_drafts_new_items_only_and_passes_the_gate(seeded):
    async with get_db_context() as db:
        rep = await draft_district(db, DISTRICT, StandInDrafter())
    assert rep.edition_id and rep.items_offered == 3 and rep.stories_kept == 3 and not rep.dropped, rep
    async with get_db_context() as db:
        ed = await db.get(DistrictEdition, rep.edition_id)
        assert ed.status == "draft" and ed.written_by.startswith("stand-in")
        ids = {s["id"] for s in ed.content["lead"]}
        roads = next(s for s in ed.content["lead"] if s["url"].endswith("/2"))
        assert "–" not in roads["head_en"] and roads["quote"] == "Notice on rural roads – 45 km sanctioned"
        assert all("Merit" not in s["head_en"] for s in ed.content["lead"])
    assert len(ids) == 3
    # Run again: everything is already in an open draft, so nothing new.
    async with get_db_context() as db:
        again = await draft_district(db, DISTRICT, StandInDrafter())
    assert again.skipped == "nothing new"


class FakeClaude:
    """Replays answers and records what it was asked."""

    def __init__(self, answers):
        self.answers, self.calls = list(answers), []
        self.messages = SimpleNamespace(create=self._create)

    async def _create(self, **kw):
        self.calls.append(kw)
        return SimpleNamespace(content=[SimpleNamespace(type="text", text=self.answers.pop(0))])


def _js(stories):
    import json
    return "```json\n" + json.dumps({"stories": stories}, ensure_ascii=False) + "\n```"


@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_model_path_retries_once_with_the_gates_words_then_drops(seeded):
    good1 = story(1, id="item-1", quote="In the district, tap connections now reach 120 villages.")
    bad4 = battery(id="item-4", head_en="BJP plans a 1200 MWh battery", en="It will cost 500 crore.")
    bad2 = story(2, id="item-2", en="Roads of 46 km.", quote="Roads of 45 km were sanctioned for repair.", head_en="Roads", head_te="రోడ్లు", te="రోడ్లు.")
    fixed4 = battery(id="item-4")
    still2 = bad2   # the model does not fix this one
    fake = FakeClaude([_js([good1, bad4, bad2]), _js([fixed4, still2])])
    drafter = ClaudeDrafter(client=fake, model="claude-test")
    async with get_db_context() as db:
        rep = await draft_district(db, DISTRICT, drafter)
    assert len(fake.calls) == 2, "one draft and exactly one retry"
    retry = fake.calls[1]["messages"][0]["content"]
    assert "failed the checks" in retry and "BJP" in retry and "['500']" in retry and "['46']" in retry
    assert "Merit list" not in fake.calls[0]["messages"][0]["content"], "a personal list is never offered to the model"
    assert rep.stories_kept == 2 and set(rep.dropped) == {"item-2"} and rep.edition_id
    async with get_db_context() as db:
        ed = await db.get(DistrictEdition, rep.edition_id)
        assert ed.written_by == "Claude API (claude-test)" and ed.status == "draft"
        assert {s["id"] for s in ed.content["lead"]} == {"item-1", "item-4"}
        assert "item-2" in (ed.note or "")


def test_unreadable_model_output_is_no_stories():
    assert parse_stories("I cannot help with that.") == []
    assert parse_stories('{"stories": [1, {"id": "a"}]}') == [{"id": "a"}]
    assert parse_stories('{"stories": [') == []
