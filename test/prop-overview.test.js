import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  businessKpis,
  evalSuccessRate,
  firmRollup,
  nextPayoutDate,
  upcomingPayouts,
  recentTransactions,
  accountsBreakdown,
  propCalendarEvents,
  propBrief,
  DEFAULT_PAYOUT_CYCLE_DAYS,
  INACTIVE_DAYS,
} from '../src/domain/prop/propOverview.js';

// Prop OS → Overview: the BUSINESS aggregation over accounts + engine states +
// challenge history + money movements. Pure, so every case here pins a fixed
// `asOf` and asserts exact figures.

const ASOF = new Date('2026-08-05T12:00:00Z');

// Four accounts: two funded (one at GFT, one at FTMO), one eval, one breached.
const accounts = [
  { mt5_login: 100, label: 'GFT 100k', start_balance: 100000, payout_split_pct: 80, payout_cycle_days: 14, payout_anchor_date: null, firm_id: 'gft', firm_name: 'GoatFundedTrader', created_at: '2026-01-01T00:00:00Z' },
  { mt5_login: 200, label: 'FTMO 50k', start_balance: 50000, payout_split_pct: 90, payout_cycle_days: 30, payout_anchor_date: null, firm_id: 'ftmo', firm_name: 'FTMO', created_at: '2026-02-01T00:00:00Z' },
  { mt5_login: 300, label: 'GFT Eval', start_balance: 25000, payout_split_pct: 80, payout_cycle_days: 14, payout_anchor_date: null, firm_id: 'gft', firm_name: 'GoatFundedTrader', created_at: '2026-06-01T00:00:00Z' },
  { mt5_login: 400, label: 'Dead 10k', start_balance: 10000, payout_split_pct: 80, payout_cycle_days: 14, payout_anchor_date: null, firm_id: null, firm_name: null, created_at: '2026-03-01T00:00:00Z' },
];

const state = (id, over = {}) => ({
  account_id: id,
  challenge: 1,
  challengeId: id,
  phase: 'funded',
  startBalance: 100000,
  currentEquity: 100000,
  maxDd: { limit: 10000, roomLeft: 10000, fracRemaining: 1, breached: false },
  dailyDd: { limit: 5000, roomLeft: 5000, fracRemaining: 1, breached: false, usedToday: 0 },
  profitTarget: null,
  tradingDays: { required: 5, completed: 5, remaining: 0, met: true, cycleStart: '2026-07-01T00:00:00Z' },
  breach: { breached: false, reason: null },
  ...over,
});

const states = [
  state(100, { currentEquity: 108000 }),                       // funded, +8000
  state(200, { startBalance: 50000, currentEquity: 52000 }),   // funded, +2000
  state(300, {                                                  // eval, part-way to target
    phase: 'p1',
    startBalance: 25000,
    currentEquity: 26000,
    profitTarget: { target: 2000, current: 1000, pctToTarget: 0.5, reached: false },
    tradingDays: { required: 5, completed: 2, remaining: 3, met: false, cycleStart: '2026-07-20T00:00:00Z' },
  }),
  state(400, {                                                  // breached eval (matches challenge 13)
    phase: 'p1',
    startBalance: 10000,
    currentEquity: 9000,
    profitTarget: { target: 800, current: -1000, pctToTarget: 0, reached: false },
    maxDd: { limit: 1000, roomLeft: 0, fracRemaining: 0, breached: true },
    breach: { breached: true, reason: 'max_dd' },
  }),
];

// Challenge history: two eval passes, one eval breach, plus the live rows.
const challenges = [
  { id: 11, mt5_login: 100, label: 'GFT 100k', phase: 'p1', status: 'passed', start_date: '2026-01-01T00:00:00Z', passed_at: '2026-01-20T00:00:00Z', breached_at: null, breach_reason: null, firm_id: 'gft', firm_name: 'GoatFundedTrader', start_balance: 100000 },
  { id: 12, mt5_login: 100, label: 'GFT 100k', phase: 'p2', status: 'passed', start_date: '2026-01-20T00:00:00Z', passed_at: '2026-02-10T00:00:00Z', breached_at: null, breach_reason: null, firm_id: 'gft', firm_name: 'GoatFundedTrader', start_balance: 100000 },
  { id: 13, mt5_login: 400, label: 'Dead 10k', phase: 'p1', status: 'breached', start_date: '2026-03-01T00:00:00Z', passed_at: null, breached_at: '2026-03-15T00:00:00Z', breach_reason: 'max_dd', firm_id: null, firm_name: null, start_balance: 10000 },
  { id: 14, mt5_login: 100, label: 'GFT 100k', phase: 'funded', status: 'active', start_date: '2026-02-10T00:00:00Z', passed_at: null, breached_at: null, breach_reason: null, firm_id: 'gft', firm_name: 'GoatFundedTrader', start_balance: 100000 },
];

