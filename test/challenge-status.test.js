import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHALLENGE_STATUSES, GROUP_STATUSES, groupOutcomeFor, resolveChallengeOutcome,
} from '../src/domain/prop/challengeStatus.js';
import { phaseOutcomeAlert } from '../src/domain/alerts/alerts.js';
import { readBackend } from './helpers/backend-src.js';
import { readCode, stripComments } from './helpers/src-files.js';
import { bucketAccounts, isBreached, isLive, isSettled } from '../frontend/src/features/prop/propAccounts.js';
import { accountsBreakdown, propBrief } from '../src/domain/prop/propOverview.js';

// AUTOMATIC PHASE STATUS (owner spec 2026-08-27). The engine has always computed
// `breach.breached`, `profitTarget.reached` and `tradingDays.met`; nothing wrote them
// down, so a passed account sat in the Evaluation bucket forever and a breached one
// still counted as running. These pin the RULE that now closes a phase — the write
// itself is one guarded UPDATE (challengeGroups.js), asserted at the bottom.

const challenge = (over = {}) => ({ id: 7, mt5_account_id: 3, phase: 'p1', status: 'active', ...over });

// A challengeState-shaped fixture: only the fields the resolver reads. Deliberately
// the same shape test/alerts.test.js uses, because both are reading one engine output.
const state = (over = {}) => ({
  maxDd: { fracRemaining: 1, roomLeft: 2500 },
  dailyDd: { fracRemaining: 1, roomLeft: 1000, day: '2026-08-27' },
  tradingDays: { met: false, completed: 1, required: 3, cycleStart: '2026-08-20T00:00:00Z' },
  profitTarget: { reached: false, target: 2000, current: 500 },
  breach: { breached: false, reason: null },
  ...over,
});

test('an ordinary running phase settles nothing', () => {
  const out = resolveChallengeOutcome({ challenge: challenge(), state: state() });
  assert.deepEqual(out, { status: 'active', reason: null });
});

test('the target alone is NOT a pass while trading days are outstanding', () => {
  // The owner's decision, and the reason for it: hitting 8% on day two of a three-day
  // minimum is not a pass at any firm. Marking it passed would tell the trader to add a
  // Phase 2 account their firm has not issued — a phantom phase, in the one part of
  // this app where being wrong costs real money.
  const out = resolveChallengeOutcome({
    challenge: challenge(),
    state: state({ profitTarget: { reached: true, target: 2000, current: 2100 } }),
  });
  assert.equal(out.status, 'active');
});

test('target AND trading days met passes the phase', () => {
  const out = resolveChallengeOutcome({
    challenge: challenge(),
    state: state({
      profitTarget: { reached: true, target: 2000, current: 2100 },
      tradingDays: { met: true, completed: 3, required: 3, cycleStart: '2026-08-20T00:00:00Z' },
    }),
  });
  assert.deepEqual(out, { status: 'passed', reason: null });
});

test('no day requirement passes on the target alone — with no special case for it', () => {
  // tradingDaysState reports met: true when 0 >= 0, so a firm with no minimum needs no
  // branch here. Pinned because a `required > 0` guard written later would silently
  // freeze every such account short of a pass.
  const out = resolveChallengeOutcome({
    challenge: challenge(),
    state: state({
      profitTarget: { reached: true, target: 2000, current: 2100 },
      tradingDays: { met: true, completed: 2, required: 0, cycleStart: null },
    }),
  });
  assert.equal(out.status, 'passed');
});

test('a breach beats a target reached on the same tick, and carries its reason', () => {
  // Both can be true at once: crossing the target in the morning and blowing the daily
  // limit in the afternoon. The firm keeps the account either way, so the breach is
  // what happened — the same precedence deriveAlerts and accountsBreakdown apply.
  const out = resolveChallengeOutcome({
    challenge: challenge(),
    state: state({
      profitTarget: { reached: true, target: 2000, current: 2100 },
      tradingDays: { met: true, completed: 3, required: 3, cycleStart: null },
      breach: { breached: true, reason: 'daily_dd' },
    }),
  });
  assert.deepEqual(out, { status: 'breached', reason: 'daily_dd' });
});

test('a funded phase never auto-passes — it has no target to cross', () => {
  // profitTargetState() returns null when the challenge carries no target, and 0016
  // stores NULL for every funded row. A funded journey ends in payouts, not in a pass.
  const out = resolveChallengeOutcome({
    challenge: challenge({ phase: 'funded' }),
    state: state({
      profitTarget: null,
      tradingDays: { met: true, completed: 9, required: 3, cycleStart: null },
    }),
  });
  assert.equal(out.status, 'active');
});

