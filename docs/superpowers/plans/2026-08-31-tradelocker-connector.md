# TradeLocker Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add TradeLocker as PropVexis's third Auto Sync platform — polled over plain HTTPS, with completed trades reconstructed from order history.

**Architecture:** A polling worker leasing from the existing sync queue, sharing the cTrader worker's process. Credentials reuse `mt5_credentials`. Trades are assembled by pairing filled orders on `positionId`, with every field resolved by name from `/trade/config` rather than by array index.

**Tech Stack:** Node 22 ESM, Fastify 5, `pg`, node:test. TradeLocker Public API (REST + JWT).

**Spec:** `docs/superpowers/specs/2026-08-31-tradelocker-connector-design.md` — read it first, especially §3 and §6.

> ## ⛔ BLOCKED BEFORE TASK 1
>
> **Spec §3 is an unresolved product decision.** TradeLocker authenticates with the
> trader's real, trade-capable password — there is no investor password, no OAuth,
> no scope. Under spec option **(b)** none of this plan gets built.
>
> **Do not start Task 1 until the owner has chosen (a), (b) or (c).** Every task
> below assumes **(a)**.

## Global Constraints

- Node >= 22, ESM only. Route modules **called** on the root app, never `app.register()`-ed.
- SQL lives in pure exported builders returning `{ text, values }`, thin async wrappers below.
- **Never index an API response array by a hardcoded number.** Every field resolves by name from `/trade/config`.
- **Every number arrives as a string.** `""` means null, never zero.
- **TradeLocker login band:** `5_000_000_000_000`.
- Base URLs: `https://live.tradelocker.com/backend-api/`, `https://demo.tradelocker.com/backend-api/`.
- Every `/trade/*` request needs the **`accNum` header** as well as `accountId` in the path.
- **The connector module exposes no order-placing function.** We hold a trade-capable credential and must be structurally unable to trade with it.
- TradeLocker stays `enabled: false` / `status: 'soon'` in both catalogs until a real account has synced **and** its P&L has reconciled against `/state`.
- Tests: `npm test`. Commit messages end with the `Co-Authored-By` line.

---

## File Structure

**New:**
| File | Responsibility |
|---|---|
| `db/migrations/0030_tradelocker.sql` | `login_email` on credentials; `tl_account_id` / `tl_acc_num` on accounts |
| `src/domain/sync/connectors/tradelocker/columns.js` | Config-driven column resolution and typed parsing |
| `src/domain/sync/connectors/tradelocker/pairing.js` | Filled orders → completed trades |
| `src/domain/sync/connectors/tradelocker/index.js` | The connector descriptor; credential validation |
| `test/tradelocker-*.test.js` | One per module above |
| `test/fixtures/tradelocker/*.json` | Captured real payloads |

**Modified:** `src/domain/sync/logins.js` (the 5e12 band), `src/domain/sync/platforms.js` (credential fields + note), `src/domain/sync/queue.js` (the `read_only` filter), `src/domain/sync/connectors/index.js` (registry).

---

## Task 1: The TradeLocker login band

**Files:** Modify `src/domain/sync/logins.js` · Test `test/login-band.test.js`

**Interfaces:** Produces `TRADELOCKER_LOGIN_BASE`, extends `platformOfLogin` to return `'tradelocker'`.

- [ ] **Step 1: Write the failing test**

```js
test('TradeLocker occupies its own band, disjoint from cTrader and MetaTrader', () => {
  assert.equal(TRADELOCKER_LOGIN_BASE, 5_000_000_000_000);
  assert.equal(platformOfLogin(toTradeLockerLogin(4242)), 'tradelocker');
  assert.equal(fromTradeLockerLogin(toTradeLockerLogin(4242)), 4242);
  // The bands must not overlap: a cTrader id large enough to reach 5e12 would
  // otherwise be read back as a TradeLocker account.
  assert.equal(platformOfLogin(4_000_314_943_467), 'ctrader');
  assert.equal(platformOfLogin(5_000_000_004_242), 'tradelocker');
});
```

- [ ] **Step 2: Run it, confirm it fails** — `node --test test/login-band.test.js`, expect "TRADELOCKER_LOGIN_BASE is not defined".