const payouts = [
  { id: 1, account_id: 100, payout_date: '2026-07-25T00:00:00Z', trader_amount: 4000, gross_amount: 5000, note: null },
  { id: 2, account_id: 100, payout_date: '2026-08-02T00:00:00Z', trader_amount: 1600, gross_amount: 2000, note: null },
  { id: 3, account_id: 200, payout_date: '2026-06-10T00:00:00Z', trader_amount: 900, gross_amount: 1000, note: null },
];

const fees = [
  { id: 1, account_id: 300, fee_date: '2026-08-01T00:00:00Z', amount: 150, fee_type: 'evaluation', note: null },
  { id: 2, account_id: 400, fee_date: '2026-03-01T00:00:00Z', amount: 60, fee_type: 'evaluation', note: null },
];

// ---- business KPIs ---------------------------------------------------------

test('businessKpis: earned, active accounts, funding, monthly figures', () => {
  const k = businessKpis({ accounts, states, challenges, payouts, fees, asOf: ASOF });
  assert.equal(k.totalEarned, 6500);       // 4000 + 1600 + 900
  assert.equal(k.activeAccounts, 3);       // 100, 200, 300 — the breached 400 is out
  assert.equal(k.totalFunding, 150000);    // funded only: 100k + 50k (eval 25k excluded)
  assert.equal(k.monthlyPayout, 1600);     // August only
  assert.equal(k.monthlyFees, 150);        // August only
});

test('totalFunding counts funded accounts only, not evaluations', () => {
  // Promote the eval account to funded and the figure moves by exactly its size.
  const promoted = states.map((s) => (s.account_id === 300 ? { ...s, phase: 'funded', profitTarget: null } : s));
  const k = businessKpis({ accounts, states: promoted, challenges, payouts, fees, asOf: ASOF });
  assert.equal(k.totalFunding, 175000);
});

test('a breached FUNDED account does NOT count toward total funding', () => {
  // Total funding reports capital you can actually trade. A funded account in
  // breach has been stopped by the firm, so counting it would report buying power
  // that isn't there. It drops out of BOTH totalFunding and activeAccounts.
  const breachedFunded = [...states, state(500, {
    startBalance: 20000, currentEquity: 18000,
    maxDd: { limit: 2000, roomLeft: 0, fracRemaining: 0, breached: true },
    breach: { breached: true, reason: 'max_dd' },
  })];
  const withAcct = [...accounts, { mt5_login: 500, label: 'Broken 20k', start_balance: 20000, payout_split_pct: 80, firm_id: 'gft', firm_name: 'GoatFundedTrader', created_at: '2026-04-01T00:00:00Z' }];
  const k = businessKpis({ accounts: withAcct, states: breachedFunded, challenges, payouts, fees, asOf: ASOF });
  assert.equal(k.totalFunding, 150000);  // 100k + 50k — the breached 20k is out
  assert.equal(k.activeAccounts, 3);     // also unchanged: it is not active

  // Reset it (breach cleared) and its capital comes back.
  const reset = breachedFunded.map((s) => (s.account_id === 500
    ? { ...s, maxDd: { limit: 2000, roomLeft: 2000, fracRemaining: 1, breached: false }, breach: { breached: false, reason: null } }
    : s));
  const k2 = businessKpis({ accounts: withAcct, states: reset, challenges, payouts, fees, asOf: ASOF });
  assert.equal(k2.totalFunding, 170000);
  assert.equal(k2.activeAccounts, 4);
});

test('evalSuccessRate counts closed EVAL attempts only', () => {
  const r = evalSuccessRate(challenges);
  assert.equal(r.passed, 2);      // p1 + p2 passes
  assert.equal(r.breached, 1);
  assert.equal(r.attempts, 3);
  assert.equal(r.rate, 66.67);
  // The active FUNDED row must not be counted as an attempt.
  assert.equal(evalSuccessRate(challenges.filter((c) => c.phase === 'funded')).attempts, 0);
});

