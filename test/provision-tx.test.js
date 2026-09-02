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
  // No consistency rule, which is the ordinary case — the wizard's toggle starts off
  // and most firms set no cap at all. The one account that HAS a cap is asserted
  // explicitly in consistency-rule.test.js.
  consistency_pct: null,
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
  // 25-column placeholder/values audit permanent rather than a one-time count.
  const q = insertAccountQuery(7, propValue(), 314943467);
  assert.deepEqual(q.values, [
    7, 'GFT 50K', null, 'USD', 50000, 'eval',
    5, 10, 8, null,
    'static', 3, 'gft', 'GoatFundedTrader', '2step',
    'prop', 'mt5', 'auto_sync', 'synced', 314943467,
    null, null,
    // challenge_group_id (0027). Null here because propValue() names no challenge —
    // provisionAccount is what fills it, from the group it created or locked.
    null,
    // challenge_fee (0031) — what the challenge cost. Null here because propValue()
    // names no cost, which is also the shape of every account added before the field
    // existed and of every phase of an existing challenge.
    null,
    // consistency_pct (0032) — the cap on the share of profit one day may hold. Null
    // here because propValue() names no cap, which is the ordinary case: the wizard's
    // toggle starts off, and plenty of firms run no consistency rule at all. It is the
    // ONE rule in this array with no COALESCE behind it, so a null here really does
    // store a null rather than falling back to a template default.
    null,
  ]);

  // AND THE LAST THREE REALLY ARE WRITTEN when there is a value, rather than being
  // placeholders the INSERT accepts and drops. Asserted BY INDEX, not with `.at(-1)`:
  // this test used to read the group off the end of the array, and adding a column
  // after it silently re-pointed that assertion at the new one — which is the same
  // position-blindness the snapshot above exists to catch.
  const joined = insertAccountQuery(7, propValue({
    challenge_group_id: 91, challenge_fee: 49.5, consistency_pct: 30,
  }), 314943467);
  assert.equal(joined.values[22], 91, 'challenge_group_id rides at position 23');
  assert.equal(joined.values[23], 49.5, 'challenge_fee rides at position 24');
  assert.equal(joined.values[24], 30, 'consistency_pct rides at position 25');
  assert.match(joined.text, /challenge_group_id/);
  assert.match(joined.text, /challenge_fee/);
  assert.match(joined.text, /consistency_pct/);
  // A fractional cost is the normal case — a $49.50 evaluation — and the column is
  // NUMERIC. Nothing rounds it on the way in.
  assert.equal(joined.values[23], 49.5);
  // Same for a fractional cap: real firms quote 12.5% as readily as 30%, and the
  // column is NUMERIC for that reason.
  assert.equal(
    insertAccountQuery(7, propValue({ consistency_pct: 12.5 }), 1).values[24], 12.5,
  );
});

