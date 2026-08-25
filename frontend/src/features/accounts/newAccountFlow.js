// THE ADD ACCOUNT FLOW, as pure functions.
//
// WHY EVERYTHING IS HERE. The wizard is eleven routes and this repo cannot render
// one in a test: no jsdom, no React Testing Library, by decision. So every
// decision worth pinning lives in this module and the pages are thin — they
// render, they call patch(), they navigate. What that buys is
// test/new-account-flow.test.js: step counts per branch, guard resolution, the
// invalidation cascade, the commit point, and a payload asserted against Phase
// A's own validateProvision rather than against a restatement of it.
//
// JSX-FREE AND REACT-FREE, and it must stay that way. node:test imports it
// directly and CI installs BACKEND dependencies only, so an import that reaches
// React, react-router-dom, components/ or lib/api.js (which reads
// import.meta.env at module scope) fails in CI and nowhere else. propFirms.js and
// platformCatalog.js are safe: both are pure data and node:test already reads them.
//
// THE PASSWORD IS NEVER IN THE DRAFT. The draft is mirrored to sessionStorage,
// which is readable by any script on the origin; the credentials step holds the
// password in component state and hands it straight to the provision call.
import {
  findFirm, isCustomProduct, SHORT_PRODUCT_LABEL, sizeLabel, UNLISTED_FIRM_ID,
} from '../prop/propFirms.js';
import { findPlatformCard } from './platformCatalog.js';

/** Bump when the draft's shape changes incompatibly. It is IN the storage key, so
 *  a bump orphans the old blob rather than reading it — the version check in
 *  reviveDraft is the second line of defence, not the first. */
export const FLOW_VERSION = 1;
export const DRAFT_KEY = `propvexis.newAccount.v${FLOW_VERSION}`;

/** The eleven routes of spec §8.1, in route order. */
export const STEP_IDS = [
  'welcome', 'capital', 'firm', 'product', 'phase',
  'name', 'platform', 'import', 'connect', 'upload', 'done',
];

/** The three values challenges.phase accepts (migration 0016). Mirrors PHASES in
 *  src/domain/accounts/provision.js — the validator is what enforces it; this is
 *  what stops the UI offering a fourth. */
export const PHASES = ['p1', 'p2', 'funded'];

const AUTO_SYNC_METHODS = ['auto_sync', 'ea'];

// Every field the draft has ever had, with its empty value. Written out rather
// than built, so `emptyDraft` is readable as the answer to "what does the wizard
// know", and so reviveDraft can fill a short stored blob to full shape.
export function emptyDraft({ provisionKey = null, firstRun = false } = {}) {
  return {
    v: FLOW_VERSION,
    // Server state, not draft state: it comes from user.onboarded_at on every
    // revive and is never trusted from storage.
    firstRun: firstRun === true,
    // Minted ONCE per draft by the provider (crypto.randomUUID) and injected, so
    // this module stays dependency-free AND a retry after a dropped response
    // replays the same key instead of creating a second account.
    provision_key: provisionKey,
    welcomed: false,

    capital_kind: null,          // 'prop' | 'live'
    firm_id: null,
    firm_name: null,             // for firm_id 'other' this is what the user TYPED
    product_id: null,
    phase: null,                 // one of PHASES

    label: '',
    currency: 'USD',
    start_balance: null,         // the account SIZE on the prop path
    account_type: 'eval',        // 'eval' | 'funded', derived from the phase
    daily_dd_pct: null,
    max_dd_pct: null,
    profit_target_pct: null,
    payout_split_pct: null,
    dd_type: 'static',
    min_trading_days: null,

    platform: null,
    broker: null,                // free text, live path only (spec §7.2)
    import_method: null,         // 'auto_sync' | 'ea' | 'file' | 'manual'

    // Set by the commit. From here navigation is forward-only (spec §6.2).
    account: null,               // { id, mt5_login }
    uploadDone: false,
  };
}

/**
 * Rebuild a draft from what sessionStorage held.
 *
 * Anything unparseable, from another schema version, or not a plain object
 * becomes a FRESH draft. Resuming a half-understood draft is worse than starting
 * over: the user can retype four answers, but a payload assembled from fields
 * that mean something else creates the wrong account.
 */
export function reviveDraft(raw, opts = {}) {
  const blank = emptyDraft(opts);
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return blank;
    if (parsed.v !== FLOW_VERSION) return blank;
    return {
      ...blank,
      ...parsed,
      v: FLOW_VERSION,
      // firstRun is server state (users.onboarded_at). A stale `true` would put
      // the welcome step in front of an onboarded user; a stale `false` would deny
      // it to a genuinely new one.
      firstRun: blank.firstRun,
    };
  } catch {
    return blank;
  }
}

