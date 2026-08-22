# Add Account Flow — Phase A (data, provision, connector seam) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate own-capital accounts from prop accounts in the data model, add an atomic account-provision endpoint, and stand up the platform/connector seam — so the wizard UI in Phase B has a backend to call and the shipped fake-challenge bug is fixed with no new UI.

**Architecture:** One migration adds four columns to `mt5_accounts` plus `platform` on `sync_jobs`. A platform registry in `src/domain/sync/platforms.js` becomes the authority on which platforms exist and which can Auto Sync, with a connector registry beside it holding one MT5 implementation. `POST /api/accounts/provision` validates a payload with pure functions, then writes account + challenge + credential + first-sync job in a single transaction, so every failure leaves zero rows behind. Prop OS filters `capital_kind='prop'` at the route boundary.

**Tech Stack:** Node 20 ESM, Fastify 5, `pg` (raw SQL, no ORM), `node:test` + `node:assert/strict`. No test database — every test here is a pure-function test, a fake-client test, or a source-text assertion.

**Spec:** `docs/superpowers/specs/2026-08-22-add-account-flow-design.md`

## Global Constraints

- **This is Phase A of three.** Phase B is the eleven wizard pages and the onboarding swap; Phase C is the Auto Sync rename and the `ImportTradesModal` extraction. Each gets its own plan. Do not build UI in this plan.
- **The feature is called "Auto Sync", never "Live sync".** New copy and new identifiers use Auto Sync. Renaming the existing `SyncModal`/`SettingsAccounts` copy is Phase C — do not do it here.
- **Route modules are CALLED on the root app instance, never `app.register()`-ed.** A registered plugin is encapsulated and its routes cannot see `app.requireAuth` or the global rate-limit hook. Pinned by `test/routes-split.test.js`.
- **The backend must never import from `frontend/src`.** Deploy rsyncs `src db scripts ea` + `frontend/dist` only; such an import works locally and crashes on the box. Cross-catalog agreement is enforced by a test, not by an import.
- **`node:test` may import `frontend/src` files** — that is the established pattern (`test/propFirms.test.js`). CI installs backend deps only, so a test must never import a frontend *dependency* (React, react-router). Pure data modules only.
- **Never build a path by counting `..` from `import.meta.url`** in application code — use `src/platform/paths.js`. (Tests reading fixtures with `new URL(...)` are fine and are the existing convention.)
- **Migration numbering continues from `0025_mt5_sync.sql`.** This plan adds exactly one: `0026_account_capital_and_platform.sql`.
- **`import_method` ↔ `kind` invariant:** `auto_sync`/`ea` ⇒ `kind='synced'`; `file`/`manual` ⇒ `kind='manual'`. Enforced by a CHECK constraint and by `kindForImportMethod()`.
- **Plan gating values** come from `src/domain/billing/plans.js` and are not redefined: free `syncedAccounts: 0`, pro `3`, premium `1`.
- **Run the full suite before every commit:** `npm test`. It must stay green.

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `db/migrations/0026_account_capital_and_platform.sql` | The four `mt5_accounts` columns, the backfill, both CHECKs, `provision_key`, `sync_jobs.platform` |
| `src/domain/sync/platforms.js` | The platform registry — the authority on ids, Auto Sync availability, credential field descriptors |
| `src/domain/sync/connectors/index.js` | `getConnector(platformId)` resolution |
| `src/domain/sync/connectors/mt5.js` | The one connector: MT5 credential validation |
| `src/domain/accounts/provisionQueries.js` | Pure `{text, values}` builders for the provision transaction |
| `src/domain/accounts/provision.js` | `validateProvision`, `provisionGate`, `kindForImportMethod`, `provisionAccount` |
| `frontend/src/features/accounts/platformCatalog.js` | Presentation half of the platform catalog (names, badges, blurbs) |
| `test/db-transaction.test.js` | `withTransaction` ordering and rollback |
| `test/migration-0026.test.js` | Migration text assertions |
| `test/platforms.test.js` | Platform registry shape + helpers |
| `test/connectors.test.js` | Connector resolution + MT5 credential validation |
| `test/platform-catalog.test.js` | The cross-catalog drift test |
| `test/provision.test.js` | `validateProvision`, `provisionGate`, `kindForImportMethod` |
| `test/provision-tx.test.js` | Transaction composition against a fake client |
| `test/capital-kind.test.js` | Live accounts get no challenge; prop surfaces filter |

**Modified:**

| Path | Change |
|---|---|
| `src/platform/db.js` | add `withTransaction` |
| `src/domain/accounts/accounts.js` | `ACCT_COLS` + `listAccounts` gain the new columns; add `propAccountsOnly` |
| `src/routes/accounts.js` | forward `firm_id`/`firm_name`; skip challenge for live; register the two new routes |
| `src/routes/prop.js` | filter accounts through `propAccountsOnly` |
| `src/domain/sync/queue.js` | `enqueueQuery`/`dueAccountsQuery` write `platform`; `leaseQuery` filters by it; add `requestedPlatforms` |
| `src/routes/sync.js` | pass `requestedPlatforms(body)` into `leaseJobs` |
| `frontend/src/features/prop/propFirms.js` | `products` layer + `platforms`; `templateToFields` takes `productId` |
| `frontend/src/features/accounts/AccountForms.jsx` | `TemplatePicker` gains a product select |
| `frontend/src/features/prop/propAccounts.js` | add `onlyPropCapital` |
| `frontend/src/features/prop/{PropOS,PropAccounts,PropChallenges,Finance}.jsx` | filter through `onlyPropCapital` |
| `frontend/src/features/settings/SettingsAccounts.jsx` | Type cell keys off `capital_kind` |
| `test/propFirms.test.js` | updated for the products layer |

---

### Task 1: `withTransaction` helper

Three modules hand-roll `pool.connect()` + `BEGIN`/`COMMIT` (`src/platform/auth/auth.js:135`, `src/domain/prop/challenges.js:205`, `src/domain/trades/strategies.js:59`). Provision would be the fourth, which is the smell that justifies extracting it. The `connect` parameter exists so a test can inject a fake client — there is no test database in this repo.

**Files:**
- Modify: `src/platform/db.js` (append at end of file)
- Test: `test/db-transaction.test.js`

**Interfaces:**
- Consumes: `pool` from `src/platform/db.js`
- Produces: `withTransaction(fn, connect?) -> Promise<T>` where `fn: (client) => Promise<T>` and `connect: () => Promise<PoolClient>` defaults to `() => pool.connect()`

- [ ] **Step 1: Write the failing test**

Create `test/db-transaction.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withTransaction } from '../src/platform/db.js';

// A fake pg client that records the SQL it was handed, in order, so the
// BEGIN/COMMIT/ROLLBACK/release contract is assertable without a database.
function fakeClient(overrides = {}) {
  const calls = [];
  return {
    calls,
    query: overrides.query || (async (text) => { calls.push(text); return { rows: [] }; }),
    release: () => { calls.push('RELEASE'); },
  };
}

test('withTransaction: BEGIN, body, COMMIT, then release — in that order', async () => {
  const c = fakeClient();
  const out = await withTransaction(async (client) => {
    await client.query('INSERT 1');
    return 'result';
  }, async () => c);
  assert.equal(out, 'result');
  assert.deepEqual(c.calls, ['BEGIN', 'INSERT 1', 'COMMIT', 'RELEASE']);
});

test('withTransaction: rolls back and still releases when the body throws', async () => {
  const c = fakeClient();
  await assert.rejects(
    () => withTransaction(async () => { throw new Error('boom'); }, async () => c),
    /boom/,
  );
  assert.deepEqual(c.calls, ['BEGIN', 'ROLLBACK', 'RELEASE']);
});

test('withTransaction: a failing ROLLBACK does not mask the original error', async () => {
  // A dead connection makes ROLLBACK throw too. The caller must still see the
  // real cause, not "connection terminated" — that is the difference between a
  // debuggable 500 and a mystery.
  const calls = [];
  const c = {
    calls,
    query: async (text) => {
      calls.push(text);
      if (text === 'ROLLBACK') throw new Error('connection terminated');
      return { rows: [] };
    },
    release: () => { calls.push('RELEASE'); },
  };
  await assert.rejects(
    () => withTransaction(async () => { throw new Error('the real cause'); }, async () => c),
    /the real cause/,
  );
  assert.deepEqual(calls, ['BEGIN', 'ROLLBACK', 'RELEASE']);
});

test('withTransaction: the client is released even when COMMIT throws', async () => {
  const calls = [];
  const c = {
    query: async (text) => {
      calls.push(text);
      if (text === 'COMMIT') throw new Error('commit failed');
      return { rows: [] };
    },
    release: () => { calls.push('RELEASE'); },
  };
  await assert.rejects(() => withTransaction(async () => 'x', async () => c), /commit failed/);
  assert.ok(calls.includes('RELEASE'), 'a leaked client exhausts the pool');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/db-transaction.test.js`
Expected: FAIL — `withTransaction is not a function` (it is not exported yet).

- [ ] **Step 3: Write the minimal implementation**

Append to `src/platform/db.js`:

```js
/**
 * Run `fn` inside a transaction on one pooled client.
 *
 * Three modules used to hand-roll this (auth.js, challenges.js, strategies.js);
 * account provisioning would have been the fourth. Two properties are worth
 * stating because getting either wrong is silent:
 *
 *  - the client is released in `finally`, so a throw anywhere cannot leak it.
 *    A leaked client is invisible until the pool is exhausted, which then looks
 *    like the database being slow rather than like a bug.
 *  - a failing ROLLBACK is swallowed. On a dead connection ROLLBACK throws too,
 *    and letting that propagate would replace the real cause with
 *    "connection terminated" in every log.
 *
 * `connect` is injectable so the contract above is testable without a database
 * (test/db-transaction.test.js) — this repo has no test DB.
 */
export async function withTransaction(fn, connect = () => pool.connect()) {
  const client = await connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* see above — never mask the original error */
    }
    throw err;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/db-transaction.test.js`
Expected: PASS, 4 tests.

Then run the whole suite: `npm test` — expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/platform/db.js test/db-transaction.test.js
git commit -m "$(cat <<'MSG'
Extract withTransaction, the fourth copy of BEGIN/COMMIT

auth.js, challenges.js and strategies.js each hand-roll pool.connect() plus
BEGIN/COMMIT, and account provisioning was about to be the fourth. Two
properties are easy to get silently wrong and are now tested: the client is
released in finally, because a leaked client is invisible until the pool is
exhausted and then looks like a slow database; and a failing ROLLBACK is
swallowed, because on a dead connection it throws too and would replace the
real cause with "connection terminated" in every log.

connect is injectable so both are testable without a database.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 2: Migration 0026

**Files:**
- Create: `db/migrations/0026_account_capital_and_platform.sql`
- Test: `test/migration-0026.test.js`

**Interfaces:**
- Produces: columns `mt5_accounts.capital_kind`, `.platform`, `.product_id`, `.import_method`, `.provision_key`, and `sync_jobs.platform` — consumed by Tasks 8, 10 and 12.

- [ ] **Step 1: Write the failing test**

Create `test/migration-0026.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/migration-0026.test.js`
Expected: FAIL — `ENOENT: no such file or directory ... 0026_account_capital_and_platform.sql`.

- [ ] **Step 3: Write the migration**

Create `db/migrations/0026_account_capital_and_platform.sql`:

```sql
-- Add Account flow, Phase A. Two things this table could not say before:
-- whose money is in the account, and what platform it is reached over.
--
-- WHY capital_kind EXISTS. Every column here is prop-shaped -- account_type
-- defaults to 'eval', daily_dd_pct to 5, max_dd_pct to 10, profit_target_pct to
-- 8 -- and routes/accounts.js creates a `challenges` row for EVERY account. So a
-- trader journaling their own live account was given an invented 5/10/8 rule set
-- and counted by Prop OS as an evaluation account with a profit target it does
-- not have. That is the bug this column fixes; the fix is completed in code by
-- provisionAccount, which creates no challenge when capital_kind = 'live'.
--
-- WHY THE DEFAULTS NEED NO BACKFILL. Every account that exists today is a
-- GFT/FTMO prop account reached over MT5, so 'prop' and 'mt5' are not merely
-- safe defaults, they are the truth for existing rows.
--
-- The three prop rule columns deliberately stay NOT NULL. On a live account they
-- keep their defaults and are never read: no challenge row exists and every prop
-- surface filters capital_kind. Loosening them instead would mean auditing every
-- reader in the prop engine for null-safety. The invariant is pinned by
-- test/capital-kind.test.js.
ALTER TABLE mt5_accounts ADD COLUMN IF NOT EXISTS capital_kind  TEXT NOT NULL DEFAULT 'prop';
ALTER TABLE mt5_accounts ADD COLUMN IF NOT EXISTS platform      TEXT NOT NULL DEFAULT 'mt5';

-- The firm's challenge PRODUCT ('1step' | '2step' | 'instant'), paired with
-- firm_id from 0018. Nullable: a live account has no product, and neither does a
-- prop account whose rules were typed in by hand. firm_id + start_balance +
-- account_type cannot tell a 1-step account from a 2-step one, which is why this
-- is a column and not a derivation.
ALTER TABLE mt5_accounts ADD COLUMN IF NOT EXISTS product_id    TEXT;

-- How trades reach this account. `kind` has two values ('synced' | 'manual') for
-- four answers, and the pair it collapses -- typing trades in by hand versus
-- importing a statement -- is not recoverable afterwards.
ALTER TABLE mt5_accounts ADD COLUMN IF NOT EXISTS import_method TEXT;

-- Idempotency for POST /api/accounts/provision. A network drop after COMMIT but
-- before the response is exactly when a user presses the button again, and the
-- alternative to this column is a duplicate account at the end of a nine-step
-- flow.
ALTER TABLE mt5_accounts ADD COLUMN IF NOT EXISTS provision_key TEXT;

-- Backfill BEFORE the NOT NULL, or this fails on any non-empty table.
--
-- Reading mt5_credentials rather than switching on `kind` alone matters for at
-- least one real row: the FundedNext demo account was converted manual -> synced
-- by hand and does have a credential, so a kind-only backfill would file it as
-- 'ea' and the accounts table would claim it syncs by a route it does not use.
UPDATE mt5_accounts a
   SET import_method = CASE
         WHEN a.kind = 'manual' THEN 'manual'
         WHEN EXISTS (SELECT 1 FROM mt5_credentials c WHERE c.account_id = a.id) THEN 'auto_sync'
         ELSE 'ea'
       END
 WHERE a.import_method IS NULL;

ALTER TABLE mt5_accounts ALTER COLUMN import_method SET DEFAULT 'manual';
ALTER TABLE mt5_accounts ALTER COLUMN import_method SET NOT NULL;

-- import_method and kind must never disagree: kind is load-bearing (it decides
-- the synthetic negative login, the plan cap and sync eligibility) while
-- import_method is the finer-grained answer the UI collects. Two fields naming
-- the same fact drift unless something forbids it.
ALTER TABLE mt5_accounts DROP CONSTRAINT IF EXISTS mt5_accounts_import_method_kind_ck;
ALTER TABLE mt5_accounts ADD CONSTRAINT mt5_accounts_import_method_kind_ck CHECK (
      (import_method IN ('auto_sync', 'ea') AND kind = 'synced')
   OR (import_method IN ('file', 'manual')  AND kind = 'manual')
);

ALTER TABLE mt5_accounts DROP CONSTRAINT IF EXISTS mt5_accounts_capital_kind_ck;
ALTER TABLE mt5_accounts ADD CONSTRAINT mt5_accounts_capital_kind_ck
  CHECK (capital_kind IN ('prop', 'live'));

-- Partial: every pre-existing row is NULL here, and a plain UNIQUE would say the
-- same thing in Postgres, but the predicate states the intent out loud.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mt5_accounts_provision_key
    ON mt5_accounts (provision_key) WHERE provision_key IS NOT NULL;

-- Which fleet can run this job. MT5 needs the Windows box and its portable
-- terminals; cTrader and TradeLocker will be plain Linux workers. Denormalized
-- from the account at enqueue so the lease scan stays one index read.
--
-- Default 'mt5' is also the backwards-compatibility story: the Windows agent will
-- not send a platform filter the moment this deploys (and that box is stopped most
-- of the time), so a missing filter must mean MT5. See requestedPlatforms().
ALTER TABLE sync_jobs ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'mt5';

CREATE INDEX IF NOT EXISTS idx_sync_jobs_runnable_platform
    ON sync_jobs (platform, status, run_after);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/migration-0026.test.js`
