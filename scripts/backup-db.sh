#!/usr/bin/env bash
# Nightly Postgres backup for Amey Journal.
#
# Dumps the database (custom format, compressed) to a local backups dir and
# prunes dumps older than RETENTION_DAYS. Optionally syncs to S3 if S3_BUCKET is
# set (off-box copy — the EC2 disk is a single point of failure).
#
# Run from the project root so it picks up .env:  bash scripts/backup-db.sh
# Schedule on the server with cron, e.g. nightly at 02:15 UTC:
#   15 2 * * * cd /path/to/amey-journal && bash scripts/backup-db.sh >> /var/log/amey-backup.log 2>&1
#
# Restore a dump with:  pg_restore --clean --if-exists -d "$DATABASE_URL" <file>
set -euo pipefail

# Load DATABASE_URL from .env if present (KEY=VALUE lines).
if [[ -f .env ]]; then
  set -a; source .env; set +a
fi

: "${DATABASE_URL:?DATABASE_URL must be set (in env or .env)}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/amey-journal-$STAMP.dump"

echo "[$(date -u)] dumping to $OUT"
# -Fc = custom format (compressed, restorable with pg_restore).
pg_dump --format=custom --no-owner --dbname="$DATABASE_URL" --file="$OUT"
echo "[$(date -u)] dump complete ($(du -h "$OUT" | cut -f1))"

# Off-box copy (optional).
if [[ -n "${S3_BUCKET:-}" ]]; then
  echo "[$(date -u)] uploading to s3://$S3_BUCKET/"
  aws s3 cp "$OUT" "s3://$S3_BUCKET/$(basename "$OUT")"
fi

# Prune old local dumps.
find "$BACKUP_DIR" -name 'amey-journal-*.dump' -type f -mtime "+$RETENTION_DAYS" -print -delete
echo "[$(date -u)] done (retention ${RETENTION_DAYS}d)"
