# Amey Journal ("PATIL TRADES")

Trading journal for prop/retail traders: ingests closed MT5 trades (via an EA),
stores them in Postgres, shows R-based analytics. Being built into a **public
multi-tenant SaaS**. Live at https://journal.anishdevlops.xyz.

## Stack
- **Backend:** Node (ESM) + Fastify 5, `pg` Pool, Socket.IO. Entry `src/server.js`.
- **Frontend:** React 18 + Vite 6 + React Router 6, Recharts, lightweight-charts. Entry `frontend/src/main.jsx`.
- **DB:** PostgreSQL 16. Migrations in `db/migrations/` (runner `scripts/migrate.js`); base schema `db/schema.sql`.
- **Auth:** Google OAuth → JWT httpOnly cookie. Open signup gated on `OPEN_SIGNUP`. Data isolated per `user_id`.
- **Observability:** Sentry (backend `src/instrument.js` + frontend, gated on DSN); Route53 uptime → SNS email.

## Key backend modules (`src/`)
- `server.js` routes + Socket.IO · `config.js` env · `db.js` pool · `auth.js`+`access.js` login/allowlist · `accounts.js` scoping (`resolveScope`, god view) · `payouts.js` · `candles.js` replay · `aggregations.js` dashboard stats (computed in JS over trades) · `derive.js` money-math (pips, `fixed_r`, `max_r`).
- Analytics are **R-based** (`fixed_r`) in god view, **$** (`pnl_money`) per single account.

## Commands
- Test: `npm test` (node:test, `test/*.test.js`)
- Dev: `npm run dev` (backend) · `cd frontend && npm run dev`
- DB: `npm run db:migrate` · `npm run db:backup`
- Frontend build: `cd frontend && npm run build`

## Workflow rules (important)
- Work on **`dev`**; ship via **PR `dev` → `main`**. Merge to `main` auto-deploys (GitHub Actions → EC2).
- **Never self-merge PRs to `main`** — the user merges (the auto-approval classifier blocks agent self-merge). Open the PR and hand off with the URL.
- Keep tests green: CI runs `npm test` on every PR + `dev` push (`.github/workflows/ci.yml`) and again before deploy (`deploy.yml`). **Add a test with each feature** (`test/`).
- Commit messages end with the `Co-Authored-By` line.
- `.env` is NOT in the repo and NOT rsynced by deploy — prod env lives on the box only.

## Deploy / prod
- Merge to `main` → `deploy.yml`: test → build frontend → rsync `src db scripts ea` + `frontend/dist` to EC2 `/opt/amey-journal` → `npm install` → migrate → `pm2 restart amey-backend`.
- Box: single EC2 (Mumbai), Caddy reverse-proxy (`/api/*`, `/socket.io/*`, `/health` → `:3000`; else SPA), native Postgres 16, pm2 (`amey-backend`). SSH: `ssh -i ~/.ssh/amey-journal.pem ubuntu@13.205.66.72`.
- Backups: nightly `/opt/amey-backup` → local `/var/backups/amey` + S3.

## Evolving state
Current status, decisions, and history live in the **auto-memory** (`MEMORY.md`
index loads each session; detail files are recalled on relevance). **Update
memory after each feature/fix.** Don't duplicate that history here — this file is
for stable facts only.

## Direction (next)
Public SaaS. Next up: **connector layer** — pluggable trade-sync sources feeding
the existing `POST /api/trades/ingest` seam (CSV/EA free, MetaApi paid). Build
plan-first; run `/security-review` on any credential handling. Docker + a sync-
worker fleet come bundled with MetaApi, later.
