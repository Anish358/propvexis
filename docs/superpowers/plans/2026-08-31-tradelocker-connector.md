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

## Task 7: The worker — DEFERRED, gated on a demo account

Auth needs a real email, password and server against a real broker server. Without one, the auth flow, the hourly JWT refresh, `/trade/config` fetching, discovery, `accNum` mapping, backfill paging and the `/state` reconciliation would all be written blind.

**Unblocks when:** the §3 decision is (a) or (c), the Developer Program key is issued, and a TradeLocker demo account exists.

**Scope when unblocked:** extend the shared connector worker with a TradeLocker driver — `auth.js` (token + refresh + re-auth from stored password), `discover.js` (`/auth/jwt/all-accounts` → `accountId` + `accNum` + live/demo), `backfill.js` (newest-first 30-day windows, `hasMore`, two consecutive empty windows terminate), `reconcile.js` (**prove computed P&L against `/trade/accounts/{id}/state` before anything else in this task**).

> Spec §13.2 names the P&L reconciliation as the largest technical risk in the
> connector. It is the **first** thing to prove here — before the wizard, before
> the catalog flip. If computed money does not reconcile on a real account, the
> connector is not shippable and everything after this task is wasted.

---

## Task 8: Wizard consent gate and catalog flip — DEFERRED

Depends on Task 7 **and** on the P&L reconciliation passing.

**Scope when unblocked:** the §3 option (a) consent gate rendered before the password field — a real gate, not a sentence — then both catalog entries flipped together. Design-language rules apply: shadcn Base Rhea, structure is a locked invariant, and any caller-supplied dimension is a **prop, not a class**.

---

## Self-Review

**Spec coverage:** §3 → the blocking gate + Task 5's note + Task 8. §4 → Task 7. §4.1 → the P2b prerequisite. §5 → Task 2. §5.1 → Task 2's `tl_acc_num`. §6 → Task 4. §6.1 → Task 4's null-not-approximate test + Task 7's reconciliation. §6.2 → Task 4's partial-close test. §7 → Task 3. §8 → Task 7. §9 landmines → 1: Task 6, 2: Task 2, 3: Task 3, 4: Task 3, 5: Tasks 4+7, 6: P2b, 7: Task 7. §10 → Tasks 5+8. §11 → throughout.

**Gap accepted knowingly:** §8's token lifecycle and all live behaviour sit in Task 7, unimplementable without a demo account — recorded rather than faked.

**Type consistency:** `buildResolver`/`num`/`int`/`str` (Task 3) are the names Task 4 consumes. `TRADELOCKER_LOGIN_BASE`/`toTradeLockerLogin`/`fromTradeLockerLogin` (Task 1) are what Tasks 4 and 7 use. `pairOrders({ rows, resolver, instrument, bandedLogin })` returning `{ trades, unpaired }` (Task 4) is what Task 7's backfill consumes.
