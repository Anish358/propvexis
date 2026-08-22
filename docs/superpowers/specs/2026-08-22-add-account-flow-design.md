# Add Account flow — page-based wizard, capital separation, connector seam

**Date:** 2026-08-22 · **Status:** design approved, not implemented · **Branch:** `dev`

This is **P1** of three. It builds the whole Add Account flow as pages, separates
own-capital accounts from prop accounts in the data model, and puts the seam in
place that later connectors plug into. It ships with **MetaTrader 5 as the only
working Auto Sync platform**; cTrader and TradeLocker are listed and badged
"Soon".

- **P2 — TradeLocker connector.** REST, no partner approval gate, so it is the
  cheaper second. Blocked on a dev/demo account and on the read-only decision
  recorded under *Risks*.
- **P3 — cTrader connector.** OAuth 2.0 + Protobuf, gated on Spotware app
  registration. Start that application early; it is external lead time that
  cannot be coded around.

Each gets its own spec and PR. Nothing in P1 is designed around P2/P3 specifics,
because guessing their credential shapes is how you build a schema that fits
neither.

---

## 1. Why

Adding an account today is a modal (`AccountFormModal`) that asks for a label,
an optional prop-firm template and six rule fields, then either closes or shows
the EA setup. Three things are wrong with it for a public SaaS:

1. **Own-capital accounts have no home in the model.** Every column on
   `mt5_accounts` is prop-shaped, and `POST /api/accounts` calls
   `createChallengeForAccount()` for *every* account. A trader journaling their
   own live account gets an invented 5% / 10% / 8% challenge, reads as
   "Evaluation" in Settings, and is counted by Prop OS as an evaluation account
   with a profit target it does not have. This is a shipped correctness bug, and
   the new flow is where it becomes visible to every new user.
2. **"How do trades reach this account" is asked in the wrong place.** It is a
   radio pair inside the add form (`manual` vs `synced`), while the actual
   answers — our terminal, your EA, a CSV, typing them in — are spread across
   three other surfaces (`SyncModal`, `EaSetupModal`, `ImportTradesModal`).
3. **The modal cannot carry the questions a prop account needs.** Firm, product,
   size and phase are four decisions with dependencies between them; a single
   scrolling dialog with a three-select "prefill" strip is why the firm you pick
   is currently **not even saved** (see §5.4).

## 2. Decisions taken

| # | Question | Decision |
|---|---|---|
| 1 | What is a "Live Capital" account in the model? | **Full separation.** New `capital_kind` column, no `challenges` row, filtered out of every Prop OS surface. |
| 2 | When is the account written? | **Client draft, one atomic commit** (§6). No rows exist until the last data-collecting step. |
| 3 | MT5 login collisions | Debounced availability check for UX; the unique index at commit is the truth. |
| 4 | Which platforms | MT5 working; MT4 / cTrader / TradeLocker listed and badged **Soon**; `other` as an explicit escape. Auto Sync runs on **our own VPS**, not the EA. |
| 5 | Where does the EA go? | A **sub-choice under Auto Sync** ("we run the terminal" vs "I'll run the EA"), not a peer option. |
| 6 | What is "Select account type (Presets)"? | **Product × size** — `1-Step` / `2-Step` / `Instant Funding` crossed with account size. Needs a `products` layer in the firm catalog. |
| 7 | Onboarding | **Embeds this wizard.** First run is Welcome → the flow → Done. One account-creation UI in the app. |

**Naming:** the feature is **"Auto Sync"**, never "Live sync" — the old name
reads as streaming market data and collides with "Live Capital". The EA is a
sub-choice *under* Auto Sync.

## 3. The flow

```
Add account
├─ Live Capital → name ─────────────────────────────────────────┐
└─ Prop Firm    → firm → name → product (× size) → phase ───────┤
                          └ pre-fills Daily DD, Max DD,         │
                            Profit target, Min trading days,    │
                            DD type                             │
                                                                ▼
                                                          platform
                                                                ▼
                                                          import method
                              ┌──────────────────┬──────────────┴────────┐
                          Auto Sync           Manual                 File upload
                     ┌────────┴────────┐         │                       │
              our terminal        your EA        │                       │
                     │                │          │                       │
              credentials       EA setup         │                  CSV upload
                     └────────┬───────┘          │                       │
                              ▼                  ▼                       ▼
                            Home               Home                    Home
```

Live + Manual is 5 steps. Prop + Auto Sync is 9. The progress bar reports real
totals per branch rather than pretending every path is the same length.