- [ ] **Step 3: Implement**

```js
export const TRADELOCKER_LOGIN_BASE = 5_000_000_000_000;
export const toTradeLockerLogin = (tlAccountId) => TRADELOCKER_LOGIN_BASE + Number(tlAccountId);
export const fromTradeLockerLogin = (login) => Number(login) - TRADELOCKER_LOGIN_BASE;
```

And in `platformOfLogin`, **order matters** — test the highest band first:

```js
  if (n >= TRADELOCKER_LOGIN_BASE) return 'tradelocker';
  if (n >= CTRADER_LOGIN_BASE) return 'ctrader';
```

Reversing those two lines silently reports every TradeLocker account as cTrader, because `5e12 >= 4e12`. The test above covers it.

- [ ] **Step 4: Run, confirm pass. Step 5: Commit.**

---

## Task 2: Migration 0030

**Files:** Create `db/migrations/0030_tradelocker.sql` · Test `test/tradelocker-migration.test.js`

- [ ] **Step 1: Write the failing test**

```js
test('0030 adds the login email and the two TradeLocker account identifiers', () => {
  assert.match(sql, /ALTER TABLE mt5_credentials[\s\S]*login_email\s+TEXT/);
  assert.match(sql, /tl_account_id\s+BIGINT/);
  assert.match(sql, /tl_acc_num\s+INTEGER/);
});

test('0030 is re-runnable', () => {
  for (const st of sql.split(';').map((x) => x.trim()).filter((x) => /^(CREATE|ALTER)/i.test(x))) {
    assert.match(st, /IF NOT EXISTS/i, `not re-runnable: ${st.slice(0, 60)}`);
  }
});
```

- [ ] **Step 2: Run it, confirm it fails.**

- [ ] **Step 3: Write the migration**

```sql
-- TradeLocker: what mt5_credentials could not say, and the second identifier
-- every /trade request needs.
--
-- REUSING mt5_credentials IS DELIBERATE. TradeLocker's credential is a password
-- against a server -- the same shape MT5's is -- so a second credential table
-- would be the same five columns under a different name. cTrader got its own
-- table because an OAuth token pair at cTID grain genuinely is not this shape.
--
-- read_only WILL BE FALSE FOR EVERY TRADELOCKER ROW, and truthfully: the
-- credential can trade, because TradeLocker offers no read-only alternative.
-- That changes what the column means per platform, and queue.js must be narrowed
-- accordingly or no TradeLocker account is ever scheduled. See 0030's test.
ALTER TABLE mt5_credentials ADD COLUMN IF NOT EXISTS login_email TEXT;

-- accNum is NOT accountId. accountId is the multi-digit id in the URL path;
-- accNum is a small ordinal (usually one digit) sent as a HEADER saying which of
-- the login's accounts is meant. Sending the wrong accNum returns ANOTHER OF THE
-- SAME TRADER'S ACCOUNTS with a 200 and no error, so both are stored rather than
-- either being recomputed at call time.
ALTER TABLE mt5_accounts
    ADD COLUMN IF NOT EXISTS tl_account_id BIGINT,
    ADD COLUMN IF NOT EXISTS tl_acc_num    INTEGER;
```

- [ ] **Step 4: Run the test. Step 5: Run `npm run db:migrate`, then run it AGAIN** and confirm "no pending migrations".

> Running the migration is not optional. 0029 shipped a broken column name to the
> dev box precisely because its test asserted on SQL text and nothing executed it.

- [ ] **Step 6: Commit.**

---

## Task 3: Config-driven column resolution

The defence against spec landmine 3. Pure, no network.

**Files:** Create `src/domain/sync/connectors/tradelocker/columns.js`, `test/fixtures/tradelocker/config.json` · Test `test/tradelocker-columns.test.js`

**Interfaces:** Produces `buildResolver(config, section)` → `{ get(row, name), has(name) }`, plus `num(v)`, `int(v)`, `str(v)`.

- [ ] **Step 1: Write the failing test**

