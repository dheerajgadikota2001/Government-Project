# Inputs the data build needs that the API does not serve

`scripts/prep_data.py` builds `src/data/*.json` from the live API (fetched into `.live/` by
`scripts/fetch_live.py`) and from the four files here. These are kept by hand and change rarely.

| File | What it holds | Where it came from |
|---|---|---|
| `geo_and_states.json` | Telugu place names, the district map shapes, and the all-states tables as RBI prints them | Built for the data pages, October 2026 |
| `factchecks.json` | The fact checks shown on the Fact check page | The earlier site's `src/data/factchecks.json` |
| `polavaram_story_draft.json` | The reviewed draft the Polavaram story steps are taken from | `stories/drafts/613-polavaram.json` |
| `legal_words.json` | The words of the About, Disclaimer, Privacy and Community pages, English and Telugu | The earlier site's locale files, those four sections only |

Until 11 Nov 2026 the build read these from a private work folder, so nobody else could run it and
the site's data stayed at the day of the last private run. Change a file here, run the build, and
review the difference in `src/data` before committing.
