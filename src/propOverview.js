import { round2 } from './derive.js';

// Prop OS → Overview. The BUSINESS view of a prop operation, as distinct from the
// trading view every other surface already gives.
//
// The distinction is the whole point of this module and worth stating once: the
// Dashboard answers "how did my trades perform?", and its numbers are P&L, win
// rate, expectancy. This answers "what is the state of my prop business today?",
// and its numbers are capital under management, fees paid, payouts due, evaluation
// success rate. A trader running eight accounts across three firms is running a
// small business; these are its books, not its trade log.
//
// Pure (no DB), mirroring finance.js / insights.js / prop.js — the route bulk-
// fetches and calls in, so every figure below is deterministic and unit-testable
// against a fixed `asOf`.
//
// ---- vocabulary -------------------------------------------------------------
// `accounts`  — listAccounts() rows (mt5_login, start_balance, firm, cycle fields)
// `states`    — propStatesForScope() results: one challengeState per login, the
//               LIVE rule state (drawdown room, target progress, trading days)
// `challenges`— challengesForScope(): the FULL history, every phase attempt ever,
//               including closed ones. Pass rates live here, not in `states`.
// `payouts` / `fees` — money in / money out, keyed by login.

const DAY_MS = 24 * 60 * 60 * 1000;

// UTC calendar day (YYYY-MM-DD), matching finance.js and prop.js's dayKey.
const dayOf = (ts) => (ts == null ? null : new Date(ts).toISOString().slice(0, 10));
const addDays = (ts, n) => new Date(new Date(ts).getTime() + n * DAY_MS);
const num = (v) => (v == null || v === '' ? null : Number(v));

const EVAL_PHASES = new Set(['p1', 'p2']);

// A state carries an active challenge when propStatesForScope found one; the
// `challenge: null` shape means the account has no rules to be judged against.
const isLive = (s) => s && s.challenge !== null && s.phase != null;
const isFunded = (s) => isLive(s) && s.phase === 'funded';
const isEval = (s) => isLive(s) && EVAL_PHASES.has(s.phase);
const isBreached = (s) => Boolean(s?.breach?.breached);

// ---------------------------------------------------------------------------
// Business KPIs. Six figures, five shown by default (monthly fees is opt-in) —
// see PROP_KPIS in frontend/src/propLayout.js for the display contract.
// ---------------------------------------------------------------------------

// Sum a numeric field, tolerating pg's string numerics and nulls.
const sum = (rows, f) => round2(rows.reduce((s, r) => s + (Number(r[f]) || 0), 0));

// Same calendar month as `asOf`, in UTC. Used for the two "this month" figures,
// which reset on the 1st rather than rolling a 30-day window — a trader reconciles
// against the firm's monthly statement, not against a trailing average.
const inMonth = (ts, asOf) => {
  const d = new Date(ts);
  const ref = new Date(asOf);
  return d.getUTCFullYear() === ref.getUTCFullYear() && d.getUTCMonth() === ref.getUTCMonth();
};

// Evaluation success rate — closed EVAL attempts only (p1/p2). Funded challenges
// are excluded deliberately: a funded account is not something you pass, so
// counting it would inflate the rate with attempts that were never evaluations.
// Null until at least one eval attempt has closed, so the card can say "no data"
// rather than print a misleading 0%.
export function evalSuccessRate(challenges = []) {
  let passed = 0;
  let breached = 0;
  for (const c of challenges) {
    if (!EVAL_PHASES.has(c.phase)) continue;
    if (c.status === 'passed') passed += 1;
    else if (c.status === 'breached') breached += 1;
  }
  const closed = passed + breached;
  return {
    passed,
    breached,
    attempts: closed,
    rate: closed > 0 ? round2((passed / closed) * 100) : null,
  };
}