Expected: PASS, 10 tests.

- [ ] **Step 5: Apply the migration locally and verify the shape**

Run: `npm run db:migrate`
Expected: `applied 0026_account_capital_and_platform.sql`.

Verify the backfill and the constraint actually landed (local Postgres is on port 5433 — see the `dev-environment` notes):

```bash
psql "$DATABASE_URL" -c "\d mt5_accounts" | grep -E "capital_kind|platform|product_id|import_method|provision_key"
psql "$DATABASE_URL" -c "SELECT kind, import_method, count(*) FROM mt5_accounts GROUP BY 1,2 ORDER BY 1,2;"
```

Expected: every `synced` row reads `ea` or `auto_sync`, every `manual` row reads `manual`, and no row has a NULL `import_method`.

Prove the CHECK rejects the pair it exists to reject:

```bash
psql "$DATABASE_URL" -c "UPDATE mt5_accounts SET import_method='auto_sync' WHERE kind='manual';"
```

Expected: `ERROR: new row for relation "mt5_accounts" violates check constraint "mt5_accounts_import_method_kind_ck"`. If that command SUCCEEDS, the constraint is wrong — stop and fix it before committing.

- [ ] **Step 6: Run the full suite and commit**

Run: `npm test` — expected: all green.

```bash
git add db/migrations/0026_account_capital_and_platform.sql test/migration-0026.test.js
git commit -m "$(cat <<'MSG'
Give an account a capital kind and a platform

Two things mt5_accounts could not say: whose money is in the account, and what
platform it is reached over. The first is a shipped bug -- every column here is
prop-shaped and routes/accounts.js creates a challenge row for EVERY account, so
a trader journaling their own live account was handed an invented 5/10/8 rule set
and counted by Prop OS as an evaluation account with a profit target it does not
have.

Defaults need no backfill: every account today is a GFT/FTMO prop account over
MT5, so 'prop' and 'mt5' are the truth for existing rows, not just safe. The one
column that does need one is import_method, and it reads mt5_credentials rather
than switching on kind alone -- the FundedNext demo was converted manual->synced
by hand and does have a credential, so a kind-only backfill would file it as 'ea'
and claim it syncs by a route it does not use.

sync_jobs.platform defaults to mt5 so the Windows agent, which will not send a
platform filter when this deploys and is stopped most of the time, keeps working
untouched.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 3: The platform registry

**Files:**
- Create: `src/domain/sync/platforms.js`
- Test: `test/platforms.test.js`

**Interfaces:**
- Produces:
  - `PLATFORMS: Array<{ id, label, connector: string|null, enabled: boolean, importMethods: string[], assetTypes: string[], credentialFields: Array<{name,label,type,required,placeholder?,secret?}>, credentialNote: string|null }>`
  - `PLATFORM_IDS: string[]`
  - `IMPORT_METHODS: ['auto_sync','ea','file','manual']`
  - `findPlatform(id) -> platform | null`
  - `platformSupports(id, importMethod) -> boolean`
  - `autoSyncPlatforms() -> platform[]`

  Consumed by Tasks 4, 5, 7 and 9.

- [ ] **Step 1: Write the failing test**

Create `test/platforms.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLATFORMS, PLATFORM_IDS, IMPORT_METHODS,
  findPlatform, platformSupports, autoSyncPlatforms,
} from '../src/domain/sync/platforms.js';

// Two fields carry different meanings and are easy to conflate:
//   enabled       -- may be CHOSEN in the wizard at all
//   connector     -- non-null means Auto Sync is available for it
// 'other' is enabled with no connector: a trader whose platform is absent must
// still have a way through the flow.

test('ids are unique and non-empty', () => {
  const ids = PLATFORMS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z0-9_]+$/);
  assert.deepEqual(PLATFORM_IDS, ids);
});

test('every platform is fully described — no half-filled row', () => {
  for (const p of PLATFORMS) {
    assert.ok(p.label, `${p.id} needs a label`);
    assert.ok(Array.isArray(p.importMethods) && p.importMethods.length, `${p.id} needs importMethods`);
    assert.ok(Array.isArray(p.assetTypes), `${p.id} needs assetTypes`);
    assert.ok(Array.isArray(p.credentialFields), `${p.id} needs credentialFields`);
    assert.equal(typeof p.enabled, 'boolean', `${p.id} enabled must be boolean`);
    assert.ok(p.connector === null || typeof p.connector === 'string', `${p.id} connector`);
  }
});

test('every declared import method is one the schema allows', () => {
  // The CHECK in 0026 admits exactly these four; a fifth here would 400 at
  // provision or, worse, violate the constraint at insert.
  assert.deepEqual(IMPORT_METHODS, ['auto_sync', 'ea', 'file', 'manual']);
  for (const p of PLATFORMS) {
    for (const m of p.importMethods) {
      assert.ok(IMPORT_METHODS.includes(m), `${p.id} offers unknown method ${m}`);
    }
  }
});

test('only a platform with a connector may offer auto_sync', () => {
  // This is the honesty rule. Offering Auto Sync where no connector exists is a
  // dead end at the last step of a nine-step flow.
  for (const p of PLATFORMS) {
    if (p.importMethods.includes('auto_sync')) {
      assert.ok(p.connector, `${p.id} offers auto_sync with no connector`);
    }
  }
});

test('a platform with no connector still offers a way in', () => {
  for (const p of PLATFORMS.filter((x) => !x.connector)) {
    assert.ok(
      p.importMethods.includes('file') || p.importMethods.includes('manual'),
      `${p.id} cannot auto-sync and offers no manual route — it is a dead end`,
    );
  }
});

test('mt5 is the one platform that can Auto Sync in Phase A', () => {
  assert.deepEqual(autoSyncPlatforms().map((p) => p.id), ['mt5']);
});

test('mt4 exists but cannot Auto Sync — the EA is .mq5 and the farm is MT5-only', () => {
  const mt4 = findPlatform('mt4');
  assert.ok(mt4, 'mt4 must be listed; plenty of prop accounts are MT4 and CSV import works');
  assert.equal(mt4.connector, null);
  assert.equal(mt4.importMethods.includes('auto_sync'), false);
  assert.equal(mt4.importMethods.includes('ea'), false, 'the EA cannot attach to MT4');
});

test('ctrader and tradelocker are listed but not yet connectable', () => {
  for (const id of ['ctrader', 'tradelocker']) {
    const p = findPlatform(id);
    assert.ok(p, `${id} must be listed so the catalog is the real roadmap`);
    assert.equal(p.connector, null);
    assert.equal(p.enabled, false);
  }
});

test('mt5 credential fields describe server, login and password', () => {
  const fields = findPlatform('mt5').credentialFields;
  assert.deepEqual(fields.map((f) => f.name), ['server', 'login', 'password']);
  const password = fields.find((f) => f.name === 'password');
  assert.equal(password.secret, true, 'the password must be marked secret so no page logs or persists it');
  assert.equal(password.type, 'password');
  for (const f of fields) assert.equal(f.required, true);
});

test('mt5 states the read-only rule as the checked fact it is', () => {
  // This copy must live on the connector, not in a page: TradeLocker has no
  // investor-password concept, so P2 must not be able to inherit the promise.
  assert.match(findPlatform('mt5').credentialNote, /investor|read-only/i);
});

test('a platform with no credential fields carries no credential note', () => {
  for (const p of PLATFORMS.filter((x) => x.credentialFields.length === 0)) {
    assert.equal(p.credentialNote, null, `${p.id} promises something it never collects`);
  }
});