```js
import { buildResolver, num, int, str } from '../src/domain/sync/connectors/tradelocker/columns.js';

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

test('an empty string is null, never zero', () => {
  // Number('') === 0. Writing a real trade with zero commission because the
  // broker sent "" is a silent money error.
  assert.equal(num(''), null);
  assert.equal(num(null), null);
  assert.equal(num('-0.7'), -0.7);
  assert.equal(int(''), null);
  assert.equal(int('9001'), 9001);
  assert.equal(str(''), null);
});
```

- [ ] **Step 2: Run it, confirm it fails.**

- [ ] **Step 3: Implement**

```js
// TradeLocker returns rows as POSITIONAL ARRAYS OF STRINGS. The meaning of each
// index is published at GET /trade/config, per section, and is TradeLocker's to
// change. Resolving by index is therefore not a shortcut, it is a latent
// corruption: a shifted column moves commission into price and every trade is
// wrong with no error anywhere.
//
// This module is the only place that is allowed to know an index exists.

const SECTIONS = {
  ordersHistory: 'ordersHistoryConfig',
  orders: 'ordersConfig',
  positions: 'positionsConfig',
  filledOrders: 'filledOrdersConfig',
  accountDetails: 'accountDetailsConfig',
};

export function buildResolver(config, section) {
  const key = SECTIONS[section];
  if (!key) throw new Error(`tradelocker: unknown config section '${section}'`);
  const columns = config?.d?.[key]?.columns;
  if (!Array.isArray(columns) || !columns.length) {
    throw new Error(`tradelocker: /trade/config has no ${key}`);
  }
  const index = new Map(columns.map((c, i) => [c.id, i]));
  return {
    has: (name) => index.has(name),
    get(row, name) {
      if (!index.has(name)) {
        // Loud, not undefined: a field we cannot find is a schema change we must
        // notice, not a null to carry into a trade.
        throw new Error(`tradelocker: no '${name}' column in ${key}`);
      }
      return row[index.get(name)];
    },
  };
}

/** '' is NULL, not zero — Number('') is 0 and would post a real trade with a fake value. */
export const num = (v) => (v === '' || v == null ? null : Number(v));
export const int = (v) => (v === '' || v == null ? null : parseInt(v, 10));
export const str = (v) => (v === '' || v == null ? null : String(v));
```

- [ ] **Step 4: Run, confirm pass. Step 5: Commit.**

---

## Task 4: Pairing orders into trades

The core of the connector. Pure.

**Files:** Create `src/domain/sync/connectors/tradelocker/pairing.js` · Test `test/tradelocker-pairing.test.js`

**Interfaces:** Consumes Task 3. Produces `pairOrders({ rows, resolver, instrument, bandedLogin })` → `{ trades: [...], unpaired: [...] }`.

- [ ] **Step 1: Write the failing test**

