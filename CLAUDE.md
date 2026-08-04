# Amey Journal ("PropVexis")

Trading journal for prop/retail traders: ingests closed MT5 trades (via an EA),
stores them in Postgres, shows R-based analytics. Being built into a **public
multi-tenant SaaS**. Live at https://app.propvexis.com (old domain
https://journal.anishdevlops.xyz still served during migration).

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

## Visual design system (governs ALL UI work)
- **Source of truth:** `docs/design-system/DESIGN-LANGUAGE.md` (untracked). Every
  UI decision — human or AI — must trace to a rule in it. *"It looks better"* is
  not a justification.
- **Visual foundation:** the shadcn **Build Your Own** preset **`b2qKmlY80`** —
  🔒 LOCKED 2026-08-04. Applied with
  `pnpm dlx shadcn@latest apply --preset b2qKmlY80` (Existing Project → Full
  preset: components + theme + fonts).
- The preset owns the **global** layer: typography, font sizing, spacing, radius,
  density, shadows, borders, colours, default component styling. **Never fall
  back to stock shadcn styling; never invent a new visual style.** On any
  conflict with shadcn defaults, the preset + DESIGN-LANGUAGE.md win.
- DESIGN-LANGUAGE.md **extends** the foundation with PropVexis-specific rules
  (trading semantics, KPI/chart conventions, prohibitions). It does not restate
  foundation values — a missing value there is deliberate.
- **Structure is a locked invariant:** layouts, information hierarchy, user
  flows, interactions, responsive behaviour and business logic do NOT change for
  visual work. Only the visual implementation follows the design language.
- Changing a foundation value requires owner approval + a new preset ID +
  a matching DESIGN-LANGUAGE.md amendment, committed together.
- Migration sequencing: `docs/architecture/UI-MIGRATION-PLAN.md` (untracked).

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

## Direction (roadmap)
**The roadmap is governed by `Plan.md` v2** (repo root, UNtracked from git):
module-centric, status-annotated, backed by the product/UX docs in
`Foundational_files/` (also untracked). MVP + Beta + V1 milestones are done.
We **extend the current Node/Fastify + React stack** — the docs' suggested
greenfield stack (Next.js/FastAPI/etc.) is vision only, not a rewrite. Work
plan-first, one feature at a time; add a test with each; run `/security-review`
on any credential handling. Benchmark product: **TradeZella** (see Plan.md
"Reference" section).

- **Now (top priority): scale & hardening to the ≥1000-concurrent-user bar** —
  pg pool `max`/timeouts → aggregations into SQL `GROUP BY` + per-scope cache →
  pm2 cluster → Socket.IO Redis adapter → managed off-box Postgres + re-enable
  Prometheus/Grafana after an instance upsize.
- **Then:** Razorpay go-live → quick fixes (expectancy, adherence column,
  Dependabot/Trivy) → Design B (empty/loading states, mobile, a11y) → connector
  layer (**self-hosted MT4/5 farm — MetaApi is rejected**, then cTrader,
  TradeLocker, DXtrade/Match-Trader, Tradovate + a separate sync-worker fleet and
  credential encryption) → journal depth → platform shell → V2.
- Sub-nav restructure, prop-firm rule templates, and the Prop OS Overview
  build-out are **done**. Ordering detail lives in the auto-memory
  `now-execution-queue`.
