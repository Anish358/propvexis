# TradeLocker connector — design

**Status:** design for review. **One product decision blocks it** (§3).
**Date:** 2026-08-31
Extends `2026-08-22-add-account-flow-design.md` (which scoped this as **P2**) and
follows `2026-08-30-ctrader-connector-design.md`, whose connector registry,
banded-login scheme and batched ingest this reuses wholesale.

---

## 1. What this is

TradeLocker becomes the third Auto Sync platform. A trader connects a TradeLocker
account and their trades arrive with history, without an EA.

The plumbing is already built. `getConnector()` dispatches on the platform
registry, `sync_jobs.platform` routes work to the right fleet,
`POST /api/trades/ingest/batch` swallows a backfill, and `domain/sync/logins.js`
already reserves disjoint regions of the login space. What follows is almost
entirely about the three things that are **not** like the two connectors we have.

## 2. Why TradeLocker is harder than both MT5 and cTrader

| | MT5 farm | cTrader | **TradeLocker** |
|---|---|---|---|
| Credential | investor password (read-only exists) | OAuth, `accounts` scope | **the trader's real password** |
| Read-only guarantee | we check `trade_allowed` | Spotware enforces scope | **none available** |
| Closed trades | deals, given directly | deal + `closePositionDetail` | **must be reconstructed** |
| Delivery | poll | push + reconcile | **poll only** |
| Response shape | typed | protobuf | **positional string arrays** |
| Onboarding | credential form | one OAuth grant → many accounts | credential form → many accounts |

Three of those rows are new problems. The first is not an engineering problem at
all.

## 3. The credential problem — this needs a decision before any code

TradeLocker authenticates with **the trader's email, password and broker server**:

```
POST https://live.tradelocker.com/backend-api/auth/jwt/token
{ "email": "...", "password": "...", "server": "..." }
```

That is the same password they log into TradeLocker with. It is **fully
trade-capable**. There is no investor password, no read-only credential, no OAuth
and no scope.

This is exactly what the Phase A spec predicted as its first risk: *"The read-only
promise does not survive P2 ... a product decision, not a coding one."* It has now
arrived, and it is worse than it looks in isolation, because of what we say
elsewhere:

- The MT5 connector's `credentialNote` promises *"A password that can place trades
  is rejected and deleted on the first login."*
- The cTrader connector requests view-only scope and the code has a **policy test**
  asserting the trading scope is never requested.

Storing a trade-capable password for a funded prop account is a different category
of liability from either. If the box is compromised, or `SYNC_CRED_KEY` leaks, the
attacker can trade the trader's funded account — not merely read it.

### The three options

**(a) Ship Auto Sync with an explicit, unmissable consent step.** The credential is
sealed exactly as MT5's is (AES-256-GCM under an account-bound AAD), and the
connect step says plainly what is being stored and what it can do. Honest, and it
is what every TradeLocker integration in the market does — but it makes
"we can only ever read" false as a platform-wide claim, so the copy has to become
per-platform everywhere it appears.

**(b) Don't ship Auto Sync for TradeLocker.** Keep it at `file` and `manual`, which
work today and are already what the catalog offers. Costs us the feature; keeps
the security story clean and uniform.

**(c) Ship it, restricted to prop evaluation accounts.** A challenge account holds
no withdrawable money and the firm's own risk rules bound the damage. Live-capital
TradeLocker accounts stay file/manual. Narrower blast radius, but `capital_kind`
is user-declared, so the restriction is honour-system.

**Recommendation: (a), with the consent step built as a real gate rather than a
sentence.** (b) forfeits a platform a lot of prop firms use, and the risk is one
traders already accept with every other TradeLocker tool. But it is your call, not
mine, and it changes the product's security copy — so it is written here as a
decision, not assumed.

**Everything below assumes (a).** Under (b), §4–§9 do not get built.

## 4. Architecture

Unchanged in shape from cTrader, and simpler: **plain HTTPS, no socket.**

A Node worker leasing from `/api/sync/lease` with `platforms: ['tradelocker']`.
Because TradeLocker offers traders **no streaming API** — the trader-facing API is
request-response only — this is a **polling connector like MT5**, not a push
connector like cTrader. The existing 15-minute queue, backoff and reclaim
machinery is exactly right and needs no changes.

That also means it can share the cTrader worker's process. Both are outbound
HTTP/TLS clients with a token to refresh; there is no reason to run two Node
processes on a 911 MB box to do the same job for two vendors.

| | Base URL |
|---|---|
| Live | `https://live.tradelocker.com/backend-api/` |
| Demo | `https://demo.tradelocker.com/backend-api/` |

