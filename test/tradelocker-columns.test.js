import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { repoRoot } from '../src/platform/paths.js';
import {
  buildResolver, num, int, str, ORDERS_HISTORY_FIELDS,
} from '../src/domain/sync/connectors/tradelocker/columns.js';

const REAL_CONFIG = JSON.parse(await readFile(
  path.join(repoRoot, 'test/fixtures/tradelocker/config.json'), 'utf8'));

const CONFIG = { d: { ordersHistoryConfig: { columns: [
  { id: 'id' }, { id: 'tradableInstrumentId' }, { id: 'qty' }, { id: 'side' },
  { id: 'status' }, { id: 'filledQty' }, { id: 'avgPrice' }, { id: 'commission' },
  { id: 'positionId' }, { id: 'createdDate' }, { id: 'lastModified' },
] } } };

test('fields resolve by NAME, never by a hardcoded index', () => {
  const r = buildResolver(CONFIG, 'ordersHistory');
  const row = ['4242', '278', '1.5', 'buy', 'Filled', '1.5', '1.0925', '-0.7', '9001', '1756000000000', '1756000050000'];
  assert.equal(r.get(row, 'id'), '4242');
  assert.equal(r.get(row, 'positionId'), '9001');
  assert.equal(r.get(row, 'commission'), '-0.7');
});

test('a column that moves does not corrupt every field after it', () => {
  // THE BUG THIS PREVENTS: TradeLocker publishes this layout dynamically because
  // it is theirs to change. Hardcoded indices would silently read commission out
  // of the price column and every trade would be wrong with no error anywhere.
  const moved = { d: { ordersHistoryConfig: { columns: [
    { id: 'positionId' }, { id: 'id' }, { id: 'commission' },
  ] } } };
  const r = buildResolver(moved, 'ordersHistory');
  assert.equal(r.get(['9001', '4242', '-0.7'], 'id'), '4242');
  assert.equal(r.get(['9001', '4242', '-0.7'], 'commission'), '-0.7');
});

test('a missing required column throws rather than returning undefined', () => {
  const r = buildResolver(CONFIG, 'ordersHistory');
  assert.equal(r.has('nope'), false);
  assert.throws(() => r.get(['a'], 'nope'), /nope/);
});

test('an unknown section, or a config missing its section, fails loudly', () => {
  assert.throws(() => buildResolver(CONFIG, 'teleport'), /section/);
  assert.throws(() => buildResolver({ d: {} }, 'ordersHistory'), /ordersHistoryConfig/);
  assert.throws(() => buildResolver({ d: { ordersHistoryConfig: { columns: [] } } }, 'ordersHistory'),
    /ordersHistoryConfig/);
  assert.throws(() => buildResolver(undefined, 'ordersHistory'), /ordersHistoryConfig/);
});

test('an empty string is null, never zero', () => {
  // Number('') === 0. Writing a real trade with zero commission because the
  // broker sent "" is a silent money error.
  assert.equal(num(''), null);
  assert.equal(num(null), null);
  assert.equal(num(undefined), null);
  assert.equal(num('   '), null, 'whitespace is as empty as empty');
  assert.equal(num('-0.7'), -0.7);
  assert.equal(num('nonsense'), null, 'unparseable is unknown, not NaN carried into money');
  assert.equal(int(''), null);
  assert.equal(int('9001'), 9001);
  assert.equal(str(''), null);
  assert.equal(str(' OSP-DEMO '), 'OSP-DEMO');
});

test('zero itself survives — only the ABSENT value becomes null', () => {
  // The mirror error: treating '0' as empty would erase a real zero-commission
  // fill and make it indistinguishable from an unknown one.
  assert.equal(num('0'), 0);
  assert.equal(int('0'), 0);
  assert.equal(num(0), 0);
});

test('the real /trade/config fixture resolves every field the pairing needs', () => {
  // The fixture's column order is deliberately not the order any code assumes.
  const r = buildResolver(REAL_CONFIG, 'ordersHistory');
  for (const name of ORDERS_HISTORY_FIELDS) {
    assert.equal(r.has(name), true, `/trade/config carries no '${name}' column`);
  }
});

test('every documented section builds a resolver from the real config', () => {
  for (const section of ['ordersHistory', 'orders', 'positions', 'filledOrders', 'accountDetails']) {
    assert.equal(typeof buildResolver(REAL_CONFIG, section).get, 'function', section);
  }
});
