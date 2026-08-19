#!/usr/bin/env bash
# Refresh a non-production database from the latest production dump.
#
# WHY THIS EXISTS INSTEAD OF ONE SHARED DATABASE
#
# The three environments are three databases on ONE Postgres server on the app
# box (all localhost:5432), so pointing dev at the prod database saves no
# instance, no money and no disk worth counting. What it would cost is real:
# .github/workflows/deploy-env.yml runs `node scripts/migrate.js` on EVERY env
# deploy, so a push to the `dev` branch would run unreviewed migrations against
# live user data, and any test signup or deletion on app-dev would be a write to
# a real trader's account.
#
# The actual want behind "make the databases match" is realistic data to test
# against. That is what this gives you, on demand, with no path from dev back to
# prod.
#
# USAGE (run on the box, from the app dir of the target env)
#
#   bash scripts/refresh-env-db.sh dev
#   bash scripts/refresh-env-db.sh staging --keep-email me@example.com
#   bash scripts/refresh-env-db.sh dev --from /var/backups/amey/<file>.dump
#   bash scripts/refresh-env-db.sh dev --no-scrub        # exact copy, see below
#
# WHAT IT DOES
#   1. refuses any target that is not dev/staging, twice (see the guard below)
#   2. picks the newest dump in BACKUP_DIR unless --from says otherwise
#   3. drops and recreates the target database, restores the dump into it
#   4. scrubs what must not live in a non-prod database (unless --no-scrub)
#   5. runs pending migrations, because the dump is at prod's schema version and
#      the branch deployed here is usually ahead of it
set -euo pipefail

PROD_DB='amey_journal'            # never a target — see the guard
BACKUP_DIR="${BACKUP_DIR:-/var/backups/amey}"
PSQL=(sudo -u postgres psql -v ON_ERROR_STOP=1)

usage() { sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }

TARGET="${1:-}"; shift || true
DUMP=''
SCRUB=1
KEEP_EMAILS=''

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from)       DUMP="${2:?--from needs a path}"; shift 2 ;;
    --keep-email) KEEP_EMAILS="${KEEP_EMAILS}${KEEP_EMAILS:+,}${2:?--keep-email needs an address}"; shift 2 ;;
    --no-scrub)   SCRUB=0; shift ;;
    -h|--help)    usage ;;
    *) echo "unknown option: $1" >&2; usage ;;
  esac
done

# ---------------------------------------------------------------------------
# The guard. Two independent checks, because this is the one script in the repo
# whose whole job is to destroy a database — an allowlist typo must not be the
# only thing between a refresh and wiping production.
# ---------------------------------------------------------------------------
case "$TARGET" in
  dev)     DB='amey_dev';     OWNER='amey_dev';     PM2='amey-backend-dev';     APP_DIR='/opt/amey-dev' ;;
  staging) DB='amey_staging'; OWNER='amey_staging'; PM2='amey-backend-staging'; APP_DIR='/opt/amey-staging' ;;
  *) echo "refusing: target must be 'dev' or 'staging' (got '${TARGET:-<none>}')" >&2; usage ;;
esac
if [[ "$DB" == "$PROD_DB" ]]; then
  echo "refusing: resolved target is the production database ($PROD_DB)" >&2
  exit 2
fi

# ---------------------------------------------------------------------------
# Pick the dump
# ---------------------------------------------------------------------------
if [[ -z "$DUMP" ]]; then
  DUMP="$(ls -1t "$BACKUP_DIR"/amey-journal-*.dump 2>/dev/null | head -1 || true)"
fi
[[ -n "$DUMP" && -f "$DUMP" ]] || { echo "no dump found (looked in $BACKUP_DIR)" >&2; exit 1; }

echo "==> target   : $DB   (env: $TARGET)"
echo "==> dump     : $DUMP  ($(du -h "$DUMP" | cut -f1), $(date -u -r "$DUMP" '+%Y-%m-%d %H:%M UTC'))"
echo "==> scrub    : $([[ $SCRUB -eq 1 ]] && echo yes || echo 'NO (--no-scrub)')"
[[ -n "$KEEP_EMAILS" ]] && echo "==> keep     : $KEEP_EMAILS"

