# Amey Journal — Backend (Step 1)

Ingests closed MT5 trades, stores them in Postgres, and broadcasts them live over
WebSocket so the (future) frontend updates the instant a trade closes.

```
[MT5 EA] --HTTPS POST--> /api/trades/ingest --> Postgres --> Socket.IO broadcast --> frontend
```

## Stack
- **Fastify 5** — HTTP API
- **Socket.IO** — real-time push to the UI
- **PostgreSQL** — single `trades` table (Summary/Yearly are aggregations over it, added later)

## Setup

Requires Node 20+ and a reachable Postgres.

```bash
npm install
cp .env.example .env        # then edit values
npm run db:setup            # creates the DB (if missing) + applies db/schema.sql
npm run dev                 # starts the server on $PORT (default 3000)
```

### Local Postgres note (this machine)
Port 5432 is taken by an EnterpriseDB PostgreSQL 17 install (password-protected).
For development we run the Homebrew `postgresql@16` cluster (trust auth) on **5433**:

```bash
/opt/homebrew/opt/postgresql@16/bin/pg_ctl \
  -D /opt/homebrew/var/postgresql@16 -o "-p 5433" \
  -l /opt/homebrew/var/postgresql@16/server-5433.log start
```

`.env` is already pointed at `postgres://floki@127.0.0.1:5433/amey_journal`.

## Endpoints

| Method | Path                  | Auth                | Purpose |
|--------|-----------------------|---------------------|---------|
| GET    | `/health`             | —                   | liveness + DB check |
| POST   | `/api/trades/ingest`  | `X-Ingest-Token`    | EA pushes a closed trade (idempotent upsert by `account_id`+`mt5_ticket`) |
| GET    | `/api/trades`         | —                   | list newest first; `?tagged=true|false&limit=N` |
| PATCH  | `/api/trades/:id`     | —                   | tag discretionary fields (setup, probability, mtf_phase, urls, comments) |
| GET    | `/api/stats`          | —                   | dashboard analytics: headline KPIs + breakdowns + equity curve + R-distribution + MFE efficiency |
| GET    | `/api/yearly`         | —                   | `?year=YYYY` monthly performance overall + per strategy |

### Ingest payload (from the EA)
Required: `mt5_ticket, account_id, symbol, direction, open_time, close_time, entry_price, exit_price`.
Optional: `sl_price, tp_price, volume, commission, pnl_money, sl_size_pips, mfe_pips, session`.

The backend fills gaps it can derive (see `src/derive.js`):
- **session** from `open_time` (UTC-hour heuristic; user can override when tagging)
- **sl_size_pips** from `|entry - sl|` if the EA didn't send it
- **max_r** = `mfe_pips / sl_size_pips`
- **fixed_r** = realized R multiple from entry/sl/exit

> The EA is the authoritative source for pip-based values (it knows each symbol's
> tick size). The derived fallbacks use a pip-size table in `src/derive.js` — adjust
> `XAUUSD` etc. there if needed.

### Idempotency
Re-sending the same `(account_id, mt5_ticket)` **updates mechanical fields but never
overwrites the user's tags**. Safe for EA retries / reconnects.

## Real-time events
Socket.IO emits on every change — the frontend subscribes to these:
- `trade:upserted` — new/updated trade from ingest
- `trade:updated`  — trade after tagging

## Smoke test
With the server running:
```bash
npm run smoke         # connects a WS client, POSTs a sample trade, confirms the broadcast
npm run test:ea       # POSTs the exact EA payload shape, checks derived pips/R
npm run import:sheet  # import historical trades from the Google Sheet "Trades" tab
```

## Project layout
```
db/schema.sql            trades table, indexes, updated_at trigger
db/migrations/           incremental schema changes (symbol_base, import source)
src/config.js            env config
src/db.js                pg pool
src/derive.js            session / pips / R / symbol normalization
src/aggregations.js      dashboard analytics (summary + yearly)
src/server.js            Fastify + Socket.IO + routes
scripts/setup-db.js      create DB + apply schema
scripts/smoke-ingest.js  end-to-end smoke test
scripts/test-ea-payload.js  EA JSON contract test
scripts/import-sheet.js  import historical trades from Google Sheet
ea/                      MQL5 Expert Advisor (see ea/README.md)
frontend/                React UI: live trades grid + dashboards (see frontend/README.md)
```

## Status
- ✅ Backend ingest + WebSocket, EA (with offline backfill), live trades UI, tagging.
- ✅ Historical import (39 trades) + Summary/Yearly dashboards — reconciled to the sheet.
- ⏳ Deploy: see `DEPLOY.md` (single AWS Linux box, Mumbai).
- ⏳ Expectancy formula: currently standard `total R / trades`; swap to match the sheet's
  `0.54` once the exact cell formula is confirmed (one line in `src/aggregations.js`).
