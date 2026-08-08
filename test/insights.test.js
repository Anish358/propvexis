import { test } from 'node:test';
import assert from 'node:assert/strict';
import { passBreachSummary } from '../src/domain/prop/insights.js';

// Pure pass/breach aggregation over retained challenge history. A row is one
// phase attempt: status active|passed|breached, with phase, start_balance, firm.

const ch = (status, over = {}) => ({
  status, phase: 'p1', start_balance: 50000, firm_id: 'ftmo', firm_name: 'FTMO',
  breach_reason: null, ...over,
});

const rows = [
  ch('passed', { phase: 'p1', firm_id: 'ftmo', firm_name: 'FTMO', start_balance: 100000 }),
  ch('passed', { phase: 'p2', firm_id: 'ftmo', firm_name: 'FTMO', start_balance: 100000 }),
  ch('breached', { phase: 'p1', firm_id: 'gft', firm_name: 'GoatFundedTrader', start_balance: 50000, breach_reason: 'max_dd' }),
  ch('breached', { phase: 'p1', firm_id: 'ftmo', firm_name: 'FTMO', start_balance: 100000, breach_reason: 'daily_dd' }),
  ch('breached', { phase: 'p1', firm_id: null, firm_name: null, start_balance: 50000, breach_reason: null }),
  ch('active', { phase: 'funded', firm_id: 'ftmo', firm_name: 'FTMO', start_balance: 100000 }),
];

test('overall counts + pass rate (closed only)', () => {
  const s = passBreachSummary(rows);
  assert.equal(s.passed, 2);
  assert.equal(s.breached, 3);
  assert.equal(s.active, 1);
  assert.equal(s.attempts, 5);        // closed = passed + breached
  assert.equal(s.passRate, 40);       // 2/5 * 100
});

test('breachReasons tally, null → unspecified, sorted by count', () => {
  const s = passBreachSummary(rows);
  const map = Object.fromEntries(s.breachReasons.map((r) => [r.reason, r.count]));
  assert.deepEqual(map, { max_dd: 1, daily_dd: 1, unspecified: 1 });
});

test('byFirm groups + null firm → Other', () => {
  const s = passBreachSummary(rows);
  const ftmo = s.byFirm.find((b) => b.key === 'ftmo');
  assert.equal(ftmo.passed, 2);
  assert.equal(ftmo.breached, 1);
  assert.equal(ftmo.passRate, 66.67); // 2/3 * 100, round2
  const other = s.byFirm.find((b) => b.key === null);
  assert.equal(other.label, 'Other');
  assert.equal(other.breached, 1);
});

test('bySize labels use K notation', () => {
  const s = passBreachSummary(rows);
  const labels = s.bySize.map((b) => b.label);
  assert.ok(labels.includes('100K'));
  assert.ok(labels.includes('50K'));
});

test('byPhase splits p1/p2/funded', () => {
  const s = passBreachSummary(rows);
  const p1 = s.byPhase.find((b) => b.key === 'p1');
  assert.equal(p1.label, 'Phase 1');
  assert.equal(p1.passed, 1);
  assert.equal(p1.breached, 3);
  const funded = s.byPhase.find((b) => b.key === 'funded');
  assert.equal(funded.active, 1);
  assert.equal(funded.passRate, null); // no closed funded attempts
});

test('empty → zeros, null passRate, empty dimensions', () => {
  const s = passBreachSummary([]);
  assert.deepEqual(
    { passed: s.passed, breached: s.breached, active: s.active, attempts: s.attempts, passRate: s.passRate },
    { passed: 0, breached: 0, active: 0, attempts: 0, passRate: null },
  );
  assert.deepEqual(s.byFirm, []);
  assert.deepEqual(s.breachReasons, []);
});