/** Which import methods this platform offers. Unknown platform → none, so an
 *  unrecognised id can never keep a method alive. */
const methodsFor = (platformId) => findPlatformCard(platformId)?.importMethods || [];

/**
 * The steps THIS draft's branch has, in order.
 *
 * Computed from the current draft, so the count grows honestly as the branch
 * resolves rather than overstating the work up front (decision B2). Spec §3's
 * numbers hold: Live + Manual is 5, Prop + Auto Sync is 9.
 *
 * `name` sits after `phase` on the prop path (decision B1) so the suggested label
 * can name the product — a 1-Step and a 2-Step account of the same size are two
 * accounts a trader has to tell apart, and firm + size alone cannot.
 */
export function stepsFor(draft) {
  const d = draft || {};
  const steps = [];
  if (d.firstRun === true) steps.push('welcome');
  steps.push('capital');
  if (d.capital_kind === 'prop') steps.push('firm', 'product', 'phase');
  steps.push('name', 'platform', 'import');
  if (AUTO_SYNC_METHODS.includes(d.import_method)) steps.push('connect');
  else if (d.import_method === 'file') steps.push('upload');
  steps.push('done');
  return steps;
}

/**
 * Which step writes the account (spec §6.2): the last one that collects data.
 * Auto Sync and the EA both collect on `connect`; Manual and File upload have
 * nothing left to ask after `import`.
 */
export function commitStep(draft) {
  const method = draft?.import_method;
  if (!method) return null;
  return AUTO_SYNC_METHODS.includes(method) ? 'connect' : 'import';
}

export const isCommitted = (draft) => draft?.account != null;

// A number is present if it is a real number — 0 included. `min_trading_days: 0`
// means "no requirement" and a 0% drawdown is a legitimate answer, so a falsy
// check here would be the same bug numOrNull avoids on the server.
// Only a number or a numeric string counts. `Number()` reads '  ', false and []
// as 0, and Task 7 puts a text input in front of the drawdowns on the custom-rules
// path — a blank one arriving as '  ' would store a 0% max drawdown, under which
// any loss at all is a breach.
const has = (v) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== ''))
  && Number.isFinite(Number(v));

// Completeness per step, keyed by step id. A step is complete when the data it
// exists to collect is present — nothing about whether it was visited, except
// where there is no data (welcome, upload) and a flag is the only signal.
const COMPLETE = {
  welcome: (d) => d.welcomed === true,
  capital: (d) => d.capital_kind === 'prop' || d.capital_kind === 'live',
  // The unlisted firm additionally needs the name the user types: firm_id 'other'
  // is not an identity, and validateProvision accepts it, so a step that exists to
  // collect an identity would pass without one (same shape as Ruling 8).
  firm: (d) => Boolean(d.firm_id)
    && (d.firm_id !== UNLISTED_FIRM_ID || String(d.firm_name ?? '').trim() !== ''),
  // The balance and BOTH drawdowns, because of the custom-rules path: a missing
  // percentage is numOrNull'd by validateProvision and then COALESCEd by
  // mt5_accounts to 5/10/8, so an unlisted firm's account would silently be
  // judged against GoatFundedTrader's rules.
  product: (d) => Boolean(d.product_id) && has(d.start_balance) && has(d.daily_dd_pct) && has(d.max_dd_pct),
  // Plus the one number the phase decides: a target for an evaluation, a split
  // for a funded account.
  phase: (d) => PHASES.includes(d.phase)
    && (d.account_type === 'funded' ? has(d.payout_split_pct) : has(d.profit_target_pct)),
  name: (d) => String(d.label ?? '').trim() !== '',
  // Not merely "a platform was chosen": three of the five cards are badged `soon`
  // and the backend refuses exactly those (platforms.js `enabled: false`), so a
  // chosen-but-unavailable platform would pass this step and then 400 at the
  // commit two steps later. patchDraft already withdraws an import method the
  // platform cannot serve, for precisely this class of mismatch — leaving the
  // platform itself unchecked was the asymmetry. `status: 'live'` <=> `enabled:
  // true` is pinned by test/platform-catalog.test.js.
  platform: (d) => findPlatformCard(d.platform)?.status === 'live',
  // On the Manual and File branches `import` IS the commit step, so choosing a
  // card is not enough — a failed provision must leave the user on the step that
  // failed rather than one past it.
  import: (d) => Boolean(d.import_method) && (commitStep(d) !== 'import' || isCommitted(d)),
  connect: (d) => isCommitted(d),
  upload: (d) => d.uploadDone === true,
  // Terminal: never complete, so firstIncomplete always has somewhere to come to
  // rest and never falls off the end of the list.
  done: () => false,
};

