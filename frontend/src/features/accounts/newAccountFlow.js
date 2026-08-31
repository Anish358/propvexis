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

/**
 * The wizard's routes, in route order.
 *
 * OWNER RESTRUCTURE 2026-08-25, which supersedes spec §8.1's eleven pages. Two
 * merges, on the owner's reading that the original split asked one question per
 * page where the questions belonged together:
 *   · `product`, `phase` and `name` became ONE `account` page — size, phase,
 *     account type, name, then the rules, prefilled from the catalog where we have
 *     them and editable either way.
 *   · `connect`'s sub-choice ("do we run the terminal, or do you?") moved onto
 *     `import`, so the EA is a fourth sync card rather than a hidden sub-option.
 *     That reverses spec §2 decision 5 and §7.4 deliberately.
 * Nine routes now, and a prop account is seven pages rather than nine.
 */
export const STEP_IDS = [
  'welcome', 'capital', 'firm', 'account',
  'platform', 'import', 'connect', 'upload', 'done',
];

/** The phase values challenges.phase accepts. Mirrors PHASES in
 *  src/domain/accounts/provision.js — the validator is what enforces it; this is
 *  what stops the UI offering a fifth.
 *
 *  'p3' WAS ADDED 2026-08-25 for the owner's 3-Step account type. There is no CHECK
 *  constraint to widen — migration 0016 declares `phase TEXT NOT NULL DEFAULT 'p1'`
 *  with the three values in a COMMENT only — so the enforcement really is these two
 *  arrays plus the /api/prop advance whitelist. Everything that partitions phases had
 *  to learn about it in the same change: EVAL_PHASES in src/domain/prop/propOverview.js
 *  and in features/prop/propAccounts.js (a p3 challenge is an evaluation, and a phase
 *  missing from that set is counted as neither eval nor funded), STAGE_ORDER in
 *  features/prop/challengesData.js, the to_phase whitelist in src/routes/prop.js, and
 *  the phase label in src/domain/alerts/alerts.js. */
export const PHASES = ['p1', 'p2', 'p3', 'funded'];

/* ACCOUNT_TYPES, phasesFor and ACCOUNT_SIZES live in features/prop/propFirms.js, not
 * here: the account-type taxonomy is prop-domain knowledge, and Prop OS needs it too —
 * `challengeStages` builds an account's stage list from it and PropCards decides which
 * phase to advance INTO from it. A copy in the wizard's own module would be a second
 * answer to "how many phases does a 3-Step have". */

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
    /* NEW CHALLENGE OR AN EXISTING ONE — the first question of the account page, and
     * the branch the whole 0027 model exists to serve. 'new' starts a challenge of its
     * own; 'existing' makes this account the next PHASE of one that is already tracked,
     * and then `challenge_group_id` names it.
     *
     * Null until answered, and the account step is incomplete until it is, so a draft
     * revived mid-page cannot commit an account whose challenge nobody chose. Only the
     * prop path ever asks: a live account has no phases. */
    challenge_mode: null,        // 'new' | 'existing'
    challenge_group_id: null,    // the challenge this account is a phase OF
    /* BACK-FILLING an earlier phase of that challenge, rather than adding the login the
     * firm has just issued. Set only by the `&phase=` deep link from a challenge card's
     * rail, and honoured only when the challenge agrees the phase is genuinely missing.
     *
     * A FIELD OF ITS OWN rather than reusing `phase`, which is the trader's own pick on
     * the NEW-challenge branch: someone who chose Phase 1 there and then switched to an
     * existing challenge would otherwise have that answer silently reinterpreted as a
     * back-fill instruction, and be filed at the wrong phase of someone else's ladder. */
    backfill_phase: null,        // one of PHASES, or null
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
  if (d.capital_kind === 'prop') steps.push('firm');
  steps.push('account', 'platform', 'import');
  if (AUTO_SYNC_METHODS.includes(d.import_method)) steps.push('connect');
  else if (d.import_method === 'file') steps.push('upload');
  steps.push('done');
  return steps;
}

