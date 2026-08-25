import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FLOW_VERSION, DRAFT_KEY, STEP_IDS, PHASES,
  emptyDraft, reviveDraft, stepsFor, isStepComplete, firstIncomplete, canVisit,
  nextStep, prevStep, progress, patchDraft, commitStep, isCommitted,
  suggestedLabel, toProvisionPayload,
} from '../frontend/src/features/accounts/newAccountFlow.js';
import { validateProvision } from '../src/domain/accounts/provision.js';

// The Add Account wizard is eleven ROUTES, and none of them can be rendered in
// this repo: there is no jsdom and no React Testing Library, by decision. So the
// flow is a pure module and this file is the whole of its coverage — step lists,
// guard resolution, the invalidation cascade, which step commits, and the payload.
// A page is thin on purpose: it renders, it calls patch(), it navigates.
//
// The module imports propFirms.js and platformCatalog.js, both pure data modules
// node:test already reads elsewhere. It must never reach api.js (import.meta.env
// at module scope), a .jsx file, or components/ — CI installs backend deps only,
// so such an import fails here and nowhere else.

// ---- helpers ---------------------------------------------------------------

const KEY = '11111111-2222-3333-4444-555555555555';
const fresh = (over = {}) => ({ ...emptyDraft({ provisionKey: KEY }), ...over });

/** A complete prop draft up to (not including) the import method. */
const propUpToImport = (over = {}) => fresh({
  capital_kind: 'prop',
  firm_id: 'gft', firm_name: 'GoatFundedTrader',
  product_id: '2step',
  start_balance: 25000,
  account_type: 'eval',
  daily_dd_pct: 5, max_dd_pct: 10, profit_target_pct: 8,
  payout_split_pct: null, dd_type: 'static', min_trading_days: 3,
  phase: 'p1',
  label: 'GoatFundedTrader 2-Step 25K',
  platform: 'mt5',
  ...over,
});

const liveUpToImport = (over = {}) => fresh({
  capital_kind: 'live',
  label: 'My IC Markets live',
  platform: 'mt5',
  broker: 'IC Markets',
  ...over,
});

// ---- the step lists (spec §3, decision B1) ---------------------------------

test('the route list is exactly the eleven ids in spec §8.1', () => {
  assert.deepEqual(STEP_IDS, [
    'welcome', 'capital', 'firm', 'product', 'phase',
    'name', 'platform', 'import', 'connect', 'upload', 'done',
  ]);
});

test('every step a branch can produce is one of the eleven routes', () => {
  // Otherwise stepsFor names a step with no <Route>, and the guard navigates to
  // a URL that renders nothing.
  const drafts = [
    fresh(), fresh({ firstRun: true }),
    liveUpToImport({ import_method: 'manual' }),
    liveUpToImport({ import_method: 'file' }),
    propUpToImport({ import_method: 'auto_sync' }),
    propUpToImport({ import_method: 'ea' }),
    propUpToImport({ import_method: 'file' }),
    propUpToImport({ import_method: 'manual' }),
  ];
  for (const d of drafts) {
    for (const s of stepsFor(d)) assert.ok(STEP_IDS.includes(s), `unknown step ${s}`);
  }
});

test('spec §3: Live + Manual is five steps', () => {
  assert.deepEqual(
    stepsFor(liveUpToImport({ import_method: 'manual' })),
    ['capital', 'name', 'platform', 'import', 'done'],
  );
});

test('spec §3: Prop + Auto Sync is nine steps', () => {
  assert.deepEqual(
    stepsFor(propUpToImport({ import_method: 'auto_sync' })),
    ['capital', 'firm', 'product', 'phase', 'name', 'platform', 'import', 'connect', 'done'],
  );
});

test('decision B1: name comes after phase on the prop path, so the label can name the product', () => {
  const steps = stepsFor(propUpToImport({ import_method: 'auto_sync' }));
  assert.ok(steps.indexOf('name') > steps.indexOf('phase'));
  assert.ok(steps.indexOf('name') > steps.indexOf('product'));
});

test('the live path never asks about a firm, a product or a phase', () => {
  for (const m of ['manual', 'file', 'auto_sync', 'ea']) {
    const steps = stepsFor(liveUpToImport({ import_method: m }));
    for (const s of ['firm', 'product', 'phase']) {
      assert.equal(steps.includes(s), false, `live + ${m} must not ask for ${s}`);
    }
  }
});

test('the EA sub-choice routes through connect, exactly like our terminal does', () => {
  // Spec §7.4: the EA is a sub-choice UNDER Auto Sync, not a peer option, and
  // `connect` is where the choice is made. Both land there.
  assert.ok(stepsFor(propUpToImport({ import_method: 'ea' })).includes('connect'));
  assert.ok(stepsFor(propUpToImport({ import_method: 'auto_sync' })).includes('connect'));
});

