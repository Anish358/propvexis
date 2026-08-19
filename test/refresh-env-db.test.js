import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../src/platform/paths.js';

// scripts/refresh-env-db.sh is the only script in the repo whose job is to DROP a
// database. It exists because the alternative that was proposed — pointing dev and
// staging at the production database — would have put `node scripts/migrate.js`
// (which deploy-env.yml runs on every env deploy) on top of live user data.
//
// So the thing worth testing is not that it restores; it is that it can never
// aim at production, and that a refreshed copy is not left holding real
// addresses or real broker credentials. Those are properties of the script text,
// which is what these assertions read — the same approach as routes-split.test.js,
// and for the same reason: the failure mode is silent and only shows up in prod.
const script = readFileSync(path.join(repoRoot, 'scripts', 'refresh-env-db.sh'), 'utf8');

test('the target allowlist resolves only non-production databases', () => {
  const branches = [...script.matchAll(/^\s{2}(\w+)\)\s+DB='([^']+)'/gm)]
    .map(([, target, db]) => ({ target, db }));

  assert.deepEqual(branches, [
    { target: 'dev', db: 'amey_dev' },
    { target: 'staging', db: 'amey_staging' },
  ], 'only dev and staging may be refresh targets');

  for (const { db } of branches) {
    assert.notEqual(db, 'amey_journal', `${db} must not be the production database`);
  }
});

test('an unknown target is refused rather than defaulting to anything', () => {
  const fallthrough = /\*\)\s*echo "refusing: target must be 'dev' or 'staging'/.test(script);
  assert.ok(fallthrough, 'the case statement must refuse unrecognised targets');
});

test('a second, independent guard rejects the production database by name', () => {
  // Independent of the allowlist on purpose: a typo in one branch must not be the
  // only thing standing between a refresh and wiping production.
  assert.match(script, /PROD_DB='amey_journal'/);
  assert.match(script, /if \[\[ "\$DB" == "\$PROD_DB" \]\]; then/);
  assert.match(script, /refusing: resolved target is the production database/);
});

test('every destructive statement is parameterised by $DB, never a literal', () => {
  const destructive = script.match(/^.*(DROP DATABASE|CREATE DATABASE|pg_terminate_backend).*$/gm) ?? [];
  assert.ok(destructive.length >= 3, 'expected the drop/terminate/create trio');
  for (const line of destructive) {
    assert.ok(
      !/amey_journal/.test(line),
      `destructive statement names a database literally: ${line.trim()}`
    );
  }
});

test('the restore runs as the target env role, not as postgres', () => {
  // Each env connects as its own role (dev=amey_dev, staging=amey_staging). A
  // restore run as postgres leaves every table owned by postgres, and the app
  // then connects fine and is denied on its first SELECT — a failure that looks
  // like a code bug, not a restore bug.
  assert.match(script, /pg_restore[^\n]*--role="\$OWNER"/);
  assert.match(script, /CREATE DATABASE \$DB OWNER \$OWNER/);
});

test('scrubbing is the default and clears what must not leave production', () => {
  assert.match(script, /^SCRUB=1$/m, 'scrub must be on unless --no-scrub is passed');

  // Real addresses: dev has MAIL_FROM set now, so an un-scrubbed copy would let a
  // password-reset test mail a real trader an app-dev link.
  assert.match(script, /UPDATE users\s*\n\s*SET email = 'dev-' \|\| id \|\| '@invalid\.example'/);
  // Broker passwords sealed under prod's SYNC_CRED_KEY have no business here.
  assert.match(script, /DELETE FROM mt5_credentials;/);
  // Unused verify/reset tokens from prod would be redeemable against the copy.
  assert.match(script, /DELETE FROM auth_tokens;/);
});

test('--no-scrub says plainly what the resulting database contains', () => {
  assert.match(script, /NOT scrubbing — this database now holds real addresses/);
});

test('the refreshed database is migrated up to the deployed branch', () => {
  // The dump is at prod's schema version; the branch deployed to dev is normally
  // ahead of it (that is the point of a dev env), so skipping this boots the app
  // against a schema its code does not match.
  assert.match(script, /node "\$APP_DIR\/scripts\/migrate\.js"/);
  assert.match(script, /migration failed — the database is restored but not migrated/);
});
