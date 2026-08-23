import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findByProvisionKeyQuery, insertAccountQuery, assignSyntheticLoginQuery, insertChallengeQuery,
} from '../src/domain/accounts/provisionQueries.js';
import { provisionAccount } from '../src/domain/accounts/provision.js';
import { ACCOUNT_COLUMNS } from '../src/domain/accounts/accounts.js';

const propValue = (over = {}) => ({
  capital_kind: 'prop', label: 'GFT 50K', currency: 'USD', broker: null,
  platform: 'mt5', import_method: 'auto_sync', kind: 'synced',
  firm_id: 'gft', firm_name: 'GoatFundedTrader', product_id: '2step', phase: 'p1',
  start_balance: 50000, account_type: 'eval', daily_dd_pct: 5, max_dd_pct: 10,
  profit_target_pct: 8, payout_split_pct: null, dd_type: 'static', min_trading_days: 3,
  provision_key: null, ...over,
});

// A fake pg client recording every statement, returning one canned row per query.
function fakeClient(rows = [{ id: 42, mt5_login: null }]) {
  const sql = [];
  return {
    sql,
    query: async (text, values) => { sql.push({ text, values }); return { rows }; },
    release: () => {},
  };
}
const ran = (client, needle) => client.sql.some((q) => q.text.includes(needle));
const orderOf = (client, needle) => client.sql.findIndex((q) => q.text.includes(needle));

test('the account columns include everything migration 0026 added', () => {
  for (const col of ['capital_kind', 'platform', 'product_id', 'import_method']) {
    assert.ok(ACCOUNT_COLUMNS.includes(col), `${col} missing — the API would never return it`);
  }
});

test('insertAccountQuery writes every new column and parameterizes all input', () => {
  const q = insertAccountQuery(7, propValue(), 314943467);
  assert.match(q.text, /INSERT INTO mt5_accounts/);
  for (const col of ['capital_kind', 'platform', 'product_id', 'import_method', 'firm_id', 'firm_name', 'provision_key']) {
    assert.ok(q.text.includes(col), `${col} is not written`);
  }
  // No interpolation anywhere: every value must ride as a placeholder.
  assert.equal(/'GFT 50K'|314943467/.test(q.text), false, 'a value was interpolated into the SQL');
  assert.ok(q.values.includes('GFT 50K'));
  assert.ok(q.values.includes(314943467));
  assert.ok(q.values.includes(7), 'user_id must be in the values');
});

test('insertAccountQuery sets the login for auto_sync and leaves it null for ea', () => {
  // Auto Sync already knows the login, so it goes in at INSERT and the unique
  // index catches a collision before anything commits. An EA account learns its
  // login from the first trade, exactly as before.
  assert.ok(insertAccountQuery(1, propValue(), 999).values.includes(999));
  const ea = insertAccountQuery(1, propValue({ import_method: 'ea' }), null);
  assert.ok(ea.values.includes(null));
});

test('insertAccountQuery: the values array is pinned position-for-position', () => {
  // `q.values.includes(x)` (used above) is position-blind — it cannot tell a
  // correctly-placed value from one swapped with its neighbour (e.g.
  // capital_kind and platform, both strings). This snapshot is what makes the
  // 22-column placeholder/values audit permanent rather than a one-time count.
  const q = insertAccountQuery(7, propValue(), 314943467);
  assert.deepEqual(q.values, [
    7, 'GFT 50K', null, 'USD', 50000, 'eval',
    5, 10, 8, null,
    'static', 3, 'gft', 'GoatFundedTrader', '2step',
    'prop', 'mt5', 'auto_sync', 'synced', 314943467,
    null, null,
  ]);
});

test('assignSyntheticLoginQuery keeps manual accounts in the negative space', () => {
  const q = assignSyntheticLoginQuery(42);
  assert.match(q.text, /mt5_login = -id/);
  assert.deepEqual(q.values, [42]);
});

test('insertChallengeQuery snapshots the SELECTED phase, not one derived from account_type', () => {
  // createChallengeForAccount() derives phase from account_type and so can only
  // ever produce p1 or funded. Starting directly on Phase 2 is the whole point of
  // the wizard's phase step.
  const q = insertChallengeQuery(42, propValue({ phase: 'p2' }));
  assert.match(q.text, /INSERT INTO challenges/);
  assert.ok(q.values.includes('p2'));
});

