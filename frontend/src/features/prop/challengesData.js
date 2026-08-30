// Prop OS › Challenges — the module's data shaping, kept JSX-free so
// test/prop-challenges.test.js (node:test) can import and validate it.
//
// WHAT A "CHALLENGE" IS IN THIS APP, because the module only makes sense once that
// is stated. The `challenges` table holds one row per PHASE ATTEMPT on an account
// (see db/migrations/0016), and an account has at most one ACTIVE row at a time.
// So the thing a trader calls "my FTMO $100k challenge" is not one row — it is one
// prop ACCOUNT plus the run of rows it has accumulated on its way from Phase 1 to
// Funded. That is the object this module assembles, from three sources that already
// exist:
//
//   the account record   which firm, what size, what it is called   (GET /api/accounts)
//   the engine state     live figures for the ACTIVE phase only     (GET /api/prop/portfolio)
//   the challenge rows   the rule snapshot + dates of every phase   (GET /api/prop/history)
//
// NO NEW DATA MODEL, AND NO NEW ENDPOINT. Every figure below is read off one of
// those three; nothing here decides a rule. Drawdown room, target progress and
// trading days are computed server-side by src/domain/prop/prop.js and arrive whole,
// exactly as they do for Prop OS › Accounts — which is also why this file imports
// that module's joins (`accountRow`, `byRisk`) rather than repeating them.
// A second copy of "which of these accounts matters most" is how two pages start
// disagreeing about the same portfolio.

import { findFirm, findProduct, phasesFor, UNLISTED_FIRM_ID } from './propFirms.js';
import {
  PHASE_LABEL, accountRow, byRisk,
} from './propAccounts.js';

const round2 = (n) => (n == null || Number.isNaN(n) ? null : Math.round(n * 100) / 100);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// The two main tabs. LOCKED IA — Challenges is the multi-challenge workspace
// grouped by prop firm, Details is the single-challenge lifecycle. There is no
// third, and neither is a route: see PropChallenges.jsx.
export const CHALLENGE_TABS = [
  { value: 'challenges', label: 'Challenges' },
  { value: 'details', label: 'Details' },
];

// The prop-firm selector's "no firm chosen" value. A sentinel rather than null so
// the selector is a plain `Tabs` value like every other switcher in the app.
export const ALL_FIRMS = 'all';

// The lifecycle, in the only order it happens. LOCKED — Phase 1 → Phase 2 → Funded
// is the product's spine, and `phase` on a challenge row is one of exactly these.
// 'p3' added 2026-08-25 with the 3-Step account type. This is the ORDER, not the set an
// account has — challengeStages() below picks which of these a given account shows.
export const STAGE_ORDER = ['p1', 'p2', 'p3', 'funded'];

/* WHAT "WE DO NOT KNOW" MEANS: the two-evaluation lifecycle, which is what almost every
 * prop account is. It is deliberately NOT `STAGE_ORDER`, and that distinction arrived
 * with p3 — falling back to the whole order would have drawn a Phase 3 stage on every
 * account whose type we cannot resolve, which is every account created before the fixed
 * taxonomy. A stage nobody has to pass, shown as pending, is worse than a missing one. */
export const DEFAULT_STAGES = ['p1', 'p2', 'funded'];

// A stage's position in the journey, as a word. Colour reinforces it and never
// replaces it — the rule the whole Prop OS surface follows.
export const STAGE_STATUS_LABEL = {
  complete: 'Passed',
  active: 'Active',
  breached: 'Breached',
  upcoming: 'Upcoming',
  skipped: 'Not Part Of This Challenge',
  /* A phase cleared at the firm that this app never held an account for — the trader
   * joined mid-challenge. It is NOT `complete`, which means "we have the account and the
   * row that passed it", and the two must not share a word: one is a record, the other
   * is an inference from the fact that a later phase exists at all. The rail draws it as
   * passed-but-outlined for the same reason. */
  untracked: 'Passed · Not Tracked',
};

