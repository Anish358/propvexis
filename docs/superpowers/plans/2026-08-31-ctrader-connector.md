# cTrader Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cTrader as PropVexis's second Auto Sync platform — OAuth-connected, push-ingested, with full history backfill from account inception.

**Architecture:** A cTID-scoped OAuth identity holds sealed tokens; a separate leasing worker holds two protobuf sockets (live + demo) and posts trades through the existing ingest seam. cTrader account numbers live in a reserved numeric band so they cannot collide cross-tenant with MT5 logins. Push delivers freshness, periodic reconciliation delivers correctness.

**Tech Stack:** Node 22 ESM, Fastify 5, `pg`, node:test, AES-256-GCM via `node:crypto`, cTrader Open API (protobuf over TLS).

**Spec:** `docs/superpowers/specs/2026-08-30-ctrader-connector-design.md` — read it first. This plan argues from it and does not restate its reasoning.

## Global Constraints

- **Node >= 22**, ESM only (`"type": "module"`). No CommonJS.
- **Route modules are CALLED on the root app instance**, never `app.register()`-ed. Pinned by `test/routes-split.test.js`.
- **Never build a path by counting `..` from `import.meta.url`** — use `src/platform/paths.js`.
- **SQL lives in exported pure builders** returning `{ text, values }`, with thin async wrappers below. This is what makes queries assertable in CI without a database (`queue.js`, `statsSql.js` are the pattern).
- **Every monetary `int64` from cTrader scales by *that message's own* `moneyDigits`** — never a constant, never inherited from a sibling message. Volume and `lotSize` are both "in cents".
- **Scope is `accounts` (view only). Never request `trading`.**
- **Reserved login band:** `CTRADER_LOGIN_BASE = 4_000_000_000_000`.
- **Batch size:** 500 trades per ingest batch.
- **Reconcile interval:** 3 hours. Reconnect overlap: 15 minutes.
- **cTrader stays `enabled: false` / `status: 'soon'`** in both catalogs until a real account has completed a verified sync. Tasks 1–7 must produce **zero user-visible change**.
- Tests: `npm test` (`node --test test/*.test.js`). Add tests with each task.
- Commit messages end with the `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` line.

---

## File Structure

**New:**
| File | Responsibility |
|---|---|
| `db/migrations/0029_ctrader.sql` | Identity + discovery tables, account columns, `sync_jobs.cursor_at` |
| `src/domain/sync/logins.js` | The login band: banded ↔ real, and which platform a login belongs to |
| `src/domain/sync/connectors/ctrader.js` | Pure deal → trade mapping and unit scaling. No IO. |
| `src/domain/sync/ctraderIdentities.js` | Token sealing + identity/discovery query builders |
| `src/domain/sync/ctraderOauth.js` | `state` signing, grant URL, token exchange. Pure + one `fetch`. |
| `src/routes/ctrader.js` | The five HTTP routes |
| `test/ctrader-*.test.js` | One test file per module above |

**Modified:**
| File | Change |
|---|---|
| `src/routes/trades.js` | Add `POST /api/trades/ingest/batch` beside the single-trade route |
| `src/domain/sync/queue.js` | `discover` + `reconcile` job reasons; `cursor_at` in the payload |
| `src/platform/config.js` | `ctraderClientId`, `ctraderClientSecret`, `ctraderRedirectUri` |
| `src/app.js` | Call `ctraderRoutes(app)` |

**Deferred to a follow-up PR (see Tasks 8–9):** `worker/ctrader/`, the wizard branch, the catalog flip.

---

## Task 1: Batched trade ingest

Independent of everything cTrader. Ships value immediately — it also makes the MT5 farm's first sync dramatically faster. Do this first; it can merge alone.

**Files:**
- Modify: `src/routes/trades.js` (add a route beside `/api/trades/ingest`)
- Test: `test/ingest-batch.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `POST /api/trades/ingest/batch`, `x-ingest-token` auth, body `{ trades: [...] }`, response `{ ok, accepted, failed, results: [{ mt5_ticket, ok, error? }] }`.

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BATCH_LIMIT, splitBatch } from '../src/domain/trades/batch.js';

test('BATCH_LIMIT is 500 — sized in the spec against a ~250KB body', () => {
  assert.equal(BATCH_LIMIT, 500);
});

test('splitBatch chunks a long run into BATCH_LIMIT-sized pieces', () => {
  const trades = Array.from({ length: 1201 }, (_, i) => ({ mt5_ticket: i }));
  const chunks = splitBatch(trades);
  assert.equal(chunks.length, 3);
  assert.deepEqual(chunks.map((c) => c.length), [500, 500, 201]);
});

test('splitBatch returns nothing for an empty input rather than one empty chunk', () => {
  assert.deepEqual(splitBatch([]), []);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test test/ingest-batch.test.js`
Expected: FAIL — `Cannot find module '../src/domain/trades/batch.js'`

- [ ] **Step 3: Create the module**