test('insertChallengeQuery clears the profit target on a funded phase', () => {
  // challenges.profit_target_pct is nullable and NULL means "no target"; a funded
  // account has none, and carrying the account-level default over would show a
  // funded trader a target they cannot pass.
  const funded = insertChallengeQuery(42, propValue({ phase: 'funded', account_type: 'funded', profit_target_pct: 8 }));
  assert.equal(funded.values.includes(8), false, 'the eval target leaked onto a funded challenge');
  assert.ok(funded.values.includes(null), 'a funded challenge must carry a null target');

  // ...and an eval phase must still carry its target through.
  const evalPhase = insertChallengeQuery(42, propValue({ phase: 'p1', profit_target_pct: 8 }));
  assert.ok(evalPhase.values.includes(8));
});

test('insertChallengeQuery: the values array is pinned position-for-position', () => {
  // Same rationale as the insertAccountQuery snapshot above: `includes()` alone
  // cannot catch two neighbouring values swapped. Shaped like the account row
  // insertAccountQuery's RETURNING gives back, plus `phase` layered on top by
  // the caller — not the raw provision payload, per Finding 1.
  const row = {
    dd_type: 'static', start_balance: 50000, daily_dd_pct: 5, max_dd_pct: 10,
    profit_target_pct: 8, min_trading_days: 3, phase: 'p1',
  };
  const q = insertChallengeQuery(42, row);
  assert.deepEqual(q.values, [42, 'p1', 'static', 50000, 5, 10, 8, 3]);
});

test('provisionAccount: a prop account that omits every percentage does not let the challenge diverge from the account row', async () => {
  // The bug this closes: insertChallengeQuery used to apply its OWN defaults
  // (4/10/no-target) to a v with nulled-out percentages, while insertAccountQuery
  // applied mt5_accounts' defaults (5/10/8) to the same nulls — two different
  // rule sets for one account. Now the challenge is built from the account row
  // insertAccountQuery's RETURNING produced, so whatever that row coalesced to
  // is exactly what the challenge carries.
  const accountRow = {
    id: 42, mt5_login: null, dd_type: 'static', start_balance: 50000,
    daily_dd_pct: 5, max_dd_pct: 10, profit_target_pct: 8, min_trading_days: 0,
  };
  const c = fakeClient([accountRow]);
  await provisionAccount(1, propValue({
    daily_dd_pct: null, max_dd_pct: null, profit_target_pct: null, min_trading_days: null,
  }), { connect: async () => c });
  const challenge = c.sql.find((q) => q.text.includes('INSERT INTO challenges'));
  // accountId, phase, dd_type, start_balance, daily_dd_pct, max_dd_pct, profit_target_pct, min_trading_days
  assert.deepEqual(challenge.values, [42, 'p1', 'static', 50000, 5, 10, 8, 0]);
});

test('provisionAccount: prop + auto_sync writes account, challenge, credential, job — in that order', async () => {
  const c = fakeClient();
  const out = await provisionAccount(1, propValue(), {
    connect: async () => c,
    credential: { server: 'FundedNext-Server3', login: 34728798, password: 'pw' },
    seal: () => 'v1.sealed',
  });
  assert.equal(out.replayed, false);
  assert.equal(out.account.id, 42);
  assert.deepEqual(c.sql.map((q) => q.text).slice(0, 1), ['BEGIN'].slice(0, 1));
  assert.ok(orderOf(c, 'INSERT INTO mt5_accounts') < orderOf(c, 'INSERT INTO challenges'));
  assert.ok(orderOf(c, 'INSERT INTO mt5_accounts') < orderOf(c, 'mt5_credentials'),
    'the credential is sealed under the account id, so it cannot be written first');
  assert.ok(orderOf(c, 'mt5_credentials') < orderOf(c, 'sync_jobs'),
    'a job that leases before its credential exists is handed nothing and spins');
  assert.ok(ran(c, 'COMMIT'));
});

