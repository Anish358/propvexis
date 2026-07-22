import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scopeCondition } from '../src/accounts.js';
import { buildTradeWhere } from '../src/aggregations.js';

// Account scoping is the multi-tenant boundary. resolveScope hits the DB, but
// its output shape + the SQL predicate it feeds are pure and guarded here:
//  - god ('all')      -> user_id = me         (includes account-less trades)
//  - single account   -> account_id = ANY([login])
//  - multi-select     -> account_id = ANY([logins...]) and god=true (aggregate)

// Helper mirroring how the builders parameterize values.
const collect = () => {
  const params = [];
  const add = (v) => { params.push(v); return `$${params.length}`; };
  return { params, add };
};

test('scopeCondition: god filters by user_id (account-less trades included)', () => {
  const { params, add } = collect();
  const scope = { god: true, userId: 7, logins: [100, 200], filterCol: 'user_id' };
  assert.equal(scopeCondition(scope, add), 'user_id = $1');
  assert.deepEqual(params, [7]);
});

test('scopeCondition: single account filters by account_id = ANY([login])', () => {
  const { params, add } = collect();
  const scope = { god: false, userId: 7, logins: [100], filterCol: 'account_id' };
  assert.equal(scopeCondition(scope, add), 'account_id = ANY($1)');
  assert.deepEqual(params, [[100]]);
});

test('scopeCondition: multi-select filters by account_id = ANY([logins])', () => {
  const { params, add } = collect();
  const scope = { god: true, userId: 7, logins: [100, 300], filterCol: 'account_id' };
  assert.equal(scopeCondition(scope, add), 'account_id = ANY($1)');
  assert.deepEqual(params, [[100, 300]]);
});

test('buildTradeWhere: multi-account scope uses ANY and keeps other filters parameterized', () => {
  const scope = { god: true, userId: 7, logins: [100, 300], filterCol: 'account_id' };
  const { where, params } = buildTradeWhere(scope, 'R', { setups: ['SMC'] });
  assert.match(where, /account_id = ANY\(\$1\)/);
  assert.match(where, /setup = ANY\(\$2\)/);
  assert.deepEqual(params, [[100, 300], ['SMC']]);
});