### 4.1 Two TradeLocker products — do not confuse them

TradeLocker sells two things with two audiences, and only one is ours.

| | Who it is for | How you get it |
|---|---|---|
| **Broker / prop-firm integration** (`tradelocker.com/integrate-tradelocker/`, nav → *Business*) | a company that wants to **become** a TradeLocker broker and offer the platform to its own clients — back-office setup for swaps, commissions, spreads, leverage, markups | **Contact Sales**, requirements review, sandbox, production key |
| **Public API for traders** (`public-api.tradelocker.com`, nav → *Traders*) | software acting **on behalf of an existing trader**, with that trader's own credentials — **this is us** | nothing; authenticate and go |

The Business page's "Obtain API Keys — once we've reviewed your requirements"
belongs to the first row and **does not apply to PropVexis**. TradeLocker never
has to vet us, because the trader authorises us with their own login. Their
getting-started page lists what is actually needed to make requests: credentials,
an `accountId`/`accNum`, and a JWT from `/auth/jwt/token`. No key.

This is written down because the marketing site makes the first product far more
visible than the second, and mistaking one for the other turns a non-blocker into
an imagined approval gate.

### 4.2 The Developer Program — not a gate, but start it early

Rate limits are per-route (a documented example is 2 req/s) and discoverable at
`/trade/config`. The docs say the Developer Program's `tl-developer-api-key` grants
less restrictive limits and is intended for *"multi-user solutions or requests from
a single IP address serving multiple accounts."*

That is a precise description of us: one EC2 box, one egress IP, every user's
account. **Without the key we would be rate-limited as though we were one trader**,
and that limit is shared across all our users.

But it is **not a blocker for development**: the API authenticates and returns
trades with no key at all, so the whole connector can be built and tested against a
demo account before anyone is contacted. It is a **pre-launch** item.

Honest limit of what is known: the docs call joining "recommended" for exactly our
use case, and the official Python client ships the placeholder
`tl-JOIN_TL_DEV_PROGRAM_TO_GET_ONE`. Whether joining involves a review or just a
form is **not documented**, so it is treated like Spotware's approval — started
early and in parallel — rather than assumed to be instant.

## 5. Data model

Much lighter than cTrader's, because the credential grain matches MT5's.

TradeLocker's credential is per **login** (email + server), and one login exposes
several accounts — so the grain is the same "one credential, many accounts" shape
cTrader has. But unlike cTrader there is no token to rotate at identity level: the
JWT is derived from the password on demand and lives about an hour.

That collapses the design considerably. **Reuse `mt5_credentials`**, which already
holds exactly `(account_id, server, password_ct, read_only, verified_at,
last_error)`:

- `server` ← the TradeLocker broker server string
- `password_ct` ← the account password, sealed under the existing
  `mt5-cred:<account_id>` AAD
- the email goes in a new nullable `login_email TEXT` column
- `read_only` is set to **FALSE and left there**, truthfully: this credential *can*
  trade. The column stops being "reject this" and becomes "this is what it is",
  which means `dueAccountsQuery`'s `c.read_only IS NOT FALSE` filter must be
  narrowed to MT5 or it will silently never schedule a TradeLocker sync.

> That filter is the single most likely way this ships broken and silent — the
> exact failure mode `credentials.js` documents for a job with no payload. It gets
> its own test.

```sql
-- migration 0030
ALTER TABLE mt5_credentials ADD COLUMN IF NOT EXISTS login_email TEXT;

ALTER TABLE mt5_accounts
    ADD COLUMN IF NOT EXISTS tl_account_id BIGINT,   -- TradeLocker's accountId
    ADD COLUMN IF NOT EXISTS tl_acc_num    INTEGER;  -- the accNum header value
```

`platform_login`, `is_live_env` and the banded-login machinery from 0029 are reused
as-is. TradeLocker takes the band at **5×10¹²**.

### 5.1 accNum is not accountId

Every `/trade/*` request needs an **`accNum` header** — a small ordinal (usually one
digit) identifying which of the login's accounts is meant — *in addition to* the
multi-digit `accountId` in the path. Both come from `/auth/jwt/all-accounts`.

Two numeric identifiers for one account, one of which is a tiny integer, is a
transposition bug waiting to happen: sending the wrong `accNum` returns *another of
the same trader's accounts*, cleanly and with a 200. Both are stored, and the
mapping is asserted, rather than either being recomputed at call time.

## 6. Reconstructing trades — the core of this connector

