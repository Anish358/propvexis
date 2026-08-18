import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  BACKOFF_MS,
  BACKOFF_SECS,
  MAX_ATTEMPTS,
  SYNC_INTERVAL_MS,
  nextRunAfter,
  isMarketOpen,
  enqueueQuery,
  dueAccountsQuery,
  leaseQuery,
  leasedPayloadQuery,
  completeQuery,
  failQuery,
  reclaimQuery,
  heartbeatQuery,
  staleWorkersQuery,
  jobForWorkerQuery,
} from '../src/domain/sync/queue.js';
import {
  credAad,
  saveCredentialQuery,
  credentialStatusQuery,
  deleteCredentialQuery,
  rejectMasterPasswordQuery,
  sealPassword,
  openPassword,
} from '../src/domain/sync/credentials.js';
import { generateKey } from '../src/platform/secretbox.js';

// The sync farm's queue lives in Postgres, so — following stats-sql.test.js —
// the SQL is written as builders returning { text, values } and pinned here
// without a database. What these tests protect is not syntax (CI has no PG) but
// the handful of clauses whose absence would be silently wrong: the SKIP LOCKED
// lease, the partial-index conflict target, the tenant filter, and the fact that
// no credential ever gets selected into a user-facing query.

test('backoff escalates and is capped', () => {
  const t0 = Date.parse('2026-08-18T10:00:00Z');
  const at = (n) => nextRunAfter(n, t0).getTime() - t0;
  assert.equal(at(1), 60_000);
  assert.equal(at(2), 5 * 60_000);
  assert.ok(at(1) < at(2) && at(2) < at(3) && at(3) < at(4));
  // Past the ladder it clamps rather than reading off the end of the array.
  assert.equal(at(99), BACKOFF_MS[BACKOFF_MS.length - 1]);
  assert.equal(at(0), 60_000); // defensive: attempts is never 0 in practice
});

test('the seconds ladder the SQL indexes is derived from the ms one', () => {
  // Two hand-written ladders would drift, and the drift would only show as
  // "backoff is wrong" on a live box.
  assert.deepEqual(BACKOFF_SECS, BACKOFF_MS.map((ms) => ms / 1000));
  assert.equal(BACKOFF_SECS.length >= MAX_ATTEMPTS, true);
});

test('the forex week is closed Friday 21:00 UTC to Sunday 21:00 UTC', () => {
  const open = (iso) => isMarketOpen(new Date(iso));
  assert.equal(open('2026-08-21T20:59:00Z'), true);  // Friday, just before
  assert.equal(open('2026-08-21T21:00:00Z'), false); // Friday close
  assert.equal(open('2026-08-22T12:00:00Z'), false); // Saturday
  assert.equal(open('2026-08-23T20:59:00Z'), false); // Sunday, before the open
  assert.equal(open('2026-08-23T21:00:00Z'), true);  // Sunday open
  assert.equal(open('2026-08-19T03:00:00Z'), true);  // midweek
});

test('enqueue and the scheduler both target the partial unique index', () => {
  // Without this exact conflict target the insert raises instead of no-opping,
  // and "Sync now" pressed twice becomes a 500.
  for (const q of [enqueueQuery(1, 'manual'), dueAccountsQuery()]) {
    assert.match(q.text, /ON CONFLICT \(account_id\) WHERE status IN \('queued', 'leased'\)/);
    assert.match(q.text, /DO NOTHING/);
  }
});

test('the scheduler skips accounts we must not or need not log into', () => {
  const { text, values } = dueAccountsQuery(SYNC_INTERVAL_MS);
  assert.match(text, /a\.is_active/);
  assert.match(text, /a\.kind = 'synced'/);
  // read_only IS NOT FALSE — a master password awaiting deletion is never retried.
  assert.match(text, /c\.read_only IS NOT FALSE/);
  // Interval is a bound parameter, not string-built SQL.
  assert.match(text, /make_interval\(secs => \$1\)/);
  assert.deepEqual(values, [SYNC_INTERVAL_MS / 1000]);
});

test('leasing uses FOR UPDATE SKIP LOCKED and counts the attempt', () => {
  const { text, values } = leaseQuery('worker-1', 2, 600_000);
  assert.match(text, /FOR UPDATE SKIP LOCKED/);
  assert.match(text, /ORDER BY run_after, id/);
  assert.match(text, /status = 'queued' AND run_after <= now\(\)/);
  // Incrementing on lease (not on failure) means a worker that dies silently
  // still burns an attempt, so a crash loop backs off instead of spinning.
  assert.match(text, /attempts = j\.attempts \+ 1/);
  assert.deepEqual(values, ['worker-1', 2, 600]);
});

test('the lease payload decides the sync window server-side', () => {
  const { text, values } = leasedPayloadQuery([1, 2]);
  // `since` comes from our own trades table, never from the Windows box, whose
  // clock and timezone we do not control.
  assert.match(text, /max\(t\.close_time\) FROM trades t/);
  assert.match(text, /GREATEST/);
  assert.deepEqual(values[0], [1, 2]);
  // Ciphertext travels; this module never decrypts.
  assert.match(text, /c\.password_ct/);
  assert.ok(!/SYNC_CRED_KEY|decrypt/i.test(text));
});