```js
// src/domain/trades/batch.js
//
// How many trades one ingest request carries, and how a long backfill is cut
// into requests.
//
// 500 is chosen against the body, not the row count: a trade serializes to
// roughly 500 bytes of JSON, so a full batch is ~250KB — comfortably inside the
// route's limit with room for a fatter trade shape later. The MT5 agent posts
// one trade per request, which is fine for a 48-hour window and ruinous for a
// four-year cTrader backfill; this is the unit that fixes that.

export const BATCH_LIMIT = 500;

/** Cut a run of trades into request-sized chunks. Empty in, empty out. */
export function splitBatch(trades, limit = BATCH_LIMIT) {
  const out = [];
  for (let i = 0; i < trades.length; i += limit) out.push(trades.slice(i, i + limit));
  return out;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `node --test test/ingest-batch.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Extract the single-trade handler so the batch route cannot fork it**

In `src/routes/trades.js`, the body of `app.post('/api/trades/ingest', ...)` after the auth block becomes a local `async function ingestOne(acct, b, req)` returning `{ ok: true, trade }` or `{ ok: false, error }`. The existing route calls it and keeps its exact current response shape and status codes. **Do not change the single-trade route's contract** — the EA is compiled software in the field.

- [ ] **Step 6: Add the batch route**

```js
  // Batched sibling of /api/trades/ingest, same auth, same validation, same
  // upsert. Exists for backfills: a cTrader account with four years of history
  // is 20,000 trades, and 20,000 sequential POSTs against our own API on a 1GB
  // box is not a sync, it is an outage.
  //
  // One malformed trade fails ITSELF, not the batch. A backfill that aborts on
  // row 9,000 of 20,000 leaves the journal in a state nobody can reason about,
  // and the caller cannot fix a broker's bad row by retrying.
  app.post('/api/trades/ingest/batch', {
    bodyLimit: 12 * 1024 * 1024,
    schema: {
      body: {
        type: 'object',
        required: ['trades'],
        properties: {
          trades: { type: 'array', minItems: 1, maxItems: BATCH_LIMIT, items: ingestSchema.body },
        },
      },
    },
  }, async (req, reply) => {
    const token = req.headers['x-ingest-token'];
    if (!token) return reply.code(401).send({ error: 'missing ingest token' });
    const acct = await accountByToken(token);
    if (!acct) return reply.code(401).send({ error: 'invalid ingest token' });
    if (!canUseEA(await planForUser(acct.user_id))) {
      return reply.code(402).send({ error: 'Auto Sync requires the Pro plan' });
    }

    const results = [];
    for (const b of req.body.trades) {
      const bind = await bindOrCheckLogin(acct, b.account_id);
      if (bind === 'mismatch' || bind === 'conflict') {
        results.push({ mt5_ticket: b.mt5_ticket, ok: false, error: `login ${bind}` });
        continue;
      }
      try {
        const r = await ingestOne(acct, b, req);
        results.push({ mt5_ticket: b.mt5_ticket, ok: r.ok, error: r.error });
      } catch (err) {
        req.log.error({ ticket: b.mt5_ticket, err: err.message }, 'batch ingest row failed');
        results.push({ mt5_ticket: b.mt5_ticket, ok: false, error: 'ingest failed' });
      }
    }
    const accepted = results.filter((r) => r.ok).length;
    return reply.send({ ok: true, accepted, failed: results.length - accepted, results });
  });
```

Add `import { BATCH_LIMIT } from '../domain/trades/batch.js';` at the top.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS, no regressions. The single-trade ingest tests must still pass unchanged — that is the proof the extraction in Step 5 was behaviour-preserving.

- [ ] **Step 8: Commit**

```bash
git add src/domain/trades/batch.js src/routes/trades.js test/ingest-batch.test.js
git commit -m "$(cat <<'EOF'
feat(ingest): batched trade ingest for backfills

One POST per trade is fine for a 48-hour MT5 window and ruinous for a
four-year cTrader backfill. Adds a batched sibling sharing the same auth,
validation and upsert path, where one bad row fails itself rather than
aborting the batch.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Migration 0029

**Files:**
- Create: `db/migrations/0029_ctrader.sql`
- Test: `test/ctrader-migration.test.js`

**Interfaces:**
- Produces: tables `ctrader_identities`, `ctrader_discovered_accounts`; columns `mt5_accounts.{ctrader_identity_id, ctid_trader_account_id, platform_login, is_live_env}`, `sync_jobs.cursor_at`.

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { repoRoot } from '../src/platform/paths.js';
import path from 'node:path';

const sql = await readFile(path.join(repoRoot(), 'db/migrations/0029_ctrader.sql'), 'utf8');

test('0029 creates the identity and discovery tables', () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS ctrader_identities/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS ctrader_discovered_accounts/);
});

test('0029 stores tokens as ciphertext columns, never plaintext', () => {
  assert.match(sql, /access_token_ct\s+TEXT NOT NULL/);
  assert.match(sql, /refresh_token_ct\s+TEXT NOT NULL/);
  assert.doesNotMatch(sql, /access_token\s+TEXT/);
});

test('0029 allows re-authorizing a cTID whose identity was revoked', () => {
  // Partial index: without the WHERE, a revoked identity would permanently
  // block the user from reconnecting the same cTID — which is exactly what they
  // must do after a lost refresh-token rotation.
  assert.match(sql, /uq_ctrader_identities_live[\s\S]*WHERE revoked_at IS NULL/);
});

test('0029 gives sync_jobs a resumable backfill cursor', () => {
  assert.match(sql, /ALTER TABLE sync_jobs[\s\S]*cursor_at\s+TIMESTAMPTZ/);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test test/ctrader-migration.test.js`