test('provisioning reads back the two columns the account API deliberately does not carry', () => {
  /* account_fees.user_id is NOT NULL and the fee is keyed by MT5 login, so the
   * transaction needs both off the row it just wrote — and ACCOUNT_COLUMNS carries
   * neither `user_id` (a client already knows whose account it asked for) nor
   * `challenge_fee` (0031: the fee ROW is the user-facing figure, and a client holding
   * both numbers would show one purchase twice).
   *
   * BOTH STATEMENTS, and that is the point of pinning it. provisionAccount reassigns
   * `row` from the synthetic-login UPDATE on the manual and file paths — the two paths
   * that ALWAYS have a login to charge — so a shorter RETURNING there would drop the
   * cost on exactly the accounts most likely to have one. */
  for (const q of [insertAccountQuery(7, propValue(), null), assignSyntheticLoginQuery(42)]) {
    assert.match(q.text, /RETURNING[\s\S]*user_id/, 'the fee needs the owner off the row');
    assert.match(q.text, /RETURNING[\s\S]*challenge_fee/, 'the fee needs the amount off the row');
  }
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
    profit_target_pct: 8, min_trading_days: 3, phase: 'p1', consistency_pct: 30,
  };
  const q = insertChallengeQuery(42, row);
  assert.deepEqual(q.values, [42, 'p1', 'static', 50000, 5, 10, 8, 3, 30]);
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
  // accountId, phase, dd_type, start_balance, daily_dd_pct, max_dd_pct, profit_target_pct,
  // min_trading_days, consistency_pct — the last one absent from this account row
  // entirely, which must reach the challenge as an explicit null rather than as
  // undefined: the row is what the challenge is built from, and a column missing from
  // it means the account has no such rule.
  assert.deepEqual(challenge.values, [42, 'p1', 'static', 50000, 5, 10, 8, 0, null]);
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

// ── THE CHALLENGE COST, posted inside the transaction (0031) ──────────────────
//
// `fakeClient` returns one canned row for EVERY query, so the row it is given IS the
// account row provisionAccount reads back — which is exactly what decides whether a
// fee is posted. The default row has no login and no cost, which is why none of the
// tests above sees an account_fees INSERT.

const boundRow = (over = {}) => ({
  id: 42, user_id: 1, mt5_login: 314943467, account_type: 'eval',
  created_at: '2026-09-02T10:00:00.000Z', challenge_fee: 49.5, ...over,
});

test('provisionAccount: the challenge cost becomes an account_fees row, in the same transaction', async () => {
  /* IN THE TRANSACTION, not after it. A fee that committed while the account rolled
   * back would charge a trader for an account they do not have; one written by a
   * follow-up request would be lost to the same network drop the provision_key exists
   * to survive. So it is asserted as an ordering fact, not just as "it ran". */
  const c = fakeClient([boundRow()]);
  await provisionAccount(1, propValue({ challenge_fee: 49.5 }), { connect: async () => c });
  assert.ok(ran(c, 'INSERT INTO account_fees'), 'the cost must be recorded');
  assert.ok(orderOf(c, 'INSERT INTO mt5_accounts') < orderOf(c, 'INSERT INTO account_fees'),
    'the fee is keyed by the login the account INSERT settles');
  assert.ok(orderOf(c, 'INSERT INTO account_fees') < orderOf(c, 'COMMIT'),
    'a fee outside the transaction can outlive a rolled-back account');

  // And it is keyed off the ROW, not off the payload: the login, the owner and the date
  // all come from what was actually written.
  const fee = c.sql.find((q) => q.text.includes('INSERT INTO account_fees'));
  assert.ok(fee.values.includes(314943467), 'keyed by the MT5 login, like every other fee');
  assert.ok(fee.values.includes(1), 'charged to the account owner');
  assert.ok(fee.values.includes('2026-09-02T10:00:00.000Z'),
    "dated to when the account was added, not to now() — both write sites must agree");
  assert.ok(fee.values.includes(49.5));
  assert.ok(fee.values.includes('evaluation'), 'an evaluation account pays an evaluation fee');
  assert.ok(fee.values.includes('provision:42'), 'ext_ref is the idempotency key');
  // Nothing interpolated, like every other builder in this module.
  assert.equal(/314943467|49\.5/.test(fee.text), false, 'a value was interpolated into the SQL');
});

test('provisionAccount: a funded phase pays an ACTIVATION fee, not an evaluation one', async () => {
  // Instant-funding accounts really do charge an activation fee, and FEE_TYPES has had
  // both words since 0018. Derived from account_type on the ROW so the two write sites
  // cannot file the same purchase under two categories.
  const c = fakeClient([boundRow({ account_type: 'funded' })]);
  await provisionAccount(1, propValue({ phase: 'funded', account_type: 'funded', challenge_fee: 199 }), {
    connect: async () => c,
  });
  const fee = c.sql.find((q) => q.text.includes('INSERT INTO account_fees'));
  assert.ok(fee.values.includes('activation'));
  assert.equal(fee.values.includes('evaluation'), false);
});

test('provisionAccount: a PENDING EA account posts no fee — it has no login to key one by', async () => {
  /* Not a gap, a deferral. account_fees is keyed by MT5 login and an EA account binds
   * one on its first trade; a row keyed to null would belong to no account and be
   * invisible to every scope anyway (ownedLogins excludes a pending account). The amount
   * is on the account row and bindOrCheckLogin posts it when the login lands — pinned in
   * challenge-cost.test.js. */
  const c = fakeClient([boundRow({ mt5_login: null })]);
  await provisionAccount(1, propValue({ import_method: 'ea', challenge_fee: 49.5 }), {
    connect: async () => c,
  });
  assert.equal(ran(c, 'INSERT INTO account_fees'), false);
  assert.ok(ran(c, 'INSERT INTO mt5_accounts'), 'the account itself is still created');
  // The cost went in with the account, which is the whole reason the column exists.
  const acct = c.sql.find((q) => q.text.includes('INSERT INTO mt5_accounts'));
  assert.ok(acct.values.includes(49.5));
});

test('provisionAccount: a zero cost records the answer and posts no fee', async () => {
  // A free or comped challenge is a real answer and it is stored, but no money moved —
  // and a $0 row on the ledger is noise POST /api/fees would refuse too.
  const c = fakeClient([boundRow({ challenge_fee: 0 })]);
  await provisionAccount(1, propValue({ challenge_fee: 0 }), { connect: async () => c });
  assert.equal(ran(c, 'INSERT INTO account_fees'), false);
});

test('provisionAccount: replaying a provision_key does not charge the fee twice', async () => {
  // The replay returns before any write, so the fee cannot be re-posted — the first
  // attempt committed it alongside the account. ext_ref is the second line of defence.
  const c = fakeClient([boundRow()]);
  const out = await provisionAccount(1, propValue({ provision_key: 'k1', challenge_fee: 49.5 }), {
    connect: async () => c,
  });
  assert.equal(out.replayed, true);
  assert.equal(ran(c, 'INSERT INTO account_fees'), false);
});
