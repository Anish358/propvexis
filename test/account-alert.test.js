import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ALERT, THRESHOLDS, accountAlert, accountAlertState, alertMetrics, describeAccount,
} from '../frontend/src/features/prop/accountAlert.js';

/* THE ACCOUNT ALERT BANNER's state machine. Six states, one banner, and a priority that
 * has to hold when several conditions are true at once — which is the normal case, not
 * the edge one: an account near its daily limit is usually near its overall one too.
 *
 * Everything here runs on mock numbers in describeAccount()'s shape. That is the point
 * of the adapter: the states are verifiable in CI rather than by driving a real account
 * into a drawdown to see what colour the strip goes. */

// A GFT-style 100k evaluation: $2,500 daily, $5,000 max, $8,000 target — the figures
// from the design reference, so the copy assertions below read as the screenshot does.
const acct = (over = {}) => ({
  accountName: 'FTMO 100K · 5521',
  accountId: 5521,
  phase: 'p1',
  dailyDd: { used: 0, limit: 2500, left: 2500 },
  maxDd: { used: 0, limit: 5000, left: 5000 },
  profitTarget: { current: 0, target: 8000 },
  breached: false,
  breachReason: null,
  tradingDaysMet: true,
  tradingDaysLeft: 0,
  ...over,
});

// Set one meter to an exact percentage of its own limit.
const daily = (p) => ({ dailyDd: { used: 2500 * p, limit: 2500, left: 2500 * (1 - p) } });
const max = (p) => ({ maxDd: { used: 5000 * p, limit: 5000, left: 5000 * (1 - p) } });
const target = (p) => ({ profitTarget: { current: 8000 * p, target: 8000 } });

const stateOf = (over) => accountAlertState(acct(over));

// ---------------------------------------------------------------------------
// The eleven cases the spec names, A through K.
// ---------------------------------------------------------------------------
test('A — daily DD 75% is a DAILY DD WARNING (the threshold is inclusive)', () => {
  assert.equal(stateOf(daily(0.75)), ALERT.DAILY_DD);
});

test('B — daily DD 88% is still a DAILY DD WARNING', () => {
  assert.equal(stateOf(daily(0.88)), ALERT.DAILY_DD);
});

test('C — max DD 80% is a MAX DD WARNING (inclusive)', () => {
  assert.equal(stateOf(max(0.80)), ALERT.MAX_DD);
});

test('D — max DD 90% is still a MAX DD WARNING', () => {
  assert.equal(stateOf(max(0.90)), ALERT.MAX_DD);
});

test('E — daily DD 100% is an ACCOUNT BREACH', () => {
  assert.equal(stateOf(daily(1)), ALERT.BREACH);
});

test('F — max DD 100% is an ACCOUNT BREACH', () => {
  assert.equal(stateOf(max(1)), ALERT.BREACH);
});

test('G — profit target 75% is TARGET NEAR (inclusive)', () => {
  assert.equal(stateOf(target(0.75)), ALERT.TARGET_NEAR);
});

test('H — profit target 90% is still TARGET NEAR', () => {
  assert.equal(stateOf(target(0.90)), ALERT.TARGET_NEAR);
});

test('I — profit target 100% with the minimum trading days in is PHASE PASSED', () => {
  assert.equal(stateOf({ ...target(1), tradingDaysMet: true }), ALERT.PHASE_PASSED);
});

test('J — daily 80 / max 85 / target 90 shows the MAX DD WARNING', () => {
  // Risk beats profit, and of the two risks the one closer to its own limit wins.
  assert.equal(stateOf({ ...daily(0.80), ...max(0.85), ...target(0.90) }), ALERT.MAX_DD);
});

test('K — daily 100 / max 90 / target 100: the breach always wins', () => {
  // The whole priority system in one case. An account that is gone is not told it
  // passed, and is not shown an amber warning about a limit it has already blown.
  assert.equal(stateOf({ ...daily(1), ...max(0.90), ...target(1) }), ALERT.BREACH);
});