test('only the file route gets an upload step, and it never also gets connect', () => {
  const file = stepsFor(propUpToImport({ import_method: 'file' }));
  assert.ok(file.includes('upload'));
  assert.equal(file.includes('connect'), false);
  for (const m of ['manual', 'auto_sync', 'ea']) {
    assert.equal(stepsFor(propUpToImport({ import_method: m })).includes('upload'), false, m);
  }
});

test('before a branch is chosen the flow is the shortest honest path', () => {
  // Decision B2: the total is computed from the CURRENT draft, so it grows as the
  // branch resolves rather than overstating the work up front.
  assert.deepEqual(stepsFor(fresh()), ['capital', 'name', 'platform', 'import', 'done']);
});

test('first run adds welcome to the front of whatever branch follows', () => {
  assert.equal(stepsFor(fresh({ firstRun: true }))[0], 'welcome');
  assert.equal(stepsFor(propUpToImport({ firstRun: true, import_method: 'auto_sync' }))[0], 'welcome');
  assert.equal(stepsFor(fresh()).includes('welcome'), false, 'a returning user never sees welcome');
});

test('stepsFor is total — no draft shape throws', () => {
  for (const d of [undefined, null, {}, { capital_kind: 'nonsense' }]) {
    assert.ok(Array.isArray(stepsFor(d)), String(d));
  }
});

// ---- progress (decision B2) -------------------------------------------------

test('progress counts within the resolved branch, one-based', () => {
  assert.deepEqual(progress(liveUpToImport({ import_method: 'manual' }), 'platform'), { index: 3, total: 5 });
  assert.deepEqual(progress(propUpToImport({ import_method: 'auto_sync' }), 'connect'), { index: 8, total: 9 });
});

test('progress grows honestly as the branch resolves', () => {
  const atCapital = fresh();
  assert.equal(progress(atCapital, 'capital').total, 5);
  const chosePropFirm = patchDraft(atCapital, { capital_kind: 'prop' });
  assert.equal(progress(chosePropFirm, 'capital').total, 8);
  const choseAutoSync = patchDraft(propUpToImport(), { import_method: 'auto_sync' });
  assert.equal(progress(choseAutoSync, 'capital').total, 9);
});

test('progress on a step this branch does not have reports index 0, not a wrong number', () => {
  // A live draft asked about `firm` means the guard is about to redirect. Claiming
  // "step 3 of 5" for a step that is not in the list would render a lie for a frame.
  assert.deepEqual(progress(liveUpToImport({ import_method: 'manual' }), 'firm'), { index: 0, total: 5 });
});

// ---- the guard (spec §8.1) --------------------------------------------------

test('a cold deep link to a late step resolves back to the first thing unanswered', () => {
  // Spec §8.1: "deep-linking /accounts/new/phase cold lands on capital".
  assert.equal(firstIncomplete(fresh()), 'capital');
  assert.equal(firstIncomplete(fresh({ firstRun: true })), 'welcome');
});

test('the guard walks the branch in order, one answer at a time', () => {
  let d = fresh();
  assert.equal(firstIncomplete(d), 'capital');
  d = patchDraft(d, { capital_kind: 'prop' });
  assert.equal(firstIncomplete(d), 'firm');
  d = patchDraft(d, { firm_id: 'gft', firm_name: 'GoatFundedTrader' });
  assert.equal(firstIncomplete(d), 'product');
  d = patchDraft(d, { product_id: '2step', start_balance: 25000, daily_dd_pct: 5, max_dd_pct: 10 });
  assert.equal(firstIncomplete(d), 'phase');
  d = patchDraft(d, { phase: 'p1', account_type: 'eval', profit_target_pct: 8, min_trading_days: 3 });
  assert.equal(firstIncomplete(d), 'name');
  d = patchDraft(d, { label: 'GFT 2-Step 25K' });
  assert.equal(firstIncomplete(d), 'platform');
  d = patchDraft(d, { platform: 'mt5' });
  assert.equal(firstIncomplete(d), 'import');
  d = patchDraft(d, { import_method: 'auto_sync' });
  assert.equal(firstIncomplete(d), 'connect');
  d = patchDraft(d, { account: { id: 7, mt5_login: 314943467 } });
  assert.equal(firstIncomplete(d), 'done');
});

