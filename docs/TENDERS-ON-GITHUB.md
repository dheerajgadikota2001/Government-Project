# Tenders refresh on GitHub Actions

What this sets up: the AP CRDA tenders board is scraped every morning from a
GitHub Actions runner, written to the production database, recorded on
`https://apfactcheck.dheeco.com/updates`, and emailed about on failure. The
laptop batch file (`backend/scripts/tenders_local.bat`) stays as the manual
fallback and is no longer needed daily.

The workflow is `.github/workflows/tenders-refresh.yml`. Everything below is
the one-time Google Cloud setup it depends on, then how to run and read it.

## Why GitHub for this one source

`crda.ap.gov.in` drops every connection from Google's network. That was proven
from the Cloud Run job on 6 Sep 2026 with both the scraper's own User-Agent and
a browser one: ReadTimeout every time. The same page answers a GitHub runner in
under two seconds (workflow "Probe CRDA reachability", run 1, same day, from a
Microsoft address in Virginia). So the tenders group runs from GitHub and every
other group runs from the `apnn-refresh` Cloud Run job with `--skip tenders`.

The code path is identical on both machines: `run_all_scrapers.py`, the sanity
gate, the run recorder that feeds `/updates`, and the alert emails. Only the
network differs.

## How the runner gets in without a stored key

No password or key is kept in GitHub. Each run, GitHub hands the job a signed,
short-lived token that states the repository and branch. Google is told to
accept that token only when it says `dheerajgadikota2001/Government-Project`
on `refs/heads/main`, and to let it act as one service account,
`apnn-github-tenders`. That account holds exactly two permissions:

| Permission | Why |
|---|---|
| `roles/cloudsql.client` on the project | open a connection through the Cloud SQL Auth Proxy |
| `roles/secretmanager.secretAccessor` on `DATABASE_URL` and `RESEND_API_KEY` | read the database URL and the email key |

It cannot deploy, cannot read other secrets, cannot touch storage, and cannot
be used from any other repository or branch. Rotating the database password
means creating a new version of the `DATABASE_URL` secret; GitHub needs no
change because it reads the latest version each run.

## One-time setup

Run in a fresh PowerShell with `gcloud` on the path. Every command names the
project explicitly; do not rely on the default project.

```powershell
$P    = "ap-nadu-nedu"
$REPO = "dheerajgadikota2001/Government-Project"

# 1. APIs the token exchange and the proxy need. Safe to re-run.
gcloud services enable iamcredentials.googleapis.com sts.googleapis.com sqladmin.googleapis.com secretmanager.googleapis.com --project $P

# 2. The service account the runner will act as.
gcloud iam service-accounts create apnn-github-tenders --project $P --display-name "GitHub Actions: tenders refresh"
$SA = "apnn-github-tenders@$P.iam.gserviceaccount.com"

# 3. Exactly what it may do.
gcloud projects add-iam-policy-binding $P --member "serviceAccount:$SA" --role roles/cloudsql.client
gcloud secrets add-iam-policy-binding DATABASE_URL --project $P --member "serviceAccount:$SA" --role roles/secretmanager.secretAccessor
gcloud secrets add-iam-policy-binding RESEND_API_KEY --project $P --member "serviceAccount:$SA" --role roles/secretmanager.secretAccessor

# 4. Teach Google to trust GitHub's tokens, for this repository on main only.
gcloud iam workload-identity-pools create github --project $P --location global --display-name "GitHub Actions"
gcloud iam workload-identity-pools providers create-oidc github-repo `
  --project $P --location global --workload-identity-pool github `
  --display-name "Government-Project, main branch" `
  --issuer-uri "https://token.actions.githubusercontent.com" `
  --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" `
  --attribute-condition "assertion.repository == '$REPO' && assertion.ref == 'refs/heads/main'"

# 5. Let those tokens act as the service account.
$PN = gcloud projects describe $P --format "value(projectNumber)"
gcloud iam service-accounts add-iam-policy-binding $SA --project $P `
  --role roles/iam.workloadIdentityUser `
  --member "principalSet://iam.googleapis.com/projects/$PN/locations/global/workloadIdentityPools/github/attribute.repository/$REPO"
```

`$PN` should print `944887325761`; that number is already written into the
workflow file. If it prints anything else, the workflow's
`workload_identity_provider` line needs the printed number.

Step 4 fails with "already exists" if it is run twice; that is fine.

## First run, by hand

GitHub, Actions tab, "Refresh tenders", "Run workflow", branch `main`. Expect
about two minutes the first time (installing the backend), under a minute
afterwards. Then open `/updates` on the site: the newest row should be
"AP CRDA tenders" with today's time and `automatic` for a scheduled run or
`run by hand` for this one.

The scheduled run is 03:30 UTC, which is 09:00 IST. GitHub delays scheduled
runs when it is busy, sometimes by an hour; the run record carries the real
time.

## Reading a run

| What you see | What it means | What to do |
|---|---|---|
| green | tenders refreshed, or nothing new on the board | nothing |
| green with a yellow warning | the sanity gate held the run back; nothing was written | read the email; the board's layout may have changed |
| red at "Log in to Google Cloud" | the one-time setup is incomplete or the branch is not main | re-run the setup block; step 4 and 5 are the usual gap |
| red at "Start the Cloud SQL Auth Proxy" | the runner could not reach the instance | check the proxy log printed in that step |
| red at "Refresh tenders" | the scrape or the write failed | the email names the cause and the next step |

A red run also sends the same alert email the Cloud Run job would, so the
inbox is the single place to watch. GitHub sends its own failure email as well.

## Turning it off

Actions tab, "Refresh tenders", the three dots menu, "Disable workflow". The
laptop batch file then covers tenders again by hand. To remove the Google side
entirely, delete the service account and the workload identity pool; nothing
else references them.

## If CRDA starts blocking GitHub too

The run goes red with ReadTimeout and an email arrives with the advice line for
a timeout. Re-run the probe workflow to confirm, switch back to the laptop
batch file for the day, and the next step is a runner on an Indian network,
which is a cost decision to make deliberately, not on the day.

## Cost

Around one minute of runner time a day, inside GitHub's free allowance for a
private repository. On the Google side: one proxy connection and two secret
reads a day, which round to zero.
