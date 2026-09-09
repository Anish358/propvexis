import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  tradelockerLeasedPayloadQuery, leasedPayloadQuery, splitJobsByPlatform,
} from '../src/domain/sync/queue.js';

test('THE SILENT SPIN, a third time: the MT5 payload query cannot serve a TradeLocker job', () => {
  /* Before this query existed, a TradeLocker job leased against the
   * `tradelocker` bucket splitJobsByPlatform already produced -- and was
   * handed NOTHING, because nothing drained that bucket. leasedPayloadQuery
   * itself carries no platform filter, so this pins that a caller cannot
   * accidentally "fix" the gap by routing tradelocker jobs through it: the
   * MT5 query's inner join must stay strict, and the fix is a query per
   * platform, not a loosened one. */
  const q = leasedPayloadQuery([1]);
  assert.match(q.text, /JOIN mt5_credentials/);
  assert.doesNotMatch(q.text, /tl_account_id|tl_acc_num/);
});

test('the TradeLocker payload carries the credential AND both TradeLocker identifiers', () => {
  const { text, values } = tradelockerLeasedPayloadQuery([7, 8]);
  assert.deepEqual(values[0], [7, 8]);
  for (const col of ['login_email', 'password_ct', 'tl_account_id', 'tl_acc_num', 'is_live_env']) {
    assert.match(text, new RegExp(col), `the tradelocker payload must carry ${col}`);
  }
  assert.match(text, /ingest_token/, 'trades post through the same ingest seam as the EA');
  // UNLIKE the cTrader query, this one INNER JOINs mt5_credentials -- TradeLocker's
  // credential is a password against a server (spec §5 reuses mt5_credentials
  // wholesale), not an OAuth grant at identity grain, so a missing credential must
  // still fail loudly rather than silently matching nothing.
  assert.match(text, /JOIN mt5_credentials c\s+ON c\.account_id = a\.id/);
});

test('the TradeLocker payload carries the backfill cursor, so a killed worker resumes', () => {
  assert.match(tradelockerLeasedPayloadQuery([1]).text, /cursor_at/);
});

test('the TradeLocker payload computes `since` the same way MT5 and cTrader do', () => {
  const text = tradelockerLeasedPayloadQuery([1]).text;
  assert.match(text, /GREATEST/);
  assert.match(text, /'epoch'::timestamptz/);
});

test('is_live_env rides along, and the route is the one that must not coerce it', () => {
  // Ruling B: NULL means "not yet decided" and is how the worker knows to
  // probe demo-then-live. This query just selects the raw column -- the
  // coercion boundary is asserted in the route test.
  assert.match(tradelockerLeasedPayloadQuery([1]).text, /a\.is_live_env/);
});

test('jobs are still split by platform, tradelocker included', () => {
  const jobs = [{ id: 1, platform: 'tradelocker' }, { id: 2, platform: 'mt5' }];
  const split = splitJobsByPlatform(jobs);
  assert.deepEqual(split.tradelocker, [1]);
  assert.deepEqual(split.mt5, [2]);
});