// ---------------------------------------------------------------------------
// The thresholds, from the other side. A banner that fires early is noise; one that
// fires late is the failure this component exists to prevent.
// ---------------------------------------------------------------------------
test('below every threshold there is NO banner at all', () => {
  assert.equal(stateOf({ ...daily(0.74), ...max(0.79), ...target(0.74) }), null);
  assert.equal(accountAlert(acct({ ...daily(0.74), ...max(0.79), ...target(0.74) })), null);
});

test('the thresholds are inclusive at the boundary and exclusive just under it', () => {
  assert.equal(stateOf(daily(0.749)), null);
  assert.equal(stateOf(daily(THRESHOLDS.dailyDd)), ALERT.DAILY_DD);
  assert.equal(stateOf(max(0.799)), null);
  assert.equal(stateOf(max(THRESHOLDS.maxDd)), ALERT.MAX_DD);
  assert.equal(stateOf(target(0.749)), null);
  assert.equal(stateOf(target(THRESHOLDS.target)), ALERT.TARGET_NEAR);
  assert.equal(stateOf(target(0.999)), ALERT.TARGET_NEAR);
});

test('99.9% of a limit is still a warning; 100% is the breach', () => {
  assert.equal(stateOf(daily(0.999)), ALERT.DAILY_DD);
  assert.equal(stateOf(max(0.999)), ALERT.MAX_DD);
  assert.equal(stateOf(daily(1)), ALERT.BREACH);
});

// ---------------------------------------------------------------------------
// Priority.
// ---------------------------------------------------------------------------
test('risk outranks profit progress even when the account is about to pass', () => {
  assert.equal(stateOf({ ...daily(0.80), ...target(1) }), ALERT.DAILY_DD);
  assert.equal(stateOf({ ...max(0.85), ...target(1) }), ALERT.MAX_DD);
});

test('between the two drawdown warnings, the one closer to ITS OWN limit is shown', () => {
  // The one departure from a fixed ladder (owner decision): a fixed max-DD-first order
  // would hide daily DD at 95% — which can end the account within the hour — behind max
  // DD at 80%, which still has a fifth of its band left.
  assert.equal(stateOf({ ...daily(0.95), ...max(0.80) }), ALERT.DAILY_DD);
  assert.equal(stateOf({ ...daily(0.80), ...max(0.95) }), ALERT.MAX_DD);
});

test('a tie between the two goes to max drawdown', () => {
  assert.equal(stateOf({ ...daily(0.85), ...max(0.85) }), ALERT.MAX_DD);
});

test('only ever ONE banner — accountAlert returns a single object, never a list', () => {
  const out = accountAlert(acct({ ...daily(0.80), ...max(0.85), ...target(0.90) }));
  assert.equal(Array.isArray(out), false);
  assert.equal(out.state, ALERT.MAX_DD);
});

// ---------------------------------------------------------------------------
// Breach: the engine's verdict, not only the percentage.
// ---------------------------------------------------------------------------
test('the engine\'s breach flag wins even when both percentages have recovered', () => {
  /* THE CASE THAT MAKES A PERCENTAGE-ONLY RULE WRONG. `fracRemaining` is CURRENT
   * headroom and is clamped to [0,1]; `breach.breached` is a scan over every past day,
   * and over a MOVING floor for a trailing max DD. An account can blow its daily limit
   * at 10am, recover by noon, and still be gone — the backend has already settled the
   * challenge on that flag (challengeStatus.js). A banner reading only the percentage
   * would tell that trader they are fine. */
  const recovered = acct({ ...daily(0.10), ...max(0.30), breached: true, breachReason: 'daily_dd' });
  assert.equal(accountAlertState(recovered), ALERT.BREACH);
});