test('evalSuccessRate is null (not 0%) before any attempt closes', () => {
  const r = evalSuccessRate([{ phase: 'p1', status: 'active' }]);
  assert.equal(r.rate, null);
  assert.equal(r.attempts, 0);
});

// ---- firm rollup -----------------------------------------------------------

test('firmRollup counts funded vs eval per firm, breached excluded', () => {
  const rows = firmRollup({ accounts, states });
  const gft = rows.find((r) => r.firmId === 'gft');
  assert.equal(gft.funded, 1);
  assert.equal(gft.evaluation, 1);
  assert.equal(gft.total, 2);
  const ftmo = rows.find((r) => r.firmId === 'ftmo');
  assert.equal(ftmo.funded, 1);
  assert.equal(ftmo.evaluation, 0);
  // The breached no-firm account contributes no "Other" bucket at all.
  assert.equal(rows.find((r) => r.firmId === null), undefined);
});

// ---- payout schedule -------------------------------------------------------

test('nextPayoutDate: last payout + cycle days', () => {
  const n = nextPayoutDate({ account: accounts[0], payouts, challengeStart: '2026-02-10T00:00:00Z', asOf: ASOF });
  // Last payout 2026-08-02 + 14 days.
  assert.equal(n.due.toISOString().slice(0, 10), '2026-08-16');
  assert.equal(n.cycle, 14);
  assert.equal(n.anchoredOn, 'last-payout');
});

test('nextPayoutDate falls back to the challenge start before any payout', () => {
  const acct = { ...accounts[2], mt5_login: 300 };
  const n = nextPayoutDate({ account: acct, payouts, challengeStart: '2026-07-20T00:00:00Z', asOf: ASOF });
  assert.equal(n.due.toISOString().slice(0, 10), '2026-08-03');
  assert.equal(n.anchoredOn, 'start');
});

test('an explicit anchor overrides the derived one', () => {
  const acct = { ...accounts[0], payout_anchor_date: '2026-08-04' };
  const n = nextPayoutDate({ account: acct, payouts, challengeStart: null, asOf: ASOF });
  assert.equal(n.due.toISOString().slice(0, 10), '2026-08-18');
  assert.equal(n.anchoredOn, 'override');
});

test('a missing cycle length falls back to the biweekly default', () => {
  const acct = { ...accounts[0], payout_cycle_days: null };
  const n = nextPayoutDate({ account: acct, payouts, asOf: ASOF });
  assert.equal(n.cycle, DEFAULT_PAYOUT_CYCLE_DAYS);
});

test('upcomingPayouts: funded only, with the trader split applied', () => {
  const rows = upcomingPayouts({ accounts, states, payouts, asOf: ASOF });
  assert.deepEqual(rows.map((r) => r.accountId), [200, 100]); // by due date
  const gft = rows.find((r) => r.accountId === 100);
  assert.equal(gft.amount, 6400);   // (108000-100000) * 80%
  assert.equal(gft.dueDate, '2026-08-16');
  assert.equal(gft.status, 'upcoming');
  const ftmo = rows.find((r) => r.accountId === 200);
  assert.equal(ftmo.amount, 1800);  // (52000-50000) * 90%
  // Neither the eval nor the breached account can be scheduled a payout.
  assert.equal(rows.find((r) => r.accountId === 300), undefined);
  assert.equal(rows.find((r) => r.accountId === 400), undefined);
});

test('a passed due date reads as overdue rather than silently rolling forward', () => {
  const late = [{ id: 9, account_id: 100, payout_date: '2026-07-01T00:00:00Z', trader_amount: 100 }];
  const rows = upcomingPayouts({ accounts, states, payouts: late, asOf: ASOF });
  const gft = rows.find((r) => r.accountId === 100);
  assert.equal(gft.dueDate, '2026-07-15');
  assert.equal(gft.status, 'overdue');
});

