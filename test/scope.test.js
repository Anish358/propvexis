import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scopeCondition } from '../src/domain/accounts/accounts.js';
import { buildTradeWhere } from '../src/domain/analytics/aggregations.js';

// Account scoping is the multi-tenant boundary. resolveScope hits the DB, but
// its output shape + the SQL predicate it feeds are pure and guarded here.
//
// ONE MODE SINCE THE GOD VIEW WAS REMOVED. Every scope is a list of logins
// filtered by account_id:
//  - 'all'            -> account_id = ANY([every active owned login])
//  - single account   -> account_id = ANY([login]),  multi = false
//  - multi-select     -> account_id = ANY([logins...]), multi = true (aggregate)
//
// `multi` is a PRESENTATION flag — aggregate shape or single-account shape — and
// never a scoping one. The predicate is identical either way.

// Helper mirroring how the builders parameterize values.
const collect = () => {
  const params = [];
  const add = (v) => { params.push(v); return `$${params.length}`; };
  return { params, add };
};

test('scopeCondition: single account filters by account_id = ANY([login])', () => {
  const { params, add } = collect();
  const scope = { userId: 7, logins: [100], multi: false };
  assert.equal(scopeCondition(scope, add), 'account_id = ANY($1)');
  assert.deepEqual(params, [[100]]);
});

test('scopeCondition: multi-select filters by account_id = ANY([logins])', () => {
  const { params, add } = collect();
  const scope = { userId: 7, logins: [100, 300], multi: true };
  assert.equal(scopeCondition(scope, add), 'account_id = ANY($1)');
  assert.deepEqual(params, [[100, 300]]);
});

// THE REGRESSION PIN FOR THE WHOLE CHANGE. `multi` is presentation, not scoping:
// the "all accounts" scope that used to filter by user_id must now produce exactly
// the predicate an explicit selection of the same logins produces. If a user_id
// branch ever comes back, an archived account's trades come back with it — the
// archive is implemented purely by ownedLogins() leaving that login out of this
// list, so a predicate that ignores the list ignores the archive.
test('scopeCondition: multi never reintroduces a user_id filter', () => {
  const a = collect(); const b = collect();
  const asAll = { userId: 7, logins: [100, 300], multi: true };
  const asPicked = { userId: 7, logins: [100, 300], multi: false };
  assert.equal(scopeCondition(asAll, a.add), scopeCondition(asPicked, b.add));
  assert.deepEqual(a.params, b.params);
  assert.ok(!scopeCondition(asAll, collect().add).includes('user_id'));
});

test('scopeCondition: an empty scope matches nothing rather than everything', () => {
  // Every account archived, or a brand-new user. ANY('{}') is false for every row,
  // which is the safe answer — the dangerous bug would be an empty login list
  // degrading into an unfiltered query.
  const { params, add } = collect();
  assert.equal(scopeCondition({ userId: 7, logins: [], multi: false }, add), 'account_id = ANY($1)');
  assert.deepEqual(params, [[]]);
});

test('buildTradeWhere: multi-account scope uses ANY and keeps other filters parameterized', () => {
  const scope = { userId: 7, logins: [100, 300], multi: true };
  const { where, params } = buildTradeWhere(scope, 'R', { setups: ['SMC'] });
  assert.match(where, /account_id = ANY\(\$1\)/);
  assert.match(where, /setup = ANY\(\$2\)/);
  assert.deepEqual(params, [[100, 300], ['SMC']]);
});