export function businessKpis({ accounts = [], states = [], challenges = [], payouts = [], fees = [], asOf = new Date() } = {}) {
  const stateByLogin = new Map(states.map((s) => [Number(s.account_id), s]));

  // Total funding = capital actually under management: the starting balance of
  // every account whose ACTIVE challenge is the funded phase AND is still live.
  // Two exclusions, both deliberate:
  //   • evaluation accounts — that capital isn't yours to trade until you pass
  //   • breached funded accounts — the firm has stopped you trading it, so
  //     counting it would report buying power you don't have
  const fundedAccounts = accounts.filter((a) => {
    const s = stateByLogin.get(Number(a.mt5_login));
    return isFunded(s) && !isBreached(s);
  });

  // Active = has live rules and hasn't breached. A breached account still exists
  // as a row, but it is not part of the operating business until it's reset.
  const activeAccounts = accounts.filter((a) => {
    const s = stateByLogin.get(Number(a.mt5_login));
    return isLive(s) && !isBreached(s);
  });

  const monthPayouts = payouts.filter((p) => inMonth(p.payout_date, asOf));
  const monthFees = fees.filter((f) => inMonth(f.fee_date, asOf));

  return {
    totalEarned: sum(payouts, 'trader_amount'),
    activeAccounts: activeAccounts.length,
    totalFunding: sum(fundedAccounts, 'start_balance'),
    evalSuccess: evalSuccessRate(challenges),
    monthlyPayout: sum(monthPayouts, 'trader_amount'),
    monthlyFees: sum(monthFees, 'amount'),
  };
}

// ---------------------------------------------------------------------------
// Prop firms card — how many accounts you run at each firm, split funded vs eval.
// Accounts with no firm set (custom / pre-template) collect under "Other", the
// same bucket finance.js uses, so the two cards agree on firm attribution.
// ---------------------------------------------------------------------------

export function firmRollup({ accounts = [], states = [] } = {}) {
  const stateByLogin = new Map(states.map((s) => [Number(s.account_id), s]));
  const buckets = new Map();

  for (const a of accounts) {
    const s = stateByLogin.get(Number(a.mt5_login));
    if (!isLive(s) || isBreached(s)) continue; // breached accounts aren't "run" anywhere
    const id = a.firm_id ?? null;
    const key = id ?? '__other__';
    if (!buckets.has(key)) {
      buckets.set(key, { firmId: id, firmName: a.firm_name || 'Other', funded: 0, evaluation: 0 });
    }
    const b = buckets.get(key);
    if (isFunded(s)) b.funded += 1;
    else if (isEval(s)) b.evaluation += 1;
  }

  return [...buckets.values()]
    .map((b) => ({ ...b, total: b.funded + b.evaluation }))
    .filter((b) => b.total > 0)
    .sort((a, b) => b.funded - a.funded || b.total - a.total || a.firmName.localeCompare(b.firmName));
}

// ---------------------------------------------------------------------------
// Upcoming payouts.
//
// The next date is DERIVED on every read rather than stored as a scheduled row —
// see the note in db/migrations/0023_payout_cycle.sql for why. The anchor is the
// most recent thing that legitimately restarts a cycle:
//
//   explicit override (payout_anchor_date)  >  last recorded payout  >  challenge start
//
// and the due date is anchor + payout_cycle_days. There is no rolling-forward past
// today: if the date came and went with no payout recorded, that IS the fact worth
// surfacing ("you're due, go withdraw"), and silently advancing to the next cycle
// would hide it.
// ---------------------------------------------------------------------------

export const DEFAULT_PAYOUT_CYCLE_DAYS = 14;