export function isStepComplete(draft, stepId) {
  const check = COMPLETE[stepId];
  return check ? check(draft || {}) === true : false;
}

/**
 * The step a cold arrival belongs on: the first one in this branch whose data is
 * missing. Each page compares its own id to this on mount and <Navigate replace>s
 * if it is ahead, so deep-linking /accounts/new/phase lands on capital.
 */
export function firstIncomplete(draft) {
  const steps = stepsFor(draft);
  for (const step of steps) if (!isStepComplete(draft, step)) return step;
  return steps[steps.length - 1];
}

/**
 * May the wizard render this step for this draft?
 *
 * The shell asks this once per navigation and redirects to firstIncomplete() when
 * the answer is no. Spec §8.1 puts the check in each page; one implementation in
 * the shell cannot drift from itself and eleven can, and the rule is the same
 * either way — so it lives here, where a test can reach it.
 *
 * Answered steps stay reachable so Back works, EXCEPT once the account exists:
 * from there the draft can only be where it is, because re-entering an earlier
 * step and pressing Continue would write a second account (spec §6.2).
 */
export function canVisit(draft, stepId) {
  const steps = stepsFor(draft);
  const i = steps.indexOf(stepId);
  if (i === -1) return false;                       // not a step of THIS branch
  const target = steps.indexOf(firstIncomplete(draft));
  return isCommitted(draft) ? i === target : i <= target;
}

export function nextStep(draft, stepId) {
  const steps = stepsFor(draft);
  const i = steps.indexOf(stepId);
  return i === -1 || i === steps.length - 1 ? null : steps[i + 1];
}

/**
 * The step behind this one, or null when there is none.
 *
 * NULL FOR EVERY STEP ONCE COMMITTED (spec §6.2). The alternative is a Back
 * button that walks the user to a step whose Continue writes a SECOND account.
 */
export function prevStep(draft, stepId) {
  if (isCommitted(draft)) return null;
  const steps = stepsFor(draft);
  const i = steps.indexOf(stepId);
  return i <= 0 ? null : steps[i - 1];
}

/** One-based position in this branch, and the branch's real length. `index: 0`
 *  for a step the branch does not have — the guard is about to redirect, and
 *  claiming a position would render a wrong number for a frame. */
export function progress(draft, stepId) {
  const steps = stepsFor(draft);
  const i = steps.indexOf(stepId);
  return { index: i === -1 ? 0 : i + 1, total: steps.length };
}

// What each identity choice invalidates. Kept as data so the cascade reads as one
// rule set rather than as branching, and so a new dependent field is added in one
// place.
const RULES_CLEARED = {
  start_balance: null,
  account_type: 'eval',
  daily_dd_pct: null,
  max_dd_pct: null,
  profit_target_pct: null,
  payout_split_pct: null,
  dd_type: 'static',
  min_trading_days: null,
};
const FIRM_CLEARED = { firm_id: null, firm_name: null, product_id: null, phase: null };

/**
 * Apply a patch, invalidating whatever it contradicts.
 *
 * ONE PLACE FOR THE CASCADE (spec §6.1). Scattering it across eleven page
 * components is how a wizard submits an FTMO product against a GFT account.
 *
 * INVALIDATION RUNS BEFORE THE MERGE, and that order is load-bearing: the product
 * step applies templateToFields in a single patch that sets product_id AND the
 * five rule fields together. Clearing the rules after merging would wipe the
 * numbers the step just resolved, and the step could never complete.
 *
 * AFTER COMMIT only `uploadDone` is writable. Everything else fed the INSERT, the
 * user has no route back to re-submit, and a changed draft would disagree with a
 * row nothing can reconcile it with.
 */
