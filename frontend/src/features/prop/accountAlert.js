import { fmtMoney } from '../../lib/metrics.js';

/* THE ACCOUNT ALERT — one strip at the top of the account card, six states, one truth.
 *
 * This file decides WHICH alert an account is in and WHAT it says. It draws nothing.
 * The presentation is AccountAlertBanner (components/primitives/account.jsx), which
 * knows about colours and knows nothing about drawdown; keeping the two apart is what
 * lets the whole state machine be tested with mock numbers and no DOM.
 *
 * IT REPLACES A BANNER THAT FIRED ON THE WRONG SIGNAL. The card used to show one red
 * strip when `healthStatus(...) === 'bad'` — a blended 0-100 score over three meters —
 * while its copy read "is close to today's loss limit". That sentence could be false at
 * the moment it appeared: a health score can fall to `bad` on max drawdown alone. The
 * states below each name the rule they are actually about, and quote its number.
 *
 * ── ONE BANNER, NOT SIX. ────────────────────────────────────────────────────────────
 * Several conditions are true at once far more often than not — an account near its
 * daily limit is usually near its overall one too. Stacking a strip per condition would
 * push the meters that explain them below the fold, so exactly one is chosen, by
 * priority, and the meters underneath carry the rest.
 *
 * ── THE PRIORITY, AND THE ONE PLACE IT DEPARTS FROM A FIXED LADDER. ─────────────────
 *   1. ACCOUNT BREACH
 *   2. the drawdown warning that is CLOSER TO ITS OWN LIMIT (max DD wins a tie)
 *   3. PHASE PASSED
 *   4. TARGET REACHED
 *   5. TARGET NEAR
 *   6. nothing
 *
 * Risk always outranks profit progress — an account about to die does not need to be
 * told it is doing well. Between the two risk warnings, ranking them by how close each
 * is to ITS OWN limit rather than fixing max-DD above daily-DD is a deliberate call
 * (owner decision): a fixed ladder hides daily DD at 95%, which can end the account
 * within the hour, behind max DD at 80%, which still has a fifth of its band left.
 *
 * ── WHAT "BREACHED" MEANS HERE, AND WHY IT IS NOT JUST 100%. ────────────────────────
 * A percentage is CURRENT headroom, and `fracRemaining` is clamped to [0,1]. The
 * engine's `breach.breached` is a different and stronger thing: a historical scan over
 * every past day for daily DD, and over a MOVING floor for a trailing max DD. An
 * account can be breached with its current percentage back under 100 — equity
 * recovered, the account is still gone. The backend settles the challenge on that flag
 * (challengeStatus.js), so a banner that judged breach on the percentage alone would be
 * a second opinion that could tell a trader they are fine while the app has already
 * recorded them as failed. The flag is OR-ed in; the percentage rule is kept for the
 * live-crossing case, where the flag has not been written yet.
 *
 * ── AND WHY "PHASE PASSED" IS NOT THE PROFIT TARGET ALONE. ──────────────────────────
 * A pass needs the target AND the minimum trading days (owner decision 2026-08-27, in
 * challengeStatus.js: "hitting 8% on day two of a three-day minimum is not a pass at
 * any firm"). Announcing a pass on the number alone would send a trader to add a Phase 2
 * account their firm has not issued. So the target-reached case splits: PHASE_PASSED
 * when the days are in, TARGET_REACHED when they are not — same green strip, honest
 * sentence, and it matches the `target_reached` alert the backend already emits.
 */

export const ALERT = {
  BREACH: 'ACCOUNT_BREACH',
  MAX_DD: 'MAX_DD_WARNING',
  DAILY_DD: 'DAILY_DD_WARNING',
  PHASE_PASSED: 'PHASE_PASSED',
  TARGET_REACHED: 'TARGET_REACHED',
  TARGET_NEAR: 'TARGET_NEAR',
};

/* INCLUSIVE, and stated once. 75.0% of the daily limit is a warning; 74.9% is not.
 * Every comparison below reads from here so a threshold cannot be half-changed. */
export const THRESHOLDS = {
  dailyDd: 0.75,
  maxDd: 0.80,
  target: 0.75,
  breach: 1,
};

const PHASE_LABEL = { p1: 'Phase 1', p2: 'Phase 2', p3: 'Phase 3', funded: 'Funded' };

const pct = (used, limit) => (limit > 0 ? used / limit : null);