**There is no closed-positions endpoint and no realized-P&L field.** The trader API
offers open positions (`/positions`) and final orders
(`/ordersHistory`) — nothing that lists a completed trade.

This is the fundamental difference from both existing connectors. MT5 hands us
closed deals. cTrader hands us a closing deal carrying `grossProfit`, `swap`,
`commission` and the post-close balance. TradeLocker hands us **orders**, and a
completed trade has to be assembled from them.

The rule: **orders in `ordersHistory` carry a `positionId`; a trade is the pairing
of the order that opened a position with the order(s) that closed it.**

```
ordersHistory (status = Filled)
        │
        ├── group by positionId
        │
        ├── earliest fill  → entry price, open time, direction, qty
        └── later fills    → exit price, close time, closed qty
                                    │
                        P&L computed by us, not given
```

### 6.1 P&L is derived, and that is a real accuracy risk

With no realized-P&L field, money must be computed from entry, exit, quantity, the
instrument's contract size and quote currency (`/instruments`,
`/instrumentDetails`), minus commission, and converted when the quote currency is
not the deposit currency.

Every one of those steps is somewhere the number can be quietly wrong, and P&L is
not a cosmetic field here — `fixed_r` and every downstream R statistic derive from
it, and Prop OS decides rule breaches on it.

**Two mitigations, both required:**

1. **`/trade/accounts/{id}/state` is the oracle.** It returns the account's balance
   and P&L. After each sync the connector compares the sum of what it computed
   against what the broker says, and records the delta on the job's `stats`. A
   drifting delta is the alarm that the derivation is wrong — without it, the
   numbers are simply believed.
2. **Never invent precision.** Where the instrument metadata is insufficient to
   compute money confidently, `pnl_money` is written NULL rather than approximated.
   A missing number surfaces; a plausible wrong one does not.

### 6.2 Partial closes and reversals

A position can be closed in pieces, and several fills can share a `positionId`.
Consistent with cTrader: **one journal row per closing fill**, keyed
`mt5_ticket = <the closing order id>`. Not per position — that would make each
partial close rewrite the last.

## 7. Responses are positional arrays, and the column order is config-driven

`ordersHistory` does not return objects. It returns arrays of strings:

```json
{ "s": "ok", "d": { "ordersHistory": [["4242","...","1.0925", ...]], "hasMore": false } }
```

The meaning of each index comes from **`GET /trade/config`**, which publishes the
field names for `positions`, `orders`, `ordersHistory`, `filledOrders` and
`accountDetails`, along with the per-route rate limits.

**Hardcoding indices is forbidden.** The connector fetches `/trade/config` once per
worker start, caches it, and resolves every field **by name**. If a name it needs is
absent from the config, it fails the job loudly rather than reading position 8 and
hoping.

The reason is not hypothetical: TradeLocker publishes this layout dynamically
precisely because it is theirs to change, and a silent column shift would move
`commission` into `price` and corrupt every trade with no error anywhere. It is the
same class of bug as cTrader's `moneyDigits`, with a different mechanism.

Everything is also **stringly typed** — numbers arrive as strings and must be
parsed, with an empty string meaning null, not zero.

## 8. Ingestion

Polling, on the existing 15-minute cadence, through `/api/trades/ingest/batch`.

**Cadence (amended 2026-08-31):** the unattended interval is **3 hours**, not the
15 minutes the queue originally used, and the manual button carries a **15-minute
server-side cooldown**.

For TradeLocker this is not a preference, it is the difference between the platform
working at scale and not. Rate limits are per-route and shared across every user,
because every request leaves one box from one egress IP. At 1000 accounts and ~3
requests per sync:

| Cadence | Requests per window | Sustained rate | Fits a low-single-digit per-route limit? |
|---|---|---|---|
| 15 min | ~3,000 inside each 15 min | ~3.3 req/s, bursty | **no** |
| 3 h | ~3,000 spread over 3 h | ~0.3 req/s | yes |

The cooldown matters for the same reason and must be enforced by the endpoint, not
by a disabled button: the partial unique index only prevents a pile-up while a job
is *open*, so without it an account is pressable again the instant one finishes.
One impatient trader would degrade every other customer's sync.

The cost is honest and should be stated in the UI: a trader who closes a position
and does not press Sync now sees it **up to three hours later**. `queue.js` already
argues a journal is a historical record rather than a trading signal, and the
manual button covers the impatient case.

**Backfill:** `ordersHistory` accepts `from`/`to` as Unix ms and returns `hasMore`
with a per-request row cap read from `/trade/config`. So the same newest-first,
30-day-window walk the cTrader spec defines applies unchanged, and for the same
reason: the trader sees recent trades within seconds while older history fills in
behind.