```js
const resolver = buildResolver(CONFIG, 'ordersHistory');
const order = (id, positionId, side, qty, price, ms, commission = '0') =>
  ['' + id, '278', qty, side, 'Filled', qty, price, commission, '' + positionId, '' + ms, '' + ms];

test('an open and a close on one positionId become one trade', () => {
  const { trades } = pairOrders({
    rows: [order(1, 9001, 'buy', '1', '1.0900', 1_756_000_000_000),
           order(2, 9001, 'sell', '1', '1.0925', 1_756_000_050_000, '-0.7')],
    resolver, instrument: { contractSize: 100000, quoteCurrency: 'USD', depositCurrency: 'USD' },
    bandedLogin: 5_000_000_004_242,
  });
  assert.equal(trades.length, 1);
  assert.equal(trades[0].mt5_ticket, 2, 'keyed on the CLOSING order');
  assert.equal(trades[0].direction, 'buy', 'direction comes from the OPENING order');
  assert.equal(trades[0].entry_price, 1.09);
  assert.equal(trades[0].exit_price, 1.0925);
  assert.equal(trades[0].account_id, 5_000_000_004_242);
});

test('a partial close is its own trade, keyed on its own closing order', () => {
  // Keying on positionId would make each partial close rewrite the previous row,
  // showing one trade where the trader took two.
  const { trades } = pairOrders({
    rows: [order(1, 9001, 'buy', '2', '1.0900', 1_756_000_000_000),
           order(2, 9001, 'sell', '1', '1.0925', 1_756_000_050_000),
           order(3, 9001, 'sell', '1', '1.0950', 1_756_000_090_000)],
    resolver, instrument: { contractSize: 100000, quoteCurrency: 'USD', depositCurrency: 'USD' },
    bandedLogin: 1,
  });
  assert.equal(trades.length, 2);
  assert.deepEqual(trades.map((t) => t.mt5_ticket), [2, 3]);
});

test('a position still open produces no trade, and is reported as unpaired', () => {
  // Silently dropping it would be indistinguishable from a bug; the caller needs
  // to know the difference between "nothing closed" and "we lost something".
  const { trades, unpaired } = pairOrders({
    rows: [order(1, 9001, 'buy', '1', '1.0900', 1_756_000_000_000)],
    resolver, instrument: { contractSize: 100000, quoteCurrency: 'USD', depositCurrency: 'USD' },
    bandedLogin: 1,
  });
  assert.equal(trades.length, 0);
  assert.deepEqual(unpaired, [9001]);
});

test('a close whose open is outside the window is reported, not guessed', () => {
  // The opening order can sit in an earlier page. Inventing an entry price would
  // write a plausible wrong trade; reporting it lets the caller widen the window.
  const { trades, unpaired } = pairOrders({
    rows: [order(2, 9001, 'sell', '1', '1.0925', 1_756_000_050_000)],
    resolver, instrument: { contractSize: 100000, quoteCurrency: 'USD', depositCurrency: 'USD' },
    bandedLogin: 1,
  });
  assert.equal(trades.length, 0);
  assert.deepEqual(unpaired, [9001]);
});

test('P&L is NULL when the instrument cannot price it, never approximated', () => {
  // A missing number surfaces in the UI. A plausible wrong one does not, and
  // fixed_r and every prop-rule breach decision derive from this field.
  const { trades } = pairOrders({
    rows: [order(1, 9001, 'buy', '1', '1.0900', 1_756_000_000_000),
           order(2, 9001, 'sell', '1', '1.0925', 1_756_000_050_000)],
    resolver, instrument: { contractSize: null, quoteCurrency: 'JPY', depositCurrency: 'USD' },
    bandedLogin: 1,
  });
  assert.equal(trades[0].pnl_money, null);
  assert.equal(trades[0].exit_price, 1.0925, 'the trade still lands — only the money is unknown');
});
```

- [ ] **Step 2: Run it, confirm it fails.**

- [ ] **Step 3: Implement.** Group filled rows by `positionId`; the earliest by
  `createdDate` is the opener and supplies `direction`, `entry_price`, `open_time`;
  every later fill on the opposite side is a closing fill and yields one trade
  keyed on its own order id. A group with no opener, or with no closer, contributes
  its `positionId` to `unpaired` and no trade.

  Money: `(exit - entry) × qty × contractSize × sign` plus commission, **only when**
  `contractSize` is known and `quoteCurrency === depositCurrency`. Otherwise
  `pnl_money = null`. Do not add FX conversion in this task — an unconverted
  approximation is exactly the failure the last test forbids.

- [ ] **Step 4: Run, confirm all five pass. Step 5: Commit.**

---

## Task 5: The connector descriptor and registry

**Files:** Create `src/domain/sync/connectors/tradelocker/index.js` · Modify `src/domain/sync/connectors/index.js`, `src/domain/sync/platforms.js`, `frontend/src/features/accounts/platformCatalog.js` · Test `test/tradelocker-connector.test.js`, `test/connectors.test.js`, `test/platforms.test.js`

- [ ] **Step 1: Write the failing test**

