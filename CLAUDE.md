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
- **Observability:** Sentry (backend `src/platform/instrument.js` + frontend, gated on DSN); Route53 uptime → SNS email.

## Backend layout (`src/`)
- `server.js` entry (hydrates SSM secrets, then imports the app) · `app.js` **wiring only** — Fastify, raw-body JSON parser, CORS, rate limit, auth, Socket.IO, Redis, the RED-metrics hook, boot/shutdown. It registers **no routes**.
- `routes/` the HTTP layer, one module per domain (`trades accounts strategies candles payouts prop journal analytics notifications billing system`). Each exports `function xRoutes(app, ctx)` and is **called on the root app instance, never `app.register()`-ed** — a registered plugin is encapsulated and its routes would not see `app.requireAuth` or the global rate-limit hook. Pinned by `test/routes-split.test.js`.
- `platform/` infrastructure, no domain model: `config db redis secrets cluster instrument paths metrics statsBus statsCache calendar` + `platform/auth/` (`auth access onboarding credentials`).
- `domain/<area>/` business logic, mirroring `routes/`: `trades/` (`derive` money-math, `csv`, `adherence`, `strategies`, `candles` replay) · `accounts/` (`accounts` scoping — `resolveScope`, god view) · `prop/` (`prop` engine, `challenges`, `propOverview`, `insights`) · `finance/` (`payouts fees finance`) · `journal/` (`dayNotes viewState`) · `analytics/` (`aggregations statsSql reports`) · `billing/` (`plans entitlements payments`) · `alerts/`.
- Analytics are **R-based** (`fixed_r`) in god view, **$** (`pnl_money`) per single account.
- Never build a path by counting `..` from `import.meta.url` — use `platform/paths.js`, which finds the repo root. Doing the arithmetic broke the EA download silently once.

## Commands
- Test: `npm test` (node:test, `test/*.test.js`)
- Dev: `npm run dev` (backend) · `cd frontend && npm run dev`
- DB: `npm run db:migrate` · `npm run db:backup`
- Frontend build: `cd frontend && npm run build`

## Visual design system (governs ALL UI work)
- **Source of truth:** `docs/design/DESIGN-LANGUAGE.md` — 🔒 LOCKED 2026-08-29, rewritten
  from the shipped dashboard. Every UI decision — human or AI — must trace to a rule in
  it. *"It looks better"* is not a justification. It holds RULES only; values live in
  `frontend/src/styles/tokens.css`, and the colour derivation in
  `docs/design/dashboard/COLOUR-INVENTORY.md`.
- **Visual foundation:** the shadcn **Build Your Own** preset **`b2qKmlY80`**, style
  **Base Rhea** — 🔒 LOCKED. The preset owns the global layer: typography, sizing,
  spacing, radius, density, shadows, borders, colours, default component styling.
  **Never fall back to stock shadcn styling; never invent a new visual style.**
- **shadcn is the DEFAULT component system.** Before building any UI, check whether the
  registry ships it and install rather than recreate — Button, Card, Dialog, Dropdown,
  Select, Tabs, Tooltip, Sheet, Command, Table, Badge, Input, Sidebar. Search with the
  shadcn MCP (`.mcp.json`, pointed at `frontend`). **Install under `style: base-rhea`**:
  the registry serves a different implementation per style, and this project is Base UI,
  not Radix (the default manifest's `radix-ui` dependency is not what you get).
  Customise the generated component's STYLING in a wrapper; never fork it.
- **Build order** (DESIGN-LANGUAGE §1): existing `@/components/primitives` → registry →
  a composition of those → hand-written last, with an argument in the file.
- Generated components land in `components/ui/` and are **not edited in place** —
  differences go in a thin wrapper under `components/primitives/`, which is what
  application code imports.
- **Structure is a locked invariant** (§2): layouts, hierarchy, flows, interactions,
  responsive behaviour and business logic do NOT change for visual work — and a feature
  the design omits is not deleted. Equally, do not build a control the product cannot
  honour.
- **The dashboard is BUILT** and is the reference implementation for every other page.
  Read `features/dashboard/` and `components/primitives/{rail,topbar,brief,kpi,account,
  panel,calendar}.jsx` before starting a new surface; most "new" surfaces are a
  `PanelCard` with different children. The prototype it was built from is in
  `docs/design/dashboard/`. Everything except the dashboard still runs on the old look.
- **Tailwind utilities compile ONLY under `components/{ui,primitives}`**
  (`tailwind.css` `@source`). A utility class written in a page emits nothing,
  **silently** — so a caller-supplied dimension, alignment or column template is a
  PROP, not a class. This has cost real debugging time five times; §1 lists them.
  `hidden` also does nothing against an author `display` — conditionally render.
- **Legacy CSS is the LOWEST cascade layer** (`layer(legacy)`), so it outranks nothing.
  `tokens.css` stays unlayered and still wins. It cannot be deleted yet: ~800 of its
  1,025 classes are still live, mostly Prop OS, the Trade Log and the Calendar page.
  Its `--neutral-*` / `--tint-*` tokens are fenced off at the bottom of `tokens.css` —
  **do not reach for one in new work.**
- Changing a foundation value requires owner approval + a new preset ID + a matching
  DESIGN-LANGUAGE amendment, committed together.
- Migration sequencing: `docs/architecture/UI-MIGRATION-PLAN.md` (untracked). It numbers
  its own sections: a `§9`/`§19`/`§22` citation in `components/primitives/` may refer to
  THAT file — DESIGN-LANGUAGE §20 is the citation index that disambiguates.

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