test('the product step is not done until it has a balance AND both drawdowns', () => {
  // The custom-rules path is why. validateProvision numOrNulls a missing
  // percentage and mt5_accounts COALESCEs it to 5/10/8 — so an unlisted firm's
  // account would silently be judged against GoatFundedTrader's rules.
  const base = fresh({ capital_kind: 'prop', firm_id: 'other', firm_name: 'FundedNext', product_id: 'custom' });
  assert.equal(isStepComplete(base, 'product'), false, 'no balance, no drawdowns');
  assert.equal(isStepComplete({ ...base, start_balance: 50000 }, 'product'), false, 'no drawdowns');
  assert.equal(isStepComplete({ ...base, start_balance: 50000, daily_dd_pct: 4 }, 'product'), false, 'no max DD');
  assert.equal(isStepComplete({ ...base, start_balance: 50000, daily_dd_pct: 4, max_dd_pct: 8 }, 'product'), true);
});

test('a zero drawdown is an answer, not a blank', () => {
  // 0 is falsy and min_trading_days: 0 is a real value ("no requirement"), which
  // is the exact bug numOrNull exists to avoid on the server. Same trap here.
  const d = fresh({
    capital_kind: 'prop', firm_id: 'other', firm_name: 'X', product_id: 'custom',
    start_balance: 50000, daily_dd_pct: 0, max_dd_pct: 0, min_trading_days: 0,
  });
  assert.equal(isStepComplete(d, 'product'), true);
});

test('the phase step is not done until the phase-dependent number is in', () => {
  const evalDraft = propUpToImport({ phase: 'p1', account_type: 'eval', profit_target_pct: null });
  assert.equal(isStepComplete(evalDraft, 'phase'), false, 'an eval phase needs a profit target');
  assert.equal(isStepComplete({ ...evalDraft, profit_target_pct: 8 }, 'phase'), true);

  const fundedDraft = propUpToImport({ phase: 'funded', account_type: 'funded', payout_split_pct: null });
  assert.equal(isStepComplete(fundedDraft, 'phase'), false, 'a funded phase needs a split');
  assert.equal(isStepComplete({ ...fundedDraft, payout_split_pct: 80 }, 'phase'), true);
});

test('account_type is derived from the phase, never trusted from a page', () => {
  // One fact under two names. Eleven pages each remembering to set both is how a
  // funded challenge gets filed as an evaluation, and the prop engine then scores
  // it against a profit target it does not have.
  const base = propUpToImport({ phase: null, account_type: 'eval', payout_split_pct: null });

  const funded = patchDraft(base, { phase: 'funded', payout_split_pct: 80 });
  assert.equal(funded.account_type, 'funded', 'the phase alone settles it — no second control');
  assert.equal(isStepComplete(funded, 'phase'), true);

  const evaluation = patchDraft(base, { phase: 'p1', profit_target_pct: 8 });
  assert.equal(evaluation.account_type, 'eval');

  // The half that actually mattered: a page CANNOT contradict the phase. Before
  // this was derived, {phase:'funded', account_type:'eval'} was a complete step
  // and produced a payload carrying both.
  const lied = patchDraft(base, { phase: 'funded', account_type: 'eval', profit_target_pct: 8 });
  assert.equal(lied.account_type, 'funded', 'the phase wins');
  assert.equal(toProvisionPayload(lied).account_type, 'funded');
  assert.equal(isStepComplete(lied, 'phase'), false, 'and it now asks for the split it needs');
});

test('a platform badged Soon is not a complete answer', () => {
  // mt4, cTrader and TradeLocker are listed so the catalog reads as the real
  // roadmap, and the backend refuses all three. Accepting one here would pass the
  // step and then 400 at the commit, two steps later.
  for (const soon of ['mt4', 'ctrader', 'tradelocker']) {
    assert.equal(isStepComplete({ ...fresh(), platform: soon }, 'platform'), false, soon);
  }
  for (const live of ['mt5', 'other']) {
    assert.equal(isStepComplete({ ...fresh(), platform: live }, 'platform'), true, live);
  }
  assert.equal(isStepComplete({ ...fresh(), platform: 'zzz' }, 'platform'), false, 'unknown platform');
});

test('the phase step rejects a phase the challenges table does not accept', () => {
  assert.deepEqual(PHASES, ['p1', 'p2', 'funded']);
  assert.equal(isStepComplete(propUpToImport({ phase: 'p3' }), 'phase'), false);
});

test('a whitespace-only label is not a name', () => {
  assert.equal(isStepComplete(fresh({ label: '   ' }), 'name'), false);
  assert.equal(isStepComplete(fresh({ label: ' GFT ' }), 'name'), true);
});

test('the commit step is not complete until the account exists', () => {
  // Provision failing (a 409, a 500, a dropped connection) must leave the user ON
  // the step that failed, not one past it — the account does not exist yet.
  const manual = liveUpToImport({ import_method: 'manual' });
  assert.equal(isStepComplete(manual, 'import'), false, 'manual commits AT import');
  assert.equal(firstIncomplete(manual), 'import');
  assert.equal(isStepComplete({ ...manual, account: { id: 3, mt5_login: -3 } }, 'import'), true);

  const autoSync = propUpToImport({ import_method: 'auto_sync' });
  assert.equal(isStepComplete(autoSync, 'import'), true, 'auto_sync does not commit at import');
  assert.equal(isStepComplete(autoSync, 'connect'), false);
});