/**
 * Which stages does a challenge at this firm — or this firm's product — actually
 * have?
 *
 * Not every product runs two evaluation phases, and the locked lifecycle must adapt
 * to the challenge rather than print a Phase 2 that will never exist. The answer
 * comes from the rule-template catalog (propFirms.js) — the same catalog that
 * pre-fills an account's rules — so supporting a one-step or instant-funding product
 * stays a data change there. A firm in that catalog is a `products` array, not a
 * flat `phases` list, because the rules differ per product (1-Step vs. 2-Step vs.
 * Instant Funding), not just per phase.
 *
 * `productId` is optional: an account created before the products layer (or one
 * whose firm was typed by hand) carries no `product_id`, so a caller may only
 * ever have a `firmId`. When it is given and resolves, the stages come from
 * THAT product's phases alone — an Instant Funding challenge has no Phase 1 or
 * Phase 2, and printing either would be inventing a stage that product does not
 * run. Without a resolved product, the stages come from the UNION of phase ids
 * across all of the firm's products, so a firm page that cannot yet tell which
 * product an account is on still shows every stage any of its products might
 * reach, rather than guessing one.
 *
 * An account whose firm was typed by hand carries no `firm_id` and so has no
 * catalog entry. It gets the full three, because "we don't know" is not the same
 * fact as "this firm has no Phase 2", and claiming the second would be inventing.
 */
export function challengeStages(firmId, productId) {
  // THE ACCOUNT TYPE ANSWERS THIS DIRECTLY when it is one of the four the wizard offers:
  // a 2-Step has p1/p2/funded and a 3-Step has p1/p2/p3/funded, whatever the firm's
  // catalog entry says. Checked FIRST because the catalog no longer decides the type —
  // an account created since 2026-08-25 carries '3step' against a firm whose catalog
  // entry lists two phases, and the catalog branch below would show it three stages
  // instead of four. Older accounts carry 'custom' or a catalog id and fall through.
  const fixed = phasesFor(productId);
  if (fixed.length) return STAGE_ORDER.filter((id) => fixed.includes(id));

  const firm = findFirm(firmId);
  if (!firm) return [...DEFAULT_STAGES];
  const product = findProduct(firmId, productId);
  const ids = new Set(
    product
      ? product.phases.map((p) => p.id)
      : firm.products.flatMap((p) => p.phases.map((ph) => ph.id)),
  );
  const stages = STAGE_ORDER.filter((id) => ids.has(id));
  return stages.length ? stages : [...DEFAULT_STAGES];
}

/**
 * The grouping key for a prop firm.
 *
 * `firm_id` when the account was created from the catalog, the lower-cased name
 * otherwise: a trader who typed "FTMO" on one account and picked FTMO from the
 * template on another still has two accounts at one firm, and the selector must not
 * show two tabs for it. Keys are namespaced so a firm whose id happens to match
 * another's name cannot collide.
 *
 * The wizard's escape hatch is deliberately keyed by NAME too, even though it does
 * carry a firm_id: that id is 'other' for EVERY unlisted firm, so keying on it would
 * merge FundedNext with Alpha Capital — their equity, fees and ROI under one tab,
 * which is the misclassification the escape hatch exists to end. It also keeps a
 * wizard-created unlisted account in the same bucket as a pre-wizard hand-typed one
 * at the same firm. Sound because the firm step is not complete until an unlisted
 * firm has a typed name (newAccountFlow COMPLETE.firm).
 */
export const firmKeyOf = (account) => (account?.firm_id && account.firm_id !== UNLISTED_FIRM_ID
  ? `id:${account.firm_id}`
  : `name:${String(account?.firm_name || 'Other').toLowerCase()}`);

/**
 * One card row per live challenge, newest-attention-first.
 *
 * `states`   — GET /api/prop/portfolio's `states`: one challengeState per login.
 * `accounts` — listAccounts() rows, already in the app-wide outlet context.
 *
 * A state with `challenge: null` is an account with no rules to be judged against,
 * so it is not a challenge at all and is dropped — the same reading `bucketAccounts`
 * takes of the same payload. Breached challenges are KEPT: a challenge you broke is
 * still one of your challenges, and hiding it would make the firm's card count
 * disagree with the trader's memory.
 */
