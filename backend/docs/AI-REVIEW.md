# AI review layer

| | |
|---|---|
| Decision | D-2026-11-10, approach A |
| Owner | Dheeraj Gadikota |
| Monthly ceiling | USD 200 for Claude API spend |
| State | Built and tested offline. Switched off. No paid call has been made. |

## What it does

Claude reads a stored paper and proposes figures. Code checks each proposal against the
paper's own text. A person approves. Nothing reaches a reader before that.

```
paper text -> extractor (Claude) -> verifier (code) -> proposed_facts -> you approve -> (later) charts
```

Files: `app/services/fact_extractor.py`, `fact_verifier.py`, `fact_queue.py`, `ai_spend.py`,
`ai_digest.py`, `app/models/ai_review.py`, migration `0016`, `scripts/review_queue.py`.

## What the verifier rejects

A proposal is rejected, with the reason kept, when any of these is true:

1. a required field is missing, or the quote is shorter than 12 or longer than 600 characters;
2. there is no paper text to check against;
3. the quote is not in the paper text, word for word (spacing, case, quote and dash shapes ignored);
4. the quote is on a different page from the one named;
5. the value has no figure, or has a figure the quote does not print (so sums, roundings and conversions fail);
6. the same indicator, period and stage already has an approved fact with that figure.

It flags, without rejecting: a period year not on the page, a unit not on the page, no stage
given, and a figure that differs from an approved fact for the same indicator, period and stage.

## The spend guard

Every call passes `SpendGuard.check` first and is written to `ai_spend` after.

| Limit | Setting | Default |
|---|---|---|
| Master switch | `AI_ASSIST_ENABLED` | false |
| Month ceiling (India calendar month) | `AI_MONTHLY_CEILING_USD` | 200 |
| Day cap (India calendar day) | `AI_DAILY_CAP_USD` | 15 |
| Run cap | `AI_RUN_CAP_USD` | 5 |

Each check adds the worst case of the call about to be made. If the ledger cannot be read, the
call is refused. If a cost could not be written down, the rest of the run is refused.

Prices are in `app/services/ai_spend.py` (USD per million tokens). Confirm them against
Anthropic's pricing page before switching on. Override with `AI_PRICE_TABLE`. An unknown model
is priced at the most expensive entry.

## What the ceiling covers today

Only calls made through the spend guard, which today is the fact extractor. The district paper
drafter (`STORY_MODEL_ENABLED`), the voice agent (`VOICE_AGENT_ENABLED`) and the summariser are
separate switches, all off by default, and do not write to the ledger yet. Wire each one through
the guard before turning it on, or the USD 200 is not the whole picture.

## Review

```
python scripts/review_queue.py list                       verified facts waiting
python scripts/review_queue.py show 12
python scripts/review_queue.py approve 12 --by Dheeraj
python scripts/review_queue.py reject 12 --by Dheeraj --note "why"
python scripts/review_queue.py spend
```

Approving records who and when. It does not publish. Publishing approved facts into a chart is
a separate step with its own gate, not built yet.

The daily alert email gains an AI REVIEW block when the layer is on or has ever been used. Facts
waiting, a stop by the guard, or spend at 80% of the ceiling make the email worth sending on a day
when every scraper was quiet.

## Switch-on checklist (not done)

1. The daily schedule exists and has run.
2. The owner has seen the cost sheet and said yes.
3. A key is created for this project with a spend limit set in the Anthropic Console, and stored in
   Secret Manager for the refresh job only.
4. `AI_ASSIST_ENABLED=true` on the refresh job, not on the public API.
5. First run on one paper, read in full by the owner before the second.
