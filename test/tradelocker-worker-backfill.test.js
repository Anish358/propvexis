import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildResolver } from '../src/domain/sync/connectors/tradelocker/columns.js';
import {
  ordersToTrades, fetchAccountCurrency, fetchInstrumentsList, fetchInstrumentDetails,
  fetchOrdersHistoryWindow, backfillAccount,
} from '../worker/tradelocker/backfill.js';

const jsonResponse = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  text: async () => JSON.stringify(body),
});

const CONFIG_COLUMNS = [
  { id: 'id' }, { id: 'tradableInstrumentId' }, { id: 'side' }, { id: 'status' },
  { id: 'filledQty' }, { id: 'avgPrice' }, { id: 'positionId' }, { id: 'createdDate' }, { id: 'commission' },
];
const CONFIG = { d: { ordersHistoryConfig: { columns: CONFIG_COLUMNS } } };
const resolver = buildResolver(CONFIG, 'ordersHistory');

// [id, tradableInstrumentId, side, status, filledQty, avgPrice, positionId, createdDate, commission]
const row = (id, instrId, positionId, side, qty, price, ms, commission = '0', status = 'Filled') =>
  ['' + id, '' + instrId, side, status, qty, price, '' + positionId, '' + ms, commission];

// ---------------------------------------------------------------------------
// ordersToTrades: grouping by instrument BEFORE pairing
// ---------------------------------------------------------------------------

test('rows from two different instruments are priced with their OWN instrument, never swapped', () => {
  const rows = [
    row(1, 1, 9001, 'buy', '1', '1.0900', 1_756_000_000_000),
    row(2, 1, 9001, 'sell', '1', '1.0925', 1_756_000_050_000),
    row(3, 2, 9002, 'sell', '1', '1.3000', 1_756_000_000_000),
    row(4, 2, 9002, 'buy', '1', '1.2950', 1_756_000_050_000),
  ];
  const instrumentsById = new Map([
    [1, { name: 'EURUSD', contractSize: 100000, quoteCurrency: 'USD', depositCurrency: 'USD' }],
    [2, { name: 'GBPUSD', contractSize: 100000, quoteCurrency: 'USD', depositCurrency: 'USD' }],
  ]);
  const { trades } = ordersToTrades({ rows, resolver, instrumentsById, bandedLogin: 1 });
  assert.equal(trades.length, 2);
  const bySymbol = Object.fromEntries(trades.map((t) => [t.symbol, t]));
  assert.equal(bySymbol.EURUSD.pnl_money, 250);
  assert.equal(bySymbol.GBPUSD.pnl_money, 500, 'a short that fell 50 pips made money');
});

test('an instrument with no resolvable metadata still yields a trade, priced NULL', () => {
  const rows = [
    row(1, 9, 9001, 'buy', '1', '1.0900', 1_756_000_000_000),
    row(2, 9, 9001, 'sell', '1', '1.0925', 1_756_000_050_000),
  ];
  const { trades } = ordersToTrades({ rows, resolver, instrumentsById: new Map(), bandedLogin: 1 });
  assert.equal(trades.length, 1);
  assert.equal(trades[0].pnl_money, null);
  assert.equal(trades[0].symbol, null);
});

test('pnlSum excludes NULL pnl_money — an abstention is not a zero', () => {
  const rows = [
    // priced trade
    row(1, 1, 9001, 'buy', '1', '1.0900', 1_756_000_000_000),
    row(2, 1, 9001, 'sell', '1', '1.0925', 1_756_000_050_000),
    // unpriceable trade (no instrument metadata)
    row(3, 9, 9002, 'buy', '1', '1.0900', 1_756_000_000_000),
    row(4, 9, 9002, 'sell', '1', '1.0925', 1_756_000_050_000),
  ];
  const instrumentsById = new Map([
    [1, { name: 'EURUSD', contractSize: 100000, quoteCurrency: 'USD', depositCurrency: 'USD' }],
  ]);
  const { pnlSum, pnlCount } = ordersToTrades({ rows, resolver, instrumentsById, bandedLogin: 1 });
  assert.equal(pnlCount, 1);
  assert.equal(pnlSum, 250);
});

test('rows with no tradableInstrumentId are dropped from grouping rather than crashing', () => {
  const rows = [row(1, '', 9001, 'buy', '1', '1.0900', 1_756_000_000_000)];
  const { trades, unpaired } = ordersToTrades({ rows, resolver, instrumentsById: new Map(), bandedLogin: 1 });
  assert.deepEqual(trades, []);
  assert.deepEqual(unpaired, []);
});