export function challengeRows({ states = [], accounts = [] } = {}) {
  const acctByLogin = new Map(accounts.map((a) => [String(a.mt5_login), a]));
  return states
    /* "HAS A CHALLENGE", not `isLive`, and the header above already says why: a challenge
     * you broke is still one of your challenges. `isLive` became narrower when the phase
     * status went automatic (it now means "still trading it"), so filtering on it here
     * would drop every settled phase from the Details tab — the one place a trader goes to
     * read what happened to it. A state with no challenge at all is still dropped: that is
     * an account with no rules, and it is not a challenge. */
    .filter((s) => Boolean(s && s.challenge !== null && s.phase != null))
    .map((s) => {
      const account = acctByLogin.get(String(s.account_id));
      return {
        ...accountRow(s, account),
        firmId: account?.firm_id ?? null,
        firmKey: firmKeyOf(account),
        // listAccounts() selects product_id (migration 0026), so it rides the
        // outlet context onto `account` — pass it through so an Instant Funding
        // or 1-Step challenge does not render a Phase 2 it does not run. NULL on
        // an older row falls back to challengeStages' own union-across-products
        // behaviour, unchanged.
        stages: challengeStages(account?.firm_id, account?.product_id),
      };
    })
    .sort(byRisk);
}

/* groupByFirm LIVED HERE AND IS GONE (2026-08-27). It grouped ACCOUNT rows for the
 * Challenges grid, and that grid is built from CHALLENGES now — one card per
 * challenge_groups row, however many accounts are its phases. Its replacement is
 * `groupChallengesByFirm` in challengeGroups.js, next to the rows it groups.
 *
 * `challengeRows` above STAYS and is not the same function: the Details tab is a
 * single-ACCOUNT workspace walking one login's attempt history, which is a different
 * question from a challenge's phases. `firmOptions` below stays too — the firm groups it
 * labels have the same shape whichever rows are in them. */

/**
 * The prop-firm selector's options: All, then one per firm, each with the count of
 * challenges behind it. Returned as plain data (no JSX) — the page renders the
 * count with the app's `CountBadge`, which is the one count primitive.
 */
export function firmOptions(groups = []) {
  const total = groups.reduce((s, g) => s + g.rows.length, 0);
  return [
    { value: ALL_FIRMS, label: 'All', count: total },
    ...groups.map((g) => ({ value: g.key, label: g.name, count: g.rows.length })),
  ];
}

/* challengeCounts LIVED HERE AND IS GONE, with groupByFirm and for the same reason: it
 * counted account rows and their breaches, where the section subtitle now counts
 * CHALLENGES and how many are awaiting their next phase — which is the actionable number
 * and is derived on the page, from the challenge rows it is describing. */

/**
 * THE MODULE'S CENTRAL DERIVATION: the selected challenge's Phase 1 → Phase 2 →
 * Funded lifecycle, as three (or fewer) stages with a status each.
 *
 * `phase`   — the ACTIVE challenge's phase: where the journey currently stands.
 * `stages`  — this firm's stage list, from challengeStages().
 * `breached`— the engine's live breach verdict for the active challenge.
 * `history` — GET /api/prop/history's rows for the account, newest first, or NULL.
 *
 * NOTHING IS HARD-CODED: position comes from `phase`, and the dates and rule
 * snapshots come from the rows. A stage is
 *
 *   active     the phase the challenge is on now
 *   breached   that same phase, when the engine says the rule is broken
 *   complete   a phase behind the current one that has a row to show for it
 *   skipped    a phase behind the current one with NO row — the challenge never
 *              ran it (an account registered straight into funding is the case),
 *              which is a different fact from "passed" and must not read as one
 *   upcoming   a phase ahead of the current one
 *
 * `history: null` means NOT LOADED YET rather than empty, and that distinction is
 * load-bearing: the challenge cards derive their position from `phase` alone (one
 * portfolio fetch, no per-card request), and without it every earlier phase on
 * every card would come out "skipped".
 */
export function challengeLifecycle({
  phase = null, stages = DEFAULT_STAGES, breached = false, history = null,
} = {}) {
  const known = Array.isArray(history);
  const idx = stages.indexOf(phase);

  return stages.map((id, i) => {
    const attempts = known ? history.filter((h) => h.phase === id) : [];
    // Rows arrive newest-first, so the first match of a status is the latest one.
    const active = attempts.find((h) => h.status === 'active') || null;
    const passed = attempts.find((h) => h.status === 'passed') || null;
    const failed = attempts.find((h) => h.status === 'breached') || null;

    let status;
    // An unknown current phase claims nothing about any stage rather than
    // guessing — every stage reads as still ahead.
    if (idx === -1 || i > idx) status = 'upcoming';
    else if (i === idx) status = breached ? 'breached' : 'active';
    else status = !known || attempts.length > 0 ? 'complete' : 'skipped';

    // The row that EXPLAINS the status: the live one where there is one, else the
    // pass that closed the stage, else the breach that ended it.
    const challenge = active || passed || failed || null;

    return {
      id,
      label: PHASE_LABEL[id] || id,
      status,
      current: i === idx,
      step: i + 1,
      of: stages.length,
      // More than one row at a phase is a RE-TAKE, which is worth surfacing: a
      // trader on their third Phase 1 is having a different month than one on
      // their first.
      attempts: attempts.length,
      challenge,
      startDate: challenge?.start_date ?? null,
      passedDate: passed?.passed_at ?? null,
      breachedDate: failed?.breached_at ?? null,
    };
  });
}