test('upload is skippable but the guard still lands you on it', () => {
  const committed = propUpToImport({ import_method: 'file', account: { id: 9, mt5_login: -9 } });
  assert.equal(firstIncomplete(committed), 'upload');
  assert.equal(firstIncomplete(patchDraft(committed, { uploadDone: true })), 'done');
});

test('done is never complete, so the guard can always come to rest on it', () => {
  const finished = propUpToImport({ import_method: 'manual', account: { id: 1, mt5_login: -1 } });
  assert.equal(isStepComplete(finished, 'done'), false);
  assert.equal(firstIncomplete(finished), 'done');
});

test('isStepComplete is total — an unknown step is never complete', () => {
  assert.equal(isStepComplete(fresh(), 'nope'), false);
  assert.equal(isStepComplete(undefined, 'capital'), false);
});

test('canVisit allows every answered step and the first unanswered one', () => {
  // The guard lives in the SHELL, not in eleven page components (spec §8.1 puts
  // it per page; one implementation cannot drift from itself, eleven can). This
  // is the predicate it uses, so the rule is a tested fact rather than a
  // component's arithmetic.
  const d = propUpToImport({ import_method: 'auto_sync' });   // everything up to connect
  for (const s of ['capital', 'firm', 'product', 'phase', 'name', 'platform', 'import', 'connect']) {
    assert.equal(canVisit(d, s), true, `${s} is answered or next — it must be reachable`);
  }
  assert.equal(canVisit(d, 'done'), false, 'the account does not exist yet');
});

test('canVisit refuses a step this branch does not have', () => {
  // Deep-linking /accounts/new/phase on a live draft must not render an empty
  // page: the step is not in the branch at all.
  const live = liveUpToImport({ import_method: 'manual' });
  assert.equal(canVisit(live, 'phase'), false);
  assert.equal(canVisit(live, 'firm'), false);
  assert.equal(canVisit(live, 'upload'), false, 'manual has no upload step');
  assert.equal(canVisit(live, 'welcome'), false, 'not a first-run draft');
});

test('canVisit refuses a step nothing has answered up to yet', () => {
  const cold = fresh();
  assert.equal(canVisit(cold, 'capital'), true);
  assert.equal(canVisit(cold, 'name'), false);
  assert.equal(canVisit(cold, 'import'), false);
});

test('canVisit lets a committed draft reach only what remains', () => {
  // Forward-only (spec §6.2): the earlier steps are answered but re-visiting one
  // and pressing Continue would write a second account.
  const committed = propUpToImport({ import_method: 'file', account: { id: 2, mt5_login: -2 } });
  assert.equal(canVisit(committed, 'upload'), true);
  assert.equal(canVisit(committed, 'done'), false, 'upload has not been answered');
  for (const s of ['capital', 'firm', 'product', 'phase', 'name', 'platform', 'import']) {
    assert.equal(canVisit(committed, s), false, `${s} must be sealed once the account exists`);
  }
  const skipped = patchDraft(committed, { uploadDone: true });
  assert.equal(canVisit(skipped, 'done'), true);
});

test('canVisit is total and never throws', () => {
  assert.equal(canVisit(undefined, 'capital'), true, 'a missing draft is a fresh one');
  assert.equal(canVisit(fresh(), undefined), false);
  assert.equal(canVisit(fresh(), 'zzz'), false);
});

// ---- navigation ------------------------------------------------------------

test('next and prev walk the resolved branch', () => {
  const d = propUpToImport({ import_method: 'auto_sync' });
  assert.equal(nextStep(d, 'phase'), 'name');
  assert.equal(prevStep(d, 'name'), 'phase');
  assert.equal(nextStep(d, 'import'), 'connect');
  assert.equal(nextStep(d, 'done'), null, 'nothing follows done');
  assert.equal(prevStep(d, 'capital'), null, 'nothing precedes the first step');
});

test('prev skips the steps this branch does not have', () => {
  const live = liveUpToImport({ import_method: 'manual' });
  assert.equal(prevStep(live, 'name'), 'capital', 'the live path has no phase to go back to');
});

test('spec §6.2: after commit there is NO way back', () => {
  // A Back button past the commit point silently creates a SECOND account, which
  // is the entire reason this is forward-only.
  const committed = propUpToImport({ import_method: 'auto_sync', account: { id: 4, mt5_login: 500 } });
  for (const step of stepsFor(committed)) {
    assert.equal(prevStep(committed, step), null, `${step} must offer no way back once committed`);
  }
});