Expected: FAIL — ENOENT on the migration file.

- [ ] **Step 3: Write the migration**

Copy §4.1 of the spec verbatim into `db/migrations/0029_ctrader.sql`, keeping every comment. The comments are the reason the next person does not "simplify" the partial index away.

- [ ] **Step 4: Run the test**

Run: `node --test test/ctrader-migration.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Apply it locally**

Run: `npm run db:migrate`
Expected: `0029_ctrader.sql` applied, no error. Re-run it — it must be a no-op (every statement is `IF NOT EXISTS`).

- [ ] **Step 6: Commit**

```bash
git add db/migrations/0029_ctrader.sql test/ctrader-migration.test.js
git commit -m "$(cat <<'EOF'
feat(db): migration 0029 — cTrader identities and discovery

The OAuth grant is cTID-scoped, not account-scoped, so the credential
lives at a new grain. Adds sealed-token identities, the discovery cache
the account picker reads, and a resumable backfill cursor on sync_jobs.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: The login band

**Files:**
- Create: `src/domain/sync/logins.js`
- Test: `test/login-band.test.js`

**Interfaces:**
- Produces: `CTRADER_LOGIN_BASE`, `toBandedLogin(ctidTraderAccountId) -> number`, `fromBandedLogin(login) -> number`, `platformOfLogin(login) -> 'manual' | 'metatrader' | 'ctrader'`.

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CTRADER_LOGIN_BASE, toBandedLogin, fromBandedLogin, platformOfLogin,
} from '../src/domain/sync/logins.js';

test('a cTrader account round-trips through the band', () => {
  assert.equal(toBandedLogin(314943467), 4_000_314_943_467);
  assert.equal(fromBandedLogin(4_000_314_943_467), 314943467);
});

test('the band cannot collide with a real MT5 login', () => {
  // THE BUG THIS PREVENTS: mt5_login is UNIQUE *globally across all tenants*
  // (migration 0005) and trades.account_id FKs it (0028). Without the band,
  // user B connecting cTrader account 314943467 is refused because unrelated
  // user A already holds MT5 login 314943467 — and B cannot fix it.
  const biggestPlausibleMt5Login = 9_999_999_999;
  assert.ok(toBandedLogin(1) > biggestPlausibleMt5Login);
  assert.equal(platformOfLogin(314943467), 'metatrader');
  assert.equal(platformOfLogin(4_000_314_943_467), 'ctrader');
});

test('negative logins remain manual accounts — migration 0015 owns that space', () => {
  assert.equal(platformOfLogin(-42), 'manual');
});