```js
test('the credential requires email, server and password', () => {
  const r = tradelockerConnector.validateCredential({
    email: '  a@b.com ', server: ' OSP-DEMO ', password: 'pw',
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { email: 'a@b.com', server: 'OSP-DEMO', password: 'pw' });
  assert.equal(tradelockerConnector.validateCredential({ email: 'a@b.com', server: 'S' }).ok, false);
});

test('POLICY PIN: the connector cannot place an order', () => {
  // Under spec option (a) we hold a TRADE-CAPABLE credential. Being unable to
  // trade must be structural, not a promise: there is no function to call.
  const surface = JSON.stringify(Object.keys(tradelockerConnector));
  for (const forbidden of ['placeOrder', 'createOrder', 'closePosition', 'modifyOrder', 'cancelOrder']) {
    assert.ok(!surface.includes(forbidden), `${forbidden} must not exist on the connector`);
  }
});

test('the platform states plainly that the credential can trade', () => {
  // MT5's note promises a trade-capable password is REJECTED. Inheriting that
  // copy here would be a false security claim, which is why the note lives on
  // the descriptor and not in a shared page.
  const tl = findPlatform('tradelocker');
  assert.ok(tl.credentialNote && /trade/i.test(tl.credentialNote));
  assert.notEqual(tl.credentialNote, findPlatform('mt5').credentialNote);
});
```

- [ ] **Step 2: Run it, confirm it fails.**

- [ ] **Step 3: Implement.** Add the descriptor with `validateCredential`, register it under `tradelocker` in the registry, and fill `credentialFields` (email / server / password) plus a `credentialNote` stating the credential can place trades, that it is stored encrypted, and that PropVexis only reads with it.

  **`enabled` stays `false` and `status` stays `'soon'`** in both catalogs. `test/platform-catalog.test.js` fails if only one side moves.

- [ ] **Step 4: Run `npm test`. Step 5: Commit.**

---

## Task 6: Let TradeLocker accounts actually be scheduled — ✅ DONE 2026-08-31

> **Landed early**, in the cTrader branch, because the same commit moved the sync
> cadence to 3 hours and the two touch the same predicate. `dueAccountsQuery` now
> reads `AND (a.platform <> 'mt5' OR c.read_only IS NOT FALSE)`, and
> `POST /api/accounts/:id/sync` scopes its matching refusal the same way, so Sync now
> is not permanently unusable on a platform with no read-only credential.
>
> Pinned by *"the read_only rule is scoped to MT5, the only platform it is about"*
> in `test/sync-queue.test.js`. **Nothing to do here — verify and move on.**
>
> The cadence and the 15-minute manual cooldown this connector's scaling story
> depends on (spec §8) also shipped in that commit: `PLATFORM_SYNC_INTERVAL_MS`,
> `manualCooldown()`, and a 429 with `Retry-After`.

### Original task, for reference

Spec landmine 1 — the one most likely to ship broken and silent.

**Files:** Modify `src/domain/sync/queue.js` · Test `test/sync-queue.test.js`

- [ ] **Step 1: Write the failing test**

```js
test('a TradeLocker account is scheduled even though its credential CAN trade', () => {
  /* THE BUG THIS CATCHES. dueAccountsQuery filters `c.read_only IS NOT FALSE`,
   * which means "never log in again with a master password" — correct for MT5,
   * where read_only = FALSE is a credential awaiting deletion. Every TradeLocker
   * credential is legitimately read_only = FALSE, because the platform offers no
   * read-only alternative. Left as-is, no TradeLocker account is EVER queued:
   * no error, no failed job, no row anywhere — the account simply never syncs. */
  const q = dueAccountsQuery();
  assert.match(q.text, /a\.platform/,
    'the read_only rule must be scoped to the platform it is about');
  assert.doesNotMatch(q.text.replace(/\s+/g, ' '), /c\.read_only IS NOT FALSE\s+AND NOT EXISTS/,
    'an unscoped read_only filter silently excludes every TradeLocker account');
});
```

- [ ] **Step 2: Run it, confirm it fails.**

- [ ] **Step 3: Implement** — narrow the predicate to the platform it is about:

```sql
              AND (a.platform <> 'mt5' OR c.read_only IS NOT FALSE)
```

with a comment explaining that `read_only = FALSE` means "delete this" on MT5 and "this is simply what TradeLocker gives you" elsewhere.

- [ ] **Step 4: Run `npm test`. Step 5: Commit.**

---

## Task 7: The worker and its backend wiring — UNBLOCKED 2026-09-09

A real TradeLocker demo account now exists (email/server/password supplied out of
band — **never write them into a file, fixture, or commit; read them from
process env only, e.g. `TL_TEST_EMAIL`/`TL_TEST_PASSWORD`/`TL_TEST_SERVER`** set
in a gitignored local shell profile or exported inline for a single test run).

