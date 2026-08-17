import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FEE_CATEGORY, RANGES, LEDGER_VIEWS, BREAKDOWN_DIMS,
  accountsInScope, categoryTotal, clipSeries, filterLedger, financeBreakdown,
  financeLedger, financeTotals, fundedCapital, ledgerFilterOptions, roiSeries,
  scopeLogins, sizeLabel,
} from '../frontend/src/financeData.js';

// Prop OS › Finance — the module's arithmetic. Everything the page shows is a
// projection of one signed ledger, so these tests are the page's correctness:
// if the ledger and its four projections agree here, a KPI tile and a table row
// cannot disagree in the UI.

const accounts = [
  { mt5_login: 100, label: 'GFT 100k', firm_id: 'gft', firm_name: 'GoatFundedTrader', account_type: 'funded', start_balance: 100000, is_active: true },
  { mt5_login: 200, label: 'FTMO 50k', firm_id: 'ftmo', firm_name: 'FTMO', account_type: 'eval', start_balance: 50000, is_active: true },
  { mt5_login: 300, label: 'Custom', firm_id: null, firm_name: null, account_type: 'funded', start_balance: 25000, is_active: false },
];
// trader_amount is what the API returns (gross × split), so the ledger reads it
// directly rather than recomputing a split the server already snapshotted.
const payouts = [
  { id: 1, account_id: 100, payout_date: '2026-02-10T00:00:00Z', trader_amount: 800, split_pct: 80, source: 'manual', note: null },
  { id: 2, account_id: 200, payout_date: '2026-03-01T00:00:00Z', trader_amount: 400, split_pct: 80, source: 'ea', note: null },
];
const fees = [
  { id: 1, account_id: 100, fee_date: '2026-01-05T00:00:00Z', amount: 200, fee_type: 'evaluation', source: 'manual', note: null },
  { id: 2, account_id: 100, fee_date: '2026-01-20T00:00:00Z', amount: 100, fee_type: 'reset', source: 'manual', note: null },
  { id: 3, account_id: 200, fee_date: '2026-02-15T00:00:00Z', amount: 250, fee_type: 'evaluation', source: 'manual', note: null },
  { id: 4, account_id: 300, fee_date: '2026-02-20T00:00:00Z', amount: 50, fee_type: 'other', source: 'manual', note: 'wire charge' },
];
const build = (accountId = 'all') => financeLedger({ payouts, fees, accounts, accountId });

// --- scope -----------------------------------------------------------------

test('scopeLogins: god view is "every account", a selection is a list', () => {
  assert.equal(scopeLogins('all'), null);
  assert.equal(scopeLogins(undefined), null);
  assert.deepEqual(scopeLogins('100'), [100]);
  assert.deepEqual(scopeLogins('100,300'), [100, 300]);
});

test('accountsInScope narrows the account list, which payouts/fees arrive pre-narrowed', () => {
  assert.equal(accountsInScope(accounts, 'all').length, 3);
  assert.deepEqual(accountsInScope(accounts, '200').map((a) => a.label), ['FTMO 50k']);
});

// --- the ledger ------------------------------------------------------------

test('the ledger carries every payout and fee, newest first', () => {
  const l = build();
  assert.equal(l.length, 6);
  assert.deepEqual(l.map((r) => r.day), [
    '2026-03-01', '2026-02-20', '2026-02-15', '2026-02-10', '2026-01-20', '2026-01-05',
  ]);
});

test('fees are signed negative and payouts positive, so the column sums to net', () => {
  const l = build();
  assert.equal(l.find((r) => r.id === 'payout:1').amount, 800);
  assert.equal(l.find((r) => r.id === 'fee:1').amount, -200);
  const sum = l.reduce((s, r) => s + r.amount, 0);
  assert.equal(Math.round(sum * 100) / 100, financeTotals(l).net);
});

