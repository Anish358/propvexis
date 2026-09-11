import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { authenticate, runJob } from '../worker/tradelocker/index.js';
import { repoRoot } from '../src/platform/paths.js';

const jsonResponse = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  text: async () => JSON.stringify(body),
});

const job = (overrides = {}) => ({
  job_id: 1, account_id: 10, email: 'a@b.com', server: 'S', password: 'pw',
  ingest_token: 'ing', tl_account_id: null, tl_acc_num: null, is_live_env: null,
  cursor_at: null, reason: 'first_sync', ...overrides,
});

// ---------------------------------------------------------------------------
// authenticate(): Ruling B
// ---------------------------------------------------------------------------

test('a known host (is_live_env decided) authenticates ONCE, on that host, never probing', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return jsonResponse(200, { accessToken: 'a', refreshToken: 'r' });
  };
  const result = await authenticate(job({ is_live_env: true }), { fetchImpl });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^https:\/\/live\.tradelocker\.com/);
  assert.equal(result.isLive, true);
});

test('is_live_env: false also authenticates once, on demo, without probing', async () => {
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); return jsonResponse(200, { accessToken: 'a', refreshToken: 'r' }); };
  const result = await authenticate(job({ is_live_env: false }), { fetchImpl });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^https:\/\/demo\.tradelocker\.com/);
  assert.equal(result.isLive, false);
});

test('RULING B: an unknown host tries demo first, then live once on a 401', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (/^https:\/\/demo/.test(url)) return jsonResponse(401, { error: 'wrong host' });
    return jsonResponse(200, { accessToken: 'a', refreshToken: 'r' });
  };
  const result = await authenticate(job({ is_live_env: null }), { fetchImpl });
  assert.equal(calls.length, 2, 'exactly one extra request, this once');
  assert.match(calls[0], /^https:\/\/demo/);
  assert.match(calls[1], /^https:\/\/live/);
  assert.equal(result.isLive, true);
});

test('RULING B: when demo succeeds outright, live is never tried', async () => {
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); return jsonResponse(200, { accessToken: 'a', refreshToken: 'r' }); };
  const result = await authenticate(job({ is_live_env: null }), { fetchImpl });
  assert.equal(calls.length, 1);
  assert.equal(result.isLive, false);
});

test('a non-401 failure on the demo probe is NOT swallowed into a live retry', async () => {
  const fetchImpl = async () => jsonResponse(500, { error: 'broker down' });
  await assert.rejects(authenticate(job({ is_live_env: null }), { fetchImpl }), (err) => {
    assert.equal(err.status, 500);
    return true;
  });
});

// ---------------------------------------------------------------------------
// runJob(): end-to-end orchestration against a fully fixture-driven fetch
// ---------------------------------------------------------------------------

const CONFIG = {
  s: 'ok',
  d: {
    ordersHistoryConfig: {
      columns: [
        { id: 'id' }, { id: 'tradableInstrumentId' }, { id: 'side' }, { id: 'status' },
        { id: 'filledQty' }, { id: 'avgPrice' }, { id: 'positionId' }, { id: 'createdDate' }, { id: 'commission' },
      ],
    },
    accountDetailsConfig: { columns: [{ id: 'balance' }, { id: 'openNetPnL' }] },
  },
};

const orderRow = (id, positionId, side, ms, commission = '0') =>
  ['' + id, '1', side, 'Filled', '1', '1.0900', '' + positionId, '' + ms, commission];

function routedFetch(routes) {
  return async (url, opts) => {
    for (const [pattern, handler] of routes) {
      if (pattern.test(url)) return handler(url, opts);
    }
    throw new Error(`unhandled fetch: ${url}`);
  };
}