export function nextPayoutDate({ account, payouts = [], challengeStart = null, asOf = new Date() } = {}) {
  const cycle = Number(account?.payout_cycle_days) > 0
    ? Number(account.payout_cycle_days)
    : DEFAULT_PAYOUT_CYCLE_DAYS;

  const login = Number(account?.mt5_login);
  const lastPayout = payouts
    .filter((p) => Number(p.account_id) === login)
    .map((p) => new Date(p.payout_date))
    .filter((d) => !Number.isNaN(d.getTime()) && d <= new Date(asOf))
    .sort((a, b) => b - a)[0] ?? null;

  const explicit = account?.payout_anchor_date ? new Date(account.payout_anchor_date) : null;
  const start = challengeStart ? new Date(challengeStart) : (account?.created_at ? new Date(account.created_at) : null);

  // Latest valid anchor wins: an override the trader typed beats our guess, and a
  // payout that landed after they typed it beats the override again.
  const anchor = [explicit, lastPayout, start]
    .filter((d) => d && !Number.isNaN(d.getTime()))
    .sort((a, b) => b - a)[0] ?? null;
  if (!anchor) return null;

  return { due: addDays(anchor, cycle), anchor, cycle, anchoredOn: explicit && explicit >= (lastPayout ?? explicit) ? 'override' : lastPayout ? 'last-payout' : 'start' };
}

// Withdrawable profit → the trader's share of it. Profit is equity above the
// challenge baseline; below baseline there is nothing to withdraw (never negative).
function payoutAmount(state, account) {
  if (!state || state.currentEquity == null || state.startBalance == null) return 0;
  const profit = state.currentEquity - state.startBalance;
  if (!(profit > 0)) return 0;
  const split = num(account?.payout_split_pct);
  return round2(profit * ((split == null ? 100 : split) / 100));
}