test('findPlatform and platformSupports fail safe on unknown input', () => {
  assert.equal(findPlatform('nope'), null);
  assert.equal(findPlatform(undefined), null);
  assert.equal(platformSupports('nope', 'file'), false);
  assert.equal(platformSupports('mt5', 'teleport'), false);
  assert.equal(platformSupports('mt5', 'auto_sync'), true);
  assert.equal(platformSupports('tradelocker', 'auto_sync'), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/platforms.test.js`
Expected: FAIL — `Cannot find module '.../src/domain/sync/platforms.js'`.

- [ ] **Step 3: Write the implementation**

Create `src/domain/sync/platforms.js`:

```js
// The platform registry — the AUTHORITY on which trading platforms exist, which
// of them PropVexis can Auto Sync, and what a credential for each one looks like.
//
// TWO FIELDS THAT ARE EASY TO CONFLATE:
//   enabled    may this platform be CHOSEN in the Add Account flow at all
//   connector  non-null means Auto Sync is available for it
// 'other' is enabled with no connector, because a trader whose platform is absent
// from this list must still have a way through the flow. mt4/ctrader/tradelocker
// are the reverse of neither: listed, not yet selectable, badged "Soon" in the UI.
//
// WHY THIS FILE IS NOT THE ONE THE UI READS. The backend cannot import
// frontend/src — deploy rsyncs `src db scripts ea` plus `frontend/dist`, so such
// an import works locally and crashes on the box. The UI therefore has its own
// presentation catalog (frontend/src/features/accounts/platformCatalog.js) and
// test/platform-catalog.test.js asserts the two never drift, the same trick
// nav.test.js uses for routes versus nav.
//
// JSX-free and dependency-free so node:test can import it directly.

/** The four values the 0026 CHECK constraint admits for mt5_accounts.import_method. */
export const IMPORT_METHODS = ['auto_sync', 'ea', 'file', 'manual'];

export const PLATFORMS = [
  {
    id: 'mt5',
    label: 'MetaTrader 5',
    connector: 'mt5',
    enabled: true,
    importMethods: ['auto_sync', 'ea', 'file', 'manual'],
    assetTypes: ['forex', 'cfd', 'crypto'],
    credentialFields: [
      { name: 'server', label: 'MT5 server', type: 'text', required: true, placeholder: 'GoatFunded-Server' },
      { name: 'login', label: 'MT5 login', type: 'number', required: true, placeholder: '314943467' },
      { name: 'password', label: 'Investor password', type: 'password', required: true, secret: true },
    ],
    // Stated here rather than in a page on purpose: the worker checks
    // account_info().trade_allowed on every login and deletes a credential that
    // can trade, so this is a checked fact. TradeLocker (P2) has no equivalent,
    // and a note living on the connector cannot be inherited by accident.
    credentialNote:
      'Use your investor (read-only) password. A password that can place trades is rejected and deleted on the first login.',
  },
  {
    // Listed deliberately though we cannot sync it: a lot of prop accounts are
    // MT4 and statement import works fine. The EA is a .mq5 file and the farm's
    // MetaTrader5 Python package is MT5-only, so neither sync route exists here.
    id: 'mt4',
    label: 'MetaTrader 4',
    connector: null,
    enabled: false,
    importMethods: ['file', 'manual'],
    assetTypes: ['forex', 'cfd'],
    credentialFields: [],
    credentialNote: null,
  },
  {
    id: 'ctrader',
    label: 'cTrader',
    connector: null,        // P3 — OAuth 2.0 + Protobuf, gated on Spotware app registration
    enabled: false,
    importMethods: ['file', 'manual'],
    assetTypes: ['forex', 'cfd'],
    credentialFields: [],
    credentialNote: null,
  },
  {
    id: 'tradelocker',
    label: 'TradeLocker',
    connector: null,        // P2 — REST; see the spec's read-only caveat before shipping
    enabled: false,
    importMethods: ['file', 'manual'],
    assetTypes: ['forex', 'cfd'],
    credentialFields: [],
    credentialNote: null,
  },
  {
    // The escape hatch. Without it, a trader on a platform we have never heard of
    // cannot finish the flow at all.
    id: 'other',
    label: 'Other / not listed',
    connector: null,
    enabled: true,
    importMethods: ['file', 'manual'],
    assetTypes: [],
    credentialFields: [],
    credentialNote: null,
  },
];

export const PLATFORM_IDS = PLATFORMS.map((p) => p.id);

/** A platform by id, or null. Never throws — callers turn null into a 400. */
export const findPlatform = (id) => PLATFORMS.find((p) => p.id === id) || null;

/** Does this platform offer that import method? False for anything unknown. */
export const platformSupports = (id, importMethod) =>
  Boolean(findPlatform(id)?.importMethods.includes(importMethod));

/** Platforms we can actually Auto Sync today — exactly those with a connector. */
export const autoSyncPlatforms = () => PLATFORMS.filter((p) => p.connector);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/platforms.test.js`
Expected: PASS, 12 tests.

Then `npm test` — expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/domain/sync/platforms.js test/platforms.test.js
git commit -m "$(cat <<'MSG'
Add the platform registry, the authority on what we can sync

Which platforms exist, which can Auto Sync, and what a credential for each looks
like. Two fields that read alike and are not: `enabled` is whether a platform may
be chosen at all, `connector` is whether Auto Sync exists for it. 'other' is
enabled with no connector, because a trader on a platform we have never heard of
must still have a way through the flow; mt4/ctrader/tradelocker are listed and
not selectable, so the catalog doubles as the honest roadmap.

A test forbids offering auto_sync without a connector, which is the difference
between a badge and a dead end at the last step of a nine-step flow. MT4 is
listed and cannot sync by either route: the EA is a .mq5 file and the farm's
Python package is MT5-only.

The read-only promise lives on the mt5 entry rather than in a page, because
TradeLocker has no investor-password equivalent and P2 must not inherit it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 4: The connector registry and the MT5 connector

**Files:**
- Create: `src/domain/sync/connectors/index.js`
- Create: `src/domain/sync/connectors/mt5.js`
- Test: `test/connectors.test.js`

**Interfaces:**
- Consumes: `findPlatform` from Task 3
- Produces:
  - `getConnector(platformId) -> connector | null`
  - `mt5Connector = { id: 'mt5', validateCredential(input) -> { ok: true, value: { server, login, password } } | { ok: false, error: string } }`

  Consumed by Tasks 8 and 9.

- [ ] **Step 1: Write the failing test**

Create `test/connectors.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getConnector } from '../src/domain/sync/connectors/index.js';
import { mt5Connector } from '../src/domain/sync/connectors/mt5.js';

test('getConnector resolves mt5 and nothing else in Phase A', () => {
  assert.equal(getConnector('mt5'), mt5Connector);
  for (const id of ['mt4', 'ctrader', 'tradelocker', 'other']) {
    assert.equal(getConnector(id), null, `${id} must not resolve until its connector ships`);
  }
});

test('getConnector fails safe on unknown input', () => {
  assert.equal(getConnector('nope'), null);
  assert.equal(getConnector(undefined), null);
  assert.equal(getConnector(null), null);
});

test('mt5 credential: a complete input normalizes', () => {
  const r = mt5Connector.validateCredential({
    server: '  FundedNext-Server3  ',
    login: '34728798',
    password: 'investor-pw',
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { server: 'FundedNext-Server3', login: 34728798, password: 'investor-pw' });
});

test('mt5 credential: the server is trimmed, never reformatted', () => {
  // The terminal's own log prints "FundedNext-Server 3" with a space and that
  // string does NOT work; the real server name has none. So trim the edges and
  // change nothing else — a "helpful" normalization here costs an unattended
  // login failure that surfaces ten minutes later as an expired lease.
  const r = mt5Connector.validateCredential({ server: ' Goat Funded-Server ', login: 1, password: 'x' });
  assert.equal(r.value.server, 'Goat Funded-Server');
});

test('mt5 credential: a missing or blank server is rejected', () => {
  for (const server of [undefined, null, '', '   ']) {
    const r = mt5Connector.validateCredential({ server, login: 1, password: 'x' });
    assert.equal(r.ok, false);
    assert.match(r.error, /server/i);
  }
});

test('mt5 credential: the login must be a positive integer', () => {
  // Negative logins are the synthetic space manual accounts live in, and a
  // fractional or non-numeric login can never match a real MT5 account.
  for (const login of [undefined, '', 'abc', 0, -5, 12.5, NaN]) {
    const r = mt5Connector.validateCredential({ server: 'S', login, password: 'x' });
    assert.equal(r.ok, false, `login ${String(login)} must be rejected`);
    assert.match(r.error, /login/i);
  }
  assert.equal(mt5Connector.validateCredential({ server: 'S', login: 1, password: 'x' }).ok, true);
});

test('mt5 credential: a missing password is rejected but never echoed', () => {
  const r = mt5Connector.validateCredential({ server: 'S', login: 1, password: '' });
  assert.equal(r.ok, false);
  assert.match(r.error, /password/i);
});

test('mt5 credential: an error result carries no value, so nothing partial is stored', () => {
  const r = mt5Connector.validateCredential({});
  assert.equal(r.ok, false);
  assert.equal(r.value, undefined);
});

test('mt5 credential: validation never mutates its input', () => {
  const input = { server: ' S ', login: '7', password: 'p' };
  const copy = { ...input };
  mt5Connector.validateCredential(input);
  assert.deepEqual(input, copy);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/connectors.test.js`
Expected: FAIL — `Cannot find module '.../connectors/index.js'`.

- [ ] **Step 3: Write the implementations**

Create `src/domain/sync/connectors/mt5.js`:

```js
// The MetaTrader 5 connector: the only one in Phase A.
//
// It owns exactly one thing today — turning what the wizard collected into a
// credential we are willing to store. Logging in, reading deals and posting
// trades all live in the Python agent (agent/), which talks to the same ingest
// endpoints the EA does; nothing about that changes here.

export const mt5Connector = {
  id: 'mt5',

  /**
   * Validate and normalize a credential input. Pure — no DB, no crypto, no IO.
   *
   * The login must be a positive integer for two reasons: negative logins are the
   * synthetic space manual accounts occupy (mt5_login = -id, migration 0015), and
   * a fractional or non-numeric login can never match a real MT5 account, so
   * accepting one buys an unattended login failure that surfaces ten minutes
   * later as an expired lease rather than as a form error.
   *
   * The server is trimmed and otherwise left ALONE. The terminal's own log prints
   * "FundedNext-Server 3" with a space and that string does not work — the real
   * name has none. Any cleverer normalization here would be a guess at a value we
   * cannot verify until an unattended login is already failing.
   */
  validateCredential(input = {}) {
    const server = String(input.server ?? '').trim();
    if (!server) return { ok: false, error: 'MT5 server is required' };

    const login = Number(input.login);
    if (!Number.isInteger(login) || login <= 0) {
      return { ok: false, error: 'MT5 login must be a positive account number' };
    }

    const password = String(input.password ?? '');
    if (!password) return { ok: false, error: 'Investor password is required' };

    return { ok: true, value: { server, login, password } };
  },
};
```

Create `src/domain/sync/connectors/index.js`:

```js
// Connector resolution. THIS registry is what makes "extensible" a fact rather
// than an intention: adding TradeLocker (P2) or cTrader (P3) is a module here
// plus a catalog entry in platforms.js, and nothing else in the account or
// provisioning path moves.
//
// It is deliberately NOT paired with a generalized credential table. Designing one
// before knowing what a cTrader token pair and a TradeLocker JWT actually need in
// practice is how you get a JSONB column that fits neither — and every one of the
// MT5 farm's four landmines was found against a live account, not in a document.
// Credentials are sealed under an account-bound AAD, so they can move tables later
// with no re-encryption.
import { findPlatform } from '../platforms.js';
import { mt5Connector } from './mt5.js';

const REGISTRY = {
  mt5: mt5Connector,
};

/**
 * The connector for a platform id, or null when that platform cannot Auto Sync.
 *
 * Resolution goes THROUGH the platform registry rather than straight to REGISTRY,
 * so `connector: null` in platforms.js is the single switch that turns Auto Sync
 * off for a platform. A direct key lookup would let the two disagree.
 */
export function getConnector(platformId) {
  const platform = findPlatform(platformId);
  if (!platform?.connector) return null;
  return REGISTRY[platform.connector] ?? null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/connectors.test.js`
Expected: PASS, 9 tests.

Then `npm test` — expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/domain/sync/connectors test/connectors.test.js
git commit -m "$(cat <<'MSG'
Add the connector registry with MT5 as its one implementation

This registry is what makes "extensible" a fact rather than an intention: adding
TradeLocker or cTrader later is a module here plus a platforms.js entry, and
nothing in the account or provisioning path moves. Resolution goes through the
platform registry rather than straight to the lookup table, so `connector: null`
is the single switch that turns Auto Sync off for a platform.

Deliberately NOT paired with a generalized credential table -- designing one
before knowing what a cTrader token pair and a TradeLocker JWT actually need is
how you get a JSONB column that fits neither. Credentials are sealed under an
account-bound AAD and can move tables later with no re-encryption.

MT5 credential validation keeps the login a positive integer, because negative
logins are the synthetic space manual accounts occupy, and trims the server
without reformatting it -- the terminal's own log prints a server name with a
space that does not work, so a cleverer normalization buys an unattended login
failure that surfaces later as an expired lease.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 5: The presentation catalog and the drift test

**Files:**
- Create: `frontend/src/features/accounts/platformCatalog.js`
- Test: `test/platform-catalog.test.js`

**Interfaces:**
- Consumes: `PLATFORMS`, `PLATFORM_IDS`, `findPlatform`, `IMPORT_METHODS` from Task 3
- Produces:
  - `PLATFORM_CARDS: Array<{ id, name, status: 'live'|'soon', blurb, importMethods }>`
  - `findPlatformCard(id) -> card | null`
  - `searchPlatforms(query) -> card[]`

  Consumed by Phase B's platform step.

- [ ] **Step 1: Write the failing test**

Create `test/platform-catalog.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLATFORM_CARDS, findPlatformCard, searchPlatforms,
} from '../frontend/src/features/accounts/platformCatalog.js';
import {
  PLATFORM_IDS, IMPORT_METHODS, findPlatform,
} from '../src/domain/sync/platforms.js';

// THE DRIFT TEST. There are two platform catalogs because the backend cannot
// import frontend/src (deploy rsyncs `src db scripts ea` plus `frontend/dist`, so
// such an import works locally and crashes on the box). This file is what stops
// them disagreeing — the same trick nav.test.js uses for routes versus nav.
//
// A backend test may import a frontend module only while that module is pure
// data: CI installs backend dependencies only, so importing anything that pulls
// React would fail here and nowhere else.

test('both catalogs name exactly the same platforms', () => {
  assert.deepEqual(PLATFORM_CARDS.map((c) => c.id).sort(), [...PLATFORM_IDS].sort());
});

test('a platform the UI calls live is one the backend will accept', () => {
  for (const c of PLATFORM_CARDS.filter((x) => x.status === 'live')) {
    assert.equal(findPlatform(c.id).enabled, true,
      `the UI offers ${c.id} but provision would 400 on it`);
  }
});

test('a platform the UI badges soon is one the backend refuses', () => {
  for (const c of PLATFORM_CARDS.filter((x) => x.status === 'soon')) {
    assert.equal(findPlatform(c.id).enabled, false,
      `${c.id} is badged Soon but the backend would accept it`);
  }
});

test('a Soon platform never offers Auto Sync on either side', () => {
  for (const c of PLATFORM_CARDS.filter((x) => x.status === 'soon')) {
    assert.equal(c.importMethods.includes('auto_sync'), false, `${c.id} card offers auto_sync`);
    assert.equal(findPlatform(c.id).connector, null, `${c.id} has a connector but is badged Soon`);
  }
});

test('both catalogs agree, per platform, on which import methods are offered', () => {
  // The likeliest drift: shipping a connector and updating only one file, so the
  // UI hides a route that works or offers one that does not exist.
  for (const c of PLATFORM_CARDS) {
    assert.deepEqual([...c.importMethods].sort(), [...findPlatform(c.id).importMethods].sort(),
      `${c.id}: the two catalogs disagree about import methods`);
  }
});

test('every card is fully described and uses only the four known methods', () => {
  for (const c of PLATFORM_CARDS) {
    assert.ok(c.name, `${c.id} needs a name`);
    assert.ok(c.blurb, `${c.id} needs a blurb — a bare name does not say why it is greyed out`);
    assert.ok(['live', 'soon'].includes(c.status), `${c.id} status`);
    for (const m of c.importMethods) assert.ok(IMPORT_METHODS.includes(m), `${c.id}: ${m}`);
  }
});

test('every card offers at least one route in, so no card is a dead end', () => {
  for (const c of PLATFORM_CARDS) {
    assert.ok(c.importMethods.length > 0, `${c.id} offers no way to get trades in`);
  }
});

test('findPlatformCard fails safe', () => {
  assert.equal(findPlatformCard('mt5').name, 'MetaTrader 5');
  assert.equal(findPlatformCard('nope'), null);
  assert.equal(findPlatformCard(undefined), null);
});

test('search is case-insensitive, matches substrings, and returns all on empty', () => {
  assert.deepEqual(searchPlatforms('meta').map((c) => c.id), ['mt5', 'mt4']);
  assert.deepEqual(searchPlatforms('LOCKER').map((c) => c.id), ['tradelocker']);
  assert.deepEqual(searchPlatforms('').length, PLATFORM_CARDS.length);
  assert.deepEqual(searchPlatforms('   ').length, PLATFORM_CARDS.length);
  assert.deepEqual(searchPlatforms(undefined).length, PLATFORM_CARDS.length);
  assert.deepEqual(searchPlatforms('zzz'), []);
});

test('search also matches the platform id, so typing "mt5" works', () => {
  assert.deepEqual(searchPlatforms('mt5').map((c) => c.id), ['mt5']);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/platform-catalog.test.js`
Expected: FAIL — `Cannot find module '.../frontend/src/features/accounts/platformCatalog.js'`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/features/accounts/platformCatalog.js`:

```js
// The PRESENTATION half of the platform catalog: what the Add Account flow calls
// each platform, how it is badged, and what it says about itself.
//
// The AUTHORITY is src/domain/sync/platforms.js. This file exists separately
// because the backend cannot import frontend/src — deploy rsyncs `src db scripts
// ea` plus `frontend/dist`, so such an import works locally and crashes on the
// box. test/platform-catalog.test.js asserts the two never drift, which is the
// same arrangement nav.test.js enforces between the route table and the nav.
//
// `status` is the badge, and it mirrors the authority's `enabled`:
//   live  selectable now
//   soon  listed so the catalog reads as the real roadmap, not selectable yet
//
// A blurb is mandatory on every card. A greyed-out name with no sentence beside
// it reads as a bug in our app rather than as a platform we have not finished.
//
// JSX-free (no React import, no logo components) so the backend's node:test can
// import it — CI installs backend dependencies only.

export const PLATFORM_CARDS = [
  {
    id: 'mt5',
    name: 'MetaTrader 5',
    status: 'live',
    blurb: 'We run the terminal for you, or attach the EA to your own MT5.',
    importMethods: ['auto_sync', 'ea', 'file', 'manual'],
  },
  {
    id: 'mt4',
    name: 'MetaTrader 4',
    status: 'soon',
    blurb: 'Import a statement today — Auto Sync is not available for MT4.',
    importMethods: ['file', 'manual'],
  },
  {
    id: 'ctrader',
    name: 'cTrader',
    status: 'soon',
    blurb: 'Auto Sync is in progress. Import a statement in the meantime.',
    importMethods: ['file', 'manual'],
  },
  {
    id: 'tradelocker',
    name: 'TradeLocker',
    status: 'soon',
    blurb: 'Auto Sync is in progress. Import a statement in the meantime.',
    importMethods: ['file', 'manual'],
  },
  {
    id: 'other',
    name: 'Other / not listed',
    status: 'live',
    blurb: 'Journal by hand or import a CSV from any platform.',
    importMethods: ['file', 'manual'],
  },
];

export const findPlatformCard = (id) => PLATFORM_CARDS.find((c) => c.id === id) || null;

/**
 * Filter the catalog by a typed query. Matches the id as well as the name, so
 * "mt5" finds MetaTrader 5 — that is what a trader types, and matching only the
 * display name would return nothing for the platform we actually support.
 * Empty/blank/absent query returns everything.
 */
export function searchPlatforms(query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return PLATFORM_CARDS;
  return PLATFORM_CARDS.filter(
    (c) => c.name.toLowerCase().includes(q) || c.id.includes(q),
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/platform-catalog.test.js`
Expected: PASS, 10 tests.

Then `npm test` — expected: all green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/accounts/platformCatalog.js test/platform-catalog.test.js
git commit -m "$(cat <<'MSG'
Add the platform presentation catalog, pinned to the backend by a drift test

There are two platform catalogs because the backend cannot import frontend/src:
deploy rsyncs src db scripts ea plus frontend/dist, so such an import works
locally and crashes on the box. The test is what stops them disagreeing -- same
arrangement nav.test.js already enforces between the route table and the nav.

It asserts more than matching ids: that anything the UI calls live is something
provision accepts, that a Soon badge and a null connector always travel together,
and that both files agree per platform on which import methods exist. That last
one is the likeliest drift -- shipping a connector and updating one file, so the
UI either hides a route that works or offers one that does not.

Every card must carry a blurb. A greyed-out name with no sentence beside it reads
as a bug in our app rather than a platform we have not finished.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 6: The firm catalog gains a products layer

`propFirms.js` models `firm → sizes → phases`, with GFT and FTMO both hardcoded as 2-step. The wizard's "Select account type" step is **product × size**, so the catalog needs a `products` layer between firm and phases. This is a breaking change to `templateToFields()`, so its one caller (`TemplatePicker` in `AccountForms.jsx`) is updated in the same task — an edit form that silently stops pre-filling is worse than one that fails to compile.

> **Honesty requirement.** The existing 2-step rule percentages are the ones already in the file and are carried over **unchanged**; a test pins them so this restructure cannot quietly alter a live challenge's rules. The 1-step and Instant Funding percentages are **not verified** — they are marked as such in the code and Step 6 is an explicit instruction to confirm them against each firm's site before this reaches production.

**Files:**
- Modify: `frontend/src/features/prop/propFirms.js` (rewrite the catalog and resolver)
- Modify: `frontend/src/features/accounts/AccountForms.jsx:38-72` (`TemplatePicker`)
- Test: `test/propFirms.test.js` (rewrite)

**Interfaces:**
- Produces:
  - `PROP_FIRMS: Array<{ id, name, platforms: string[], ddType, defaultSplitPct, products: Array<{ id, label, verified: boolean, sizes: number[], phases: Array<{ id, label, accountType, dailyDdPct, maxDdPct, profitTargetPct, minTradingDays }> }> }>`
  - `findFirm(firmId)`, `findProduct(firmId, productId)`
  - `templateToFields(firmId, productId, size, phaseId) -> fields | null` — **note the new second argument**
  - `PRODUCT_IDS = ['1step', '2step', 'instant']`

  `templateToFields` output shape is unchanged and still feeds `toPayload`. Consumed by Phase B's product and phase steps.

- [ ] **Step 1: Write the failing test**

Replace the whole of `test/propFirms.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROP_FIRMS, PRODUCT_IDS, findFirm, findProduct, templateToFields,
} from '../frontend/src/features/prop/propFirms.js';

// The catalog is JSX-free so its shape and resolver can be guarded here.
// templateToFields output must keep matching the account form-field shape
// AccountForms.toPayload consumes.

test('catalog: every firm, product and phase is well-formed', () => {
  for (const f of PROP_FIRMS) {
    assert.ok(f.id && f.name, 'firm needs id + name');
    assert.ok(['static', 'trailing'].includes(f.ddType), `${f.id} ddType`);
    assert.ok(Array.isArray(f.platforms) && f.platforms.length, `${f.id} needs platforms`);
    assert.ok(Array.isArray(f.products) && f.products.length, `${f.id} needs products`);
    for (const p of f.products) {
      assert.ok(PRODUCT_IDS.includes(p.id), `${f.id}/${p.id} is not a known product id`);
      assert.ok(p.label, `${f.id}/${p.id} needs a label`);
      assert.equal(typeof p.verified, 'boolean', `${f.id}/${p.id} must declare whether its rules are verified`);
      assert.ok(p.sizes.length, `${f.id}/${p.id} needs sizes`);
      assert.ok(p.phases.length, `${f.id}/${p.id} needs phases`);
      for (const ph of p.phases) {
        assert.ok(['eval', 'funded'].includes(ph.accountType), `${f.id}/${p.id}/${ph.id} accountType`);
        assert.equal(typeof ph.dailyDdPct, 'number');
        assert.equal(typeof ph.maxDdPct, 'number');
        assert.equal(typeof ph.minTradingDays, 'number');
      }
    }
  }
});

test('ids are unique — firms globally, products within a firm', () => {
  const firmIds = PROP_FIRMS.map((f) => f.id);
  assert.equal(new Set(firmIds).size, firmIds.length);
  for (const f of PROP_FIRMS) {
    const ids = f.products.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length, `${f.id} has duplicate products`);
    for (const p of f.products) {
      const phases = p.phases.map((x) => x.id);
      assert.equal(new Set(phases).size, phases.length, `${f.id}/${p.id} has duplicate phases`);
    }
  }
});

test('every phase id is one the challenges table accepts', () => {
  // challenges.phase is 'p1' | 'p2' | 'funded' (migration 0016). A fourth value
  // here would be stored and then never matched by the prop engine.
  for (const f of PROP_FIRMS) {
    for (const p of f.products) {
      for (const ph of p.phases) {
        assert.ok(['p1', 'p2', 'funded'].includes(ph.id), `${f.id}/${p.id}/${ph.id}`);
      }
    }
  }
});

test('every product ends in a funded phase — an evaluation you cannot pass is not a product', () => {
  for (const f of PROP_FIRMS) {
    for (const p of f.products) {
      assert.equal(p.phases[p.phases.length - 1].id, 'funded', `${f.id}/${p.id} never reaches funded`);
    }
  }
});

test('the shape of each product matches its name', () => {
  for (const f of PROP_FIRMS) {
    for (const p of f.products) {
      const evals = p.phases.filter((x) => x.accountType === 'eval').length;
      if (p.id === 'instant') assert.equal(evals, 0, `${f.id}/instant must have no evaluation phase`);
      if (p.id === '1step') assert.equal(evals, 1, `${f.id}/1step must have exactly one evaluation phase`);
      if (p.id === '2step') assert.equal(evals, 2, `${f.id}/2step must have exactly two evaluation phases`);
    }
  }
});

test('only a funded phase carries no profit target', () => {
  for (const f of PROP_FIRMS) {
    for (const p of f.products) {
      for (const ph of p.phases) {
        if (ph.accountType === 'funded') {
          assert.equal(ph.profitTargetPct, null, `${f.id}/${p.id}/${ph.id} funded phases carry no target`);
        } else {
          assert.equal(typeof ph.profitTargetPct, 'number', `${f.id}/${p.id}/${ph.id} eval needs a target`);
        }
      }
    }
  }
});

test('REGRESSION: the 2-step rules carried over from the pre-products catalog are unchanged', () => {
  // These are the values the file shipped with. This restructure must not alter
  // the rules a live challenge is being judged against — that is a silent
  // mis-scoring, not a visible bug.
  const gft = findProduct('gft', '2step');
  assert.deepEqual(gft.sizes, [25000, 50000, 100000]);
  assert.deepEqual(
    gft.phases.map((p) => [p.id, p.accountType, p.dailyDdPct, p.maxDdPct, p.profitTargetPct, p.minTradingDays]),
    [
      ['p1', 'eval', 5, 10, 8, 3],
      ['p2', 'eval', 5, 10, 5, 3],
      ['funded', 'funded', 5, 10, null, 0],
    ],
  );
  const ftmo = findProduct('ftmo', '2step');
  assert.deepEqual(ftmo.sizes, [10000, 25000, 50000, 100000, 200000]);
  assert.deepEqual(
    ftmo.phases.map((p) => [p.id, p.accountType, p.dailyDdPct, p.maxDdPct, p.profitTargetPct, p.minTradingDays]),
    [
      ['p1', 'eval', 5, 10, 10, 4],
      ['p2', 'eval', 5, 10, 5, 4],
      ['funded', 'funded', 5, 10, null, 0],
    ],
  );
  assert.equal(gft.verified, true);
  assert.equal(ftmo.verified, true);
});

test('templateToFields: eval phase → target set, no split', () => {
  const f = templateToFields('ftmo', '2step', 100000, 'p1');
  assert.equal(f.firm_id, 'ftmo');
  assert.equal(f.firm_name, 'FTMO');
  assert.equal(f.product_id, '2step');
  assert.equal(f.account_type, 'eval');
  assert.equal(f.start_balance, 100000);
  assert.equal(f.daily_dd_pct, 5);
  assert.equal(f.max_dd_pct, 10);
  assert.equal(f.profit_target_pct, 10);
  assert.equal(f.payout_split_pct, null);
  assert.equal(f.dd_type, 'static');
  assert.equal(f.min_trading_days, 4);
});

test('templateToFields: funded phase → split set, no target', () => {
  const f = templateToFields('gft', '2step', 50000, 'funded');
  assert.equal(f.account_type, 'funded');
  assert.equal(f.profit_target_pct, null);
  assert.equal(f.payout_split_pct, 80);
  assert.equal(f.min_trading_days, 0);
});

test('templateToFields: GFT phase 2 lowers the target', () => {
  assert.equal(templateToFields('gft', '2step', 25000, 'p1').profit_target_pct, 8);
  assert.equal(templateToFields('gft', '2step', 25000, 'p2').profit_target_pct, 5);
});

test('templateToFields: instant funding resolves straight to a funded account', () => {
  const f = templateToFields('gft', 'instant', 25000, 'funded');
  assert.equal(f.account_type, 'funded');
  assert.equal(f.profit_target_pct, null);
  assert.ok(f.payout_split_pct > 0);
});

test('templateToFields: carries product_id so 1-step and 2-step stay distinguishable', () => {
  // firm_id + size + account_type cannot tell them apart, which is the whole
  // reason mt5_accounts.product_id exists.
  assert.equal(templateToFields('gft', '1step', 50000, 'p1').product_id, '1step');
  assert.equal(templateToFields('gft', '2step', 50000, 'p1').product_id, '2step');
});

test('templateToFields: unknown firm, product or phase → null (fail safe)', () => {
  assert.equal(templateToFields('nope', '2step', 50000, 'p1'), null);
  assert.equal(templateToFields('ftmo', 'nope', 50000, 'p1'), null);
  assert.equal(templateToFields('ftmo', '2step', 50000, 'nope'), null);
  assert.equal(templateToFields('gft', 'instant', 25000, 'p1'), null, 'instant has no p1');
  assert.equal(findFirm('nope'), null);
  assert.equal(findProduct('gft', 'nope'), null);
  assert.equal(findProduct('nope', '2step'), null);
});

test('every firm names at least one platform that the platform catalog knows', async () => {
  const { PLATFORM_IDS } = await import('../src/domain/sync/platforms.js');
  for (const f of PROP_FIRMS) {
    for (const p of f.platforms) {
      assert.ok(PLATFORM_IDS.includes(p), `${f.id} names unknown platform ${p}`);
    }
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/propFirms.test.js`
Expected: FAIL — `PRODUCT_IDS` and `findProduct` are not exported, and `templateToFields` still takes the old 3-argument form.

- [ ] **Step 3: Rewrite the catalog**

Replace `frontend/src/features/prop/propFirms.js` entirely:

```js
// Prop-firm rule-template catalog. A static catalog of firms -> products -> sizes
// -> phase rule sets that PRE-FILLS the account rule fields, instead of manual
// entry. Applied values stay fully editable: these are published defaults, not
// enforced values, so a firm changing its rules is always one manual tweak away.
//
// WHY A `products` LAYER. A firm does not sell "an account", it sells a 1-Step, a
// 2-Step or an Instant Funding account, and the rules differ per product, not just
// per phase. The pre-products catalog hardcoded every firm as 2-step, so a trader
// on a 1-step account was pre-filled with 2-step rules and had to correct them by
// hand — and nothing recorded which product it was, because firm_id + size +
// account_type cannot tell 1-step from 2-step. mt5_accounts.product_id (migration
// 0026) is where that now lands.
//
// `verified` IS PART OF THE DATA. The 2-step rules below are the ones this file
// shipped with and are pinned by test/propFirms.test.js so a restructure cannot
// silently change what a live challenge is judged against. The 1-step and instant
// rule sets are NOT confirmed against the firms — they are marked verified: false
// and MUST be checked before public launch. A wrong drawdown percentage here
// mis-scores a real account.
//
// JSX-free so test/propFirms.test.js (node:test) can validate the resolver.

export const PRODUCT_IDS = ['1step', '2step', 'instant'];

export const PROP_FIRMS = [
  {
    id: 'gft',
    name: 'GoatFundedTrader',
    platforms: ['mt5'],
    ddType: 'static',          // max DD is a balance/equity floor (90% of start)
    defaultSplitPct: 80,
    products: [
      {
        id: '2step',
        label: '2-Step Evaluation',
        verified: true,        // carried over unchanged from the pre-products catalog
        sizes: [25000, 50000, 100000],
        phases: [
          { id: 'p1',     label: 'Phase 1 (Evaluation)', accountType: 'eval',   dailyDdPct: 5, maxDdPct: 10, profitTargetPct: 8,    minTradingDays: 3 },
          { id: 'p2',     label: 'Phase 2 (Evaluation)', accountType: 'eval',   dailyDdPct: 5, maxDdPct: 10, profitTargetPct: 5,    minTradingDays: 3 },
          { id: 'funded', label: 'Funded',               accountType: 'funded', dailyDdPct: 5, maxDdPct: 10, profitTargetPct: null, minTradingDays: 0 },
        ],
      },
      {
        id: '1step',
        label: '1-Step Evaluation',
        verified: false,       // UNVERIFIED — confirm against goatfundedtrader.com before launch
        sizes: [25000, 50000, 100000],
        phases: [
          { id: 'p1',     label: 'Evaluation', accountType: 'eval',   dailyDdPct: 4, maxDdPct: 6, profitTargetPct: 10,   minTradingDays: 3 },
          { id: 'funded', label: 'Funded',     accountType: 'funded', dailyDdPct: 4, maxDdPct: 6, profitTargetPct: null, minTradingDays: 0 },
        ],
      },
      {
        id: 'instant',
        label: 'Instant Funding',
        verified: false,       // UNVERIFIED — confirm against goatfundedtrader.com before launch
        sizes: [25000, 50000],
        phases: [
          { id: 'funded', label: 'Funded', accountType: 'funded', dailyDdPct: 4, maxDdPct: 6, profitTargetPct: null, minTradingDays: 0 },
        ],
      },
    ],
  },
  {
    id: 'ftmo',
    name: 'FTMO',
    platforms: ['mt5', 'mt4', 'ctrader'],
    ddType: 'static',          // FTMO Max Loss is a static equity floor; daily resets 00:00 CET
    defaultSplitPct: 80,
    products: [
      {
        id: '2step',
        label: 'Challenge + Verification',
        verified: true,        // carried over unchanged from the pre-products catalog
        sizes: [10000, 25000, 50000, 100000, 200000],
        phases: [
          { id: 'p1',     label: 'Challenge (Phase 1)',    accountType: 'eval',   dailyDdPct: 5, maxDdPct: 10, profitTargetPct: 10,   minTradingDays: 4 },
          { id: 'p2',     label: 'Verification (Phase 2)', accountType: 'eval',   dailyDdPct: 5, maxDdPct: 10, profitTargetPct: 5,    minTradingDays: 4 },
          { id: 'funded', label: 'Funded',                 accountType: 'funded', dailyDdPct: 5, maxDdPct: 10, profitTargetPct: null, minTradingDays: 0 },
        ],
      },
    ],
  },
];

export const findFirm = (firmId) => PROP_FIRMS.find((f) => f.id === firmId) || null;

/** A firm's product, or null for an unknown firm OR an unknown product. */
export const findProduct = (firmId, productId) =>
  findFirm(firmId)?.products.find((p) => p.id === productId) || null;

/**
 * Resolve a (firm, product, size, phase) selection into the account form-field
 * shape PropFields/toPayload already consume. Returns null for anything unknown —
 * including a phase that exists in another product of the same firm, since an
 * Instant Funding account has no Phase 1.
 *
 * Eval phases carry a profit target and no split; funded carries a split and no
 * target, which is what the challenge engine expects.
 */
export function templateToFields(firmId, productId, size, phaseId) {
  const firm = findFirm(firmId);
  const product = findProduct(firmId, productId);
  if (!firm || !product) return null;
  const phase = product.phases.find((p) => p.id === phaseId);
  if (!phase) return null;
  const funded = phase.accountType === 'funded';
  return {
    firm_id: firm.id,
    firm_name: firm.name,
    product_id: product.id,
    account_type: phase.accountType,
    start_balance: Number(size) || null,
    daily_dd_pct: phase.dailyDdPct,
    max_dd_pct: phase.maxDdPct,
    profit_target_pct: funded ? null : phase.profitTargetPct,
    payout_split_pct: funded ? firm.defaultSplitPct : null,
    dd_type: firm.ddType,
    min_trading_days: phase.minTradingDays,
  };
}
```

- [ ] **Step 4: Update `TemplatePicker`, the one caller**

In `frontend/src/features/accounts/AccountForms.jsx`, replace the `TemplatePicker` component (currently lines 38-72) with:

```jsx
export function TemplatePicker({ onApply }) {
  const [firmId, setFirmId] = useState('');
  const [productId, setProductId] = useState('');
  const [size, setSize] = useState('');
  const [phaseId, setPhaseId] = useState('');
  const firm = findFirm(firmId);
  const product = findProduct(firmId, productId);

  // Each selection invalidates the ones that depend on it: products are per firm,
  // and sizes and phases are per PRODUCT. Without this, picking 2-Step, then
  // switching to Instant Funding, leaves "Phase 1" selected — a phase Instant
  // Funding does not have — and templateToFields returns null on Apply.
  const pickFirm = (id) => { setFirmId(id); setProductId(''); setSize(''); setPhaseId(''); };
  const pickProduct = (id) => { setProductId(id); setSize(''); setPhaseId(''); };

  const ready = Boolean(product) && size !== '' && phaseId !== '';
  const apply = () => {
    const fields = templateToFields(firmId, productId, Number(size), phaseId);
    if (fields) onApply(fields, `${firm.name} ${sizeLabel(size)}`);
  };

  return (
    <div className="acct-template">
      <div className="acct-template-head">Prefill from a prop firm <span className="acct-template-opt">(optional)</span></div>
      <div className="acct-template-row">
        <select value={firmId} onChange={(e) => pickFirm(e.target.value)} aria-label="Prop firm">
          <option value="">Firm…</option>
          {PROP_FIRMS.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <select value={productId} onChange={(e) => pickProduct(e.target.value)} disabled={!firm} aria-label="Account type">
          <option value="">Account type…</option>
          {firm?.products.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <select value={size} onChange={(e) => setSize(e.target.value)} disabled={!product} aria-label="Account size">
          <option value="">Size…</option>
          {product?.sizes.map((s) => <option key={s} value={s}>{sizeLabel(s)}</option>)}
        </select>
        <select value={phaseId} onChange={(e) => setPhaseId(e.target.value)} disabled={!product} aria-label="Phase">
          <option value="">Phase…</option>
          {product?.phases.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <button type="button" className="acct-template-apply" onClick={apply} disabled={!ready}>Apply</button>
      </div>
    </div>
  );
}
```

Then update the import at the top of `AccountForms.jsx` (currently line 6):

```jsx
import { PROP_FIRMS, findFirm, findProduct, templateToFields } from '../prop/propFirms.js';
```

And carry `product_id` through the form payload so the edit form does not wipe it. In `toPayload`, add one line after `firm_name`:

```js
  product_id: v.product_id || null,
```

In `formFrom`, add:

```js
  product_id: a?.product_id ?? null,
```

In `applyTemplateToForm`, add:

```js
  product_id: fields.product_id ?? null,
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test test/propFirms.test.js`
Expected: PASS, 14 tests.

Run: `npm test`
Expected: all green. If `test/settings-module.test.js` or another suite asserts on `TemplatePicker`'s markup, update that assertion to match the four selects.

Build the frontend, because a stale import name is a build error and CI does **not** build the frontend on PRs (see the `ci-gap-frontend-and-dependabot` note):

Run: `cd frontend && npm run build && cd ..`
Expected: build succeeds.

- [ ] **Step 6: Verify the unverified rule sets before this ships**

The `verified: false` products carry rule percentages that have **not** been confirmed. Open each firm's pricing page, compare Daily DD / Max DD / Profit target / Min trading days per product and size, correct any mismatch, and flip `verified` to `true` only for a product you have actually checked:

- GoatFundedTrader 1-Step and Instant Funding: https://goatfundedtrader.com

Leave `verified: false` where you could not confirm a value, and say so in the PR description. A wrong drawdown percentage here mis-scores a real trader's account, and the flag is what makes that visible rather than assumed.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/prop/propFirms.js frontend/src/features/accounts/AccountForms.jsx test/propFirms.test.js
git commit -m "$(cat <<'MSG'
Model prop firms as products, not just sizes and phases

A firm does not sell "an account", it sells a 1-Step, a 2-Step or an Instant
Funding account, and the rules differ per product rather than only per phase. The
old catalog hardcoded every firm as 2-step, so a trader on a 1-step account was
pre-filled with 2-step rules and had to correct them by hand -- and nothing
recorded which product it was, because firm_id + size + account_type cannot tell
them apart. mt5_accounts.product_id is where that now lands.

The 2-step percentages are carried over untouched and pinned by a regression
test: this restructure must not change what a live challenge is judged against,
which would be a silent mis-scoring rather than a visible bug. The 1-step and
instant rule sets are marked verified: false because they are NOT confirmed
against the firms, and a wrong drawdown percentage here mis-scores a real
account.

TemplatePicker gains a product select and now invalidates downstream selections:
sizes and phases are per product, so picking 2-Step then switching to Instant
Funding used to leave "Phase 1" selected -- a phase Instant Funding does not have
-- and Apply silently did nothing.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 7: Provision validation and the plan gate (pure)

Everything about a provision request that can be decided without touching the database. Extracted as pure functions because there is no test database and no HTTP test harness in this repo — this is where the endpoint's behaviour actually gets pinned.

**Files:**
- Create: `src/domain/accounts/provision.js`
- Test: `test/provision.test.js`

**Interfaces:**
- Consumes: `findPlatform`, `platformSupports`, `IMPORT_METHODS` (Task 3)
- Produces:
  - `PHASES = ['p1', 'p2', 'funded']`
  - `kindForImportMethod(m) -> 'synced' | 'manual' | null`
  - `validateProvision(body) -> { ok: true, value } | { ok: false, error }`
  - `provisionGate({ plan, kind, syncedCount, manualCount }) -> { ok: true } | { ok: false, code, error }`

  `value` fields consumed by Task 8: `capital_kind, label, currency, platform, broker, import_method, kind, firm_id, firm_name, product_id, phase, start_balance, account_type, daily_dd_pct, max_dd_pct, profit_target_pct, payout_split_pct, dd_type, min_trading_days, provision_key`.

- [ ] **Step 1: Write the failing test**

Create `test/provision.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PHASES, kindForImportMethod, validateProvision, provisionGate,
} from '../src/domain/accounts/provision.js';

// A valid prop + Auto Sync body, spread and overridden per case.
const propBody = () => ({
  capital_kind: 'prop',
  label: 'GFT 50K',
  platform: 'mt5',
  import_method: 'auto_sync',
  firm_id: 'gft',
  firm_name: 'GoatFundedTrader',
  product_id: '2step',
  phase: 'p1',
  start_balance: 50000,
  account_type: 'eval',
  daily_dd_pct: 5,
  max_dd_pct: 10,
  profit_target_pct: 8,
  dd_type: 'static',
  min_trading_days: 3,
});

test('kindForImportMethod encodes the CHECK constraint from migration 0026', () => {
  assert.equal(kindForImportMethod('auto_sync'), 'synced');
  assert.equal(kindForImportMethod('ea'), 'synced');
  assert.equal(kindForImportMethod('file'), 'manual');
  assert.equal(kindForImportMethod('manual'), 'manual');
  assert.equal(kindForImportMethod('nope'), null);
  assert.equal(kindForImportMethod(undefined), null);
});

test('a complete prop body validates and derives kind', () => {
  const r = validateProvision(propBody());
  assert.equal(r.ok, true);
  assert.equal(r.value.kind, 'synced');
  assert.equal(r.value.capital_kind, 'prop');
  assert.equal(r.value.phase, 'p1');
  assert.equal(r.value.currency, 'USD', 'currency defaults rather than being required');
});

test('a complete live body validates and carries no prop fields', () => {
  const r = validateProvision({
    capital_kind: 'live',
    label: 'My IC Markets account',
    platform: 'mt5',
    import_method: 'manual',
    broker: 'IC Markets',
    start_balance: 5000,
    currency: 'EUR',
  });
  assert.equal(r.ok, true);
  assert.equal(r.value.kind, 'manual');
  assert.equal(r.value.firm_id, null);
  assert.equal(r.value.product_id, null);
  assert.equal(r.value.phase, null, 'a live account has no challenge, so no phase');
  assert.equal(r.value.currency, 'EUR');
  assert.equal(r.value.broker, 'IC Markets');
});

test('capital_kind must be one of the two the CHECK allows', () => {
  for (const capital_kind of [undefined, '', 'both', 'PROP', 'demo']) {
    const r = validateProvision({ ...propBody(), capital_kind });
    assert.equal(r.ok, false, `${String(capital_kind)} must be rejected`);
    assert.match(r.error, /capital/i);
  }
});

test('the label is required and trimmed', () => {
  assert.equal(validateProvision({ ...propBody(), label: '   ' }).ok, false);
  assert.equal(validateProvision({ ...propBody(), label: undefined }).ok, false);
  assert.equal(validateProvision({ ...propBody(), label: '  GFT 50K  ' }).value.label, 'GFT 50K');
});

test('the label is capped, because it is rendered in a table cell and a switcher', () => {
  const r = validateProvision({ ...propBody(), label: 'x'.repeat(500) });
  assert.equal(r.ok, false);
  assert.match(r.error, /label/i);
});

test('an unknown or not-yet-selectable platform is refused', () => {
  assert.equal(validateProvision({ ...propBody(), platform: 'nope' }).ok, false);
  assert.equal(validateProvision({ ...propBody(), platform: undefined }).ok, false);
  const soon = validateProvision({ ...propBody(), platform: 'tradelocker', import_method: 'file' });
  assert.equal(soon.ok, false, 'a Soon platform must not be accepted even with a valid method');
  assert.match(soon.error, /platform/i);
});

test('an import method the platform does not offer is refused', () => {
  // 'other' can only take file/manual — offering it auto_sync would create a
  // synced account no worker could ever service.
  const r = validateProvision({
    capital_kind: 'live', label: 'X', platform: 'other', import_method: 'auto_sync',
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /Other|import method/i);
});

test('a prop account needs a firm, a product and a phase', () => {
  for (const missing of ['firm_id', 'product_id', 'phase']) {
    const body = propBody();
    delete body[missing];
    const r = validateProvision(body);
    assert.equal(r.ok, false, `${missing} must be required for a prop account`);
  }
});

test('phase is validated because its three values are a schema fact', () => {
  assert.deepEqual(PHASES, ['p1', 'p2', 'funded']);
  assert.equal(validateProvision({ ...propBody(), phase: 'p3' }).ok, false);
  assert.equal(validateProvision({ ...propBody(), phase: 'funded' }).ok, true);
});

test('firm and product are NOT checked against the catalog, only for shape', () => {
  // The firm catalog lives in frontend/src, which the backend cannot import. So
  // membership is unverifiable here by design; the client sends the rule numbers
  // exactly as toPayload already does today.
  const r = validateProvision({ ...propBody(), firm_id: 'some-new-firm', product_id: '2step' });
  assert.equal(r.ok, true);
  assert.equal(r.value.firm_id, 'some-new-firm');
});

test('a live account may not smuggle in prop fields', () => {
  const r = validateProvision({
    capital_kind: 'live', label: 'X', platform: 'mt5', import_method: 'manual', firm_id: 'gft',
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /live/i);
});

test('auto_sync requires a credential block; the other methods must not carry one', () => {
  const noCred = validateProvision({ ...propBody(), credential: undefined });
  assert.equal(noCred.ok, false);
  assert.match(noCred.error, /credential/i);

  const strayCred = validateProvision({
    ...propBody(), import_method: 'ea', credential: { server: 'S', login: 1, password: 'p' },
  });
  assert.equal(strayCred.ok, false, 'an EA account stores no password — a stray one must not be accepted');
});

test('the validated value never carries the password onward', () => {
  // The route hands the credential to the connector separately. Keeping it out of
  // `value` means the object that gets logged, spread or serialized cannot leak it.
  const r = validateProvision({ ...propBody(), credential: { server: 'S', login: 7, password: 'secret' } });
  assert.equal(r.ok, true);
  assert.equal(JSON.stringify(r.value).includes('secret'), false, 'the password must not appear in value');
});

test('numeric rule fields are coerced, and blank becomes null not zero', () => {
  const r = validateProvision({ ...propBody(), start_balance: '50000', min_trading_days: '', max_dd_pct: '10.5' });
  assert.equal(r.value.start_balance, 50000);
  assert.equal(r.value.min_trading_days, null, 'blank must not become 0 — 0 means "no requirement"');
  assert.equal(r.value.max_dd_pct, 10.5);
});

test('provision_key is passed through when present and null otherwise', () => {
  assert.equal(validateProvision({ ...propBody(), provision_key: 'abc-123' }).value.provision_key, 'abc-123');
  assert.equal(validateProvision(propBody()).value.provision_key, null);
  assert.equal(validateProvision({ ...propBody(), provision_key: 'x'.repeat(200) }).ok, false,
    'an unbounded key would be an unbounded unique index entry');
});

test('provisionGate: free cannot create a synced account at all', () => {
  const r = provisionGate({ plan: 'free', kind: 'synced', syncedCount: 0, manualCount: 0 });
  assert.equal(r.ok, false);
  assert.equal(r.code, 402);
  assert.match(r.error, /Pro/);
});

test('provisionGate: free can create manual accounts up to its cap', () => {
  assert.equal(provisionGate({ plan: 'free', kind: 'manual', syncedCount: 0, manualCount: 4 }).ok, true);
  const full = provisionGate({ plan: 'free', kind: 'manual', syncedCount: 0, manualCount: 5 });
  assert.equal(full.ok, false);
  assert.equal(full.code, 402);
});

test('provisionGate: pro is capped at three synced accounts', () => {
  assert.equal(provisionGate({ plan: 'pro', kind: 'synced', syncedCount: 2, manualCount: 0 }).ok, true);
  const full = provisionGate({ plan: 'pro', kind: 'synced', syncedCount: 3, manualCount: 0 });
  assert.equal(full.ok, false);
  assert.match(full.error, /3/, 'the message must name the cap, or the user cannot tell what to do');
});

test('provisionGate: an unknown plan fails closed to free', () => {
  // plans.js entitlements() already fails closed; this asserts the gate inherits it
  // rather than defaulting a missing plan to something permissive.
  assert.equal(provisionGate({ plan: undefined, kind: 'synced', syncedCount: 0, manualCount: 0 }).ok, false);
  assert.equal(provisionGate({ plan: 'enterprise', kind: 'synced', syncedCount: 0, manualCount: 0 }).ok, false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/provision.test.js`
Expected: FAIL — `Cannot find module '.../src/domain/accounts/provision.js'`.

- [ ] **Step 3: Write the implementation**

Create `src/domain/accounts/provision.js`:

```js
// Everything about a provision request that can be decided WITHOUT the database.
//
// It is a separate module from accounts.js because this repo has no test database
// and no HTTP test harness: pure functions are the only place the endpoint's
// behaviour can actually be pinned, and a route handler that delegates to them is
// thin enough to read.
import { findPlatform, platformSupports, IMPORT_METHODS } from '../sync/platforms.js';
import { accountLimit, manualAccountLimit, canUseEA } from '../billing/plans.js';

/** The three values challenges.phase accepts (migration 0016). */
export const PHASES = ['p1', 'p2', 'funded'];

const LABEL_MAX = 120;
const KEY_MAX = 64;

// import_method -> kind. This IS the CHECK constraint from 0026, in JS: keeping
// the mapping in one function means the constraint can only be violated by
// bypassing this module.
const KIND_BY_METHOD = {
  auto_sync: 'synced',
  ea: 'synced',
  file: 'manual',
  manual: 'manual',
};

export const kindForImportMethod = (m) => KIND_BY_METHOD[m] ?? null;

// '' and null become null, never 0. For min_trading_days especially, 0 is a
// meaningful value ("no requirement") and must not be what a blank field means.
const numOrNull = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const strOrNull = (v) => {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
};

/**
 * Validate and normalize a provision payload.
 *
 * WHAT IS NOT VALIDATED, AND WHY: firm_id and product_id are checked for shape,
 * not membership. The firm catalog carries every firm's drawdown percentages and
 * lives in frontend/src, which the backend cannot import (deploy rsyncs
 * `src db scripts ea` plus `frontend/dist`), and duplicating those numbers into
 * src/ is a worse risk than not checking them — a stale copy silently mis-scores a
 * live challenge. The rule percentages arrive from the client exactly as they
 * already do through AccountForms.toPayload, so the trust level is unchanged: a
 * user can only distort their own analytics. `phase` IS validated, because its
 * three values are a schema fact rather than catalog data.
 *
 * The credential is deliberately NOT copied into `value`. The route hands it to
 * the connector separately, so the object that gets spread, logged or serialized
 * downstream cannot carry a broker password.
 */
export function validateProvision(body = {}) {
  const capital_kind = body.capital_kind === 'prop' || body.capital_kind === 'live'
    ? body.capital_kind
    : null;
  if (!capital_kind) return { ok: false, error: 'capital_kind must be "prop" or "live"' };

  const label = String(body.label ?? '').trim();
  if (!label) return { ok: false, error: 'An account name is required' };
  if (label.length > LABEL_MAX) {
    return { ok: false, error: `An account name must be ${LABEL_MAX} characters or fewer` };
  }

  const platform = findPlatform(body.platform);
  if (!platform) return { ok: false, error: 'Unknown platform' };
  if (!platform.enabled) {
    return { ok: false, error: `${platform.label} is not connectable yet` };
  }

  const import_method = IMPORT_METHODS.includes(body.import_method) ? body.import_method : null;
  if (!import_method) return { ok: false, error: 'Unknown import method' };
  if (!platformSupports(platform.id, import_method)) {
    return { ok: false, error: `${platform.label} does not support that import method` };
  }

  // A credential belongs to exactly one method. A stray one on an EA account
  // would be stored by nothing and read by nothing — silently discarded input.
  const hasCredential = body.credential != null;
  if (import_method === 'auto_sync' && !hasCredential) {
    return { ok: false, error: 'Auto Sync needs a credential' };
  }
  if (import_method !== 'auto_sync' && hasCredential) {
    return { ok: false, error: 'Only Auto Sync stores a credential' };
  }

  let firm_id = null;
  let firm_name = null;
  let product_id = null;
  let phase = null;

  if (capital_kind === 'prop') {
    firm_id = strOrNull(body.firm_id);
    product_id = strOrNull(body.product_id);
    firm_name = strOrNull(body.firm_name);
    if (!firm_id) return { ok: false, error: 'A prop account needs a firm' };
    if (!product_id) return { ok: false, error: 'A prop account needs an account type' };
    if (!PHASES.includes(body.phase)) return { ok: false, error: 'A prop account needs a valid phase' };
    phase = body.phase;
  } else if (body.firm_id || body.product_id || body.phase) {
    // Not merely ignored: silently dropping these would make a live account that
    // the user believes is tracking firm rules, which is the bug capital_kind
    // exists to end.
    return { ok: false, error: 'A live account has no prop firm, account type or phase' };
  }

  const provision_key = strOrNull(body.provision_key);
  if (provision_key && provision_key.length > KEY_MAX) {
    return { ok: false, error: 'Invalid provision key' };
  }

  return {
    ok: true,
    value: {
      capital_kind,
      label,
      currency: strOrNull(body.currency) || 'USD',
      broker: strOrNull(body.broker),
      platform: platform.id,
      import_method,
      kind: kindForImportMethod(import_method),
      firm_id,
      firm_name,
      product_id,
      phase,
      start_balance: numOrNull(body.start_balance),
      account_type: body.account_type === 'funded' ? 'funded' : 'eval',
      daily_dd_pct: numOrNull(body.daily_dd_pct),
      max_dd_pct: numOrNull(body.max_dd_pct),
      profit_target_pct: numOrNull(body.profit_target_pct),
      payout_split_pct: numOrNull(body.payout_split_pct),
      dd_type: body.dd_type === 'trailing' ? 'trailing' : 'static',
      min_trading_days: numOrNull(body.min_trading_days),
      provision_key,
    },
  };
}

/**
 * The plan decision, separated from the DB reads that feed it so the policy is
 * testable. Called with counts the route has already fetched.
 *
 * The wizard gates Auto Sync at the import-method step, so a caller reaching a
 * 402 here has bypassed the UI — but the check is the real enforcement, and the
 * message names the cap because "upgrade" without a number tells the user nothing.
 */
export function provisionGate({ plan, kind, syncedCount = 0, manualCount = 0 }) {
  if (kind === 'synced') {
    if (!canUseEA(plan)) {
      return { ok: false, code: 402, error: 'Auto Sync requires the Pro plan' };
    }
    const limit = accountLimit(plan);
    if (syncedCount >= limit) {
      return {
        ok: false,
        code: 402,
        error: `Your plan allows up to ${limit} synced accounts — upgrade to add more`,
      };
    }
    return { ok: true };
  }

  const limit = manualAccountLimit(plan);
  if (manualCount >= limit) {
    return { ok: false, code: 402, error: `Your plan allows up to ${limit} manual accounts` };
  }
  return { ok: true };
}

```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/provision.test.js`
Expected: PASS, 20 tests.

Then `npm test` — expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/domain/accounts/provision.js test/provision.test.js
git commit -m "$(cat <<'MSG'
Add provision validation and the plan gate as pure functions

This repo has no test database and no HTTP harness, so pure functions are the
only place the endpoint's behaviour can be pinned -- and a route that delegates
to them stays readable. kindForImportMethod IS the CHECK constraint from 0026 in
JS, so the constraint can only be violated by bypassing this module.

Two rejections worth naming. A live body carrying firm_id is refused rather than
silently stripped: dropping it would produce a live account the user believes is
tracking firm rules, which is the bug capital_kind exists to end. And a stray
credential on an EA account is refused rather than ignored, because input that is
stored by nothing and read by nothing is worse than an error.

Firm and product are checked for shape, not membership. The firm catalog carries
every firm's drawdown percentages and lives in frontend/src, which the backend
cannot import; duplicating those numbers to make membership checkable is the
worse trade, because a stale copy silently mis-scores a live challenge. Phase IS
validated -- its three values are a schema fact.

The credential never enters the validated value, so nothing downstream can spread
or log a broker password.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 8: The provision transaction

The one write path. Pure query builders so the SQL is assertable, composed inside `withTransaction` and tested against a fake client — that is how "the credential is written only after the account exists" and "a live account gets no challenge" become tested facts rather than intentions.

This task also extends `ACCT_COLS`/`listAccounts` with the new columns, because the insert returns them.

**Files:**
- Create: `src/domain/accounts/provisionQueries.js`
- Modify: `src/domain/accounts/accounts.js` (export `ACCOUNT_COLUMNS`, add the four new columns to `ACCT_COLS` and `listAccounts`)
- Modify: `src/domain/accounts/provision.js` (append `provisionAccount`)
- Test: `test/provision-tx.test.js`

**Interfaces:**
- Consumes: `withTransaction` (Task 1), `saveCredentialQuery` + `sealPassword` (`src/domain/sync/credentials.js`), `enqueueQuery` (`src/domain/sync/queue.js`)
- Produces:
  - `ACCOUNT_COLUMNS: string` from `accounts.js`
  - `findByProvisionKeyQuery(userId, key)`, `insertAccountQuery(userId, v, login)`, `assignSyntheticLoginQuery(id)`, `insertChallengeQuery(accountId, v)` — all `{ text, values }`
  - `provisionAccount(userId, value, opts?) -> { account, replayed: boolean }`
  - `PROVISION_CONFLICT = { LOGIN: 'login_taken', KEY: 'key_replayed' }`

- [ ] **Step 1: Write the failing test**

Create `test/provision-tx.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/provision-tx.test.js`
Expected: FAIL — `Cannot find module '.../provisionQueries.js'`.

- [ ] **Step 3: Extend the account columns**

In `src/domain/accounts/accounts.js`, replace the `ACCT_COLS` declaration (currently around line 77) with:

```js
// Columns selected/returned for an account (kept in sync across queries).
// Exported so provisionQueries.js returns the same shape and test/provision-tx
// can assert the new columns are actually reachable through the API.
export const ACCOUNT_COLUMNS =
  'id, mt5_login, label, broker, currency, start_balance, account_type, daily_dd_pct, max_dd_pct, profit_target_pct, payout_split_pct, payout_cycle_days, payout_anchor_date, dd_type, min_trading_days, firm_id, firm_name, product_id, capital_kind, platform, import_method, ingest_token, kind, is_active, created_at';
const ACCT_COLS = ACCOUNT_COLUMNS;
```

And in `listAccounts`, add the four columns to the SELECT — after the `a.firm_id, a.firm_name,` line:

```js
            a.product_id, a.capital_kind, a.platform, a.import_method,
```

- [ ] **Step 4: Write the query builders**

Create `src/domain/accounts/provisionQueries.js`:

```js
// The SQL of account provisioning, as pure {text, values} builders.
//
// Separated from the transaction that runs them for one reason: this repo has no
// test database, so assertable SQL is the only way to pin what provisioning
// writes. Every value rides as a placeholder — none of these strings ever carries
// user input.
import { ACCOUNT_COLUMNS } from './accounts.js';

/** Has this exact provision already been performed? See provision_key in 0026. */
export function findByProvisionKeyQuery(userId, key) {
  return {
    text: `SELECT ${ACCOUNT_COLUMNS} FROM mt5_accounts WHERE user_id = $1 AND provision_key = $2;`,
    values: [userId, key],
  };
}

/**
 * Create the account row.
 *
 * `login` is the caller's decision, not this builder's: an Auto Sync account
 * already knows its MT5 login from the credential step, so it goes in HERE and the
 * unique index turns a collision into a pre-commit failure with nothing written.
 * An EA account passes null and binds on its first trade, exactly as before. A
 * manual account also passes null and is given its synthetic negative login
 * immediately afterwards, once the id exists.
 */
export function insertAccountQuery(userId, v, login) {
  return {
    text: `INSERT INTO mt5_accounts
             (user_id, label, broker, currency, start_balance, account_type,
              daily_dd_pct, max_dd_pct, profit_target_pct, payout_split_pct,
              dd_type, min_trading_days, firm_id, firm_name, product_id,
              capital_kind, platform, import_method, kind, mt5_login,
              ingest_token, provision_key)
           VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'eval'),
                   COALESCE($7, 5), COALESCE($8, 10), COALESCE($9, 8), COALESCE($10, 80),
                   COALESCE($11, 'static'), COALESCE($12, 0), $13, $14, $15,
                   $16, $17, $18, $19, $20,
                   $21, $22)
           RETURNING ${ACCOUNT_COLUMNS};`,
    values: [
      userId, v.label, v.broker, v.currency, v.start_balance, v.account_type,
      v.daily_dd_pct, v.max_dd_pct, v.profit_target_pct, v.payout_split_pct,
      v.dd_type, v.min_trading_days, v.firm_id, v.firm_name, v.product_id,
      v.capital_kind, v.platform, v.import_method, v.kind, login,
      v.ingest_token ?? null, v.provision_key,
    ],
  };
}

/**
 * Give a manual account its synthetic login. Real MT5 logins are positive, so the
 * negative space never collides while still satisfying UNIQUE(mt5_login) — the
 * arrangement migration 0015 introduced.
 */
export function assignSyntheticLoginQuery(id) {
  return {
    text: `UPDATE mt5_accounts SET mt5_login = -id WHERE id = $1 RETURNING ${ACCOUNT_COLUMNS};`,
    values: [id],
  };
}

/**
 * Snapshot the phase's rules as the account's first active challenge.
 *
 * NOT createChallengeForAccount(): that derives the phase from account_type and so
 * can only ever produce 'p1' or 'funded'. A trader who has already passed Phase 1
 * and is adding the Phase 2 account they are actually trading needs to say so, and
 * that is the wizard's phase step.
 *
 * A funded phase carries a NULL target: challenges.profit_target_pct is nullable
 * and NULL means "no target", while the account-level column is NOT NULL and keeps
 * its default. Copying that default across would show a funded account a target it
 * cannot pass.
 */
export function insertChallengeQuery(accountId, v) {
  const funded = v.phase === 'funded';
  return {
    text: `INSERT INTO challenges (mt5_account_id, phase, status, dd_type, start_balance,
                                   daily_dd_pct, max_dd_pct, profit_target_pct, min_trading_days)
           VALUES ($1, $2, 'active', COALESCE($3, 'static'), $4,
                   COALESCE($5, 4), COALESCE($6, 10), $7, COALESCE($8, 0))
           ON CONFLICT (mt5_account_id) WHERE status = 'active' DO NOTHING
           RETURNING id, mt5_account_id, phase, status;`,
    values: [
      accountId, v.phase, v.dd_type, v.start_balance,
      v.daily_dd_pct, v.max_dd_pct, funded ? null : v.profit_target_pct, v.min_trading_days,
    ],
  };
}
```

- [ ] **Step 5: Write `provisionAccount`**

Append to `src/domain/accounts/provision.js`:

```js
import crypto from 'node:crypto';
import { withTransaction } from '../../platform/db.js';
import { sealPassword, saveCredentialQuery } from '../sync/credentials.js';
import { enqueueQuery } from '../sync/queue.js';
import {
  findByProvisionKeyQuery, insertAccountQuery, assignSyntheticLoginQuery, insertChallengeQuery,
} from './provisionQueries.js';

/** Typed conflicts, so the route can pick a status code without parsing pg text. */
export const PROVISION_CONFLICT = { LOGIN: 'login_taken', KEY: 'key_replayed' };

const genToken = () => crypto.randomBytes(24).toString('hex');
const shape = (row) => ({
  ...row,
  mt5_login: row.mt5_login == null ? null : Number(row.mt5_login),
  pending: row.mt5_login == null,
});

/**
 * Create an account and everything that must exist with it, in ONE transaction.
 *
 * The ordering is not incidental:
 *   1. the account, because the credential is sealed under its id (credAad) and
 *      the challenge references it;
 *   2. the challenge — ONLY for a prop account. A live account getting one is the
 *      bug this whole change exists to fix;
 *   3. the credential, then the job. A job leased before its credential exists is
 *      handed no payload, so the agent reports nothing, the lease expires, and
 *      reclaimExpired re-queues it forever with no error anywhere.
 *
 * Every failure rolls back to nothing written, which is what makes retry safe with
 * no cleanup path. `connect`, `credential` and `seal` are injected so all of the
 * above is testable without a database (test/provision-tx.test.js).
 */
export async function provisionAccount(userId, v, opts = {}) {
  const { connect, credential = null, seal = sealPassword } = opts;

  return withTransaction(async (client) => {
    // Idempotency first: a network drop after COMMIT is exactly when a user
    // presses the button again, and this is a nine-step flow to repeat.
    if (v.provision_key) {
      const found = findByProvisionKeyQuery(userId, v.provision_key);
      const { rows } = await client.query(found.text, found.values);
      if (rows.length) return { account: shape(rows[0]), replayed: true };
    }

    const synced = v.kind === 'synced';
    const login = v.import_method === 'auto_sync' && credential ? credential.login : null;
    const insert = insertAccountQuery(
      userId,
      { ...v, ingest_token: synced ? genToken() : null },
      login,
    );

    let row;
    try {
      ({ rows: [row] } = await client.query(insert.text, insert.values));
    } catch (err) {
      if (err.code === '23505') {
        const conflict = /provision_key/.test(err.constraint ?? '')
          ? PROVISION_CONFLICT.KEY
          : PROVISION_CONFLICT.LOGIN;
        const wrapped = new Error(
          conflict === PROVISION_CONFLICT.LOGIN
            ? 'That MT5 login is already registered to an account'
            : 'This account was already created',
        );
        wrapped.conflict = conflict;
        throw wrapped;
      }
      throw err;
    }

    if (!synced) {
      const assign = assignSyntheticLoginQuery(row.id);
      ({ rows: [row] } = await client.query(assign.text, assign.values));
    }

    if (v.capital_kind === 'prop') {
      const challenge = insertChallengeQuery(row.id, v);
      await client.query(challenge.text, challenge.values);
    }

    if (v.import_method === 'auto_sync' && credential) {
      const cred = saveCredentialQuery({
        accountId: row.id,
        server: credential.server,
        firmKey: v.firm_id ?? null,
        passwordCt: seal(row.id, credential.password),
      });
      await client.query(cred.text, cred.values);

      const job = enqueueQuery(row.id, 'first_sync');
      await client.query(job.text, job.values);
    }

    return { account: shape(row), replayed: false };
  }, connect);
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test test/provision-tx.test.js`
Expected: PASS, 13 tests.

Then `npm test` — expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/domain/accounts/provisionQueries.js src/domain/accounts/provision.js src/domain/accounts/accounts.js test/provision-tx.test.js
git commit -m "$(cat <<'MSG'
Provision an account, its challenge and its credential in one transaction

Pure query builders composed inside withTransaction, tested against a fake
client, because there is no test database -- assertable SQL is the only way to
pin what provisioning writes.

The ordering is load-bearing and now tested. The account first, because the
credential is sealed under its id and the challenge references it. The challenge
ONLY for a prop account -- a live account getting one is the bug this change
exists to fix. Then the credential, then the job: a job leased before its
credential exists is handed no payload, so the agent reports nothing, the lease
expires, and reclaimExpired re-queues it forever with no error anywhere.

An Auto Sync account sets mt5_login at INSERT rather than binding it later, since
the credential step already collected it -- so a collision with a login another
tenant owns fails before anything is written, and surfaces as a typed conflict
the route can turn into a 409 without parsing a pg message. Every failure rolls
back to nothing written, which is what makes retry safe with no cleanup path.

Two tests exist purely to keep the credential quiet: the password is sealed under
the new account id (the AAD binds it, so anything else fails to open at first
sync) and the plaintext never reaches the SQL layer, where a query log would
capture it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 9: The provision and login-availability routes

**Files:**
- Modify: `src/routes/accounts.js` (add two routes; forward `firm_id`/`firm_name`/`product_id`/`capital_kind` on the legacy POST; skip the challenge for live)
- Test: `test/capital-kind.test.js` (created here, extended in Tasks 10-11)

**Interfaces:**
- Consumes: `validateProvision`, `provisionGate`, `provisionAccount`, `PROVISION_CONFLICT` (Tasks 7-8); `getConnector` (Task 4); `credentialsEnabled` (`src/domain/sync/credentials.js`); `planForUser`, `syncedAccountCount`, `manualAccountCount` (`src/domain/billing/entitlements.js`)
- Produces: `POST /api/accounts/provision` → `201 { account }`; `GET /api/accounts/login-available?platform=&login=` → `200 { available, mine }`

- [ ] **Step 1: Write the failing test**

Create `test/capital-kind.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Route handlers cannot be exercised without an HTTP harness this repo does not
// have, so what is asserted here is that the route file WIRES the tested pure
// functions in — the same approach test/routes-split.test.js takes. The behaviour
// itself is pinned by provision.test.js and provision-tx.test.js.
const accountsRoute = readFileSync(new URL('../src/routes/accounts.js', import.meta.url), 'utf8');

test('provision is registered on the root app with requireAuth', () => {
  assert.match(accountsRoute, /app\.post\(\s*'\/api\/accounts\/provision'/);
  const handler = accountsRoute.slice(accountsRoute.indexOf("'/api/accounts/provision'"));
  assert.match(handler.slice(0, 200), /preHandler:\s*app\.requireAuth/);
  assert.equal(/app\.register\(/.test(accountsRoute), false,
    'a registered plugin cannot see app.requireAuth or the rate-limit hook');
});

test('provision delegates to the tested pure functions rather than re-deciding', () => {
  for (const fn of ['validateProvision', 'provisionGate', 'provisionAccount']) {
    assert.ok(accountsRoute.includes(fn), `${fn} is not used — the policy would be untested`);
  }
});

test('provision refuses Auto Sync when credentials cannot be encrypted', () => {
  // Storing a broker password we cannot encrypt is worse than not offering the
  // feature; sync.js already returns 503 for this and provision must agree.
  assert.ok(accountsRoute.includes('credentialsEnabled'));
  assert.match(accountsRoute, /503/);
});

test('provision maps a login collision to 409, not 500', () => {
  assert.ok(accountsRoute.includes('PROVISION_CONFLICT'));
  assert.match(accountsRoute, /409/);
});

test('login-available never reveals another tenant account', () => {
  const idx = accountsRoute.indexOf("'/api/accounts/login-available'");
  assert.ok(idx > -1, 'the route is missing');
  const handler = accountsRoute.slice(idx, idx + 1200);
  // It answers "can you use this login" and, only for the caller's own account,
  // "it is yours". Anything more is an enumeration oracle for other users' logins.
  assert.match(handler, /available/);
  assert.match(handler, /mine/);
  assert.equal(/label|ingest_token|user_id:/.test(handler), false,
    'no other-tenant detail may leave this endpoint');
});

test('the legacy POST /api/accounts forwards firm_id and product_id', () => {
  // This was a live bug: the handler never destructured firm_id, so the firm
  // picked in the template picker was dropped on create while PATCH saved it.
  const post = accountsRoute.slice(
    accountsRoute.indexOf("app.post('/api/accounts'"),
    accountsRoute.indexOf("app.patch('/api/accounts/:id'"),
  );
  for (const f of ['firm_id', 'firm_name', 'product_id', 'capital_kind']) {
    assert.ok(post.includes(f), `POST /api/accounts still drops ${f}`);
  }
});

test('no account creation path gives a live account a challenge', () => {
  // The fake-challenge bug. Both creation paths must guard it: provisionAccount
  // does so structurally (provision-tx.test.js), and the legacy POST needs the
  // same condition.
  const post = accountsRoute.slice(
    accountsRoute.indexOf("app.post('/api/accounts'"),
    accountsRoute.indexOf("app.patch('/api/accounts/:id'"),
  );
  const call = post.indexOf('createChallengeForAccount');
  assert.ok(call > -1, 'the legacy path still needs to create a challenge for prop accounts');
  assert.match(post.slice(Math.max(0, call - 200), call), /capital_kind/,
    'createChallengeForAccount must be guarded on capital_kind');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/capital-kind.test.js`
Expected: FAIL on the first assertion — the provision route does not exist.

- [ ] **Step 3: Add the imports**

At the top of `src/routes/accounts.js`, extend the existing imports:

```js
import { resolveScope, listAccounts, createAccount, updateAccount, deleteAccount, stripNullProfitTarget, ownedAccountByLogin } from '../domain/accounts/accounts.js';
import { validateProvision, provisionGate, provisionAccount, PROVISION_CONFLICT } from '../domain/accounts/provision.js';
import { getConnector } from '../domain/sync/connectors/index.js';
import { credentialsEnabled } from '../domain/sync/credentials.js';
```

- [ ] **Step 4: Add the provision route**

Insert into `accountRoutes`, after the existing `app.post('/api/accounts', ...)` handler:

```js
  /**
   * Create an account and everything that must exist with it, atomically.
   *
   * This is what the Add Account flow calls. The older POST /api/accounts stays
   * for the edit/legacy path, but it cannot express this one: a wizard collects a
   * credential BEFORE the account exists, and writing the account first would
   * leave a half-configured row behind on every abandoned or failed attempt.
   *
   * Every branch below returns before anything is written, so a rejected request
   * leaves no trace and the client can safely retry the same payload.
   */
  app.post('/api/accounts/provision', { preHandler: app.requireAuth }, async (req, reply) => {
    const parsed = validateProvision(req.body ?? {});
    if (!parsed.ok) return reply.code(400).send({ error: parsed.error });
    const v = parsed.value;

    const plan = await planForUser(req.user.uid);
    const gate = provisionGate({
      plan,
      kind: v.kind,
      syncedCount: await syncedAccountCount(req.user.uid),
      manualCount: await manualAccountCount(req.user.uid),
    });
    if (!gate.ok) return reply.code(gate.code).send({ error: gate.error });

    // Auto Sync: the connector decides whether the credential is usable, and the
    // key must exist before we promise to keep a broker password.
    let credential = null;
    if (v.import_method === 'auto_sync') {
      const connector = getConnector(v.platform);
      if (!connector) return reply.code(400).send({ error: 'Auto Sync is not available for that platform' });
      if (!credentialsEnabled()) {
        return reply.code(503).send({ error: 'Auto Sync is not configured on this server yet' });
      }
      const checked = connector.validateCredential(req.body?.credential ?? {});
      if (!checked.ok) return reply.code(400).send({ error: checked.error });
      credential = checked.value;
    }

    try {
      const { account, replayed } = await provisionAccount(req.user.uid, v, { credential });
      return reply.code(replayed ? 200 : 201).send({ account });
    } catch (err) {
      if (err.conflict === PROVISION_CONFLICT.LOGIN) {
        return reply.code(409).send({ error: err.message, conflict: err.conflict });
      }
      if (err.conflict === PROVISION_CONFLICT.KEY) {
        return reply.code(409).send({ error: err.message, conflict: err.conflict });
      }
      throw err;
    }
  });

  /**
   * Is this platform login free to use? The credential step calls this while the
   * user types, so a collision is reported before they have typed a password
   * rather than as a 409 at the end of a nine-step flow.
   *
   * DELIBERATELY BLUNT: it answers "available" and, only when the login belongs to
   * the CALLER, "mine". Saying anything about another tenant's account would make
   * this an oracle for enumerating other traders' MT5 logins. The unique index at
   * commit remains the real guard — this is UX, and two users racing one login
   * still means one of them gets the 409.
   */
  app.get('/api/accounts/login-available', { preHandler: app.requireAuth }, async (req, reply) => {
    const login = Number(req.query?.login);
    if (!Number.isInteger(login) || login <= 0) {
      return reply.code(400).send({ error: 'a positive login is required' });
    }
    const mine = await ownedAccountByLogin(req.user.uid, login);
    if (mine) return reply.send({ available: false, mine: true, account_id: mine.id });
    const { rows } = await query('SELECT 1 FROM mt5_accounts WHERE mt5_login = $1', [login]);
    return reply.send({ available: rows.length === 0, mine: false });
  });
```

Add the `query` import at the top of the file if it is not already present:

```js
import { query } from '../platform/db.js';
```

- [ ] **Step 5: Fix the legacy POST — forward the firm and guard the challenge**

In the existing `app.post('/api/accounts', ...)` handler, replace the destructuring line and the `createAccount`/`createChallengeForAccount` calls:

```js
    const { label, broker, currency, start_balance, account_type, daily_dd_pct, max_dd_pct, profit_target_pct, payout_split_pct, dd_type, min_trading_days, firm_id, firm_name, product_id } = req.body ?? {};
    // Absent means prop, which is what every account created before capital_kind
    // existed is — so an old client keeps its current behaviour exactly.
    const capital_kind = req.body?.capital_kind === 'live' ? 'live' : 'prop';
    const acct = await createAccount(req.user.uid, {
      label, broker, currency, start_balance, account_type, daily_dd_pct, max_dd_pct,
      profit_target_pct, payout_split_pct, dd_type, min_trading_days,
      firm_id, firm_name, product_id, capital_kind, kind,
    });
    // Every PROP account tracks an active challenge from the moment it exists, so
    // Prop OS has state to show. A live account must NOT get one: it has no firm
    // rules, and an invented 5/10/8 challenge is what made own-capital accounts
    // read as evaluations with a profit target they do not have.
    if (capital_kind === 'prop') await createChallengeForAccount(acct.id);
    return reply.code(201).send(acct);
```

Then extend `createAccount` in `src/domain/accounts/accounts.js` to accept and write `product_id` and `capital_kind` — add them to the destructured parameter list, to the INSERT column list, and to the values array (mirroring how `firm_id`/`firm_name` are already handled).

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test test/capital-kind.test.js`
Expected: PASS, 7 tests.

Then `npm test` — expected: all green, including `test/routes-split.test.js`.

Smoke-test the endpoint against a local server (`npm run dev` in another shell, logged in so a cookie exists — or use an existing session cookie):

```bash
curl -s -X POST http://localhost:3000/api/accounts/provision \
  -H 'Content-Type: application/json' -b "$COOKIE" \
  -d '{"capital_kind":"live","label":"Smoke live","platform":"mt5","import_method":"manual","start_balance":1000}' | jq
```

Expected: `201` with an account whose `capital_kind` is `live`, `kind` is `manual` and `mt5_login` is negative. Then confirm the challenge was **not** created:

```bash
psql "$DATABASE_URL" -c "SELECT a.label, a.capital_kind, c.id AS challenge FROM mt5_accounts a LEFT JOIN challenges c ON c.mt5_account_id = a.id WHERE a.label = 'Smoke live';"
```

Expected: one row with `challenge` NULL. If a challenge row exists, the guard in Step 5 is wrong. Delete the smoke account afterwards.

- [ ] **Step 7: Commit**

```bash
git add src/routes/accounts.js src/domain/accounts/accounts.js test/capital-kind.test.js
git commit -m "$(cat <<'MSG'
Add POST /api/accounts/provision and stop dropping the firm on create

The wizard collects a credential before the account exists, which the old create
endpoint cannot express -- writing the account first leaves a half-configured row
behind on every abandoned attempt. Provision validates, gates on plan, asks the
connector whether the credential is usable, and only then writes, so a rejected
request leaves no trace and the same payload can be retried.

Two fixes to the existing endpoint ride along. It never destructured firm_id, so
the firm picked in the template picker was silently dropped on create while PATCH
saved it -- which is why edited accounts looked right and new ones did not. And
createChallengeForAccount is now guarded on capital_kind: absent means prop, so
an old client behaves exactly as before, but a live account no longer gets an
invented 5/10/8 challenge that made it read as an evaluation with a profit target
it does not have.

login-available is deliberately blunt. It answers "available" and, only for the
caller's own account, "mine" -- saying anything about another tenant would make it
an oracle for enumerating other traders' MT5 logins. The unique index at commit
stays the real guard; this only moves the collision earlier than the last step of
a nine-step flow.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 10: Prop OS stops counting live accounts (server)

`propOverview.js` has no concept of a non-prop account and should not gain one — the filter belongs at the route boundary, where accounts are fetched. One helper, used everywhere, so a future prop surface cannot forget it.

**Files:**
- Modify: `src/domain/accounts/accounts.js` (add `propAccountsOnly`)
- Modify: `src/routes/prop.js` (filter at all four `listAccounts` call sites)
- Test: `test/capital-kind.test.js` (extend)

**Interfaces:**
- Produces: `propAccountsOnly(accounts) -> accounts[]` — consumed by `src/routes/prop.js` and mirrored on the client in Task 11.

- [ ] **Step 1: Write the failing test**

Append to `test/capital-kind.test.js`:

```js
import { propAccountsOnly } from '../src/domain/accounts/accounts.js';

test('propAccountsOnly keeps prop accounts and drops live ones', () => {
  const rows = [
    { id: 1, capital_kind: 'prop' },
    { id: 2, capital_kind: 'live' },
    { id: 3, capital_kind: 'prop' },
  ];
  assert.deepEqual(propAccountsOnly(rows).map((a) => a.id), [1, 3]);
});

test('propAccountsOnly treats a missing capital_kind as prop', () => {
  // Belt and braces for a row read before migration 0026 lands, or a fixture that
  // predates the column. Dropping such a row would empty a real trader's Prop OS.
  assert.deepEqual(propAccountsOnly([{ id: 1 }, { id: 2, capital_kind: null }]).map((a) => a.id), [1, 2]);
});

test('propAccountsOnly is total — empty and absent input give an empty list', () => {
  assert.deepEqual(propAccountsOnly([]), []);
  assert.deepEqual(propAccountsOnly(undefined), []);
  assert.deepEqual(propAccountsOnly(null), []);
});

test('every prop route filters its accounts through propAccountsOnly', () => {
  // propOverview.js computes "active accounts", "total funding" and the accounts
  // ring from whatever list it is handed. A live account in that list is counted
  // as an evaluation with an 8% target, so the filter must be applied at every
  // call site, not most of them.
  const propRoute = readFileSync(new URL('../src/routes/prop.js', import.meta.url), 'utf8');
  assert.ok(propRoute.includes('propAccountsOnly'), 'the helper is not imported');
  const calls = [...propRoute.matchAll(/listAccounts\(req\.user\.uid\)/g)].length;
  const filtered = [...propRoute.matchAll(/propAccountsOnly\(/g)].length;
  assert.ok(filtered >= calls,
    `${calls} listAccounts call(s) but only ${filtered} filtered — an unfiltered one counts live accounts as evaluations`);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/capital-kind.test.js`
Expected: FAIL — `propAccountsOnly is not exported`.

- [ ] **Step 3: Add the helper**

Append to `src/domain/accounts/accounts.js`:

```js
/**
 * Only the accounts Prop OS is about.
 *
 * A live-capital account has no firm rules, no challenge row and no profit
 * target, so counting it in "active accounts", "total funding" or the accounts
 * ring reports a number about money the firm never staked. The prop aggregators
 * (domain/prop/propOverview.js) deliberately know nothing about this distinction —
 * they compute over whatever list they are handed — so the filter lives here and is
 * applied where accounts are fetched.
 *
 * A missing or null capital_kind counts as PROP: that is what every account
 * created before migration 0026 is, and treating it as live would empty a real
 * trader's Prop OS.
 */
export const propAccountsOnly = (accounts) =>
  (Array.isArray(accounts) ? accounts : []).filter((a) => (a?.capital_kind ?? 'prop') === 'prop');
```

- [ ] **Step 4: Filter at every prop route call site**

In `src/routes/prop.js`, add `propAccountsOnly` to the existing import from `../domain/accounts/accounts.js`, then wrap each `listAccounts(req.user.uid)` result. There are four call sites (around lines 47, 72, 119 and any later one). The finance route already narrows to scope, so filter before that narrowing:

```js
    // line ~50, the finance route
    const inScope = propAccountsOnly(accounts).filter((a) => scope.logins.includes(a.mt5_login));
```

For the overview and challenges routes, filter at the destructuring instead, so nothing downstream can see an unfiltered list:

```js
    const [propStates, allAccounts, payouts, fees, challenges, lastTrade, days] = await Promise.all([...]);
    const accounts = propAccountsOnly(allAccounts);
```

Apply the same rename-and-filter pattern at every remaining `listAccounts(req.user.uid)` in the file. Grep to confirm none is left bare:

```bash
grep -n "listAccounts(req.user.uid)" src/routes/prop.js
grep -n "propAccountsOnly" src/routes/prop.js
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test test/capital-kind.test.js`
Expected: PASS, 11 tests.

Then `npm test` — expected: all green, including `test/prop-overview.test.js` and `test/finance.test.js`.

- [ ] **Step 6: Commit**

```bash
git add src/domain/accounts/accounts.js src/routes/prop.js test/capital-kind.test.js
git commit -m "$(cat <<'MSG'
Keep live-capital accounts out of Prop OS

propOverview.js computes "active accounts", "total funding" and the accounts ring
from whatever list it is handed, and it should stay that way -- it is arithmetic
over accounts, not a place to teach what a prop account is. So the filter lives
beside listAccounts and is applied at every prop route call site, with a test
counting the call sites against the filters so an unfiltered one cannot slip in.

A missing capital_kind counts as prop. That is what every account created before
migration 0026 is, and treating it as live would empty a real trader's Prop OS.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 11: Prop OS and Settings stop mislabelling live accounts (client)

The four prop pages read `accounts` from the outlet context, which is the unfiltered list — the switcher needs live accounts, so `App` must keep them. And `SettingsAccounts` renders `TYPE_LABEL[a.account_type] || 'Evaluation'`, so a live account currently reads "Evaluation".

**Files:**
- Modify: `frontend/src/features/prop/propAccounts.js` (add `onlyPropCapital`)
- Modify: `frontend/src/features/prop/{PropOS,PropAccounts,PropChallenges,Finance}.jsx`
- Modify: `frontend/src/features/settings/SettingsAccounts.jsx`
- Test: `test/capital-kind.test.js` (extend)

**Interfaces:**
- Produces: `onlyPropCapital(accounts) -> accounts[]` from `propAccounts.js` — the client twin of `propAccountsOnly`.

- [ ] **Step 1: Write the failing test**

Append to `test/capital-kind.test.js`:

```js
import { onlyPropCapital } from '../frontend/src/features/prop/propAccounts.js';
import { readSrc } from './helpers/src-files.js';

test('onlyPropCapital matches the server helper exactly', () => {
  // Two implementations of one rule, because the client filters the outlet
  // context and the server filters its own query. They must agree, including on
  // the missing-column case.
  const rows = [{ id: 1, capital_kind: 'prop' }, { id: 2, capital_kind: 'live' }, { id: 3 }];
  assert.deepEqual(onlyPropCapital(rows).map((a) => a.id), propAccountsOnly(rows).map((a) => a.id));
  assert.deepEqual(onlyPropCapital(undefined), []);
});

test('every Prop OS page filters the account list it is handed', () => {
  // The outlet context deliberately carries EVERY account, because the account
  // switcher must offer live accounts too — you journal them. So each prop page
  // has to filter for itself.
  for (const page of ['PropOS.jsx', 'PropAccounts.jsx', 'PropChallenges.jsx', 'Finance.jsx']) {
    assert.match(readSrc(page), /onlyPropCapital/, `${page} shows live accounts as prop accounts`);
  }
});

test('the account switcher does NOT filter — a live account is still journalable', () => {
  // The inverse assertion, so a later "fix" cannot quietly hide live accounts from
  // the picker and make their trades unreachable.
  assert.equal(/onlyPropCapital/.test(readSrc('app/Layout.jsx')), false,
    'the shell must not filter the switcher');
});

test('the Settings accounts table names the capital kind before the prop type', () => {
  const src = readSrc('SettingsAccounts.jsx');
  assert.match(src, /capital_kind/,
    'the Type cell keys off account_type alone, so a live account reads "Evaluation"');
  const cell = src.slice(src.indexOf('TYPE_LABEL'));
  assert.match(cell.slice(0, 400), /capital_kind/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/capital-kind.test.js`
Expected: FAIL — `onlyPropCapital is not exported`.

- [ ] **Step 3: Add the client helper**

Append to `frontend/src/features/prop/propAccounts.js`:

```js
/**
 * Only the accounts Prop OS is about — the client twin of propAccountsOnly in
 * domain/accounts/accounts.js.
 *
 * There are two because the app-wide outlet context deliberately carries EVERY
 * account: the account switcher must offer a live account, since you journal it
 * like any other. It is only the prop surfaces that must not — a live account has
 * no challenge, no drawdown floor and no target.
 *
 * A missing capital_kind counts as prop, matching the server, so an account list
 * cached from before migration 0026 does not blank the module.
 */
export const onlyPropCapital = (accounts) =>
  (Array.isArray(accounts) ? accounts : []).filter((a) => (a?.capital_kind ?? 'prop') === 'prop');
```

- [ ] **Step 4: Filter in each prop page**

In each of `PropOS.jsx`, `PropAccounts.jsx`, `PropChallenges.jsx` and `Finance.jsx`, import the helper and apply it where the page destructures its accounts from the outlet context. The exact line differs per page; the pattern is the same:

```jsx
import { onlyPropCapital } from './propAccounts.js';

// ...inside the component, replacing `const { accounts = [] } = useOutletContext();`
const { accounts: allAccounts = [], ...rest } = useOutletContext();
const accounts = useMemo(() => onlyPropCapital(allAccounts), [allAccounts]);
```

`useMemo` because these lists feed chart and KPI computations that already memoize on `accounts` — a fresh array identity every render would defeat those. Add `useMemo` to the React import where it is not already there.

- [ ] **Step 5: Fix the Settings Type cell**

In `frontend/src/features/settings/SettingsAccounts.jsx`, replace the Type cell (the `<td className="set-col-tight set-col-badge">` containing `TYPE_LABEL`) with:

```jsx
                <td className="set-col-tight set-col-badge">
                  {/* Capital kind first. A live account has no evaluation and no
                      funding: labelling it "Evaluation" — which keying off
                      account_type alone does, since that column keeps its NOT NULL
                      default — states a firm relationship that does not exist. */}
                  {a.capital_kind === 'live' ? (
                    <Badge tone="neutral">Live capital</Badge>
                  ) : (
                    <Badge tone={a.account_type === 'funded' ? 'profit' : 'neutral'}>
                      {TYPE_LABEL[a.account_type] || 'Evaluation'}
                    </Badge>
                  )}
                </td>
```

- [ ] **Step 6: Run the tests and build**

Run: `node --test test/capital-kind.test.js`
Expected: PASS, 15 tests.

Run: `npm test` — expected: all green. Update `test/settings-module.test.js` or `test/propos-reskin.test.js` if either asserts on the exact markup changed above.

Run: `cd frontend && npm run build && cd ..`
Expected: build succeeds. CI does not build the frontend on PRs, so a missing `useMemo` import is only caught here.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/prop frontend/src/features/settings/SettingsAccounts.jsx test/capital-kind.test.js
git commit -m "$(cat <<'MSG'
Stop showing live-capital accounts as prop accounts

The app-wide outlet context deliberately carries every account, because the
switcher must offer a live one -- you journal it like any other. So each prop
page filters for itself, and a test asserts the inverse too: the shell must NOT
filter, or a later "fix" would quietly hide live accounts from the picker and make
their trades unreachable.

The Settings type cell keyed off account_type alone, which keeps its NOT NULL
default of 'eval' on a live account -- so the table read "Evaluation" for money
no firm ever staked. Capital kind is now checked first.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 12: Jobs carry a platform, and workers lease only what they can run

MT5 needs the Windows box; cTrader and TradeLocker will be Linux workers. Without a filter, the first Linux worker deployed leases MT5 jobs it cannot execute — and burns their retry budget doing it.

**Files:**
- Modify: `src/domain/sync/queue.js` (`enqueueQuery`, `dueAccountsQuery`, `leaseQuery`, add `requestedPlatforms`)
- Modify: `src/routes/sync.js` (pass the filter into `leaseJobs`)
- Test: `test/sync-platform.test.js`

**Interfaces:**
- Consumes: `PLATFORM_IDS` (Task 3)
- Produces: `requestedPlatforms(body) -> string[]`; `leaseQuery(workerId, limit, leaseMs, platforms)` — note the new fourth argument.

- [ ] **Step 1: Write the failing test**

Create `test/sync-platform.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { enqueueQuery, dueAccountsQuery, leaseQuery, requestedPlatforms } from '../src/domain/sync/queue.js';

test('enqueue reads the platform off the account instead of trusting a caller', () => {
  // Denormalized, not passed in: a caller that guessed wrong would file a job on a
  // fleet that cannot run it, and the account row is the only authority.
  const q = enqueueQuery(42, 'first_sync');
  assert.match(q.text, /INSERT INTO sync_jobs[\s\S]*platform/);
  assert.match(q.text, /FROM mt5_accounts/);
  assert.ok(q.values.includes(42));
});

test('enqueue still cannot pile up jobs for one account', () => {
  // The partial unique index is the whole anti-pileup mechanism; rewriting this
  // statement as a SELECT-driven insert must not drop the conflict clause.
  assert.match(enqueueQuery(1, 'manual').text, /ON CONFLICT \(account_id\) WHERE status IN \('queued', 'leased'\) DO NOTHING/);
});

test('the due-accounts sweep also stamps a platform', () => {
  assert.match(dueAccountsQuery().text, /INSERT INTO sync_jobs[\s\S]*platform/);
});

test('lease filters by platform', () => {
  const q = leaseQuery('sync-01', 1, 600000, ['mt5']);
  assert.match(q.text, /platform = ANY\(/);
  assert.ok(q.values.some((v) => Array.isArray(v) && v.includes('mt5')));
});

test('lease with no platform filter still means mt5, so a stale agent keeps working', () => {
  // The Windows agent will not send `platforms` when this deploys, and that box is
  // stopped most of the time — it may be weeks before it is updated.
  const q = leaseQuery('sync-01', 1, 600000);
  assert.ok(q.values.some((v) => Array.isArray(v) && v.includes('mt5')));
});

test('requestedPlatforms defaults to mt5 for every shape of missing input', () => {
  for (const body of [undefined, {}, { platforms: null }, { platforms: [] }, { platforms: 'mt5' }]) {
    assert.deepEqual(requestedPlatforms(body), ['mt5'], `bad default for ${JSON.stringify(body)}`);
  }
});

test('requestedPlatforms accepts known ids and silently drops unknown ones', () => {
  assert.deepEqual(requestedPlatforms({ platforms: ['mt5', 'tradelocker'] }), ['mt5', 'tradelocker']);
  assert.deepEqual(requestedPlatforms({ platforms: ['mt5', 'nonsense'] }), ['mt5']);
  // All-unknown falls back rather than returning [] — an empty ANY() array would
  // match nothing and the worker would idle forever with no error.
  assert.deepEqual(requestedPlatforms({ platforms: ['nonsense'] }), ['mt5']);
});

test('requestedPlatforms is bounded and de-duplicated', () => {
  assert.deepEqual(requestedPlatforms({ platforms: ['mt5', 'mt5'] }), ['mt5']);
  assert.ok(requestedPlatforms({ platforms: Array(500).fill('mt5') }).length <= 10);
});

test('the lease route passes the worker filter through', () => {
  const src = readFileSync(new URL('../src/routes/sync.js', import.meta.url), 'utf8');
  assert.ok(src.includes('requestedPlatforms'), 'the route ignores the worker platform filter');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/sync-platform.test.js`
Expected: FAIL — `requestedPlatforms is not exported`.

- [ ] **Step 3: Update the queue**

In `src/domain/sync/queue.js`, add the import and replace the three query builders:

```js
import { PLATFORM_IDS } from './platforms.js';
```

```js
/**
 * Queue one account. The platform is READ OFF THE ACCOUNT rather than passed in:
 * mt5_accounts is the only authority for it, and a caller that guessed wrong would
 * file the job on a fleet that cannot run it.
 *
 * The ON CONFLICT clause is the entire anti-pileup mechanism (the partial unique
 * index from 0025) — pressing "Sync now" twice must insert nothing, not build a
 * backlog the worker then grinds through serially.
 */
export function enqueueQuery(accountId, reason = 'manual') {
  return {
    text: `INSERT INTO sync_jobs (account_id, reason, platform)
           SELECT a.id, $2, a.platform FROM mt5_accounts a WHERE a.id = $1
           ON CONFLICT (account_id) WHERE status IN ('queued', 'leased') DO NOTHING
           RETURNING id, account_id, status, reason, run_after, platform;`,
    values: [accountId, reason],
  };
}
```

In `dueAccountsQuery`, add `platform` to the column list and `a.platform` to the SELECT:

```js
    text: `INSERT INTO sync_jobs (account_id, reason, platform)
           SELECT a.id,
                  CASE WHEN c.verified_at IS NULL THEN 'first_sync' ELSE 'schedule' END,
                  a.platform
             FROM mt5_accounts a
             JOIN mt5_credentials c ON c.account_id = a.id
```

(the rest of that statement is unchanged, and its `RETURNING` gains `, platform`)

In `leaseQuery`, add the fourth parameter and the predicate:

```js
export function leaseQuery(workerId, limit = 1, leaseMs = LEASE_MS, platforms = ['mt5']) {
  return {
    text: `WITH picked AS (
             SELECT id FROM sync_jobs
              WHERE status = 'queued' AND run_after <= now() AND platform = ANY($4)
              ORDER BY run_after, id
              FOR UPDATE SKIP LOCKED
              LIMIT $2
           )
           UPDATE sync_jobs j
              SET status = 'leased',
                  leased_by = $1,
                  leased_at = now(),
                  lease_expires_at = now() + make_interval(secs => $3),
                  attempts = j.attempts + 1
             FROM picked
            WHERE j.id = picked.id
          RETURNING j.id, j.account_id, j.reason, j.attempts, j.platform;`,
    values: [workerId, limit, Math.round(leaseMs / 1000), platforms],
  };
}
```

Add the normalizer beside it:

```js
/**
 * Which platforms is this worker claiming it can run?
 *
 * ABSENT MEANS MT5, deliberately. The Windows agent will not send this field when
 * the change deploys, and that box is stopped most of the time — so it may be weeks
 * before it is updated. Defaulting to MT5 keeps the only worker we have working
 * untouched.
 *
 * An all-unknown list also falls back to MT5 rather than returning []: `= ANY('{}')`
 * matches no rows, so an empty list would leave the worker polling forever with no
 * error anywhere — the exact silent-stop failure mode the heartbeat exists to catch.
 */
export function requestedPlatforms(body) {
  const raw = Array.isArray(body?.platforms) ? body.platforms : [];
  const known = [...new Set(raw.map(String).filter((p) => PLATFORM_IDS.includes(p)))].slice(0, 10);
  return known.length ? known : ['mt5'];
}
```

Finally update the thin runner so the argument reaches the builder:

```js
export const leaseJobs = (workerId, limit, leaseMs, platforms) =>
  run(leaseQuery(workerId, limit, leaseMs, platforms));
```

- [ ] **Step 4: Pass the filter from the route**

In `src/routes/sync.js`, add `requestedPlatforms` to the existing import from `../domain/sync/queue.js`, then in the `/api/sync/lease` handler replace the lease call:

```js
    const leased = await leaseJobs(workerId, limit, undefined, requestedPlatforms(body));
```

- [ ] **Step 5: Run the tests to verify they pass**

Fix the `require` note from Step 1 first (use a top-level `readFileSync` import).

Run: `node --test test/sync-platform.test.js`
Expected: PASS, 9 tests.

Then `npm test` — expected: all green, including the existing `test/` suites that cover the queue.

- [ ] **Step 6: Verify the queue still works end to end**

The lease endpoint is the one call that exercises worker auth, `credentialsEnabled()`, the queue tables and the whole route chain at once — a 503 means the key never loaded, a 401 means the token did not:

```bash
curl -s -X POST http://localhost:3000/api/sync/lease \
  -H "Authorization: Bearer $SYNC_WORKER_TOKEN" -H 'Content-Type: application/json' \
  -d '{"worker_id":"local-test","platforms":["mt5"]}' | jq
```

Expected: `200` with `{"jobs":[...],"housekeeping":{...}}`.

Then prove the filter actually excludes: send a platform we have no jobs for and confirm an empty list.

```bash
curl -s -X POST http://localhost:3000/api/sync/lease \
  -H "Authorization: Bearer $SYNC_WORKER_TOKEN" -H 'Content-Type: application/json' \
  -d '{"worker_id":"local-test","platforms":["tradelocker"]}' | jq '.jobs | length'
```

Expected: `0`. Afterwards delete the phantom worker row, or it reads as a live worker in the UI:

```bash
psql "$DATABASE_URL" -c "DELETE FROM sync_workers WHERE worker_id = 'local-test';"
```

- [ ] **Step 7: Commit**

```bash
git add src/domain/sync/queue.js src/routes/sync.js test/sync-platform.test.js
git commit -m "$(cat <<'MSG'
Stamp jobs with a platform and let a worker lease only what it can run

MT5 needs the Windows box and its portable terminals; cTrader and TradeLocker will
be plain Linux workers. Without a filter the first Linux worker deployed leases
MT5 jobs it cannot execute and burns their retry budget doing it.

The platform is read off the account inside the INSERT rather than passed in --
mt5_accounts is the only authority, and a caller that guessed wrong would file a
job on a fleet that cannot run it.

Two defaults are load-bearing. An absent platform filter means mt5, because the
Windows agent will not send the field when this deploys and that box is stopped
most of the time, so it may be weeks before it is updated. And an all-unknown
list falls back to mt5 rather than returning [] -- `= ANY('{}')` matches no rows,
so an empty list would leave a worker polling forever with no error anywhere,
which is exactly the silent-stop failure the heartbeat exists to catch.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Done-when

Phase A is complete when all of the following hold:

1. `npm test` is green and `cd frontend && npm run build` succeeds.
2. `npm run db:migrate` applies `0026` cleanly, and the CHECK constraint demonstrably rejects `import_method='auto_sync'` on a `kind='manual'` row.
3. `POST /api/accounts/provision` creates: a prop + Auto Sync account with a challenge on the selected phase, a credential and a queued `first_sync`; a prop + EA account with a challenge, an ingest token and no credential; a live + manual account with **no challenge row**.
4. A second POST with the same `provision_key` returns `200` and the same account id, not a second account.
5. A live account appears in the account switcher and in Settings › Accounts (typed "Live capital"), and appears **nowhere** in Prop OS.
6. `POST /api/sync/lease` returns 200 for `platforms: ["mt5"]` and an empty job list for `platforms: ["tradelocker"]`.
7. Every `verified: false` product in `propFirms.js` has either been confirmed against the firm or is called out as unconfirmed in the PR description.

## Not in this plan

- The eleven wizard pages, `newAccountFlow.js`, the draft context and the onboarding swap — **Phase B**.
- The Auto Sync rename in `SyncModal`/`SettingsAccounts`/`sync.js` copy, and extracting `ImportTradesModal`'s dry-run logic for the upload page — **Phase C**.
- cTrader (P3) and TradeLocker (P2) connectors.
