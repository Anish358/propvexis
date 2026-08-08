import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRule, evaluateAdherence, normalizeRules, adherenceOf } from '../src/domain/trades/adherence.js';

// A LDN buy on EURUSD with a 12-pip SL, opened Tue 2024-01-02 09:00 UTC.
const trade = {
  session: 'LDN', direction: 'buy', sl_size_pips: 12,
  symbol_base: 'EURUSD', open_time: '2024-01-02T09:00:00Z',
};

test('evaluateRule: session / direction / SL / symbols pass and fail', () => {
  assert.equal(evaluateRule(trade, { type: 'session', values: ['LDN', 'NY'] }), true);
  assert.equal(evaluateRule(trade, { type: 'session', values: ['ASIA'] }), false);
  assert.equal(evaluateRule(trade, { type: 'direction', value: 'buy' }), true);
  assert.equal(evaluateRule(trade, { type: 'direction', value: 'sell' }), false);
  assert.equal(evaluateRule(trade, { type: 'max_sl', value: 15 }), true);   // 12 <= 15
  assert.equal(evaluateRule(trade, { type: 'max_sl', value: 10 }), false);  // 12 > 10
  assert.equal(evaluateRule(trade, { type: 'min_sl', value: 5 }), true);
  assert.equal(evaluateRule(trade, { type: 'symbols', values: ['EURUSD'] }), true);
  assert.equal(evaluateRule(trade, { type: 'symbols', values: ['GBPUSD'] }), false);
});

test('evaluateRule: weekday + hour derive from open_time (UTC)', () => {
  assert.equal(evaluateRule(trade, { type: 'weekdays', values: ['Tue'] }), true);   // 2024-01-02 is a Tuesday
  assert.equal(evaluateRule(trade, { type: 'weekdays', values: ['Mon'] }), false);
  assert.equal(evaluateRule(trade, { type: 'hours', from: 7, to: 16 }), true);       // 09:00 UTC
  assert.equal(evaluateRule(trade, { type: 'hours', from: 13, to: 20 }), false);
});

test('evaluateRule: missing field -> null (not evaluable), unknown type -> null', () => {
  assert.equal(evaluateRule({ session: null }, { type: 'session', values: ['LDN'] }), null);
  assert.equal(evaluateRule({ sl_size_pips: null }, { type: 'max_sl', value: 10 }), null);
  assert.equal(evaluateRule(trade, { type: 'nonsense' }), null);
});

test('evaluateAdherence: followed when every evaluable rule passes', () => {
  const rules = [{ type: 'session', values: ['LDN'] }, { type: 'max_sl', value: 15 }];
  const r = evaluateAdherence(trade, rules);
  assert.equal(r.status, 'followed');
  assert.deepEqual(r.brokenRules, []);
});

test('evaluateAdherence: broken lists the failing rule types', () => {
  const rules = [{ type: 'session', values: ['ASIA'] }, { type: 'max_sl', value: 10 }];
  const r = evaluateAdherence(trade, rules);
  assert.equal(r.status, 'broken');
  assert.deepEqual(r.brokenRules.sort(), ['max_sl', 'session']);
});

test('evaluateAdherence: no rules -> norules; all non-evaluable -> unassessed', () => {
  assert.equal(evaluateAdherence(trade, []).status, 'norules');
  assert.equal(evaluateAdherence(trade, undefined).status, 'norules');
  // rule references a field the trade lacks -> can't assess
  const bare = { session: null, sl_size_pips: null };
  assert.equal(evaluateAdherence(bare, [{ type: 'session', values: ['LDN'] }]).status, 'unassessed');
});

test('evaluateAdherence: non-evaluable rules are skipped, not counted as breaks', () => {
  const bare = { session: 'LDN', sl_size_pips: null }; // SL unknown
  const rules = [{ type: 'session', values: ['LDN'] }, { type: 'max_sl', value: 10 }];
  // session passes, max_sl is skipped -> followed (missing data never punished)
  assert.equal(evaluateAdherence(bare, rules).status, 'followed');
});

test('normalizeRules: drops unknown types, coerces + validates values', () => {
  const raw = [
    { type: 'session', values: ['LDN', 'BOGUS', 'NY'] },
    { type: 'direction', value: 'buy' },
    { type: 'direction', value: 'diagonal' },      // invalid -> dropped
    { type: 'max_sl', value: '15' },               // coerced to number
    { type: 'symbols', values: [' eurusd ', ''] },  // trimmed + uppercased; empties dropped
    { type: 'ghost', value: 1 },                    // unknown -> dropped
  ];
  const out = normalizeRules(raw);
  assert.deepEqual(out.find((r) => r.type === 'session').values, ['LDN', 'NY']);
  assert.equal(out.filter((r) => r.type === 'direction').length, 1);
  assert.equal(out.find((r) => r.type === 'max_sl').value, 15);
  assert.deepEqual(out.find((r) => r.type === 'symbols').values, ['EURUSD']);
  assert.equal(out.find((r) => r.type === 'ghost'), undefined);
});

test('adherenceOf: resolves rules by the trade\'s setup name', () => {
  const map = new Map([['SMC', [{ type: 'session', values: ['LDN', 'NY'] }]]]);
  assert.equal(adherenceOf({ ...trade, setup: 'SMC' }, map).status, 'followed');
  assert.equal(adherenceOf({ ...trade, setup: 'SMC', session: 'ASIA' }, map).status, 'broken');
  assert.equal(adherenceOf({ ...trade, setup: 'Other' }, map).status, 'norules'); // no rules for that strategy
  assert.equal(adherenceOf({ ...trade, setup: null }, map).status, 'norules');
});

test('normalizeRules: non-array input yields empty array', () => {
  assert.deepEqual(normalizeRules(null), []);
  assert.deepEqual(normalizeRules({}), []);
  assert.deepEqual(normalizeRules(undefined), []);
});
