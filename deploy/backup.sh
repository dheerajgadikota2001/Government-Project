#!/bin/sh
# Ship last night's pg_dump to Cloudflare R2 (S3-compatible). Keeps 60 days there.
# Env (from .env.prod): R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET
set -eu
[ -n "${R2_ACCOUNT_ID:-}" ] || { echo "R2 not configured; skipping off-site copy"; exit 0; }
export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
export RCLONE_CONFIG_R2_ACL=private
latest=$(ls -1t /backups/apnn-*.sql.gz 2>/dev/null | head -1)
[ -n "$latest" ] || { echo "no dump found"; exit 0; }
rclone copy "$latest" "r2:${R2_BUCKET}/pg/" --s3-no-check-bucket
rclone delete "r2:${R2_BUCKET}/pg/" --min-age 60d
echo "off-site copy done: $(basename "$latest")"