test('provisionAccount: a LIVE account gets no challenge row', async () => {
  const c = fakeClient();
  await provisionAccount(1, propValue({
    capital_kind: 'live', firm_id: null, firm_name: null, product_id: null, phase: null,
    import_method: 'manual', kind: 'manual',
  }), { connect: async () => c });
  assert.equal(ran(c, 'INSERT INTO challenges'), false,
    'this is the fake-challenge bug: a live account must never get one');
  assert.equal(ran(c, 'mt5_credentials'), false);
  assert.ok(ran(c, 'mt5_login = -id'), 'a manual account still needs its synthetic login');
});

test('provisionAccount: an EA account gets a challenge but no credential and no job', async () => {
  const c = fakeClient();
  await provisionAccount(1, propValue({ import_method: 'ea' }), { connect: async () => c });
  assert.ok(ran(c, 'INSERT INTO challenges'));
  assert.equal(ran(c, 'mt5_credentials'), false);
  assert.equal(ran(c, 'sync_jobs'), false, 'nothing to sync until the EA sends a trade');
  assert.equal(ran(c, 'mt5_login = -id'), false, 'a synced account is not in the negative space');
});

test('provisionAccount: a credential handed to an EA import_method is still never written', async () => {
  // The credential/job write is gated on `v.import_method === 'auto_sync' &&
  // credential`. The other EA test omits `credential` entirely and so only ever
  // exercises the `&& credential` half; this exercises the `import_method`
  // half by supplying a credential anyway, to prove EA is not merely "usually"
  // credential-less but that the guard actively refuses to write one.
  const c = fakeClient();
  await provisionAccount(1, propValue({ import_method: 'ea' }), {
    connect: async () => c,
    credential: { server: 'S', login: 5, password: 'pw' },
    seal: () => 'v1.sealed',
  });
  assert.equal(ran(c, 'mt5_credentials'), false);
  assert.equal(ran(c, 'sync_jobs'), false);
});

test('provisionAccount: replaying a provision_key returns the existing account and writes nothing', async () => {
  const c = fakeClient([{ id: 99, mt5_login: 5 }]);
  const out = await provisionAccount(1, propValue({ provision_key: 'abc' }), {
    connect: async () => c,
    credential: { server: 'S', login: 5, password: 'p' },
    seal: () => 'v1.sealed',
  });
  assert.equal(out.replayed, true);
  assert.equal(out.account.id, 99);
  assert.equal(ran(c, 'INSERT INTO mt5_accounts'), false, 'a replay must not create a second account');
});

test('provisionAccount: a login collision surfaces as a typed conflict, not a raw pg error', async () => {
  const c = {
    query: async (text) => {
      if (text.includes('INSERT INTO mt5_accounts')) {
        const err = new Error('duplicate key value violates unique constraint');
        err.code = '23505';
        err.constraint = 'mt5_accounts_mt5_login_key';
        throw err;
      }
      return { rows: [{ id: 1, mt5_login: null }] };
    },
    release: () => {},
  };
  await assert.rejects(
    () => provisionAccount(1, propValue(), {
      connect: async () => c,
      credential: { server: 'S', login: 5, password: 'p' },
      seal: () => 'v1.sealed',
    }),
    (err) => {
      assert.equal(err.conflict, 'login_taken',
        'the route needs to tell a 409 from a 500 without parsing a pg message');
      return true;
    },
  );
});

test('provisionAccount: the password is sealed under the NEW account id', async () => {
  // The AAD binds ciphertext to its account (credAad). Sealing under anything else
  // means the worker cannot open it and the first sync fails as "unreadable".
  const seen = [];
  const c = fakeClient();
  await provisionAccount(1, propValue(), {
    connect: async () => c,
    credential: { server: 'S', login: 5, password: 'pw' },
    seal: (accountId, password) => { seen.push([accountId, password]); return 'v1.sealed'; },
  });
  assert.deepEqual(seen, [[42, 'pw']]);
});

test('provisionAccount: the plaintext password never reaches the SQL layer', async () => {
  const c = fakeClient();
  await provisionAccount(1, propValue(), {
    connect: async () => c,
    credential: { server: 'S', login: 5, password: 'super-secret' },
    seal: () => 'v1.sealed',
  });
  const dump = JSON.stringify(c.sql);
  assert.equal(dump.includes('super-secret'), false, 'a query log would leak the credential');
});
