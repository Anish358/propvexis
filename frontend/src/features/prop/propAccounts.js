// Prop OS › Accounts — the module's data shaping, kept JSX-free so
// test/prop-accounts.test.js (node:test) can import and validate it.
//
// NOTHING HERE DECIDES A RULE. Every dollar figure — drawdown room, target
// progress, trading days, breach — is computed server-side by
// src/domain/prop/prop.js and arrives on the state object whole. This file only
// SPLITS those states into the four locked sub-tabs and joins each one to its
// account record for the fields the engine has no reason to carry (firm name,
// account size, broker). A second copy of "what counts as breached" living here
// is exactly how the Dashboard and this page would start disagreeing.

const EVAL_PHASES = new Set(['p1', 'p2']);

// The two main tabs. LOCKED IA — Portfolio is the multi-account view, Details is
// the single-account workspace. There is no third.
export const ACCOUNT_TABS = [
  { value: 'portfolio', label: 'Portfolio' },
  { value: 'details', label: 'Details' },
];

// Portfolio's four status sub-tabs. LOCKED IA and LOCKED ORDER: an account's life
// runs Evaluation → Passed → Funded, with Breached as the exit at any point, and
// the row reads left to right in the order a trader meets them.
export const PORTFOLIO_TABS = [
  { value: 'evaluation', label: 'Evaluation' },
  { value: 'funded', label: 'Funded' },
  { value: 'passed', label: 'Passed' },
  { value: 'breached', label: 'Breached' },
];

// Mirrors src/domain/prop/propOverview.js's predicates rather than restating them
// loosely. A state with `challenge: null` is an account with no rules to be judged
// against, so it belongs in no status bucket at all — it is not "evaluation by
// default".
export const isLive = (s) => Boolean(s && s.challenge !== null && s.phase != null);
export const isBreached = (s) => Boolean(s?.breach?.breached);

export const PHASE_LABEL = { p1: 'Phase 1', p2: 'Phase 2', funded: 'Funded' };

/**
 * Join one engine state to its account record. The engine knows the CHALLENGE
 * (phase, limits, equity); the account record knows the COMMERCIAL facts (which
 * firm, what size, is it a manual account). A card needs both, and neither side
 * should learn the other's fields to provide it.
 */
export function accountRow(state, account) {
  return {
    ...state,
    accountId: state.account_id,
    label: state.label || account?.label || `Account ${state.account_id}`,
    firmName: account?.firm_name || 'Other',
    accountSize: account?.start_balance != null ? Number(account.start_balance) : state.startBalance,
    // The account row's `balance`/`equity` are the EA's last sync. The engine's
    // currentEquity is the number every meter on the card is measured against, so
    // it is what the card shows — the two can only differ while a sync is stale.
    balance: state.currentEquity,
    pnl: state.currentEquity != null && state.startBalance != null
      ? Math.round((state.currentEquity - state.startBalance) * 100) / 100
      : null,
    isManual: account?.kind === 'manual',
    archived: account?.is_active === false,
  };
}

/**
 * Split every owned account into the four Portfolio sub-tabs.
 *
 * `states`  — GET /api/prop/portfolio's `states`: one challengeState per login.
 * `passed`  — the same route's pass HISTORY: one row per pass event, not per
 *             account, because a re-taken account legitimately passed twice.
 * `accounts`— listAccounts() rows, already in the app-wide outlet context.
 *
 * Breached is checked FIRST and is exclusive: a breached evaluation account is
 * breached, not an evaluation account with a problem. That is the same precedence
 * accountsBreakdown uses server-side (it skips breached rows before bucketing).
 */
export function bucketAccounts({ states = [], passed = [], accounts = [] } = {}) {
  const acctByLogin = new Map(accounts.map((a) => [String(a.mt5_login), a]));

  const evaluation = [];
  const funded = [];
  const breached = [];

  for (const s of states) {
    if (!isLive(s)) continue;
    const row = accountRow(s, acctByLogin.get(String(s.account_id)));
    if (isBreached(s)) breached.push(row);
    else if (s.phase === 'funded') funded.push(row);
    else if (EVAL_PHASES.has(s.phase)) evaluation.push(row);
  }

  // Sorted by how much attention each needs, not alphabetically: the account
  // closest to a breach is the one a trader has to look at first, and health is
  // the engine's single answer to that question. Ties fall back to the name so
  // the order is stable between polls.
  const byRisk = (a, b) => (a.health?.score ?? 100) - (b.health?.score ?? 100)
    || String(a.label).localeCompare(String(b.label));

  return {
    evaluation: evaluation.sort(byRisk),
    funded: funded.sort(byRisk),
    // Already newest-first from the server; a pass is a dated record, so date
    // order is the only order that means anything.
    passed: [...passed],
    breached: breached.sort((a, b) => String(a.label).localeCompare(String(b.label))),
  };
}

/**
 * The account-balance progression for the Details tab's equity curve.
 *
 * Starts at the challenge's starting balance and adds each day's realized P&L, so
 * the line reads as the account's balance over time rather than as a P&L total
 * that happens to start at zero. Deliberately per DAY, not per trade: the axis is
 * a date axis, and two trades closing the same afternoon are one balance change a
 * trader recognises.
 *
 * `days` is computeMetrics(trades).days — the SAME per-day rollup the calendar and
 * the Dashboard's cumulative chart read, so all three can never disagree about
 * what a day earned. It follows the active filters for that reason, which is the
 * app-wide rule for every in-memory page; the account's true current equity is
 * server-computed and shown in the header and KPI row, unfiltered.
 */
export function equitySeries(startBalance, days = []) {
  // `Number(null)` is 0 and `Number('')` is 0, so a coerce-then-isFinite check
  // would chart an account with no known starting balance as one that started at
  // $0 and is now up by its entire P&L. An unknown balance has no curve.
  if (startBalance == null || startBalance === '') return [];
  const base = Number(startBalance);
  if (!Number.isFinite(base)) return [];
  if (!days.length) return [];

  let balance = base;
  const out = [];
  for (const d of days) {
    balance += d.pnl;
    out.push({ date: d.date, balance: Math.round(balance * 100) / 100 });
  }
  // A leading point at the starting balance, dated the day before the first
  // trading day, so the curve starts where the account did instead of at the
  // close of its first session.
  const first = new Date(out[0].date);
  first.setDate(first.getDate() - 1);
  return [{ date: first, balance: Math.round(base * 100) / 100 }, ...out];
}

/**
 * Which single account is the Details tab showing?
 *
 * The universal top-bar switcher is the ONE source of truth for account selection
 * (Details adds no switcher of its own), and its value is 'all' or a comma-joined
 * list of logins. Details is a single-account workspace, so anything that is not
 * exactly one login resolves to null and the tab renders its "pick an account"
 * state rather than guessing which of several was meant.
 */
export function selectedLogin(accountId) {
  if (!accountId || accountId === 'all') return null;
  const parts = String(accountId).split(',').filter(Boolean);
  return parts.length === 1 ? parts[0] : null;
}