// ---------------------------------------------------------------------------
// The individual REST calls
// ---------------------------------------------------------------------------

test('fetchAccountCurrency picks the row matching this accountId out of the whole list', async () => {
  const fetchImpl = async () => jsonResponse(200, {
    s: 'ok', d: [{ id: '111', currency: 'EUR' }, { id: '4242', currency: 'USD' }],
  });
  const currency = await fetchAccountCurrency({
    host: 'https://demo.tradelocker.com/backend-api/', token: 't', accNum: 1, accountId: 4242, fetchImpl,
  });
  assert.equal(currency, 'USD');
});

test('fetchInstrumentsList prefers the TRADE route over INFO', async () => {
  const fetchImpl = async () => jsonResponse(200, {
    s: 'ok',
    d: {
      instruments: [
        { tradableInstrumentId: 1, name: 'EURUSD', routes: [{ id: 5, type: 'INFO' }, { id: 6, type: 'TRADE' }] },
      ],
    },
  });
  const list = await fetchInstrumentsList({
    host: 'https://demo.tradelocker.com/backend-api/', token: 't', accNum: 1, accountId: 4242, fetchImpl,
  });
  assert.deepEqual(list.get(1), { name: 'EURUSD', routeId: 6 });
});

test('fetchInstrumentDetails maps TradeLocker field names onto the connector\'s instrument shape', async () => {
  const fetchImpl = async () => jsonResponse(200, {
    s: 'ok', d: { lotSize: 100000, quotingCurrency: 'USD' },
  });
  const details = await fetchInstrumentDetails({
    host: 'https://demo.tradelocker.com/backend-api/', token: 't', accNum: 1,
    tradableInstrumentId: 1, routeId: 6, fetchImpl,
  });
  assert.deepEqual(details, { contractSize: 100000, quoteCurrency: 'USD' });
});

test('fetchInstrumentDetails never throws — a bad instrument is metadata, not a job failure', async () => {
  const fetchImpl = async () => jsonResponse(500, { error: 'boom' });
  const details = await fetchInstrumentDetails({
    host: 'https://demo.tradelocker.com/backend-api/', token: 't', accNum: 1,
    tradableInstrumentId: 1, routeId: 6, fetchImpl, log: { info: () => {} },
  });
  assert.equal(details, null);
});

test('fetchInstrumentDetails returns null without a request when routeId is unknown', async () => {
  let called = false;
  const fetchImpl = async () => { called = true; return jsonResponse(200, {}); };
  const details = await fetchInstrumentDetails({
    host: 'x', token: 't', accNum: 1, tradableInstrumentId: 1, routeId: null, fetchImpl,
  });
  assert.equal(details, null);
  assert.equal(called, false);
});

test('fetchOrdersHistoryWindow pages on hasMore, re-reading its own boundary', async () => {
  let calls = 0;
  const fetchImpl = async (url) => {
    calls += 1;
    if (calls === 1) {
      assert.match(url, /from=1000&to=2000/);
      return jsonResponse(200, { d: { ordersHistory: [row(1, 1, 9, 'buy', '1', '1.09', 1500)], hasMore: true } });
    }
    assert.match(url, /from=1500&to=2000/, 're-request the SAME boundary, not +1ms');
    return jsonResponse(200, { d: { ordersHistory: [row(2, 1, 9, 'sell', '1', '1.10', 1500)], hasMore: false } });
  };
  const rows = await fetchOrdersHistoryWindow({
    host: 'https://demo.tradelocker.com/backend-api/', token: 't', accNum: 1, accountId: 4242,
    resolver, from: 1000, to: 2000, fetchImpl,
  });
  assert.equal(calls, 2);
  assert.equal(rows.length, 2);
});

test('fetchOrdersHistoryWindow stops rather than spinning when the cursor cannot advance', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse(200, { d: { ordersHistory: [row(1, 1, 9, 'buy', '1', '1.09', 1000)], hasMore: true } });
  };
  const rows = await fetchOrdersHistoryWindow({
    host: 'https://demo.tradelocker.com/backend-api/', token: 't', accNum: 1, accountId: 4242,
    resolver, from: 1000, to: 2000, fetchImpl,
  });
  assert.equal(calls, 1, 'must not re-request a page that cannot advance the cursor');
  assert.equal(rows.length, 1);
});

// ---------------------------------------------------------------------------
// backfillAccount: the full window-walk, fixture-driven end to end
// ---------------------------------------------------------------------------

function routedFetch(routes) {
  return async (url) => {
    for (const [pattern, handler] of routes) {
      if (pattern.test(url)) return handler(url);
    }
    throw new Error(`unhandled fetch: ${url}`);
  };
}

