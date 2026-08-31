# cTrader connector — design

**Status:** approved design, not yet implemented
**Date:** 2026-08-30
**Supersedes nothing.** Extends `2026-08-22-add-account-flow-design.md`, which
scoped this work as **P3** and deliberately left it out.

---

## 1. What this is

cTrader becomes the second Auto Sync platform, after the self-hosted MT5 farm.
A trader authorizes PropVexis against their cTrader ID once, picks which of
their accounts to journal, and their trades arrive — history included — without
an EA, a password, or a Windows box.

The Add Account work (PR #98) built the seam for exactly this.
`src/domain/sync/connectors/index.js` states the contract out loud: adding
cTrader is "a module here plus a catalog entry in platforms.js, and nothing else
in the account or provisioning path moves." This spec holds that line for the
provisioning path, and is honest about the three places it cannot: the credential
is not a password, the credential is not per-account, and ingestion is a stream
rather than a poll.

### 1.1 Decisions already taken

| Decision | Choice | Where argued |
|---|---|---|
| Runtime | Leasing worker, own process, prod box only | §3.1 |
| Ingestion | Push primary + 3-hourly reconcile + reconcile-on-reconnect | §6 |
| Onboarding | Connect once, then pick accounts | §5 |
| Login collision | Reserved numeric band at 4×10¹² | §4.2 |
| Backfill depth | Everything, from `registrationTimestamp` | §6.3 |
| Ingest shape | New batched, token-authenticated endpoint | §7 |
| Test account | Broker demo first, real prop account before `live` | §12 |

---

## 2. Why cTrader is not "MT5 with a different login"

Six structural differences. Every one of them shows up in the data model or the
worker; none of them are cosmetic.

1. **There is no password.** OAuth 2.0 authorization code. `mt5_credentials
   (server, password_ct)` does not fit and is not reused.

2. **The credential is not per-account.** One grant against a cTrader ID (cTID)
   yields tokens covering *every* account under that cTID. The credential belongs
   to an identity, not to an `mt5_accounts` row.

3. **Read-only stops being a promise and becomes a permission.** The MT5 farm
   asks for an investor password, checks `account_info().trade_allowed` after
   logging in, and deletes the credential if it can trade. With `scope=accounts`,
   Spotware refuses trading operations on our behalf. This closes risk #1 of the
   Phase A spec, which expected the read-only promise to break at the second
   connector.

4. **No Windows box.** A TLS socket. Any Linux process can hold it.

5. **History is deals, not trades.** A closed position is reconstructed from the
   closing deal's `closePositionDetail`. Partial closes emit several closing
   deals against one `positionId`.

6. **Ingestion is push.** `ProtoOAExecutionEvent` fires for every execution on an
   authorized account — including trades placed from the trader's phone. Polling
   changes role from *delivery* to *audit*.

---

## 3. Architecture

### 3.1 Runtime

A new Node process, `worker/ctrader/`, run under pm2 on the existing EC2 box,
leasing work over HTTP from `/api/sync/lease` exactly as the Windows agent does.

It is a separate process rather than code inside Fastify for two reasons. The web
tier is destined for pm2 cluster mode (`src/platform/cluster.js`, currently
Redis-gated and off), and N cluster workers each holding a cTrader socket would
each receive every execution event and race to ingest it. And a long-lived
protobuf socket has a lifecycle — reconnect, re-auth, watchdog — that has no
business sharing a process with request handling.

It is *not* on its own box yet. Same lease protocol, same token, so relocating it
later is a base-URL change and an SSM parameter.

**Prod only.** Only production needs a live broker socket. `dev` and `staging`
run the API halves and can point a locally-run worker at the demo endpoint when
someone is actually working on it. This matters because the box is small — see
§3.4.

### 3.2 Connections

Confirmed from the official connection guidance, and it is better than assumed:

> "At most, you should create two connections: one for demo accounts and one for
> live accounts." — "Each connection can support an unlimited number of accounts
> of a certain type."

So the worker holds **exactly two sockets**, for the life of the process:

| | Host | Port | Protocol |
|---|---|---|---|
| Live | `live.ctraderapi.com` | 5035 | Protobuf over TLS |
| Demo | `demo.ctraderapi.com` | 5035 | Protobuf over TLS |

Port 5036 is the JSON variant; we use protobuf. Both TCP and WebSocket are
served on the same host/port — TCP, since we have no browser in the path.

The environments are fully separate: a live-endpoint connection cannot see demo
accounts. `ProtoOACtidTraderAccount.isLive` tells us which socket each account
belongs on, and it is stored (§4.1) so a reconnect does not have to rediscover it.

**This closes the scale question.** cTrader's socket footprint does not grow with
users. Two sockets serve every account PropVexis will ever have, which keeps this
connector orthogonal to the ≥1000-concurrent-user bar.

### 3.3 Data flow

```
  cTrader                    worker/ctrader              PropVexis API
  ───────                    ──────────────              ─────────────
  ProtoOAExecutionEvent ───▶ map deal → trade ─────────▶ POST /api/trades/ingest/batch
                                                          (x-ingest-token, per account)
                                                                │
  ProtoOADealListReq   ◀───  reconcile (3h,               ┌─────▼─────┐
  ProtoOADealListRes   ───▶  on reconnect, on first sync) │  trades   │
                                                          └───────────┘
       lease/report  ◀──────────────────────────────────▶ POST /api/sync/lease
```

Trades reach the database through the **same ingest seam the EA and the MT5 farm
already use**, with the account's own `ingest_token`. Dedup, derivation,
alerting, stats invalidation and the socket broadcast are untouched and stay in
one place for all three sources.

### 3.4 What this costs the box

Measured on prod, 2026-08-30:

```
Mem: 911 MB total │ 245 MB available │ 134 MB already in swap
  amey-backend         172.8 MB
  amey-backend-dev     128.1 MB
  amey-backend-staging  71.5 MB
  PM2 God daemon        40.2 MB
Load average: 0.00, 0.01, 0.00 (36 days uptime)
```

CPU and sockets are a non-issue: two sockets, a heartbeat every 10s, and a
handful of protobuf decodes a minute against a box that has been idle for 36
days. **Memory is the constraint.** A fourth Node process baselines at roughly
60–80 MB on a box with 245 MB available and 134 MB already swapped.

Agreed mitigation: stop `amey-backend-staging` (71.5 MB, nothing depends on it
daily) to fund the worker. `amey-backend-dev` is the deploy target for the branch
this work happens on and is kept until the worker's real RSS is known, then
revisited.

This is a workaround, not a fix. The box cannot host the ≥1000-user bar either,
and the t3.micro → t3.small upsize (~$7.50/mo, Mumbai) is owed to the scale work
regardless of whether cTrader ships. Recorded here so the cost is attributed
honestly rather than blamed on this connector.

---

## 4. Data model

### 4.1 Migration 0029

```sql
-- One row per cTrader ID, NOT per account. The OAuth grant is cTID-scoped and
-- covers every trading account under it, so a per-account credential table would
-- store the same token pair N times and refresh it N times -- and because the
-- refresh token is consumed on use, the second refresh of a duplicated token
-- fails. The identity is the only correct grain.
CREATE TABLE IF NOT EXISTS ctrader_identities (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id           BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ctid              BIGINT,        -- cTID user id, learned at first account list
    access_token_ct   TEXT NOT NULL, -- AES-256-GCM, AAD 'ctrader-token:<id>'
    refresh_token_ct  TEXT NOT NULL,
    expires_at        TIMESTAMPTZ NOT NULL,
    scope             TEXT NOT NULL, -- 'accounts'; re-asserted on every account list
    revoked_at        TIMESTAMPTZ,
    last_error        TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One live identity per cTID per user. Partial, so a revoked identity does not
-- block re-authorizing the same cTID -- which is exactly what a user does after
-- a refresh-token rotation is lost.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ctrader_identities_live
    ON ctrader_identities (user_id, ctid) WHERE revoked_at IS NULL;

-- What the account picker offers, filled by the worker's `discover` job. A cache,
-- not an authority: the authority is whatever cTrader returns next time.
CREATE TABLE IF NOT EXISTS ctrader_discovered_accounts (
    identity_id        BIGINT NOT NULL REFERENCES ctrader_identities(id) ON DELETE CASCADE,
    ctid_trader_account_id BIGINT NOT NULL,
    trader_login       BIGINT,
    is_live            BOOLEAN NOT NULL,
    broker_name        TEXT,
    deposit_currency   TEXT,
    registered_at      TIMESTAMPTZ,   -- ProtoOATrader.registrationTimestamp
    discovered_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (identity_id, ctid_trader_account_id)
);

ALTER TABLE mt5_accounts
    ADD COLUMN IF NOT EXISTS ctrader_identity_id BIGINT
        REFERENCES ctrader_identities(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS ctid_trader_account_id BIGINT,
    ADD COLUMN IF NOT EXISTS platform_login BIGINT,   -- the REAL login, for display
    ADD COLUMN IF NOT EXISTS is_live_env BOOLEAN;     -- which of the two sockets

CREATE UNIQUE INDEX IF NOT EXISTS uq_mt5_accounts_ctid_account
    ON mt5_accounts (ctid_trader_account_id) WHERE ctid_trader_account_id IS NOT NULL;

ALTER TABLE sync_jobs
    ADD COLUMN IF NOT EXISTS cursor_at TIMESTAMPTZ;   -- backfill/reconcile checkpoint
```

Tokens are sealed with the existing `src/platform/secretbox.js` under AAD
`ctrader-token:<identity_id>`. A different prefix from the MT5 farm's
`mt5-cred:<account_id>` on purpose: a ciphertext lifted between the two tables
must fail to open rather than decrypt into the wrong platform's login path.
`SYNC_CRED_KEY` is reused; no new key, no new rotation story.

### 4.2 The login band

`mt5_accounts.mt5_login` is `BIGINT NOT NULL UNIQUE` (migration 0005) — unique
**globally, across every tenant** — and since migration 0028 `trades.account_id`
is a foreign key to it. It is load-bearing for the entire trade path.

MT5 logins are broker-issued integers of 6–10 digits. cTrader's
`ctidTraderAccountId` is also an integer and can collide numerically. The failure
is cross-tenant and unfixable by the victim: user A holds MT5 login `314943467`,
user B connects cTrader account `314943467`, and B is refused their own account
with "this login is already registered to another account".

Each platform therefore gets a disjoint region of the BIGINT number line:

| Region | Platform | Example |
|---|---|---|
| negative | manual accounts (**exists** — `mt5_login = -id`, migration 0015) | `-42` |
| 1 … 10¹² | MetaTrader, natural broker logins | `314943467` |
| 4×10¹² + id | cTrader | `4000314943467` |

```js
export const CTRADER_LOGIN_BASE = 4_000_000_000_000;
export const toBandedLogin = (ctidTraderAccountId) =>
  CTRADER_LOGIN_BASE + Number(ctidTraderAccountId);
export const fromBandedLogin = (login) =>
  Number(login) - CTRADER_LOGIN_BASE;
```

The real login lives in `platform_login` and is what every surface displays. The
banded value is internal and appears only as a join key.

**Honest accounting of the trade-off.** This is a magic number. It assumes no
broker ever issues an MT5 login above four trillion — they are 9–10 digits, so
the margin is roughly 4000× — and someone reading the raw table sees a value that
needs explaining, which is why it is explained in the migration comment as well
as here. The principled alternative is re-keying to `UNIQUE(platform, login)`,
which requires a `platform` column on `trades`, a backfill, and an FK rewrite on
the hottest table in the schema. The band was chosen because migration 0015
already solved this identical problem this identical way, and that has held
without incident since.

---

## 5. OAuth and account discovery

### 5.1 Endpoints

| | |
|---|---|
| Authorize | `https://id.ctrader.com/my/settings/openapi/grantingaccess/?client_id=…&redirect_uri=…&scope=accounts&product=web` |
| Token | `https://openapi.ctrader.com/apps/token` (GET) |
| Scope | `accounts` — view only. **Never `trading`.** |
| Auth code TTL | **60 seconds** |
| Access token TTL | 2,628,000 s (~30 days) |
| Refresh token | No expiry, but **consumed on use** — every refresh rotates it |

### 5.2 Routes

New module `src/routes/ctrader.js`, called on the root app instance like every
other route module (never `app.register()` — see `test/routes-split.test.js`).

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/ctrader/authorize` | session | Mint a signed, single-use, user-bound `state`; return the grant URL |
| `GET /api/ctrader/callback` | `state` | Exchange the code, seal tokens, create the identity, enqueue `discover`, redirect into the wizard |
| `GET /api/ctrader/identities/:id/accounts` | session | The picker's data: discovered accounts, each flagged already-claimed or free |
| `POST /api/ctrader/identities/:id/accounts` | session | Provision the selected accounts |
| `DELETE /api/ctrader/identities/:id` | session | Revoke: clear tokens, cancel open jobs, leave accounts and trades intact |

`state` is mandatory and must be single-use, short-lived and bound to the user —
without it the callback is a CSRF hole that attaches an attacker's cTrader
identity to a victim's PropVexis account.

The callback has **60 seconds** to complete the token exchange. Any work that can
be deferred is deferred; the exchange happens first, before the identity row is
even written.

### 5.3 Why discovery is a job, not a call

Listing accounts requires `ProtoOAGetAccountListByAccessTokenReq` — a protobuf
message on a socket. Fastify does not get a protobuf client; that is the worker's
whole job, and putting a second one in the web tier would mean two
implementations of app-auth, heartbeats and reconnect.

So the callback enqueues a `discover` job and redirects. The worker — idle-polling
fast, on the same box, at zero network cost — fills `ctrader_discovered_accounts`.
The wizard step polls `GET …/accounts` until rows appear, typically a few seconds
after a redirect the user already waited on. TradeLocker will want the identical
path.

---

## 6. Ingestion

The model is **push for freshness, reconciliation for correctness**. Not push
*or* polling; push *and* reconciliation.

### 6.1 Push

After `ProtoOAAccountAuthReq`, `ProtoOAExecutionEvent` is delivered for every
execution on that account, whatever placed it — our app, their desktop, their
phone. It also fires on deposits and withdrawals, which is how payouts arrive
(§9). A closing deal maps to a trade and is posted immediately.

### 6.2 Why reconciliation exists anyway

Not because the socket might be dead — `ProtoHeartbeatEvent` every 10 s and the
transport's own callbacks establish liveness perfectly well. The distinction that
matters is narrower and sharper:

> **Transport liveness is not data completeness.** A healthy socket proves the
> connection is up. It does not prove that every business event was received,
> mapped, and committed.

The gaps a live socket does not cover:

- **Process restarts.** Every deploy. Prod has restarted 25 times.
- **Token refresh.** See §10.1 — the server terminates the affected accounts'
  sessions, by design.
- **`ProtoOAClientDisconnectEvent`.** All sessions terminated, e.g. the
  application blocked by a cTrader administrator.
- **Maintenance windows and rate limiting**, both of which the protocol
  signals explicitly (`maintenanceEndTimestamp`, `retryAfter`).
- **Our own failures.** A handler exception, a failed ingest POST, a
  reconnect race — none of which the transport knows about.
- **Anything before the account existed for us.** §6.3.

### 6.3 Backfill — everything, from inception

`ProtoOATraderReq` returns `registrationTimestamp`, the account's true inception
in Unix ms. That is the floor.

And nothing caps the span. `ProtoOADealListReq` takes optional `fromTimestamp` /
`toTimestamp` with no maximum difference — bounds are 1 Jan 1970 to 19 Jan 2038 —
and paginates with `hasMore` / `maxRows`. **The one-week validation
(`toTimestamp - fromTimestamp <= 604800000`) is on `ProtoOACashFlowHistoryListReq`,
not on the deal list.** Verified against `OpenApiMessages.proto` directly; this was
mis-stated twice during design and is the single most consequential correction in
this document.

This matches what the MT5 farm already does. `leasedPayloadQuery` computes
`since` as `max(close_time) - 48h`, which collapses to `epoch` for an account
with no trades — a first sync already means "everything". cTrader is continuity,
not a new concept, and reuses the existing `reason = 'first_sync'`.

**Newest-first windows.** The user is never blocked on an HTTP request — the
wizard completes as soon as the account is provisioned, and the backfill is a
job. So the budget that matters is *time until the first trades are visible*, not
total duration. The worker therefore walks **30-day windows backwards** from now
to `registrationTimestamp`, paging forward with `hasMore` inside each window.
Recent trades land within seconds; four years of history fills in behind them.

`sync_jobs.cursor_at` holds the window boundary, so a worker killed mid-backfill
resumes instead of restarting.

**Cursor safety.** Paging advances to the last returned deal's
`executionTimestamp` **without** a `+1 ms` bump, because two deals can share a
millisecond and skipping one is silent data loss. Re-reading the boundary is free:
`dealId` is the idempotency key (§8), so an overlapping request is a no-op.

### 6.4 Reconcile

| Trigger | Window |
|---|---|
| Scheduled | Every **3 hours** |
| On reconnect | From `cursor_at` minus a 15-minute overlap |
| Manual "Sync now" | From `cursor_at` minus overlap, immediate — **15-minute cooldown** |

**Amended 2026-08-31 — the cadence is now platform-wide.** Three hours became the
unattended interval for *every* platform, and the manual button gained a
server-side 15-minute cooldown. `PLATFORM_SYNC_INTERVAL_MS` and `manualCooldown()`
in `domain/sync/queue.js` are the implementation; `POST /api/accounts/:id/sync`
answers **429 with `Retry-After`** inside the window.

The interval means different things per platform, which is why it is a map rather
than a constant:

| Platform | What the 3 hours is | Freshness |
|---|---|---|
| cTrader | **reconcile only** — push is delivery | seconds |
| TradeLocker | **delivery** — no stream exists | up to 3h |
| MT5 | **delivery** | up to 3h |

Worth being explicit that **this does not weaken cTrader.** Push remains the
delivery path precisely because it is the cheapest thing at scale: two sockets
serve every account, and events cost nothing until a trade actually happens.
Polling cTrader on the same cadence instead would be ~8,000 `DealListReq` calls a
day at 1000 accounts — strictly more load *and* worse freshness.

Three hours matches TradeZella's documented broker re-sync cadence, which is a
reasonable benchmark for the category and is the interval CLAUDE.md's named
comparison product ships. The reconnect-triggered pass matters more than the
interval: it closes the gap while it is minutes old rather than up to three hours
old.

Rate limits are **50 requests/second general, 5/second historical**, per
connection. Reconciliation is historical and must be queued and throttled at 5/s
across all accounts on a socket, not fired per-account in parallel. `retryAfter`
on a `BLOCKED_PAYLOAD_TYPE` error is authoritative and overrides the local
throttle.

### 6.5 Connection watchdog

The worker tracks, per socket: `connectionState`, `lastHeartbeatSent`,
`lastInboundMessage`, `reconnectAttempts`, `lastSuccessfulAuth`, and the set of
authorized `ctidTraderAccountId`s. Reconnect is exponential with jitter. On every
successful reconnect: re-auth the application, re-auth every account for that
environment, then reconcile (§6.4).

The existing `sync_workers` heartbeat table is reused so "the cTrader worker is
down" produces the same alert as "the MT5 farm is down", via `staleWorkersQuery`.

---

## 7. Batched ingest

The MT5 agent posts **one HTTP POST per trade** (`agent/api.py`, `post_trade`).
Fine for 48-hour windows. Not fine for a live account with four years and 20,000
trades, which becomes 20,000 sequential POSTs against our own API on a 911 MB box.

New endpoint: `POST /api/trades/ingest/batch`, authenticated by `x-ingest-token`
exactly like `/api/trades/ingest`. It is a sibling of the single-trade route and
shares its validation, derivation and upsert path — not a second implementation.
`/api/trades/import` is not reusable: it is session-authenticated and CSV-shaped.

- **Batch size: 500 trades.** Roughly 250 KB of JSON, comfortably inside a 12 MB
  body limit, and an estimated sub-two-second server cost per batch on the
  current box.
- Response reports per-trade outcomes so one malformed trade fails itself rather
  than the batch.
- Idempotent by `mt5_ticket`, as the single-trade route already is.
- Push (§6.1) keeps using the single-trade route — batching one event is pointless.

The single-trade endpoint stays exactly as it is. The EA is compiled software in
the field and nothing here may require a recompile.

### 7.1 Telling the user the wait is real

We cannot know the total deal count up front without walking it, and walking it
to produce a progress bar doubles the work. We can be honest with what we already
have: `registrationTimestamp` is known before the first request, so the UI says
*"This account has about 2 years of history — fetching it now"* immediately, then
shows a live count as batches land, sourced from the `sync_jobs.stats` JSONB the
sync panel already reads.

---

## 8. Mapping deals to trades

**One journal row per closing deal**, keyed `mt5_ticket = dealId`.

A partial close emits several closing deals against one `positionId`. Keying on
`positionId` would mean each partial close rewrote the previous row and the
journal would show one trade where the trader took three. Keying on `dealId`
matches what the EA already does per closed deal, keeps the existing upsert
idempotent, and gives push and reconcile a shared natural key.

A deal is journalled when it carries `closePositionDetail`. Opening deals are
matched by `positionId` for the entry price and open time.

| trades column | Source |
|---|---|
| `mt5_ticket` | `deal.dealId` |
| `account_id` | banded login (§4.2) |
| `symbol` | `symbolName` via `ProtoOASymbolsListReq`, cached per account |
| `direction` | `tradeSide` of the **opening** deal |
| `open_time` | opening deal `executionTimestamp` |
| `close_time` | closing deal `executionTimestamp` |
| `entry_price` | `closePositionDetail.entryPrice` |
| `exit_price` | `deal.executionPrice` |
| `volume` | `closedVolume / 100 / lotSize` → lots |
| `commission` | `closePositionDetail.commission` ÷ 10^`moneyDigits` |
| `pnl_money` | `grossProfit + swap + commission + pnlConversionFee`, each ÷ 10^`moneyDigits` |
| `account_balance` | `closePositionDetail.balance` ÷ 10^`moneyDigits` |

**Unit scaling is the highest-risk code in this connector.** Every monetary
`int64` scales by *that message's own* `moneyDigits` field — never a constant,
never inherited from a sibling message. Volume is in "cents" of units, and
`lotSize` is *also* in cents. Wrong by a factor of 100 and every R value in the
journal is silently wrong while looking entirely plausible. This gets dedicated
unit tests with real captured payloads before it gets a live account.

`pipPosition` and `digits` from `ProtoOASymbol` are authoritative and better than
the symbol-name heuristics in `domain/trades/derive.js`. The connector supplies
them; `derive.js` is not modified.

---

## 9. Prop OS: balance, equity, payouts

- **Balance** — free with every closing deal via `closePositionDetail.balance`,
  giving a balance point per trade at no extra request.
- **Equity** — `ProtoOATraderReq` plus unrealized P&L on open positions, on the
  reconcile cadence. Feeds `equity_snapshots` as the MT5 farm does.
- **Payouts** — deposits and withdrawals arrive as execution events in real time,
  which is better than the MT5 EA's `DEAL_TYPE_BALANCE` detection. Historical
  payout backfill uses `ProtoOACashFlowHistoryListReq`, and **this one is capped
  at one-week windows** (§6.3), so it must be chunked. Posted to the existing
  `/api/payouts/ingest`.

---

## 10. Landmines

Written down now because all four of the MT5 farm's were found against a live
account rather than in documentation.

### 10.1 Token refresh terminates sessions

From `OpenApiMessages.proto`, verbatim:

> *"Event that is sent when a session to a specific trader's account is terminated
> by the server but the existing connections with the other trader's accounts are
> maintained. Reasons to trigger: account was deleted, cTID was deleted, **token
> was refreshed**, token was revoked."*

The **socket survives**; the affected accounts' sessions do not, and other
accounts on the same connection keep working. So the handler re-authorizes
exactly the accounts named in the event, then reconciles them — not the whole
connection.

### 10.2 The refresh token is consumed on use

Every refresh rotates it and kills the old one. Exchange and store must be one
transaction. A lost rotation means the user re-authorizes from scratch, so the
identity must expose a clear "reconnect" path rather than failing silently.

### 10.3 Authorization codes live 60 seconds

A slow callback fails in a way that looks exactly like a bad client secret.

### 10.4 Unit scaling

§8. The 100× silent-corruption case.

### 10.5 Partial closes

§8. One position, several closing deals.

### 10.6 Historical rate limit is 10× tighter

5/s versus 50/s. A backfill loop written against the general limit earns 429s;
`retryAfter` on the error is authoritative.

### 10.7 Demo and live are disjoint

An account authorized on the wrong socket fails in a way that reads as a
permissions problem. `is_live_env` is stored at discovery so this is decided once.

---

## 11. Frontend

Follows `docs/design/DESIGN-LANGUAGE.md` and the shadcn Base Rhea preset, like
all UI work. Structure is a locked invariant: this adds a branch to the existing
wizard, it does not restructure it.

- `PlatformStep` — cTrader flips from `soon` to `live` in
  `frontend/src/features/accounts/platformCatalog.js`, matching `enabled: true`
  and `connector: 'ctrader'` in `src/domain/sync/platforms.js`.
  `test/platform-catalog.test.js` pins the two together and will fail if only one
  side moves.
- `ConnectStep` — for cTrader, replaces the credential form with a "Connect
  cTrader" action that opens the grant URL.
- **New `CtraderAccountsStep`** — post-callback multi-select over discovered
  accounts, showing broker, currency, live/demo, and inception date. Accounts
  already claimed are shown disabled with the reason rather than hidden.
- Sync panel — an identity-level "Reconnect" affordance for an expired or
  rotated-away grant, alongside the existing per-account status.

Tailwind utilities compile only under `components/{ui,primitives}`. Any
caller-supplied dimension or column template is a prop, not a class.

---

## 12. Testing

- **Unit, no network:** deal → trade mapping against captured payloads, with
  explicit `moneyDigits` and volume-scaling cases; the login band round-trip;
  banded values never colliding with the MT5 range; `state` signing and
  single-use; token rotation persisting transactionally.
- **Query builders:** every new SQL builder exported as `{ text, values }` and
  asserted without a database, as `queue.js` and `statsSql.js` already do.
- **Drift pins:** extend `test/platform-catalog.test.js` and
  `test/connectors.test.js` to cover cTrader going live.
- **Live:** a **Pepperstone cTrader demo** — free, instant, non-expiring, 5
  permitted without a live account, and non-expiring matters because an account
  that dies in 30 days means re-doing the grant mid-build. IC Markets is the
  equivalent second choice.
- **Before flipping the catalog to `live`:** one real prop cTrader account (FTMO,
  Funding Pips and FunderPro all offer cTrader). Prop accounts are the actual
  product and a broker demo is only a proxy for them.

---

## 13. Phasing

| | Scope | Blocks |
|---|---|---|
| **P3a** | Register the Spotware app: description, redirect URIs for prod and dev | **everything** |
| **P3b** | Migration 0029, identity store, OAuth routes, `ctrader.js` connector | P3a |
| **P3c** | Worker: connect, app auth, discover, backfill, reconcile, push | P3b |
| **P3d** | Batched ingest endpoint | independent of P3a — can start now |
| **P3e** | Wizard branch, account picker, catalog flip | P3c |
| **P3f** | Equity into Prop OS, cash-flow history into payouts | P3c |

P3a is external and gates the rest, so it starts immediately and in parallel.
P3d depends on nothing and also improves the MT5 farm, so it can ship first and
on its own.

---

## 14. Risks and open items

1. **Spotware approval is external.** Review is reported at 24–48 h but is not
   contractual, and rejection is possible. The registration needs a genuine
   description of a trading journal reading account history.
2. **Retention depth is unverified.** The API accepts `fromTimestamp = 0`;
   whether the broker actually retains deals from years back is unknown until
   tested. Accepted knowingly — it will be answered by the demo account, and the
   backfill is correct either way since it stops when the data does.
3. **No real prop cTrader account yet.** §12. A prerequisite for going `live`,
   not a detail of it.
4. **The box.** §3.4. Stopping staging funds this; it does not fix the
   underlying sizing problem.
5. **`ProtoOADealListRes.hasMore` chunk semantics are documented loosely.** It
   reports "more records than chunkSize" without stating whether the returned
   chunk is the earliest or latest within the window. The design is written to be
   correct either way — forward paging inside a window, plus `dealId` dedupe —
   but it should be confirmed empirically.
6. **The read-only story now differs per platform.** MT5 enforces it by deleting
   trade-capable passwords; cTrader enforces it by scope. Both are true, and
   `credentialNote` already lives on the connector descriptor precisely so one
   platform's copy cannot be inherited by another.

---

## 15. Out of scope

- MT4 and TradeLocker connectors.
- Migrating `mt5_credentials` into a general multi-platform credential table.
  Deferred for the reason `connectors/index.js` gives: designing one before two
  real connectors exist produces a shape that fits neither.
- Renaming `/api/sync/*`, `mt5_accounts`, or `mt5_login` to platform-neutral
  names. Worth doing; not while also landing a connector.
- Re-keying `UNIQUE(mt5_login)` to `UNIQUE(platform, login)` (§4.2).
- Any trading operation. The `trading` scope is never requested.