## 4. Which entity each step writes

| Step | Writes | Destination |
|---|---|---|
| Live vs Prop | `capital_kind` | `mt5_accounts` (new) |
| Choose firm | `firm_id`, `firm_name` | `mt5_accounts` (exists; **not currently saved on create**) |
| Set name | `label`, `currency` (+ `start_balance` on the Live path only — the prop path gets it from product × size) | `mt5_accounts` |
| Product × size | `product_id`, `start_balance`, `account_type`, and the five rule fields | `mt5_accounts` (+ snapshot into `challenges`) |
| Phase | `phase` | `challenges.phase` |
| Platform | `platform` (+ free-text `broker` on the Live path) | `mt5_accounts` (new) |
| Import method | `import_method`, `kind` | `mt5_accounts` (`import_method` new) |
| Credentials | `server`, `password_ct`, and `mt5_login` at insert | `mt5_credentials`, `mt5_accounts` |
| CSV upload | trade rows | `trades` (`source='import'`) |

## 5. Data model

### 5.1 Migration `0026_account_capital_and_platform.sql`

Four columns on `mt5_accounts`. Every default *is* the truth for existing rows —
every account today is a GFT/FTMO prop account reached over MT5 — so there is no
data migration and no backfill script.

| Column | Values | Default | Why it cannot be derived |
|---|---|---|---|
| `capital_kind` | `prop` \| `live` | `prop` | Nothing today distinguishes own funds from firm funds. |
| `platform` | `mt5` \| `mt4` \| `ctrader` \| `tradelocker` \| `other` | `mt5` | Dispatches the connector. `broker` is free text and cannot be switched on. Values are exactly the ids in §7.1. |
| `product_id` | `1step` \| `2step` \| `instant` | `NULL` | `firm_id + size + account_type` cannot tell 1-step from 2-step. |
| `import_method` | `auto_sync` \| `ea` \| `file` \| `manual` | backfilled from `kind` | `kind` has two values for four answers; "manual vs file" is otherwise unrecoverable. |

`import_method` and `kind` must never disagree. A CHECK constraint pins them:
`auto_sync`/`ea` ⇒ `kind='synced'`, `file`/`manual` ⇒ `kind='manual'`. Backfill
runs before the constraint is added.

Also on `mt5_accounts`: `provision_key TEXT UNIQUE` (see §6.3) — the one
optional piece of this design.

On `sync_jobs`: `platform TEXT NOT NULL DEFAULT 'mt5'`, denormalized from the
account at enqueue (§7.3).

### 5.2 Live accounts get no challenge

`provisionAccount()` creates a `challenges` row only when
`capital_kind='prop'`. The existing `POST /api/accounts` gets the same guard —
otherwise the old endpoint keeps minting the fake challenge this work exists to
fix.

`daily_dd_pct`, `max_dd_pct` and `profit_target_pct` stay `NOT NULL`. On a live
account they keep their defaults and are **never read**: no challenge row exists
and every prop surface filters on `capital_kind`. Loosening three `NOT NULL`s
instead would mean auditing every reader in the prop engine for null-safety — a
much larger change than this flow justifies.

> **Invariant to preserve:** a future reader of `max_dd_pct` that does not filter
> `capital_kind` will silently get `10` for an account with no drawdown limit at
> all. `capital-kind.test.js` (§9.5) is what keeps that honest.

### 5.3 Prop OS separation

Five surfaces filter `capital_kind='prop'`:

- `listAccounts()` returns `capital_kind`.
- The prop routes filter before handing accounts to `businessKpis`,
  `firmRollup`, `accountsBreakdown`, `upcomingPayouts` — `propOverview.js` has no
  concept of a non-prop account and should not gain one.
- `PropOS`, `PropAccounts`, `PropChallenges`, `Finance` filter their
  outlet-context list.

The **account switcher deliberately does not filter**: you journal a live
account, you just do not run challenge rules against it.

`SettingsAccounts.jsx` currently renders `TYPE_LABEL[a.account_type] ||
'Evaluation'`, so a live account would read "Evaluation". The Type cell keys off
`capital_kind` first.

### 5.4 Firm catalog gains a products layer

`propFirms.js` becomes `firm → platforms[] → products[] → { sizes[], phases[] }`.
`templateToFields()` takes a `productId`. `Instant Funding` carries exactly one
phase.

