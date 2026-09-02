# Automatic refresh — Cloud Run Job + Cloud Scheduler

What this sets up: the platform re-checks its government sources on its own,
writes down what each one gave, and publishes that record at
`https://apfactcheck.dhethi.com/updates`.

Everything below runs **once**. Afterwards the only maintenance is reading the
updates page, and running step 6 again if the image changes.

Run these in a **fresh PowerShell** (Start menu → PowerShell), from
`politics-platform\backend`.

---

## Why a Job and not a cron on the API

Cloud Run *services* answer web requests; a scrape that takes four minutes and
returns nothing is not a web request. Cloud Run *Jobs* exist for exactly this:
they run to completion, retry on failure, and cost nothing when idle. The job
reuses the **same container image** the API already runs — the image already
contains `scripts/` and `seed/` — so there is one image to build, not two.

The region matters more than it looks. Several AP portals (e-procurement above
all) refuse connections from outside India. `asia-south1` is Mumbai, so the job
goes out from an Indian IP. A GitHub Actions cron would be free and would fail.

---

## 1. Deploy the job

```powershell
gcloud run jobs deploy apnn-refresh `
  --source . `
  --region asia-south1 `
  --tasks 1 `
  --max-retries 1 `
  --task-timeout 1800s `
  --memory 1Gi `
  --cpu 1 `
  --set-secrets "DATABASE_URL=DATABASE_URL:latest,SECRET_KEY=SECRET_KEY:latest,ADMIN_KEY=ADMIN_KEY:latest" `
  --set-env-vars "^;^APP_ENV=production" `
  --set-cloudsql-instances ap-nadu-nedu:asia-south1:apnn-db `
  --command python `
  --args "scripts/run_all_scrapers.py,--trigger,scheduled"
```

`--max-retries 1` is deliberate. A scrape that failed because a portal was down
will fail the same way thirty seconds later; retrying it twice more just makes
three identical rows in the log. One retry covers a genuine blip.

`--task-timeout 1800s` (30 min) is generous — the whole set takes a few minutes
— but the district scraper walks 26 sites and a slow morning should not be
recorded as a failure.

## 2. Create the table

The `data_updates` table is created automatically the first time the API starts
with the new code, so this happens when you redeploy the API (step 6). To do it
explicitly instead:

```powershell
gcloud run jobs execute apnn-refresh --region asia-south1 --wait
```

The first run creates the table, scrapes, and writes its own audit rows.

## 3. Let the scheduler invoke the job

Cloud Scheduler needs an identity allowed to start the job.

```powershell
gcloud iam service-accounts create apnn-scheduler `
  --display-name "Cloud Scheduler — refresh job"

gcloud run jobs add-iam-policy-binding apnn-refresh `
  --region asia-south1 `
  --member "serviceAccount:apnn-scheduler@ap-nadu-nedu.iam.gserviceaccount.com" `
  --role roles/run.invoker
```

## 4. Schedule the runs

Cloud Scheduler takes a timezone directly, so these are written in IST — no
UTC arithmetic to get wrong twice a year.

```powershell
# Documents, budgets, projects — once each morning, before people are reading.
gcloud scheduler jobs create http apnn-refresh-daily `
  --location asia-south1 `
  --schedule "0 6 * * *" `
  --time-zone "Asia/Kolkata" `
  --uri "https://asia-south1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/ap-nadu-nedu/jobs/apnn-refresh:run" `
  --http-method POST `
  --oauth-service-account-email "apnn-scheduler@ap-nadu-nedu.iam.gserviceaccount.com" `
  --description "AP Nadu Nedu — daily source refresh"