test('a row is attributed to its account: firm, challenge phase and size', () => {
  const r = build().find((x) => x.id === 'fee:1');
  assert.equal(r.account, 'GFT 100k');
  assert.equal(r.firm, 'GoatFundedTrader');
  assert.equal(r.challenge, 'Funded');
  assert.equal(r.size, 100000);
  // A firmless (custom) account falls into the same "Other" bucket the backend uses.
  assert.equal(build().find((x) => x.id === 'fee:4').firm, 'Other');
});

test('description prefers the note, then the category', () => {
  const l = build();
  assert.equal(l.find((r) => r.id === 'fee:4').description, 'wire charge'); // note
  assert.equal(l.find((r) => r.id === 'fee:1').description, FEE_CATEGORY.evaluation);
  assert.equal(l.find((r) => r.id === 'payout:1').description, 'Payout');
});

test('status: a manual entry is reviewed, an auto-detected one is not', () => {
  // The substitution documented in financeData.js — there is no review column, so
  // the flag reports the one distinction the data makes.
  const l = build();
  assert.equal(l.find((r) => r.id === 'payout:1').status, 'reviewed');   // source: manual
  assert.equal(l.find((r) => r.id === 'payout:2').status, 'unreviewed'); // source: ea
});

test('a narrowed scope drops the rows that belong to other accounts', () => {
  const l = build('100');
  assert.deepEqual([...new Set(l.map((r) => r.account))], ['GFT 100k']);
  assert.equal(l.length, 3); // one payout + two fees
});

test('empty inputs → an empty ledger, not a crash', () => {
  assert.deepEqual(financeLedger({}), []);
});

// --- totals ----------------------------------------------------------------

test('totals: earned, spent, net, roiPct and the counts behind them', () => {
  const t = financeTotals(build());
  assert.equal(t.earned, 1200);        // 800 + 400
  assert.equal(t.spent, 600);          // 200 + 100 + 250 + 50
  assert.equal(t.net, 600);
  assert.equal(t.roiPct, 100);         // 600 / 600
  assert.equal(t.count, 6);
  assert.equal(t.income, 2);
  assert.equal(t.expenses, 4);
  assert.equal(t.volume, 1800);        // gross money moved either way
});

test('roiPct is null with nothing spent — never a misleading 0%', () => {
  const t = financeTotals(financeLedger({ payouts, fees: [], accounts }));
  assert.equal(t.spent, 0);
  assert.equal(t.roiPct, null);
});

test('totals agree with the backend financeSummary on the same figures', async () => {
  // The two implementations exist for different reasons (the page derives from
  // context, the report needs it server-side) and must not drift.
  const { financeSummary } = await import('../src/finance.js');
  const server = financeSummary({ payouts, fees, accounts });
  const client = financeTotals(build());
  assert.deepEqual(
    { spent: client.spent, earned: client.earned, net: client.net, roiPct: client.roiPct },
    { spent: server.spent, earned: server.earned, net: server.net, roiPct: server.roiPct },
  );
});

test('categoryTotal sums one fee category (the KPI supporting line)', () => {
  assert.equal(categoryTotal(build(), FEE_CATEGORY.evaluation), 450); // 200 + 250
  assert.equal(categoryTotal(build(), FEE_CATEGORY.reset), 100);
});

// --- funded capital --------------------------------------------------------

test('funded capital counts active funded accounts only', () => {
  const f = fundedCapital(accounts, 'all');
  assert.equal(f.capital, 100000); // 100k funded; the eval 50k and inactive 25k excluded
  assert.equal(f.accounts, 1);
});

test('funded capital respects the account scope', () => {
  assert.deepEqual(fundedCapital(accounts, '200'), { capital: 0, accounts: 0 });
});

// --- roi series ------------------------------------------------------------