This also fixes a live bug: `POST /api/accounts` does not destructure
`firm_id`/`firm_name` ([`src/routes/accounts.js`](../../../src/routes/accounts.js)),
so the firm chosen in today's template picker is silently dropped on create. The
PATCH path does save it, which is why the accounts table looks right for edited
accounts and wrong for new ones.

## 6. Commit strategy

### 6.1 Draft state

Wizard state lives in a React context mirrored to `sessionStorage` under a
versioned key, so a mid-flow refresh resumes and the draft dies with the tab.

**The password is never in the draft.** The credentials step holds it in
component state and hands it straight to the provision call — `sessionStorage` is
readable by any script on the origin.

`patchDraft(draft, patch)` owns invalidation in one place: prop→live drops
firm/product/phase; a new firm drops product/phase; selecting a Soon platform
drops `auto_sync`. Scattering that across eleven page components is how a wizard
submits an FTMO product against a GFT account.

### 6.2 `POST /api/accounts/provision`

Validate, then one transaction via a `withTransaction` helper extracted from the
three existing hand-rolled copies (`auth.js`, `challenges.js`, `strategies.js` —
a fourth copy is the smell that justifies the extraction):

1. Plan and cap check by resulting `kind`; `platform` against
   `src/domain/sync/platforms.js`; `import_method`↔`kind` consistency; when prop,
   `firm_id`/`product_id`/`phase` against the catalog.
2. `INSERT mt5_accounts`. `auto_sync` sets `mt5_login` **at insert** — the wizard
   already collected it, so the `bindOrCheckLogin` dance is unnecessary and the
   global-unique collision becomes a clean pre-commit failure. `ea` leaves it
   NULL to bind on first trade as today. `manual`/`file` get the synthetic
   negative login.
3. If prop → `INSERT challenges` **with the selected phase**.
   `createChallengeForAccount()` derives phase from `account_type`, so provision
   needs a phase-aware variant rather than reusing it as-is.
4. If `auto_sync` → `INSERT mt5_credentials` (sealed) + `INSERT sync_jobs`
   (`first_sync`, `platform`).

Commit points differ per branch, and each is the last step that collects data:
`import` for Manual and File upload, `connect` for both Auto Sync sub-choices.
**After commit, navigation is forward-only** — the alternative is a Back button
that silently creates a second account.

### 6.3 Failure modes

| Failure | Code | Recovery |
|---|---|---|
| MT5 login already registered (any tenant) | 409 | connect step keeps the typed values, names the collision, and links to the account if it is theirs |
| plan cap / free tier | 402 | unreachable via UI (gated at `import`); the step returns them there |
| `SYNC_CRED_KEY` unset | 503 | steer to the EA route, which needs no key |
| unknown platform / firm / product / phase | 400 | means the catalogs drifted; §9.2 keeps it unreachable |
| DB error mid-transaction | 500 | nothing written, draft intact, retry safe |

**Every failure leaves zero rows behind.** That is the whole argument for this
commit strategy: retry needs no cleanup logic.

Two acknowledged gaps. The `GET /api/accounts/login-available` pre-check is UX
only — two users racing one login means one gets the 409 at commit, and the
unique index is the truth. And a network drop *after* commit but before the
response lets a user press the button again and create a second account;
`provision_key TEXT UNIQUE` guards that, with a replay returning the existing
account. That column is **defensive rather than required** — cut it and the
exposure is a rare duplicate account the user can delete.

## 7. Auto Sync

### 7.1 Two catalogs, one drift test

The backend cannot import `frontend/src`: deploy rsyncs `src db scripts ea` plus
`frontend/dist`, so such an import works locally and crashes on the box.

- **`src/domain/sync/platforms.js` — the authority.** Per platform: `id`,
  `connector`, `enabled`, `credentialFields`, `assetTypes`. Provision validates
  against it. JSX-free and node:test-importable.
- **`frontend/src/features/accounts/platformCatalog.js` — presentation.**
  Display name, mark, `status: 'live' | 'soon'`, blurb, offered import methods.
- **`test/platform-catalog.test.js`** asserts the id sets are identical and that
  every frontend `live` is backend `enabled` — the same drift trick `nav.test.js`
  already uses for routes versus nav.

| id | Name | Status | Auto Sync | Note |
|---|---|---|---|---|
| `mt5` | MetaTrader 5 | **live** | yes | the working farm |
| `mt4` | MetaTrader 4 | soon | — | EA is `.mq5`, the Python package is MT5-only; file/manual work today |
| `ctrader` | cTrader | soon | P3 | |
| `tradelocker` | TradeLocker | soon | P2 | |
| `other` | Not listed | live | — | without it, a trader whose platform is absent has no way through the flow |

