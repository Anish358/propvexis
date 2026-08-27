import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  challengeGroupRows, challengeName, challengePhases, defaultStage, groupChallengesByFirm,
  groupLifecycle, isAwaitingPhase, inheritedFields, joinableChallenges, phaseToAdd,
} from '../frontend/src/features/prop/challengeGroups.js';
import { patchDraft, emptyDraft, isStepComplete, toProvisionPayload } from '../frontend/src/features/accounts/newAccountFlow.js';
import { validateProvision } from '../src/domain/accounts/provision.js';
import { readCode, readSrc } from './helpers/src-files.js';
import { readBackend } from './helpers/backend-src.js';

// THE MULTI-ACCOUNT CHALLENGE (migration 0027, owner spec 2026-08-27). A challenge owns
// one account per phase, because a prop firm issues a NEW LOGIN for each phase rather
// than moving one account through them. What is pinned here is the derivation the wizard
// and Prop OS both run — which phase may be added, and in what order the challenges are
// offered — plus the wizard's own branch through the flow's pure functions.

const acct = (over = {}) => ({
  id: 1, mt5_login: 500, label: 'GFT 2-Step 25K', account_type: 'eval', kind: 'synced',
  is_active: true, challenge_id: 10, phase: 'p1', challenge_status: 'active', ...over,
});

const group = (over = {}) => ({
  id: 7, firm_id: 'gft', firm_name: 'GoatFundedTrader', product_id: '2step',
  start_balance: 25000, status: 'active', created_at: '2026-08-01T00:00:00Z',
  accounts: [acct()], ...over,
});

test('a challenge draws the phases its ACCOUNT TYPE has', () => {
  const phases = challengePhases(group());
  assert.deepEqual(phases.map((p) => p.phase), ['p1', 'p2', 'funded']);
  assert.deepEqual(phases.map((p) => p.label), ['Phase 1', 'Phase 2', 'Funded']);
  // Only the phase with an account has a status. An empty stage reports `null`, which is
  // NOT 'active' — the difference is the whole Add-next-phase decision.
  assert.deepEqual(phases.map((p) => p.status), ['active', null, null]);
  assert.equal(phases[0].account.mt5_login, 500);

  // A 3-Step has four stages, a 1-Step two, Instant one. Read off the type, so the
  // journey drawn is the journey the trader bought.
  assert.equal(challengePhases(group({ product_id: '3step' })).length, 4);
  assert.equal(challengePhases(group({ product_id: '1step' })).length, 2);
  assert.deepEqual(challengePhases(group({ product_id: 'instant' })).map((p) => p.phase), ['funded']);
});

test('a re-take is the LATEST account at that phase, not the first', () => {
  // Two accounts at Phase 1 means the first was breached and re-taken. The current one
  // is what the trader is standing in, and the API returns them oldest-first.
  const g = group({
    accounts: [
      acct({ id: 1, mt5_login: 500, challenge_status: 'breached' }),
      acct({ id: 2, mt5_login: 501, challenge_status: 'active' }),
    ],
  });
  const p1 = challengePhases(g)[0];
  assert.equal(p1.account.mt5_login, 501);
  assert.equal(p1.status, 'active');
  assert.equal(p1.attempts, 2);
});

test('the addable phase is the one after a PASS, and nothing else', () => {
  // The case the whole feature exists for: Phase 1 passed, no Phase 2 account yet — the
  // moment the firm issues the next login.
  const passed = group({ accounts: [acct({ challenge_status: 'passed' })] });
  assert.deepEqual(phaseToAdd(passed), { phase: 'p2', reason: null });
  assert.equal(isAwaitingPhase(passed), true);

  // Still running: the firm has issued nothing, so there is nothing to record.
  const running = group();
  assert.equal(phaseToAdd(running).phase, null);
  assert.match(phaseToAdd(running).reason, /Phase 1 is still running/);
  assert.equal(isAwaitingPhase(running), false);

  // Two phases in: p1 passed, p2 running -> the refusal must name PHASE 2, not point at
  // the empty Funded stage after it.
  const midway = group({
    accounts: [
      acct({ id: 1, phase: 'p1', challenge_status: 'passed' }),
      acct({ id: 2, phase: 'p2', challenge_status: 'active' }),
    ],
  });
  assert.equal(phaseToAdd(midway).phase, null);
  assert.match(phaseToAdd(midway).reason, /Phase 2 is still running/);

  // p2 passed -> funded is next, which is the login that pays.
  const toFunded = group({
    accounts: [
      acct({ id: 1, phase: 'p1', challenge_status: 'passed' }),
      acct({ id: 2, phase: 'p2', challenge_status: 'passed' }),
    ],
  });
  assert.equal(phaseToAdd(toFunded).phase, 'funded');
});

