import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildResolver } from '../src/domain/sync/connectors/tradelocker/columns.js';
import { pairOrders } from '../src/domain/sync/connectors/tradelocker/pairing.js';

const CONFIG = { d: { ordersHistoryConfig: { columns: [
  { id: 'id' }, { id: 'tradableInstrumentId' }, { id: 'qty' }, { id: 'side' },
  { id: 'status' }, { id: 'filledQty' }, { id: 'avgPrice' }, { id: 'commission' },
  { id: 'positionId' }, { id: 'createdDate' }, { id: 'lastModified' },
] } } };

const resolver = buildResolver(CONFIG, 'ordersHistory');
const USD = { symbol: 'EURUSD', contractSize: 100000, quoteCurrency: 'USD', depositCurrency: 'USD' };

const order = (id, positionId, side, qty, price, ms, commission = '0', status = 'Filled') =>
  ['' + id, '278', qty, side, status, qty, price, commission, '' + positionId, '' + ms, '' + ms];

const pair = (rows, instrument = USD, bandedLogin = 1) =>
  pairOrders({ rows, resolver, instrument, bandedLogin });

test('an open and a close on one positionId become one trade', () => {
  const { trades } = pair(
    [order(1, 9001, 'buy', '1', '1.0900', 1_756_000_000_000),
     order(2, 9001, 'sell', '1', '1.0925', 1_756_000_050_000, '-0.7')],
    USD, 5_000_000_004_242,
  );
  assert.equal(trades.length, 1);
  assert.equal(trades[0].mt5_ticket, 2, 'keyed on the CLOSING order');
  assert.equal(trades[0].direction, 'buy', 'direction comes from the OPENING order');
  assert.equal(trades[0].entry_price, 1.09);
  assert.equal(trades[0].exit_price, 1.0925);
  assert.equal(trades[0].account_id, 5_000_000_004_242);
  assert.equal(trades[0].open_time, new Date(1_756_000_000_000).toISOString());
  assert.equal(trades[0].close_time, new Date(1_756_000_050_000).toISOString());
});

test('direction comes from the opener, so a short is not recorded as a long', () => {
  // The closing fill's side is the OPPOSITE of the trade the trader took. Reading
  // it here inverts every direction in the journal and the win rate still looks
  // fine — the same trap the cTrader connector documents for tradeSide.
  const { trades } = pair([
    order(1, 9002, 'sell', '1', '1.0925', 1_756_000_000_000),
    order(2, 9002, 'buy', '1', '1.0900', 1_756_000_050_000),
  ]);
  assert.equal(trades[0].direction, 'sell');
  assert.equal(trades[0].pnl_money, 250, 'a short that fell 25 pips MADE money');
});

test('a partial close is its own trade, keyed on its own closing order', () => {
  // Keying on positionId would make each partial close rewrite the previous row,
  // showing one trade where the trader took two.
  const { trades } = pair([
    order(1, 9001, 'buy', '2', '1.0900', 1_756_000_000_000),
    order(2, 9001, 'sell', '1', '1.0925', 1_756_000_050_000),
    order(3, 9001, 'sell', '1', '1.0950', 1_756_000_090_000),
  ]);
  assert.equal(trades.length, 2);
  assert.deepEqual(trades.map((t) => t.mt5_ticket), [2, 3]);
  assert.deepEqual(trades.map((t) => t.volume), [1, 1], 'each row carries only what IT closed');
});

test('a position still open produces no trade, and is reported as unpaired', () => {
  // Silently dropping it would be indistinguishable from a bug; the caller needs
  // to know the difference between "nothing closed" and "we lost something".
  const { trades, unpaired } = pair([order(1, 9001, 'buy', '1', '1.0900', 1_756_000_000_000)]);
  assert.equal(trades.length, 0);
  assert.deepEqual(unpaired, [9001]);
});

test('a close whose open is outside the window is reported, not guessed', () => {
  // The opening order can sit in an earlier page. Inventing an entry price would
  // write a plausible wrong trade; reporting it lets the caller widen the window.
  const { trades, unpaired } = pair([order(2, 9001, 'sell', '1', '1.0925', 1_756_000_050_000)]);
  assert.equal(trades.length, 0);
  assert.deepEqual(unpaired, [9001]);
});

test('P&L is NULL when the instrument cannot price it, never approximated', () => {
  // A missing number surfaces in the UI. A plausible wrong one does not, and
  // fixed_r and every prop rule-breach decision derive from this field.
  const { trades } = pair(
    [order(1, 9001, 'buy', '1', '1.0900', 1_756_000_000_000),
     order(2, 9001, 'sell', '1', '1.0925', 1_756_000_050_000)],
    { symbol: 'USDJPY', contractSize: null, quoteCurrency: 'JPY', depositCurrency: 'USD' },
  );
  assert.equal(trades[0].pnl_money, null);
  assert.equal(trades[0].exit_price, 1.0925, 'the trade still lands — only the money is unknown');
});