test('runJob discovers, backfills, reconciles and reports — first sync, unknown host', async () => {
  const reported = [];
  const api = {
    ingest: async () => ({ ok: true }),
    report: async (jobId, body) => { reported.push({ jobId, ...body }); },
  };
  let ordersCalls = 0;
  const fetchImpl = routedFetch([
    [/auth\/jwt\/token$/, (url) => (/^https:\/\/demo/.test(url)
      ? jsonResponse(401, { error: 'wrong host' })
      : jsonResponse(200, { accessToken: 'tok', refreshToken: 'ref' }))],
    [/auth\/jwt\/all-accounts$/, () => jsonResponse(200, { accounts: [{ id: '4242', accNum: '1' }] })],
    [/trade\/config$/, () => jsonResponse(200, CONFIG)],
    [/trade\/accounts$/, () => jsonResponse(200, { s: 'ok', d: [{ id: '4242', currency: 'USD' }] })],
    [/instruments$/, () => jsonResponse(200, {
      s: 'ok', d: { instruments: [{ tradableInstrumentId: 1, name: 'EURUSD', routes: [{ id: 1, type: 'TRADE' }] }] },
    })],
    [/trade\/instruments\/1/, () => jsonResponse(200, { s: 'ok', d: { lotSize: 100000, quotingCurrency: 'USD' } })],
    [/state$/, () => jsonResponse(200, { s: 'ok', d: { accountDetailsData: ['250', '0'] } })],
    [/ordersHistory/, () => {
      ordersCalls += 1;
      if (ordersCalls === 1) {
        return jsonResponse(200, {
          d: { ordersHistory: [orderRow(1, 9001, 'buy', 1_756_000_000_000), orderRow(2, 9001, 'sell', 1_756_000_050_000)], hasMore: false },
        });
      }
      return jsonResponse(200, { d: { ordersHistory: [], hasMore: false } });
    }],
  ]);

  await runJob(job(), { api, log: { info: () => {}, error: () => {} }, fetchImpl });

  assert.equal(reported.length, 1);
  const result = reported[0];
  assert.equal(result.ok, true);
  assert.equal(result.tl_account_id, 4242);
  assert.equal(result.tl_acc_num, 1);
  assert.equal(result.is_live_env, true, 'demo 401d, live succeeded — this account lives on live');
  assert.equal(result.stats.posted, 1);
  assert.ok(!('read_only' in result), 'TradeLocker must never send read_only');
});

test('runJob skips discovery when tl_account_id is already known', async () => {
  const reported = [];
  const api = { ingest: async () => ({ ok: true }), report: async (jobId, body) => { reported.push(body); } };
  let allAccountsCalls = 0;
  const fetchImpl = routedFetch([
    [/auth\/jwt\/token$/, () => jsonResponse(200, { accessToken: 'tok', refreshToken: 'ref' })],
    [/auth\/jwt\/all-accounts$/, () => { allAccountsCalls += 1; return jsonResponse(200, { accounts: [{ id: '4242', accNum: '1' }] }); }],
    [/trade\/config$/, () => jsonResponse(200, CONFIG)],
    [/trade\/accounts$/, () => jsonResponse(200, { s: 'ok', d: [{ id: '4242', currency: 'USD' }] })],
    [/instruments$/, () => jsonResponse(200, { s: 'ok', d: { instruments: [] } })],
    [/state$/, () => jsonResponse(200, { s: 'ok', d: { accountDetailsData: ['0', '0'] } })],
    [/ordersHistory/, () => jsonResponse(200, { d: { ordersHistory: [], hasMore: false } })],
  ]);

  await runJob(job({ is_live_env: false, tl_account_id: 4242, tl_acc_num: 1 }), {
    api, log: { info: () => {}, error: () => {} }, fetchImpl,
  });
  assert.equal(allAccountsCalls, 0, 'discovery must not run again once tl_account_id is known');
  assert.equal(reported[0].tl_account_id, 4242, 'the known id is still reported back (idempotent write)');
});

test('SOURCE PIN: runJob never sends read_only, the key that means something else on MT5', () => {
  const src = readFileSync(path.join(repoRoot, 'worker/tradelocker/index.js'), 'utf8');
  assert.doesNotMatch(src, /read_only\s*:/);
});
