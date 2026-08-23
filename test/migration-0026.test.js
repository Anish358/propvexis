import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Migrations are asserted as TEXT — the same approach test/email-auth.test.js and
// test/day-notes.test.js take, because there is no test database. What these
// assertions protect is not syntax (Postgres would catch that on deploy) but
// ORDER and DIRECTION: a backfill after SET NOT NULL fails on live data, and a
// half-written CHECK admits exactly the rows it exists to reject.
const sql = readFileSync(
  new URL('../db/migrations/0026_account_capital_and_platform.sql', import.meta.url),
  'utf8',
);

test('0026: capital_kind defaults to prop, so every existing row stays a prop account', () => {
  assert.match(sql, /ADD COLUMN IF NOT EXISTS capital_kind\s+TEXT NOT NULL DEFAULT 'prop'/);
});

test('0026: platform defaults to mt5, which is what every existing account is', () => {
  assert.match(sql, /ADD COLUMN IF NOT EXISTS platform\s+TEXT NOT NULL DEFAULT 'mt5'/);
});

test('0026: product_id is nullable — a live or hand-configured account has none', () => {
  assert.match(sql, /ADD COLUMN IF NOT EXISTS product_id\s+TEXT(?!\s+NOT NULL)/);
});

test('0026: import_method is backfilled BEFORE it is made NOT NULL', () => {
  const backfill = sql.indexOf('SET import_method');
  const notNull = sql.indexOf('ALTER COLUMN import_method SET NOT NULL');
  assert.ok(backfill > -1, 'no backfill found');
  assert.ok(notNull > -1, 'import_method is never made NOT NULL');
  assert.ok(backfill < notNull, 'SET NOT NULL before the backfill fails on any non-empty table');
});

test('0026: the backfill reads a credential, so a converted account is not mislabelled ea', () => {
  // The FundedNext demo account was converted manual -> synced by hand and DOES
  // have a credential; backfilling purely from `kind` would file it as 'ea' and
  // the accounts table would then claim it syncs by a route it does not use.
  assert.match(sql, /EXISTS\s*\(\s*SELECT 1 FROM mt5_credentials/);
});

test('0026: the CHECK constrains import_method against kind in BOTH directions', () => {
  const check = sql.slice(sql.indexOf('import_method_kind_ck'));
  assert.match(check, /'auto_sync'\s*,\s*'ea'/, 'synced side missing');
  assert.match(check, /'file'\s*,\s*'manual'/, 'manual side missing');
  assert.match(check, /kind = 'synced'/);
  assert.match(check, /kind = 'manual'/);
});

test('0026: capital_kind is constrained to the two values the app understands', () => {
  assert.match(sql, /capital_kind_ck.*\n?.*capital_kind IN \('prop'\s*,\s*'live'\)/);
});

test('0026: provision_key is unique only where present', () => {
  // A partial index, not a plain UNIQUE: every pre-existing row has NULL, and in
  // Postgres NULLs do not collide — but the partial index says so explicitly and
  // keeps the intent readable.
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS uq_mt5_accounts_provision_key[\s\S]*WHERE provision_key IS NOT NULL/);
});

test('0026: sync_jobs gains a platform column defaulting to mt5', () => {
  assert.match(sql, /ALTER TABLE sync_jobs ADD COLUMN IF NOT EXISTS platform\s+TEXT NOT NULL DEFAULT 'mt5'/);
});

test('0026: every statement is idempotent, because migrate.js reruns nothing but humans do', () => {
  for (const m of sql.matchAll(/^\s*(ALTER TABLE \w+ ADD COLUMN|CREATE (?:UNIQUE )?INDEX)([^;]*);/gm)) {
    assert.match(m[0], /IF NOT EXISTS/, `not idempotent: ${m[0].slice(0, 70)}`);
  }
});

test('0026: createAccount writes import_method explicitly, or the CHECK rejects every synced insert', () => {
  // mt5_accounts.kind already defaults to 'synced' (0015) and this migration
  // makes import_method NOT NULL DEFAULT 'manual'. If createAccount's INSERT
  // ever again omits import_method, the live POST /api/accounts endpoint
  // inserts kind='synced' + import_method='manual' by default, which
  // mt5_accounts_import_method_kind_ck rejects — every synced account creation
  // 500s. There is no test database, so this is a source-text assertion over
  // the function, the same pattern test/sync-queue.test.js uses for
  // ensureIngestToken.
  //
  // This asserts the PROPERTY (import_method is written, and derived rather than
  // defaulted) rather than its position in the column list — createAccount also
  // writes product_id/capital_kind (Task 9), and those legitimately share the
  // list with firm_id/firm_name ahead of import_method, so pinning import_method
  // to being the literal last column would fail on a correct implementation.
  const src = readFileSync(
    new URL('../src/domain/accounts/accounts.js', import.meta.url),
    'utf8',
  );
  const fn = src.slice(
    src.indexOf('export async function createAccount'),
    src.indexOf('export function stripNullProfitTarget'),
  );
  const insert = fn.slice(fn.indexOf('INSERT INTO mt5_accounts'), fn.indexOf('VALUES'));
  assert.match(insert, /\bimport_method\b/, 'import_method missing from the INSERT column list');
  assert.match(fn, /manual \? 'manual' : 'ea'/, 'import_method must be derived from kind/manual, not left to the column default');
});

test('0026: createAccount casts its percentage defaults to numeric, or a fractional rule 500s', () => {
  // PRE-EXISTING gap: daily_dd_pct/max_dd_pct/profit_target_pct/payout_split_pct
  // are NUMERIC, and AccountForms.jsx's inputs are step="0.1" — plenty of real
  // prop firms use half-percent drawdowns (daily_dd_pct: 4.5). Without an
  // explicit `::numeric` cast, Postgres resolves an untyped
  // COALESCE($n, <bare integer literal>) to integer, and the insert fails with
  // "invalid input syntax for type integer" the moment a caller supplies a
  // fractional value. insertAccountQuery (provisionQueries.js, this branch's own
  // code) already fixed exactly this on the sibling builder, with a comment
  // explaining why — this pins the same fix on the legacy createAccount path
  // the sibling left uncast.
  const src = readFileSync(
    new URL('../src/domain/accounts/accounts.js', import.meta.url),
    'utf8',
  );
  const fn = src.slice(
    src.indexOf('export async function createAccount'),
    src.indexOf('export function stripNullProfitTarget'),
  );
  for (const [param, fallback] of [['$7', '5'], ['$8', '10'], ['$9', '8'], ['$10', '80']]) {
    assert.match(
      fn,
      new RegExp(`COALESCE\\(\\${param}, ${fallback}::numeric\\)`),
      `COALESCE(${param}, ${fallback}) must cast its literal to ::numeric`,
    );
  }
});