test('nothing can be added to a challenge that is over, or that is complete', () => {
  const breached = group({ accounts: [acct({ challenge_status: 'breached' })] });
  assert.equal(phaseToAdd(breached).phase, null);
  assert.match(phaseToAdd(breached).reason, /breached/);

  // The group's own status is the authority; a failed group is refused before its phases
  // are even read, which covers a payload that is stale about one of its accounts.
  assert.match(phaseToAdd(group({ status: 'failed' })).reason, /no longer running/);

  const complete = group({
    accounts: [
      acct({ id: 1, phase: 'p1', challenge_status: 'passed' }),
      acct({ id: 2, phase: 'p2', challenge_status: 'passed' }),
      acct({ id: 3, phase: 'funded', challenge_status: 'active' }),
    ],
  });
  // Refused on the FUNDED account being live rather than as "nothing left" — either way
  // there is no login to record, and the reason names the account that exists.
  assert.equal(phaseToAdd(complete).phase, null);
});

test('a challenge whose accounts are all gone can still be started again', () => {
  // Deleting a phase account does not delete the challenge (ON DELETE SET NULL), so this
  // is a real state. Offering its first phase beats orphaning the record.
  assert.deepEqual(phaseToAdd(group({ accounts: [] })), { phase: 'p1', reason: null });
});

test('the list is this FIRM\'S challenges, ready ones first', () => {
  const ready = group({ id: 1, created_at: '2026-01-01T00:00:00Z', accounts: [acct({ challenge_status: 'passed' })] });
  const running = group({ id: 2, created_at: '2026-08-20T00:00:00Z' });
  const alsoReady = group({ id: 3, created_at: '2026-08-25T00:00:00Z', accounts: [acct({ challenge_status: 'passed' })] });
  const otherFirm = group({ id: 4, firm_id: 'ftmo', firm_name: 'FTMO' });
  const failed = group({ id: 5, status: 'failed' });

  const out = joinableChallenges([ready, running, alsoReady, otherFirm, failed], { firm_id: 'gft', firm_name: 'GoatFundedTrader' });
  // FTMO's challenge is gone (wrong firm — a GFT Phase 2 login cannot be a phase of it)
  // and the failed one is gone entirely: no phase of it will ever be added, so offering
  // it would be offering a dead end.
  assert.deepEqual(out.map((o) => o.id), [3, 1, 2]);
  // Ready first, newest of those first; the un-addable one is still LISTED, because a
  // trader who cannot find their challenge assumes we lost it — but it carries a reason
  // and cannot be chosen.
  assert.equal(out[0].addPhase, 'p2');
  assert.equal(out[2].addPhase, null);
  assert.match(out[2].blockedReason, /still running/);
});

test('the unlisted firm is matched by NAME, so two of them are not one firm', () => {
  // 'other' is the firm_id of EVERY unlisted firm. Matching on the id would offer a
  // FundedNext challenge to an Alpha Capital account — the exact misclassification the
  // escape hatch exists to end.
  const fundedNext = group({ id: 1, firm_id: 'other', firm_name: 'FundedNext' });
  const alpha = group({ id: 2, firm_id: 'other', firm_name: 'Alpha Capital' });
  const out = joinableChallenges([fundedNext, alpha], { firm_id: 'other', firm_name: 'FundedNext' });
  assert.deepEqual(out.map((o) => o.id), [1]);
});

