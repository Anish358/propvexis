import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveAlerts, phasePassedAlert } from '../src/alerts.js';

// Minimal challengeState-shaped fixtures. Only the fields deriveAlerts reads.
const base = (over = {}) => ({
  phase: 'funded',
  maxDd: { fracRemaining: 1, roomLeft: 2500 },
  dailyDd: { fracRemaining: 1, roomLeft: 1000, day: '2026-07-04' },
  tradingDays: { met: false, completed: 1, required: 3, cycleStart: '2026-06-30T00:00:00Z' },
  profitTarget: null,
  breach: { breached: false, reason: null },
  ...over,
});
const call = (state, over = {}) => deriveAlerts({ accountId: 314, challengeId: 7, label: 'GFT', state, ...over });

test('healthy account: no alerts', () => {
  assert.deepEqual(call(base()), []);
});

test('manual account (no maxDd): no alerts', () => {
  assert.deepEqual(call(base({ maxDd: null })), []);
});

test('daily DD proximity: warning at 80% used, critical at 95%', () => {
  const warn = call(base({ dailyDd: { fracRemaining: 0.18, roomLeft: 180, day: '2026-07-04' } }));
  assert.equal(warn.length, 1);
  assert.equal(warn[0].type, 'daily_dd_warning');
  assert.equal(warn[0].severity, 'warning');
  assert.equal(warn[0].dedupKey, '314:daily_dd_80:2026-07-04'); // day-scoped

  const crit = call(base({ dailyDd: { fracRemaining: 0.04, roomLeft: 40, day: '2026-07-04' } }));
  assert.equal(crit[0].severity, 'critical');
  assert.equal(crit[0].dedupKey, '314:daily_dd_95:2026-07-04');
});

test('max DD proximity is challenge-scoped', () => {
  const a = call(base({ maxDd: { fracRemaining: 0.03, roomLeft: 75 } })); // 97% used -> critical band
  assert.equal(a[0].type, 'max_dd_warning');
  assert.equal(a[0].dedupKey, '314:max_dd_95:7'); // challengeId-scoped
});

test('breach supersedes proximity and fires once per challenge', () => {
  const a = call(base({
    breach: { breached: true, reason: 'max_dd' },
    maxDd: { fracRemaining: 0, roomLeft: -10 },
    dailyDd: { fracRemaining: 0, roomLeft: -10, day: '2026-07-04' },
  }));
  assert.equal(a.length, 1);
  assert.equal(a[0].type, 'breach');
  assert.equal(a[0].severity, 'critical');
  assert.equal(a[0].dedupKey, '314:breach:7');
});

test('trading-days-met milestone is cycle-scoped and notes payout eligibility for funded', () => {
  const a = call(base({ tradingDays: { met: true, completed: 3, required: 3, cycleStart: '2026-07-01T00:00:00Z' } }));
  const m = a.find((x) => x.type === 'trading_days_met');
  assert.ok(m);
  assert.match(m.body, /payout eligible/);
  assert.equal(m.dedupKey, '314:trading_days_met:2026-07-01T00:00:00Z');
});

test('target reached fires only for eval (funded has null profitTarget)', () => {
  const funded = call(base({ profitTarget: null }));
  assert.equal(funded.find((x) => x.type === 'target_reached'), undefined);

  const evalState = call(base({ phase: 'p1', profitTarget: { reached: true, target: 1200 } }));
  const t = evalState.find((x) => x.type === 'target_reached');
  assert.ok(t);
  assert.equal(t.dedupKey, '314:target_reached:7');
});

test('multiple simultaneous alerts (max proximity + trading days met)', () => {
  const a = call(base({
    maxDd: { fracRemaining: 0.15, roomLeft: 375 },
    tradingDays: { met: true, completed: 3, required: 3, cycleStart: '2026-07-01T00:00:00Z' },
  }));
  const types = a.map((x) => x.type).sort();
  assert.deepEqual(types, ['max_dd_warning', 'trading_days_met']);
});

test('phasePassedAlert: labelled and challenge-scoped', () => {
  const a = phasePassedAlert({ accountId: 314, label: 'GFT', fromPhase: 'p1', toPhase: 'p2', challengeId: 8 });
  assert.equal(a.type, 'phase_passed');
  assert.match(a.body, /Phase 2/);
  assert.equal(a.dedupKey, '314:phase_passed:8');
});