test('an account short of its minimum trading days is ineligible, not due', () => {
  const short = states.map((s) => (s.account_id === 100
    ? { ...s, tradingDays: { required: 5, completed: 1, remaining: 4, met: false, cycleStart: '2026-08-01T00:00:00Z' } }
    : s));
  const gft = upcomingPayouts({ accounts, states: short, payouts, asOf: ASOF }).find((r) => r.accountId === 100);
  assert.equal(gft.status, 'ineligible');
  assert.equal(gft.daysToGo, 4);
});

test('payout amount is never negative when an account is under water', () => {
  const down = states.map((s) => (s.account_id === 100 ? { ...s, currentEquity: 95000 } : s));
  const gft = upcomingPayouts({ accounts, states: down, payouts, asOf: ASOF }).find((r) => r.accountId === 100);
  assert.equal(gft.amount, 0);
});

// ---- transactions ----------------------------------------------------------

test('recentTransactions merges payouts and fees on one signed timeline', () => {
  const rows = recentTransactions({ payouts, fees, accounts });
  assert.equal(rows.length, 5);
  assert.equal(rows[0].date, '2026-08-02T00:00:00Z'); // newest first
  assert.equal(rows[0].kind, 'payout');
  assert.equal(rows[0].amount, 1600);
  assert.equal(rows[0].accountLabel, 'GFT 100k');
  const fee = rows.find((r) => r.id === 'fee:1');
  assert.equal(fee.amount, -150);                     // money out is negative
  assert.equal(fee.description, 'Evaluation fee');
  // The column sums to the same net the Finance page reports.
  assert.equal(rows.reduce((s, r) => s + r.amount, 0), 6500 - 210);
});

test('recentTransactions honours its limit', () => {
  assert.equal(recentTransactions({ payouts, fees, accounts, limit: 2 }).length, 2);
});

// ---- accounts breakdown ----------------------------------------------------

test('accountsBreakdown: ring plus one table per slice', () => {
  const b = accountsBreakdown({ accounts, states, challenges, payouts });
  assert.deepEqual(b.ring, { funded: 2, evaluation: 1, passed: 1 });

  const gft = b.funded.find((r) => r.accountId === 100);
  assert.equal(gft.pnl, 8000);
  assert.equal(gft.totalPaid, 5600);   // 4000 + 1600

  const evalRow = b.evaluation[0];
  assert.equal(evalRow.accountId, 300);
  assert.equal(evalRow.pnl, 1000);
  assert.equal(evalRow.remainingToPass, 1000); // 2000 target − 1000 made
  assert.equal(evalRow.targetReached, false);

  // One row per pass EVENT, newest first.
  assert.deepEqual(b.passed.map((p) => p.challengeId), [12, 11]);
  assert.equal(b.passed[0].startDate, '2026-01-20');
  assert.equal(b.passed[0].passedDate, '2026-02-10');
});

test('breached accounts appear in no breakdown slice', () => {
  const b = accountsBreakdown({ accounts, states, challenges, payouts });
  assert.equal(b.funded.find((r) => r.accountId === 400), undefined);
  assert.equal(b.evaluation.find((r) => r.accountId === 400), undefined);
});

// ---- calendar --------------------------------------------------------------

test('propCalendarEvents marks passes, breaches and payouts by day', () => {
  const ev = propCalendarEvents({ challenges, payouts, accounts });
  const on = (d) => ev.filter((e) => e.day === d);

  assert.equal(on('2026-01-20')[0].kind, 'milestone');
  assert.match(on('2026-01-20')[0].label, /GFT 100k passed Phase 1/);

  assert.equal(on('2026-03-15')[0].kind, 'breach');
  assert.match(on('2026-03-15')[0].label, /max drawdown/);

  assert.equal(on('2026-08-02')[0].kind, 'payout');
  assert.equal(on('2026-08-02')[0].amount, 1600);

  // Ascending by day, and nothing undated slips through.
  assert.deepEqual([...ev].sort((a, b) => (a.day < b.day ? -1 : 1)).map((e) => e.day), ev.map((e) => e.day));
  assert.equal(ev.some((e) => !e.day), false);
});

// ---- brief -----------------------------------------------------------------