test('a challenge is named for the challenge, not for one of its accounts', () => {
  assert.equal(challengeName(group()), 'GoatFundedTrader 2-Step 25K');
  assert.equal(challengeName(group({ product_id: '3step' })), 'GoatFundedTrader 3-Step 25K');
  // Falls back through what is present rather than printing "undefined".
  assert.equal(challengeName({ firm_name: null, start_balance: null }), 'Other');
});

test('the challenge dictates identity and NOT the rules', () => {
  const f = inheritedFields(group(), 'p2');
  assert.deepEqual(f, {
    challenge_group_id: 7,
    firm_id: 'gft',
    firm_name: 'GoatFundedTrader',
    product_id: '2step',
    start_balance: 25000,
    phase: 'p2',
  });
  // THE RULES ARE ABSENT ON PURPOSE. A firm's Phase 2 drawdowns and target are routinely
  // not its Phase 1 ones, so inheriting them silently would score the account against
  // numbers nobody chose. The server refuses to inherit them either.
  for (const rule of ['daily_dd_pct', 'max_dd_pct', 'profit_target_pct', 'min_trading_days', 'dd_type']) {
    assert.equal(rule in f, false, `${rule} must not be inherited from the challenge`);
  }
});

// ---- the wizard's branch, through the flow's own pure functions -------------

const KEY = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const walk = (patches) => patches.reduce((d, p) => patchDraft(d, p), emptyDraft({ provisionKey: KEY }));

test('the account page is unanswered until the challenge question is', () => {
  // A prop draft with every rule in it but no challenge choice must NOT be complete:
  // provisioning from that state would start a challenge of its own while the trader was
  // looking at the one they meant to continue.
  const base = walk([
    { capital_kind: 'prop' },
    { firm_id: 'gft' },
    {
      product_id: '2step', phase: 'p1', start_balance: 25000,
      daily_dd_pct: 5, max_dd_pct: 10, profit_target_pct: 8, min_trading_days: 3,
      label: 'GoatFundedTrader 2-Step 25K',
    },
  ]);
  assert.equal(isStepComplete(base, 'account'), false, 'no challenge choice');
  assert.equal(isStepComplete(patchDraft(base, { challenge_mode: 'new' }), 'account'), true);
  // 'existing' says only that the list was opened. The challenge itself is the answer.
  const opened = patchDraft(base, { challenge_mode: 'existing' });
  assert.equal(isStepComplete(opened, 'account'), false, 'a mode without a challenge is not an answer');
  assert.equal(isStepComplete(patchDraft(opened, { challenge_group_id: 7 }), 'account'), true);
});

test('the joined challenge rides the payload, and the server accepts it', () => {
  const d = walk([
    { capital_kind: 'prop' },
    { firm_id: 'gft' },
    { challenge_mode: 'existing', challenge_group_id: 7 },
    {
      product_id: '2step', phase: 'p2', start_balance: 25000,
      daily_dd_pct: 5, max_dd_pct: 10, profit_target_pct: 5, min_trading_days: 3,
      label: 'GoatFundedTrader 2-Step 25K P2',
    },
    { platform: 'mt5' },
    { import_method: 'manual' },
  ]);
  const payload = toProvisionPayload(d);
  assert.equal(payload.challenge_group_id, 7);
  assert.equal(payload.phase, 'p2');
  // `challenge_mode` is how the PAGE was answered and is never sent: the server only
  // needs to know whether there is a challenge to join.
  assert.equal('challenge_mode' in payload, false);
  // Asserted against the REAL validator rather than against a restatement of it.
  const parsed = validateProvision(payload);
  assert.equal(parsed.ok, true, parsed.error);
  assert.equal(parsed.value.challenge_group_id, 7);
});

