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

// 'p3' for the 3-Step account type (2026-08-25). Mirrors EVAL_PHASES in
// src/domain/prop/propOverview.js: a phase in neither this set nor 'funded' puts the
// account in no Portfolio bucket at all, so it disappears from the page.
const EVAL_PHASES = new Set(['p1', 'p2', 'p3']);

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

/* Mirrors src/domain/prop/propOverview.js's predicates rather than restating them
 * loosely. A state with `challenge: null` is an account with no rules to be judged
 * against, so it belongs in no status bucket at all — it is not "evaluation by default".
 *
 * `isLive` MEANS "STILL TRADING IT". Since the phase status went automatic (2026-08-27) a
 * settled phase KEEPS its challenge row — the read path reads the latest one so a breached
 * account still has figures to draw — so "has a challenge" stopped meaning "is running
 * it". Without the status check a passed Phase 1 would sit in the Evaluation tab for
 * weeks after the firm closed it, beside the Phase 2 account that replaced it.
 *
 * `isBreached` reads the engine's live verdict OR the settled row's, and needs both: the
 * engine sees a floor break the moment it happens, and the stored status is what survives
 * once the row is closed and the engine stops judging it. Without the second half a
 * breached account fell out of every bucket the moment its breach was recorded — the
 * account most worth looking at was the one the page stopped drawing. */
export const isSettled = (s) => s?.status === 'passed' || s?.status === 'breached';
export const isLive = (s) => Boolean(s && s.challenge !== null && s.phase != null && !isSettled(s));
export const isBreached = (s) => Boolean(s?.breach?.breached) || s?.status === 'breached';

export const PHASE_LABEL = { p1: 'Phase 1', p2: 'Phase 2', p3: 'Phase 3', funded: 'Funded' };

/**
 * Join one engine state to its account record. The engine knows the CHALLENGE
 * (phase, limits, equity); the account record knows the COMMERCIAL facts (which
 * firm, what size, is it a manual account). A card needs both, and neither side
 * should learn the other's fields to provide it.
 */
/**
 * How a minimum-trading-days requirement READS, wherever it is printed.
 *
 * ── IT STOPS COUNTING AT THE REQUIREMENT. ──────────────────────────────────────────
 * The card showed "4/3 days completed" — a fraction past its own denominator, which is
 * not a progress figure at all. Trading days are a GATE, not a tally: the firm asks for
 * three and the answer at three is yes. A fourth day changes nothing about the rule, so
 * counting it makes the reader work out whether 4/3 is good, or a bug, or the start of
 * some second requirement. `met` carries the fact; the count stops where it is decided.
 *
 * The RAW figure is untouched — `state.tradingDays.completed` still says how many days
 * the account has traded, which is a real fact other surfaces want. Only the way it
 * READS against a requirement is capped, and it is capped in ONE place so the dashboard,
 * Prop OS and the challenge cards cannot come to three different answers.
 *
 * @param {object|null} d  `state.tradingDays` from the engine
 * @returns {{ has: boolean, met: boolean, required: number, done: number, count: string|null }}
 *   `has` — is there a requirement to report at all
 *   `done` — days completed, never past `required`
 *   `count` — "3/3", already formatted, or null when there is no requirement
 */
export function tradingDaysRead(d) {
  const required = Number(d?.required ?? 0);
  if (!d || !(required > 0)) {
    // No requirement is not zero progress toward one — there is nothing to be met, and
    // `met: true` is what stops a caller drawing an unfinished gate for a rule the
    // account does not have.
    return { has: false, met: true, required: 0, done: Number(d?.completed ?? 0), count: null };
  }
  const completed = Number(d.completed ?? 0);
  const met = completed >= required;
  const done = Math.min(completed, required);
  return { has: true, met, required, done, count: `${done}/${required}` };
}

