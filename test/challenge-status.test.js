import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHALLENGE_STATUSES, GROUP_STATUSES, groupOutcomeFor, resolveChallengeOutcome,
} from '../src/domain/prop/challengeStatus.js';
import { phaseOutcomeAlert } from '../src/domain/alerts/alerts.js';
import { readBackend } from './helpers/backend-src.js';

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
  const routes = readBackend('routes/prop.js');
  assert.equal(/applyChallengeOutcome\(/.test(routes), false,
    'the prop read routes must not settle a challenge — that belongs on the ingest path');

  // The write is idempotent in SQL, which is what makes it safe on every tick. A
  // resolver that returned 'passed' forever plus an UPDATE with no status guard would
  // re-stamp the row — and re-announce it — on every trade that followed.
  const groups = readBackend('domain/prop/challengeGroups.js');
  assert.match(groups, /UPDATE challenges[\s\S]*?WHERE mt5_account_id = \$3 AND status = 'active'/);
  assert.match(groups, /UPDATE challenge_groups[\s\S]*?AND g\.status = 'active'/);
});