export function patchDraft(draft, patch = {}) {
  const d = draft || emptyDraft();
  if (isCommitted(d)) {
    // The SAME object for a no-op, not a copy: the wizard shell holds this draft in
    // component state, and a fresh object for a patch that changed nothing is how an
    // effect keyed on the draft drives a re-render loop.
    if (!('uploadDone' in patch)) return d;
    const uploadDone = patch.uploadDone === true;
    return uploadDone === d.uploadDone ? d : { ...d, uploadDone };
  }

  const changed = (key) => key in patch && patch[key] !== d[key];

  let next = { ...d };
  if (changed('capital_kind')) next = { ...next, ...FIRM_CLEARED, ...RULES_CLEARED, broker: null };
  if (changed('firm_id')) next = { ...next, product_id: null, phase: null, ...RULES_CLEARED };
  if (changed('product_id')) next = { ...next, phase: null, ...RULES_CLEARED };

  next = { ...next, ...patch };

  // account_type is DERIVED from the phase, never trusted from a page. It is one
  // fact under two names, and eleven page components each remembering to set both
  // is how a funded challenge gets filed as an evaluation — not a cosmetic error:
  // challenges.phase would say funded while account_type says eval, and the prop
  // engine would score it against a profit target it does not have. Deriving it
  // here also removes the dead end on the custom path, where templateToFields
  // returns null and the page would otherwise have to set the pair by hand.
  //
  // Sound because accountType === 'funded' <=> phase.id === 'funded' holds for
  // every phase of every product in the catalog; a product that broke it would
  // also break propFirms.test.js's shape assertions, so it cannot land silently.
  if ('phase' in patch) next.account_type = patch.phase === 'funded' ? 'funded' : 'eval';

  // firm_name is DERIVED from firm_id for every firm the catalog names, for the
  // same reason account_type is derived from the phase: it is one fact under two
  // names, and a page that patches only one leaves the pair disagreeing. Carrying
  // a stale name was reproduced (type FundedNext under "Other", then pick GFT ->
  // gft/FundedNext on the account row). Merely CLEARING it in the cascade has the
  // opposite bug: Prop OS renders `firm_name || 'Other'`, so a page patching
  // firm_id alone would display a GoatFundedTrader account as "Other".
  //
  // The escape hatch is the exception by construction — 'Other / not listed' is a
  // catalog label, not a firm — so there the name is the user's to type. A CHANGE
  // to it clears whatever was there; re-picking the same card does not, or the
  // name step wipes itself.
  if ('firm_id' in patch) {
    const firm = findFirm(patch.firm_id);
    if (firm && firm.id !== UNLISTED_FIRM_ID) next.firm_name = firm.name;
    else if (changed('firm_id') && !('firm_name' in patch)) next.firm_name = null;
  }

  // A platform can withdraw an import method: `other` and MT4 offer only file and
  // manual, and the EA is a .mq5 file so it is MT5-only. Read AFTER the merge,
  // because it depends on the final pair. Submitting a withdrawn method is a 400
  // from platformSupports() at the end of a nine-step flow.
  if (next.platform !== d.platform && next.import_method
      && !methodsFor(next.platform).includes(next.import_method)) {
    next.import_method = null;
  }

  return next;
}

/**
 * The account name to offer on the `name` step, or '' when there is nothing to
 * suggest.
 *
 * Includes the product, which is the gap Phase A left: GFT 1-Step 25K and 2-Step
 * 25K both suggested "GoatFundedTrader 25K", giving one name to two accounts a
 * trader has to tell apart. Uses the TYPED firm name where there is one, so an
 * unlisted firm never gets "Other / not listed" as an account label.
 */
export function suggestedLabel(draft) {
  const d = draft || {};
  if (d.capital_kind !== 'prop' || !d.firm_id) return '';
  const firm = findFirm(d.firm_id);
  if (!firm) return '';
  const name = String(d.firm_name || '').trim() || firm.name;
  const parts = [name];
  if (!isCustomProduct(d.firm_id, d.product_id)) {
    const short = SHORT_PRODUCT_LABEL[d.product_id];
    if (short) parts.push(short);
  }
  if (has(d.start_balance)) parts.push(sizeLabel(d.start_balance));
  return parts.join(' ');
}

/**
 * The POST /api/accounts/provision body.
 *
 * Built field by field rather than by spreading the draft, and that is the point:
 * a spread would carry `welcomed`, `uploadDone`, `account`, `v` — and anything a
 * future step wrongly parked on the draft, a password included. The credential is
 * NOT here at all; the connect step adds it at call time (spec §6.1).
 *
 * The prop fields are nulled on the live path deliberately. validateProvision
 * REJECTS a live payload that names a firm, product or phase, because silently
 * dropping them would create an account the user believes is tracking firm rules —
 * exactly the bug capital_kind exists to end.
 */
export function toProvisionPayload(draft) {
  const d = draft || {};
  const prop = d.capital_kind === 'prop';
  return {
    capital_kind: d.capital_kind,
    label: String(d.label ?? '').trim(),
    currency: d.currency || 'USD',
    broker: prop ? null : (d.broker || null),
    platform: d.platform,
    import_method: d.import_method,
    firm_id: prop ? d.firm_id : null,
    firm_name: prop ? d.firm_name : null,
    product_id: prop ? d.product_id : null,
    phase: prop ? d.phase : null,
    start_balance: d.start_balance,
    account_type: d.account_type,
    daily_dd_pct: prop ? d.daily_dd_pct : null,
    max_dd_pct: prop ? d.max_dd_pct : null,
    profit_target_pct: prop ? d.profit_target_pct : null,
    payout_split_pct: prop ? d.payout_split_pct : null,
    dd_type: d.dd_type || 'static',
    min_trading_days: prop ? d.min_trading_days : null,
    provision_key: d.provision_key,
  };
}