test('a new challenge sends no challenge id, and a live account cannot send one', () => {
  const newOne = walk([
    { capital_kind: 'prop' },
    { firm_id: 'gft' },
    { challenge_mode: 'new' },
    { product_id: '2step', phase: 'p1', start_balance: 25000, daily_dd_pct: 5, max_dd_pct: 10, profit_target_pct: 8, label: 'GFT 2-Step 25K' },
    { platform: 'mt5' },
    { import_method: 'manual' },
  ]);
  // Null means "start a challenge of its own", which is what provisionAccount does with
  // it — so the branch needs no separate flag on the wire.
  assert.equal(toProvisionPayload(newOne).challenge_group_id, null);

  // A live account inside a prop challenge is the same category error capital_kind
  // exists to end, one level up — and it is REFUSED rather than dropped.
  const refused = validateProvision({
    capital_kind: 'live', label: 'IC Live', platform: 'mt5', import_method: 'manual',
    challenge_group_id: 7,
  });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /challenge/);

  // Shape is checked before any work is done; ownership is the transaction's job.
  for (const bad of [0, -1, 'seven', 1.5]) {
    const r = validateProvision({
      capital_kind: 'prop', label: 'x', platform: 'mt5', import_method: 'manual',
      firm_id: 'gft', product_id: '2step', phase: 'p2', challenge_group_id: bad,
    });
    assert.equal(r.ok, false, `challenge_group_id ${bad} must be refused`);
  }
});

test('changing the firm drops the challenge chosen at the previous one', () => {
  // The list is one firm's challenges, so a challenge id outliving its firm is a payload
  // the server would refuse at the very END of the flow (the group's firm wins over the
  // payload) — nine questions after the mistake was made.
  const d = walk([
    { capital_kind: 'prop' },
    { firm_id: 'gft' },
    { challenge_mode: 'existing', challenge_group_id: 7 },
  ]);
  const moved = patchDraft(d, { firm_id: 'ftmo' });
  assert.equal(moved.challenge_group_id, null);
  assert.equal(moved.challenge_mode, null);

  // And so does switching to Live, which has no challenges at all.
  const live = patchDraft(d, { capital_kind: 'live' });
  assert.equal(live.challenge_group_id, null);
  assert.equal(live.challenge_mode, null);
});

test('leaving the existing branch drops what the challenge dictated', () => {
  // Otherwise a trader who picked their 25K challenge, changed their mind and chose New
  // would carry that challenge's type, size and phase into a brand-new challenge as if
  // they had typed them — the page's locked fields simply becoming editable with someone
  // else's answers in them.
  const joined = walk([
    { capital_kind: 'prop' },
    { firm_id: 'gft' },
    { challenge_mode: 'existing', challenge_group_id: 7 },
    { product_id: '2step', phase: 'p2', start_balance: 25000, daily_dd_pct: 5, max_dd_pct: 10 },
  ]);
  const back = patchDraft(joined, { challenge_mode: 'new' });
  assert.equal(back.challenge_group_id, null);
  assert.equal(back.product_id, null);
  assert.equal(back.phase, null);
  assert.equal(back.start_balance, null);

  // But answering the question for the FIRST time clears nothing — that is also a
  // change, and clearing on it would wipe a revived draft's own stored answers.
  const fresh = walk([
    { capital_kind: 'prop' },
    { firm_id: 'gft' },
    { product_id: '2step', phase: 'p1', start_balance: 25000 },
    { challenge_mode: 'new' },
  ]);
  assert.equal(fresh.product_id, '2step');
  assert.equal(fresh.start_balance, 25000);
});

test('the suggested name carries the phase ONLY when joining a challenge', () => {
  // Every phase of one challenge shares its firm, type and size. Without the phase the
  // Phase 2 account is offered the name the Phase 1 account already has — and the page's
  // own uniqueness check then blocks Continue on the wizard's own suggestion.
  const src = readCode('AccountStep.jsx');
  assert.match(src, /challenge_group_id: joining \? chosen\.id : null, phase: effPhase/);
  const flow = readCode('newAccountFlow.js');
  assert.match(flow, /if \(d\.challenge_group_id != null && PHASE_TAG\[d\.phase\]\)/);
  // A short tag, not PHASE_LABEL's prose: this ends up in an account switcher column.
  assert.match(flow, /const PHASE_TAG = \{ p1: 'P1', p2: 'P2', p3: 'P3', funded: 'Funded' \}/);
});

