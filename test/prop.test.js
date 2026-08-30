import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayKey,
  synthesizeEquity,
  buildEquitySeries,
  maxDrawdown,
  dailyDrawdown,
  tradingDaysState,
  profitTargetState,
  healthScore,
  challengeState,
} from '../src/domain/prop/prop.js';

// A GFT-style funded 25k account: 4% daily, 10% max, static, no target, 3 trading
// days per payout cycle.
const FUNDED = {
  phase: 'funded',
  status: 'active',
  dd_type: 'static',
  start_balance: 25000,
  daily_dd_pct: 4,
  max_dd_pct: 10,
  profit_target_pct: null,
  min_trading_days: 3,
  min_days_reset_on_payout: true,
  start_date: '2026-06-01T00:00:00Z',
};

// An eval phase 1: 8% target, otherwise same limits, days don't reset on payout.
const EVAL = { ...FUNDED, phase: 'p1', profit_target_pct: 8, min_days_reset_on_payout: false };

const trade = (day, pnl) => ({ close_time: `2026-06-${day}T15:00:00Z`, pnl_money: pnl });

// --- dayKey ---------------------------------------------------------------
test('dayKey: UTC date, with optional server-timezone offset', () => {
  assert.equal(dayKey('2026-06-10T15:00:00Z'), '2026-06-10');
  // 23:30 UTC shifted +60min lands on the next day
  assert.equal(dayKey('2026-06-10T23:30:00Z', 60), '2026-06-11');
  assert.equal(dayKey('not-a-date'), null);
});

// --- equity series --------------------------------------------------------
test('synthesizeEquity: baseline then cumulative P&L at each close', () => {
  const s = synthesizeEquity(25000, [trade('02', 500), trade('03', -200)], FUNDED.start_date);
  assert.deepEqual(s.map((p) => p.equity), [25000, 25500, 25300]);
});

test('buildEquitySeries: prefers EA snapshots when ≥2 exist, else realized', () => {
  const realized = buildEquitySeries({ startBalance: 25000, trades: [trade('02', 100)] });
  assert.equal(realized.mode, 'realized');
  const live = buildEquitySeries({
    startBalance: 25000,
    trades: [trade('02', 100)],
    snapshots: [
      { ts: '2026-06-02T10:00:00Z', equity: 24800 },
      { ts: '2026-06-02T11:00:00Z', equity: 24600 },
    ],
  });
  assert.equal(live.mode, 'live');
  assert.equal(live.series.length, 2);
});

// --- max drawdown ---------------------------------------------------------
test('maxDrawdown static: fixed floor at start − 10%, room from current equity', () => {
  const md = maxDrawdown(FUNDED, synthesizeEquity(25000, [trade('02', 1000)], FUNDED.start_date), 26000);
  assert.equal(md.limit, 2500); // 10% of 25k
  assert.equal(md.floor, 22500);
  assert.equal(md.roomLeft, 3500); // 26000 − 22500
  assert.equal(md.breached, false);
});

test('maxDrawdown static: breach when equity dips to/below the floor', () => {
  const series = synthesizeEquity(25000, [trade('02', -2600)], FUNDED.start_date); // 22400 < 22500
  const md = maxDrawdown(FUNDED, series, 22400);
  assert.equal(md.breached, true);
  assert.equal(md.fracRemaining, 0);
});

test('maxDrawdown trailing: floor follows the peak by a fixed $ amount', () => {
  const trailing = { ...FUNDED, dd_type: 'trailing' };
  // peak 27000, trail 2500 -> floor 24500; equity back at 26000 still safe
  const series = synthesizeEquity(25000, [trade('02', 2000), trade('03', -1000)], FUNDED.start_date);
  const md = maxDrawdown(trailing, series, 26000);
  assert.equal(md.type, 'trailing');
  assert.equal(md.floor, 24500);
  assert.equal(md.breached, false);
  // now drop below the trailed floor
  const breachSeries = synthesizeEquity(25000, [trade('02', 2000), trade('03', -3000)], FUNDED.start_date); // 24000 < 24500
  assert.equal(maxDrawdown(trailing, breachSeries, 24000).breached, true);
});

// --- daily drawdown -------------------------------------------------------
test('dailyDrawdown: room measured from the day open, breach across any day', () => {
  // Day 10 opens at 25000 (no prior trades), loses 800 -> used 800 of 1000 limit.
  const series = synthesizeEquity(25000, [{ close_time: '2026-06-10T15:00:00Z', pnl_money: -800 }], FUNDED.start_date);
  const dd = dailyDrawdown(FUNDED, series, '2026-06-10T20:00:00Z');
  assert.equal(dd.limit, 1000); // 4% of 25k
  assert.equal(dd.usedToday, 800);
  assert.equal(dd.roomLeft, 200);
  assert.equal(dd.breached, false);
});