### 7.0 What already exists and must be reused, not rebuilt

Before writing anything, read these — they answer questions the original plan
text left open:

- `src/domain/accounts/provision.js` — a TradeLocker account is created **pending**
  (`mt5_login = NULL`, since `loginFromCredential` returns null for a credential
  with no `.login`). Nothing in Task 7 provisions an account; that already works.
- `src/domain/accounts/accounts.js` `bindOrCheckLogin` — a pending account's login
  is bound the moment its **first ingested trade** carries `account_id` = the
  banded login, via `x-ingest-token`. This is the SAME mechanism the MT5 EA and
  the cTrader worker both use. **Task 7 does not need a bespoke discovery/binding
  route.** The worker just needs to call `/api/trades/ingest/batch` with
  `account_id: toTradeLockerLogin(accountId)` once it knows the account, and
  binding happens for free.
- `src/domain/sync/queue.js` `splitJobsByPlatform` already buckets a `tradelocker`
  key — **nothing currently drains it.** A TradeLocker job leases today and spins
  forever, silently, exactly the failure `ctraderLeasedPayloadQuery`'s own header
  warns about. Closing this is Task 7's first backend change.
- `worker/ctrader/api.js` `PropVexisApi` (`lease`, `report`, `heartbeat`, `ingest`)
  is already generic enough to reuse for TradeLocker jobs — only `lease()`'s
  hardcoded `platforms: ['ctrader']` needs to become configurable.
- `worker/ctrader/backfill.js` and `windows.js` show the newest-first windowed
  backfill pattern (`backfillWindows`, `advanceCursor`) to mirror, not the API
  calls themselves (TradeLocker is REST, not protobuf).
- `src/domain/sync/connectors/tradelocker/index.js` (`tradelockerConnector`)
  already exports `toBandedLogin`, `hosts.{live,demo}`, `buildResolver`,
  `pairOrders`, `assertFields` — the worker imports these directly (worker code
  already imports `src/domain/...` by relative path; see `worker/ctrader/backfill.js`).
- `ecosystem.config.cjs` `ctraderWorker()` builds the `amey-ctrader` /
  `amey-ctrader-dev` pm2 apps running `worker/ctrader/main.js`, `instances: 1`,
  `fork`. Spec §4 says share this process rather than run a second one on a
  911MB box. **Ruling: do not add a new pm2 app or rename the existing ones** —
  extend `worker/ctrader/index.js`'s `Worker` class (or a thin wrapper `main.js`
  loads) so one process leases `platforms: ['ctrader', 'tradelocker']` in the
  same call and dispatches each leased job by `job.platform`. No new deploy/SSM
  wiring is needed for this task.

### 7.1 Two gaps the spec left open — ruled here, not guessed at implementation time

**Ruling A — a login exposing more than one TradeLocker account.** §5 says one
login can expose several accounts, but nothing says how a single pending
`mt5_accounts` row (one credential, no account-picker step, unlike cTrader)
should choose among them. **Decision: `/auth/jwt/all-accounts` must return
exactly one account for the job to proceed.** More than one fails the job with
`'This TradeLocker login has more than one account — Auto Sync supports one
account per login today'` and records it as the credential's `last_error`
(reuse `markError`, same as an MT5 credential failure). This is conservative and
correct for the account we have to prove against (one demo account); revisit
with a picker step only if a real trader hits it.

**Ruling B — demo vs. live host.** §9 landmine 7 says the two are different hosts,
"decided once at discovery and stored" — but nothing decides it, since there is
no explicit demo/live toggle in the wizard (unlike cTrader, which learns this at
OAuth callback). **Decision: on an account's first successful job, try
`TRADELOCKER_HOSTS.demo` first; if `/auth/jwt/token` 401s there, retry once
against `.live`.** Whichever host authenticates is written to
`mt5_accounts.is_live_env` (existing column, reused from 0029) and read directly
on every later job — never re-probed. One extra request, once per account, ever.

### 7.2 Backend changes

