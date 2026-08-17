import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStrategyName } from '../src/domain/trades/strategies.js';
import { orderSetups } from '../src/domain/analytics/aggregations.js';

test('normalizeStrategyName trims, collapses whitespace, caps length', () => {
  assert.equal(normalizeStrategyName('  Breakout  '), 'Breakout');
  assert.equal(normalizeStrategyName('Liq   run'), 'Liq run');   // internal whitespace collapsed
  assert.equal(normalizeStrategyName('a'.repeat(80)).length, 60); // capped at MAX_NAME
});

test('normalizeStrategyName returns null for empty / blank / nullish', () => {
  assert.equal(normalizeStrategyName(''), null);
  assert.equal(normalizeStrategyName('   '), null);
  assert.equal(normalizeStrategyName(null), null);
  assert.equal(normalizeStrategyName(undefined), null);
});

test('orderSetups: catalog order first, then unmanaged setups alphabetically', () => {
  const present = ['SMC', 'Breakout', 'Fractal', 'ZZ-legacy', 'Continue'];
  const catalog = ['Continue', 'Fractal', 'SMC', 'Breakout']; // user's chosen order
  assert.deepEqual(
    orderSetups(present, catalog),
    ['Continue', 'Fractal', 'SMC', 'Breakout', 'ZZ-legacy'],
  );
});

test('orderSetups: multi-tenant — a different user sees only their own setups', () => {
  // No hardcoded Continue/Liq-run/Fractal/SMC leaks in for a fresh user.
  const present = ['Momentum', 'Reversal'];
  const catalog = ['Reversal', 'Momentum'];
  assert.deepEqual(orderSetups(present, catalog), ['Reversal', 'Momentum']);
});

test('orderSetups: dedupes and drops null/empty, catalog entries with no trades omitted', () => {
  const present = ['A', 'A', null, '', 'B'];
  const catalog = ['A', 'B', 'C']; // C has no trades → not shown
  assert.deepEqual(orderSetups(present, catalog), ['A', 'B']);
});

test('orderSetups: empty inputs yield empty array', () => {
  assert.deepEqual(orderSetups([], []), []);
  assert.deepEqual(orderSetups(undefined, undefined), []);
});