test('dailyDrawdown: exceeding the daily limit in a day flags a breach', () => {
  const series = synthesizeEquity(25000, [{ close_time: '2026-06-10T15:00:00Z', pnl_money: -1200 }], FUNDED.start_date);
  const dd = dailyDrawdown(FUNDED, series, '2026-06-10T20:00:00Z');
  assert.equal(dd.usedToday, 1200);
  assert.equal(dd.roomLeft, -200); // signed overshoot; fracRemaining is what's clamped
  assert.equal(dd.fracRemaining, 0);
  assert.equal(dd.breached, true);
});

// --- trading days ---------------------------------------------------------
test('tradingDaysState: counts distinct trade days vs requirement', () => {
  const trades = [trade('02', 10), trade('02', 20), trade('03', 30), trade('05', -5)]; // 3 distinct days
  const td = tradingDaysState(FUNDED, trades, [], '2026-06-30T00:00:00Z');
  assert.equal(td.completed, 3);
  assert.equal(td.required, 3);
  assert.equal(td.met, true);
  assert.equal(td.remaining, 0);
});

test('tradingDaysState: funded resets the counter at the last payout', () => {
  const trades = [trade('02', 10), trade('03', 20), trade('10', 30)]; // days 2,3 before payout; 10 after
  const payouts = [{ payout_date: '2026-06-05T00:00:00Z' }];
  const td = tradingDaysState(FUNDED, trades, payouts, '2026-06-30T00:00:00Z');
  assert.equal(td.completed, 1); // only the day-10 trade counts post-payout
  assert.equal(td.met, false);
  assert.equal(td.remaining, 2);
});

test('tradingDaysState: eval ignores payouts (counter runs from phase start)', () => {
  const trades = [trade('02', 10), trade('03', 20), trade('10', 30)];
  const payouts = [{ payout_date: '2026-06-05T00:00:00Z' }];
  const td = tradingDaysState(EVAL, trades, payouts, '2026-06-30T00:00:00Z');
  assert.equal(td.completed, 3); // all three days count — no reset
  assert.equal(td.met, true);
});

/* THE COUNT USED TO DROP TRADES THE ACCOUNT'S OWN DRAWDOWN MATH KEPT.
 *
 * `challenges.start_date` defaults to now() at insert and is never written explicitly,
 * so it records when the account was ADDED TO PROPVEXIS. Bounding the trading-day
 * count on it meant a trader who had been trading before signing up had that history
 * dropped from the one figure a firm uses to decide whether they may be paid — while
 * every one of those same trades still counted toward the drawdown that can end the
 * account. These four pin both halves of the fix. */

test('tradingDaysState: the account\'s first challenge counts its whole history, not just what came after the day it was added to PropVexis', () => {
  // The trader signed up on the 20th with three weeks of trading already behind them.
  const addedLate = { ...EVAL, start_date: '2026-06-20T09:00:00Z', first_on_account: true };
  const trades = [trade('02', 10), trade('03', 20), trade('05', 30)];
  const td = tradingDaysState(addedLate, trades, [], '2026-06-30T00:00:00Z');
  assert.equal(td.completed, 3, 'history behind the signup date is still this phase');
  assert.equal(td.met, true);
  assert.equal(td.countFrom, null, 'nothing bounds the first challenge on an account');
});

test('tradingDaysState: the day the account was added counts, even for trades closed earlier that day', () => {
  // The off-by-an-instant half: a 12:00 trade on the day an account is added at 14:14
  // read as zero trading days on a day the trader had visibly traded.
  const addedMidday = { ...EVAL, start_date: '2026-06-02T14:14:00Z', first_on_account: false };
  const td = tradingDaysState(addedMidday, [trade('02', 10)], [], '2026-06-30T00:00:00Z');
  assert.equal(td.completed, 1, 'a cycle measured in days cannot open halfway through one');
});

test('tradingDaysState: a genuine phase boundary (the account\'s second challenge) still bounds the count', () => {
  // /api/prop/advance opens a second challenge on the SAME login — there, start_date
  // is a real boundary and the previous phase's days must not carry over.
  const phase2 = { ...EVAL, start_date: '2026-06-04T00:00:00Z', first_on_account: false };
  const trades = [trade('02', 10), trade('03', 20), trade('05', 30), trade('06', 5)];
  const td = tradingDaysState(phase2, trades, [], '2026-06-30T00:00:00Z');
  assert.equal(td.completed, 2, 'only days 5 and 6 belong to phase 2');
  assert.equal(td.countFrom, '2026-06-04T00:00:00.000Z');
});

