import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDelta, reconcile } from '../worker/tradelocker/reconcile.js';

const jsonResponse = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  text: async () => JSON.stringify(body),
});

const CONFIG = {
  d: { accountDetailsConfig: { columns: [{ id: 'balance' }, { id: 'openNetPnL' }] } },
};

// ---------------------------------------------------------------------------
// computeDelta: pure arithmetic against fixture numbers (§7.4)
// ---------------------------------------------------------------------------

test('computeDelta subtracts the broker figure from what the job computed', () => {
  assert.equal(computeDelta({ computedPnlSum: 250, pnlCount: 1, brokerBalance: 200 }), 50);
  assert.equal(computeDelta({ computedPnlSum: -30, pnlCount: 2, brokerBalance: -30 }), 0);
});

test('computeDelta rounds to the cent, no binary-float residue', () => {
  // 249.99999999999466-style residue must not leak into a number this gets
  // compared or logged against.
  const delta = computeDelta({ computedPnlSum: 0.1 + 0.2, pnlCount: 1, brokerBalance: 0 });
  assert.equal(delta, 0.3);
  assert.equal(String(delta), '0.3');
});

test('computeDelta is null when the broker figure is unavailable', () => {
  assert.equal(computeDelta({ computedPnlSum: 100, pnlCount: 1, brokerBalance: null }), null);
});

test('computeDelta is null when nothing priced — a zero pnlSum with zero trades is not a real zero', () => {
  assert.equal(computeDelta({ computedPnlSum: 0, pnlCount: 0, brokerBalance: 500 }), null);
});

// ---------------------------------------------------------------------------
// reconcile(): the async wrapper — /trade/accounts/{id}/state, resolved by name
// ---------------------------------------------------------------------------

test('reconcile fetches /state and resolves balance/openNetPnL by NAME, not index', async () => {
  let calledUrl = null;
  const fetchImpl = async (url) => {
    calledUrl = url;
    // accountDetailsData is positional: [balance, openNetPnL]
    return jsonResponse(200, { s: 'ok', d: { accountDetailsData: ['1000.50', '12.25'] } });
  };
  const facts = await reconcile({
    host: 'https://demo.tradelocker.com/backend-api/', token: 't', accNum: 1, accountId: 4242,
    config: CONFIG, computedPnlSum: 1050.50, pnlCount: 3, fetchImpl, log: { info: () => {}, error: () => {} },
  });
  assert.match(calledUrl, /trade\/accounts\/4242\/state$/);
  assert.equal(facts.brokerBalance, 1000.50);
  assert.equal(facts.brokerOpenPnl, 12.25);
  assert.equal(facts.delta, 50);
});

test('reconcile NEVER throws — a failed /state read reports a null delta, not a failed job', async () => {
  const fetchImpl = async () => jsonResponse(500, { error: 'boom' });
  const facts = await reconcile({
    host: 'https://demo.tradelocker.com/backend-api/', token: 't', accNum: 1, accountId: 4242,
    config: CONFIG, computedPnlSum: 100, pnlCount: 1, fetchImpl, log: { info: () => {}, error: () => {} },
  });
  assert.equal(facts.delta, null);
  assert.equal(facts.brokerBalance, null);
});

test('reconcile logs loudly regardless of the delta size — no silent threshold', async () => {
  const logged = [];
  const fetchImpl = async () => jsonResponse(200, { s: 'ok', d: { accountDetailsData: ['0', '0'] } });
  await reconcile({
    host: 'https://demo.tradelocker.com/backend-api/', token: 't', accNum: 1, accountId: 4242,
    config: CONFIG, computedPnlSum: 0.01, pnlCount: 1, fetchImpl,
    log: { info: (facts) => logged.push(facts), error: () => {} },
  });
  assert.equal(logged.length, 1);
  assert.equal(logged[0].accountId, 4242);
});