test('propBrief puts risk and progress on the left', () => {
  const risky = states.map((s) => (s.account_id === 100
    ? { ...s, maxDd: { limit: 10000, roomLeft: 900, fracRemaining: 0.09, breached: false } }
    : s));
  const b = propBrief({ accounts, states: risky, challenges, payouts, lastTradeAt: new Map(), asOf: ASOF });

  const near = b.left.find((i) => i.id === 'maxdd:100');
  assert.equal(near.severity, 'critical');   // ≤10% left
  assert.match(near.detail, /\$900/);

  // The breached account is reported as breached and nothing else.
  assert.equal(b.left.find((i) => i.id === 'breached:400').severity, 'critical');
  assert.equal(b.left.some((i) => i.id === 'days:400'), false);

  // The eval account still owes trading days.
  assert.match(b.left.find((i) => i.id === 'days:300').title, /3 trading day/);

  // Critical items sort ahead of info ones.
  assert.equal(b.left[0].severity, 'critical');
});

test('propBrief flags a reached profit target', () => {
  const hit = states.map((s) => (s.account_id === 300
    ? { ...s, profitTarget: { target: 2000, current: 2000, pctToTarget: 1, reached: true } }
    : s));
  const b = propBrief({ accounts, states: hit, challenges, payouts, lastTradeAt: new Map(), asOf: ASOF });
  const t = b.left.find((i) => i.id === 'target:300');
  assert.equal(t.severity, 'good');
  assert.match(t.detail, /3 more trading day/);  // target met but days outstanding
});

test('propBrief puts schedule and staleness on the right', () => {
  const lastTradeAt = new Map([
    [100, '2026-08-04T00:00:00Z'],                      // active
    [300, '2026-06-01T00:00:00Z'],                      // long idle
  ]);
  const b = propBrief({ accounts, states, challenges, payouts, lastTradeAt, asOf: ASOF });

  const idle = b.right.find((i) => i.id === 'idle:300');
  assert.equal(idle.kind, 'inactive');
  assert.match(idle.title, /inactive 65 days/);
  assert.equal(b.right.some((i) => i.id === 'idle:100'), false);

  // Only payouts inside the 7-day horizon; GFT's 2026-08-16 is outside it.
  assert.equal(b.right.some((i) => i.id === 'payout:100'), false);
});

test('propBrief surfaces an overdue payout regardless of horizon', () => {
  const late = [{ id: 9, account_id: 100, payout_date: '2026-07-01T00:00:00Z', trader_amount: 100 }];
  const b = propBrief({ accounts, states, challenges, payouts: late, lastTradeAt: new Map(), asOf: ASOF });
  const p = b.right.find((i) => i.id === 'payout:100');
  assert.equal(p.severity, 'warning');
  assert.match(p.title, /overdue/);
});

test('propBrief flags a passed evaluation with no funded account running', () => {
  // 300 passed Phase 2 but is still sitting in an eval phase.
  const ch = [...challenges, {
    id: 15, mt5_login: 300, label: 'GFT Eval', phase: 'p2', status: 'passed',
    start_date: '2026-07-01T00:00:00Z', passed_at: '2026-08-01T00:00:00Z',
    breached_at: null, breach_reason: null, firm_id: 'gft', firm_name: 'GoatFundedTrader',
  }];
  const b = propBrief({ accounts, states, challenges: ch, payouts, lastTradeAt: new Map(), asOf: ASOF });
  assert.match(b.right.find((i) => i.id === 'awaiting:15').title, /passed evaluation/);
  // Account 100 also passed p2 (challenge 12) but IS funded now — not flagged.
  assert.equal(b.right.some((i) => i.id === 'awaiting:12'), false);
});

test('the inactivity threshold is the exported constant', () => {
  const at = new Date(ASOF.getTime() - INACTIVE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const b = propBrief({ accounts, states, challenges, payouts, lastTradeAt: new Map([[100, at]]), asOf: ASOF });
  assert.equal(b.right.some((i) => i.id === 'idle:100'), true);
});

test('empty inputs produce empty output, never a crash', () => {
  const k = businessKpis({});
  assert.equal(k.totalEarned, 0);
  assert.equal(k.activeAccounts, 0);
  assert.equal(k.evalSuccess.rate, null);
  assert.deepEqual(firmRollup({}), []);
  assert.deepEqual(upcomingPayouts({}), []);
  assert.deepEqual(recentTransactions({}), []);
  assert.deepEqual(propCalendarEvents({}), []);
  assert.deepEqual(accountsBreakdown({}).ring, { funded: 0, evaluation: 0, passed: 0 });
  assert.deepEqual(propBrief({}), { left: [], right: [] });
});
