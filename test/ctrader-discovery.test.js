import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discoverAccounts, SCOPE_VIEW } from '../worker/ctrader/discover.js';
import { upsertDiscoveredQuery } from '../src/domain/sync/ctraderIdentities.js';

const res = (over = {}) => ({
  permissionScope: SCOPE_VIEW,
  ctidTraderAccount: [{
    ctidTraderAccountId: 314943467, isLive: false, traderLogin: 8675309,
    brokerTitleShort: 'IC Markets', lastClosingDealTimestamp: 1_756_000_000_000,
  }],
  ...over,
});
const conn = (over) => ({ request: async () => res(over) });

test('THE WORKER EMITS THE KEYS THE INSERT ACTUALLY READS', async () => {
  /* THE BUG THIS CATCHES. upsertDiscoveredQuery reads camelCase off the object it
   * is handed — a.ctidTraderAccountId, a.traderLogin, a.isLive. The worker was
   * emitting snake_case, so every field resolved to undefined: the NOT NULL
   * primary key column took a null and the discovery POST 500'd. Discovery would
   * simply never have populated the picker, and the wizard would have sat on
   * "Reading your cTrader accounts…" until it timed out.
   *
   * Two modules, one JSON contract, and no type system between them — so the
   * contract is asserted by running the real producer into the real consumer. */
  const { accounts } = await discoverAccounts({ conn: conn(), accessToken: 't' });
  const q = upsertDiscoveredQuery(5, accounts[0]);

  assert.equal(q.values[0], 5, 'identity');
  assert.equal(q.values[1], 314943467, 'ctidTraderAccountId must not be undefined');
  assert.equal(q.values[2], 8675309, 'traderLogin');
  assert.equal(q.values[3], false, 'isLive');
  assert.equal(q.values[4], 'IC Markets', 'brokerName');
  for (const v of q.values) assert.notEqual(v, undefined, 'no value may be undefined');
});

test('a SCOPE_TRADE grant is refused, not stored', async () => {
  /* The OAuth module has a policy test asserting we never REQUEST the trading
   * scope. That proves what we asked for. permissionScope is what Spotware
   * actually GRANTED, and this is the first moment the two can be compared — a
   * trade-capable grant on a funded prop account is exactly what this connector's
   * read-only promise exists to prevent. */
  await assert.rejects(
    discoverAccounts({ conn: conn({ permissionScope: 1 }), accessToken: 't' }),
    /SCOPE_TRADE|view-only/i,
  );
});

test('a grant with no scope stated is accepted rather than blocked', () => {
  // Absent is not the same as SCOPE_TRADE. Refusing an unstated scope would break
  // every connection if Spotware stopped sending the optional field.
  return discoverAccounts({ conn: conn({ permissionScope: undefined }), accessToken: 't' })
    .then((r) => assert.equal(r.accounts.length, 1));
});

test('is_live is a real boolean, because it picks the socket', async () => {
  // Landmine 10.7: demo and live are disjoint endpoints, and an account
  // authorized on the wrong one fails as a permissions error. A missing isLive
  // must mean demo, never undefined.
  const { accounts } = await discoverAccounts({
    conn: conn({ ctidTraderAccount: [{ ctidTraderAccountId: 1 }] }), accessToken: 't',
  });
  assert.equal(accounts[0].isLive, false);
  assert.equal(typeof accounts[0].isLive, 'boolean');
});