### 7.2 Platform, not broker

We integrate per **platform**. The reference product's grid mixes brokers
(Interactive Brokers, Thinkorswim) with platforms (MT4, MT5, cTrader) and is not
a shape to copy. The step asks the platform, with a search box over the catalog.

For a prop account the firm implies it, so the grid filters to the firm's
`platforms` with the rest behind "show all". Live Capital shows the full grid and
lets the user name their broker in the existing free-text `broker` field.

### 7.3 Connector registry and worker dispatch

`src/domain/sync/connectors/` exposes `getConnector(platform)` →
`{ id, credentialFields, validateCredential, enqueue }`. `mt5.js` is the only
implementation and wraps exactly what exists today. P2 adds `tradelocker.js`
plus its own migration; nothing else moves. **This registry is what makes
"extensible" a fact rather than an intention** — not a speculative universal
credential table.

`mt5_credentials` is unchanged in P1. Because ciphertext is sealed under an
account-bound AAD (`mt5-cred:<id>`), credentials can move tables later without
re-encryption.

Jobs carry `sync_jobs.platform`; `POST /api/sync/lease` accepts
`platforms: ['mt5']` and hands over only what the worker can run — MT5 needs the
Windows box, cTrader and TradeLocker will be Linux workers.

> **Deploy-order catch:** the Windows agent will not have the new field when this
> ships, and the box is stopped most of the time. A **missing `platforms` means
> `['mt5']`**, so a stale agent keeps working untouched.

### 7.4 The EA sub-choice

`import` shows three cards. Auto Sync leads to `connect`, which asks *how* before
asking for anything secret:

- **"We run the terminal"** (recommended) → server + login + investor password →
  provision stores the credential and enqueues `first_sync`.
- **"I'll run the EA on my PC"** → provision mints an ingest token and the step
  becomes today's `SetupCard` rendered as a page, unchanged, so "how do I attach
  the EA" keeps exactly one answer.

### 7.5 Gating

Gating happens at `import`, **never at submit**. Free is `syncedAccounts: 0`, so
both Auto Sync options render disabled with the reason and an upgrade link while
Manual and File upload stay live. A Pro user at the cap sees "3 of 3 synced
accounts used" on the card rather than a 402 after typing a broker password.

If `SYNC_CRED_KEY` is unset the server-side path is genuinely unavailable and the
step says so, steering to the EA route. A mid-creation dead end is worse than in
today's `SyncModal`, where the user at least already has an account.

### 7.6 The read-only guarantee stays MT5-specific

The worker checks `trade_allowed` on first login and deletes a credential that
can trade. That copy lives in the connector's `credentialFields` descriptor, not
hardcoded in the page — precisely so P2 cannot inherit a promise TradeLocker
cannot keep.

## 8. Routing, onboarding, and the rest

### 8.1 Routes

Eleven full-bleed routes (no sidebar, no filter bar) under `/accounts/new`:
`welcome` (first run only), `capital`, `firm`, `name`, `product`, `phase`,
`platform`, `import`, `connect`, `upload`, `done`. `/accounts/new` redirects to
the first incomplete step.

`newAccountFlow.js` is a pure, JSX-free module holding the whole flow:
`stepsFor`, `nextStep`, `prevStep`, `firstIncomplete`, `progress`, `emptyDraft`,
`patchDraft`, `toProvisionPayload`. This is what makes the flow testable at all —
`node:test` imports it directly, with no browser.

Each page compares its own id to `firstIncomplete(draft)` on mount and
`<Navigate replace>`s if it is ahead, so deep-linking `/accounts/new/phase` cold
lands on `capital`. Back and forward work natively — the payoff for real URLs
over one stateful page.

The wizard is a **sibling of `<Layout>`** and so has no outlet context. It takes
`reloadAccounts`, `setAccountId` and `accounts` as props from `App`, plus the
plan from `useAuth()`. On finish it reloads accounts *and selects the new one*,
so "Home page" lands on a dashboard already scoped to what was just created.

### 8.2 Onboarding

Today `user && !user.onboarded_at` mounts `<Route path="*">` and swallows every
URL, which would fight per-step routing. That branch instead renders the **same**
wizard routes plus a catch-all `<Navigate to="/accounts/new/welcome">`. One route
table, one component; first run differs only in that `welcome` exists and that
finish calls `completeOnboarding()` then `setUser`. The current "Skip for now"
survives as a first-run-only escape that completes onboarding with no account.