# ---------------------------------------------------------------------------
# Recreate. Stop the app first: DROP DATABASE fails while the pool holds
# connections, and a running app against a half-restored schema is worse noise
# than a minute of downtime on a non-prod env.
# ---------------------------------------------------------------------------
echo "==> stopping $PM2"
pm2 stop "$PM2" >/dev/null 2>&1 || echo "    (not running)"

echo "==> recreating $DB"
"${PSQL[@]}" -d postgres -Atc \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB' AND pid <> pg_backend_pid()" >/dev/null
"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS $DB" >/dev/null
"${PSQL[@]}" -d postgres -c "CREATE DATABASE $DB OWNER $OWNER" >/dev/null

echo "==> restoring as $OWNER"
# --role matters: each env connects as its OWN role (prod=amey, dev=amey_dev,
# staging=amey_staging), and a restore run as postgres would leave every table
# owned by postgres — the app would then connect fine and be denied on its first
# SELECT. SET ROLE makes the restored objects belong to the role that will use
# them. --no-owner/--no-privileges drop prod's `amey` ownership from the dump.
sudo -u postgres pg_restore --no-owner --no-privileges --role="$OWNER" -d "$DB" "$DUMP" 2>&1 | tail -5 || true

# ---------------------------------------------------------------------------
# Scrub. A copy of prod carries three things that must not be live in a
# non-prod environment, and all three have bitten someone somewhere:
#
#   1. REAL EMAIL ADDRESSES. Mail is enabled on dev now (MAIL_FROM is set), so
#      a password-reset test would send a real trader an app-dev link.
#   2. BROKER CREDENTIALS. mt5_credentials.password_ct is sealed with PROD's
#      SYNC_CRED_KEY under an account-bound AAD; this env has a different key,
#      so the rows are unopenable here anyway — but a dev box should not be
#      holding someone's broker password in any form.
#   3. LIVE AUTH TOKENS. Unused verification/reset tokens from prod would be
#      redeemable against this env's copies of those accounts.
# ---------------------------------------------------------------------------
if [[ $SCRUB -eq 1 ]]; then
  echo "==> scrubbing"
  KEEP_SQL="''"
  if [[ -n "$KEEP_EMAILS" ]]; then
    KEEP_SQL="$(printf "%s" "$KEEP_EMAILS" | tr ',' '\n' | sed "s/'/''/g; s/.*/'&'/" | paste -sd, -)"
  fi
  "${PSQL[@]}" -d "$DB" <<SQL
BEGIN;
UPDATE users
   SET email = 'dev-' || id || '@invalid.example'
 WHERE email NOT IN ($KEEP_SQL);
DELETE FROM mt5_credentials;
DELETE FROM auth_tokens;
UPDATE sync_jobs
   SET status = 'failed', error = 'cancelled by database refresh', finished_at = now(),
       leased_by = NULL, lease_expires_at = NULL
 WHERE status IN ('queued', 'leased');
COMMIT;
SQL
  "${PSQL[@]}" -d "$DB" -Atc "SELECT 'users kept real: ' || count(*) FROM users WHERE email NOT LIKE 'dev-%@invalid.example'"
else
  echo "==> NOT scrubbing — this database now holds real addresses and prod"
  echo "    credential rows. Do not run a mail or sync flow against it."
fi

# ---------------------------------------------------------------------------
# Migrate. The dump is at prod's schema version; the branch deployed to this env
# is normally ahead (that is the point of a dev env), so without this the app
# boots against a schema its code does not match.
# ---------------------------------------------------------------------------
echo "==> migrating $APP_DIR"
if [[ -d "$APP_DIR" ]]; then
  ( cd "$APP_DIR" && set -a && [[ -f .env ]] && source .env; set +a
    SSM_PREFIX="/amey-journal/$TARGET" node "$APP_DIR/scripts/migrate.js" ) || {
      echo "    migration failed — the database is restored but not migrated" >&2; exit 1; }
else
  echo "    $APP_DIR not found; run scripts/migrate.js there yourself"
fi

echo "==> starting $PM2"
pm2 start "$PM2" >/dev/null 2>&1 || pm2 restart "$PM2" >/dev/null 2>&1 || true
echo "==> done: $DB refreshed from $(basename "$DUMP")"