test('next and prev fail safe on a step outside the branch', () => {
  const live = liveUpToImport({ import_method: 'manual' });
  assert.equal(nextStep(live, 'phase'), null);
  assert.equal(prevStep(live, 'phase'), null);
});

// ---- patchDraft: the invalidation cascade (spec §6.1) ----------------------

test('prop → live drops the firm, the product, the phase and every rule', () => {
  // Spec §6.1. Scattering this across eleven page components is how a wizard
  // submits an FTMO product against a GFT account.
  const d = patchDraft(propUpToImport(), { capital_kind: 'live' });
  assert.equal(d.capital_kind, 'live');
  for (const f of ['firm_id', 'firm_name', 'product_id', 'phase',
                   'daily_dd_pct', 'max_dd_pct', 'profit_target_pct', 'payout_split_pct',
                   'min_trading_days', 'start_balance']) {
    assert.equal(d[f], null, `${f} survived the switch to live`);
  }
});

test('live → prop drops the broker, which only a live account has', () => {
  const d = patchDraft(liveUpToImport(), { capital_kind: 'prop' });
  assert.equal(d.broker, null);
});

test('re-choosing the SAME capital kind invalidates nothing', () => {
  // Otherwise clicking the already-selected card wipes four answers.
  const before = propUpToImport();
  const after = patchDraft(before, { capital_kind: 'prop' });
  assert.deepEqual(after, before);
});

test('a new firm drops the product, the phase and the rules', () => {
  const d = patchDraft(propUpToImport(), { firm_id: 'ftmo', firm_name: 'FTMO' });
  assert.equal(d.firm_id, 'ftmo');
  assert.equal(d.product_id, null);
  assert.equal(d.phase, null);
  assert.equal(d.max_dd_pct, null);
});

test('a new product drops the phase and the rules but keeps the firm', () => {
  const d = patchDraft(propUpToImport(), { product_id: '1step' });
  assert.equal(d.firm_id, 'gft');
  assert.equal(d.product_id, '1step');
  assert.equal(d.phase, null);
  assert.equal(d.profit_target_pct, null);
});

test('one patch may set a product AND its resolved rules — invalidation runs first', () => {
  // THE ORDERING BUG THIS GUARDS. The product step applies templateToFields in a
  // single patch. If the cascade cleared the rules AFTER merging the patch, the
  // numbers the step just resolved would be wiped and the step could never
  // complete.
  //
  // The patch has to be a real product CHANGE, because a change is the only thing
  // that fires invalidation at all — re-selecting the product already chosen must
  // invalidate nothing (asserted directly below). So this switches the 2-Step
  // fixture to 1-Step and carries 1-Step's own resolved numbers. Patching the
  // fixture's existing product would make this test vacuous: no cascade would run,
  // and the ordering it exists to pin would go unexercised.
  const d = patchDraft(propUpToImport(), {
    product_id: '1step', start_balance: 100000,
    daily_dd_pct: 4, max_dd_pct: 6, profit_target_pct: 10, min_trading_days: 3,
    account_type: 'eval',
  });
  assert.equal(d.product_id, '1step');
  assert.equal(d.start_balance, 100000);
  assert.equal(d.daily_dd_pct, 4);
  assert.equal(d.max_dd_pct, 6);
  assert.equal(d.profit_target_pct, 10);
  assert.equal(d.phase, null, 'the phase still had to be dropped');
});

test('re-choosing the SAME product invalidates nothing', () => {
  // The symmetric half of the capital_kind rule, and it is a real hazard: clicking
  // the already-selected product card must not wipe the phase and the rules the
  // user has already answered. Invalidation keys off a value CHANGE, uniformly,
  // for every identity field.
  const before = propUpToImport();
  const after = patchDraft(before, { product_id: '2step' });
  assert.deepEqual(after, before);
});

test('a platform that cannot Auto Sync drops a chosen Auto Sync', () => {
  // Spec §6.1. `other` offers only file and manual, so an auto_sync carried over
  // from MT5 would submit a payload platformSupports() refuses with a 400.
  const d = patchDraft(propUpToImport({ import_method: 'auto_sync' }), { platform: 'other' });
  assert.equal(d.platform, 'other');
  assert.equal(d.import_method, null);
});

test('a platform change keeps an import method the new platform still offers', () => {
  const d = patchDraft(propUpToImport({ import_method: 'file' }), { platform: 'other' });
  assert.equal(d.import_method, 'file');
});

test('the EA route is dropped by a platform that has no EA', () => {
  // The EA is a .mq5 file: MT5 only. `other` must not keep it.
  const d = patchDraft(propUpToImport({ import_method: 'ea' }), { platform: 'other' });
  assert.equal(d.import_method, null);
});