/* Percentages are rendered from the RATIO, not re-derived from the copy, and rounded
 * the way a trader reads them: 88%, not 87.6%. `Math.round` and not `toFixed` because
 * 80.0% would print a decimal point that means nothing on a threshold. */
const asPercent = (frac) => `${Math.round((frac ?? 0) * 100)}%`;

/**
 * Normalise one account into the shape this file reasons about.
 *
 * THE ADAPTER IS THE WHOLE POINT OF THE SPLIT. `challengeState` (src/domain/prop/prop.js)
 * reports headroom — `roomLeft`, `fracRemaining` — because that is what the meters draw.
 * The alert reasons in consumption. Converting once, here, means the thresholds below
 * are read in the same direction they are written, and a test can hand this function's
 * OUTPUT straight in without standing up an engine state.
 *
 * @param {object} data one entry from GET /api/prop
 * @returns {object|null} null when the account carries no rules to alert on
 */
export function describeAccount(data) {
  if (!data || !data.maxDd) return null; // a manual/live account has no firm rules
  const maxUsed = data.maxDd.limit != null && data.maxDd.roomLeft != null
    ? data.maxDd.limit - data.maxDd.roomLeft
    : null;
  return {
    accountName: data.label || `Account ${data.account_id}`,
    accountId: data.account_id,
    phase: data.phase,
    dailyDd: { used: data.dailyDd?.usedToday ?? null, limit: data.dailyDd?.limit ?? null, left: data.dailyDd?.roomLeft ?? null },
    maxDd: { used: maxUsed, limit: data.maxDd.limit ?? null, left: data.maxDd.roomLeft ?? null },
    profitTarget: data.profitTarget
      ? { current: data.profitTarget.current, target: data.profitTarget.target }
      : null,
    breached: Boolean(data.breach?.breached),
    breachReason: data.breach?.reason ?? null,
    tradingDaysMet: data.tradingDays ? data.tradingDays.met !== false : true,
    tradingDaysLeft: data.tradingDays?.remaining ?? 0,
  };
}

/**
 * The three ratios every state below is decided on. Any of them can be null (a funded
 * account has no profit target; an account with no daily rule has no daily ratio), and
 * a null never satisfies a threshold — `null >= 0.75` is false, but it is written as an
 * explicit guard rather than leaned on.
 */
export function alertMetrics(acct) {
  if (!acct) return { dailyPct: null, maxPct: null, targetPct: null, breached: false };
  return {
    dailyPct: pct(acct.dailyDd?.used, acct.dailyDd?.limit),
    maxPct: pct(acct.maxDd?.used, acct.maxDd?.limit),
    targetPct: acct.profitTarget ? pct(acct.profitTarget.current, acct.profitTarget.target) : null,
    breached: Boolean(acct.breached),
  };
}

const at = (v, threshold) => v != null && v >= threshold;

/**
 * WHICH state, and nothing else. Returns one of ALERT, or null for "no alert".
 *
 * Deliberately a chain of returns over the metrics rather than a rule table: the order
 * of these six clauses IS the priority, so reading the function top to bottom is
 * reading the priority, and there is no second place where it could be re-stated
 * differently.
 */
export function accountAlertState(acct) {
  const m = alertMetrics(acct);
  if (!acct) return null;

  // 1. Breach — the engine's verdict, or a live crossing it has not recorded yet.
  if (m.breached || at(m.dailyPct, THRESHOLDS.breach) || at(m.maxPct, THRESHOLDS.breach)) {
    return ALERT.BREACH;
  }

  // 2. The risk warnings, ranked by proximity to their own limit. Both are below 100%
  //    here — the breach clause above has already taken everything at or over it.
  const maxWarn = at(m.maxPct, THRESHOLDS.maxDd);
  const dailyWarn = at(m.dailyPct, THRESHOLDS.dailyDd);
  if (maxWarn || dailyWarn) {
    if (maxWarn && dailyWarn) return m.dailyPct > m.maxPct ? ALERT.DAILY_DD : ALERT.MAX_DD;
    return maxWarn ? ALERT.MAX_DD : ALERT.DAILY_DD;
  }

  // 3-5. Profit progress.
  if (at(m.targetPct, THRESHOLDS.breach)) {
    return acct.tradingDaysMet ? ALERT.PHASE_PASSED : ALERT.TARGET_REACHED;
  }
  if (at(m.targetPct, THRESHOLDS.target)) return ALERT.TARGET_NEAR;

  return null;
}