test('the base is exactly 4e12 and is not quietly retuned', () => {
  assert.equal(CTRADER_LOGIN_BASE, 4_000_000_000_000);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test test/login-band.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// src/domain/sync/logins.js
//
// Which region of the BIGINT number line a login belongs to.
//
// mt5_accounts.mt5_login is UNIQUE *globally, across every tenant* (migration
// 0005), and since 0028 trades.account_id is a foreign key to it. cTrader's
// ctidTraderAccountId is also a plain integer and can collide numerically with
// some *other* user's MT5 login — a cross-tenant failure the victim cannot fix,
// since they are refused their own account because of a stranger's data.
//
// So each platform gets a disjoint region:
//
//   negative       manual accounts    (already the case — migration 0015, -id)
//   1 .. 1e12      MetaTrader         (natural broker logins, 6-10 digits)
//   4e12 + id      cTrader
//
// This is a magic number and it is worth naming as one. It assumes no broker
// ever issues an MT5 login above four trillion; they are 9-10 digits, so the
// margin is ~4000x. The principled alternative -- re-keying to
// UNIQUE(platform, login) -- needs a platform column on `trades`, a backfill and
// an FK rewrite on the hottest table in the schema. The band was chosen because
// migration 0015 already solved this identical problem this identical way.
//
// The REAL login is kept in mt5_accounts.platform_login and is what the UI
// shows. The banded value is internal and appears only as a join key.

export const CTRADER_LOGIN_BASE = 4_000_000_000_000;

/** Internal join key for a cTrader account. */
export const toBandedLogin = (ctidTraderAccountId) =>
  CTRADER_LOGIN_BASE + Number(ctidTraderAccountId);

/** The cTrader account id back out of a banded login. */
export const fromBandedLogin = (login) => Number(login) - CTRADER_LOGIN_BASE;

/** Which platform's space a stored login sits in. */
export function platformOfLogin(login) {
  const n = Number(login);
  if (n < 0) return 'manual';
  if (n >= CTRADER_LOGIN_BASE) return 'ctrader';
  return 'metatrader';
}
```

- [ ] **Step 4: Run the test**

Run: `node --test test/login-band.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/domain/sync/logins.js test/login-band.test.js
git commit -m "$(cat <<'EOF'
feat(sync): reserved login band for cTrader accounts

mt5_login is UNIQUE globally across tenants, so a cTrader account number
can collide with a stranger's MT5 login and lock a user out of their own
account. Each platform now owns a disjoint region of the BIGINT space,
the way manual accounts already own the negatives.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Deal → trade mapping (the unit-scaling task)

The highest-risk code in the connector. Pure, no IO, fully testable without credentials.

**Files:**
- Create: `src/domain/sync/connectors/ctrader.js`
- Test: `test/ctrader-mapping.test.js`

**Interfaces:**
- Consumes: `toBandedLogin` from Task 3.
- Produces: `ctraderConnector` with `{ id, scaleMoney(raw, moneyDigits), toLots(volumeInCents, lotSizeInCents), isClosingDeal(deal), dealToTrade({ deal, openDeal, symbolName, bandedLogin }) }`.

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ctraderConnector as c } from '../src/domain/sync/connectors/ctrader.js';

test('money scales by the message its own moneyDigits, not a constant', () => {
  // From the proto: "moneyDigits = 8 must be interpret as business value
  // multiplied by 10^8, then real balance would be 10053099944 / 10^8".
  assert.equal(c.scaleMoney(10053099944, 8), 100.53099944);
  assert.equal(c.scaleMoney(-1234, 2), -12.34);
});

test('a missing moneyDigits defaults to 2, never to 0', () => {
  // Defaulting to 0 would report cents as dollars — a silent 100x overstatement
  // of every P&L number, which looks entirely plausible in the UI.
  assert.equal(c.scaleMoney(1234, undefined), 12.34);
});

test('lots divide volume by lotSize — both are in cents, so the units cancel', () => {
  // 1 standard lot of EURUSD: volume 10,000,000 cents = 100,000 units,
  // lotSize 10,000,000 cents. One lot, not 10 million.
  assert.equal(c.toLots(10_000_000, 10_000_000), 1);
  assert.equal(c.toLots(5_000_000, 10_000_000), 0.5);
});

test('only deals carrying closePositionDetail are journalled', () => {
  assert.equal(c.isClosingDeal({ dealId: 1 }), false);
  assert.equal(c.isClosingDeal({ dealId: 1, closePositionDetail: { grossProfit: 0 } }), true);
});

test('a closing deal maps to the ingest payload', () => {
  const trade = c.dealToTrade({
    deal: {
      dealId: 55501,
      executionTimestamp: 1_756_000_000_000,
      executionPrice: 1.0925,
      closePositionDetail: {
        entryPrice: 1.0900, grossProfit: 25000, swap: -120, commission: -700,
        pnlConversionFee: 0, balance: 5002418, closedVolume: 10_000_000, moneyDigits: 2,
      },
    },
    openDeal: { executionTimestamp: 1_755_900_000_000, tradeSide: 'BUY' },
    symbolName: 'EUR/USD',
    lotSize: 10_000_000,
    bandedLogin: 4_000_314_943_467,
  });

  assert.equal(trade.mt5_ticket, 55501);
  assert.equal(trade.account_id, 4_000_314_943_467);
  assert.equal(trade.symbol, 'EURUSD');
  assert.equal(trade.direction, 'buy');
  assert.equal(trade.entry_price, 1.09);
  assert.equal(trade.exit_price, 1.0925);
  assert.equal(trade.volume, 1);
  assert.equal(trade.commission, -7);
  // gross 250.00 + swap -1.20 + commission -7.00 + fee 0
  assert.equal(trade.pnl_money, 241.8);
  assert.equal(trade.account_balance, 50024.18);
  assert.equal(trade.open_time, new Date(1_755_900_000_000).toISOString());
});

test('a partial close keeps its own dealId, so it is its own trade', () => {
  // Keying on positionId would make each partial close REWRITE the previous
  // row, showing one trade where the trader took three.
  const base = {
    openDeal: { executionTimestamp: 1, tradeSide: 'SELL' },
    symbolName: 'XAUUSD', lotSize: 100, bandedLogin: 4_000_000_000_001,
  };
  const detail = { entryPrice: 1, grossProfit: 0, swap: 0, commission: 0, balance: 0, closedVolume: 50, moneyDigits: 2 };
  const a = c.dealToTrade({ ...base, deal: { dealId: 1, positionId: 9, executionTimestamp: 2, executionPrice: 1, closePositionDetail: detail } });
  const b = c.dealToTrade({ ...base, deal: { dealId: 2, positionId: 9, executionTimestamp: 3, executionPrice: 1, closePositionDetail: detail } });
  assert.notEqual(a.mt5_ticket, b.mt5_ticket);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test test/ctrader-mapping.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// src/domain/sync/connectors/ctrader.js
//
// The cTrader connector's PURE half: turning a cTrader deal into the ingest
// payload the EA and the MT5 farm already post. No sockets, no database, no
// crypto — so every rule below is unit-testable without a broker account, which
// matters because the socket half cannot be tested without one.
//
// THE 100x TRAP. Every monetary int64 in the Open API scales by *that message's
// own* moneyDigits field. Not a constant, not inherited from a sibling message.
// Volume is in "cents" of units and lotSize is ALSO in cents. Get either wrong
// and every R value in the journal is silently wrong while looking entirely
// plausible — no exception, no empty chart, just believable bad numbers.
//
// ONE ROW PER CLOSING DEAL, keyed on dealId. A partial close emits several
// closing deals against one positionId; keying on positionId would make each
// one rewrite the last, showing one trade where the trader took three. dealId
// also gives push and reconciliation a shared natural key, which is what makes
// re-reading an overlapping window free.

import { toBandedLogin } from '../logins.js';

/** Scale a cTrader int64 by its message's own moneyDigits. */
export const scaleMoney = (raw, moneyDigits) =>
  Number(raw ?? 0) / 10 ** Number(moneyDigits ?? 2);

/** Lots from two cents-denominated quantities — the units cancel. */
export const toLots = (volumeInCents, lotSizeInCents) =>
  !lotSizeInCents ? null : Number(volumeInCents) / Number(lotSizeInCents);

/** Only a deal that closed something has realized P&L to journal. */
export const isClosingDeal = (deal) => Boolean(deal?.closePositionDetail);

const iso = (ms) => new Date(Number(ms)).toISOString();

export const ctraderConnector = {
  id: 'ctrader',
  scaleMoney,
  toLots,
  isClosingDeal,

  /**
   * A closing deal plus its opening deal becomes one ingest payload.
   *
   * Direction comes from the OPENING deal: the closing deal's tradeSide is the
   * opposite of the trade the user took, so reading it here would invert every
   * long and short in the journal.
   */
  dealToTrade({ deal, openDeal, symbolName, lotSize, bandedLogin }) {
    const d = deal.closePositionDetail;
    const md = d.moneyDigits;
    const money = (v) => scaleMoney(v, md);
    return {
      mt5_ticket: Number(deal.dealId),
      account_id: Number(bandedLogin),
      symbol: String(symbolName ?? '').replace(/\//g, ''),
      direction: String(openDeal?.tradeSide ?? '').toUpperCase() === 'SELL' ? 'sell' : 'buy',
      open_time: iso(openDeal?.executionTimestamp ?? deal.executionTimestamp),
      close_time: iso(deal.executionTimestamp),
      entry_price: Number(d.entryPrice),
      exit_price: Number(deal.executionPrice),
      volume: toLots(d.closedVolume, lotSize),
      commission: money(d.commission),
      pnl_money: money(d.grossProfit) + money(d.swap) + money(d.commission) + money(d.pnlConversionFee),
      account_balance: money(d.balance),
    };
  },
};

export { toBandedLogin };
```

- [ ] **Step 4: Run the test**

Run: `node --test test/ctrader-mapping.test.js`
Expected: PASS (6 tests). If `pnl_money` is off by exactly 100x, `moneyDigits` is being read from the wrong message.

- [ ] **Step 5: Commit**

```bash
git add src/domain/sync/connectors/ctrader.js test/ctrader-mapping.test.js
git commit -m "$(cat <<'EOF'
feat(sync): cTrader deal-to-trade mapping

The pure half of the connector: unit scaling, lot conversion and the
one-row-per-closing-deal rule. Every monetary int64 scales by its own
message's moneyDigits — getting that wrong is a silent 100x error that
looks entirely plausible, so it is pinned by tests before any socket
code exists.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Identity store

**Files:**
- Create: `src/domain/sync/ctraderIdentities.js`
- Test: `test/ctrader-identities.test.js`

**Interfaces:**
- Produces: `identityAad(id)`, `sealTokens(id, {accessToken, refreshToken}, cfg)`, `openTokens(row, cfg)`, and builders `saveIdentityQuery`, `rotateTokensQuery`, `identityForUserQuery`, `revokeIdentityQuery`, `upsertDiscoveredQuery`, `discoveredForIdentityQuery`.

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKey } from '../src/platform/secretbox.js';
import {
  identityAad, sealTokens, openTokens, rotateTokensQuery, revokeIdentityQuery,
} from '../src/domain/sync/ctraderIdentities.js';

const cfg = { syncCredKey: generateKey() };

test('tokens round-trip under an identity-bound AAD', () => {
  const sealed = sealTokens(7, { accessToken: 'at-1', refreshToken: 'rt-1' }, cfg);
  const open = openTokens({ id: 7, ...sealed }, cfg);
  assert.deepEqual(open, { accessToken: 'at-1', refreshToken: 'rt-1' });
});

test('a ciphertext cannot be replayed into another identity', () => {
  const sealed = sealTokens(7, { accessToken: 'at-1', refreshToken: 'rt-1' }, cfg);
  assert.throws(() => openTokens({ id: 8, ...sealed }, cfg));
});

test('the AAD prefix differs from the MT5 credential AAD', () => {
  // Same key, different platforms. A shared prefix would let a ciphertext moved
  // between the two tables decrypt into the wrong platform's login path.
  assert.match(identityAad(7), /^ctrader-token:7$/);
});

test('rotation writes both tokens in ONE statement', () => {
  // The refresh token is consumed on use. Writing access and refresh in two
  // statements means a crash between them loses the only refresh token that
  // still works, and the user must re-authorize from scratch.
  const q = rotateTokensQuery(7, 'ct-a', 'ct-r', new Date(0));
  assert.match(q.text, /UPDATE ctrader_identities/);
  assert.match(q.text, /access_token_ct\s*=\s*\$2/);
  assert.match(q.text, /refresh_token_ct\s*=\s*\$3/);
  assert.equal(q.values.length, 4);
});

test('revoking clears both tokens rather than only stamping revoked_at', () => {
  const q = revokeIdentityQuery(3, 7);
  assert.match(q.text, /revoked_at\s*=\s*now\(\)/);
  assert.match(q.text, /access_token_ct\s*=\s*''/);
  assert.match(q.text, /user_id\s*=\s*\$1/); // never revoke another tenant's identity
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test test/ctrader-identities.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Follow `src/domain/sync/credentials.js` exactly for shape: pure builders returning `{ text, values }`, thin `run()` wrappers below, `seal`/`open` from `src/platform/secretbox.js`, AAD `ctrader-token:<identity_id>`, `SYNC_CRED_KEY` reused. Every query that touches an identity takes `user_id` as `$1` and filters on it — cross-tenant writes are the failure this shape prevents.

- [ ] **Step 4: Run the test**

Run: `node --test test/ctrader-identities.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/domain/sync/ctraderIdentities.js test/ctrader-identities.test.js
git commit -m "$(cat <<'EOF'
feat(sync): cTrader identity store

Sealed token pairs at cTID grain, under an identity-bound AAD distinct
from the MT5 credential's. Rotation is one statement because the refresh
token is consumed on use — losing it between two writes costs the user a
full re-authorization.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: OAuth state and token exchange

**Files:**
- Create: `src/domain/sync/ctraderOauth.js`
- Modify: `src/platform/config.js`
- Test: `test/ctrader-oauth.test.js`

**Interfaces:**
- Produces: `signState(userId, secret, now)`, `verifyState(state, secret, now)`, `grantUrl({clientId, redirectUri, state})`, `exchangeCode({code, ...})`, `refreshTokens({refreshToken, ...})`, `ctraderEnabled(cfg)`.

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signState, verifyState, grantUrl, STATE_TTL_MS } from '../src/domain/sync/ctraderOauth.js';

const secret = 'test-secret';

test('a signed state verifies back to its user', () => {
  const s = signState(42, secret, 1000);
  assert.equal(verifyState(s, secret, 1000).userId, 42);
});

test('a tampered state is rejected, not merely ignored', () => {
  // Without this the callback attaches an attacker's cTrader identity to a
  // victim's PropVexis account.
  const s = signState(42, secret, 1000);
  assert.equal(verifyState(s.replace(/42/, '43'), secret, 1000), null);
  assert.equal(verifyState(s, 'other-secret', 1000), null);
});

test('a state expires', () => {
  const s = signState(42, secret, 1000);
  assert.equal(verifyState(s, secret, 1000 + STATE_TTL_MS + 1), null);
});

test('the grant URL requests view-only scope and nothing more', () => {
  const u = new URL(grantUrl({ clientId: 'cid', redirectUri: 'https://app.propvexis.com/api/ctrader/callback', state: 'st' }));
  assert.equal(u.origin + u.pathname, 'https://id.ctrader.com/my/settings/openapi/grantingaccess/');
  assert.equal(u.searchParams.get('scope'), 'accounts');
  assert.notEqual(u.searchParams.get('scope'), 'trading');
  assert.equal(u.searchParams.get('state'), 'st');
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test test/ctrader-oauth.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`state` is `<userId>.<expiryMs>.<hmac>` using `createHmac('sha256', secret)` over the first two parts, compared with `timingSafeEqual` (length-checked first, since it throws on mismatch). `STATE_TTL_MS = 10 * 60 * 1000`. `exchangeCode` and `refreshTokens` are one `fetch` each against `https://openapi.ctrader.com/apps/token`, returning `{ accessToken, refreshToken, expiresAt }` or throwing.

Add to `src/platform/config.js`, following the Razorpay comment style — optional, so an unconfigured box boots and the routes 503:

```js
  // ---- cTrader Open API (Auto Sync, platform 'ctrader') ----
  // Issued by Spotware after app review at openapi.ctrader.com. All optional:
  // unset means ctraderEnabled() is false and /api/ctrader/* returns 503,
  // exactly as the app behaves today. Scope is always 'accounts' (view only) —
  // there is no configuration that requests trading permission.
  ctraderClientId: process.env.CTRADER_CLIENT_ID ?? '',
  ctraderClientSecret: process.env.CTRADER_CLIENT_SECRET ?? '',
  ctraderRedirectUri: process.env.CTRADER_REDIRECT_URI ?? '',
```

- [ ] **Step 4: Run the test**

Run: `node --test test/ctrader-oauth.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/domain/sync/ctraderOauth.js src/platform/config.js test/ctrader-oauth.test.js
git commit -m "$(cat <<'EOF'
feat(sync): cTrader OAuth state signing and token exchange

HMAC-signed, expiring, user-bound state — without it the callback would
attach an attacker's cTrader identity to a victim's account. Scope is
pinned to 'accounts' with a test asserting 'trading' is never requested.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Routes and queue wiring

**Files:**
- Create: `src/routes/ctrader.js`
- Modify: `src/app.js`, `src/domain/sync/queue.js`, `test/routes-split.test.js`
- Test: `test/ctrader-routes.test.js`

**Interfaces:**
- Consumes: Tasks 3, 4, 5, 6.
- Produces: the five routes from spec §5.2.

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { repoRoot } from '../src/platform/paths.js';

const src = await readFile(path.join(repoRoot(), 'src/routes/ctrader.js'), 'utf8');

test('every user-facing cTrader route requires auth', () => {
  const routes = [...src.matchAll(/app\.(get|post|delete)\('([^']+)'\s*,\s*\{([^}]*)\}/g)];
  assert.ok(routes.length >= 4);
  for (const [, , route, opts] of routes) {
    assert.match(opts, /app\.requireAuth/, `${route} must require a session`);
  }
});

test('the callback never trusts a user id from the query string', () => {
  // The user id comes from the signed state ONLY. Reading it from the query
  // would let anyone attach their cTrader identity to another account.
  assert.match(src, /verifyState/);
  assert.doesNotMatch(src, /req\.query\.(user_?id|uid)/);
});

test('the module is exported for a plain call, not app.register()', () => {
  assert.match(src, /export default function ctraderRoutes\(app/);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test test/ctrader-routes.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the routes**

Build spec §5.2's five routes. Rules that are not negotiable:
- The user id comes from `verifyState` on the callback, never from a query param.
- `credentialsEnabled()`-style gating: if `ctraderEnabled(config)` is false, every route returns 503 with a clear reason, exactly as `/api/sync` does for `SYNC_CRED_KEY`.
- The token exchange runs **first** in the callback, before any DB write — the auth code has 60 seconds.
- `POST …/accounts` provisions via the existing `provisionAccount` (`src/domain/accounts/provision.js`), passing `platform: 'ctrader'`, `import_method: 'auto_sync'`, and the banded login. It does not duplicate provisioning logic.

> **Implemented differently, deliberately — recorded 2026-08-31.**
>
> **`POST …/accounts` is not in this PR.** `provisionAccount` is MT5-credential
> shaped throughout — it reads `credential.login`, `credential.server`,
> `credential.password` and calls `sealPassword` — and `validateProvision`
> rejects any platform whose registry entry is `enabled: false`. So a cTrader
> provisioning route cannot succeed today no matter how it is written, and the
> only way to test it end to end is with a real discovered account, which needs
> the worker. It lands with Task 9, together with the extension of
> `provisionAccount` that gives it an identity instead of a password.
>
> **Discovery is not a `sync_jobs` row.** `sync_jobs.account_id` is `NOT NULL`
> and a discovery has no account yet — that is the whole point of it. Making the
> column nullable to fit would weaken a constraint the queue relies on. Discovery
> therefore belongs to the worker's own poll (Task 8), and until then a new
> identity discovers nothing: `GET …/accounts` returns `pending: true`, which is
> the honest state rather than an error.

- [ ] **Step 4: Add the `discover` and `reconcile` job reasons**

In `src/domain/sync/queue.js`, `reason` is already free text on the table; add the two values to the doc comment and add `cursor_at` to `leasedPayloadQuery`'s SELECT so a resumed backfill knows where it stopped.

- [ ] **Step 5: Wire it into the app**

In `src/app.js`, beside line 215: `ctraderRoutes(app);`. Add it to `test/routes-split.test.js`'s expected list so the "called, never registered" invariant covers it.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS. Then `npm run lint` — the flat config is `no-undef`-only and has caught three real unimported-symbol crashes; do not skip it.

- [ ] **Step 7: Commit**

```bash
git add src/routes/ctrader.js src/app.js src/domain/sync/queue.js test/ctrader-routes.test.js test/routes-split.test.js
git commit -m "$(cat <<'EOF'
feat(api): cTrader OAuth and account-discovery routes

Five routes: authorize, callback, list discovered accounts, provision
selected, revoke. Gated closed when unconfigured, like the sync routes
are on SYNC_CRED_KEY. cTrader stays badged Soon in both catalogs — this
adds no user-visible surface.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7b: Sync cadence and the manual cooldown — ✅ DONE 2026-08-31

Shipped alongside the foundation, because it is platform-wide rather than
cTrader-specific and it unblocks TradeLocker's scaling story.

**Files:** `src/domain/sync/queue.js`, `src/routes/sync.js`, `test/sync-queue.test.js`, `test/sync-routes.test.js`

- [x] `SYNC_INTERVAL_MS` 15 min → **3 hours**, plus `PLATFORM_SYNC_INTERVAL_MS` so
      each platform's cadence is its own value. `dueAccountsQuery` resolves it via a
      `unnest($2::text[], $3::int[])` CTE **LEFT JOIN**ed to the account, so an
      unmapped platform falls back to the default rather than silently never syncing.
- [x] `manualCooldown()` — pure, 15 minutes, applied **regardless of whether the last
      job succeeded** (an account that is failing is often failing *because* of a rate
      limit; the backoff ladder is what retries a failure).
- [x] `POST /api/accounts/:id/sync` answers **429 + `Retry-After`** inside the window.
- [x] The `read_only IS NOT FALSE` filter narrowed to `a.platform <> 'mt5' OR ...`,
      which is TradeLocker plan Task 6 landed early — see the note below.
- [x] Tests: cadence pinned, fallback pinned, cooldown-on-failure pinned, and the
      route asserted to answer 429 rather than 202.

> **Why the MT5 interval moved too.** The farm is one serial Windows worker at
> roughly 90s per sync. Fifteen minutes was never achievable beyond a handful of
> accounts — 100 accounts already needs 2.5 hours of terminal time per cycle. The
> old constant was a promise the farm could not keep, so this is a correction rather
> than a regression. The visible effect is that an MT5 trade can now take up to three
> hours to appear unattended, where the button previously implied fifteen minutes.

---

## Task 8: The worker — DEFERRED, gated on Spotware credentials

**Not implementable now, and shipping it unverified would be worse than not shipping it.**

`ProtoOAApplicationAuthReq` requires a real `clientId` and `clientSecret`. Without them the socket cannot be opened once, which means the connection lifecycle, reconnect logic, per-account auth, `hasMore` paging semantics and every landmine in spec §10 would be written blind and merged untested. Spec §14.5 already records that `hasMore`'s chunk semantics are documented loosely enough to need empirical confirmation.

The pure half — which is where the 100x money bug and the partial-close bug live — **is** implemented and tested, in Task 4.

**Unblocks when:** the Spotware app is approved and `CTRADER_CLIENT_ID` / `CTRADER_CLIENT_SECRET` are in SSM, plus a cTrader demo account exists.

**Scope when unblocked:** `worker/ctrader/{index.js,connection.js,backfill.js,reconcile.js}`, `@spotware/connect` or protobufjs against the published `.proto`, pm2 entry in `ecosystem.config.cjs`, spec §6.3's newest-first 30-day windows, §6.4's 5/s historical throttle, §6.5's watchdog.

---

## Task 9: Wizard branch and catalog flip — DEFERRED, gated on a verified sync

Depends on Task 8. Flipping `enabled: true` / `status: 'live'` puts a "Connect cTrader" button in front of users; doing that before one real account has synced end to end ships a dead button. The repo already models the correct state for an unshipped platform — `soon` — and Tasks 1–7 deliberately leave it there.

**Scope when unblocked:** `ConnectStep` branch, new `CtraderAccountsStep` multi-select, both catalog entries flipped together (`test/platform-catalog.test.js` fails if only one moves), identity-level "Reconnect" in the sync panel. Design-language rules apply: shadcn Base Rhea, structure is a locked invariant, and any caller-supplied dimension is a **prop, not a class** — Tailwind utilities compile only under `components/{ui,primitives}`.

---

## Self-Review

**Spec coverage:** §3.4 box → Task 7 note + operator steps. §4.1 → Task 2. §4.2 → Task 3. §5 → Tasks 6–7. §6.3/6.4/6.5 → Task 8 (deferred, scoped). §7 → Task 1. §8 → Task 4. §9 → Task 8. §10 landmines → 10.1/10.2 Task 5, 10.3 Task 6, 10.4/10.5 Task 4, 10.6/10.7 Task 8. §11 → Task 9 (deferred). §12 → tests throughout.

**Gap accepted knowingly:** §9 (equity/payouts) and §6's socket half both live in Task 8 and are unimplementable without credentials. Recorded rather than faked.

**Type consistency:** `toBandedLogin`/`fromBandedLogin`/`platformOfLogin` (Task 3) are the names used in Tasks 4 and 7. `scaleMoney`/`toLots`/`isClosingDeal`/`dealToTrade` (Task 4) are the names the worker will consume. `BATCH_LIMIT`/`splitBatch` (Task 1) are what the backfill will call.