test('an unknown platform drops every import method rather than trusting one', () => {
  const d = patchDraft(propUpToImport({ import_method: 'manual' }), { platform: 'zzz' });
  assert.equal(d.import_method, null);
});

test('patchDraft never mutates the draft it was given', () => {
  const before = propUpToImport();
  const snapshot = JSON.parse(JSON.stringify(before));
  patchDraft(before, { capital_kind: 'live' });
  assert.deepEqual(before, snapshot);
});

test('after commit, patchDraft accepts only the upload flag', () => {
  // Everything else fed the INSERT. A patch that changed it would put the draft
  // and the committed row out of agreement with no way to reconcile them, and the
  // user has no route back to re-submit.
  const committed = propUpToImport({ import_method: 'file', account: { id: 5, mt5_login: -5 } });
  const tampered = patchDraft(committed, {
    capital_kind: 'live', label: 'other', firm_id: 'ftmo', platform: 'other',
    import_method: 'auto_sync', account: null, uploadDone: true,
  });
  assert.equal(tampered.capital_kind, 'prop');
  assert.equal(tampered.label, committed.label);
  assert.equal(tampered.firm_id, 'gft');
  assert.equal(tampered.platform, 'mt5');
  assert.equal(tampered.import_method, 'file');
  assert.deepEqual(tampered.account, { id: 5, mt5_login: -5 });
  assert.equal(tampered.uploadDone, true, 'the one field a post-commit step owns');
});

// ---- the commit point (spec §6.2) ------------------------------------------

test('the commit step is the last step that collects data, per branch', () => {
  assert.equal(commitStep(liveUpToImport({ import_method: 'manual' })), 'import');
  assert.equal(commitStep(propUpToImport({ import_method: 'file' })), 'import');
  assert.equal(commitStep(propUpToImport({ import_method: 'auto_sync' })), 'connect');
  assert.equal(commitStep(propUpToImport({ import_method: 'ea' })), 'connect');
  assert.equal(commitStep(fresh()), null, 'no method chosen yet');
});

test('isCommitted keys off the account, nothing else', () => {
  assert.equal(isCommitted(fresh()), false);
  assert.equal(isCommitted(fresh({ account: { id: 1, mt5_login: -1 } })), true);
  assert.equal(isCommitted(undefined), false);
});

// ---- the suggested label (the Phase A gap) ---------------------------------

test('the suggested label distinguishes two products of the same size', () => {
  // Phase A left both GFT 1-Step 25K and 2-Step 25K suggesting
  // "GoatFundedTrader 25K" — one name for two accounts a trader must tell apart.
  const twoStep = suggestedLabel(propUpToImport());
  const oneStep = suggestedLabel(propUpToImport({ product_id: '1step' }));
  assert.equal(twoStep, 'GoatFundedTrader 2-Step 25K');
  assert.equal(oneStep, 'GoatFundedTrader 1-Step 25K');
  assert.notEqual(twoStep, oneStep);
});

test('the suggested label uses the firm name the user typed for an unlisted firm', () => {
  const d = propUpToImport({
    firm_id: 'other', firm_name: 'FundedNext', product_id: 'custom', start_balance: 50000,
  });
  assert.equal(suggestedLabel(d), 'FundedNext 50K',
    'the catalog name "Other / not listed" must never become an account label');
});

test('the suggested label is empty when there is nothing to suggest', () => {
  assert.equal(suggestedLabel(liveUpToImport()), '', 'a live account has no firm to name');
  assert.equal(suggestedLabel(fresh({ capital_kind: 'prop' })), '', 'no firm chosen yet');
  assert.equal(suggestedLabel(fresh({ capital_kind: 'prop', firm_id: 'zzz' })), '');
  assert.equal(suggestedLabel(undefined), '');
});

// ---- toProvisionPayload ----------------------------------------------------

test('a prop payload passes validateProvision unchanged', () => {
  // The real check: the payload this module builds is the payload the endpoint
  // accepts. Phase A's validator is imported directly rather than restated, so a
  // future change to either side breaks here instead of in production.
  const payload = toProvisionPayload(propUpToImport({ import_method: 'ea' }));
  const parsed = validateProvision(payload);
  assert.ok(parsed.ok, parsed.error);
  assert.equal(parsed.value.capital_kind, 'prop');
  assert.equal(parsed.value.kind, 'synced');
  assert.equal(parsed.value.phase, 'p1');
  assert.equal(parsed.value.product_id, '2step');
  assert.equal(parsed.value.provision_key, KEY);
});

