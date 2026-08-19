# Self-hosted MT5 sync farm — design

**Date:** 2026-08-18 · **Status:** BUILT AND WORKING (see "As built" at the end) · **Supersedes:** the MetaApi
path in the `saas-broker-integration` memory (rejected 2026-07-28).

## Problem

Trades taken on the MT5 **mobile** app never reach the journal. The EA only runs
inside a desktop terminal, so a trader without a PC — or with a PC that is off —
has an incomplete journal. That is also the single biggest onboarding friction
for the SaaS: "install an EA on a Windows machine you leave running" is not an
onboarding flow.

The fix is to move the terminal server-side: we run MT5 ourselves, log in with
the trader's **read-only investor password**, and read closed trades out of
account history.

Note for scope honesty: for the one existing user, `InpBackfillDays` in the EA
already backfills mobile trades whenever the desktop terminal opens. This project
exists for users with **no PC at all**, which is the product case, not the
friend case.

## Decisions (settled during design)

| Decision | Choice |
|---|---|
| Scale target for v1 | Single box, worker pool of one, proven on one account |
| Credentials | **Investor (read-only) password only**, AES-256-GCM at rest |
| Feed parity | Trades + payouts + balance/equity snapshot. Replay candles are a fast-follow |
| Trigger | Every ~15 min in market hours, plus a manual "Sync now" |
| Transport | Pull-based agent over HTTPS; Postgres job queue |
| Host | ~~Lightsail~~ → **EC2 `t3.medium` Windows Server 2022, `ap-south-1`** (the Lightsail free trial turned out to be retired, and Lightsail bills a stopped instance in full; only EC2 truly pauses) |

### Why pull-based over HTTPS

Native Postgres on the app box binds to localhost, so an off-box worker cannot
reach the database at all. HTTP is the only honest transport. It also means the
Windows box needs **no inbound ports**, no VPN, and no Redis — which matters
because Redis is still unprovisioned.

