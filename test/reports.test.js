import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCsv, reportCsvRows } from '../src/domain/analytics/reports.js';
import { canUseReports } from '../src/domain/billing/plans.js';

// --- Gating (Pro+). Fail-closed on unknown/missing plan. ---
test('canUseReports: Pro and Premium only; free/unknown fail-closed', () => {
  assert.equal(canUseReports('pro'), true);
  assert.equal(canUseReports('premium'), true);
  assert.equal(canUseReports('free'), false);
  assert.equal(canUseReports('nonsense'), false);
  assert.equal(canUseReports(undefined), false);
});

// --- CSV escaping (RFC-4180-ish). ---
test('toCsv: quotes values with comma/quote/newline, doubles inner quotes', () => {
  const csv = toCsv([
    ['a', 'b,c', 'd"e', 'f\ng'],
    ['1', '', null, 2],
  ]);
  const [row1, row2] = csv.split('\r\n');
  assert.equal(row1, 'a,"b,c","d""e","f\ng"');
  assert.equal(row2, '1,,,2'); // null/undefined -> empty
});

// --- Report → CSV rows: sections present, totals & prop summary correct. ---
const fixtureReport = () => ({
  meta: { unit: 'R', year: 2026, god: true },
  stats: {
    headline: { unit: 'R', totalReturn: 12.5, strikeRate: 55, trades: 20, wins: 11, losses: 8,
      breakeven: 1, avgWin: 2, avgLoss: -1, profitFactor: 2.75, expectancy: 0.63, winStreak: 4, lossStreak: 2 },
    bySetup: [{ key: 'Breakout', trades: 10, wins: 6, losses: 4, breakeven: 0, sr: 60, r: 8 }],
    byInstrument: [{ key: 'XAUUSD', trades: 20, wins: 11, losses: 8, breakeven: 1, sr: 55, r: 12.5 }],
  },
  prop: {
    god: true,
    accounts: [
      { account_id: 314, label: 'GFT', phase: 'funded', currentEquity: 52000, health: { score: 82 },
        maxDd: { roomLeft: 2500 }, dailyDd: { roomLeft: 1000 }, profitTarget: null,
        tradingDays: { completed: 3, required: 5 }, breach: { breached: false, reason: null } },
      { account_id: 999, label: 'Manual', challenge: null }, // no challenge -> excluded from prop rows
    ],
  },
  payouts: {
    rows: [
      { id: 1, payout_date: '2026-06-01', gross_amount: 1000, split_pct: 80, trader_amount: 800, source: 'ea', note: 'first' },
      { id: 2, payout_date: '2026-05-01', gross_amount: 500, split_pct: 80, trader_amount: 400, source: 'manual', note: null },
    ],
    grossTotal: 1500, traderTotal: 1200, count: 2,
  },
});

test('reportCsvRows: includes performance, breakdowns, prop status, payouts', () => {
  const rows = reportCsvRows(fixtureReport());
  const csv = toCsv(rows);
  // Section headers present
  for (const h of ['Performance', 'By setup', 'By instrument', 'Prop status', 'Payouts']) {
    assert.ok(csv.includes(h), `missing section: ${h}`);
  }
  // Headline metric row
  assert.ok(rows.some((r) => r[0] === 'totalReturn' && r[1] === 12.5));
  // Payouts totals encoded in the Payouts header row
  const payHeader = rows.find((r) => r[0] === 'Payouts');
  assert.deepEqual(payHeader, ['Payouts', 'count=2', 'gross=1500', 'trader=1200']);
});

test('reportCsvRows: prop status has one row per account WITH a challenge', () => {
  const rows = reportCsvRows(fixtureReport());
  const idx = rows.findIndex((r) => r[0] === 'Prop status');
  const header = rows[idx + 1];
  assert.equal(header[0], 'account');
  const dataRow = rows[idx + 2];
  assert.equal(dataRow[0], 'GFT');       // labelled account
  assert.equal(dataRow[1], 'funded');    // phase
  assert.equal(dataRow[7], '3/5');       // trading days completed/required
  assert.equal(dataRow[8], 'no');        // not breached
  // The challenge-less 'Manual' account must NOT produce a prop row.
  assert.ok(!rows.some((r) => r[0] === 'Manual'));
});

test('reportCsvRows: single-account report (prop not a god shape)', () => {
  const r = fixtureReport();
  r.meta.god = false;
  r.prop = { account_id: 314, label: 'GFT', phase: 'p1', currentEquity: 51000,
    health: { score: 70 }, maxDd: { roomLeft: 2000 }, dailyDd: { roomLeft: 900 },
    profitTarget: { pctToTarget: 40 }, tradingDays: { completed: 2, required: 5 },
    breach: { breached: false, reason: null } };
  const rows = reportCsvRows(r);
  const idx = rows.findIndex((row) => row[0] === 'Prop status');
  assert.ok(idx >= 0);
  assert.equal(rows[idx + 2][0], 'GFT');
  assert.equal(rows[idx + 2][1], 'p1');
});
