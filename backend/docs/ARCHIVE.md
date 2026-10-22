# Source archive: runbook

| | |
|---|---|
| Decision | Dheeraj, 19 Oct 2026: option C, a fingerprinted archive in Google Cloud Storage, Mumbai |
| Code | `app/services/archive.py`, `app/routers/archive.py`, `scripts/archive_folder.py`, `scripts/archive_audit.py` |
| Tables | `archived_files`, `archived_file_sources` (migration 0008) |
| Bucket | `ap-nadu-nedu-archive` in `asia-south1`, project `ap-nadu-nedu` |

## What it does

Every government file we cite is stored once, named by its SHA-256, and packed with
lossless zstd. It unpacks to exactly the bytes the portal served, so the fingerprint
we print can be checked by anyone against the government's own copy.

Measured on 19 Oct 2026 (18 real files: the Statistical Abstract 2024, the
Bhogapuram AIP supplement twice, the backend seeds): 68.3 MB on disk, 56.0 MB once
each, 40.4 MB stored. Every file came back byte for byte.

| Rule | Why |
|---|---|
| Named by SHA-256 | A file found at two addresses or on two dates is stored once |
| Lossless only | Re-encoding a PDF would save space and destroy the proof |
| Checked on every origin read | A damaged copy is withheld (503), never served |
| Immutable URL | `/api/v1/archive/files/<sha256>` is cached by the CDN for a year |
| Sandboxed responses | An archived web page can never run scripts on our site |

Readers see the government's address first and our copy as the backup.

## One-time setup (Dheeraj, in PowerShell, once)

```
gcloud config set project ap-nadu-nedu
gcloud storage buckets create gs://ap-nadu-nedu-archive --location=asia-south1 --uniform-bucket-level-access --public-access-prevention --soft-delete-duration=7d
gcloud storage buckets update gs://ap-nadu-nedu-archive --lifecycle-file=backend/deploy/archive/lifecycle.json
```

The bucket stays private. Readers reach files only through the API, which checks them.

Let the API read it (the Cloud Run service runs as the default compute account):

```
gcloud projects describe ap-nadu-nedu --format="value(projectNumber)"
gcloud storage buckets add-iam-policy-binding gs://ap-nadu-nedu-archive --member=serviceAccount:<PROJECT_NUMBER>-compute@developer.gserviceaccount.com --role=roles/storage.objectViewer
gcloud run services update apnn-api --region=asia-south1 --update-env-vars=ARCHIVE_BACKEND=gcs,ARCHIVE_BUCKET=ap-nadu-nedu-archive
```

On his PC, the scraper environment uploads with his own login:

```
gcloud auth application-default login
pip install -r backend/requirements.txt        # adds zstandard
```

and in `backend/.env`: `ARCHIVE_BACKEND=gcs` and `ARCHIVE_BUCKET=ap-nadu-nedu-archive`.

## Filling it

From `backend/`, against the Cloud SQL proxy:

```
python scripts/archive_folder.py ../sources --estimate      # dry run: counts, duplicates, size
python scripts/archive_folder.py ../sources --apply --record
python scripts/archive_audit.py --sample 50
```

Safe to repeat: files already held are skipped by fingerprint. Nothing is ever deleted.
A manifest (`sources/_archive_manifest.jsonl`) maps each local path to its fingerprint.

## Storage classes

`deploy/archive/lifecycle.json` moves objects from Standard to Coldline after 90 days,
then to Archive after a year. All classes stay readable instantly. Colder classes cost
less to keep and a little more per read, and reads are rare because the CDN keeps
each file. Check the current Mumbai rates in the GCP pricing calculator before
changing the ages.

## First deploy check

Open `/api/v1/archive/files/<sha of the Statistical Abstract 2024>` through the live
site. Files above 30 MiB are sent chunked because Cloud Run limits a response with a
declared length to 32 MiB. Confirm the 41 MB file downloads whole and its SHA-256
matches.

## Weekly

`python scripts/archive_audit.py --sample 200` from the refresh job. Exit 1 means a copy
failed its check. Do not delete it: find out whether the bucket or the source changed.
