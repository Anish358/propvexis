import { test } from 'node:test';
import assert from 'node:assert/strict';
import { financeSummary } from '../src/finance.js';

// Pure prop-finance aggregation: earned (payout trader_amount) − spent (fee
// amount) → net, roiPct, and a by-firm breakdown attributed via account firm_id.

const accounts = [
  { mt5_login: 100, firm_id: 'gft', firm_name: 'GoatFundedTrader' },
  { mt5_login: 200, firm_id: 'ftmo', firm_name: 'FTMO' },
  { mt5_login: 300, firm_id: null, firm_name: null }, // custom → "Other"
];
const payouts = [
  { account_id: 100, trader_amount: 800 },
  { account_id: 200, trader_amount: 400 },
];
const fees = [
  { account_id: 100, amount: 200 },  // GFT eval fee
  { account_id: 100, amount: 100 },  // GFT reset
  { account_id: 200, amount: 250 },  // FTMO
  { account_id: 300, amount: 50 },   // custom
];

test('totals: spent, earned, net, roiPct', () => {
  const f = financeSummary({ payouts, fees, accounts });
  assert.equal(f.spent, 600);   // 200+100+250+50
  assert.equal(f.earned, 1200); // 800+400
  assert.equal(f.net, 600);     // 1200-600
  assert.equal(f.roiPct, 100);  // 600/600*100
});

test('roiPct is null when nothing spent', () => {
  const f = financeSummary({ payouts: [{ account_id: 100, trader_amount: 500 }], fees: [], accounts });
  assert.equal(f.spent, 0);
  assert.equal(f.net, 500);
  assert.equal(f.roiPct, null);
});

test('byFirm attributes spend + earnings per firm', () => {
  const f = financeSummary({ payouts, fees, accounts });
  const gft = f.byFirm.find((b) => b.firmId === 'gft');
  assert.equal(gft.spent, 300);
  assert.equal(gft.earned, 800);
  assert.equal(gft.net, 500);
  const ftmo = f.byFirm.find((b) => b.firmId === 'ftmo');
  assert.equal(ftmo.net, 150); // 400-250
});

test('accounts with no firm fall into an "Other" bucket', () => {
  const f = financeSummary({ payouts, fees, accounts });
  const other = f.byFirm.find((b) => b.firmId === null);
  assert.equal(other.firmName, 'Other');
  assert.equal(other.spent, 50);
  assert.equal(other.earned, 0);
  assert.equal(other.roiPct, -100); // net -50 / spent 50
});

test('byFirm sorted by net desc', () => {
  const f = financeSummary({ payouts, fees, accounts });
  const nets = f.byFirm.map((b) => b.net);
  assert.deepEqual(nets, [...nets].sort((a, b) => b - a));
});

test('empty inputs → zeros and null roi', () => {
  const f = financeSummary({ payouts: [], fees: [], accounts: [] });
  assert.deepEqual({ spent: f.spent, earned: f.earned, net: f.net, roiPct: f.roiPct }, { spent: 0, earned: 0, net: 0, roiPct: null });
  assert.deepEqual(f.byFirm, []);
});
