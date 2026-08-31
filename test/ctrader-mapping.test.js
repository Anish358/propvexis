import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ctraderConnector as c } from '../src/domain/sync/connectors/ctrader.js';

// --- unit scaling: the 100x trap -------------------------------------------

test('money scales by the message its own moneyDigits, not a constant', () => {
  // Straight from the proto comment: "moneyDigits = 8 must be interpret as
  // business value multiplied by 10^8, then real balance would be
  // 10053099944 / 10^8 = 100.53099944".
  assert.equal(c.scaleMoney(10053099944, 8), 100.53099944);
  assert.equal(c.scaleMoney(-1234, 2), -12.34);
  assert.equal(c.scaleMoney(0, 2), 0);
});

test('a missing moneyDigits defaults to 2, never to 0', () => {
  // Defaulting to 0 reports cents as whole units — a silent 100x overstatement
  // of every P&L number that looks entirely plausible in the UI.
  assert.equal(c.scaleMoney(1234, undefined), 12.34);
  assert.equal(c.scaleMoney(1234, null), 12.34);
});

test('lots divide volume by lotSize — both in cents, so the units cancel', () => {
  // One standard lot of EURUSD: volume 10,000,000 cents = 100,000 units, and
  // lotSize is 10,000,000 cents too. One lot — not 10 million, not 0.01.
  assert.equal(c.toLots(10_000_000, 10_000_000), 1);
  assert.equal(c.toLots(5_000_000, 10_000_000), 0.5);
  assert.equal(c.toLots(1_000_000, 10_000_000), 0.1);
});

test('toLots refuses to divide by a missing lotSize rather than returning Infinity', () => {
  assert.equal(c.toLots(10_000_000, 0), null);
  assert.equal(c.toLots(10_000_000, undefined), null);
});

// --- which deals are journalled --------------------------------------------

test('only deals carrying closePositionDetail are journalled', () => {
  assert.equal(c.isClosingDeal({ dealId: 1 }), false);
  assert.equal(c.isClosingDeal({ dealId: 1, closePositionDetail: { grossProfit: 0 } }), true);
  assert.equal(c.isClosingDeal(null), false);
});

test('cTrader symbol names are normalized for pip math', () => {
  assert.equal(c.normalizeCtraderSymbol('EUR/USD'), 'EURUSD');
  assert.equal(c.normalizeCtraderSymbol('XAUUSD'), 'XAUUSD');
});

// --- the mapping itself -----------------------------------------------------

const CLOSING = {
  dealId: 55501,
  positionId: 9001,
  executionTimestamp: 1_756_000_000_000,
  executionPrice: 1.0925,
  tradeSide: 'SELL',            // a long is CLOSED by a sell — must not be read as direction
  closePositionDetail: {
    entryPrice: 1.09,
    grossProfit: 25000,         // 250.00
    swap: -120,                 // -1.20
    commission: -700,           // -7.00
    pnlConversionFee: 0,
    balance: 5002418,           // 50,024.18
    closedVolume: 10_000_000,   // one lot
    moneyDigits: 2,
  },
};
const OPENING = { dealId: 55499, positionId: 9001, executionTimestamp: 1_755_900_000_000, tradeSide: 'BUY' };

test('a closing deal maps to the ingest payload', () => {
  const t = c.dealToTrade({
    deal: CLOSING, openDeal: OPENING, symbolName: 'EUR/USD',
    lotSize: 10_000_000, bandedLogin: 4_000_314_943_467,
  });
  assert.equal(t.mt5_ticket, 55501);
  assert.equal(t.account_id, 4_000_314_943_467);
  assert.equal(t.symbol, 'EURUSD');
  assert.equal(t.entry_price, 1.09);
  assert.equal(t.exit_price, 1.0925);
  assert.equal(t.volume, 1);
  assert.equal(t.commission, -7);
  assert.equal(t.account_balance, 50024.18);
  assert.equal(t.open_time, new Date(1_755_900_000_000).toISOString());
  assert.equal(t.close_time, new Date(1_756_000_000_000).toISOString());
});

test('P&L is net of swap, commission and conversion fee', () => {
  const t = c.dealToTrade({
    deal: CLOSING, openDeal: OPENING, symbolName: 'EUR/USD',
    lotSize: 10_000_000, bandedLogin: 4_000_000_000_001,
  });
  // 250.00 gross - 1.20 swap - 7.00 commission + 0 fee
  assert.equal(Math.round(t.pnl_money * 100) / 100, 241.8);
});

test('direction comes from the OPENING deal, never the closing one', () => {
  // THE BUG THIS CATCHES: a long is closed by a sell. Reading the closing deal's
  // tradeSide inverts every direction in the journal, and the win rate still
  // looks fine, so nothing surfaces it.
  const long = c.dealToTrade({ deal: CLOSING, openDeal: OPENING, symbolName: 'EUR/USD', lotSize: 1, bandedLogin: 1 });
  assert.equal(long.direction, 'buy', 'a position opened by a BUY is a long');

  const short = c.dealToTrade({
    deal: { ...CLOSING, tradeSide: 'BUY' },
    openDeal: { ...OPENING, tradeSide: 'SELL' },
    symbolName: 'EUR/USD', lotSize: 1, bandedLogin: 1,
  });
  assert.equal(short.direction, 'sell');
});

test('a partial close keeps its own dealId, so it is its own trade', () => {
  // Keying on positionId would make each partial close REWRITE the previous row,
  // showing one trade where the trader took three.
  const a = c.dealToTrade({ deal: CLOSING, openDeal: OPENING, symbolName: 'X', lotSize: 1, bandedLogin: 1 });
  const b = c.dealToTrade({
    deal: { ...CLOSING, dealId: 55502, executionTimestamp: 1_756_000_050_000 },
    openDeal: OPENING, symbolName: 'X', lotSize: 1, bandedLogin: 1,
  });
  assert.equal(a.mt5_ticket, 55501);
  assert.equal(b.mt5_ticket, 55502);
  assert.notEqual(a.mt5_ticket, b.mt5_ticket);
});

test('a deal whose opening half is outside the window still lands', () => {
  // Dropping it would silently lose a real trade; a wrong open time is
  // recoverable by a later reconcile, a missing trade is not.
  const t = c.dealToTrade({ deal: CLOSING, openDeal: undefined, symbolName: 'X', lotSize: 1, bandedLogin: 1 });
  assert.equal(t.open_time, t.close_time);
  assert.equal(t.mt5_ticket, 55501);
});

test('the payload satisfies the ingest schema required fields', () => {
  // The mapping is only correct if /api/trades/ingest will accept it.
  const t = c.dealToTrade({ deal: CLOSING, openDeal: OPENING, symbolName: 'EUR/USD', lotSize: 1, bandedLogin: 1 });
  for (const k of ['mt5_ticket', 'account_id', 'symbol', 'direction', 'open_time',
    'close_time', 'entry_price', 'exit_price']) {
    assert.ok(t[k] !== undefined && t[k] !== null, `${k} is required by ingestSchema`);
  }
  assert.ok(['buy', 'sell'].includes(t.direction));
  assert.equal(typeof t.mt5_ticket, 'number');
  assert.equal(typeof t.account_id, 'number');
});
