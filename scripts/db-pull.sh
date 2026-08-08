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
# DB password never leaves the server — the remote side hydrates DATABASE_URL from
# AWS SSM (via the app's own src/platform/secrets.js loader) and pipes it straight into
# pg_dump, so no secret is ever printed or sent over the wire.
#
# Override any of these via env vars if the infra changes:
set -euo pipefail

PROD_HOST="${PROD_HOST:-13.205.66.72}"
PROD_USER="${PROD_USER:-ubuntu}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/amey-journal.pem}"
PROD_APP_DIR="${PROD_APP_DIR:-/opt/amey-journal}"
# Prod secrets moved off the box into AWS SSM Parameter Store; this must match the
# box's SSM_PREFIX (see ecosystem.config.cjs). Empty => fall back to reading .env.
SSM_PREFIX="${SSM_PREFIX:-/amey-journal/prod/}"

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

echo "→ Dumping production…"
if [ -n "$SSM_PREFIX" ]; then
  # Migrated box: secrets live in AWS SSM, not .env. Run the app's own loader on
  # the box to hydrate DATABASE_URL, then pipe it straight into pg_dump — the URL
  # never crosses the wire. hydrateSecrets() logs "[secrets] loaded N" to stdout,
  # so we route console.log to stderr for that call; only pg_dump's SQL reaches
  # stdout (→ $TMP). --clean --if-exists makes the restore idempotent;
  # --no-owner/--no-privileges drop refs to the prod-only 'amey' role.
  ssh -i "$SSH_KEY" -o ConnectTimeout=20 -o StrictHostKeyChecking=accept-new \
      "$PROD_USER@$PROD_HOST" \
      "cd '$PROD_APP_DIR' && SSM_PREFIX='$SSM_PREFIX' node --input-type=module" \
      > "$TMP" <<'NODE'
import { hydrateSecrets } from './src/secrets.js';
import { spawn } from 'node:child_process';
const stdoutLog = console.log;
console.log = (...a) => console.error(...a); // keep hydrate chatter off the dump
await hydrateSecrets();
console.log = stdoutLog;
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('✗ DATABASE_URL not found after SSM hydrate — aborting (local DB untouched).');
  process.exit(1);
}
const child = spawn('pg_dump', [url, '--no-owner', '--no-privileges', '--clean', '--if-exists'],
  { stdio: ['ignore', 'inherit', 'inherit'] });
child.on('exit', (code) => process.exit(code ?? 1));
NODE
else
  # Un-migrated box: read only DATABASE_URL from the app .env (don't source the whole
  # file — it holds tokens/secrets), then dump. Fail loudly if it's missing rather
  # than letting pg_dump fall back to the local socket as OS user 'ubuntu'.
  REMOTE_CMD="cd '$PROD_APP_DIR' && DBURL=\$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '\"') && { [ -n \"\$DBURL\" ] || { echo '✗ No DATABASE_URL in prod .env (SSM cutover? set SSM_PREFIX).' >&2; exit 1; }; } && pg_dump \"\$DBURL\" --no-owner --no-privileges --clean --if-exists"
  ssh -i "$SSH_KEY" -o ConnectTimeout=20 -o StrictHostKeyChecking=accept-new \
      "$PROD_USER@$PROD_HOST" "$REMOTE_CMD" > "$TMP"
fi

if [ ! -s "$TMP" ]; then
  echo "✗ Dump came back empty — local DB left untouched." >&2; exit 1
fi

echo "→ Restoring into local ($(wc -l < "$TMP" | tr -d ' ') SQL lines)…"
psql "$LOCAL_URL" -q -f "$TMP"

echo -n "✓ Done. Local trade count: "
psql "$LOCAL_URL" -tAc "SELECT count(*) FROM trades;"
