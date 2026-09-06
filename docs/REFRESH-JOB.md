# Automatic refresh: Cloud Run Job + Cloud Scheduler

What this sets up: the platform re-checks its government sources on its own,
writes down what each one gave, and publishes that record at
`https://apfactcheck.dheeco.com/updates`.

Everything below runs **once**. Afterwards the only maintenance is reading the
updates page and the alert emails, and running step 6 again when the code
changes.

Run these in a **fresh PowerShell** (Start menu, PowerShell), from
`politics-platform\backend`, with `gcloud` on the path. Pass `--project
ap-nadu-nedu` on every command rather than relying on the default project.

---

## Why a Job and not a cron on the API

Cloud Run *services* answer web requests; a scrape that takes four minutes and
returns nothing is not a web request. Cloud Run *Jobs* exist for exactly this:
they run to completion and cost nothing when idle. The job reuses the **same
container image** the API already runs, which already contains `scripts/` and
`seed/`, so there is one image to build, not two.

The region matters. Several AP portals refuse connections from outside India.
`asia-south1` is Mumbai, so the job goes out from an Indian address.

One source is the exception the other way round. `crda.ap.gov.in` (tenders)
drops connections from Google's network entirely, whatever the region, and
answers GitHub's runners in a second. So the job runs with `--skip tenders`
and tenders refresh from GitHub Actions instead. That setup is in
`docs/TENDERS-ON-GITHUB.md`.

---

## 1. Deploy the job

```powershell
gcloud run jobs deploy apnn-refresh `
  --source . `
  --project ap-nadu-nedu `
  --region asia-south1 `
  --tasks 1 `
  --max-retries 0 `
  --task-timeout 1800s `
  --memory 1Gi `
  --cpu 1 `
  --set-secrets "DATABASE_URL=DATABASE_URL:latest,SECRET_KEY=SECRET_KEY:latest,ADMIN_KEY=ADMIN_KEY:latest,RESEND_API_KEY=RESEND_API_KEY:latest" `
  --set-env-vars "^;^APP_ENV=production;ALERT_TO=dheerajgadikota@gmail.com" `
  --set-cloudsql-instances ap-nadu-nedu:asia-south1:apnn-db `
  --command python `
  --args "scripts/run_all_scrapers.py,--skip,tenders,--trigger,scheduled"
```

`--max-retries 0` is deliberate. The run sends its own alert email, so a retry
sends the email twice for the same failure (this happened with `1`). A portal
that is down at 06:00 is still down at 06:01; the next morning's run is the
retry.

`--task-timeout 1800s` (30 minutes) is generous. The whole set takes a few
minutes, but the district scraper walks 26 sites and a slow morning should not
be recorded as a failure.

## 2. First run

```powershell
gcloud run jobs execute apnn-refresh --project ap-nadu-nedu --region asia-south1 --wait
```

The tables already exist (Alembic migrations 0001 to 0007). The run scrapes,
writes its own audit rows, and sends an email if anything failed.

## 3. Let the scheduler invoke the job

Cloud Scheduler needs an identity allowed to start the job.

```powershell
gcloud iam service-accounts create apnn-scheduler `
  --project ap-nadu-nedu `
  --display-name "Cloud Scheduler: refresh job"

gcloud run jobs add-iam-policy-binding apnn-refresh `
  --project ap-nadu-nedu `
  --region asia-south1 `
  --member "serviceAccount:apnn-scheduler@ap-nadu-nedu.iam.gserviceaccount.com" `
  --role roles/run.invoker
```

## 4. Schedule the runs

Cloud Scheduler takes a timezone directly, so this is written in IST.

```powershell
# Documents, budgets, projects: once each morning, before people are reading.
gcloud scheduler jobs create http apnn-refresh-daily `
  --project ap-nadu-nedu `
  --location asia-south1 `
  --schedule "0 6 * * *" `
  --time-zone "Asia/Kolkata" `
  --uri "https://asia-south1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/ap-nadu-nedu/jobs/apnn-refresh:run" `
  --http-method POST `
  --oauth-service-account-email "apnn-scheduler@ap-nadu-nedu.iam.gserviceaccount.com" `
  --description "AP Fact Check: daily source refresh"
```

Create this only after step 2 has produced at least one clean run from the
cloud. A schedule on top of an unproven run turns one problem into a daily
email.

Tenders are not scheduled here. See `docs/TENDERS-ON-GITHUB.md`.

## 5. Getting told when a run fails

The run emails you itself, through Resend, using the key and address set in
step 1. The rules live in `app/services/alerts.py`:

| Event | Email |
|---|---|
| a source that was fine has failed | yes, with one line of advice matched to the error |
| a source is still failing since last time | no; it is listed in the Monday heartbeat |
| a source that was failing works again | yes |
| nothing wrong, Monday | the weekly heartbeat, so silence is never ambiguous |

The job's exit code is non-zero only when **every** source failed; one dead
portal is normal and belongs on the updates page, not in a paging alert. If
you also want a Cloud Monitoring alert on that case: Console, Monitoring,
Alerting, Create policy, metric `job/completed_task_attempt_count` filtered on
`result = failed` and job `apnn-refresh`, trigger above 0 in a 30 minute
window.

## 6. Redeploy the API

```powershell
gcloud run deploy apnn-api `
  --source . `
  --project ap-nadu-nedu `
  --region asia-south1 `
  --allow-unauthenticated `
  --min-instances 1 --max-instances 5 --memory 512Mi `
  --add-cloudsql-instances ap-nadu-nedu:asia-south1:apnn-db `
  --set-secrets "DATABASE_URL=DATABASE_URL:latest,SECRET_KEY=SECRET_KEY:latest,ADMIN_KEY=ADMIN_KEY:latest" `
  --set-env-vars "^;^APP_ENV=production;ALLOWED_ORIGINS=https://ap-nadu-nedu.web.app,https://apfactcheck.dheeco.com"
```

The `^;^` prefix tells gcloud to split the variables on semicolons instead of
commas. Without it the comma inside ALLOWED_ORIGINS is read as a second
variable and the deploy fails with a confusing parse error.

---

## Day to day

| Task | Where |
|---|---|
| Run a refresh now | `gcloud run jobs execute apnn-refresh --project ap-nadu-nedu --region asia-south1` |
| Watch that run | `gcloud run jobs executions list --job apnn-refresh --project ap-nadu-nedu --region asia-south1` |
| Read its logs | `gcloud beta run jobs logs tail apnn-refresh --project ap-nadu-nedu --region asia-south1` |
| Run tenders now | GitHub, Actions, "Refresh tenders", Run workflow |
| Pause the daily schedule | `gcloud scheduler jobs pause apnn-refresh-daily --project ap-nadu-nedu --location asia-south1` |
| Resume it | `gcloud scheduler jobs resume apnn-refresh-daily --project ap-nadu-nedu --location asia-south1` |
| See what changed | https://apfactcheck.dheeco.com/updates |

Running the scrapers from your own PC still works and is still recorded. The
rows carry `trigger = manual` and the page labels them "run by hand".

## Cost

The daily job is a few minutes of one CPU and sits inside Cloud Run's monthly
free allowance in practice. Cloud Scheduler's first three jobs are free. The
GitHub tenders run is inside GitHub's free allowance. The real bill stays what
it is today: Cloud SQL.

## What this does not automate

Some sources publish in ways a machine cannot read reliably. The MoSPI monthly
archive is behind a browser check, and the Socio-Economic Survey annexures are
transcribed by hand. Those stay manual, and the updates page says so in its own
section rather than letting a reader assume full coverage.