test('the page locks only what the challenge actually knows', () => {
  // A challenge created before the fixed taxonomy carries no product_id, and disabling an
  // empty dropdown would leave the trader unable to finish the page at all.
  const src = readCode('AccountStep.jsx');
  assert.match(src, /type: joining && inherited\.product_id != null/);
  assert.match(src, /size: joining && inherited\.start_balance != null/);
  assert.match(src, /phase: joining && inherited\.phase != null/);
  // A locked value that is not in its own option list renders a BLANK trigger — Base UI
  // reads the item list to label a value. Both dropdowns carry the inherited value.
  assert.match(src, /locked\.size && !ACCOUNT_SIZES\.includes\(Number\(inherited\.start_balance\)\)/);
  assert.match(src, /locked\.phase && !phases\.includes\(effPhase\)/);
});

test('the wizard reads the challenges once, in the shell', () => {
  // The step body is remounted on every navigation (`key={step}`), so a fetch inside the
  // page would re-run each time the trader walked back to it. Gated on the prop branch,
  // because a live account has no phases and the request could never be used.
  const shell = readCode('NewAccountFlow.jsx');
  assert.match(shell, /fetchChallengeGroups\(\)/);
  // Gated on the prop branch OR on a `?challenge=` deep link. The second half is not
  // belt-and-braces: on a COLD deep link the draft has no capital_kind yet, so gating on
  // 'prop' alone would never fetch and the seed would wait forever on a payload nobody
  // asked for.
  assert.match(shell, /if \(draft\.capital_kind !== 'prop' && wantedGroup == null\) return undefined;/);
  // A failure resolves to [] rather than throwing: the Existing branch quietly
  // disappears and the account can still be created as a new challenge, which is the
  // right degradation for an aid to one question.
  assert.match(shell, /\.catch\(\(\) => \{ if \(live\) setChallenges\(\[\]\); \}\)/);
  assert.match(shell, /accounts, challenges, plan/, 'and it rides the flow context');
  // No step may fetch it for itself — one request, one source of truth.
  assert.equal(/fetchChallengeGroups/.test(readCode('AccountStep.jsx')), false);
});