/* Copy. One sentence per state, always naming the account, the rule and its number —
 * "stop trading" without a reason is an instruction a trader overrides. */
function messageFor(state, acct, m) {
  const who = acct.accountName;
  const targetWord = acct.phase === 'funded' ? 'payout target' : 'profit target';

  switch (state) {
    case ALERT.BREACH: {
      // Which rule ended it: the engine's own reason when it has recorded one,
      // otherwise whichever limit is at or past 100 — max DD first, matching the
      // precedence challengeState uses when both are true.
      const byMax = acct.breachReason === 'max_dd'
        || (acct.breachReason == null && at(m.maxPct, THRESHOLDS.breach));
      return byMax
        ? `${who} has reached its ${fmtMoney(acct.maxDd.limit)} maximum drawdown. Account breach detected.`
        : `${who} has reached today's ${fmtMoney(acct.dailyDd.limit)} loss limit. Account breach detected.`;
    }
    case ALERT.MAX_DD:
      return `${who} is at ${asPercent(m.maxPct)} of its ${fmtMoney(acct.maxDd.limit)} maximum drawdown — ${fmtMoney(acct.maxDd.left)} remaining.`;
    case ALERT.DAILY_DD:
      return `${who} is at ${asPercent(m.dailyPct)} of today's ${fmtMoney(acct.dailyDd.limit)} loss limit — ${fmtMoney(acct.dailyDd.left)} left.`;
    case ALERT.PHASE_PASSED: {
      // A funded account has no phase to pass; its target being met means it can be
      // paid, which is a different sentence and not a smaller one.
      if (acct.phase === 'funded') {
        return `${who} has reached its ${fmtMoney(acct.profitTarget.target)} payout target. Payout eligible.`;
      }
      const name = PHASE_LABEL[acct.phase] ?? acct.phase;
      return `${who} has reached its ${fmtMoney(acct.profitTarget.target)} profit target. ${name} pass detected.`;
    }
    case ALERT.TARGET_REACHED: {
      const n = acct.tradingDaysLeft;
      return `${who} has reached its ${fmtMoney(acct.profitTarget.target)} ${targetWord} — ${n} more trading day${n === 1 ? '' : 's'} to pass.`;
    }
    case ALERT.TARGET_NEAR: {
      const toGo = Math.max(0, (acct.profitTarget.target ?? 0) - (acct.profitTarget.current ?? 0));
      return `${who} is ${asPercent(m.targetPct)} toward its ${fmtMoney(acct.profitTarget.target)} ${targetWord} — ${fmtMoney(toGo)} to go.`;
    }
    default:
      return null;
  }
}

/* Label, severity and which action the strip offers.
 *
 * `action` is an INTENT, not a button: 'lock' is the one real thing PropVexis can do
 * about a dying account (stop tracking it — it cannot reach into a prop firm and
 * disable a login), and 'challenge' opens the challenge the good news belongs to. The
 * card resolves each into a control, because only the card knows whether the account is
 * one it can act on. */
const PRESENTATION = {
  [ALERT.BREACH]: { label: 'Account breach', tone: 'breach', icon: 'danger', action: 'lock' },
  [ALERT.MAX_DD]: { label: 'Max DD warning', tone: 'severe', icon: 'warning', action: 'lock' },
  [ALERT.DAILY_DD]: { label: 'Daily DD warning', tone: 'caution', icon: 'warning', action: 'lock' },
  [ALERT.PHASE_PASSED]: { label: 'Phase passed', tone: 'success', icon: 'success', action: 'challenge' },
  [ALERT.TARGET_REACHED]: { label: 'Target reached', tone: 'success', icon: 'success', action: 'challenge' },
  [ALERT.TARGET_NEAR]: { label: 'Target near', tone: 'progress', icon: 'target', action: 'challenge' },
};

/**
 * The whole banner, decided: state, severity, icon, label, sentence and action intent —
 * or null when the account is in none of the six states and the strip should not render.
 *
 * @param {object} acct a describeAccount() result, or a mock in the same shape
 */
export function accountAlert(acct) {
  const state = accountAlertState(acct);
  if (!state) return null;
  const m = alertMetrics(acct);
  return { state, ...PRESENTATION[state], message: messageFor(state, acct, m), metrics: m };
}

/** Convenience for callers holding a raw GET /api/prop entry. */
export function accountAlertFor(data) {
  return accountAlert(describeAccount(data));
}