test('a live payload passes, and carries no prop fields at all', () => {
  // validateProvision REJECTS a live payload that names a firm, product or phase —
  // silently dropping them would make an account the user believes tracks firm
  // rules, which is the bug capital_kind exists to end. So the payload must not
  // merely blank them, it must not offend the validator.
  const payload = toProvisionPayload(liveUpToImport({ import_method: 'manual' }));
  const parsed = validateProvision(payload);
  assert.ok(parsed.ok, parsed.error);
  assert.equal(parsed.value.capital_kind, 'live');
  assert.equal(parsed.value.kind, 'manual');
  assert.equal(parsed.value.firm_id, null);
  assert.equal(parsed.value.product_id, null);
  assert.equal(parsed.value.phase, null);
  assert.equal(parsed.value.broker, 'IC Markets');
});

test('a live payload survives a draft that once held prop answers', () => {
  // The user picked Prop, answered four questions, went back and chose Live
  // Capital. patchDraft cleared the fields; this asserts the payload the endpoint
  // sees is clean, because validateProvision 400s on a stray firm_id.
  const flipped = patchDraft(propUpToImport({ import_method: 'manual' }), { capital_kind: 'live' });
  const withName = patchDraft(flipped, { label: 'My own account' });
  const parsed = validateProvision(toProvisionPayload(withName));
  assert.ok(parsed.ok, parsed.error);
});

test('every import method produces a payload the endpoint accepts', () => {
  for (const [method, platform] of [['manual', 'mt5'], ['file', 'other'], ['ea', 'mt5'], ['auto_sync', 'mt5']]) {
    const draft = propUpToImport({ import_method: method, platform });
    const payload = toProvisionPayload(draft);
    // auto_sync is the one method that needs a credential, and the credential is
    // NEVER in the draft — the connect step adds it at call time. Mirror that here.
    if (method === 'auto_sync') payload.credential = { server: 'GoatFunded-Server', login: 314943467, password: 'x' };
    const parsed = validateProvision(payload);
    assert.ok(parsed.ok, `${method}: ${parsed.error}`);
  }
});

test('toProvisionPayload never carries a credential or a password', () => {
  // The password is never in the draft (spec §6.1): sessionStorage is readable by
  // any script on the origin. This asserts the payload builder cannot leak one
  // even if a future step wrongly put one in the draft.
  const poisoned = propUpToImport({ import_method: 'auto_sync', password: 'hunter2', credential: { password: 'hunter2' } });
  const payload = toProvisionPayload(poisoned);
  assert.equal('credential' in payload, false);
  assert.equal('password' in payload, false);
  assert.equal(JSON.stringify(payload).includes('hunter2'), false);
});

test('toProvisionPayload trims the label the user typed', () => {
  const payload = toProvisionPayload(liveUpToImport({ import_method: 'manual', label: '  Spaced  ' }));
  assert.equal(payload.label, 'Spaced');
});

// ---- the sessionStorage contract -------------------------------------------

test('the draft key carries the schema version, so a bump orphans the old blob', () => {
  assert.equal(DRAFT_KEY, `propvexis.newAccount.v${FLOW_VERSION}`);
});

test('reviveDraft resumes a matching draft, keeping its provision key', () => {
  // The key must survive a refresh or the idempotency guard never fires: a
  // network drop after COMMIT is exactly when a user reloads and presses again.
  const stored = { ...propUpToImport({ import_method: 'auto_sync' }), provision_key: 'stored-key' };
  const back = reviveDraft(JSON.stringify(stored), { provisionKey: 'a-fresh-one' });
  assert.equal(back.provision_key, 'stored-key');
  assert.equal(back.firm_id, 'gft');
  assert.equal(back.import_method, 'auto_sync');
});

test('reviveDraft discards anything it cannot fully understand', () => {
  // A half-understood draft resuming into a wizard is worse than starting over:
  // the user can retype four answers, but a payload assembled from fields that
  // mean something else creates the WRONG account.
  for (const bad of ['', 'not json', 'null', '[]', '"a string"', JSON.stringify({ v: 999, firm_id: 'gft' })]) {
    const d = reviveDraft(bad, { provisionKey: KEY });
    assert.equal(d.provision_key, KEY, `${bad} should have produced a fresh draft`);
    assert.equal(d.firm_id, null);
    assert.equal(d.v, FLOW_VERSION);
  }
  assert.equal(reviveDraft(undefined, { provisionKey: KEY }).capital_kind, null);
  assert.equal(reviveDraft(null, { provisionKey: KEY }).capital_kind, null);
});

test('reviveDraft takes firstRun from the live user, never from storage', () => {
  // onboarded_at is server state. A stale `firstRun: true` in sessionStorage would
  // put the welcome step in front of an onboarded user, and a stale false would
  // deny it to a genuinely new one.
  const stored = JSON.stringify({ ...emptyDraft({ provisionKey: KEY }), firstRun: true });
  assert.equal(reviveDraft(stored, { provisionKey: KEY, firstRun: false }).firstRun, false);
  assert.equal(reviveDraft(stored, { provisionKey: KEY, firstRun: true }).firstRun, true);
});