/**
 * The figures a stage's KPI tile shows: the capital behind it, its balance and its
 * P&L.
 *
 * ONLY THE CURRENT STAGE HAS A BALANCE. The engine computes equity for the ACTIVE
 * challenge, because that is the only one whose drawdown still matters; a phase
 * that closed months ago has no stored final equity, and a completed stage
 * therefore reports its capital and its dates and leaves the balance blank rather
 * than printing a figure nobody recorded. A stage that has not started has neither.
 */
export function stageFigures(stage, state = null) {
  const live = Boolean(stage && (stage.status === 'active' || stage.status === 'breached') && state);
  const capital = stage?.challenge?.start_balance ?? (live ? state?.startBalance ?? null : null);
  const balance = live ? state?.currentEquity ?? null : null;
  const pnl = balance != null && capital != null ? round2(balance - capital) : null;
  return { live, capital, balance, pnl };
}

/**
 * The current stage's rule metrics with live progress — what the lifecycle's
 * detail area is made of.
 *
 * `state`     — the engine state for the active challenge.
 * `challenge` — its rule-snapshot row, for the firm's headline percentages.
 *
 * A METRIC APPEARS ONLY IF THE CHALLENGE CARRIES THAT RULE. Prop firms do not agree
 * on their rule sets: a funded account has no profit target unless one was set, and
 * plenty of challenges have no minimum trading days. So this returns between zero
 * and four entries rather than a fixed grid with dashes in it — a rule that does not
 * exist is not a rule at 0%.
 *
 * `kind` says how a meter should read, and the component maps it to a tone through
 * the SHARED `roomStatus` thresholds: 'room' fills up as risk grows (drawdown),
 * 'target'/'payout'/'days' fill up as progress is made.
 */
export function currentStageMetrics({ state = null, challenge = null } = {}) {
  if (!state) return [];
  const out = [];

  const t = state.profitTarget;
  if (t) {
    const funded = state.phase === 'funded';
    out.push({
      key: 'target',
      label: funded ? 'Payout Target' : 'Profit Target',
      kind: funded ? 'payout' : 'target',
      rulePct: challenge?.profit_target_pct ?? null,
      current: t.current,
      limit: t.target,
      frac: clamp01(t.pctToTarget ?? 0),
      reached: Boolean(t.reached),
    });
  }

  const md = state.maxDd;
  if (md) {
    const used = round2(md.limit - md.roomLeft);
    out.push({
      key: 'maxDd',
      label: 'Max Drawdown',
      kind: 'room',
      rulePct: challenge?.max_dd_pct ?? null,
      current: used,
      limit: md.limit,
      frac: md.limit ? clamp01(used / md.limit) : 0,
      roomLeft: md.roomLeft,
      fracRemaining: md.fracRemaining,
      breached: Boolean(md.breached),
    });
  }

  const dd = state.dailyDd;
  if (dd) {
    out.push({
      key: 'dailyDd',
      label: 'Daily Drawdown',
      kind: 'room',
      rulePct: challenge?.daily_dd_pct ?? null,
      current: dd.usedToday,
      limit: dd.limit,
      frac: dd.limit ? clamp01(dd.usedToday / dd.limit) : 0,
      roomLeft: dd.roomLeft,
      fracRemaining: dd.fracRemaining,
      breached: Boolean(dd.breached),
    });
  }

  const d = state.tradingDays;
  if (d && d.required > 0) {
    out.push({
      key: 'days',
      label: 'Minimum Trading Days',
      kind: 'days',
      rulePct: null,
      current: d.completed,
      limit: d.required,
      frac: clamp01(d.completed / d.required),
      met: d.completed >= d.required,
    });
  }

  return out;
}