/**
 * Which step writes the account (spec §6.2): the last one that COLLECTS data.
 *
 * Only Auto Sync commits at `connect`, because only Auto Sync has something left to
 * ask there — a credential. The EA used to commit there too, when `connect` was
 * where you chose it; since the 2026-08-25 restructure the EA is picked on `import`
 * and has nothing further to answer, so it commits with Manual and File upload and
 * `connect` shows it the setup card for an account that already exists.
 */
export function commitStep(draft) {
  const method = draft?.import_method;
  if (!method) return null;
  return method === 'auto_sync' ? 'connect' : 'import';
}

export const isCommitted = (draft) => draft?.account != null;

/**
 * The steps that can legitimately follow a commit, so a refresh on one of them resumes.
 * `connect` is here for the EA, which commits on `import` and is shown its setup card
 * here; `upload` still has a statement to import into an account that already exists;
 * `done` is the receipt.
 */
export const POST_COMMIT_STEPS = ['connect', 'upload', 'done'];

/**
 * Is this stored draft SPENT — committed, and being resumed somewhere that is not
 * downstream of the commit?
 *
 * The draft is mirrored to sessionStorage, so without this a user who created an
 * account and came back to /accounts/new in the same tab revived the COMMITTED draft.
 * `firstIncomplete` of a committed draft is `done` (which is deliberately never
 * complete, so the guard always has somewhere to rest), so they were redirected onto
 * the PREVIOUS account's success page, with no way back because navigation is
 * forward-only after a commit. They could not create a second account at all.
 *
 * AND IT IS NOT MERELY A ROUTING BUG. The draft carries `provision_key`, and the server
 * treats a repeat of that key as an idempotent REPLAY that returns the account it
 * already created. So a spent draft cannot be reused even in principle — discarding it
 * is what mints the new key a second account needs.
 *
 * Scoped by step rather than cleared unconditionally, because a refresh on `upload` or
 * `done` must resume: the account exists there, and on the file branch there is still a
 * statement to import into it. Throwing the draft away then would drop the user back to
 * the first question having already created something.
 */
export function isSpentDraft(draft, stepId) {
  return isCommitted(draft) && !POST_COMMIT_STEPS.includes(stepId);
}

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
  /* The merged page (owner restructure 2026-08-25) — everything the three separate
   * `product`, `phase` and `name` steps each demanded, now demanded together. The
   * three old rules are unchanged in substance, and each is still here for the reason
   * it was written:
   *
   *  · The balance and BOTH drawdowns, because of the custom-rules path: a missing
   *    percentage is numOrNull'd by validateProvision and then COALESCEd by
   *    mt5_accounts to 5/10/8, so an unlisted firm's account would silently be judged
   *    against GoatFundedTrader's rules.
   *  · The phase, plus the ONE number the phase decides — a target for an evaluation,
   *    a split for a funded account.
   *  · A non-blank label.
   *
   * A LIVE account needs only the label. It has no firm, no product and no phase, and
   * asking it for a drawdown would be asking for a rule nothing scores. */
  account: (d) => {
    if (String(d.label ?? '').trim() === '') return false;
    if (d.capital_kind !== 'prop') return true;
    // The page's FIRST question, so it gates everything under it. 'existing' additionally
    // needs the challenge itself — the mode alone says only that a list was opened, and
    // an account provisioned from that state would silently start a challenge of its own
    // rather than continuing the one the trader was looking at (Ruling 8's shape again:
    // a step that exists to collect an identity must not pass without one).
    if (d.challenge_mode !== 'new' && d.challenge_mode !== 'existing') return false;
    if (d.challenge_mode === 'existing' && d.challenge_group_id == null) return false;
    if (!d.product_id) return false;
    if (!has(d.start_balance) || !has(d.daily_dd_pct) || !has(d.max_dd_pct)) return false;
    if (!PHASES.includes(d.phase)) return false;
    return d.account_type === 'funded' ? has(d.payout_split_pct) : has(d.profit_target_pct);
  },
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
/* The two screens that are not questions, and so are not counted.
 *
 * `done` is a receipt — the account already exists by the time it renders, and counting
 * it made a six-question flow announce itself as seven, which is a promise of one more
 * thing to do than there is. `welcome` is an intro for the same reason: it asks nothing.
 * Both stay in stepsFor — `done` in particular is where firstIncomplete comes to rest,
 * so removing it from the branch would break the guard — they are simply not part of
 * "step N of M". */