test('a ?challenge= deep link opens the account page with that challenge chosen', () => {
  // The "Add Phase 2 Account" button on a challenge card carries it. The trader has
  // already said WHICH challenge by clicking that card's rail, so the wizard must not ask
  // again.
  const shell = readCode('NewAccountFlow.jsx');
  assert.match(shell, /new URLSearchParams\(location\.search\)\.get\('challenge'\)/);
  // THE FIRM COMES FROM THE SERVER, not from the URL: `&firm=gft` would seed
  // synchronously and skip the wait, at the cost of trusting a URL for the fact that
  // decides which firm's challenge this account joins.
  assert.equal(/get\('firm'\)/.test(shell), false, 'the firm must not ride the URL');
  assert.match(shell, /firm_id: group\.firm_id/);
  assert.match(shell, /challenge_mode: 'existing'/);

  // ONE PATCH, because patchDraft clears the firm and the challenge when capital_kind
  // changes and then merges the patch over the result — two patches would have the first
  // clear what the second relies on.
  const seed = shell.slice(shell.indexOf('if (wantedGroup == null || seedTried'));
  assert.equal((seed.slice(0, seed.indexOf('setSeedTried')).match(/patch\(\{/g) || []).length, 1);

  // The guard cannot see a draft that has not been seeded yet, so the account step is
  // held open while the request is in flight — and the hold closes on its own, because
  // `seedTried` flips whether or not the challenge turned out to be joinable. A stale
  // link must not strand the trader on a step they cannot fill.
  assert.match(shell, /const seedPending = wantedGroup != null && !seedTried && !isCommitted\(draft\)/);
  assert.match(shell, /canVisit\(draft, step\) \|\| \(seedPending && step === 'account'\)/);
  assert.match(shell, /phaseToAdd\(group\)\.phase != null/, 'a challenge with nothing to add seeds nothing');
});

test('the card links into that flow, and only where a phase can be added', () => {
  const card = readCode('ChallengeCard.jsx');
  assert.match(card, /to=\{`\/accounts\/new\/account\?challenge=\$\{row\.id\}`\}/);
  // The button exists only on the ADDABLE stop. A phase whose predecessor has not passed
  // says so instead, because the firm has issued no login for it.
  assert.match(card, /stage\?\.addable \? \(/);
  assert.match(card, /It opens when the phase before it passes/);
});

// ---- Prop OS › Challenges: one card per CHALLENGE ---------------------------

const engineState = (login, over = {}) => ({
  account_id: login, challenge: {}, phase: 'p1', startBalance: 25000, currentEquity: 26400,
  maxDd: { limit: 2500, roomLeft: 1900, fracRemaining: 0.76, breached: false },
  profitTarget: { target: 2000, current: 1400, pctToTarget: 0.7, reached: false },
  tradingDays: { required: 3, completed: 2, met: false },
  breach: { breached: false, reason: null },
  health: { score: 78 }, ...over,
});

test('the rail spans the CHALLENGE, and each stop carries its own account', () => {
  const g = group({
    accounts: [
      acct({ id: 1, mt5_login: 500, phase: 'p1', challenge_status: 'passed' }),
      acct({ id: 2, mt5_login: 501, phase: 'p2', challenge_status: 'active' }),
    ],
  });
  const stages = groupLifecycle(g, { statesByLogin: new Map([['501', engineState(501)]]) });

  assert.deepEqual(stages.map((s) => s.id), ['p1', 'p2', 'funded']);
  // The rail's OWN status words, so LifecycleRail draws this with no new branch.
  assert.deepEqual(stages.map((s) => s.status), ['complete', 'active', 'upcoming']);
  // Each stop's figures are ITS account's. A passed phase has no engine state at all —
  // passing closes its challenge row, which is what removes it from the engine — so it
  // must not borrow the live phase's numbers.
  assert.equal(stages[0].state, null, 'a passed phase has no live state');
  assert.equal(stages[1].state.account_id, 501);
  assert.equal(stages[2].state, null);
  // `current` is the phase being TRADED, not the one waiting to be added: it is what the
  // rail lights, and an empty stop has no figures to light.
  assert.deepEqual(stages.map((s) => s.current), [false, true, false]);
});

test('only a stop with somewhere to go is selectable, and one stop is addable', () => {
  const passed = group({ accounts: [acct({ challenge_status: 'passed' })] });
  const stages = groupLifecycle(passed);
  // p1 has an account to show; p2 is the phase the firm has just issued; Funded is
  // neither — clicking it would have nothing to do, so it is not a button at all.
  assert.deepEqual(stages.map((s) => s.selectable), [true, true, false]);
  assert.deepEqual(stages.map((s) => s.addable), [false, true, false]);

  // Nothing is addable while a phase is still running, and the stop for it stays inert.
  const running = groupLifecycle(group());
  assert.deepEqual(running.map((s) => s.addable), [false, false, false]);
  assert.deepEqual(running.map((s) => s.selectable), [true, false, false]);
});

test('a card opens on the phase that matters, never on nothing', () => {
  // The phase being traded, else the one waiting to be added, else the last that
  // happened — so a card always has a body to draw.
  assert.equal(defaultStage(groupLifecycle(group())), 'p1', 'the phase being traded');
  assert.equal(
    defaultStage(groupLifecycle(group({ accounts: [acct({ challenge_status: 'passed' })] }))),
    'p2', 'the phase waiting to be added',
  );
  assert.equal(
    defaultStage(groupLifecycle(group({ accounts: [acct({ challenge_status: 'breached' })] }))),
    'p1', 'the last phase that happened',
  );
  assert.equal(defaultStage([]), null);
});

test('a card is one challenge, and the firm sections count challenges', () => {
  const waiting = group({ id: 1, created_at: '2026-08-01T00:00:00Z', accounts: [acct({ challenge_status: 'passed' })] });
  const runningG = group({ id: 2, created_at: '2026-08-20T00:00:00Z' });
  const failedG = group({ id: 3, status: 'failed', created_at: '2026-08-05T00:00:00Z' });
  const ftmo = group({ id: 4, firm_id: 'ftmo', firm_name: 'FTMO' });

  const rows = challengeGroupRows({ groups: [waiting, runningG, failedG, ftmo], states: [engineState(500)] });
  assert.equal(rows.length, 4);
  const first = rows.find((r) => r.id === 1);
  assert.equal(first.name, 'GoatFundedTrader 2-Step 25K');
  assert.equal(first.filled, 1, 'one of its three phases has an account');
  assert.equal(first.addPhase, 'p2');

  // A FAILED challenge is KEPT here, unlike in the wizard's list: a challenge you broke
  // is still one of your challenges, and hiding it would make the firm's count disagree
  // with the trader's memory. You just cannot add to it.
  assert.ok(rows.some((r) => r.status === 'failed'));

  const firms = groupChallengesByFirm(rows);
  assert.deepEqual(firms.map((f) => [f.name, f.rows.length]), [['GoatFundedTrader', 3], ['FTMO', 1]]);
  // Within a firm: the challenge awaiting its next phase first — the one thing on the
  // page the trader can act on — then newest.
  assert.deepEqual(firms[0].rows.map((r) => r.id), [1, 2, 3]);
});

test('the rail\'s tone comes from the phase being TRADED, not the one being viewed', () => {
  // A screenshot caught this: the rail lights its active stop with `activeTone`, so
  // passing the SELECTED phase's health drew a live Phase 2 node red the moment the
  // trader clicked back to their passed Phase 1 — a passed phase has no state and
  // healthStatus(0) is 'bad', so a healthy challenge reported itself as critical.
  const card = readCode('ChallengeCard.jsx');
  assert.match(card, /const live = stages\.find\(\(s\) => s\.status === 'active'\) \|\| null/);
  assert.match(card, /activeTone=\{railTone\}/);
  assert.match(card, /: 'na';/, "no live phase means 'we do not know', not red");
});

test('the rail is styled as a control, and the new phase pulses without blinking out', () => {
  // The page cannot style itself — a utility class in a feature file compiles to nothing
  // — so the rail's button and its animation live in the `pc-` namespace with the rest of
  // the module's CSS.
  const css = readSrc('styles/legacy/app.css');
  assert.match(css, /\.pc-step-btn \{/);
  assert.match(css, /\.pc-step\.is-selected \.pc-step-node/);
  assert.match(css, /\.pc-step--next \.pc-step-track > \.pc-step-line:first-child \{/);
  // OPACITY, NOT BACKGROUND. The leg into the addable stop is also the TRAVELLED leg —
  // the phase behind it passed, which is why this one is addable — so animating the
  // background between --line and --status-good made a green leg blink to grey, reading
  // as a connection LOST rather than one newly live.
  assert.match(css, /@keyframes pc-next-leg \{\s*0%, 100% \{ opacity: 1; \}/);
  // An animation that repeats forever is exactly what this setting exists to stop.
  assert.match(css, /prefers-reduced-motion: reduce\) \{\s*\.pc-step--next[\s\S]*?animation: none;/);
  // And it names no colour of its own: the tones come from the tone classes.
  const block = css.slice(css.indexOf('.pc-step-btn {'), css.indexOf('.pc-rail--compact {'));
  assert.equal(/#[0-9a-f]{3,8}\b/i.test(block), false, 'no raw colour in the new rules');
});

test('the route answers a challenge that cannot be joined, rather than 500ing', () => {
  // A 500 is what this looked like before: provisionAccount throws a TYPED conflict and
  // the handler only mapped the two it already knew, rethrowing anything else. Found by
  // driving the real transaction against the dev database, not by reading the handler.
  const routes = readBackend('routes/accounts.js');
  assert.match(routes, /PROVISION_CONFLICT\.GROUP/);
  // 400, not 409: nothing is in conflict — the request names a challenge that cannot be
  // joined. And ONE message for all three causes (not yours / gone / already failed),
  // because telling them apart confirms another tenant's row exists.
  // Sliced to the NEXT conflict branch rather than by a character count — the comment
  // above the reply is longer than any count I would have guessed, and a slice that stops
  // inside it asserts against prose.
  const from = routes.indexOf('PROVISION_CONFLICT.GROUP');
  const branch = routes.slice(from, routes.indexOf('PROVISION_CONFLICT.KEY', from));
  assert.match(branch, /reply\.code\(400\)/);
});