test('roiSeries: one cumulative point per day money moved', () => {
  const s = roiSeries(build());
  assert.deepEqual(s.map((p) => p.date), [
    '2026-01-05', '2026-01-20', '2026-02-10', '2026-02-15', '2026-02-20', '2026-03-01',
  ]);
  assert.deepEqual(s.map((p) => p.spent), [200, 300, 300, 550, 600, 600]);
  assert.deepEqual(s.map((p) => p.earned), [0, 0, 800, 800, 800, 1200]);
  assert.deepEqual(s.map((p) => p.net), [-200, -300, 500, 250, 200, 600]);
  // The last point IS the headline totals — the chart and the KPI row agree.
  const t = financeTotals(build());
  assert.equal(s[s.length - 1].net, t.net);
  assert.equal(s[s.length - 1].roiPct, t.roiPct);
});

test('roiSeries: same-day events collapse to the day close', () => {
  const s = roiSeries(financeLedger({
    accounts,
    fees: [{ id: 9, account_id: 100, fee_date: '2026-01-05T09:00:00Z', amount: 100, fee_type: 'other', source: 'manual' }],
    payouts: [{ id: 9, account_id: 100, payout_date: '2026-01-05T18:00:00Z', trader_amount: 400, source: 'manual' }],
  }));
  assert.equal(s.length, 1);
  assert.deepEqual({ spent: s[0].spent, earned: s[0].earned, net: s[0].net }, { spent: 100, earned: 400, net: 300 });
});

test('roiSeries: empty ledger → []', () => {
  assert.deepEqual(roiSeries([]), []);
});

// --- range clipping --------------------------------------------------------

test('clipSeries: ALL is the whole series', () => {
  const s = roiSeries(build());
  assert.equal(clipSeries(s, 'ALL').length, s.length);
});

test('clipSeries carries the pre-window point in as the opening value', () => {
  // THE POINT OF THE FUNCTION: a cumulative chart clipped naively would draw an
  // empty 1W view for an account that earned last month and nothing this week.
  const s = roiSeries(build());
  const w = clipSeries(s, '1W', new Date('2026-03-05T00:00:00Z'));
  assert.equal(w.length, 2);
  assert.equal(w[0].date, '2026-02-26');      // restamped to the window's first day
  assert.equal(w[0].net, 200);                // the running total coming in
  assert.equal(w[1].date, '2026-03-01');
  assert.equal(w[1].net, 600);
});

test('clipSeries: a window that starts before the data keeps every point', () => {
  const s = roiSeries(build());
  assert.equal(clipSeries(s, '1Y', new Date('2026-03-05T00:00:00Z')).length, s.length);
});

test('the range control offers 1W / 1M / 1Y / All', () => {
  assert.deepEqual(RANGES.map((r) => r.value), ['1W', '1M', '1Y', 'ALL']);
});

// --- breakdowns ------------------------------------------------------------

test('the four locked breakdown dimensions', () => {
  assert.deepEqual(BREAKDOWN_DIMS.map((d) => d.value), ['firm', 'type', 'size', 'expenses']);
});

test('breakdown by firm: spend, earnings and net per firm', () => {
  const bd = financeBreakdown(build(), 'firm');
  const gft = bd.slices.find((s) => s.label === 'GoatFundedTrader');
  assert.deepEqual({ spent: gft.spent, earned: gft.earned, net: gft.net }, { spent: 300, earned: 800, net: 500 });
  const ftmo = bd.slices.find((s) => s.label === 'FTMO');
  assert.deepEqual({ spent: ftmo.spent, earned: ftmo.earned, net: ftmo.net }, { spent: 250, earned: 400, net: 150 });
  assert.equal(bd.slices.find((s) => s.label === 'Other').net, -50);
  // The dimension totals reconcile with the headline ones.
  const t = financeTotals(build());
  assert.deepEqual({ spent: bd.spent, earned: bd.earned, net: bd.net }, { spent: t.spent, earned: t.earned, net: t.net });
});