test('complete and fail only act on a job that is actually leased', () => {
  // Otherwise a stale agent could mark a job done that another worker now holds.
  assert.match(completeQuery(5, {}).text, /WHERE id = \$1 AND status = 'leased'/);
  assert.match(failQuery(5, 'x').text, /WHERE id = \$1 AND status = 'leased'/);
});

test('failure escalates the backoff from the attempts column, in SQL', () => {
  const { text, values } = failQuery(5, 'login failed');
  assert.match(text, /\(\$4::int\[\]\)\[LEAST\(GREATEST\(attempts, 1\), \$3\)\]/);
  assert.match(text, /CASE WHEN attempts >= \$3 THEN 'failed' ELSE 'queued' END/);
  assert.deepEqual(values[3], BACKOFF_SECS);
  assert.equal(values[2], MAX_ATTEMPTS);
});

test('a long error message is truncated before it reaches the column', () => {
  const { values } = failQuery(5, 'x'.repeat(5000));
  assert.equal(values[1].length, 1000);
});

test('a worker can only fetch a job it currently holds', () => {
  // Both halves matter: 'leased' stops a finished job being reported twice, and
  // leased_by stops one worker closing another worker's in-flight job.
  const { text, values } = jobForWorkerQuery(7, 'worker-2');
  assert.match(text, /status = 'leased'/);
  assert.match(text, /leased_by = \$2/);
  assert.deepEqual(values, [7, 'worker-2']);
});

test('expired leases are reclaimed', () => {
  assert.match(reclaimQuery().text, /status = 'leased' AND lease_expires_at < now\(\)/);
  assert.match(reclaimQuery().text, /SET status = 'queued'/);
});

test('heartbeat upserts and stale detection is parameterized', () => {
  assert.match(heartbeatQuery('w1', '1.0').text, /ON CONFLICT \(worker_id\) DO UPDATE/);
  const stale = staleWorkersQuery(15 * 60 * 1000);
  assert.match(stale.text, /last_seen < now\(\) - make_interval\(secs => \$1\)/);
  assert.deepEqual(stale.values, [900]);
});

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

test('a user-facing credential read never selects the ciphertext', () => {
  // The strongest available guarantee that the password cannot leak through a
  // response shape: the query cannot fetch it in the first place.
  const { text } = credentialStatusQuery(7, 42);
  assert.ok(!text.includes('password_ct'));
  assert.match(text, /a\.user_id = \$1/); // and it is tenant-scoped
});

test('credential writes and deletes are tenant-scoped', () => {
  assert.match(deleteCredentialQuery(7, 42).text, /a\.user_id = \$1/);
  assert.deepEqual(deleteCredentialQuery(7, 42).values, [7, 42]);
});

test('re-saving a password clears the read-only verdict', () => {
  // Otherwise a master password inherits the clean record of the investor
  // password it replaced, and the trade_allowed check never runs again.
  const { text } = saveCredentialQuery({ accountId: 1, server: 'S', firmKey: 'gft', passwordCt: 'v1.a.b.c' });
  assert.match(text, /read_only = NULL/);
  assert.match(text, /verified_at = NULL/);
});

test('minting an ingest token never overwrites an existing one', () => {
  // Accounts predating per-account tokens have none, and server-side sync cannot
  // work without one — but rotating a token the EA is ALREADY using would silently
  // break that trader's existing sync, so the IS NULL lives in the WHERE clause.
  const src = readFileSync(new URL('../src/domain/accounts/accounts.js', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('export async function ensureIngestToken'),
                       src.indexOf('// Look up an account by its ingest token'));
  assert.match(fn, /AND ingest_token IS NULL/);
  assert.match(fn, /AND user_id = \$2/);            // tenant-scoped
  assert.ok(!/ingest_token = \$3;/.test(fn.replace(/WHERE[\s\S]*/, '')), 'no unconditional write');
});

test('a detected master password is deleted, not flagged', () => {
  assert.match(rejectMasterPasswordQuery(1).text, /^DELETE FROM mt5_credentials/);
});

test('a credential is sealed against its own account id', () => {
  const cfg = { syncCredKey: generateKey() };
  const ct = sealPassword(42, 'investor-pw', cfg);
  assert.equal(openPassword({ account_id: 42, password_ct: ct }, cfg), 'investor-pw');
  // The binding is what stops a row swap from pointing one account's sync at
  // another account's password.
  assert.throws(() => openPassword({ account_id: 43, password_ct: ct }, cfg));
  assert.equal(credAad(42), 'mt5-cred:42');
});

test('sealing refuses an empty password', () => {
  assert.throws(() => sealPassword(1, '', { syncCredKey: generateKey() }), /password required/);
});
