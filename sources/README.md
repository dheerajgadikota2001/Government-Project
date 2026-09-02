# `sources/` — files Dheeraj downloads for the platform

This folder holds government PDFs that **cannot be fetched automatically**, so a
human has to download them in a browser and drop them here.

Everything in this folder is git-ignored except this README. Do not commit the PDFs.

## Why a human is needed at all

There are exactly two reasons a document ends up here, and it is worth keeping
them separate, because they get confused:

1. **Mirroring needs raw bytes.** The cloud session can *read* a PDF's contents,
   but it cannot *download* the file. Every library entry that carries a SHA-256
   mirror therefore needs a copy downloaded by a person. This is the common case —
   and it has nothing to do with whether the site is reachable.
2. **Size.** Anything over about 30 MB is refused outright (HTTP 413). The
   Socio-Economic Surveys are 37–82 MB, so they always need a manual download.

A third, much smaller case: a page behind a captcha (the CPPP tender search) or
behind a geo-fence.

## Currently here

| File | Why it needed a human |
|---|---|
| `Socio-Economic-Survey-2019-20.pdf` | 37 MB — over the fetch limit |
| `Socio_Economic_Survey_2020-21.pdf` | 38 MB — over the fetch limit |
| `Socio_Economic_Survey_2021-22.pdf` | 82 MB — over the fetch limit |
| `Report-2-of-2024-...State-Finances-Audit....pdf` | Download server refuses our connection |

## What is actually still wanted

Short list, as of 2026-08-28. Most of the old "we need you to fetch this" list
turned out to be wrong — those sources were reachable all along. See
`SOURCES_STATUS.md` and project memory for the full re-test.

1. **Budget speech 2023-24 (presented March 2023).** The one YSRCP-era speech we
   do not have. The department's speech page lists only the current year, there is
   no archive page, and every filename tried in the 2023-24 S3 folder returns 403.
   The Annual Financial Statement for that year *is* in the library. If you find
   the speech on a government site, save it here.
2. **Mirror copies** of anything you want to carry a SHA-256 in the library.
   No urgency, and it is a batch job rather than one-at-a-time.
3. **CPPP tender result pages**, saved as HTML into `sources/tenders/`, if we go
   that route rather than driving your browser live for the captcha.

## Checking reachability yourself

```
python scripts/check_sources.py --network "India VPN"
python scripts/check_sources.py --network "home, US"
```

Run it from different networks and compare. A source that fails from the US but
succeeds from an India VPN is geo-fenced, not dead — and that decides whether
running a fetcher inside an Indian region would fix it permanently.

The checker asserts **page content**, not just HTTP 200. This matters: one
catalogued source had been repurposed into a betting site while still returning
200, and a status-code check passed it as healthy.