```

Tenders move through the day, so they get their own shorter cycle and their own
scheduler entry pointing at the same job with a different argument:

```powershell
gcloud run jobs deploy apnn-refresh-tenders `
  --image asia-south1-docker.pkg.dev/ap-nadu-nedu/cloud-run-source-deploy/apnn-refresh `
  --region asia-south1 `
  --tasks 1 --max-retries 1 --task-timeout 900s --memory 512Mi `
  --set-secrets "DATABASE_URL=DATABASE_URL:latest,SECRET_KEY=SECRET_KEY:latest,ADMIN_KEY=ADMIN_KEY:latest" `
  --set-env-vars "^;^APP_ENV=production" `
  --set-cloudsql-instances ap-nadu-nedu:asia-south1:apnn-db `
  --command python `
  --args "scripts/run_all_scrapers.py,--only,tenders,--trigger,scheduled"

gcloud run jobs add-iam-policy-binding apnn-refresh-tenders `
  --region asia-south1 `
  --member "serviceAccount:apnn-scheduler@ap-nadu-nedu.iam.gserviceaccount.com" `
  --role roles/run.invoker

gcloud scheduler jobs create http apnn-refresh-tenders `
  --location asia-south1 `
  --schedule "0 */2 * * *" `
  --time-zone "Asia/Kolkata" `
  --uri "https://asia-south1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/ap-nadu-nedu/jobs/apnn-refresh-tenders:run" `
  --http-method POST `
  --oauth-service-account-email "apnn-scheduler@ap-nadu-nedu.iam.gserviceaccount.com" `
  --description "AP Nadu Nedu — tenders, every 2 hours"
```

## 5. Get told when a run fails

The job exits non-zero only when **every** source failed — one dead portal is
normal and belongs on the updates page, not in your inbox. This alert fires on
the real thing: the whole refresh broke.

Console → **Monitoring → Alerting → Create policy**:
- Condition: *Cloud Run Job* → metric `job/completed_task_attempt_count`,
  filter `result = failed`, job name `apnn-refresh`
- Trigger when the count is above 0 in a 30-minute window
- Notification channel: your email (add it if it isn't there yet)

## 6. Redeploy the API so /updates has data to serve

```powershell
gcloud run deploy apnn-api `
  --source . `
  --region asia-south1 `
  --allow-unauthenticated `
  --min-instances 1 --max-instances 5 --memory 512Mi `
  --add-cloudsql-instances ap-nadu-nedu:asia-south1:apnn-db `
  --set-secrets "DATABASE_URL=DATABASE_URL:latest,SECRET_KEY=SECRET_KEY:latest,ADMIN_KEY=ADMIN_KEY:latest" `
  --set-env-vars "^;^APP_ENV=production;ALLOWED_ORIGINS=https://ap-nadu-nedu.web.app,https://apfactcheck.dhethi.com"
```

The `^;^` prefix tells PowerShell-hosted gcloud to split on semicolons instead
of commas — without it, the comma inside ALLOWED_ORIGINS is read as a second
variable and the deploy fails with a confusing parse error.

---

## Day to day

| Task | Command |
|---|---|
| Run a refresh now | `gcloud run jobs execute apnn-refresh --region asia-south1` |
| Watch that run | `gcloud run jobs executions list --job apnn-refresh --region asia-south1` |
| Read its logs | `gcloud beta run jobs logs tail apnn-refresh --region asia-south1` |
| Pause the schedule | `gcloud scheduler jobs pause apnn-refresh-daily --location asia-south1` |
| Resume it | `gcloud scheduler jobs resume apnn-refresh-daily --location asia-south1` |
| See what changed | https://apfactcheck.dhethi.com/updates |

Running the scrapers from your own PC still works and is still recorded — the
rows just carry `trigger = manual`, and the page labels them "run by hand".

## Cost

The daily job is a few minutes of one CPU; the tenders job is under a minute,
twelve times a day. Both sit inside Cloud Run's monthly free allowance in
practice. Cloud Scheduler's first three jobs are free. The real bill stays what
it is today: Cloud SQL.

## What this does not automate

Some sources publish in ways a machine cannot read reliably — the MoSPI monthly
archive is behind a browser check, and the Socio-Economic Survey annexures are
transcribed by hand. Those stay manual, and the updates page says so in its own
section rather than letting a reader assume full coverage.