- **Migration:** none new — 0030 already has every column this needs.
- **`src/domain/sync/queue.js`:** add `tradelockerLeasedPayloadQuery(jobIds, lookbackMs)`,
  shaped like `ctraderLeasedPayloadQuery` but `JOIN mt5_credentials c ON c.account_id = a.id`
  (TradeLocker has a credential row, unlike cTrader) and additionally selecting
  `c.login_email, c.password_ct, a.tl_account_id, a.tl_acc_num, a.is_live_env, j.cursor_at`.
  Add `leasedPayloads`-style export mirroring the existing `ctraderLeasedPayloads`.
- **`src/routes/sync.js` `/api/sync/lease`:** add a third block after the cTrader
  one, symmetric to it: decrypt `password_ct` with the existing `openPassword`
  (works unmodified — same AAD scheme as MT5), assemble
  `{ job_id, account_id, platform: 'tradelocker', login, email: row.login_email,
  server: row.server, password, tl_account_id, tl_acc_num, is_live_env,
  ingest_token, since, cursor_at, reason }`, and on decrypt failure `failJob` +
  `markError` exactly like the MT5 branch. A credential that fails to decrypt
  must fail loudly, never be skipped.
- **`src/routes/sync.js` `/api/sync/jobs/:id/result`:** the existing `b.read_only
  === false` branch must stay MT5-only (it already is — the TradeLocker worker
  must never send `read_only`, so this needs no new code, only a test proving it).
  Add handling so a TradeLocker result can report `tl_account_id`/`tl_acc_num` on
  first discovery (persist via a small `UPDATE mt5_accounts SET tl_account_id =
  $2, tl_acc_num = $3, is_live_env = $4 WHERE id = $1`). **No new `sync_jobs`
  column for the reconciliation delta** — `sync_jobs` has no `stats` column today
  and adding one is out of scope for making sync work; the worker logs the delta
  loudly (`log.error`/`log.info` with the account id and both numbers) and the
  route's response/error message is where a human finds it during Task 7's live
  verification. Revisit persisting it only if it needs to be user-visible later.