Rejected: pushing from the backend to a service on the Windows box (opens a port
on the host holding other people's credentials, and puts retry state in the API);
a shared Redis/BullMQ queue (needs Redis exposed across providers).

## Architecture

```
Lightsail Windows (ap-south-1)          app box (EC2, ap-south-1)
┌───────────────────────────┐           ┌──────────────────────────┐
│ agent.py (Windows service)│           │ Fastify                  │
│  ├── POST /api/sync/lease ├──────────►│  routes/sync.js          │
│  │      ← job + password  │           │  domain/sync/queue.js    │
│  ├── MT5 terminal (warm)  │           │  domain/sync/credentials │
│  │      mt5.login(...)    │           │  platform/secretbox.js   │
│  ├── POST /api/trades/ingest ────────►│  (the EXISTING 4 ingest  │
│  │    /api/payouts/ingest ───────────►│   endpoints, unchanged)  │
│  │    /api/equity/ingest  ───────────►│                          │
│  └── POST /api/sync/jobs/:id/result ─►│  Postgres: sync_jobs     │
└───────────────────────────┘           └──────────────────────────┘
```

The worker is, precisely, `ScanHistoryBackfill()` from `ea/PropVexis.mq5`
rewritten in Python. It posts the **same JSON** to the **same endpoints** with
the account's own `ingest_token`, so dedup (`UNIQUE (account_id, mt5_ticket)`),
money-math derivation and alerting all happen exactly as they do for the EA.
**No change to any ingest route.**

### One terminal, serial queue

2 GB of RAM holds Windows Server plus one MT5 terminal, so the pool is one warm
terminal and the queue is strictly serial — which is also the simplest correct
design. Two facts make it work:

- `mt5.login(login, password, server)` re-points an **already-running** terminal
  at another account, so we never pay the ~10–20s process launch per job.
- The Python package holds one terminal connection per process and MT5 caps 32
  terminals per session — neither binds a serial worker.

### Per-firm terminal builds

Prop white-label servers (`GoatFunded-Server` included) are often absent from the
MetaQuotes server list, so each firm needs **its own portable MT5 install** (the
firm's build ships the `.srv` file). A registry maps firm → installer → portable
directory; the setup script consumes it, and adding a firm is a registry entry
plus one manual download. This part never fully automates.

## Data model (migration `0025_mt5_sync.sql`)

```
mt5_credentials
  account_id   BIGINT PK REFERENCES mt5_accounts(id) ON DELETE CASCADE
  server       TEXT NOT NULL          -- MT5 server name
  firm_key     TEXT                   -- which portable build to use
  password_ct  TEXT NOT NULL          -- 'v1.<iv>.<tag>.<ct>' base64, AES-256-GCM
  read_only    BOOLEAN                -- NULL until first login; FALSE => master password, rejected
  verified_at  TIMESTAMPTZ
  last_error   TEXT
  created_at, updated_at

sync_jobs
  id, account_id → mt5_accounts(id)
  status       TEXT  -- queued | leased | done | failed
  reason       TEXT  -- schedule | manual | first_sync
  attempts     INT
  run_after    TIMESTAMPTZ           -- backoff
  leased_by, leased_at, lease_expires_at
  finished_at, error, stats JSONB
  UNIQUE (account_id) WHERE status IN ('queued','leased')   -- no per-account pileup

sync_workers
  worker_id PK, last_seen, version, note                    -- heartbeat
```

The partial unique index is the whole anti-pileup mechanism: a manual sync while
one is already queued is a no-op, not a second job.

## API

Worker-authenticated (bearer token, `SYNC_WORKER_TOKEN`, timing-safe compare):

- `POST /api/sync/lease` → `{ jobs: [{ id, login, server, firm_key, password, ingest_token, since }] }`
- `POST /api/sync/jobs/:id/result` → `{ worker_id, ok, stats }` or `{ worker_id, ok: false, error }`.
  The account the result applies to is read from the **job row**, never from the
  body, and the caller must hold the job's lease (`leased_by = worker_id`).
  Security review found the first cut trusted a body-supplied `account_id`, which
  let any token-holding caller mark another tenant's credential "verified
  read-only" with no login, or delete it.
- `POST /api/sync/heartbeat` → records `last_seen`

User-authenticated (session cookie):

- `PUT /api/accounts/:id/credentials` — investor password in, ciphertext stored, never returned
- `DELETE /api/accounts/:id/credentials`
- `POST /api/accounts/:id/sync` — manual enqueue, throttled

## Security

1. **Investor-only is enforced, not promised.** After login the agent reads
   `account_info().trade_allowed`. If it is `True` the user supplied a *master*
   password: the agent reports `read_only: false`, the backend **deletes the
   credential** and surfaces "supply the investor password". A policy the code
   checks, not a line in a ToS.
2. **Encryption at rest.** AES-256-GCM, 32-byte key from `SYNC_CRED_KEY` (SSM
   SecureString). Ciphertext carries its own version prefix so the key can be
   rotated later. The plaintext is never logged, never returned by any read API,
   and never written to the response of an account fetch.
3. **No AWS credentials on the Windows box.** The agent holds only the worker
   bearer token and the API base URL, in a local config file. Blast radius of a
   compromised box is: the credentials of accounts synced during the window —
   all read-only — and nothing in AWS.
4. **Static IP allowlist** on the sync routes, plus the rate-limit allowlist
   below.
5. **Inherent risk, stated plainly:** the plaintext investor password reaches the
   agent's memory. Every self-hosted design has this property; a key-on-box
   variant makes it worse by adding the master key to the same host.

### Rate limiting

The global guard is 300 req/min per IP. A first-run backfill of 200 trades is 200
POSTs in a burst and would throttle itself. So `RATE_LIMIT_ALLOWLIST` (comma-
separated) is added to config and appended to the limiter's `allowList`; the
Lightsail static IP goes in it. The agent still chunks and paces its posts.

## Failure handling

- **Backoff:** `attempts` drives `run_after` (1m, 5m, 15m, 1h, capped), `failed`
  after 5 attempts with the error kept for the UI.
- **Lease expiry:** a job leased longer than `lease_expires_at` returns to
  `queued` — an agent that dies mid-job does not strand the account.
- **Dead box:** the agent heartbeats; `last_seen` older than ~15 min raises a
  notification through the existing alerts layer. Otherwise a dead single box
  means syncing stops silently.
- **Never trust the terminal's clock:** `since` comes from the backend (last
  synced close time minus a lookback), not from the box.

## Disposability (this is what "flexible hosting" actually buys)

The box must be rebuildable from a script: portable MT5 installs per firm,
Python, the agent, service registration, config. Provider choice then stops being
a commitment — at launch we can compare Lightsail ($22/mo), Contabo India
(~$12/mo for 4 vCPU / 8 GB), Vultr (~$36/mo) or a Linux+Wine box (~$5/mo) and
move by re-running the script.

## Cost

| Phase | Cost |
|---|---|
| Build + test (actual) | **~$0.40** — EC2 hourly, stopped between sessions |
| Idle | **~$2.74/mo** — 30 GB gp3 only, compute billing stops |
| Live 24/7 | $46/mo on t3.medium, or ~$12/mo on Contabo India (4 vCPU / 8 GB) |

Capacity, now MEASURED rather than estimated: a warm incremental sync takes **0.15s**
and a cold one **20s** (19s of that the launch settle). The 90s/account assumption was
very conservative, so the 150–300 accounts/box figure holds comfortably. Against
MetaApi's ~$9/account/month, self-hosting is ~$0.10–0.15.

## Build order

1. Migration + `platform/secretbox.js` + `domain/sync/{credentials,queue}.js` + tests
2. `routes/sync.js` + app wiring + config + rate-limit allowlist + tests
3. Scheduler (enqueue due accounts, market-hours aware)
4. `agent/` Python: lease → login → `trade_allowed` check → history scan → post → result
5. Windows box setup script + runbook
6. Frontend: credential form, sync status, "Sync now"
7. `/security-review` on the credential path (CLAUDE.md requires it)

## Open risks

- **Unverified:** whether our login disturbs the trader's live mobile session.
  Test on the friend's GFT account before onboarding anyone. Mitigated by the
  investor password being a separate credential.
- **Unverified:** whether GFT issues investor passwords at all. If not, the
  investor-only policy blocks that firm and we say so rather than accepting a
  master password.
- **Prop-firm ToS** on third-party credential use varies by firm; a per-firm
  compatibility list is needed before public launch.
- **2 GB is tight.** Fine for one account; production may need the $44 4 GB
  bundle or a cheaper 8 GB box elsewhere.

---

## As built (2026-08-18)

Working end to end: a trade taken on the **mobile app** reaches the journal, and the
broker itself confirms the credential is read-only (`trading has been disabled -
investor mode`). Four things differ from the design above, each learned by running it:

1. **The host is EC2, not Lightsail.** The Lightsail 3-month free trial is retired,
   and both Lightsail and Vultr bill a *stopped* instance in full. Only EC2 pauses.
2. **The box has an IAM instance profile**, which this spec said it would not. It is
   scoped to SSM management plus read of exactly two parameters the box already holds
   — no added blast radius, and strictly better than passing secrets through Run
   Command, where they would persist in console history in plaintext.
3. **The agent must run in an interactive session.** MT5 in session 0 has no window
   station, so the terminal starts and its IPC never comes up. The box autologons as a
   dedicated standard user.
4. **`Allow algorithmic trading` must be ON** (Tools > Options > Experts; off by
   default). With it off the terminal starts, logs in, serves a pipe a same-user
   process can open — and refuses the API with `IPC timeout`, logging nothing. The
   agent now sets it via an MT5 startup config so a rebuilt box does not depend on a
   GUI setting.

Two ordering rules that are not obvious and are load-bearing: never pass credentials
to `mt5.initialize()`, and never re-login to the account the terminal already holds.
Both disconnect a working session and hang. `agent/README.md` has the detail.

Still open: merge to `main` + prod/staging SSM params, the heartbeat alert (a dead box
still stops syncing silently), and replay-candle parity.