`Onboarding.jsx`'s own copy of the account form is deleted — that duplication is
the thing this decision exists to remove.

### 8.3 File upload

Commit happens at `import`, so `upload` renders against a real account. The
dry-run/confirm logic is extracted out of `ImportTradesModal` and shared, not
copied.

`POST /api/trades/import` carries the CSV *inside JSON* at a 12 MB body limit,
and escaping inflates a large statement past its file size — so the page checks
size client-side and says so, rather than surfacing a 413 after a long upload.
The step is skippable; the account is already real, so skipping costs nothing.

### 8.4 Transitions

A keyed CSS fade/translate on the step container, honouring
`prefers-reduced-motion`. No animation library: the repo has none for route
transitions, and motion is the design language's call.

### 8.5 The Auto Sync rename

`SyncModal`'s title and intro copy, the row-menu label in `SettingsAccounts`, and
the user-facing strings in `src/routes/sync.js`. **Not** the tables or the
`/api/sync/*` routes — renaming live infrastructure for a copy change is a trade
this repo refuses elsewhere.

## 9. Test plan

All in this repo's existing styles: pure-module imports, frontend-source-as-text,
migration-file-as-text.

1. **`new-account-flow.test.js`** — step counts per branch (live+manual 5,
   prop+auto_sync 9), guard resolution, `patchDraft` invalidation cascade,
   `toProvisionPayload`, commit-step selection.
2. **`platform-catalog.test.js`** — the two catalogs' ids match; every frontend
   `live` is backend `enabled`; `importMethods` are a subset of the four.
3. **`propFirms.test.js`** (extend) — the `products` layer resolves; unknown
   product → null; `instant` has exactly one phase; no product has empty phases.
4. **`provision.test.js`** — pure payload validation: prop requires
   firm/product/phase, live rejects them, `import_method`↔`kind` consistency.
5. **`capital-kind.test.js`** — provision skips challenge creation for live; the
   prop routes and four prop pages carry the filter; migration text asserts the
   columns and the CHECK.
6. **`router-surface.test.js` / `nav.test.js`** (extend) — new routes registered,
   wizard confirmed outside `<Layout>`.
7. **`settings-module.test.js`** (extend) — the Type cell keys off
   `capital_kind`.
8. **`onboarding.test.js`** (extend) — first run resolves to the wizard's welcome
   step; skip completes onboarding with no account.

## 9a. Expected staging

This is more than one PR's worth of work. The natural split is **(a)** the
migration, `provisionAccount`, the catalogs/registry and the Prop OS
`capital_kind` separation — shippable on its own, since it fixes the fake-challenge
bug without any new UI — then **(b)** the eleven wizard pages and the onboarding
swap, then **(c)** the Auto Sync rename and the `ImportTradesModal` extraction.
The implementation plan decides the final cut.

## 10. Risks and open items

1. **The read-only promise does not survive P2.** TradeLocker's API has no
   investor-password concept, so "a password that can place trades is rejected"
   becomes false the moment TradeLocker ships. A product decision, not a coding
   one, and it belongs in P2's spec — but P1 keeps the copy inside the connector
   descriptor so it cannot be inherited by accident.
2. **cTrader's lead time is external.** Spotware app registration gates P3. Start
   it now, in parallel with P1.
3. **No test accounts for P2/P3 yet.** Every one of the MT5 farm's four landmines
   was found against a real account, not in documentation. A TradeLocker demo
   account is a prerequisite for P2, not a detail of it.
4. **The `NOT NULL` rule columns on live accounts** — see the invariant in §5.2.
5. **Design-language conformance is unverified.** `docs/design-system/DESIGN-LANGUAGE.md`
   is untracked and not present in this working copy, so the visual
   implementation of these eleven pages cannot yet be traced to it as CLAUDE.md
   requires. Resolve before UI work starts. The reference screenshots are that
   product's indigo; our accent is brand blue `#3B82F6`.
6. **`provision_key`** is optional — see §6.3.

## 11. Out of scope

- cTrader and TradeLocker connectors (P2, P3).
- A profile-level "how do you trade?" preference and nav tailoring — the
  rejected onboarding option 2. Worth revisiting once live-capital users exist.
- Converting an existing account between `manual` and `synced`. Still no UI for
  it; the wizard does not add one, and `kind` remains immutable after creation.
- Generalizing `mt5_credentials` into a multi-platform credential table (§7.3).
- Renaming `/api/sync/*` routes or the sync tables (§8.5).
