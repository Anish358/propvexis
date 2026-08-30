import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../src/platform/paths.js';
import { cascadeDeleteStatements, LOGIN_KEYED_TABLES } from '../src/domain/accounts/cascade.js';
import {
  RECONCILE_DELETE_EMPTY_SQL, RECONCILE_ARCHIVE_SQL, reconcileGroup,
} from '../src/domain/prop/challengeGroups.js';

// An account's data follows the account. Deleting one destroys everything that was
// about it; archiving one hides everything that was about it, reversibly. And a
// challenge, which is nothing but its phase accounts, follows them both.
//
// CI has no Postgres, so the statements are asserted rather than executed — which is
// also the sharper test for a cascade: what matters is the exact table list and the
// order, and both are visible without a database.

const read = (p) => readFileSync(path.join(repoRoot, p), 'utf8');
const migration = read('db/migrations/0028_account_linked_data.sql');
const accountsDomain = read('src/domain/accounts/accounts.js');
const tradesRoute = read('src/routes/trades.js');
const accountsRoute = read('src/routes/accounts.js');

// A fake pg client recording every statement (mirrors test/provision-tx.test.js).
function fakeClient(rowsFor = () => [{ id: 1 }]) {
  const sql = [];
  return {
    sql,
    query: async (text, values) => { sql.push({ text, values }); return { rows: rowsFor(text) }; },
    release: () => {},
  };
}

// ---------------------------------------------------------------------------
// Deleting an account
// ---------------------------------------------------------------------------

test('the cascade covers every table keyed on the MT5 login', () => {
  const stmts = cascadeDeleteStatements({ id: 42, login: 314943467, userId: 7 });
  for (const table of ['payouts', 'account_fees', 'equity_snapshots', 'accounts', 'candle_requests', 'notifications']) {
    assert.ok(
      stmts.some((s) => s.text.includes(`DELETE FROM ${table} WHERE account_id = $1`)),
      `${table} would survive its account`,
    );
  }
  assert.deepEqual([...LOGIN_KEYED_TABLES].sort(), [
    'account_fees', 'accounts', 'candle_requests', 'equity_snapshots', 'notifications', 'payouts',
  ]);
});

test('the cascade spares `candles`, which is not account data', () => {
  // Keyed by (symbol_base, ts): the shared price history every account's replay
  // reads. Deleting it with one account would blind the replay of every other
  // account that ever traded the same instrument.
  const stmts = cascadeDeleteStatements({ id: 42, login: 314943467, userId: 7 });
  assert.ok(!stmts.some((s) => /DELETE FROM candles\b/.test(s.text)), 'shared market data must not be deleted');
  assert.ok(!LOGIN_KEYED_TABLES.includes('candles'));
});

test('the account row goes LAST, and it is the only statement carrying ownership', () => {
  const stmts = cascadeDeleteStatements({ id: 42, login: 314943467, userId: 7 });
  const last = stmts[stmts.length - 1];
  assert.match(last.text, /DELETE FROM mt5_accounts WHERE id = \$1 AND user_id = \$2/);
  assert.deepEqual(last.values, [42, 7]);
  // Last because trades ride the ON DELETE CASCADE on this row: the account must
  // still exist while the login-keyed deletes run.
  assert.equal(
    stmts.filter((s) => /user_id/.test(s.text)).length, 1,
    'ownership is checked once, on the statement whose row count is read',
  );
  // Every value is bound. A login is a number from the DB, but the account id comes
  // off a URL.
  for (const s of stmts) assert.ok(!/\b42\b|314943467/.test(s.text), `interpolated value in: ${s.text}`);
});

test('a pending account (no login yet) deletes only its own row', () => {
  // An EA account that never bound has no login, so nothing is keyed to it. Passing
  // the null through to `account_id = $1` would match no rows anyway — but silently,
  // which is the kind of no-op that hides a real bug later.
  const stmts = cascadeDeleteStatements({ id: 42, login: null, userId: 7 });
  assert.equal(stmts.length, 1);
  assert.match(stmts[0].text, /DELETE FROM mt5_accounts/);
});