test('an account with no drawdown rules is judged by nothing', () => {
  // The same reading deriveAlerts takes of a missing maxDd: a manual account with no
  // rules has no phase to pass or fail.
  const out = resolveChallengeOutcome({ challenge: challenge(), state: state({ maxDd: null }) });
  assert.equal(out.status, 'active');
});

test('a challenge that is already closed is never re-settled', () => {
  for (const status of ['passed', 'breached']) {
    const out = resolveChallengeOutcome({
      challenge: challenge({ status }),
      state: state({ breach: { breached: true, reason: 'max_dd' } }),
    });
    assert.equal(out.status, 'active', `a ${status} row must not be settled again`);
  }
});

test('missing inputs settle nothing rather than throwing', () => {
  assert.equal(resolveChallengeOutcome().status, 'active');
  assert.equal(resolveChallengeOutcome({ challenge: challenge(), state: null }).status, 'active');
  assert.equal(resolveChallengeOutcome({ challenge: null, state: state() }).status, 'active');
});

test('a breach fails the whole challenge; a pass advances it', () => {
  // Owner spec: the firm does not hand back a Phase 2 login because Phase 1 went well,
  // so one breached phase account ends the challenge it belongs to. A pass is the
  // challenge PROGRESSING — the group stays open for the next phase's account.
  assert.equal(groupOutcomeFor({ status: 'breached' }), 'failed');
  assert.equal(groupOutcomeFor({ status: 'passed' }), null);
  assert.equal(groupOutcomeFor({ status: 'active' }), null);
  assert.equal(groupOutcomeFor(), null);
  // 'passed' exists on the group but nothing writes it yet: the last stage is funded,
  // which has no threshold to cross. Stated as a test so a later change is deliberate.
  assert.ok(GROUP_STATUSES.includes('passed'));
  assert.deepEqual(CHALLENGE_STATUSES, ['active', 'passed', 'breached']);
});

test('the settlement alert shares its dedup key with the manual advance', () => {
  // /api/prop/advance stays as an override (owner decision), so one challenge row can
  // be settled automatically AND marked by hand. Both announce through
  // `phase_passed:<challengeId>`, so the trader is told once.
  const passed = phaseOutcomeAlert({
    accountId: 314, label: 'GFT', phase: 'p1', status: 'passed', challengeId: 8,
  });
  assert.equal(passed.type, 'phase_passed');
  assert.equal(passed.dedupKey, '314:phase_passed:8');
  assert.match(passed.title, /Phase 1 passed/);
  // It names the NEXT action, because there is one: the firm has just issued a login.
  assert.match(passed.body, /add the next phase account/i);

  const breached = phaseOutcomeAlert({
    accountId: 314, label: 'GFT', phase: 'p2', status: 'breached', reason: 'daily_dd', challengeId: 9,
  });
  assert.equal(breached.type, 'breach');
  assert.equal(breached.severity, 'critical');
  // Shared with deriveAlerts' own breach alert, so the warning and the settlement are
  // one notification about one challenge rather than two.
  assert.equal(breached.dedupKey, '314:breach:9');
  assert.match(breached.body, /Daily drawdown/);
});

