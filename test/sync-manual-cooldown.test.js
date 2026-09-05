import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  lastJobQuery, lastManualJobQuery, manualCooldown, MANUAL_COOLDOWN_MS,
} from '../src/domain/sync/queue.js';

const routes = readFileSync(
  fileURLToPath(new URL('../src/routes/sync.js', import.meta.url)), 'utf8',
);

/* THE MANUAL COOLDOWN IS STARTED BY MANUAL SYNCS AND NOTHING ELSE.
 *
 * The bug this pins, seen on prod 2026-09-05: adding a cTrader account enqueues a
 * `first_sync`, which finished at 18:52:59 -- and that stamped a fifteen-minute manual
 * cooldown. The trader's FIRST press of "Sync Trades", on an account they had just
 * connected, was refused. The first manual job appears in sync_jobs at 19:08:33, which
 * is 15m34s later: they waited the whole window out.
 *
 * Two cadences, two limiters, and they must not share a clock. The unattended one is
 * dueAccountsQuery's per-platform interval (THREE HOURS). MANUAL_COOLDOWN_MS exists to
 * stop a human holding down a button, so only a human's own press may consume it.
 */

test('the manual cooldown query considers MANUAL jobs only', () => {
  const q = lastManualJobQuery(7);
  assert.match(q.text, /reason = 'manual'/,
    "without this filter a first_sync or a schedule starts the user's manual cooldown");
  assert.match(q.text, /account_id = \$1/);
  assert.deepEqual(q.values, [7]);
  // Ordered by id for the same reason lastJobQuery is: a requeued job keeps its row.
  assert.match(q.text, /ORDER BY id DESC/);
});

test('lastJobQuery is deliberately NOT narrowed — the status panel wants every reason', () => {
  // The Last Sync cell and the sync-status panel report the newest job WHATEVER its
  // reason. Filtering this one to fix the cooldown would make a scheduled sync
  // invisible in the UI, which is a second bug wearing the first one's clothes.
  assert.doesNotMatch(lastJobQuery(7).text, /reason = 'manual'/);
});

test('both cooldown call sites read the manual-only query', () => {
  // POST /api/accounts/:id/sync and POST /api/sync/now. Fixing one and not the other
  // leaves "Sync Trades" refusing while the per-account row menu works, which is the
  // sort of half-fix that reads as a flaky server.
  const feeds = routes.match(/const previous = await (\w+)\(/g) ?? [];
  assert.equal(feeds.length, 2, 'expected exactly two manual-cooldown call sites');
  for (const feed of feeds) {
    assert.match(feed, /lastManualJob\(/,
      'the cooldown must never be fed lastJob(), which returns any reason');
  }
});

test('a finished first_sync no longer blocks the first manual press', () => {
  // The prod shape, replayed: the manual query returns nothing because no manual job
  // has ever run, so there is no cooldown to serve.
  assert.deepEqual(manualCooldown(null), { blocked: false, retryAfterMs: 0 });
  const at = Date.parse('2026-09-05T18:52:59Z');
  assert.deepEqual(
    manualCooldown({ reason: 'first_sync', finished_at: '2026-09-05T18:52:59Z' }, at),
    { blocked: true, retryAfterMs: MANUAL_COOLDOWN_MS },
    'manualCooldown itself is reason-blind ON PURPOSE — the QUERY is what filters, '
    + 'so a caller cannot half-apply the rule by passing the wrong row',
  );
});

test('a recent manual sync still blocks, and reports the wait', () => {
  const now = Date.parse('2026-09-05T19:00:00Z');
  const job = { reason: 'manual', finished_at: '2026-09-05T18:55:00Z' };
  const { blocked, retryAfterMs } = manualCooldown(job, now);
  assert.equal(blocked, true);
  assert.equal(retryAfterMs, 10 * 60 * 1000, 'five minutes served, ten to go');
});

test('an unfinished manual job does not block — finished_at is the clock', () => {
  // A queued or leased job has no finished_at. Blocking on it would make an account
  // whose worker died unsyncable by hand, which is exactly when a human needs the button.
  assert.equal(manualCooldown({ reason: 'manual', finished_at: null }).blocked, false);
});
