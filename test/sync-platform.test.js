import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { enqueueQuery, dueAccountsQuery, leaseQuery, requestedPlatforms } from '../src/domain/sync/queue.js';

test('enqueue reads the platform off the account instead of trusting a caller', () => {
  // Denormalized, not passed in: a caller that guessed wrong would file a job on a
  // fleet that cannot run it, and the account row is the only authority.
  const q = enqueueQuery(42, 'first_sync');
  assert.match(q.text, /INSERT INTO sync_jobs[\s\S]*platform/);
  assert.match(q.text, /FROM mt5_accounts/);
  assert.ok(q.values.includes(42));
});

test('enqueue still cannot pile up jobs for one account', () => {
  // The partial unique index is the whole anti-pileup mechanism; rewriting this
  // statement as a SELECT-driven insert must not drop the conflict clause.
  assert.match(enqueueQuery(1, 'manual').text, /ON CONFLICT \(account_id\) WHERE status IN \('queued', 'leased'\) DO NOTHING/);
});

test('the due-accounts sweep also stamps a platform', () => {
  assert.match(dueAccountsQuery().text, /INSERT INTO sync_jobs[\s\S]*platform/);
});

test('lease filters by platform', () => {
  const q = leaseQuery('sync-01', 1, 600000, ['mt5']);
  assert.match(q.text, /platform = ANY\(/);
  assert.ok(q.values.some((v) => Array.isArray(v) && v.includes('mt5')));
});

test('lease with no platform filter still means mt5, so a stale agent keeps working', () => {
  // The Windows agent will not send `platforms` when this deploys, and that box is
  // stopped most of the time — it may be weeks before it is updated.
  const q = leaseQuery('sync-01', 1, 600000);
  assert.ok(q.values.some((v) => Array.isArray(v) && v.includes('mt5')));
});

test('requestedPlatforms defaults to mt5 for every shape of missing input', () => {
  for (const body of [undefined, {}, { platforms: null }, { platforms: [] }, { platforms: 'mt5' }]) {
    assert.deepEqual(requestedPlatforms(body), ['mt5'], `bad default for ${JSON.stringify(body)}`);
  }
});

test('requestedPlatforms accepts known ids and silently drops unknown ones', () => {
  assert.deepEqual(requestedPlatforms({ platforms: ['mt5', 'tradelocker'] }), ['mt5', 'tradelocker']);
  assert.deepEqual(requestedPlatforms({ platforms: ['mt5', 'nonsense'] }), ['mt5']);
  // All-unknown falls back rather than returning [] — an empty ANY() array would
  // match nothing and the worker would idle forever with no error.
  assert.deepEqual(requestedPlatforms({ platforms: ['nonsense'] }), ['mt5']);
});

test('requestedPlatforms is bounded and de-duplicated', () => {
  assert.deepEqual(requestedPlatforms({ platforms: ['mt5', 'mt5'] }), ['mt5']);
  assert.ok(requestedPlatforms({ platforms: Array(500).fill('mt5') }).length <= 10);
});

test('the lease route passes the worker filter through', () => {
  const src = readFileSync(new URL('../src/routes/sync.js', import.meta.url), 'utf8');
  assert.ok(src.includes('requestedPlatforms'), 'the route ignores the worker platform filter');
});