const UNCOUNTED_STEPS = ['welcome', 'done'];

export function progress(draft, stepId) {
  const steps = stepsFor(draft).filter((s) => !UNCOUNTED_STEPS.includes(s));
  const total = steps.length;
  const i = steps.indexOf(stepId);
  if (i !== -1) return { index: i + 1, total };
  // `done` sits after the count and reads as finished; `welcome` sits before it; a step
  // this branch does not have at all reports 0 rather than a wrong number, because the
  // guard is about to redirect and "step 3 of 5" would be a lie for a frame.
  return { index: stepId === 'done' ? total : 0, total };
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
/* The challenge choice hangs off the FIRM: the list a trader picks from is that firm's
 * challenges only, so changing the firm invalidates both the mode and the id. Leaving
 * the id behind is the failure this prevents — a GoatFundedTrader challenge id riding
 * on a payload that now names FTMO, which the server would refuse at the very end of
 * the flow (the group's firm wins over the payload) after nine more questions. */
const CHALLENGE_CLEARED = {
  challenge_mode: null, challenge_group_id: null, backfill_phase: null,
};
const FIRM_CLEARED = {
  firm_id: null, firm_name: null, product_id: null, phase: null, ...CHALLENGE_CLEARED,
};

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
  if (changed('firm_id')) next = { ...next, product_id: null, phase: null, ...RULES_CLEARED, ...CHALLENGE_CLEARED };
  if (changed('product_id')) next = { ...next, phase: null, ...RULES_CLEARED };
  /* LEAVING the existing-challenge branch drops the challenge AND the identity it
   * dictated. Without the identity going too, a trader who picked their Phase 1-passed
   * 25K challenge, changed their mind and chose New would carry that challenge's type,
   * size and phase into a brand-new challenge as if they had typed them — the page's
   * locked fields would simply become editable with someone else's answers in them.
   *
   * ONLY WHEN THE PREVIOUS ANSWER WAS 'existing', which is narrower than "the mode
   * changed" and has to be: answering the question for the FIRST time is also a change,
   * and clearing on that would wipe the product, phase and rules of a draft being
   * revived — the page would re-render with its own stored answers gone. */
  if (d.challenge_mode === 'existing' && changed('challenge_mode')) {
    next = {
      ...next, challenge_group_id: null, backfill_phase: null, product_id: null,
      phase: null, ...RULES_CLEARED,
    };
  }
  // A back-fill names a phase of ONE challenge. Changing which challenge makes the
  // instruction meaningless, so it goes with it rather than being applied to the next.
  if (changed('challenge_group_id')) next = { ...next, backfill_phase: null };

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
  /* THE PHASE, BUT ONLY WHEN JOINING AN EXISTING CHALLENGE — and this is a correctness
   * fix, not a nicety. Every phase of one challenge shares its firm, type and size, so
   * without the phase the Phase 2 account is suggested the name the Phase 1 account
   * already has: the page's own uniqueness check then reports a duplicate and blocks
   * Continue on a name the wizard itself proposed. A new challenge keeps the plain name,
   * because there is nothing yet for it to collide with.
   *
   * A SHORT TAG, not PHASE_LABEL's "Phase 2": this is a name in an account switcher, and
   * "GoatFundedTrader 2-Step 25K Phase 2" is longer than the column that shows it. */
  if (d.challenge_group_id != null && PHASE_TAG[d.phase]) parts.push(PHASE_TAG[d.phase]);
  return parts.join(' ');
}

/** The phase as a NAME SUFFIX. Deliberately not PHASE_LABEL (features/prop) — that is
 *  the phase as prose, for a heading or a rail; this is what fits in an account name. */
const PHASE_TAG = { p1: 'P1', p2: 'P2', p3: 'P3', funded: 'Funded' };

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
    // Null on the 'new' branch as well as on the live path: no id means "start a
    // challenge of its own", which is what provisionAccount does with it. `challenge_mode`
    // itself is never sent — it is how the PAGE was answered, and the server only needs
    // to know whether there is a challenge to join.
    challenge_group_id: prop && d.challenge_mode === 'existing' ? d.challenge_group_id : null,
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