/* THE CONSISTENCY RULE, READ FOR A CARD. Mirrors tradingDaysRead exactly: one place
 * decides how this rule READS so that every surface showing it says the same thing,
 * while the rule itself is still decided server-side (consistencyState in
 * src/domain/prop/prop.js) and arrives whole.
 *
 * `has: false` for the accounts with no consistency rule — most of them — and a caller
 * draws nothing at all rather than an empty gate. Same contract as the day count.
 *
 * `pct: null` WITH `has: true` IS A REAL STATE, and the reason this returns two fields
 * rather than one string: the account carries a cap but has no profit yet, so there is
 * a rule to name and no ratio to name it against. A card shows the cap and waits. A 0%
 * would be a lie in the other direction — it reads as perfect compliance when what is
 * true is that nothing has been measured.
 *
 * NOTHING HERE RECOMPUTES THE RULE. `withinCap` is the engine's verdict, defaulted to
 * true only for a state that predates the field — never derived from pct vs cap here,
 * which is how this file and the engine would start disagreeing about a boundary case
 * (exactly 30.0% of profit on a 30% cap is COMPLIANT; <= is the industry's operator). */
export function consistencyRead(c) {
  const cap = Number(c?.cap);
  if (!c || !(cap > 0)) return { has: false, cap: null, pct: null, withinCap: true };
  const pct = c.pct == null ? null : Number(c.pct);
  return {
    has: true,
    cap,
    pct: pct == null || Number.isNaN(pct) ? null : pct,
    withinCap: c.withinCap !== false,
    bestDay: c.bestDay == null ? null : Number(c.bestDay),
    // How much more total profit brings the current best day inside the cap. The
    // engine sends it only when the account is over, which is the only time it means
    // anything.
    profitNeeded: c.profitNeeded == null ? null : Number(c.profitNeeded),
  };
}

/* A percentage as a card writes it: at most one decimal, and none when it is whole.
 * "42%" and "42.5%", never "42.0%" or "42.37%" — a share of profit is a figure a
 * trader compares to a round cap, and the second decimal is noise that makes the two
 * harder to compare at a glance. */
export function pctText(n) {
  if (n == null || Number.isNaN(Number(n))) return null;
  return `${String(Math.round(Number(n) * 10) / 10)}%`;
}

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
    // The account TYPE, carried through because the phase after this one depends on it:
    // a 2-Step goes p2 -> funded where a 3-Step goes p2 -> p3. The engine state knows the
    // current phase and nothing about how many there are.
    productId: account?.product_id ?? null,
    isManual: account?.kind === 'manual',
    archived: account?.is_active === false,
  };
}

/**
 * Order rows by how much attention each needs, not alphabetically: the account
 * closest to a breach is the one a trader has to look at first, and health is the
 * engine's single answer to that question. Ties fall back to the name so the order
 * is stable between polls.
 *
 * Exported (rather than living inside `bucketAccounts`) because Prop OS > Challenges
 * lists the same rows under a different grouping and has the same first question. A
 * second comparator there would be two answers to "which of these matters most".
 */
export const byRisk = (a, b) => (a.health?.score ?? 100) - (b.health?.score ?? 100)
  || String(a.label).localeCompare(String(b.label));

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
    // A state with no challenge at all has no bucket — that is a live-capital account or
    // one with no rules, and it is not "evaluation by default".
    if (!s || s.challenge === null || s.phase == null) continue;
    const row = accountRow(s, acctByLogin.get(String(s.account_id)));
    // BREACHED IS CHECKED FIRST AND IS EXCLUSIVE, and it is checked BEFORE isLive: a
    // breached phase is settled, so isLive is false for it, and testing that first would
    // drop the account out of every bucket. Which is exactly what happened when the
    // status became automatic.
    if (isBreached(s)) breached.push(row);
    // A PASSED phase belongs to the Passed tab, which is fed from the pass HISTORY below
    // — one entry per pass event. Leaving it out here is what stops it appearing twice,
    // once as a pass and once as an evaluation still in progress.
    else if (!isLive(s)) continue;
    else if (s.phase === 'funded') funded.push(row);
    else if (EVAL_PHASES.has(s.phase)) evaluation.push(row);
  }

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

/**
 * Only the accounts Prop OS is about — the client twin of propAccountsOnly in
 * domain/accounts/accounts.js.
 *
 * There are two because the app-wide outlet context deliberately carries EVERY
 * account: the account switcher must offer a live account, since you journal it
 * like any other. It is only the prop surfaces that must not — a live account has
 * no challenge, no drawdown floor and no target.
 *
 * A missing capital_kind counts as prop, matching the server, so an account list
 * cached from before migration 0026 does not blank the module.
 */
export const onlyPropCapital = (accounts) =>
  (Array.isArray(accounts) ? accounts : []).filter((a) => (a?.capital_kind ?? 'prop') === 'prop');