test('the ingest path is where status is written — not a read handler', () => {
  // WHY THIS IS PINNED. Writing status from GET /api/prop/portfolio was the other
  // candidate: it needs no new call site and would look identical in the UI. It is
  // wrong at our scale bar — that route is polled by every open tab, so the write would
  // run on page loads instead of on events, and a mutating read cannot be cached. Every
  // path that can move an account past its target or through its floor (EA ingest,
  // manual trades, CSV import, the candles route) funnels through runAlerts.
  const notif = readBackend('domain/alerts/notifications.js');
  assert.match(notif, /resolveChallengeOutcome\(/);
  assert.match(notif, /applyChallengeOutcome\(/);
  /* THE READ ROUTES must not settle a challenge. The MANUAL OVERRIDE may — POST
   * /api/prop/settle calls the same writer on purpose, so a phase closed by hand and one
   * closed by the engine are the same row in the same shape. So this is asserted per
   * handler rather than per file: every call site must sit inside the settle POST, and no
   * GET may contain one. A blunt "this file never calls it" passed before the override
   * existed and would have had to be deleted to add it — which is how a rule gets lost. */
  const routes = readBackend('routes/prop.js');
  const settleAt = routes.indexOf("app.post('/api/prop/settle'");
  assert.ok(settleAt > -1, 'the override route must exist');
  const nextRoute = routes.indexOf('app.', routes.indexOf('return reply.code(201).send(settled);'));
  for (const m of routes.matchAll(/applyChallengeOutcome\(|reopenChallenge\(/g)) {
    // The import line is not a call site.
    if (routes.lastIndexOf('\n', m.index) < routes.indexOf('\n')) continue;
    assert.ok(m.index > settleAt && m.index < nextRoute,
      `a challenge is settled at ${m.index}, outside the override route — reads must not write`);
  }
  for (const g of routes.matchAll(/app\.get\('\/api\/prop[^']*'/g)) {
    const body = routes.slice(g.index, routes.indexOf('app.', g.index + 10));
    assert.equal(/applyChallengeOutcome\(|reopenChallenge\(/.test(body), false,
      `${g[0]} settles a challenge — that belongs on the ingest path or the override`);
  }

  // The write is idempotent in SQL, which is what makes it safe on every tick. A
  // resolver that returned 'passed' forever plus an UPDATE with no status guard would
  // re-stamp the row — and re-announce it — on every trade that followed.
  const groups = readBackend('domain/prop/challengeGroups.js');
  assert.match(groups, /UPDATE challenges[\s\S]*?WHERE mt5_account_id = \$3 AND status = 'active'/);
  assert.match(groups, /UPDATE challenge_groups[\s\S]*?AND g\.status = 'active'/);
});

// ---- what a SETTLED phase does to every bucket ------------------------------
//
// The status going automatic had a consequence the feature itself does not mention and
// that nearly shipped: passing or breaching CLOSES the challenge row, and every prop read
// path used to fetch the ACTIVE challenge only — so a breached account produced
// `{ challenge: null }`, fell out of `isLive`, and VANISHED from the Portfolio's Breached
// tab, the Overview's breakdown and its own Details page. The account the trader most
// needs to look at was the one the app stopped drawing. The read path now reads the LATEST
// challenge and the buckets read its STATUS.

const settledState = (status, over = {}) => ({
  account_id: 500, challenge: {}, phase: 'p1', status,
  startBalance: 25000, currentEquity: 24000,
  maxDd: { limit: 2500, roomLeft: 1500, fracRemaining: 0.6, breached: false },
  dailyDd: { limit: 1250, roomLeft: 1250, fracRemaining: 1, breached: false, day: '2026-08-27' },
  profitTarget: { target: 2000, current: -1000, pctToTarget: 0, reached: false },
  tradingDays: { required: 3, completed: 3, met: true },
  breach: { breached: false, reason: null },
  health: { score: 60 }, ...over,
});
const accountRowFor = () => ({ mt5_login: 500, label: 'GFT 2-Step 25K', capital_kind: 'prop', start_balance: 25000 });

test('the read path reads the LATEST challenge, not only the active one', () => {
  // Which is what gives a settled phase figures to draw at all. Pinned on the query
  // rather than on its result, because there is no test database — and pinned on the
  // ORDER BY, which is the whole query: active first, then the newest.
  const ch = readBackend('domain/prop/challenges.js');
  assert.match(ch, /export async function currentChallengesByLogin/);
  assert.match(ch, /ORDER BY a\.mt5_login, \(c\.status = 'active'\) DESC, c\.start_date DESC, c\.id DESC/);
  const reports = readBackend('domain/analytics/reports.js');
  assert.match(reports, /currentChallengesByLogin\(logins\)/);
  assert.equal(/activeChallengesByLogin/.test(reports), false);
  // The ALERT evaluator keeps the active-only query: it exists to judge a phase that is
  // still running, and handing it a closed row would have it re-deriving a verdict for a
  // challenge already settled.
  assert.match(readBackend('domain/alerts/notifications.js'), /activeChallengesByLogin\(\[login\]\)/);
});

test('a settled phase is not "live", and a breached one is still breached', () => {
  assert.equal(isSettled(settledState('passed')), true);
  assert.equal(isSettled(settledState('breached')), true);
  assert.equal(isSettled(settledState('active')), false);
  assert.equal(isLive(settledState('active')), true);
  assert.equal(isLive(settledState('passed')), false, 'a passed phase is not still being traded');
  assert.equal(isLive(settledState('breached')), false);
  // The engine's live verdict OR the stored one: the engine sees a floor break the moment
  // it happens, the status is what survives once the row is closed.
  assert.equal(isBreached(settledState('active', { breach: { breached: true, reason: 'max_dd' } })), true);
  assert.equal(isBreached(settledState('breached')), true, 'the stored status must count');
  assert.equal(isBreached(settledState('passed')), false);
});

test('each status lands in exactly ONE portfolio bucket', () => {
  const accounts = [accountRowFor()];
  const count = (status, passed = []) => {
    const b = bucketAccounts({ states: [settledState(status)], passed, accounts });
    return { e: b.evaluation.length, f: b.funded.length, p: b.passed.length, b: b.breached.length };
  };
  assert.deepEqual(count('active'), { e: 1, f: 0, p: 0, b: 0 });
  // A PASSED phase belongs to the Passed tab, which is fed from the pass HISTORY. Leaving
  // it out of the live buckets is what stops it appearing twice — once as a pass and once
  // as an evaluation still in progress, weeks after the firm closed it.
  assert.deepEqual(count('passed', [{ challengeId: 1, accountId: 500 }]), { e: 0, f: 0, p: 1, b: 0 });
  assert.deepEqual(count('breached'), { e: 0, f: 0, p: 0, b: 1 });
  // And an account with no challenge at all still has no bucket: that is a live-capital
  // account or one with no rules, and it is not "evaluation by default".
  const none = bucketAccounts({ states: [{ account_id: 500, challenge: null }], accounts });
  assert.deepEqual([none.evaluation.length, none.funded.length, none.breached.length], [0, 0, 0]);
});

test('the Overview stops counting a settled phase as business, but still reports it', () => {
  const accounts = [accountRowFor()];
  // NOT in the funded/evaluation breakdown: a passed Phase 1 is closed, and counting its
  // capital as under management would inflate the figure for as long as the row exists.
  for (const status of ['passed', 'breached']) {
    const b = accountsBreakdown({ accounts, states: [settledState(status)], challenges: [], payouts: [] });
    assert.equal(b.evaluation.length, 0, `${status} must not read as an evaluation in progress`);
    assert.equal(b.funded.length, 0);
  }
  assert.equal(
    accountsBreakdown({ accounts, states: [settledState('active')], challenges: [], payouts: [] }).evaluation.length,
    1,
  );

  // But the BRIEF must still name the breach — it is the single most important thing that
  // surface can say, and testing `isLive` there would have skipped the account entirely.
  const brief = propBrief({
    accounts, states: [settledState('breached')], payouts: [], fees: [], challenges: [], asOf: new Date(),
  });
  const item = [...brief.left, ...brief.right].find((i) => i.kind === 'breach');
  assert.ok(item, 'a settled breach must still reach the brief');
  assert.match(item.title, /breached/);
});

// ---- every write path must re-evaluate the account -------------------------

test('EVERY trade write re-evaluates its account, not just the EA ingest', () => {
  /* THE BUG THIS CATCHES SHIPPED. When the phase status became automatic it was wired
   * into `evaluateAccountAlerts`, which is called from `runAlerts` — and runAlerts was
   * called from ONE place, /api/trades/ingest. So a trader who typed three winning trades
   * into the Add trade modal met their target, met their trading days, and watched Prop OS
   * go on saying Phase 1: the engine had never been asked. Reproduced against the dev
   * database before fixing, which is the only reason it was found at all.
   *
   * Asserted per HANDLER rather than by counting calls, because the count is what was
   * wrong: one call looked deliberate. Each write handler's own body has to contain it. */
  const trades = readBackend('routes/trades.js');
  const WRITES = [
    ["app.post('/api/trades/ingest'", 'the EA ingest'],
    ["app.post('/api/trades'", 'a hand-entered trade'],
    ["app.post('/api/trades/import'", 'a CSV import'],
    ["app.patch('/api/trades/:id'", 'an edit (an SL change rescales fixed_r)'],
    ["app.delete('/api/trades/:id'", 'a delete (it gives drawdown room back)'],
  ];
  for (const [anchor, what] of WRITES) {
    const from = trades.indexOf(anchor);
    assert.ok(from > -1, `${anchor} not found`);
    /* To the NEXT ROUTE REGISTRATION, and it has to be matched as `\n  app.` rather than
     * as `app.` — every one of these handlers has `app.requireAuth` in its own options
     * object on the SAME line, so a bare `app.` cut the body to nothing and the assertion
     * failed on a handler that was correct. */
    const next = trades.indexOf('\n  app.', from + anchor.length);
    const body = trades.slice(from, next === -1 ? undefined : next);
    assert.match(body, /runAlerts\(/, `${what} does not re-evaluate its account`);
  }
  // The equity feed too: floating drawdown is what breaches an account intraday.
  assert.match(readBackend('routes/candles.js'), /runAlerts\(/);
});

// ---- the manual override ---------------------------------------------------

test('the override settles the phase and opens nothing', () => {
  // NOT /api/prop/advance, which closes the active challenge AND opens the next phase's
  // on the SAME account. That was right while a challenge WAS an account; since 0027 a
  // firm issues a new login per phase, so it invents a Phase 2 on the Phase 1 account and
  // swallows the invitation to add the real one.
  const routes = readBackend('routes/prop.js');
  const from = routes.indexOf("app.post('/api/prop/settle'");
  // stripComments, because the route's own header EXPLAINS that there is no `to_phase`
  // here — asserting its absence against raw source asserts against the prose.
  const body = stripComments(routes.slice(from, routes.indexOf("app.post('/api/prop/advance'")));
  assert.match(body, /applyChallengeOutcome\(acct\.id, \{ status, reason \}\)/);
  assert.equal(/to_phase/.test(body), false, 'the override must not open the next phase');
  // Ownership by LOGIN through the owned-account lookup, like every other route here —
  // the account id arrives in a request body.
  assert.match(body, /ownedAccountByLogin\(req\.user\.uid, login\)/);
  assert.match(body, /reply\.code\(404\)/);
  // Only the three states, and a breach reason only from the two the engine can produce.
  assert.match(body, /\['passed', 'breached', 'active'\]\.includes\(b\.status\)/);
  assert.match(body, /b\.reason === 'daily_dd' \|\| b\.reason === 'max_dd' \? b\.reason : null/);
  // A no-op is a 409, not an empty success the UI would draw as a change.
  assert.match(body, /reply\.code\(409\)/);
});

test('the override works BOTH ways, which an automatic system has to allow', () => {
  // Without a reopen, one bad tick — a stale EA balance, a payout recorded late — leaves
  // a phase permanently passed and its challenge waiting for a login that never comes.
  const groups = readBackend('domain/prop/challengeGroups.js');
  assert.match(groups, /export async function reopenChallenge/);
  // Guarded IN the statement, not by a read-then-write: the partial unique index allows
  // one active challenge per account, so two clicks must not both win.
  assert.match(groups, /AND NOT EXISTS \(\s*SELECT 1 FROM challenges o/);
  // And it un-fails the challenge — but only when no OTHER phase of it is still breached.
  assert.match(groups, /UPDATE challenge_groups g\s*SET status = 'active', failed_at = NULL/);
  assert.match(groups, /WHERE sib\.challenge_group_id = g\.id AND sc\.status = 'breached'/);

  // Reopening announces nothing: it undoes a state the trader just saw announced.
  const routes = readBackend('routes/prop.js');
  const body = routes.slice(routes.indexOf("app.post('/api/prop/settle'"), routes.indexOf("app.post('/api/prop/advance'"));
  assert.match(body, /if \(status !== 'active'\) \{[\s\S]*?insertNotifications/);
});

test('the override is on the page the trader is looking at', () => {
  // The button that existed was on the OVERVIEW's accounts card — three clicks from the
  // rail that shows the phase it acts on. It is now on the phase panel as well, and both
  // call ONE endpoint so they cannot disagree.
  const card = readCode('ChallengeCard.jsx');
  assert.match(card, /import \{ settlePhase \} from '[^']*api\.js'/);
  assert.match(card, /settlePhase\(\{ account_id: stage\.account\.mt5_login, status \}\)/);
  // A running phase offers the two verdicts; a settled one offers the way back. Never
  // both — a phase is in one state, and four buttons would imply it could be in two.
  assert.match(card, /stage\.status === 'active' \? \(/);
  assert.match(card, /settle\('passed'\)/);
  assert.match(card, /settle\('breached'\)/);
  assert.match(card, /settle\('active'\)/);
  // The 409 is rendered, not swallowed: it means another tab (or the engine) got there
  // first, and a button that appears to do nothing is worse than a sentence.
  assert.match(card, /\{err \? <span className="pc-phase-error">\{err\}<\/span> : null\}/);
  // The page refetches rather than patching a local copy of the challenge.
  assert.match(readCode('PropChallenges.jsx'), /onChanged=\{reload\}/);
});