test('a breach names the rule that ended the account', () => {
  const byMax = accountAlert(acct({ breached: true, breachReason: 'max_dd' }));
  assert.match(byMax.message, /\$5,000 maximum drawdown\. Account breach detected\./);
  const byDay = accountAlert(acct({ breached: true, breachReason: 'daily_dd' }));
  assert.match(byDay.message, /today's \$2,500 loss limit\. Account breach detected\./);
});

test('with no recorded reason, a breach falls back to whichever limit is at 100% — max first', () => {
  // Matches challengeState's own precedence: `maxDd.breached ? 'max_dd' : 'daily_dd'`.
  assert.match(accountAlert(acct({ ...daily(1), ...max(1) })).message, /maximum drawdown/);
  assert.match(accountAlert(acct(daily(1))).message, /loss limit/);
});

// ---------------------------------------------------------------------------
// Phase passed vs target reached — the app's own pass rule, not the target alone.
// ---------------------------------------------------------------------------
test('the profit target alone is NOT a pass while trading days are outstanding', () => {
  /* resolveChallengeOutcome (challengeStatus.js, owner decision 2026-08-27) needs the
   * target AND the minimum trading days: "hitting 8% on day two of a three-day minimum
   * is not a pass at any firm". Claiming a pass would send the trader to add a Phase 2
   * account their firm has not issued. */
  const short = acct({ ...target(1), tradingDaysMet: false, tradingDaysLeft: 2 });
  assert.equal(accountAlertState(short), ALERT.TARGET_REACHED);
  assert.match(accountAlert(short).message, /2 more trading days to pass/);
});

test('one outstanding day is singular', () => {
  const one = acct({ ...target(1), tradingDaysMet: false, tradingDaysLeft: 1 });
  assert.match(accountAlert(one).message, /1 more trading day to pass/);
  assert.doesNotMatch(accountAlert(one).message, /1 more trading days/);
});

test('a pass names the phase it passed', () => {
  const p2 = accountAlert(acct({ ...target(1), phase: 'p2' }));
  assert.match(p2.message, /Phase 2 pass detected\./);
});

test('a funded account has no phase to pass, and its copy says so', () => {
  // A funded account carries no target until a trader sets a payout target on it; once
  // set, "Phase funded pass detected" would be nonsense.
  const funded = accountAlert(acct({ ...target(1), phase: 'funded' }));
  assert.equal(funded.state, ALERT.PHASE_PASSED);
  assert.match(funded.message, /payout target\. Payout eligible\./);
  assert.doesNotMatch(funded.message, /pass detected/);

  const near = accountAlert(acct({ ...target(0.8), phase: 'funded' }));
  assert.match(near.message, /toward its \$8,000 payout target/);
});

// ---------------------------------------------------------------------------
// Copy — the sentence quotes the rule and its number, because "stop trading" without a
// reason is an instruction a trader overrides.
// ---------------------------------------------------------------------------
test('the warning copy matches the reference sentences, figure for figure', () => {
  assert.equal(
    accountAlert(acct(daily(0.75))).message,
    "FTMO 100K · 5521 is at 75% of today's $2,500 loss limit — $625 left.",
  );
  assert.equal(
    accountAlert(acct(daily(0.88))).message,
    "FTMO 100K · 5521 is at 88% of today's $2,500 loss limit — $300 left.",
  );
  assert.equal(
    accountAlert(acct(max(0.81))).message,
    'FTMO 100K · 5521 is at 81% of its $5,000 maximum drawdown — $950 remaining.',
  );
  assert.equal(
    accountAlert(acct(target(0.75))).message,
    'FTMO 100K · 5521 is 75% toward its $8,000 profit target — $2,000 to go.',
  );
  assert.equal(
    accountAlert(acct(target(1))).message,
    'FTMO 100K · 5521 has reached its $8,000 profit target. Phase 1 pass detected.',
  );
});

test('the account is never hard-coded into the component — the name comes from the data', () => {
  const other = accountAlert(acct({ accountName: 'Alpha Capital 50K · 991', ...daily(0.8) }));
  assert.match(other.message, /^Alpha Capital 50K · 991 /);
  const src = fs.readFileSync('frontend/src/features/prop/AccountAlertBanner.jsx', 'utf8');
  assert.equal(/FTMO/.test(src), false, 'the reference account must not appear in the component');
});

// ---------------------------------------------------------------------------
// Severity, glyph and action — the four things the spec allows to change between
// states, and nothing else.
// ---------------------------------------------------------------------------
test('each state carries its own tone, glyph, label and action intent', () => {
  const rows = [
    [daily(0.8), 'caution', 'warning', 'Daily DD warning', 'lock'],
    [max(0.85), 'severe', 'warning', 'Max DD warning', 'lock'],
    [{ breached: true }, 'breach', 'danger', 'Account breach', 'lock'],
    [target(0.8), 'progress', 'target', 'Target near', 'challenge'],
    [target(1), 'success', 'success', 'Phase passed', 'challenge'],
    [{ ...target(1), tradingDaysMet: false, tradingDaysLeft: 1 }, 'success', 'success', 'Target reached', 'challenge'],
  ];
  for (const [over, tone, icon, label, action] of rows) {
    const a = accountAlert(acct(over));
    assert.equal(a.tone, tone, label);
    assert.equal(a.icon, icon, label);
    assert.equal(a.label, label);
    assert.equal(a.action, action, label);
  }
});

test('only a breach reddens the card — no warning or success tone does', () => {
  // The card's red edge reads BANNER_CRITICAL, so a success tone landing in that set
  // would draw a green strip inside a red-edged card.
  const account = fs.readFileSync('frontend/src/components/primitives/account.jsx', 'utf8');
  const line = account.match(/export const BANNER_CRITICAL = new Set\((\[[^\]]*\])\)/);
  assert.ok(line, 'BANNER_CRITICAL must stay a literal set the card can read');
  const critical = JSON.parse(line[1].replace(/'/g, '"'));
  // Breach alone: the card edge means "this account is gone", not "something is wrong".
  // An orange max-DD strip inside a red card would contradict its own severity.
  assert.deepEqual(critical, ['breach']);
  for (const tone of ['success', 'progress', 'caution', 'severe']) {
    assert.equal(critical.includes(tone), false, `${tone} must not redden the card`);
  }
});

// ---------------------------------------------------------------------------
// The adapter, and the accounts that have nothing to alert on.
// ---------------------------------------------------------------------------
test('describeAccount converts the engine\'s HEADROOM into the CONSUMPTION the thresholds read', () => {
  // challengeState reports roomLeft/fracRemaining because that is what the meters draw;
  // every threshold above is written in the other direction. One conversion, one place.
  const state = {
    account_id: 5521,
    label: 'FTMO 100K · 5521',
    phase: 'p1',
    dailyDd: { limit: 2500, usedToday: 2200, roomLeft: 300 },
    maxDd: { limit: 5000, roomLeft: 950 },
    profitTarget: { target: 8000, current: 6000 },
    breach: { breached: false, reason: null },
    tradingDays: { met: true, remaining: 0 },
  };
  const d = describeAccount(state);
  assert.equal(d.maxDd.used, 4050, 'max-DD consumption is limit minus room, not a field on the state');
  const m = alertMetrics(d);
  assert.equal(Math.round(m.dailyPct * 100), 88);
  assert.equal(Math.round(m.maxPct * 100), 81);
  assert.equal(Math.round(m.targetPct * 100), 75);
});

test('an account with no firm rules gets no banner at all', () => {
  // A manual or own-capital account has no maxDd on its state; inventing a drawdown for
  // it is the trap computeProp already guards (see compute-prop.test.js).
  assert.equal(describeAccount({ account_id: 1, maxDd: null }), null);
  assert.equal(describeAccount(null), null);
  assert.equal(accountAlert(null), null);
  assert.equal(accountAlertState(null), null);
});

test('a funded account with no target set never reaches a profit state', () => {
  const noTarget = acct({ profitTarget: null });
  assert.equal(alertMetrics(noTarget).targetPct, null);
  assert.equal(accountAlertState(noTarget), null);
});

test('a missing or zero limit is an unknown, not a satisfied threshold', () => {
  // limit 0 would make used/limit Infinity and fire a permanent breach banner.
  assert.equal(accountAlertState(acct({ dailyDd: { used: 100, limit: 0, left: 0 } })), null);
  assert.equal(accountAlertState(acct({ dailyDd: { used: null, limit: null, left: null } })), null);
});