test('P&L is NULL when the quote currency is not the deposit currency', () => {
  // An unconverted number is not "close enough": on USDJPY it is wrong by ~150x
  // and looks entirely plausible. FX conversion is deliberately not in this
  // module — a converted-in-the-wrong-direction rate is the same failure again.
  const { trades } = pair(
    [order(1, 9001, 'buy', '1', '150.00', 1_756_000_000_000),
     order(2, 9001, 'sell', '1', '150.50', 1_756_000_050_000)],
    { symbol: 'USDJPY', contractSize: 100000, quoteCurrency: 'JPY', depositCurrency: 'USD' },
  );
  assert.equal(trades[0].pnl_money, null);
});

test('commission is NET of both legs, apportioned across partial closes', () => {
  // The opening commission is charged once for the whole position. Attaching it
  // whole to every partial close would double-count it; dropping it would
  // understate the cost of every trade in the journal.
  const { trades } = pair([
    order(1, 9001, 'buy', '2', '1.0900', 1_756_000_000_000, '-1.0'),
    order(2, 9001, 'sell', '1', '1.0925', 1_756_000_050_000, '-0.5'),
    order(3, 9001, 'sell', '1', '1.0950', 1_756_000_090_000, '-0.5'),
  ]);
  assert.deepEqual(trades.map((t) => t.commission), [-1, -1]);
  assert.equal(trades[0].pnl_money, 249, '250 gross less 1.00 of commission');
});

test('an unknown commission does not become a free trade', () => {
  // '' is null, not zero. Reporting pnl as though commission were zero is a
  // silent money error; the P&L is unknown, so it is written unknown.
  const { trades } = pair([
    order(1, 9001, 'buy', '1', '1.0900', 1_756_000_000_000, ''),
    order(2, 9001, 'sell', '1', '1.0925', 1_756_000_050_000, ''),
  ]);
  assert.equal(trades[0].commission, null);
  assert.equal(trades[0].pnl_money, null);
});

test('only Filled orders are paired — a cancelled order is not a trade', () => {
  const { trades, unpaired } = pair([
    order(1, 9001, 'buy', '1', '1.0900', 1_756_000_000_000),
    order(2, 9001, 'sell', '1', '1.0925', 1_756_000_050_000, '0', 'Cancelled'),
  ]);
  assert.equal(trades.length, 0);
  assert.deepEqual(unpaired, [9001], 'the position is still open as far as we can tell');
});

test('rows arriving newest-first still pair correctly', () => {
  // ordersHistory is walked newest-first by the backfill, so the closing order
  // arrives BEFORE its opener. Trusting array order rather than createdDate would
  // make the close the "opener" and invert the trade.
  const { trades } = pair([
    order(2, 9001, 'sell', '1', '1.0925', 1_756_000_050_000),
    order(1, 9001, 'buy', '1', '1.0900', 1_756_000_000_000),
  ]);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].direction, 'buy');
  assert.equal(trades[0].mt5_ticket, 2);
});

test('several positions in one window are paired independently', () => {
  const { trades, unpaired } = pair([
    order(1, 9001, 'buy', '1', '1.0900', 1_756_000_000_000),
    order(2, 9001, 'sell', '1', '1.0925', 1_756_000_050_000),
    order(3, 9002, 'sell', '1', '1.3000', 1_756_000_060_000),
  ]);
  assert.deepEqual(trades.map((t) => t.mt5_ticket), [2]);
  assert.deepEqual(unpaired, [9002]);
});

test('a row with no positionId is reported rather than grouped under null', () => {
  // Grouping every id-less row together would pair one instrument's fill against
  // another's and produce a trade that never happened.
  const rows = [order(1, 9001, 'buy', '1', '1.0900', 1_756_000_000_000)];
  rows.push(order(2, '', 'sell', '1', '1.0925', 1_756_000_050_000));
  const { trades, malformed } = pair(rows);
  assert.equal(trades.length, 0);
  assert.deepEqual(malformed, [2]);
});

test('pairing never mutates the rows it was given', () => {
  const rows = [
    order(1, 9001, 'buy', '1', '1.0900', 1_756_000_000_000),
    order(2, 9001, 'sell', '1', '1.0925', 1_756_000_050_000),
  ];
  const before = JSON.stringify(rows);
  pair(rows);
  assert.equal(JSON.stringify(rows), before);
});

test('POLICY PIN: pairing has no way to place an order', () => {
  // We hold a TRADE-CAPABLE credential (spec §3 option (a)). Being unable to
  // trade must be structural, not a promise.
  const source = JSON.stringify(Object.keys({ pairOrders }));
  for (const forbidden of ['placeOrder', 'closePosition', 'modifyOrder']) {
    assert.ok(!source.includes(forbidden));
  }
});

test('P&L carries no floating-point residue into the journal', () => {
  // (1.0925 - 1.09) * 100000 is 249.99999999999466 in binary floating point.
  // Stored raw and summed across a thousand trades, that residue reads as real
  // drift when the worker reconciles against /trade/accounts/{id}/state.
  const { trades } = pair([
    order(1, 9001, 'buy', '1', '1.0900', 1_756_000_000_000),
    order(2, 9001, 'sell', '1', '1.0925', 1_756_000_050_000),
  ]);
  assert.equal(trades[0].pnl_money, 250);
  assert.equal(String(trades[0].pnl_money), '250');
});
