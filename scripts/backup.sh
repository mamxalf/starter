#!/usr/bin/env bash
# Daily Postgres backup to S3-compatible storage (R2, S3, MinIO).
# Runs on the VPS host from cron, not inside the app image (it needs docker and the aws CLI).
#
#   BACKUP_S3_URI=s3://my-backups/starter ./scripts/backup.sh
#
# Settings (environment):
#   BACKUP_S3_URI    required. Destination prefix. Use a bucket separate from user uploads.
#   DB_CONTAINER     Kamal's Postgres accessory container. Default: starter-db
#   DB_NAME          database to dump. Default: app
#   DB_USER          superuser inside the container. Default: postgres
#   S3_ENDPOINT      custom endpoint (R2, MinIO). Same name as the app's variable.
#   S3_REGION        default: auto
#   S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY   used when AWS_* are not set
#   DRY_RUN=1        print what would run and exit
#
# Retention is a lifecycle rule on the bucket (e.g. delete objects after 30 days), not this script.
set -euo pipefail

: "${BACKUP_S3_URI:?set BACKUP_S3_URI, e.g. s3://my-backups/starter}"
DB_CONTAINER="${DB_CONTAINER:-starter-db}"
DB_NAME="${DB_NAME:-app}"
DB_USER="${DB_USER:-postgres}"

export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-${S3_REGION:-auto}}"
if [ -z "${AWS_ACCESS_KEY_ID:-}" ] && [ -n "${S3_ACCESS_KEY_ID:-}" ]; then
  export AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID"
  export AWS_SECRET_ACCESS_KEY="${S3_SECRET_ACCESS_KEY:?set S3_SECRET_ACCESS_KEY}"
fi

endpoint=()
if [ -n "${S3_ENDPOINT:-}" ]; then endpoint=(--endpoint-url "$S3_ENDPOINT"); fi

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
dest="${BACKUP_S3_URI%/}/${DB_NAME}-${stamp}.dump"

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "would run: docker exec $DB_CONTAINER pg_dump -U $DB_USER -Fc $DB_NAME > <tmpfile>"
  echo "would run: docker exec -i $DB_CONTAINER pg_restore --list < <tmpfile>   # integrity check"
  echo "would run: aws ${endpoint[*]:-} s3 cp <tmpfile> $dest"
  exit 0
fi

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

# Dump to a file first: a pipe straight to S3 would leave a truncated object if pg_dump dies midway.
docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -Fc "$DB_NAME" > "$tmp"
if [ ! -s "$tmp" ]; then
  echo "backup failed: empty dump" >&2
  exit 1
fi
# A dump that cannot be listed cannot be restored, so refuse to upload it.
docker exec -i "$DB_CONTAINER" pg_restore --list < "$tmp" > /dev/null

aws ${endpoint[@]+"${endpoint[@]}"} s3 cp "$tmp" "$dest" --only-show-errors
echo "backup ok: $dest ($(wc -c < "$tmp") bytes)"
