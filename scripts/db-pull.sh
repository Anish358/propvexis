#!/usr/bin/env bash
#
# db:pull — refresh the LOCAL dev database from PRODUCTION.
#
# One-way, prod -> local. Production is only ever READ (via pg_dump); the script
# writes exclusively to your local DB, so it can never corrupt your friend's live
# journal. Run it whenever you want real data on localhost:
#
#     npm run db:pull
#
# How it works: SSH to the EC2 box, pg_dump the prod DB to a local temp file, and
# (only if the dump is complete) restore it into the local DB from ./.env. The prod
# DB password never leaves the server — the remote side reads it from the app .env.
#
# Override any of these via env vars if the infra changes:
set -euo pipefail

PROD_HOST="${PROD_HOST:-13.205.66.72}"
PROD_USER="${PROD_USER:-ubuntu}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/amey-journal.pem}"
PROD_APP_DIR="${PROD_APP_DIR:-/opt/amey-journal}"

cd "$(dirname "$0")/.."  # repo root

# --- resolve + sanity-check the LOCAL target ---
LOCAL_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"')"
if [ -z "$LOCAL_URL" ]; then
  echo "✗ No DATABASE_URL in ./.env — aborting." >&2; exit 1
fi
# Guard: refuse unless the local target is genuinely local, so this can never be
# pointed at a remote/production host by accident.
case "$LOCAL_URL" in
  *@127.0.0.1:*|*@localhost:*) : ;;
  *) echo "✗ Refusing: DATABASE_URL in ./.env is not local ($LOCAL_URL)." >&2; exit 1 ;;
esac

if [ ! -f "$SSH_KEY" ]; then
  echo "✗ SSH key not found at $SSH_KEY (set SSH_KEY=… to override)." >&2; exit 1
fi

echo "▶ Pulling PROD → LOCAL. This REPLACES your local '$( echo "$LOCAL_URL" | grep -oE '[^/]+$' )' database."

TMP="$(mktemp -t amey-proddump.XXXXXX)"
trap 'rm -f "$TMP"' EXIT

# Remote: read only DATABASE_URL from the app .env (don't source the whole file —
# it holds tokens/secrets), then dump. --clean --if-exists makes the restore
# idempotent; --no-owner/--no-privileges drop refs to the prod-only 'amey' role.
REMOTE_CMD="cd '$PROD_APP_DIR' && DBURL=\$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '\"') && pg_dump \"\$DBURL\" --no-owner --no-privileges --clean --if-exists"

echo "→ Dumping production…"
ssh -i "$SSH_KEY" -o ConnectTimeout=20 -o StrictHostKeyChecking=accept-new \
    "$PROD_USER@$PROD_HOST" "$REMOTE_CMD" > "$TMP"

if [ ! -s "$TMP" ]; then
  echo "✗ Dump came back empty — local DB left untouched." >&2; exit 1
fi

echo "→ Restoring into local ($(wc -l < "$TMP" | tr -d ' ') SQL lines)…"
psql "$LOCAL_URL" -q -f "$TMP"

echo -n "✓ Done. Local trade count: "
psql "$LOCAL_URL" -tAc "SELECT count(*) FROM trades;"