There is no `registrationTimestamp` equivalent, so the floor is "walk back until a
window returns nothing and the one before it returned nothing" rather than a known
date. Two consecutive empty windows terminate the backfill — one is not enough,
because a trader can easily take no trades for a month.

**Token lifecycle:** the JWT lasts roughly an hour. Refresh via
`/auth/jwt/refresh`; if refresh fails, re-authenticate from the stored password.
That fallback is the one advantage of holding a password rather than a token — a
TradeLocker connection cannot be permanently lost the way a cTrader grant can when
a refresh-token rotation is dropped.

## 9. Landmines

1. **`read_only IS NOT FALSE`** silently excludes every TradeLocker account from
   scheduling (§5).
2. **`accNum` vs `accountId`** — wrong `accNum` returns a *different account of the
   same trader*, with a 200 (§5.1).
3. **Config-driven column indices** — a shifted column corrupts every field after
   it, silently (§7).
4. **Stringly-typed numbers** — `""` is null, not zero; `Number("")` is `0` and
   would post a real trade with zero commission.
5. **Derived P&L** — no realized-P&L field exists; reconcile against `/state` or
   the numbers are merely believed (§6.1).
6. **Shared rate limits across all users** — one egress IP, per-route caps. Without
   the Developer Program key, one busy user starves everyone else (§4.1).
7. **Demo and live are different hosts** — same as cTrader; decided once at
   discovery and stored.

## 10. Frontend

The Add Account wizard's existing `ConnectStep` credential form covers this: three
fields (email, server, password) instead of MT5's three (server, login, password).
No new step type is needed — the form is already driven by the registry's
`credentialFields`.

What **is** new is the consent gate from §3. Under option (a) the connect step must
state, before the password field, that the credential can place trades and that we
store it encrypted and use it only to read. `credentialNote` already exists on the
platform descriptor for exactly this and is already per-platform, so MT5's
read-only promise cannot be inherited here by accident.

## 11. Testing

- **Unit, no network:** order-pairing into trades (including partial closes and a
  position closed across two windows); config-driven column resolution, including
  the failure when a required name is missing; stringly-typed parsing where `""`
  must become null and not zero; the band round-trip at 5×10¹².
- **Regression pin:** a test asserting `dueAccountsQuery` schedules a TradeLocker
  account whose credential is `read_only = FALSE` (landmine 1).
- **Fixtures:** captured real `ordersHistory` and `/trade/config` payloads, because
  a positional format cannot be tested against a guessed shape.
- **Live:** a TradeLocker demo account before any of this is trusted.

## 12. Phasing

| | Scope | Blocks |
|---|---|---|
| **P2a** | **Your decision on §3** | everything |
| **P2b** | Join the Developer Program, obtain `tl-developer-api-key` | P2a |
| **P2c** | Migration 0030, band, connector module, config-driven parsing, order pairing — all pure, all testable | P2a |
| **P2d** | Worker: auth, refresh, discovery, backfill, poll | P2c + a demo account |
| **P2e** | Wizard consent gate, catalog flip | P2d |

P2c is most of the work and needs no credentials — the same split that let the
cTrader foundation ship before Spotware answered.

## 13. Risks and open items

1. **§3 is unresolved and blocks the whole connector.**
2. **Derived P&L may not reconcile.** If computed money drifts from `/state` on a
   real account, the connector is not shippable at any level of effort, and we will
   only learn that against a live account. **This is the single largest technical
   risk and it should be the first thing P2d proves** — before the wizard, before
   the catalog flip.
3. **Rate limits are per-route and undocumented in absolute terms.** They come from
   `/trade/config` at runtime, so capacity planning for 1000 users cannot be done
   from documentation. Measure early.
4. **No test account yet.** Same prerequisite as cTrader, and a TradeLocker demo is
   less freely available than a broker MT5 demo — it generally comes through a
   broker or prop firm.
5. **The security copy becomes per-platform.** Under option (a), any surface that
   says PropVexis only ever reads must be audited. `credentialNote` handles the
   connect step; marketing copy on propvexis.com is a separate repo and a separate
   pass.

## 14. Out of scope

- MT4.
- Any trading operation. We hold a trade-capable credential under option (a) and
  must never use it to trade — a rule the code should enforce, not merely observe:
  the connector module exposes no order-placing function at all.
- Generalizing `mt5_credentials` into a multi-platform table. With TradeLocker
  reusing it and cTrader deliberately not, the second real connector has now shown
  the shape — worth revisiting *after* this ships, not during.
