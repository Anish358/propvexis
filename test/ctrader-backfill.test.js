import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dealsToTrades, fetchWindow } from '../worker/ctrader/backfill.js';
import { HistoricalThrottle } from '../worker/ctrader/throttle.js';

const symbols = new Map([[1, { symbolName: 'EUR/USD', lotSize: 10_000_000 }]]);
const deal = (id, positionId, side, ms, extra = {}) => ({
  dealId: id, positionId, symbolId: 1, tradeSide: side,
  executionTimestamp: ms, executionPrice: 1.09, volume: 10_000_000,
  filledVolume: 10_000_000, ...extra,
});
const closing = (id, positionId, side, ms, detail = {}) => deal(id, positionId, side, ms, {
  closePositionDetail: {
    entryPrice: 1.09, closedVolume: 10_000_000, grossProfit: 2500, swap: 0,
    commission: -70, pnlConversionFee: 0, balance: 1_002_430, moneyDigits: 2, ...detail,
  },
});

test('one row per CLOSING deal, keyed on dealId', () => {
  /* A partial close emits several closing deals against ONE positionId. Keying on
   * the position would make each one rewrite the last, showing one trade where
   * the trader took three. */
  const trades = dealsToTrades({
    deals: [deal(1, 9, 'BUY', 1000), closing(2, 9, 'SELL', 2000), closing(3, 9, 'SELL', 3000)],
    symbols,
    bandedLogin: 4_000_000_000_001,
  });
  assert.equal(trades.length, 2);
  assert.deepEqual(trades.map((t) => t.mt5_ticket), [2, 3]);
  assert.equal(trades[0].account_id, 4_000_000_000_001);
});

test('an opening deal alone produces no trade', () => {
  const trades = dealsToTrades({ deals: [deal(1, 9, 'BUY', 1000)], symbols, bandedLogin: 1 });
  assert.deepEqual(trades, []);
});

test('DIRECTION COMES FROM THE OPENING DEAL, not the closing one', () => {
  /* A long is closed by a SELL. Reading the closing deal's side would invert
   * every direction in the journal — and the win rate would still look fine, so
   * nothing about the UI would look wrong. */
  const trades = dealsToTrades({
    deals: [deal(1, 9, 'BUY', 1000), closing(2, 9, 'SELL', 2000)],
    symbols, bandedLogin: 1,
  });
  assert.equal(trades[0].direction, 'buy');
});

test('deals are ordered by execution time, not by the order they were fetched', () => {
  // Windows are walked NEWEST FIRST, so within a job the closer can be seen
  // before its opener. Trusting arrival order would leave the opener unknown and
  // invert the trade.
  const trades = dealsToTrades({
    deals: [closing(2, 9, 'SELL', 2000), deal(1, 9, 'BUY', 1000)],
    symbols, bandedLogin: 1,
  });
  assert.equal(trades[0].direction, 'buy');
});

test('money scales by the deal message\'s OWN moneyDigits', () => {
  /* THE 100x TRAP. Every monetary int64 scales by that message's own moneyDigits
   * — not a constant, not inherited. grossProfit 2500 at moneyDigits 2 is $25.00.
   * Reading it as a whole number is a silent 100x on every trade in the journal. */
  const [t] = dealsToTrades({
    deals: [deal(1, 9, 'BUY', 1000), closing(2, 9, 'SELL', 2000)],
    symbols, bandedLogin: 1,
  });
  // 2500/100 gross + 0 swap + (-70/100) commission + 0 fee
  assert.equal(t.pnl_money, 25 - 0.7);
  assert.equal(t.commission, -0.7);
  assert.equal(t.account_balance, 10_024.3);
});

test('a different moneyDigits on the same field scales differently', () => {
  const [t] = dealsToTrades({
    deals: [deal(1, 9, 'BUY', 1000), closing(2, 9, 'SELL', 2000, { grossProfit: 2500, moneyDigits: 3 })],
    symbols, bandedLogin: 1,
  });
  assert.equal(t.pnl_money, 2.5 - 0.07);
});

test('volume is lots, and both inputs are in cents so they cancel', () => {
  // volume and lotSize are BOTH in cents. A factor of 100 written in here is the
  // most tempting way to get position size silently wrong.
  const [t] = dealsToTrades({
    deals: [deal(1, 9, 'BUY', 1000), closing(2, 9, 'SELL', 2000)],
    symbols, bandedLogin: 1,
  });
  assert.equal(t.volume, 1);
});

test('the symbol name is normalised for the journal', () => {
  const [t] = dealsToTrades({
    deals: [deal(1, 9, 'BUY', 1000), closing(2, 9, 'SELL', 2000)],
    symbols, bandedLogin: 1,
  });
  assert.equal(t.symbol, 'EURUSD', 'cTrader writes EUR/USD; the journal uses EURUSD');
});

test('paging stops rather than spinning when the cursor cannot advance', async () => {
  /* hasMore stays true while every deal in the page shares one millisecond, so
   * the cursor cannot move. Without this guard the worker requests the same page
   * forever at 5/s, holding its lease and starving every other account on the
   * socket. */
  let calls = 0;
  const conn = {
    request: async () => {
      calls += 1;
      return { deal: [{ executionTimestamp: 1000, dealId: 1 }], hasMore: true };
    },
  };
  const deals = await fetchWindow({
    conn, ctid: 1, from: 1000, to: 2000,
    throttle: new HistoricalThrottle({ limitPerSecond: 1000, now: () => 0 }),
  });
  assert.equal(calls, 1, 'must not re-request a page that cannot advance the cursor');
  assert.equal(deals.length, 1);
});
