"""Review the facts the model proposed. Nothing reaches a reader until you approve it here.

Each fact has passed the verifier (its quote is in the paper, on that page, and its
figure is printed in the quote) or been rejected by it with the reason. You decide on
the verified ones, with the quote, the page, the words around it and the link in front of you.

USAGE (from backend/, DATABASE_URL set)
    python scripts/review_queue.py list                       verified facts waiting for you
    python scripts/review_queue.py list --status rejected     what the checks threw out, with reasons
    python scripts/review_queue.py show 12                    one fact in full
    python scripts/review_queue.py approve 12 --by Dheeraj
    python scripts/review_queue.py reject 12 --by Dheeraj --note "figure is for the previous year"
    python scripts/review_queue.py spend                      what the model has cost this month

Approving records who and when. It does not publish: charts read approved facts only
once a separate publishing step exists, with its own gate.
"""
import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import sqlalchemy as sa  # noqa: E402

from app.config import settings  # noqa: E402
from app.database import get_db_context  # noqa: E402
from app.models.ai_review import ProposedFact  # noqa: E402
from app.services import fact_queue  # noqa: E402
from app.services.ai_spend import DbLedger, month_start  # noqa: E402


def one_line(r: ProposedFact) -> str:
    unit = f" {r.unit}" if r.unit else ""
    stage = f" ({r.stage})" if r.stage else ""
    flags = f"  [look: {len(r.flags)}]" if r.flags else ""
    return f"#{r.id:<5} {r.indicator}  {r.period}{stage}  {r.value}{unit}  p.{r.page}{flags}"


def full(r: ProposedFact) -> str:
    out = [one_line(r), f"  status:   {r.status}", f"  quote:    {r.quote}", f"  paper:    {r.source_url}, page {r.page}"]
    if r.evidence:
        out.append(f"  around:   ...{r.evidence}...")
    for f in r.flags or []:
        out.append(f"  LOOK:     {f}")
    for why in r.reasons or []:
        out.append(f"  REJECTED: {why}")
    if r.reject_note:
        out.append(f"  note:     {r.reject_note}")
    if r.approved_by:
        out.append(f"  approved: {r.approved_by}, {r.approved_at:%d %b %Y}")
    return "\n".join(out)


async def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("list")
    p.add_argument("--status", default="verified", choices=["proposed", "verified", "rejected", "approved"])
    p.add_argument("--limit", type=int, default=50)
    sub.add_parser("show").add_argument("id", type=int)
    for name in ("approve", "reject"):
        q = sub.add_parser(name)
        q.add_argument("id", type=int)
        q.add_argument("--by", required=True, help="your name; it is recorded")
        if name == "reject":
            q.add_argument("--note", required=True, help="why; it is recorded")
    sub.add_parser("spend")
    a = ap.parse_args()

    async with get_db_context() as db:
        if a.cmd == "list":
            rows = (await db.execute(sa.select(ProposedFact).where(ProposedFact.status == a.status)
                                     .order_by(ProposedFact.created_at).limit(a.limit))).scalars().all()
            print(f"{len(rows)} {a.status} fact(s)")
            for r in rows:
                print(one_line(r))
            counts = await fact_queue.counts(db)
            print("\nAll facts: " + ", ".join(f"{k} {v}" for k, v in counts.items()))
        elif a.cmd == "show":
            r = await db.get(ProposedFact, a.id)
            print(full(r) if r else f"No fact #{a.id}")
            return 0 if r else 1
        elif a.cmd in ("approve", "reject"):
            try:
                if a.cmd == "approve":
                    r = await fact_queue.approve(db, a.id, a.by)
                else:
                    r = await fact_queue.reject(db, a.id, a.by, a.note)
            except fact_queue.TransitionRefused as exc:
                print(f"Refused: {exc}")
                return 1
            print(f"{'approved' if a.cmd == 'approve' else 'rejected'} #{r.id}")
        elif a.cmd == "spend":
            from datetime import datetime, timezone
            now = datetime.now(timezone.utc)
            month = await DbLedger().total_since(month_start(now))
            print(f"This month: ${month:.2f} of the ${settings.ai_monthly_ceiling_usd:.0f} ceiling "
                  f"(AI assist is {'ON' if settings.ai_assist_enabled else 'OFF'}).")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