test('backfillAccount posts trades, sums non-null pnl, and stops after two empty windows', async () => {
  const posted = [];
  const api = { ingest: async (token, trades) => { posted.push(...trades); return { ok: true }; } };

  let ordersCalls = 0;
  const fetchImpl = routedFetch([
    [/trade\/accounts$/, () => jsonResponse(200, { s: 'ok', d: [{ id: '4242', currency: 'USD' }] })],
    [/instruments$/, () => jsonResponse(200, {
      s: 'ok',
      d: { instruments: [{ tradableInstrumentId: 1, name: 'EURUSD', routes: [{ id: 1, type: 'TRADE' }] }] },
    })],
    [/trade\/instruments\/1/, () => jsonResponse(200, { s: 'ok', d: { lotSize: 100000, quotingCurrency: 'USD' } })],
    [/ordersHistory/, () => {
      ordersCalls += 1;
      // First window (newest) has trades; every window after is empty.
      if (ordersCalls === 1) {
        return jsonResponse(200, {
          d: {
            ordersHistory: [
              row(1, 1, 9001, 'buy', '1', '1.0900', 1_756_000_000_000),
              row(2, 1, 9001, 'sell', '1', '1.0925', 1_756_000_050_000),
            ],
            hasMore: false,
          },
        });
      }
      return jsonResponse(200, { d: { ordersHistory: [], hasMore: false } });
    }],
  ]);

  const job = { account_id: 1, ingest_token: 'tok', cursor_at: null };
  const result = await backfillAccount({
    host: 'https://demo.tradelocker.com/backend-api/', token: 't', accNum: 1, accountId: 4242,
    resolver, api, job, bandedLogin: 5_000_000_004_242, fetchImpl, log: { info: () => {}, error: () => {} },
  });

  assert.equal(result.posted, 1);
  assert.equal(result.pnlSum, 250);
  assert.equal(result.pnlCount, 1);
  assert.equal(result.depositCurrency, 'USD');
  assert.equal(posted.length, 1);
  assert.equal(posted[0].account_id, 5_000_000_004_242);
  // Two consecutive empty windows must end the walk well short of MAX_WINDOWS.
  assert.ok(ordersCalls < 10, `expected an early stop, got ${ordersCalls} ordersHistory calls`);
});

test('backfillAccount fetches each instrument\'s details at most once per job, across windows', async () => {
  const api = { ingest: async () => ({ ok: true }) };
  let detailsCalls = 0;
  let ordersCalls = 0;
  const fetchImpl = routedFetch([
    [/trade\/accounts$/, () => jsonResponse(200, { s: 'ok', d: [{ id: '4242', currency: 'USD' }] })],
    [/instruments$/, () => jsonResponse(200, {
      s: 'ok',
      d: { instruments: [{ tradableInstrumentId: 1, name: 'EURUSD', routes: [{ id: 1, type: 'TRADE' }] }] },
    })],
    [/trade\/instruments\/1/, () => {
      detailsCalls += 1;
      return jsonResponse(200, { s: 'ok', d: { lotSize: 100000, quotingCurrency: 'USD' } });
    }],
    [/ordersHistory/, () => {
      ordersCalls += 1;
      // The FIRST TWO windows (newest first) both touch instrument 1; every
      // window after that is empty, which ends the walk.
      if (ordersCalls <= 2) {
        return jsonResponse(200, {
          d: {
            ordersHistory: [
              row(ordersCalls * 10 + 1, 1, 9000 + ordersCalls, 'buy', '1', '1.0900', 1_756_000_000_000),
              row(ordersCalls * 10 + 2, 1, 9000 + ordersCalls, 'sell', '1', '1.0925', 1_756_000_050_000),
            ],
            hasMore: false,
          },
        });
      }
      return jsonResponse(200, { d: { ordersHistory: [], hasMore: false } });
    }],
  ]);
  const job = { account_id: 1, ingest_token: 'tok', cursor_at: null };
  const result = await backfillAccount({
    host: 'https://demo.tradelocker.com/backend-api/', token: 't', accNum: 1, accountId: 4242,
    resolver, api, job, bandedLogin: 1, fetchImpl, log: { info: () => {}, error: () => {} },
  });
  assert.equal(ordersCalls, 4, 'two windows with trades, then two empty ones to end the walk');
  assert.equal(result.posted, 2, 'one closing trade per non-empty window');
  assert.equal(detailsCalls, 1, 'instrument details must be cached across the job, not refetched per window');
});