// Funded accounts only — an evaluation account cannot pay out at all, so listing
// one with a date would be a promise the firm won't keep.
export function upcomingPayouts({ accounts = [], states = [], payouts = [], asOf = new Date() } = {}) {
  const stateByLogin = new Map(states.map((s) => [Number(s.account_id), s]));
  const today = dayOf(asOf);

  return accounts
    .map((a) => {
      const state = stateByLogin.get(Number(a.mt5_login));
      if (!isFunded(state) || isBreached(state)) return null;

      const next = nextPayoutDate({
        account: a,
        payouts,
        challengeStart: state.tradingDays?.cycleStart ?? null,
        asOf,
      });
      if (!next) return null;

      const dueDay = dayOf(next.due);
      // Minimum trading days gate the firm actually enforces — a date you can't
      // act on yet is reported as such rather than as money waiting for you.
      const eligible = state.tradingDays ? state.tradingDays.met : true;
      const status = !eligible ? 'ineligible'
        : dueDay < today ? 'overdue'
          : dueDay === today ? 'due'
            : 'upcoming';

      return {
        accountId: Number(a.mt5_login),
        label: a.label || `Account ${a.mt5_login}`,
        firmName: a.firm_name || 'Other',
        amount: payoutAmount(state, a),
        dueDate: dueDay,
        cycleDays: next.cycle,
        anchoredOn: next.anchoredOn,
        status,
        daysToGo: state.tradingDays ? Math.max(0, state.tradingDays.remaining ?? 0) : 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.label.localeCompare(b.label)));
}

// ---------------------------------------------------------------------------
// Recent transactions — payouts and fees on ONE timeline, because that's how the
// money actually moved. Signed: a payout is money in (+), a fee is money out (−),
// so the column sums to the net the Finance page reports.
// ---------------------------------------------------------------------------

export function recentTransactions({ payouts = [], fees = [], accounts = [], limit = 8 } = {}) {
  const labelOf = new Map(accounts.map((a) => [Number(a.mt5_login), a.label || `Account ${a.mt5_login}`]));
  const name = (login) => labelOf.get(Number(login)) || `Account ${login}`;

  const rows = [
    ...payouts.map((p) => ({
      id: `payout:${p.id}`,
      kind: 'payout',
      date: p.payout_date,
      accountId: Number(p.account_id),
      accountLabel: name(p.account_id),
      description: 'Payout',
      amount: round2(Number(p.trader_amount) || 0),
      note: p.note ?? null,
    })),
    ...fees.map((f) => ({
      id: `fee:${f.id}`,
      kind: 'fee',
      date: f.fee_date,
      accountId: Number(f.account_id),
      accountLabel: name(f.account_id),
      description: FEE_LABEL[f.fee_type] || 'Fee',
      amount: round2(-(Number(f.amount) || 0)),
      note: f.note ?? null,
    })),
  ];

  return rows
    .sort((a, b) => new Date(b.date) - new Date(a.date) || (a.id < b.id ? 1 : -1))
    .slice(0, limit);
}

const FEE_LABEL = {
  evaluation: 'Evaluation fee',
  reset: 'Reset fee',
  activation: 'Activation fee',
  other: 'Fee',
};

// ---------------------------------------------------------------------------
// Accounts card — a ring of the portfolio's composition plus one table per slice.
//
// The three slices answer different questions, so they carry different columns
// (this is the spec, and it's right): a funded account is judged on what it has
// PAID, an evaluation account on what it still has to EARN, and a passed
// evaluation is a historical record with two dates.
//
// "Passed" counts distinct accounts that have EVER passed an evaluation phase,
// read from challenge history — not a current state. An account that passed
// Phase 1 last week is counted here and is also, correctly, in `evaluation`
// (it's now sitting in Phase 2). The ring therefore describes the portfolio's
// track record alongside its current shape, which is what makes it a business
// read rather than a status read.
// ---------------------------------------------------------------------------

export function accountsBreakdown({ accounts = [], states = [], challenges = [], payouts = [] } = {}) {
  const stateByLogin = new Map(states.map((s) => [Number(s.account_id), s]));
  const acctByLogin = new Map(accounts.map((a) => [Number(a.mt5_login), a]));

  const paidByLogin = new Map();
  for (const p of payouts) {
    const k = Number(p.account_id);
    paidByLogin.set(k, round2((paidByLogin.get(k) || 0) + (Number(p.trader_amount) || 0)));
  }

  const funded = [];
  const evaluation = [];
  for (const a of accounts) {
    const login = Number(a.mt5_login);
    const s = stateByLogin.get(login);
    if (!isLive(s) || isBreached(s)) continue;
    const pnl = s.currentEquity != null && s.startBalance != null ? round2(s.currentEquity - s.startBalance) : null;

    if (isFunded(s)) {
      funded.push({
        accountId: login,
        label: a.label || `Account ${login}`,
        firmName: a.firm_name || 'Other',
        pnl,
        totalPaid: paidByLogin.get(login) || 0,
      });
    } else if (isEval(s)) {
      // What's left to pass, in dollars — the number an evaluation trader is
      // actually working toward. Null when the phase carries no target.
      const t = s.profitTarget;
      evaluation.push({
        accountId: login,
        label: a.label || `Account ${login}`,
        firmName: a.firm_name || 'Other',
        phase: s.phase,
        pnl,
        remainingToPass: t ? round2(Math.max(0, t.target - t.current)) : null,
        targetReached: Boolean(t?.reached),
      });
    }
  }

  // One row per PASS EVENT, newest first — a re-taken account legitimately appears
  // twice, because it passed twice.
  const passed = challenges
    .filter((c) => c.status === 'passed' && EVAL_PHASES.has(c.phase))
    .map((c) => {
      const login = Number(c.mt5_login);
      const a = acctByLogin.get(login);
      return {
        accountId: login,
        challengeId: c.id,
        label: a?.label || c.label || `Account ${login}`,
        firmName: a?.firm_name || c.firm_name || 'Other',
        phase: c.phase,
        startDate: dayOf(c.start_date),
        passedDate: dayOf(c.passed_at),
      };
    })
    .sort((a, b) => (a.passedDate < b.passedDate ? 1 : a.passedDate > b.passedDate ? -1 : 0));

  const passedAccounts = new Set(passed.map((p) => p.accountId));

  return {
    ring: { funded: funded.length, evaluation: evaluation.length, passed: passedAccounts.size },
    funded: funded.sort((a, b) => b.totalPaid - a.totalPaid || a.label.localeCompare(b.label)),
    evaluation: evaluation.sort((a, b) => (b.pnl ?? 0) - (a.pnl ?? 0) || a.label.localeCompare(b.label)),
    passed,
  };
}

// ---------------------------------------------------------------------------
// Calendar markers. The Overview reuses the Dashboard's MonthCalendar verbatim —
// trading / profit / loss days already come from the journal's per-day rollup, so
// all this adds is the BUSINESS events that belong on the same grid: when a phase
// was passed, when a challenge broke, when money moved.
//
// Returns a flat, day-keyed list; the client groups it per cell. Breach days come
// from the persisted `breached_at` on closed challenges rather than the live
// engine state, so a breach stays on the calendar after the account is reset.
// ---------------------------------------------------------------------------

export function propCalendarEvents({ challenges = [], payouts = [], accounts = [] } = {}) {
  const labelOf = new Map(accounts.map((a) => [Number(a.mt5_login), a.label || `Account ${a.mt5_login}`]));
  const name = (login) => labelOf.get(Number(login)) || `Account ${login}`;
  const out = [];

  for (const c of challenges) {
    if (c.passed_at) {
      out.push({
        day: dayOf(c.passed_at),
        kind: 'milestone',
        accountId: Number(c.mt5_login),
        label: `${name(c.mt5_login)} passed ${PHASE_LABEL[c.phase] || c.phase}`,
      });
    }
    if (c.breached_at) {
      out.push({
        day: dayOf(c.breached_at),
        kind: 'breach',
        accountId: Number(c.mt5_login),
        label: `${name(c.mt5_login)} breached${c.breach_reason ? ` (${BREACH_LABEL[c.breach_reason] || c.breach_reason})` : ''}`,
      });
    }
  }

  for (const p of payouts) {
    out.push({
      day: dayOf(p.payout_date),
      kind: 'payout',
      accountId: Number(p.account_id),
      label: `${name(p.account_id)} payout`,
      amount: round2(Number(p.trader_amount) || 0),
    });
  }

  return out
    .filter((e) => e.day)
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

const PHASE_LABEL = { p1: 'Phase 1', p2: 'Phase 2', funded: 'Funded' };
const BREACH_LABEL = { max_dd: 'max drawdown', daily_dd: 'daily drawdown' };

// ---------------------------------------------------------------------------
// Prop Brief — the two-column attention banner, same split as the Dashboard's
// Today's Brief but about the BUSINESS: left is "what could go wrong / what's
// nearly won", right is "what's scheduled / what's gone quiet".
//
// Every item is derived from state that already exists. Notably absent:
// CHALLENGE EXPIRATIONS. Nothing in the schema records a challenge deadline —
// no expiry column, nothing the EA reports — and most modern prop firms sell
// unlimited-time evaluations. Deriving a date from `start_date` would be
// inventing the firm's terms, so the section is left out until an expiry field
// exists to drive it. Adding one is a data change plus one block here.
//
// `lastTradeAt` is a Map(login -> ISO timestamp) supplied by the caller; the
// engine states don't carry it.
// ---------------------------------------------------------------------------

export const INACTIVE_DAYS = 14;
const NEAR_VIOLATION_FRAC = 0.25; // ≤25% of the drawdown allowance left
const PAYOUT_HORIZON_DAYS = 7;

export function propBrief({
  accounts = [], states = [], challenges = [], payouts = [],
  lastTradeAt = new Map(), asOf = new Date(),
} = {}) {
  const stateByLogin = new Map(states.map((s) => [Number(s.account_id), s]));
  const left = [];
  const right = [];
  const nameOf = (a) => a.label || `Account ${a.mt5_login}`;

  for (const a of accounts) {
    const login = Number(a.mt5_login);
    const s = stateByLogin.get(login);
    if (!isLive(s)) continue;
    const acct = nameOf(a);

    // --- left: risk and progress -------------------------------------------
    if (isBreached(s)) {
      left.push({
        id: `breached:${login}`, kind: 'breach', severity: 'critical', accountId: login,
        title: `${acct} breached`,
        detail: s.breach.reason === 'max_dd' ? 'Max drawdown hit — challenge failed.' : 'Daily drawdown hit — challenge failed.',
      });
      continue; // a failed challenge has no meaningful progress left to report
    }

    const maxFrac = s.maxDd?.fracRemaining;
    const dayFrac = s.dailyDd?.fracRemaining;
    if (maxFrac != null && maxFrac <= NEAR_VIOLATION_FRAC) {
      left.push({
        id: `maxdd:${login}`, kind: 'near-violation', severity: maxFrac <= 0.1 ? 'critical' : 'warning', accountId: login,
        title: `${acct} close to max drawdown`,
        detail: `${money(s.maxDd.roomLeft)} of room left.`,
      });
    }
    if (dayFrac != null && dayFrac <= NEAR_VIOLATION_FRAC) {
      left.push({
        id: `dailydd:${login}`, kind: 'near-violation', severity: dayFrac <= 0.1 ? 'critical' : 'warning', accountId: login,
        title: `${acct} close to daily loss limit`,
        detail: `${money(s.dailyDd.roomLeft)} left today.`,
      });
    }

    if (s.profitTarget?.reached) {
      left.push({
        id: `target:${login}`, kind: 'target-hit', severity: 'good', accountId: login,
        title: `${acct} hit its profit target`,
        detail: s.tradingDays?.met
          ? 'Ready to pass this phase.'
          : `${s.tradingDays?.remaining ?? 0} more trading day(s) required first.`,
      });
    }

    if (s.tradingDays && !s.tradingDays.met && s.tradingDays.required > 0) {
      left.push({
        id: `days:${login}`, kind: 'trading-days', severity: 'info', accountId: login,
        title: `${acct}: ${s.tradingDays.remaining} trading day(s) to go`,
        detail: `${s.tradingDays.completed} of ${s.tradingDays.required} complete.`,
      });
    }

    // --- right: schedule and staleness -------------------------------------
    const last = lastTradeAt.get(login) ?? lastTradeAt.get(String(login));
    const idleDays = last ? Math.floor((new Date(asOf) - new Date(last)) / DAY_MS) : null;
    if (idleDays != null && idleDays >= INACTIVE_DAYS) {
      right.push({
        id: `idle:${login}`, kind: 'inactive', severity: 'warning', accountId: login,
        title: `${acct} inactive ${idleDays} days`,
        detail: 'No trades recorded since then.',
      });
    }
  }

  // Payouts landing inside the horizon, plus anything already overdue.
  const horizon = dayOf(addDays(asOf, PAYOUT_HORIZON_DAYS));
  for (const p of upcomingPayouts({ accounts, states, payouts, asOf })) {
    if (p.status === 'ineligible' || p.dueDate > horizon) continue;
    right.push({
      id: `payout:${p.accountId}`, kind: 'payout', severity: p.status === 'overdue' ? 'warning' : 'info', accountId: p.accountId,
      title: `${p.label}: payout ${p.status === 'overdue' ? 'overdue' : `due ${p.dueDate}`}`,
      detail: `${money(p.amount)} available.`,
    });
  }

  // Passed an evaluation with no funded account running yet — the firm owes you a
  // login and it's easy to lose track of.
  const anyFunded = accounts.some((a) => isFunded(stateByLogin.get(Number(a.mt5_login))));
  const awaiting = challenges.filter((c) => c.status === 'passed' && c.phase === 'p2');
  for (const c of awaiting) {
    const login = Number(c.mt5_login);
    const s = stateByLogin.get(login);
    if (isFunded(s)) continue; // already trading it
    right.push({
      id: `awaiting:${c.id}`, kind: 'awaiting-funded', severity: 'info', accountId: login,
      title: `${c.label || `Account ${login}`} passed evaluation`,
      detail: anyFunded ? 'Funded account not set up yet.' : 'Waiting on the funded account from the firm.',
    });
  }

  const rank = { critical: 0, warning: 1, good: 2, info: 3 };
  const bySeverity = (a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9);
  return { left: left.sort(bySeverity), right: right.sort(bySeverity) };
}

const money = (n) => `$${Number(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