test('deleteAccount runs the whole cascade in ONE transaction', () => {
  // A half-deleted account is worse than either outcome: trades gone but payouts
  // still in the finance ledger is a P&L that reconciles against nothing.
  assert.match(accountsDomain, /await withTransaction\(async \(client\) => \{/);
  assert.match(accountsDomain, /cascadeDeleteStatements\(\{ id, login, userId \}\)/);
  // The ownership statement is found by POSITION, not by matching its text — a
  // builder that grew a second mt5_accounts statement would break a substring check
  // silently, and the thing it would break is the multi-tenant boundary.
  assert.match(accountsDomain, /if \(i === stmts\.length - 1 && res\.rows\.length === 0\) throw new NotOwned\(\)/);
  // And the ownership check aborts from INSIDE, which is the only way to roll back
  // statements that have already run.
  assert.match(accountsDomain, /throw new NotOwned\(\)/);
  assert.match(accountsDomain, /if \(err instanceof NotOwned\) return false/);
});

test('the delete route no longer promises that trades survive', () => {
  assert.ok(
    !/trades keep account_id/.test(accountsRoute),
    'the old "trades become unowned" contract must not be documented any more',
  );
});

// ---------------------------------------------------------------------------
// Archiving an account
// ---------------------------------------------------------------------------

test('archiving is implemented ONLY by ownedLogins excluding the account', () => {
  // The whole mechanism, and the reason unarchiving restores every figure: nothing
  // is written to the account's data to hide it.
  assert.match(
    accountsDomain,
    /SELECT mt5_login FROM mt5_accounts WHERE user_id = \$1 AND is_active AND mt5_login IS NOT NULL/,
  );
  // No archive flag is stamped onto the rows anywhere in the domain.
  assert.ok(!/UPDATE trades SET/.test(accountsDomain), 'archiving must not write to trades');
});

test('a pending account never reaches the scope as login 0', () => {
  // mt5_login is null until the EA binds it, and Number(null) is 0 — which would put
  // a literal 0 in the ANY() list and scope onto nothing.
  assert.match(accountsDomain, /mt5_login IS NOT NULL/);
});

// ---------------------------------------------------------------------------
// The challenge follows its accounts
// ---------------------------------------------------------------------------

test('an emptied challenge is deleted, scoped to its owner', () => {
  assert.match(RECONCILE_DELETE_EMPTY_SQL, /DELETE FROM challenge_groups/);
  assert.match(RECONCILE_DELETE_EMPTY_SQL, /g\.id = \$1 AND g\.user_id = \$2/);
  assert.match(RECONCILE_DELETE_EMPTY_SQL, /NOT EXISTS \(SELECT 1 FROM mt5_accounts a WHERE a\.challenge_group_id = g\.id\)/);
});

test('a challenge is archived only when EVERY account in it is archived', () => {
  // bool_or: true if any account is still active. That is what makes unarchiving one
  // phase bring the whole challenge back.
  assert.match(RECONCILE_ARCHIVE_SQL, /bool_or\(a\.is_active\) AS any_active/);
  assert.match(RECONCILE_ARCHIVE_SQL, /SET is_active\s+= act\.any_active/);
  // archived_at is COALESCEd, so re-running never moves the date it was archived.
  assert.match(RECONCILE_ARCHIVE_SQL, /COALESCE\(g\.archived_at, now\(\)\)/);
  // ...and cleared on the way back, so an unarchived challenge is not stamped.
  assert.match(RECONCILE_ARCHIVE_SQL, /WHEN act\.any_active THEN NULL/);
});

test('reconcile leaves `status` alone — archival is not the same question', () => {
  // 'passed' / 'failed' record what the challenge DID; is_active records whether the
  // trader wants to see it. A passed challenge is exactly the kind that gets
  // archived, so folding one into the other would destroy the record of the pass.
  for (const sql of [RECONCILE_DELETE_EMPTY_SQL, RECONCILE_ARCHIVE_SQL]) {
    assert.ok(!/SET status/.test(sql), 'reconcile must not write status');
    assert.ok(!/failed_at|passed_at/.test(sql), 'reconcile must not touch the outcome stamps');
  }
});

test('reconcileGroup tries the empty case first, then stops', async () => {
  const client = fakeClient((text) => (/DELETE FROM challenge_groups/.test(text) ? [{ id: 5 }] : []));
  const out = await reconcileGroup(5, 7, client);
  assert.deepEqual(out, { id: 5, deleted: true });
  assert.equal(client.sql.length, 1, 'a deleted group must not then be updated');
});

test('reconcileGroup falls through to the archive update when the group survives', async () => {
  const client = fakeClient((text) => (/DELETE FROM challenge_groups/.test(text) ? [] : [{ id: 5, is_active: false }]));
  const out = await reconcileGroup(5, 7, client);
  assert.deepEqual(out, { id: 5, deleted: false, is_active: false });
  assert.equal(client.sql.length, 2);
  assert.deepEqual(client.sql[1].values, [5, 7]);
});

test('reconcileGroup is a no-op for an account in no challenge', async () => {
  const client = fakeClient();
  assert.equal(await reconcileGroup(null, 7, client), null);
  assert.equal(client.sql.length, 0, 'a null group must issue no query at all');
});

test('the archive route reconciles only on an is_active edit', () => {
  // Reconciling on every PATCH would be a write per label save.
  assert.match(accountsRoute, /if \('is_active' in body\) await reconcileGroup\(acct\.challenge_group_id, req\.user\.uid\)/);
});

test('an archived challenge leaves both surfaces that list challenges', () => {
  const groups = read('src/domain/prop/challengeGroups.js');
  assert.match(groups, /WHERE g\.user_id = \$1 AND g\.is_active/);
  // And cannot be joined by a new account through the wizard's back door.
  assert.match(groups, /WHERE id = \$1 AND user_id = \$2 AND status = 'active' AND is_active/);
});

test("the group's is_active is aliased away from the account's", () => {
  // Both halves of that SELECT have an is_active, and pg returns one object per row:
  // unaliased, the second silently wins and a challenge would report the archive
  // state of its last account.
  const groups = read('src/domain/prop/challengeGroups.js');
  assert.match(groups, /g\.is_active AS group_is_active/);
  assert.match(groups, /is_active: r\.group_is_active/);
});

// ---------------------------------------------------------------------------
// Migration 0028
// ---------------------------------------------------------------------------

test('0028 clears BOTH kinds of unlinked trade before constraining the column', () => {
  const orphans = migration.indexOf('DELETE FROM trades WHERE account_id IS NULL');
  const dangling = migration.indexOf('DELETE FROM trades t');
  const notNull = migration.indexOf('ALTER TABLE trades ALTER COLUMN account_id SET NOT NULL');
  const fk = migration.indexOf('ADD CONSTRAINT trades_account_fk');
  assert.ok(orphans > -1, 'account-less trades are not removed');
  assert.ok(dangling > -1, 'trades naming a missing account are not removed');
  // Order is the whole correctness argument: either DELETE running after the
  // constraint would fail the migration instead of cleaning up for it.
  assert.ok(orphans < notNull && dangling < notNull, 'the deletes must precede NOT NULL');
  assert.ok(notNull < fk, 'NOT NULL must precede the foreign key');
});

test('0028 reports what it destroyed', () => {
  // Both deletes are irreversible, so the deploy log is the only record of them.
  assert.match(migration, /GET DIAGNOSTICS/);
  assert.match(migration, /RAISE NOTICE/);
});

test('0028 makes the account link structural, not conventional', () => {
  assert.match(
    migration,
    /FOREIGN KEY \(account_id\) REFERENCES mt5_accounts \(mt5_login\) ON DELETE CASCADE/,
  );
});

test('0028 gives a challenge its own archive flag rather than overloading status', () => {
  assert.match(migration, /ALTER TABLE challenge_groups ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ/);
});

// ---------------------------------------------------------------------------
// Every trade belongs to an account
// ---------------------------------------------------------------------------

test('both trade write paths reject a request naming no account', () => {
  // Without this the insert fails at the constraint with a 500 the trader cannot
  // act on. Two routes, two checks — the manual entry and the CSV import.
  const rejections = tradesRoute.match(/account_id is required/g) ?? [];
  assert.equal(rejections.length, 2, 'both POST /api/trades and /api/trades/import must reject');
});

test('the import checks the account BEFORE parsing the CSV', () => {
  // bodyLimit is 12MB here; validating first means a mis-addressed upload is
  // rejected without doing the work.
  const check = tradesRoute.indexOf('imported trades belong to an account');
  const parse = tradesRoute.indexOf('buildImportTrades(parseCsv(csv))');
  assert.ok(check > -1 && parse > -1);
  assert.ok(check < parse, 'the account must be validated before the CSV is parsed');
});

test('the import dedupe no longer has an account-less branch', () => {
  // `IS NOT DISTINCT FROM` existed to match NULL against NULL — the account-less
  // import. With an account always present it is a plain equality.
  assert.ok(!/account_id IS NOT DISTINCT FROM/.test(tradesRoute));
  assert.match(tradesRoute, /source = 'import' AND account_id = \$2/);
});

test('the client offers Add trade only when an account can receive it', () => {
  const tradeLog = read('frontend/src/features/trades/TradeLog.jsx');
  assert.match(tradeLog, /const canAddTrades = manualAccounts\.length > 0 && \(currentIsManual \|\| selectedLogins\.length !== 1\)/);
  // And the modals no longer offer the state that is now unwritable.
  for (const f of ['AddTradeModal.jsx', 'ImportTradesModal.jsx']) {
    const src = read(`frontend/src/features/trades/${f}`);
    assert.ok(!/<option value="">No account/.test(src), `${f} still offers an account-less trade`);
  }
});