test('breakdown slices are ordered by spend, and share is a share of spend', () => {
  const bd = financeBreakdown(build(), 'firm');
  const spends = bd.slices.map((s) => s.spent);
  assert.deepEqual(spends, [...spends].sort((a, b) => b - a));
  assert.equal(bd.slices.reduce((s, x) => s + x.share, 0), 100);
});

test('breakdown by account type splits funded from evaluation', () => {
  const bd = financeBreakdown(build(), 'type');
  assert.deepEqual(bd.slices.map((s) => s.label).sort(), ['Evaluation', 'Funded']);
  assert.equal(bd.slices.find((s) => s.label === 'Funded').earned, 800);
});

test('breakdown by account size labels the size a trader bought', () => {
  const bd = financeBreakdown(build(), 'size');
  assert.deepEqual(bd.slices.map((s) => s.label).sort(), ['$100K', '$25K', '$50K']);
  assert.equal(sizeLabel(100000), '$100K');
  assert.equal(sizeLabel(2000000), '$2M');
  assert.equal(sizeLabel(null), 'Unspecified');
});

test('the Expenses breakdown is spend-only, by fee category', () => {
  const bd = financeBreakdown(build(), 'expenses');
  assert.deepEqual(bd.slices.map((s) => s.label), [FEE_CATEGORY.evaluation, FEE_CATEGORY.reset, FEE_CATEGORY.other]);
  assert.equal(bd.slices[0].spent, 450);
  assert.equal(bd.earned, 0, 'an expense breakdown has no earnings by construction');
  assert.equal(bd.spent, financeTotals(build()).spent);
});

test('breakdown of an empty ledger → no slices', () => {
  assert.deepEqual(financeBreakdown([], 'firm').slices, []);
});

// --- table filtering -------------------------------------------------------

test('the four locked table views', () => {
  assert.deepEqual(LEDGER_VIEWS.map((v) => v.value), ['all', 'income', 'expenses', 'review']);
});

test('views: all / income / expenses / needs review', () => {
  const l = build();
  assert.equal(filterLedger(l, { view: 'all' }).length, 6);
  assert.equal(filterLedger(l, { view: 'income' }).length, 2);
  assert.equal(filterLedger(l, { view: 'expenses' }).length, 4);
  // Only the EA-detected payout is unconfirmed.
  assert.deepEqual(filterLedger(l, { view: 'review' }).map((r) => r.id), ['payout:2']);
});

test('search spans firm, account, challenge, description and category', () => {
  const l = build();
  assert.equal(filterLedger(l, { search: 'ftmo' }).length, 2);       // firm
  assert.equal(filterLedger(l, { search: 'GFT' }).length, 3);        // account label
  assert.equal(filterLedger(l, { search: 'evaluation' }).length, 3); // category x2 + eval challenge
  assert.deepEqual(filterLedger(l, { search: 'wire' }).map((r) => r.id), ['fee:4']); // note
  assert.equal(filterLedger(l, { search: '   ' }).length, 6, 'blank search filters nothing');
});

test('category and firm filters combine with the view and the search', () => {
  const l = build();
  assert.equal(filterLedger(l, { categories: [FEE_CATEGORY.reset] }).length, 1);
  assert.equal(filterLedger(l, { firms: ['gft'] }).length, 3);
  assert.equal(filterLedger(l, { firms: ['__other__'] }).length, 1); // firmless account
  assert.equal(filterLedger(l, { view: 'expenses', firms: ['gft'] }).length, 2);
  assert.equal(filterLedger(l, { view: 'income', firms: ['gft'], search: 'nope' }).length, 0);
});

test('the Filters menu only offers choices the rows actually have', () => {
  const o = ledgerFilterOptions(build());
  assert.deepEqual(o.categories, [FEE_CATEGORY.evaluation, 'Other', 'Payout', FEE_CATEGORY.reset].sort());
  assert.deepEqual(o.firms.map((f) => f.label), ['FTMO', 'GoatFundedTrader', 'Other']);
  assert.deepEqual(ledgerFilterOptions([]), { categories: [], firms: [] });
});