test('emptyDraft is complete — a revived draft can never be missing a field', () => {
  const keys = Object.keys(emptyDraft({ provisionKey: KEY })).sort();
  const revived = Object.keys(reviveDraft(JSON.stringify({ v: FLOW_VERSION }), { provisionKey: KEY })).sort();
  assert.deepEqual(revived, keys);
});

test('emptyDraft holds no password field of any kind', () => {
  // Spec §6.1, asserted structurally rather than trusted: the credentials step
  // holds the password in component state and hands it straight to the provision
  // call, because sessionStorage is readable by any script on the origin.
  const keys = Object.keys(emptyDraft({ provisionKey: KEY }));
  for (const k of keys) {
    assert.equal(/pass|secret|credential|token/i.test(k), false,
      `emptyDraft has a '${k}' field — nothing secret may be mirrored to sessionStorage`);
  }
});

// ---- firm_name is DERIVED from firm_id, never carried (final review, Imp. 2) --

test('switching from the unlisted firm to a catalog firm does not carry the typed name', () => {
  // REPRODUCED by the final reviewer: pick "Other / not listed", type FundedNext,
  // go back, pick GoatFundedTrader -> firm_id gft carrying firm_name FundedNext.
  // That pair reaches the account row and every Prop OS display of it. The same
  // "eleven pages each remembering to set both" shape Ruling 7 rejected for
  // account_type, so it is fixed the same way: derived in one place.
  const unlisted = patchDraft(propUpToImport(), { firm_id: 'other', firm_name: 'FundedNext' });
  assert.equal(unlisted.firm_name, 'FundedNext', 'the typed name must survive being typed');
  const gft = patchDraft(unlisted, { firm_id: 'gft' });
  assert.equal(gft.firm_id, 'gft');
  assert.equal(gft.firm_name, 'GoatFundedTrader',
    'a catalog firm names itself; a stale typed name here mislabels the account row');
});

test('a page patching firm_id alone still gets the catalog name, not null', () => {
  // The minimal fix (clearing firm_name in the cascade) has its own bug in this
  // direction: Prop OS renders `firm_name || 'Other'`, so a cleared name would
  // display a GoatFundedTrader account as "Other".
  const d = patchDraft(propUpToImport(), { firm_id: 'ftmo' });
  assert.equal(d.firm_name, 'FTMO');
});

test('a page cannot override a catalog firm name', () => {
  // One fact under two names: the catalog is the authority for a listed firm.
  const d = patchDraft(propUpToImport(), { firm_id: 'ftmo', firm_name: 'Not FTMO' });
  assert.equal(d.firm_name, 'FTMO');
});

test('choosing the unlisted firm clears the previous name, leaving the user to type', () => {
  // 'Other / not listed' is a catalog LABEL, not a firm name — storing it would
  // put a name no firm published on the account row.
  const d = patchDraft(propUpToImport(), { firm_id: 'other' });
  assert.equal(d.firm_id, 'other');
  assert.equal(d.firm_name, null);
});

test('typing the unlisted firm name does not re-trigger the derivation', () => {
  const chose = patchDraft(propUpToImport(), { firm_id: 'other' });
  const typed = patchDraft(chose, { firm_name: 'Alpha Capital' });
  assert.equal(typed.firm_name, 'Alpha Capital');
  // ...and re-picking the same card must not wipe what was typed under it.
  assert.equal(patchDraft(typed, { firm_id: 'other' }).firm_name, 'Alpha Capital');
});

// ---- the firm step is not complete without an identity (final review, Imp. 3) --

test('the firm step is incomplete while the unlisted firm has no typed name', () => {
  // Identical in shape to Ruling 8, upheld: a step that exists to collect an
  // identity must not pass without one. Boolean(firm_id) alone let 'other' through
  // with no name, and validateProvision accepts it.
  const chose = patchDraft(propUpToImport(), { firm_id: 'other', firm_name: null });
  assert.equal(firstIncomplete({ ...chose, product_id: null }), 'firm');
  const named = patchDraft(chose, { firm_name: 'FundedNext' });
  assert.notEqual(firstIncomplete({ ...named, product_id: null }), 'firm');
});

test('a whitespace-only unlisted firm name is not a name', () => {
  const blank = patchDraft(propUpToImport(), { firm_id: 'other', firm_name: '   ' });
  assert.equal(firstIncomplete({ ...blank, product_id: null }), 'firm');
});

test('a catalog firm needs no typed name to complete the firm step', () => {
  const gft = patchDraft(propUpToImport(), { firm_id: 'gft' });
  assert.notEqual(firstIncomplete({ ...gft, product_id: null }), 'firm');
});
