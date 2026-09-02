# The verification harness

This platform's only claim is that every figure it publishes can be checked
against the government's own record. That claim is worth exactly as much as the
weakest figure on the site, so it is enforced mechanically rather than by
remembering to be careful.

```bash
cd backend
python -m verify.run                      # every check except the network one
python -m verify.run --json ../public/verification.json
VERIFY_LINKS=1 python -m verify.run       # add the link check (run weekly, not per edit)
```

Exit code 1 on any FAIL. Warnings never block — a warning that stops a build
gets suppressed, and a suppressed warning is worse than a loud one.

## What it checks

| Check | The question it answers |
|---|---|
| `schema.required` | Does each seed still carry the fields its page reads? |
| `schema.state` | Does every seed say which state it describes? |
| `schema.units` | Does every figure record the unit its source printed? |
| `schema.coverage` | How thin is the data, and does every gap say how to fill it? |
| `sources.resolve` | Does every cited source key lead to a real document? |
| `sources.url` | Can a reader actually open that document? |
| `sources.section` | Do the document chips under each chart resolve? |
| `sources.https` | Are the links well-formed and secure? |
| `stages.mixed` | Is an estimate ever shown as an outcome? |
| `stages.partyear` | Is a part-year figure standing in a full-year series? |
| `stages.undivided` | Has a pre-2014 figure leaked into a per-government change? |
| `stages.nulls` | Would a missing year be drawn as a zero? |
| `arith.interest` | Does the interest share still equal interest over revenue? |
| `arith.spent` | Does percent-spent still equal spent over voted? |
| `arith.grants` | Do the grant rows still add to the printed block total? |
| `arith.tenure` | Does each per-government change still equal its own endpoints? |
| `reconcile.agree` | Do two independent sources still agree where both are audited? |
| `reconcile.diverge` | Has a documented disagreement been flattened by accident? |
| `i18n.parity` | Do all six languages carry exactly the same keys? |
| `i18n.used` | Does every key the code asks for exist? |
| `i18n.placeholders` | Has a translation lost or invented a `{placeholder}`? |
| `i18n.digits` | Do numbers stay in Latin digits in every language? |
| `links.alive` | Do the cited documents still resolve? |

## Why these, specifically

Each check exists because a real defect got through, or nearly did.

- **`stages.mixed`** — a capital-outlay figure of ₹32,713 crore was about to sit
  in an audited series where the audited number for the same year was ₹16,141
  crore. It was a budget estimate. Both figures are correct; drawing them in one
  series is not.
- **`stages.partyear`** — a market-borrowings column covered April to September
  and would have rendered as a borrowing collapse that never happened. A
  footnote inside a bar chart is invisible.
- **`reconcile.agree`** — the Reserve Bank and the state's own Statement of
  Fiscal Policy publish the same quantities through chains that never touch.
  On audited years they agree to within 0.002%. That is a real, free,
  independent audit of our transcription, and it only works if something is
  watching it.
- **`reconcile.diverge`** — the auditor and the central bank disagree about the
  debt, and that disagreement is the content of a whole section. If they ever
  start agreeing, someone has overwritten one with the other.
- **`i18n.parity`** — a missing key falls back to English, so a Telugu reader
  gets an English paragraph with no way to tell whether the site is broken.

## Adding a reconciliation

`reconciliations.json` holds two lists. `must_agree` is for the same quantity
arriving by two routes; `known_divergence` is for figures that legitimately
differ, guarded in reverse. Both take a plain-language `why`, and the `why` is
not decoration — it is what a future maintainer reads before deciding whether a
failure is a data problem or a definition problem.

## Publishing the results

`--json` writes the full report. Serve it, and put it on the site. A platform
that asks people to trust its figures should be willing to show its own test
results, including on the days the answer is unflattering.