- **`worker/ctrader/api.js`:** make `lease(limit, platforms)` take the platforms
  array as a parameter (default `['ctrader']` to avoid touching call sites that
  don't need to change) rather than hardcoding it, so the shared worker can pass
  `['ctrader', 'tradelocker']`.

### 7.3 Worker (`worker/tradelocker/`)

Mirror `worker/ctrader/`'s file boundaries, HTTP not protobuf:

- **`auth.js`** — `login({ email, password, server, isLive })` → POST `/auth/jwt/token`
  on the resolved host, returns `{ accessToken, refreshToken }`. `refresh(token)` →
  POST `/auth/jwt/refresh`; on failure, the caller falls back to `login()` again
  from the stored password (spec §8 — this is the one advantage of holding a
  password over a token pair). JWT lifetime ~1h; the job runs every 3h, so
  **always authenticate fresh at the start of a job** rather than caching a token
  across jobs — simpler and the rate cost is one request per job.
- **`config.js`** — `GET /trade/config`, fetched once per **worker process start**
  (not per job — spec §7) and cached in memory; exposes the field-name arrays
  `buildResolver` (from the connector module) needs, plus per-route rate limits.
  If a required field name is missing, throw — never fall back to a positional
  index (Global Constraint, and `assertFields` from the connector module already
  enforces this; this module just has to call it and not swallow the throw).
- **`discover.js`** — `GET /auth/jwt/all-accounts` (bearer token) → apply Ruling A;
  return the single account's `{ accountId, accNum, live }` or throw the
  more-than-one error.
- **`backfill.js`** — newest-first 30-day windows via `ordersHistory?from&to`
  (Unix ms), paging on `hasMore` with the per-request row cap from `/trade/config`;
  two consecutive empty windows terminate (no `registrationTimestamp` equivalent
  to floor on). Pairs orders into trades via the connector's `pairOrders`, then
  posts via `PropVexisApi.ingest(ingestToken, trades)` in batches (reuse
  `splitBatch` from `src/domain/trades/batch.js`, same as cTrader's backfill).
- **`reconcile.js`** — **the first thing proven against the real demo account,
  before anything else in this task is trusted (spec §13.2).** After a sync,
  `GET /trade/accounts/{accountId}/state`, sum the job's computed `pnl_money`
  (excluding NULLs — a NULL is an honest abstention, not a zero), compare
  against the broker's own balance/P&L, and return the delta so the lease-result
  call can record it. **If the delta is non-trivial, do not silently accept it —
  surface it in the job's `stats` and log it loudly; do not fail the job over it
  yet (a first cut of this connector should be visible/debuggable, not silently
  refuse to sync), but this delta is what decides whether Task 8 is safe to do.**
- **`index.js`** (or extend `worker/ctrader/index.js`'s `Worker` class directly —
  implementer's call, whichever keeps the cTrader path untouched and easiest to
  read) — dispatches a leased job to the TradeLocker path when `job.platform ===
  'tradelocker'`, calling auth → discover (first job for the account only, i.e.
  `tl_account_id == null`) → backfill → reconcile → `report()`.

### 7.4 Testing

- **Unit, no network** (mirrors §11): `tradelockerLeasedPayloadQuery` shape;
  the lease route's TradeLocker branch (decrypt success/failure, job assembly);
  the more-than-one-account ruling; the demo/live fallback ruling; reconcile's
  delta math against fixture numbers.
- **Regression pin:** a TradeLocker job never reaches the `read_only === false`
  rejection branch of `/api/sync/jobs/:id/result`.
- **Live, against the real demo account (credentials from env, never committed):**
  run the shared worker locally against a local dev backend, add the account
  through the running app (or directly via `provisionAccount`), let a `first_sync`
  job run, and confirm: the account's `mt5_login` gets bound, trades appear in
  the journal, and the reconcile delta is at or near zero. **This is the proof
  spec §13.2 asks for, and it happens before Task 8, not during it.**

---

## Task 8: Wizard consent gate and catalog flip

The consent gate itself is **already built** (PR #115, 2026-09-01) —
`primitives/consent-field.jsx`, driven by the platform registry's
`credentialNote`/`credentialConsent`, submit disabled until ticked. Verify it
still renders correctly (a `.preview` harness screenshot is enough — no code
change expected here) rather than rebuilding it.

**Depends on Task 7's live reconciliation passing** — spec §13.2: flipping the
catalog before that is offering Auto Sync the team cannot stand behind.

**Scope:**
- `src/domain/sync/platforms.js` tradelocker entry: `connector: null` →
  `connector: 'tradelocker'`; `enabled: false` → `enabled: true`; `importMethods:
  ['file', 'manual']` → add `'auto_sync'`.
- `frontend/src/features/accounts/platformCatalog.js` tradelocker entry:
  `status: 'soon'` → `status: 'live'`; same `importMethods` addition so the two
  catalogs keep passing `test/platform-catalog.test.js`'s drift check.
- Re-run the full suite and the `.preview` harness on the Add Account wizard:
  platform card no longer badged Soon, ConnectStep's consent gate still gates
  submit, ctrader-accounts-style picker is **not** needed (TradeLocker has no
  picker step — provisioning already handles "pending until first sync binds
  it").

---

## Self-Review

**Spec coverage:** §3 → the blocking gate + Task 5's note + Task 8. §4 → Task 7. §4.1 → the P2b prerequisite. §5 → Task 2. §5.1 → Task 2's `tl_acc_num`. §6 → Task 4. §6.1 → Task 4's null-not-approximate test + Task 7's reconciliation. §6.2 → Task 4's partial-close test. §7 → Task 3. §8 → Task 7. §9 landmines → 1: Task 6, 2: Task 2, 3: Task 3, 4: Task 3, 5: Tasks 4+7, 6: P2b, 7: Task 7. §10 → Tasks 5+8. §11 → throughout.

**Gap accepted knowingly:** §8's token lifecycle and all live behaviour sit in Task 7, unimplementable without a demo account — recorded rather than faked.

**Type consistency:** `buildResolver`/`num`/`int`/`str` (Task 3) are the names Task 4 consumes. `TRADELOCKER_LOGIN_BASE`/`toTradeLockerLogin`/`fromTradeLockerLogin` (Task 1) are what Tasks 4 and 7 use. `pairOrders({ rows, resolver, instrument, bandedLogin })` returning `{ trades, unpaired }` (Task 4) is what Task 7's backfill consumes.
