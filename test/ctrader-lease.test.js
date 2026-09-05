import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  leasedPayloadQuery, ctraderLeasedPayloadQuery, splitJobsByPlatform,
} from '../src/domain/sync/queue.js';

test('THE SILENT SPIN: the MT5 payload query cannot serve a cTrader job', () => {
  /* THE BUG THIS PINS. leasedPayloadQuery INNER JOINs mt5_credentials. A cTrader
   * account has no row there — its credential is an OAuth token pair on
   * ctrader_identities, at cTID grain — so the join matches nothing and the query
   * returns NO ROW for a cTrader job.
   *
   * Nothing errors. The job is leased, the worker is handed nothing, therefore
   * reports nothing, therefore the lease expires, therefore reclaimExpired puts
   * it back — forever. The account shows "Syncing now" permanently and no log
   * line anywhere says why. credentials.js:102 documents this exact failure for
   * the missing-credential case; a whole PLATFORM falling into it is the same
   * bug with a bigger blast radius.
   *
   * The fix is not to loosen that join — an MT5 job with no credential must still
   * fail loudly — but to route each platform to the query that can serve it. */
  const mt5 = leasedPayloadQuery([1]);
  assert.match(mt5.text, /JOIN mt5_credentials/,
    'the MT5 query must keep its inner join — a missing MT5 credential is a real error');
  assert.doesNotMatch(mt5.text, /ctrader_identities/,
    'the MT5 query must not grow cTrader columns; the platforms get their own queries');
});

test('the cTrader payload carries a token and an account, never a password', () => {
  const { text, values } = ctraderLeasedPayloadQuery([7, 8]);
  assert.deepEqual(values[0], [7, 8]);
  // What the worker needs to open a socket and authorize ONE account.
  for (const col of ['access_token_ct', 'refresh_token_ct', 'ctid_trader_account_id', 'is_live_env']) {
    assert.match(text, new RegExp(col), `the cTrader payload must carry ${col}`);
  }
  assert.match(text, /ingest_token/, 'trades post through the same ingest seam as the EA');
  assert.doesNotMatch(text, /password_ct/, 'cTrader has no password — asking for one is a category error');
  assert.match(text, /JOIN ctrader_identities/);
});

test('the cTrader payload carries the backfill cursor, so a killed worker resumes', () => {
  // Migration 0029 added sync_jobs.cursor_at for exactly this. Without it in the
  // payload a worker killed mid-backfill restarts from now and re-walks four
  // years of history to arrive back where it already was.
  assert.match(ctraderLeasedPayloadQuery([1]).text, /cursor_at/);
});

test('the cTrader payload computes `since` the same way MT5 does', () => {
  // An account with no trades collapses to epoch, which is what makes a first
  // sync mean "everything" without a separate code path. cTrader is continuity,
  // not a new concept.
  const text = ctraderLeasedPayloadQuery([1]).text;
  assert.match(text, /GREATEST/);
  assert.match(text, /'epoch'::timestamptz/);
});

test('is_live_env decides the socket, and it is READ not guessed', () => {
  /* Landmine 10.7: demo and live are disjoint endpoints. An account authorized on
   * the wrong socket fails in a way that reads as a permissions problem, not as a
   * routing mistake. 0029 stores is_live_env at discovery so this is decided once
   * and never recomputed. */
  assert.match(ctraderLeasedPayloadQuery([1]).text, /a\.is_live_env/);
});

test('jobs are split by platform so each gets the query that can serve it', () => {
  const jobs = [
    { id: 1, platform: 'mt5' }, { id: 2, platform: 'ctrader' },
    { id: 3, platform: 'mt5' }, { id: 4, platform: 'tradelocker' },
  ];
  const split = splitJobsByPlatform(jobs);
  assert.deepEqual(split.mt5, [1, 3]);
  assert.deepEqual(split.ctrader, [2]);
  assert.deepEqual(split.tradelocker, [4]);
});

test('a job whose platform is absent or unknown is not silently dropped', () => {
  // Dropping it would recreate the exact silent spin this file exists to stop.
  const split = splitJobsByPlatform([{ id: 9 }, { id: 10, platform: 'nonsense' }]);
  assert.deepEqual(split.unknown, [9, 10]);
});

test('a platform with credential fields still REQUIRES a credential for Auto Sync', async () => {
  /* THE REGRESSION THIS CATCHES. Making the credential requirement
   * registry-driven for cTrader's sake is one typo away from disabling it for
   * MT5 too — and an MT5 account provisioned with no credential is precisely the
   * silent-spin job this file exists to prevent. Both directions are asserted so
   * the rule cannot be loosened by accident. */
  const { validateProvision } = await import('../src/domain/accounts/provision.js');
  const base = {
    capital_kind: 'live', label: 'X', currency: 'USD', start_balance: 1000,
    import_method: 'auto_sync', kind: 'synced', provision_key: 'k1',
  };
  const noCred = validateProvision({ ...base, platform: 'mt5' });
  assert.equal(noCred.ok, false);
  assert.match(noCred.error, /credential/i, 'MT5 must still demand a credential');

  const withCred = validateProvision({
    ...base, platform: 'mt5', credential: { server: 'S', login: 1, password: 'p' },
  });
  assert.equal(withCred.ok, true);
});