test('tradingDaysState: cycleStart still reports the anchor upcomingPayouts schedules from', () => {
  // propOverview.nextPayoutDate anchors a funded payout cycle on cycleStart, so it has
  // to keep naming a date when nothing bounds the count.
  const first = { ...EVAL, start_date: '2026-06-01T00:00:00Z', first_on_account: true };
  const td = tradingDaysState(first, [trade('02', 10)], [], '2026-06-30T00:00:00Z');
  assert.equal(td.countFrom, null);
  assert.equal(td.cycleStart, '2026-06-01T00:00:00.000Z');
});

// --- profit target --------------------------------------------------------
test('profitTargetState: eval tracks profit toward the target; funded is null', () => {
  const pt = profitTargetState(EVAL, 26000);
  assert.equal(pt.target, 2000); // 8% of the 25k baseline
  assert.equal(pt.current, 1000);
  assert.equal(pt.pctToTarget, 0.5);
  assert.equal(pt.reached, false);
  assert.equal(profitTargetState(FUNDED, 26000), null);
});

test('profitTargetState: a funded account tracks toward a target exactly like eval once profit_target_pct is set (the "manual target" dashboard UI writes this field directly)', () => {
  // A trader sets a flat $2,500 target on a $25k funded account — the UI
  // converts that to a percentage of the starting balance before saving.
  const manualPct = (2500 / FUNDED.start_balance) * 100;
  const withTarget = { ...FUNDED, profit_target_pct: manualPct };
  const pt = profitTargetState(withTarget, 26669.87);
  assert.equal(pt.target, 2500);
  assert.equal(pt.current, 1669.87);
  assert.equal(pt.pctToTarget, 1669.87 / 2500);
  assert.equal(pt.reached, false);
});

// --- health score ---------------------------------------------------------
test('healthScore: weighted blend, breach floors it to 0', () => {
  const full = healthScore({ maxDdFrac: 1, dailyDdFrac: 1, progressFrac: 1, breached: false });
  assert.equal(full.score, 100);
  const breached = healthScore({ maxDdFrac: 0.9, dailyDdFrac: 0.9, progressFrac: 0.9, breached: true });
  assert.equal(breached.score, 0);
  // 0.5*0.5 + 0.3*1 + 0.2*1 = 0.75 -> 75
  const mixed = healthScore({ maxDdFrac: 0.5, dailyDdFrac: 1, progressFrac: 1, breached: false });
  assert.equal(mixed.score, 75);
});

// --- assembler ------------------------------------------------------------
test('challengeState: assembles a healthy funded account (realized mode)', () => {
  const trades = [trade('02', 400), trade('03', 300), trade('05', 500)]; // +1200, 3 days
  const st = challengeState({ challenge: FUNDED, trades, payouts: [], asOf: '2026-06-30T00:00:00Z' });
  assert.equal(st.phase, 'funded');
  assert.equal(st.mode, 'realized');
  assert.equal(st.currentEquity, 26200);
  assert.equal(st.profitTarget, null); // funded
  assert.equal(st.tradingDays.met, true);
  assert.equal(st.breach.breached, false);
  assert.equal(st.maxDd.floor, 22500);
  assert.ok(st.health.score > 0 && st.health.score <= 100);
});

test('challengeState: a max-DD breach zeroes health and names the reason', () => {
  const trades = [{ close_time: '2026-06-10T15:00:00Z', pnl_money: -3000 }]; // equity 22000 < 22500
  const st = challengeState({ challenge: FUNDED, trades, asOf: '2026-06-30T00:00:00Z' });
  assert.equal(st.breach.breached, true);
  assert.equal(st.breach.reason, 'max_dd');
  assert.equal(st.health.score, 0);
});

test('challengeState: live equity from EA snapshots switches mode to live', () => {
  const st = challengeState({
    challenge: FUNDED,
    trades: [trade('02', 100)],
    snapshots: [
      { ts: '2026-06-02T10:00:00Z', equity: 25050 },
      { ts: '2026-06-02T11:00:00Z', equity: 25120 },
    ],
    live: 25120,
    asOf: '2026-06-30T00:00:00Z',
  });
  assert.equal(st.mode, 'live');
  assert.equal(st.currentEquity, 25120);
});

test('challengeState: manual account with no start_balance degrades gracefully', () => {
  const manual = { ...FUNDED, start_balance: null };
  const st = challengeState({ challenge: manual, trades: [trade('02', 100)], asOf: '2026-06-30T00:00:00Z' });
  assert.equal(st.maxDd, null);
  assert.equal(st.dailyDd, null);
  assert.equal(st.breach.breached, false);
});
