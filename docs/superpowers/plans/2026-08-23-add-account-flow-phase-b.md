# Add Account Flow — Phase B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the eleven-page Add Account wizard that makes Phase A's provision endpoint reachable, and delete the duplicate account form in `Onboarding.jsx`.

**Architecture:** All flow logic lives in one pure, dependency-light module (`newAccountFlow.js`) that `node:test` imports directly — step lists, guard resolution, the `patchDraft` invalidation cascade, and `toProvisionPayload`. The eleven pages are thin: they render, they call `patch()`, they navigate. The wizard mounts as a **sibling of `<Layout>`** (no sidebar, no filter bar, no outlet context from the shell), taking `accounts`, `reloadAccounts`, `setAccountId` as props from `App` and the plan from `useAuth()`. Draft state is a React context mirrored to `sessionStorage`; **the broker password is never in the draft.**

**Tech Stack:** React 18, React Router 7 (declarative only), `node:test` + `node:assert/strict`, hand-written CSS in `frontend/src/styles/legacy/app.css` composed with `components/primitives`.

**Spec:** `docs/superpowers/specs/2026-08-22-add-account-flow-design.md` (§6 commit strategy, §7 Auto Sync, §8 routing/onboarding, §9 test plan). Phase A plan: `docs/superpowers/plans/2026-08-22-add-account-flow-phase-a.md`.

---

## Global Constraints

Every task's requirements implicitly include this section.

**Testing strategy — non-negotiable, this is the user's call not the implementer's:**
- There is **NO test database** and **NO HTTP test harness**. Every test is a pure-function test, a fake-client test, or a source-text assertion.
- **Do not introduce** `supertest`, `jsdom`, React Testing Library, `@testing-library/*`, a DB fixture, or any new test dependency. If a task appears to need one, **STOP and ask the user** — changing the repo's testing strategy is their decision.
- **Never weaken an assertion to get green.** If a test in this plan cannot be made to pass as written, STOP and ask.

**Source-text assertion hygiene (four Phase A fix rounds went to exactly these):**
- Anchor every slice on the construct's **own** boundary — a handler's closing `});` via `/^\s{2}\}\);/m`, an element's own `<td` via `lastIndexOf('<td', usageIndex)`.
- **Never** a fixed byte offset. **Never** a file-wide string scan for a positive claim.
- A **negative** assertion over a fixed-size window is the worst case: it asserts against whichever neighbour follows. A negative over a whole named file (`!/onlyPropCapital/.test(readSrc('Layout.jsx'))`) is legitimate.
- Read source via `test/helpers/src-files.js` (`readSrc`, `appFiles`, `srcExists`), never a hardcoded relative path.

**CI reality:**
- CI runs `npm test` (backend deps only) on every PR and `dev` push. **`frontend/node_modules` does not exist in CI.**
- Therefore a `node:test` file may import a `frontend/src` module **only while that module is pure data/logic**. Anything pulling React, `react-router-dom`, `@/components/*` or `import.meta.env` fails in CI and nowhere else.
- `frontend/src/lib/api.js` reads `import.meta.env.VITE_BACKEND_URL` at module scope → **not importable by `node:test`.** Assert on it as text.
- **CI does not build the frontend on PRs.** Any task touching `frontend/` MUST run `cd frontend && npm run build` before committing.
- The backend must never import from `frontend/src` (deploy rsyncs `src db scripts ea` + `frontend/dist`).

**Styling reality:**
- `frontend/src/tailwind.css` scopes `@source` to `./components/ui` and `./components/primitives` **only**. A Tailwind utility class written in a page under `src/` **compiles to nothing, silently.**
- Wizard pages therefore compose `components/primitives` + hand-written classes added to `frontend/src/styles/legacy/app.css`.
- New CSS lands inside the blob `test/design-language.test.js` scans, so it is automatically policed for: **§7** no elevation shadow outside `--sh-1/2/3`; **§14** hover never introduces a colour family the element lacked at rest; **§6** every floating overlay uses `var(--r-2xl)`.
- Use tokens from `frontend/src/styles/tokens.css`. **Never a raw hex.** Spacing is `--s-1/2/3/4/6/8/10/12` only. Brand blue as a **fill** is `--accent`; brand blue **read as text** is `--accent-on-surface` (`--accent` measures 2.24:1 on `--bg` and fails AA).
- **`router-surface.test.js` asserts every `to="…"` in the app is absolute.** Every `<Navigate>` and `<Link>` the wizard adds must start with `/`.

**Naming (spec §2):** the feature is **"Auto Sync"**, never "Live sync". The EA is a **sub-choice under** Auto Sync.

**Workflow:** work on `dev`; every commit message ends with
`Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
Local Postgres is on port **5433**. Never self-merge to `main`.

**Decisions taken in brainstorming (2026-08-23) that override or extend the spec:**

| # | Decision | Effect |
|---|---|---|
| B1 | **Step order changes.** `name` moves after `phase` on the prop path, so the label suggestion can name the product. | Prop path: `capital → firm → product → phase → name → platform → import → connect → done`. Live path: `capital → name → platform → import → done`. Spec §3's counts are unchanged (5 and 9). |
| B2 | **Progress is honest and changing.** `progress(draft)` returns `{index, total}` computed from the current draft, so the total genuinely grows as the branch resolves. | No optimistic maximum. |
| B3 | **The draft carries the created account.** On commit, `{ id, mt5_login }` goes into the draft; `firstIncomplete()` reads it. | Forward-only navigation is a pure-function fact, and a refresh mid-upload resolves correctly. |
| B4 | **`provision_key` is injected.** `emptyDraft({ provisionKey })`; the provider calls `crypto.randomUUID()`. | Module stays dependency-free; the key is minted **once per draft** so a retry after a network drop replays. |
| B5 | **Unverified products are hidden from the wizard.** GFT `1step`/`instant` keep `verified: false` and their UNCONFIRMED percentages, and never render. | See Risks — a real GFT 1-Step trader gets no template. |
| B6 | **An unlisted firm is supported.** `PROP_FIRMS` gains `id: 'other'` with one `custom` product carrying **no** percentages; the `product` and `phase` steps collect the rules by hand. | Covers every firm not in the catalog. |
| B7 | **The CSV dry-run extraction happens in Phase B** (spec §8.3 wins over the Phase-C boundary). Phase C shrinks to the Auto Sync rename. | Task 5. |
| B8 | **`AccountFormModal` becomes edit-only.** Both Add Account buttons navigate to `/accounts/new/capital`; the kind radios, the `eaOk` gate and the `created`/`SetupCard` branch are deleted. | Task 12. |
| B9 | **`completeOnboarding()` is called at commit**, not on `done`. | A first-run user who abandons after creating an account is not asked to create a second one. |

**Out of scope — reject scope creep toward any of it:**
- Phase C: the Auto Sync rename in `SyncModal`/`SettingsAccounts`/`src/routes/sync.js` copy.
- cTrader (P3) and TradeLocker (P2) connectors.
- Renaming `/api/sync/*` routes or the sync tables.
- Converting an existing account between `manual` and `synced`.
- **Adding ESLint.** The gap is real (memory `eslint-gap`: a called-but-unimported identifier ships as a per-request 500 with the suite green — that exact bug ran on `/api/prop/finance` for weeks). Propose it as its own PR; do not slip it into this feature.

---

## Design-Language Gate

`docs/design-system/DESIGN-LANGUAGE.md` is untracked and **not in this working copy** (spec §10 risk 5). CLAUDE.md requires every UI decision to trace to a rule in it; *"it looks better"* is not a justification.

- **Tasks 1–5 are doc-independent** — pure logic, catalog data, the API client, the CSV state machine. Start them immediately.
- **Tasks 6–13 touch UI and are GATED.** Do not start Task 6 until the owner supplies the doc. Each gated task carries a **Visual conformance** block naming which sections it must cite.

What is already available and authoritative without the prose: `frontend/src/styles/tokens.css` (the whole value layer, both themes), `frontend/src/styles/bridge.css` (token → Tailwind/shadcn mapping), `test/design-language.test.js` (§6 radius, §7 elevation, §14 hover — enforced), `test/typography.test.js`, `test/theme-tokens.test.js`, `test/design-b-a11y.test.js`, and `frontend/src/components/primitives/`.

---

## File Structure

**Created**

| Path | Responsibility |
|---|---|
| `frontend/src/features/accounts/newAccountFlow.js` | **The flow, as pure functions.** Step lists, guards, progress, draft + invalidation cascade, provision payload. JSX-free, React-free, `node:test`-importable. |
| `frontend/src/features/accounts/accountGating.js` | Client-side plan predicates (`eaAllowed`, `syncedAccountLimit`, `manualAccountLimit`) + the reasons the `import` step shows. JSX-free; drift-tested against `src/domain/billing/plans.js`. |
| `frontend/src/features/trades/csvImportFlow.js` | The CSV dry-run/confirm state machine + body-size guard, shared by `ImportTradesModal` and the wizard's `upload` step. JSX-free. |
| `frontend/src/features/accounts/NewAccountFlow.jsx` | The wizard shell: draft context, `sessionStorage` mirror, guard redirect, progress, step container + transitions, `<Outlet context>`. |
| `frontend/src/features/accounts/steps/` | Eleven step components, one file each: `WelcomeStep.jsx` `CapitalStep.jsx` `FirmStep.jsx` `ProductStep.jsx` `PhaseStep.jsx` `NameStep.jsx` `PlatformStep.jsx` `ImportStep.jsx` `ConnectStep.jsx` `UploadStep.jsx` `DoneStep.jsx`. |
| `test/new-account-flow.test.js` | Spec §9.1. |
| `test/account-gating.test.js` | The plans drift test. |
| `test/csv-import-flow.test.js` | The extracted state machine. |
| `test/new-account-pages.test.js` | Structural/source-text assertions over the shell and the eleven steps. |

**Modified**

| Path | Change |
|---|---|
| `frontend/src/features/prop/propFirms.js` | `other`/`custom` entry, `PRODUCT_IDS += 'custom'`, `SHORT_PRODUCT_LABEL`, `sizeLabel`, `wizardFirms()`, `wizardProducts()`. |
| `frontend/src/lib/api.js` | `provisionAccount()`, `checkLoginAvailable()`. |
| `frontend/src/App.jsx` | Wizard routes in both the first-run and normal branches; `Onboarding` import removed. |
| `frontend/src/features/accounts/AccountForms.jsx` | Add branch deleted (edit-only); `eaAllowed` re-exported from `accountGating.js`; `sizeLabel` imported from `propFirms.js`; `TemplatePicker` skips `custom`. |
| `frontend/src/features/settings/SettingsAccounts.jsx` | Both Add Account buttons navigate to `/accounts/new/capital`. |
| `frontend/src/features/settings/SettingsPanels.jsx` | `eaAllowed` import repointed. |
| `frontend/src/features/trades/ImportTradesModal.jsx` | Drives `csvImportFlow.js`. |
| `frontend/src/styles/legacy/app.css` | Wizard CSS; `.onb-*` rules retired. |
| `test/propFirms.test.js` `test/onboarding.test.js` `test/settings-module.test.js` `test/router-surface.test.js` | Extended. |

**Deleted**

| Path | Why |
|---|---|
| `frontend/src/features/auth/Onboarding.jsx` | Its account form is the duplication this whole change exists to remove (spec §8.2). Its Welcome/Done copy moves into `WelcomeStep.jsx`/`DoneStep.jsx`. |

---
## Task 1: Client-side plan gating, extracted and drift-tested

The `import` step gates Auto Sync on the plan (spec §7.5), and the only client-side plan knowledge today is `eaAllowed` — a one-line predicate exported from a **JSX file**, so `node:test` cannot reach it. It needs a cap number too (`syncedAccounts`), and once `AccountFormModal` loses its add branch (Task 12) a gating predicate living there makes no sense.

This follows the repo's established two-catalog-plus-drift-test pattern (`nav.js` vs the route table; `platformCatalog.js` vs `platforms.js`). The frontend does **not** import `src/domain/billing/plans.js` directly: no frontend file reaches outside `frontend/` today and introducing that precedent is not a UI phase's call.

**Files:**
- Create: `frontend/src/features/accounts/accountGating.js`
- Create: `test/account-gating.test.js`
- Modify: `frontend/src/features/accounts/AccountForms.jsx` (re-export `eaAllowed` from the new module; delete the inline definition at line 90)
- Modify: `frontend/src/features/settings/SettingsPanels.jsx:9` (import from the new module)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `eaAllowed(plan) → boolean`
  - `syncedAccountLimit(plan) → number`
  - `manualAccountLimit(plan) → number`
  - `autoSyncGate({ plan, accounts }) → { allowed: boolean, reason: string|null, upgrade: boolean }` — `accounts` is the raw `/api/accounts` list; `reason` is user-facing copy; `upgrade` says whether to render the Billing link.

- [ ] **Step 1: Write the failing test**

```js
// test/account-gating.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  eaAllowed, syncedAccountLimit, manualAccountLimit, autoSyncGate, KNOWN_PLANS,
} from '../frontend/src/features/accounts/accountGating.js';
import { PLANS, DEFAULT_PLAN } from '../src/domain/billing/plans.js';

// THE DRIFT TEST. The plan entitlements exist twice — once as the server's
// enforcement (src/domain/billing/plans.js) and once as the UI's gate — because
// no frontend module imports outside frontend/, and the deploy shape is why
// (rsync ships `src db scripts ea` plus `frontend/dist`). Same arrangement
// platform-catalog.test.js enforces between the two platform catalogs.
//
// A backend test may import a frontend module only while that module is pure
// data: CI installs backend dependencies only, so anything pulling React would
// fail here and nowhere else.

test('the UI agrees with the server about every plan it knows', () => {
  for (const [plan, ent] of Object.entries(PLANS)) {
    assert.equal(eaAllowed(plan), ent.ea, `${plan}: ea`);
    assert.equal(syncedAccountLimit(plan), ent.syncedAccounts, `${plan}: syncedAccounts`);
    assert.equal(manualAccountLimit(plan), ent.manualAccounts, `${plan}: manualAccounts`);
  }
});

test('the UI knows exactly the plans the server does — no more, no fewer', () => {
  // A plan the server grants and the UI has never heard of falls to the free
  // gate, so a paying user is refused Auto Sync in the wizard and then allowed it
  // by provision — a contradiction the user cannot act on.
  assert.deepEqual([...KNOWN_PLANS].sort(), Object.keys(PLANS).sort());
});

test('an unknown, absent or malformed plan fails closed to free', () => {
  for (const bad of [undefined, null, '', 'enterprise', 42, {}]) {
    assert.equal(eaAllowed(bad), PLANS[DEFAULT_PLAN].ea, `${String(bad)}`);
    assert.equal(syncedAccountLimit(bad), PLANS[DEFAULT_PLAN].syncedAccounts);
  }
});

test('autoSyncGate: free is refused with an upgrade route', () => {
  const g = autoSyncGate({ plan: 'free', accounts: [] });
  assert.equal(g.allowed, false);
  assert.equal(g.upgrade, true);
  assert.match(g.reason, /Pro/, 'the reason must name the plan that lifts it');
});

test('autoSyncGate: pro under the cap is allowed and says nothing', () => {
  const g = autoSyncGate({ plan: 'pro', accounts: [{ kind: 'synced' }, { kind: 'manual' }] });
  assert.equal(g.allowed, true);
  assert.equal(g.reason, null);
  assert.equal(g.upgrade, false);
});

test('autoSyncGate: pro AT the cap is refused and names the number', () => {
  // Spec §7.5: "3 of 3 synced accounts used" on the card, not a 402 after the
  // user has typed a broker password.
  const accounts = [{ kind: 'synced' }, { kind: 'synced' }, { kind: 'synced' }];
  const g = autoSyncGate({ plan: 'pro', accounts });
  assert.equal(g.allowed, false);
  assert.equal(g.upgrade, true);
  assert.match(g.reason, /3 of 3/, 'the reason must carry the count, not a bare "upgrade"');
});

test('autoSyncGate: only synced accounts count toward the synced cap', () => {
  const manualOnly = Array.from({ length: 9 }, () => ({ kind: 'manual' }));
  assert.equal(autoSyncGate({ plan: 'pro', accounts: manualOnly }).allowed, true);
});

test('autoSyncGate: an archived synced account still occupies its slot', () => {
  // is_active is a soft archive — the row, its ingest token and its MT5 login all
  // still exist, and syncedAccountCount on the server does not filter it. A UI
  // that discounted archived accounts would offer a slot provision then 402s on.
  const accounts = [
    { kind: 'synced', is_active: false },
    { kind: 'synced', is_active: false },
    { kind: 'synced', is_active: true },
  ];
  assert.equal(autoSyncGate({ plan: 'pro', accounts }).allowed, false);
});

test('autoSyncGate is total — a missing accounts list is treated as none', () => {
  assert.equal(autoSyncGate({ plan: 'pro' }).allowed, true);
  assert.equal(autoSyncGate({ plan: 'pro', accounts: null }).allowed, true);
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `node --test test/account-gating.test.js`
Expected: FAIL — `Cannot find module '.../accountGating.js'`.

- [ ] **Step 3: Write `accountGating.js`**

```js
// The CLIENT-SIDE half of the account-creation plan gate.
//
// WHY THE NUMBERS ARE HERE TWICE. src/domain/billing/plans.js is the enforcement
// and this is the gate the wizard renders — and no module under frontend/ imports
// from outside frontend/ (the deploy rsyncs `src db scripts ea` plus
// `frontend/dist`, so the two trees are shipped independently). This is the same
// arrangement platformCatalog.js has with src/domain/sync/platforms.js, and
// test/account-gating.test.js is what stops the two drifting — including the case
// where the server gains a plan this file has never heard of.
//
// Gating happens at the `import` STEP, never at submit (spec §7.5). A Free user
// sees both Auto Sync options disabled with the reason and an upgrade link, while
// Manual and File upload stay live; a Pro user at the cap sees the count. The 402
// from provisionGate is the real enforcement and should be unreachable through
// the UI.
//
// JSX-free and dependency-free so node:test can import it: CI installs backend
// dependencies only.

/** Mirrors src/domain/billing/plans.js PLANS. Values are drift-tested. */
const ENTITLEMENTS = {
  free:    { ea: false, syncedAccounts: 0, manualAccounts: 5 },
  pro:     { ea: true,  syncedAccounts: 3, manualAccounts: 20 },
  premium: { ea: true,  syncedAccounts: 1, manualAccounts: 20 },
};

export const KNOWN_PLANS = Object.keys(ENTITLEMENTS);
const DEFAULT_PLAN = 'free';

// Fail closed: an unknown, absent or malformed plan gets the free entitlements.
// A bad plan slug must never unlock a paid capability, and this mirrors
// entitlements() on the server exactly.
const of = (plan) =>
  (typeof plan === 'string' && Object.prototype.hasOwnProperty.call(ENTITLEMENTS, plan)
    ? ENTITLEMENTS[plan]
    : ENTITLEMENTS[DEFAULT_PLAN]);

export const eaAllowed = (plan) => of(plan).ea;
export const syncedAccountLimit = (plan) => of(plan).syncedAccounts;
export const manualAccountLimit = (plan) => of(plan).manualAccounts;

/**
 * May this user start an Auto Sync (or EA) account right now, and if not, why?
 *
 * Counts EVERY synced account the user owns, archived included: is_active is a
 * soft archive, so the row, its ingest token and its MT5 login all still exist
 * and the server's syncedAccountCount does not filter it. Discounting archived
 * accounts here would offer a slot that provision then refuses with a 402.
 */
export function autoSyncGate({ plan, accounts } = {}) {
  const limit = syncedAccountLimit(plan);
  if (!eaAllowed(plan) || limit === 0) {
    return {
      allowed: false,
      reason: 'Auto Sync and the EA need the Pro plan.',
      upgrade: true,
    };
  }
  const used = (Array.isArray(accounts) ? accounts : []).filter((a) => a?.kind === 'synced').length;
  if (used >= limit) {
    return {
      allowed: false,
      reason: `${used} of ${limit} synced accounts used on your plan.`,
      upgrade: true,
    };
  }
  return { allowed: true, reason: null, upgrade: false };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `node --test test/account-gating.test.js`
Expected: PASS, 9 tests.

- [ ] **Step 5: Repoint the two existing consumers**

In `frontend/src/features/accounts/AccountForms.jsx`, delete the inline definition (currently line 90 with its comment) and re-export instead, so no import site in the app changes in this task:

```js
// The plan gate moved to accountGating.js — a JSX file cannot be imported by
// node:test, and the wizard's `import` step needs the cap NUMBER as well as this
// predicate.
//
// IMPORT **AND** RE-EXPORT, not `export … from`. This file calls eaAllowed itself
// (AccountFormModal), and `export { x } from './y'` adds an indirect export entry
// for external importers WITHOUT creating a local binding — so the bare call site
// throws ReferenceError at render. Nothing catches that here: no bundler
// scope-checks it, and this repo cannot render JSX in a test. Found by review on
// 2026-08-23 after the first version of this plan mandated the broken form.
import { eaAllowed } from './accountGating.js';
export { eaAllowed };
```

In `frontend/src/features/settings/SettingsPanels.jsx`, change line 9 to import from the new module directly:

```js
import { eaAllowed } from '../accounts/accountGating.js';
```

- [ ] **Step 6: Full suite + frontend build**

Run: `npm test`
Expected: every test passes, including the pre-existing count plus 9.

Run: `cd frontend && npm run build`
Expected: `✓ built`. CI does not build the frontend on PRs, so this is the only place a broken import is caught.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/accounts/accountGating.js test/account-gating.test.js \
        frontend/src/features/accounts/AccountForms.jsx frontend/src/features/settings/SettingsPanels.jsx
git commit -m "$(cat <<'MSG'
Extract the client-side plan gate so a test can reach it

eaAllowed was a one-liner exported from a JSX file, which node:test cannot
import, and the wizard's import step needs the synced-account CAP as well as
the predicate. accountGating.js carries both, drift-tested against
src/domain/billing/plans.js the way platformCatalog.js is against platforms.js —
including the case where the server gains a plan the UI has never heard of.

Archived synced accounts count toward the cap, because the server's
syncedAccountCount does not filter is_active and a UI that discounted them
would offer a slot provision then 402s on.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Task 2: The catalog gains an unlisted firm, a short product label, and a wizard view

Three gaps Phase A left, all in `propFirms.js`:

1. **`templateToFields` accepts a size that is not in the product's `sizes`** — no membership check. Today's `<select>` cannot produce a bad one; the wizard's product step can.
2. **The suggested label does not distinguish products** — GFT 1-Step 25K and 2-Step 25K both suggest "GoatFundedTrader 25K".
3. **A prop trader whose firm is not GFT or FTMO cannot finish the flow** — `validateProvision` requires `firm_id` and `product_id` for `capital_kind: 'prop'`, and with unverified products hidden (decision B5) the catalog offers exactly two products.

The `other`/`custom` entry carries **no percentages at all**. That is what keeps it honest: the existing well-formedness invariants exist to protect real rule data, so rather than weakening them, they partition — rule-bearing products keep every assertion, and the custom product gets a *stronger* one (it must carry nothing).

**Files:**
- Modify: `frontend/src/features/prop/propFirms.js`
- Modify: `test/propFirms.test.js`
- Modify: `frontend/src/features/accounts/AccountForms.jsx` (`TemplatePicker` skips `custom`; `sizeLabel` imported rather than redefined)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `PRODUCT_IDS` — now `['1step', '2step', 'instant', 'custom']`
  - `SHORT_PRODUCT_LABEL` — `{ '1step': '1-Step', '2step': '2-Step', instant: 'Instant', custom: '' }`
  - `sizeLabel(n) → string` (moved out of `AccountForms.jsx`)
  - `wizardFirms() → firm[]` — catalog order with the `other` firm **last**
  - `wizardProducts(firmId) → product[]` — `verified === true` products plus any `custom` one; hides `verified: false`
  - `isCustomProduct(firmId, productId) → boolean`
  - `templateToFields(firmId, productId, size, phaseId)` — unchanged signature, now rejects a size outside `product.sizes` and returns `null` for a custom product

- [ ] **Step 1: Write the failing tests (append to `test/propFirms.test.js`)**

```js
// ---- the unlisted firm, added for the Add Account wizard --------------------
//
// A prop trader at any of the ~100 firms this catalog does not list still has to
// reach the prop path: validateProvision requires firm_id AND product_id for
// capital_kind 'prop', and with unverified products hidden from the wizard the
// catalog offers exactly two. The 'other' firm's single 'custom' product carries
// NO percentages — the wizard collects them by hand — and that absence is
// asserted rather than tolerated.

test('the unlisted-firm escape exists, is last, and carries no invented rules', () => {
  const other = findFirm('other');
  assert.ok(other, "a firm_id 'other' must exist or an unlisted firm cannot use the prop path");
  assert.equal(PROP_FIRMS[PROP_FIRMS.length - 1].id, 'other',
    'the escape belongs at the end of the list, after every real firm');
  assert.equal(other.products.length, 1, 'the escape has exactly one product');
  const custom = other.products[0];
  assert.equal(custom.id, 'custom');
  assert.equal(custom.custom, true, 'the custom product must mark itself, so the tests can partition');
  assert.deepEqual(custom.sizes, [], 'a custom product must offer no sizes — the user types the balance');
  assert.deepEqual(custom.phases, [], 'a custom product must carry no phases — the wizard offers all three');
});

test('the custom product is the ONLY product that carries no rules', () => {
  // The inverse guard. Without it, marking a real product `custom: true` would
  // silently exempt it from every percentage assertion in this file.
  for (const f of PROP_FIRMS) {
    for (const p of f.products) {
      const bare = p.sizes.length === 0 && p.phases.length === 0;
      assert.equal(bare, p.custom === true,
        `${f.id}/${p.id}: a product is rule-free if and only if it is the custom one`);
    }
  }
});

test('the unlisted firm names every platform, since we cannot know which it uses', async () => {
  const { PLATFORM_IDS } = await import('../src/domain/sync/platforms.js');
  assert.deepEqual([...findFirm('other').platforms].sort(), [...PLATFORM_IDS].sort(),
    'the platform step filters to the firm\'s platforms — an unknown firm must not narrow it');
});

test('templateToFields refuses a custom product — there is nothing to resolve', () => {
  assert.equal(templateToFields('other', 'custom', 50000, 'p1'), null);
  assert.equal(templateToFields('other', 'custom', 50000, 'funded'), null);
});

// ---- size membership -------------------------------------------------------

test('templateToFields rejects a size the product does not sell', () => {
  // Phase A had no membership check: today's <select> cannot produce a bad size,
  // but the wizard's product step can, and an accepted 37000 would write a
  // start_balance the firm never offered and score the challenge against it.
  assert.equal(templateToFields('gft', '2step', 37000, 'p1'), null);
  assert.equal(templateToFields('ftmo', '2step', 1, 'p1'), null);
  assert.equal(templateToFields('gft', '2step', null, 'p1'), null);
  assert.equal(templateToFields('gft', '2step', undefined, 'p1'), null);
  // A string from a form control that names a real size still resolves — the
  // caller is an <input>/<select>, and Number() was always applied.
  assert.equal(templateToFields('gft', '2step', '50000', 'p1').start_balance, 50000);
});

// ---- the wizard's view of the catalog ---------------------------------------

test('wizardProducts hides unverified rules and keeps the custom escape', () => {
  // GFT 1step and instant carry verified: false with UNCONFIRMED drawdown
  // percentages (see the file header). A wrong drawdown mis-scores a real
  // trader's account, so the wizard must not offer them until they are checked.
  assert.deepEqual(wizardProducts('gft').map((p) => p.id), ['2step']);
  assert.deepEqual(wizardProducts('ftmo').map((p) => p.id), ['2step']);
  assert.deepEqual(wizardProducts('other').map((p) => p.id), ['custom']);
  assert.deepEqual(wizardProducts('nope'), []);
  assert.deepEqual(wizardProducts(undefined), []);
});

test('wizardProducts never returns a product with unverified rules', () => {
  for (const f of PROP_FIRMS) {
    for (const p of wizardProducts(f.id)) {
      // The custom product's verified: false means "nothing to verify", not a
      // hidden real rule set — it is the one product this guarantee does not
      // apply to. The exemption cannot be abused: 'the custom product is the ONLY
      // product that carries no rules' fails the moment a real product is marked
      // custom to escape a percentage assertion.
      if (p.custom) continue;
      assert.notEqual(p.verified, false, `${f.id}/${p.id} is unverified and must not reach a user`);
    }
  }
});

test('every firm the wizard offers has at least one product to pick', () => {
  // Otherwise the firm step shows a card that leads to an empty page.
  for (const f of wizardFirms()) {
    assert.ok(wizardProducts(f.id).length > 0, `${f.id} would be a dead end in the wizard`);
  }
});

test('isCustomProduct is exact and fails safe', () => {
  assert.equal(isCustomProduct('other', 'custom'), true);
  assert.equal(isCustomProduct('gft', '2step'), false);
  assert.equal(isCustomProduct('gft', 'custom'), false, 'no real firm has a custom product');
  assert.equal(isCustomProduct('nope', 'custom'), false);
  assert.equal(isCustomProduct(undefined, undefined), false);
});

// ---- labels ----------------------------------------------------------------

test('every product id has a short label, and only the custom one is blank', () => {
  // The Phase A gap: "GoatFundedTrader 25K" was suggested for BOTH the 1-Step and
  // the 2-Step 25K account, so two accounts a trader must tell apart got one name.
  for (const id of PRODUCT_IDS) {
    assert.equal(typeof SHORT_PRODUCT_LABEL[id], 'string', `${id} has no short label`);
    if (id !== 'custom') assert.ok(SHORT_PRODUCT_LABEL[id].length > 0, `${id} short label is empty`);
  }
  assert.equal(SHORT_PRODUCT_LABEL.custom, '',
    'an unlisted firm has no product name to add — the label is firm + size');
  assert.notEqual(SHORT_PRODUCT_LABEL['1step'], SHORT_PRODUCT_LABEL['2step']);
});

test('sizeLabel renders thousands the way a trader writes them', () => {
  assert.equal(sizeLabel(25000), '25K');
  assert.equal(sizeLabel(200000), '200K');
  assert.equal(sizeLabel(1000), '1K');
  assert.equal(sizeLabel(2500), '2.5K');
  assert.equal(sizeLabel(500), '500');
  assert.equal(sizeLabel('50000'), '50K', 'form controls hand over strings');
});
```

Update the import at the top of `test/propFirms.test.js`:

```js
import {
  PROP_FIRMS, PRODUCT_IDS, SHORT_PRODUCT_LABEL, sizeLabel,
  findFirm, findProduct, templateToFields,
  wizardFirms, wizardProducts, isCustomProduct,
} from '../frontend/src/features/prop/propFirms.js';
```

Then **partition the two existing loops** so the custom product is exempted from assertions about rule data — and only those:

- In `test('catalog: every firm, product and phase is well-formed')`, inside the `for (const p of f.products)` loop, after the `verified` assertion, insert:
  ```js
  if (p.custom) { assert.equal(p.verified, false, `${f.id}/${p.id} carries no rules, so nothing is verified`); continue; }
  ```
- In `test('every product ends in a funded phase — an evaluation you cannot pass is not a product')`, inside the loop:
  ```js
  if (p.custom) continue;   // no phases to end in; asserted empty above
  ```

Leave every other existing test untouched: they iterate `p.phases`, which is empty for the custom product, so their loop bodies simply do not run.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `node --test test/propFirms.test.js`
Expected: FAIL — `SyntaxError`/`does not provide an export named 'wizardProducts'`.

- [ ] **Step 3: Extend `propFirms.js`**

Append the `other` firm as the **last** entry of `PROP_FIRMS`:

```js
  {
    // THE ESCAPE HATCH, and the reason it exists: validateProvision requires
    // firm_id AND product_id for a prop account, and this catalog lists two
    // firms out of roughly a hundred. Without this entry a trader at FundedNext
    // or Alpha Capital cannot use the prop path at all — they would have to file
    // a firm-funded account as Live Capital, which is exactly the
    // misclassification capital_kind exists to end.
    //
    // It deliberately carries NO percentages. The wizard's product and phase
    // steps collect them by hand; inventing a "typical" drawdown here would put
    // a number in front of a trader that no firm published, which is the same
    // failure mode the verified: false flags are guarding against.
    id: 'other',
    name: 'Other / not listed',
    // Every platform: we cannot know which one an unlisted firm runs, and the
    // platform step filters its grid to the firm's platforms.
    platforms: ['mt5', 'mt4', 'ctrader', 'tradelocker', 'other'],
    // A default for an editable control, not a claim about any firm. Both listed
    // firms are static and it is much the commoner model; the phase step's DD-type
    // control starts here and the user changes it.
    ddType: 'static',
    // Likewise a starting value for an editable field. Unlike a drawdown, a wrong
    // split cannot mis-score a pass or a breach — it only affects payout maths the
    // user sees immediately and can correct.
    defaultSplitPct: 80,
    products: [
      {
        id: 'custom',
        label: 'My own rules',
        custom: true,
        verified: false,   // there is nothing to verify; the user is the source
        sizes: [],         // the user types the account size
        phases: [],        // the wizard offers p1 / p2 / funded generically
      },
    ],
  },
```

Update `PRODUCT_IDS` and add the label maps near the top:

```js
export const PRODUCT_IDS = ['1step', '2step', 'instant', 'custom'];

// Short names for the account LABEL, not for a select option. The Phase A gap:
// "GoatFundedTrader 25K" was suggested for both the 1-Step and the 2-Step 25K
// account, so two accounts a trader has to tell apart got one name. The product's
// own `label` ("Challenge + Verification") is too long to sit inside an account
// name; this is the distinguishing fragment. Custom is blank on purpose — an
// unlisted firm has no product name to contribute.
export const SHORT_PRODUCT_LABEL = {
  '1step': '1-Step',
  '2step': '2-Step',
  instant: 'Instant',
  custom: '',
};

/** Human size label: 50000 -> "50K". Moved here from AccountForms.jsx — it
 *  formats catalog data and three surfaces now need it. */
export const sizeLabel = (n) => (Number(n) >= 1000 ? `${Number(n) / 1000}K` : String(n));
```

Add the wizard view and the custom predicate after `findProduct`:

```js
/**
 * The firms the Add Account wizard offers, in catalog order.
 *
 * A firm with nothing selectable would be a card that leads to an empty page, so
 * a firm whose every product is unverified is dropped here rather than dead-ended
 * two steps later.
 */
export const wizardFirms = () => PROP_FIRMS.filter((f) => wizardProducts(f.id).length > 0);

/**
 * The products the wizard offers for a firm: VERIFIED rules, plus the custom
 * escape.
 *
 * `verified: false` products are hidden deliberately (owner decision,
 * 2026-08-23). GFT's 1-Step and Instant Funding rule sets have never been checked
 * against goatfundedtrader.com, and a wrong drawdown percentage does not fail
 * loudly — it silently mis-scores a real trader's account for the length of a
 * challenge. They stay in the catalog with their flags intact so that confirming
 * them is a one-line change; they just do not reach a user first.
 */
export const wizardProducts = (firmId) =>
  findFirm(firmId)?.products.filter((p) => p.verified === true || p.custom === true) || [];

/** Is this the hand-entered-rules product? False for anything unknown. */
export const isCustomProduct = (firmId, productId) =>
  findProduct(firmId, productId)?.custom === true;
```

Add the size-membership check to `templateToFields`, immediately after the `product` lookup:

```js
  if (product.custom) return null;   // nothing to resolve; the user typed the rules
  // Phase A accepted ANY size: the pre-wizard <select> could only emit a real one,
  // but the wizard's product step can carry a stale or typed value, and an
  // accepted 37000 writes a start_balance the firm never sold and then scores
  // every drawdown against it.
  const balance = Number(size);
  if (!product.sizes.includes(balance)) return null;
```

…and use `balance` in the returned object so the value that was validated is the value that is stored:

```js
    start_balance: balance,
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `node --test test/propFirms.test.js`
Expected: PASS. Every pre-existing test in the file must still pass — in particular `REGRESSION: the 2-step rules carried over from the pre-products catalog are unchanged`. If that one fails you have altered live rule data; revert and re-read.

- [ ] **Step 5: Keep `AccountFormModal`'s picker out of the custom product**

`TemplatePicker` renders `firm?.products` straight into a `<select>`. The custom product has empty `sizes` and `phases`, so choosing it leaves both dependent selects empty and `Apply` permanently disabled — a dead end in the edit modal.

In `frontend/src/features/accounts/AccountForms.jsx`, delete the local `sizeLabel` definition and import it, then filter the product options:

```js
import { PROP_FIRMS, findFirm, findProduct, templateToFields, sizeLabel } from '../prop/propFirms.js';
```

```js
        <select value={productId} onChange={(e) => pickProduct(e.target.value)} disabled={!firm} aria-label="Account type">
          <option value="">Account type…</option>
          {/* The custom product has no sizes and no phases by design — the Add
              Account wizard collects those by hand. In this picker it would be a
              choice that leaves Size and Phase empty and Apply disabled forever. */}
          {firm?.products.filter((p) => !p.custom).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
```

The firm `<select>` keeps rendering every firm including `other`: picking it now yields no products, which reads correctly as "this firm has no template" in a picker whose whole purpose is pre-filling.

- [ ] **Step 6: Full suite + frontend build**

Run: `npm test`
Expected: all green.

Run: `cd frontend && npm run build`
Expected: `✓ built`.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/prop/propFirms.js test/propFirms.test.js \
        frontend/src/features/accounts/AccountForms.jsx
git commit -m "$(cat <<'MSG'
Give an unlisted firm a way through the prop path, and pin the size

Three gaps the wizard would have walked into. validateProvision requires a firm
and a product for every prop account while the catalog lists two firms, so a
trader at any other firm had to file a firm-funded account as Live Capital —
the misclassification capital_kind exists to end. The 'other' firm's custom
product carries no percentages at all, and the tests now assert that a product
is rule-free if and only if it is that one, so marking a real product custom
cannot exempt it from the rule-data invariants.

templateToFields accepted any size. Today's select could not emit a bad one; a
wizard step can, and an accepted 37000 would score every drawdown against a
balance the firm never sold.

SHORT_PRODUCT_LABEL closes the suggestion collision: GFT 1-Step 25K and 2-Step
25K both suggested "GoatFundedTrader 25K".

wizardProducts hides verified: false products. GFT's 1-Step and Instant rules
have never been checked against the firm, and a wrong drawdown does not fail
loudly — it mis-scores a real account for a whole challenge.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---
## Task 3: `newAccountFlow.js` — the whole flow as pure functions

**This is the task that makes Phase B testable at all.** The eleven pages cannot be exercised — no jsdom, no RTL — so every decision worth pinning has to live here: which steps a branch has, whether a deep link is allowed, what a choice invalidates, which step commits, and what the provision payload looks like. Spec §8.1 and §9.1.

**It must stay JSX-free and React-free.** It may import `propFirms.js` and `platformCatalog.js` — both are pure data modules that `node:test` already imports today (`propFirms.test.js`, `platform-catalog.test.js`). It must not import `api.js` (`import.meta.env` at module scope), any `.jsx` file, or anything under `components/`.

**Files:**
- Create: `frontend/src/features/accounts/newAccountFlow.js`
- Create: `test/new-account-flow.test.js`

**Interfaces:**
- Consumes: `propFirms.js` (`findFirm`, `isCustomProduct`, `SHORT_PRODUCT_LABEL`, `sizeLabel`), `platformCatalog.js` (`findPlatformCard`).
- Produces — the API every page and the shell import:
  - `FLOW_VERSION: number`, `DRAFT_KEY: string`, `STEP_IDS: string[]`, `PHASES: string[]`
  - `emptyDraft({ provisionKey, firstRun }) → draft`
  - `reviveDraft(rawJson, { provisionKey, firstRun }) → draft`
  - `stepsFor(draft) → stepId[]`
  - `isStepComplete(draft, stepId) → boolean`
  - `firstIncomplete(draft) → stepId`
  - `canVisit(draft, stepId) → boolean`
  - `nextStep(draft, stepId) → stepId|null`
  - `prevStep(draft, stepId) → stepId|null`
  - `progress(draft, stepId) → { index, total }` (1-based `index`, `0` for an unknown step)
  - `patchDraft(draft, patch) → draft`
  - `commitStep(draft) → 'import'|'connect'|null`
  - `isCommitted(draft) → boolean`
  - `suggestedLabel(draft) → string`
  - `toProvisionPayload(draft) → object`

- [ ] **Step 1: Write the failing test**

```js
// test/new-account-flow.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FLOW_VERSION, DRAFT_KEY, STEP_IDS, PHASES,
  emptyDraft, reviveDraft, stepsFor, isStepComplete, firstIncomplete, canVisit,
  nextStep, prevStep, progress, patchDraft, commitStep, isCommitted,
  suggestedLabel, toProvisionPayload,
} from '../frontend/src/features/accounts/newAccountFlow.js';
import { validateProvision } from '../src/domain/accounts/provision.js';

// The Add Account wizard is eleven ROUTES, and none of them can be rendered in
// this repo: there is no jsdom and no React Testing Library, by decision. So the
// flow is a pure module and this file is the whole of its coverage — step lists,
// guard resolution, the invalidation cascade, which step commits, and the payload.
// A page is thin on purpose: it renders, it calls patch(), it navigates.
//
// The module imports propFirms.js and platformCatalog.js, both pure data modules
// node:test already reads elsewhere. It must never reach api.js (import.meta.env
// at module scope), a .jsx file, or components/ — CI installs backend deps only,
// so such an import fails here and nowhere else.

// ---- helpers ---------------------------------------------------------------

const KEY = '11111111-2222-3333-4444-555555555555';
const fresh = (over = {}) => ({ ...emptyDraft({ provisionKey: KEY }), ...over });

/** A complete prop draft up to (not including) the import method. */
const propUpToImport = (over = {}) => fresh({
  capital_kind: 'prop',
  firm_id: 'gft', firm_name: 'GoatFundedTrader',
  product_id: '2step',
  start_balance: 25000,
  account_type: 'eval',
  daily_dd_pct: 5, max_dd_pct: 10, profit_target_pct: 8,
  payout_split_pct: null, dd_type: 'static', min_trading_days: 3,
  phase: 'p1',
  label: 'GoatFundedTrader 2-Step 25K',
  platform: 'mt5',
  ...over,
});

const liveUpToImport = (over = {}) => fresh({
  capital_kind: 'live',
  label: 'My IC Markets live',
  platform: 'mt5',
  broker: 'IC Markets',
  ...over,
});

// ---- the step lists (spec §3, decision B1) ---------------------------------

test('the route list is exactly the eleven ids in spec §8.1', () => {
  assert.deepEqual(STEP_IDS, [
    'welcome', 'capital', 'firm', 'product', 'phase',
    'name', 'platform', 'import', 'connect', 'upload', 'done',
  ]);
});

test('every step a branch can produce is one of the eleven routes', () => {
  // Otherwise stepsFor names a step with no <Route>, and the guard navigates to
  // a URL that renders nothing.
  const drafts = [
    fresh(), fresh({ firstRun: true }),
    liveUpToImport({ import_method: 'manual' }),
    liveUpToImport({ import_method: 'file' }),
    propUpToImport({ import_method: 'auto_sync' }),
    propUpToImport({ import_method: 'ea' }),
    propUpToImport({ import_method: 'file' }),
    propUpToImport({ import_method: 'manual' }),
  ];
  for (const d of drafts) {
    for (const s of stepsFor(d)) assert.ok(STEP_IDS.includes(s), `unknown step ${s}`);
  }
});

test('spec §3: Live + Manual is five steps', () => {
  assert.deepEqual(
    stepsFor(liveUpToImport({ import_method: 'manual' })),
    ['capital', 'name', 'platform', 'import', 'done'],
  );
});

test('spec §3: Prop + Auto Sync is nine steps', () => {
  assert.deepEqual(
    stepsFor(propUpToImport({ import_method: 'auto_sync' })),
    ['capital', 'firm', 'product', 'phase', 'name', 'platform', 'import', 'connect', 'done'],
  );
});

test('decision B1: name comes after phase on the prop path, so the label can name the product', () => {
  const steps = stepsFor(propUpToImport({ import_method: 'auto_sync' }));
  assert.ok(steps.indexOf('name') > steps.indexOf('phase'));
  assert.ok(steps.indexOf('name') > steps.indexOf('product'));
});

test('the live path never asks about a firm, a product or a phase', () => {
  for (const m of ['manual', 'file', 'auto_sync', 'ea']) {
    const steps = stepsFor(liveUpToImport({ import_method: m }));
    for (const s of ['firm', 'product', 'phase']) {
      assert.equal(steps.includes(s), false, `live + ${m} must not ask for ${s}`);
    }
  }
});

test('the EA sub-choice routes through connect, exactly like our terminal does', () => {
  // Spec §7.4: the EA is a sub-choice UNDER Auto Sync, not a peer option, and
  // `connect` is where the choice is made. Both land there.
  assert.ok(stepsFor(propUpToImport({ import_method: 'ea' })).includes('connect'));
  assert.ok(stepsFor(propUpToImport({ import_method: 'auto_sync' })).includes('connect'));
});

test('only the file route gets an upload step, and it never also gets connect', () => {
  const file = stepsFor(propUpToImport({ import_method: 'file' }));
  assert.ok(file.includes('upload'));
  assert.equal(file.includes('connect'), false);
  for (const m of ['manual', 'auto_sync', 'ea']) {
    assert.equal(stepsFor(propUpToImport({ import_method: m })).includes('upload'), false, m);
  }
});

test('before a branch is chosen the flow is the shortest honest path', () => {
  // Decision B2: the total is computed from the CURRENT draft, so it grows as the
  // branch resolves rather than overstating the work up front.
  assert.deepEqual(stepsFor(fresh()), ['capital', 'name', 'platform', 'import', 'done']);
});

test('first run adds welcome to the front of whatever branch follows', () => {
  assert.equal(stepsFor(fresh({ firstRun: true }))[0], 'welcome');
  assert.equal(stepsFor(propUpToImport({ firstRun: true, import_method: 'auto_sync' }))[0], 'welcome');
  assert.equal(stepsFor(fresh()).includes('welcome'), false, 'a returning user never sees welcome');
});

test('stepsFor is total — no draft shape throws', () => {
  for (const d of [undefined, null, {}, { capital_kind: 'nonsense' }]) {
    assert.ok(Array.isArray(stepsFor(d)), String(d));
  }
});

// ---- progress (decision B2) -------------------------------------------------

test('progress counts within the resolved branch, one-based', () => {
  assert.deepEqual(progress(liveUpToImport({ import_method: 'manual' }), 'platform'), { index: 3, total: 5 });
  assert.deepEqual(progress(propUpToImport({ import_method: 'auto_sync' }), 'connect'), { index: 8, total: 9 });
});

test('progress grows honestly as the branch resolves', () => {
  const atCapital = fresh();
  assert.equal(progress(atCapital, 'capital').total, 5);
  const chosePropFirm = patchDraft(atCapital, { capital_kind: 'prop' });
  assert.equal(progress(chosePropFirm, 'capital').total, 8);
  const choseAutoSync = patchDraft(propUpToImport(), { import_method: 'auto_sync' });
  assert.equal(progress(choseAutoSync, 'capital').total, 9);
});

test('progress on a step this branch does not have reports index 0, not a wrong number', () => {
  // A live draft asked about `firm` means the guard is about to redirect. Claiming
  // "step 3 of 5" for a step that is not in the list would render a lie for a frame.
  assert.deepEqual(progress(liveUpToImport({ import_method: 'manual' }), 'firm'), { index: 0, total: 5 });
});

// ---- the guard (spec §8.1) --------------------------------------------------

test('a cold deep link to a late step resolves back to the first thing unanswered', () => {
  // Spec §8.1: "deep-linking /accounts/new/phase cold lands on capital".
  assert.equal(firstIncomplete(fresh()), 'capital');
  assert.equal(firstIncomplete(fresh({ firstRun: true })), 'welcome');
});

test('the guard walks the branch in order, one answer at a time', () => {
  let d = fresh();
  assert.equal(firstIncomplete(d), 'capital');
  d = patchDraft(d, { capital_kind: 'prop' });
  assert.equal(firstIncomplete(d), 'firm');
  d = patchDraft(d, { firm_id: 'gft', firm_name: 'GoatFundedTrader' });
  assert.equal(firstIncomplete(d), 'product');
  d = patchDraft(d, { product_id: '2step', start_balance: 25000, daily_dd_pct: 5, max_dd_pct: 10 });
  assert.equal(firstIncomplete(d), 'phase');
  d = patchDraft(d, { phase: 'p1', account_type: 'eval', profit_target_pct: 8, min_trading_days: 3 });
  assert.equal(firstIncomplete(d), 'name');
  d = patchDraft(d, { label: 'GFT 2-Step 25K' });
  assert.equal(firstIncomplete(d), 'platform');
  d = patchDraft(d, { platform: 'mt5' });
  assert.equal(firstIncomplete(d), 'import');
  d = patchDraft(d, { import_method: 'auto_sync' });
  assert.equal(firstIncomplete(d), 'connect');
  d = patchDraft(d, { account: { id: 7, mt5_login: 314943467 } });
  assert.equal(firstIncomplete(d), 'done');
});

test('the product step is not done until it has a balance AND both drawdowns', () => {
  // The custom-rules path is why. validateProvision numOrNulls a missing
  // percentage and mt5_accounts COALESCEs it to 5/10/8 — so an unlisted firm's
  // account would silently be judged against GoatFundedTrader's rules.
  const base = fresh({ capital_kind: 'prop', firm_id: 'other', firm_name: 'FundedNext', product_id: 'custom' });
  assert.equal(isStepComplete(base, 'product'), false, 'no balance, no drawdowns');
  assert.equal(isStepComplete({ ...base, start_balance: 50000 }, 'product'), false, 'no drawdowns');
  assert.equal(isStepComplete({ ...base, start_balance: 50000, daily_dd_pct: 4 }, 'product'), false, 'no max DD');
  assert.equal(isStepComplete({ ...base, start_balance: 50000, daily_dd_pct: 4, max_dd_pct: 8 }, 'product'), true);
});

test('a zero drawdown is an answer, not a blank', () => {
  // 0 is falsy and min_trading_days: 0 is a real value ("no requirement"), which
  // is the exact bug numOrNull exists to avoid on the server. Same trap here.
  const d = fresh({
    capital_kind: 'prop', firm_id: 'other', firm_name: 'X', product_id: 'custom',
    start_balance: 50000, daily_dd_pct: 0, max_dd_pct: 0, min_trading_days: 0,
  });
  assert.equal(isStepComplete(d, 'product'), true);
});

test('the phase step is not done until the phase-dependent number is in', () => {
  const evalDraft = propUpToImport({ phase: 'p1', account_type: 'eval', profit_target_pct: null });
  assert.equal(isStepComplete(evalDraft, 'phase'), false, 'an eval phase needs a profit target');
  assert.equal(isStepComplete({ ...evalDraft, profit_target_pct: 8 }, 'phase'), true);

  const fundedDraft = propUpToImport({ phase: 'funded', account_type: 'funded', payout_split_pct: null });
  assert.equal(isStepComplete(fundedDraft, 'phase'), false, 'a funded phase needs a split');
  assert.equal(isStepComplete({ ...fundedDraft, payout_split_pct: 80 }, 'phase'), true);
});

test('account_type is derived from the phase, never trusted from a page', () => {
  // One fact under two names. Eleven pages each remembering to set both is how a
  // funded challenge gets filed as an evaluation, and the prop engine then scores
  // it against a profit target it does not have.
  const base = propUpToImport({ phase: null, account_type: 'eval', payout_split_pct: null });

  const funded = patchDraft(base, { phase: 'funded', payout_split_pct: 80 });
  assert.equal(funded.account_type, 'funded', 'the phase alone settles it — no second control');
  assert.equal(isStepComplete(funded, 'phase'), true);

  const evaluation = patchDraft(base, { phase: 'p1', profit_target_pct: 8 });
  assert.equal(evaluation.account_type, 'eval');

  // The half that actually mattered: a page CANNOT contradict the phase. Before
  // this was derived, {phase:'funded', account_type:'eval'} was a complete step
  // and produced a payload carrying both.
  const lied = patchDraft(base, { phase: 'funded', account_type: 'eval', profit_target_pct: 8 });
  assert.equal(lied.account_type, 'funded', 'the phase wins');
  assert.equal(toProvisionPayload(lied).account_type, 'funded');
  assert.equal(isStepComplete(lied, 'phase'), false, 'and it now asks for the split it needs');
});

test('a platform badged Soon is not a complete answer', () => {
  // mt4, cTrader and TradeLocker are listed so the catalog reads as the real
  // roadmap, and the backend refuses all three. Accepting one here would pass the
  // step and then 400 at the commit, two steps later.
  for (const soon of ['mt4', 'ctrader', 'tradelocker']) {
    assert.equal(isStepComplete({ ...fresh(), platform: soon }, 'platform'), false, soon);
  }
  for (const live of ['mt5', 'other']) {
    assert.equal(isStepComplete({ ...fresh(), platform: live }, 'platform'), true, live);
  }
  assert.equal(isStepComplete({ ...fresh(), platform: 'zzz' }, 'platform'), false, 'unknown platform');
});

test('the phase step rejects a phase the challenges table does not accept', () => {
  assert.deepEqual(PHASES, ['p1', 'p2', 'funded']);
  assert.equal(isStepComplete(propUpToImport({ phase: 'p3' }), 'phase'), false);
});

test('a whitespace-only label is not a name', () => {
  assert.equal(isStepComplete(fresh({ label: '   ' }), 'name'), false);
  assert.equal(isStepComplete(fresh({ label: ' GFT ' }), 'name'), true);
});

test('the commit step is not complete until the account exists', () => {
  // Provision failing (a 409, a 500, a dropped connection) must leave the user ON
  // the step that failed, not one past it — the account does not exist yet.
  const manual = liveUpToImport({ import_method: 'manual' });
  assert.equal(isStepComplete(manual, 'import'), false, 'manual commits AT import');
  assert.equal(firstIncomplete(manual), 'import');
  assert.equal(isStepComplete({ ...manual, account: { id: 3, mt5_login: -3 } }, 'import'), true);

  const autoSync = propUpToImport({ import_method: 'auto_sync' });
  assert.equal(isStepComplete(autoSync, 'import'), true, 'auto_sync does not commit at import');
  assert.equal(isStepComplete(autoSync, 'connect'), false);
});

test('upload is skippable but the guard still lands you on it', () => {
  const committed = propUpToImport({ import_method: 'file', account: { id: 9, mt5_login: -9 } });
  assert.equal(firstIncomplete(committed), 'upload');
  assert.equal(firstIncomplete(patchDraft(committed, { uploadDone: true })), 'done');
});

test('done is never complete, so the guard can always come to rest on it', () => {
  const finished = propUpToImport({ import_method: 'manual', account: { id: 1, mt5_login: -1 } });
  assert.equal(isStepComplete(finished, 'done'), false);
  assert.equal(firstIncomplete(finished), 'done');
});

test('isStepComplete is total — an unknown step is never complete', () => {
  assert.equal(isStepComplete(fresh(), 'nope'), false);
  assert.equal(isStepComplete(undefined, 'capital'), false);
});

test('canVisit allows every answered step and the first unanswered one', () => {
  // The guard lives in the SHELL, not in eleven page components (spec §8.1 puts
  // it per page; one implementation cannot drift from itself, eleven can). This
  // is the predicate it uses, so the rule is a tested fact rather than a
  // component's arithmetic.
  const d = propUpToImport({ import_method: 'auto_sync' });   // everything up to connect
  for (const s of ['capital', 'firm', 'product', 'phase', 'name', 'platform', 'import', 'connect']) {
    assert.equal(canVisit(d, s), true, `${s} is answered or next — it must be reachable`);
  }
  assert.equal(canVisit(d, 'done'), false, 'the account does not exist yet');
});

test('canVisit refuses a step this branch does not have', () => {
  // Deep-linking /accounts/new/phase on a live draft must not render an empty
  // page: the step is not in the branch at all.
  const live = liveUpToImport({ import_method: 'manual' });
  assert.equal(canVisit(live, 'phase'), false);
  assert.equal(canVisit(live, 'firm'), false);
  assert.equal(canVisit(live, 'upload'), false, 'manual has no upload step');
  assert.equal(canVisit(live, 'welcome'), false, 'not a first-run draft');
});

test('canVisit refuses a step nothing has answered up to yet', () => {
  const cold = fresh();
  assert.equal(canVisit(cold, 'capital'), true);
  assert.equal(canVisit(cold, 'name'), false);
  assert.equal(canVisit(cold, 'import'), false);
});

test('canVisit lets a committed draft reach only what remains', () => {
  // Forward-only (spec §6.2): the earlier steps are answered but re-visiting one
  // and pressing Continue would write a second account.
  const committed = propUpToImport({ import_method: 'file', account: { id: 2, mt5_login: -2 } });
  assert.equal(canVisit(committed, 'upload'), true);
  assert.equal(canVisit(committed, 'done'), false, 'upload has not been answered');
  for (const s of ['capital', 'firm', 'product', 'phase', 'name', 'platform', 'import']) {
    assert.equal(canVisit(committed, s), false, `${s} must be sealed once the account exists`);
  }
  const skipped = patchDraft(committed, { uploadDone: true });
  assert.equal(canVisit(skipped, 'done'), true);
});

test('canVisit is total and never throws', () => {
  assert.equal(canVisit(undefined, 'capital'), true, 'a missing draft is a fresh one');
  assert.equal(canVisit(fresh(), undefined), false);
  assert.equal(canVisit(fresh(), 'zzz'), false);
});

// ---- navigation ------------------------------------------------------------

test('next and prev walk the resolved branch', () => {
  const d = propUpToImport({ import_method: 'auto_sync' });
  assert.equal(nextStep(d, 'phase'), 'name');
  assert.equal(prevStep(d, 'name'), 'phase');
  assert.equal(nextStep(d, 'import'), 'connect');
  assert.equal(nextStep(d, 'done'), null, 'nothing follows done');
  assert.equal(prevStep(d, 'capital'), null, 'nothing precedes the first step');
});

test('prev skips the steps this branch does not have', () => {
  const live = liveUpToImport({ import_method: 'manual' });
  assert.equal(prevStep(live, 'name'), 'capital', 'the live path has no phase to go back to');
});

test('spec §6.2: after commit there is NO way back', () => {
  // A Back button past the commit point silently creates a SECOND account, which
  // is the entire reason this is forward-only.
  const committed = propUpToImport({ import_method: 'auto_sync', account: { id: 4, mt5_login: 500 } });
  for (const step of stepsFor(committed)) {
    assert.equal(prevStep(committed, step), null, `${step} must offer no way back once committed`);
  }
});

test('next and prev fail safe on a step outside the branch', () => {
  const live = liveUpToImport({ import_method: 'manual' });
  assert.equal(nextStep(live, 'phase'), null);
  assert.equal(prevStep(live, 'phase'), null);
});

// ---- patchDraft: the invalidation cascade (spec §6.1) ----------------------

test('prop → live drops the firm, the product, the phase and every rule', () => {
  // Spec §6.1. Scattering this across eleven page components is how a wizard
  // submits an FTMO product against a GFT account.
  const d = patchDraft(propUpToImport(), { capital_kind: 'live' });
  assert.equal(d.capital_kind, 'live');
  for (const f of ['firm_id', 'firm_name', 'product_id', 'phase',
                   'daily_dd_pct', 'max_dd_pct', 'profit_target_pct', 'payout_split_pct',
                   'min_trading_days', 'start_balance']) {
    assert.equal(d[f], null, `${f} survived the switch to live`);
  }
});

test('live → prop drops the broker, which only a live account has', () => {
  const d = patchDraft(liveUpToImport(), { capital_kind: 'prop' });
  assert.equal(d.broker, null);
});

test('re-choosing the SAME capital kind invalidates nothing', () => {
  // Otherwise clicking the already-selected card wipes four answers.
  const before = propUpToImport();
  const after = patchDraft(before, { capital_kind: 'prop' });
  assert.deepEqual(after, before);
});

test('a new firm drops the product, the phase and the rules', () => {
  const d = patchDraft(propUpToImport(), { firm_id: 'ftmo', firm_name: 'FTMO' });
  assert.equal(d.firm_id, 'ftmo');
  assert.equal(d.product_id, null);
  assert.equal(d.phase, null);
  assert.equal(d.max_dd_pct, null);
});

test('a new product drops the phase and the rules but keeps the firm', () => {
  const d = patchDraft(propUpToImport(), { product_id: '1step' });
  assert.equal(d.firm_id, 'gft');
  assert.equal(d.product_id, '1step');
  assert.equal(d.phase, null);
  assert.equal(d.profit_target_pct, null);
});

test('one patch may set a product AND its resolved rules — invalidation runs first', () => {
  // THE ORDERING BUG THIS GUARDS. The product step applies templateToFields in a
  // single patch. If the cascade cleared the rules AFTER merging the patch, the
  // numbers the step just resolved would be wiped and the step could never
  // complete.
  //
  // The patch has to be a real product CHANGE, because a change is the only thing
  // that fires invalidation at all — re-selecting the product already chosen must
  // invalidate nothing (asserted directly below). So this switches the 2-Step
  // fixture to 1-Step and carries 1-Step's own resolved numbers. Patching the
  // fixture's existing product would make this test vacuous: no cascade would run,
  // and the ordering it exists to pin would go unexercised.
  const d = patchDraft(propUpToImport(), {
    product_id: '1step', start_balance: 100000,
    daily_dd_pct: 4, max_dd_pct: 6, profit_target_pct: 10, min_trading_days: 3,
    account_type: 'eval',
  });
  assert.equal(d.product_id, '1step');
  assert.equal(d.start_balance, 100000);
  assert.equal(d.daily_dd_pct, 4);
  assert.equal(d.max_dd_pct, 6);
  assert.equal(d.profit_target_pct, 10);
  assert.equal(d.phase, null, 'the phase still had to be dropped');
});

test('re-choosing the SAME product invalidates nothing', () => {
  // The symmetric half of the capital_kind rule, and it is a real hazard: clicking
  // the already-selected product card must not wipe the phase and the rules the
  // user has already answered. Invalidation keys off a value CHANGE, uniformly,
  // for every identity field.
  const before = propUpToImport();
  const after = patchDraft(before, { product_id: '2step' });
  assert.deepEqual(after, before);
});

test('a platform that cannot Auto Sync drops a chosen Auto Sync', () => {
  // Spec §6.1. `other` offers only file and manual, so an auto_sync carried over
  // from MT5 would submit a payload platformSupports() refuses with a 400.
  const d = patchDraft(propUpToImport({ import_method: 'auto_sync' }), { platform: 'other' });
  assert.equal(d.platform, 'other');
  assert.equal(d.import_method, null);
});

test('a platform change keeps an import method the new platform still offers', () => {
  const d = patchDraft(propUpToImport({ import_method: 'file' }), { platform: 'other' });
  assert.equal(d.import_method, 'file');
});

test('the EA route is dropped by a platform that has no EA', () => {
  // The EA is a .mq5 file: MT5 only. `other` must not keep it.
  const d = patchDraft(propUpToImport({ import_method: 'ea' }), { platform: 'other' });
  assert.equal(d.import_method, null);
});

test('an unknown platform drops every import method rather than trusting one', () => {
  const d = patchDraft(propUpToImport({ import_method: 'manual' }), { platform: 'zzz' });
  assert.equal(d.import_method, null);
});

test('patchDraft never mutates the draft it was given', () => {
  const before = propUpToImport();
  const snapshot = JSON.parse(JSON.stringify(before));
  patchDraft(before, { capital_kind: 'live' });
  assert.deepEqual(before, snapshot);
});

test('after commit, patchDraft accepts only the upload flag', () => {
  // Everything else fed the INSERT. A patch that changed it would put the draft
  // and the committed row out of agreement with no way to reconcile them, and the
  // user has no route back to re-submit.
  const committed = propUpToImport({ import_method: 'file', account: { id: 5, mt5_login: -5 } });
  const tampered = patchDraft(committed, {
    capital_kind: 'live', label: 'other', firm_id: 'ftmo', platform: 'other',
    import_method: 'auto_sync', account: null, uploadDone: true,
  });
  assert.equal(tampered.capital_kind, 'prop');
  assert.equal(tampered.label, committed.label);
  assert.equal(tampered.firm_id, 'gft');
  assert.equal(tampered.platform, 'mt5');
  assert.equal(tampered.import_method, 'file');
  assert.deepEqual(tampered.account, { id: 5, mt5_login: -5 });
  assert.equal(tampered.uploadDone, true, 'the one field a post-commit step owns');
});

// ---- the commit point (spec §6.2) ------------------------------------------

test('the commit step is the last step that collects data, per branch', () => {
  assert.equal(commitStep(liveUpToImport({ import_method: 'manual' })), 'import');
  assert.equal(commitStep(propUpToImport({ import_method: 'file' })), 'import');
  assert.equal(commitStep(propUpToImport({ import_method: 'auto_sync' })), 'connect');
  assert.equal(commitStep(propUpToImport({ import_method: 'ea' })), 'connect');
  assert.equal(commitStep(fresh()), null, 'no method chosen yet');
});

test('isCommitted keys off the account, nothing else', () => {
  assert.equal(isCommitted(fresh()), false);
  assert.equal(isCommitted(fresh({ account: { id: 1, mt5_login: -1 } })), true);
  assert.equal(isCommitted(undefined), false);
});

// ---- the suggested label (the Phase A gap) ---------------------------------

test('the suggested label distinguishes two products of the same size', () => {
  // Phase A left both GFT 1-Step 25K and 2-Step 25K suggesting
  // "GoatFundedTrader 25K" — one name for two accounts a trader must tell apart.
  const twoStep = suggestedLabel(propUpToImport());
  const oneStep = suggestedLabel(propUpToImport({ product_id: '1step' }));
  assert.equal(twoStep, 'GoatFundedTrader 2-Step 25K');
  assert.equal(oneStep, 'GoatFundedTrader 1-Step 25K');
  assert.notEqual(twoStep, oneStep);
});

test('the suggested label uses the firm name the user typed for an unlisted firm', () => {
  const d = propUpToImport({
    firm_id: 'other', firm_name: 'FundedNext', product_id: 'custom', start_balance: 50000,
  });
  assert.equal(suggestedLabel(d), 'FundedNext 50K',
    'the catalog name "Other / not listed" must never become an account label');
});

test('the suggested label is empty when there is nothing to suggest', () => {
  assert.equal(suggestedLabel(liveUpToImport()), '', 'a live account has no firm to name');
  assert.equal(suggestedLabel(fresh({ capital_kind: 'prop' })), '', 'no firm chosen yet');
  assert.equal(suggestedLabel(fresh({ capital_kind: 'prop', firm_id: 'zzz' })), '');
  assert.equal(suggestedLabel(undefined), '');
});

// ---- toProvisionPayload ----------------------------------------------------

test('a prop payload passes validateProvision unchanged', () => {
  // The real check: the payload this module builds is the payload the endpoint
  // accepts. Phase A's validator is imported directly rather than restated, so a
  // future change to either side breaks here instead of in production.
  const payload = toProvisionPayload(propUpToImport({ import_method: 'ea' }));
  const parsed = validateProvision(payload);
  assert.ok(parsed.ok, parsed.error);
  assert.equal(parsed.value.capital_kind, 'prop');
  assert.equal(parsed.value.kind, 'synced');
  assert.equal(parsed.value.phase, 'p1');
  assert.equal(parsed.value.product_id, '2step');
  assert.equal(parsed.value.provision_key, KEY);
});

test('a live payload passes, and carries no prop fields at all', () => {
  // validateProvision REJECTS a live payload that names a firm, product or phase —
  // silently dropping them would make an account the user believes tracks firm
  // rules, which is the bug capital_kind exists to end. So the payload must not
  // merely blank them, it must not offend the validator.
  const payload = toProvisionPayload(liveUpToImport({ import_method: 'manual' }));
  const parsed = validateProvision(payload);
  assert.ok(parsed.ok, parsed.error);
  assert.equal(parsed.value.capital_kind, 'live');
  assert.equal(parsed.value.kind, 'manual');
  assert.equal(parsed.value.firm_id, null);
  assert.equal(parsed.value.product_id, null);
  assert.equal(parsed.value.phase, null);
  assert.equal(parsed.value.broker, 'IC Markets');
});

test('a live payload survives a draft that once held prop answers', () => {
  // The user picked Prop, answered four questions, went back and chose Live
  // Capital. patchDraft cleared the fields; this asserts the payload the endpoint
  // sees is clean, because validateProvision 400s on a stray firm_id.
  const flipped = patchDraft(propUpToImport({ import_method: 'manual' }), { capital_kind: 'live' });
  const withName = patchDraft(flipped, { label: 'My own account' });
  const parsed = validateProvision(toProvisionPayload(withName));
  assert.ok(parsed.ok, parsed.error);
});

test('every import method produces a payload the endpoint accepts', () => {
  for (const [method, platform] of [['manual', 'mt5'], ['file', 'other'], ['ea', 'mt5'], ['auto_sync', 'mt5']]) {
    const draft = propUpToImport({ import_method: method, platform });
    const payload = toProvisionPayload(draft);
    // auto_sync is the one method that needs a credential, and the credential is
    // NEVER in the draft — the connect step adds it at call time. Mirror that here.
    if (method === 'auto_sync') payload.credential = { server: 'GoatFunded-Server', login: 314943467, password: 'x' };
    const parsed = validateProvision(payload);
    assert.ok(parsed.ok, `${method}: ${parsed.error}`);
  }
});

test('toProvisionPayload never carries a credential or a password', () => {
  // The password is never in the draft (spec §6.1): sessionStorage is readable by
  // any script on the origin. This asserts the payload builder cannot leak one
  // even if a future step wrongly put one in the draft.
  const poisoned = propUpToImport({ import_method: 'auto_sync', password: 'hunter2', credential: { password: 'hunter2' } });
  const payload = toProvisionPayload(poisoned);
  assert.equal('credential' in payload, false);
  assert.equal('password' in payload, false);
  assert.equal(JSON.stringify(payload).includes('hunter2'), false);
});

test('toProvisionPayload trims the label the user typed', () => {
  const payload = toProvisionPayload(liveUpToImport({ import_method: 'manual', label: '  Spaced  ' }));
  assert.equal(payload.label, 'Spaced');
});

// ---- the sessionStorage contract -------------------------------------------

test('the draft key carries the schema version, so a bump orphans the old blob', () => {
  assert.equal(DRAFT_KEY, `propvexis.newAccount.v${FLOW_VERSION}`);
});

test('reviveDraft resumes a matching draft, keeping its provision key', () => {
  // The key must survive a refresh or the idempotency guard never fires: a
  // network drop after COMMIT is exactly when a user reloads and presses again.
  const stored = { ...propUpToImport({ import_method: 'auto_sync' }), provision_key: 'stored-key' };
  const back = reviveDraft(JSON.stringify(stored), { provisionKey: 'a-fresh-one' });
  assert.equal(back.provision_key, 'stored-key');
  assert.equal(back.firm_id, 'gft');
  assert.equal(back.import_method, 'auto_sync');
});

test('reviveDraft discards anything it cannot fully understand', () => {
  // A half-understood draft resuming into a wizard is worse than starting over:
  // the user can retype four answers, but a payload assembled from fields that
  // mean something else creates the WRONG account.
  for (const bad of ['', 'not json', 'null', '[]', '"a string"', JSON.stringify({ v: 999, firm_id: 'gft' })]) {
    const d = reviveDraft(bad, { provisionKey: KEY });
    assert.equal(d.provision_key, KEY, `${bad} should have produced a fresh draft`);
    assert.equal(d.firm_id, null);
    assert.equal(d.v, FLOW_VERSION);
  }
  assert.equal(reviveDraft(undefined, { provisionKey: KEY }).capital_kind, null);
  assert.equal(reviveDraft(null, { provisionKey: KEY }).capital_kind, null);
});

test('reviveDraft takes firstRun from the live user, never from storage', () => {
  // onboarded_at is server state. A stale `firstRun: true` in sessionStorage would
  // put the welcome step in front of an onboarded user, and a stale false would
  // deny it to a genuinely new one.
  const stored = JSON.stringify({ ...emptyDraft({ provisionKey: KEY }), firstRun: true });
  assert.equal(reviveDraft(stored, { provisionKey: KEY, firstRun: false }).firstRun, false);
  assert.equal(reviveDraft(stored, { provisionKey: KEY, firstRun: true }).firstRun, true);
});

test('emptyDraft is complete — a revived draft can never be missing a field', () => {
  const keys = Object.keys(emptyDraft({ provisionKey: KEY })).sort();
  const revived = Object.keys(reviveDraft(JSON.stringify({ v: FLOW_VERSION }), { provisionKey: KEY })).sort();
  assert.deepEqual(revived, keys);
});

test('emptyDraft holds no password field of any kind', () => {
  // Spec §6.1, asserted structurally rather than trusted: the credentials step
  // holds the password in component state and hands it straight to the provision
  // call, because sessionStorage is readable by any script on the origin.
  const keys = Object.keys(emptyDraft({ provisionKey: KEY }));
  for (const k of keys) {
    assert.equal(/pass|secret|credential|token/i.test(k), false,
      `emptyDraft has a '${k}' field — nothing secret may be mirrored to sessionStorage`);
  }
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `node --test test/new-account-flow.test.js`
Expected: FAIL — `Cannot find module '.../newAccountFlow.js'`.

- [ ] **Step 3: Write `newAccountFlow.js`**

```js
// THE ADD ACCOUNT FLOW, as pure functions.
//
// WHY EVERYTHING IS HERE. The wizard is eleven routes and this repo cannot render
// one in a test: no jsdom, no React Testing Library, by decision. So every
// decision worth pinning lives in this module and the pages are thin — they
// render, they call patch(), they navigate. What that buys is
// test/new-account-flow.test.js: step counts per branch, guard resolution, the
// invalidation cascade, the commit point, and a payload asserted against Phase
// A's own validateProvision rather than against a restatement of it.
//
// JSX-FREE AND REACT-FREE, and it must stay that way. node:test imports it
// directly and CI installs BACKEND dependencies only, so an import that reaches
// React, react-router-dom, components/ or lib/api.js (which reads
// import.meta.env at module scope) fails in CI and nowhere else. propFirms.js and
// platformCatalog.js are safe: both are pure data and node:test already reads them.
//
// THE PASSWORD IS NEVER IN THE DRAFT. The draft is mirrored to sessionStorage,
// which is readable by any script on the origin; the credentials step holds the
// password in component state and hands it straight to the provision call.
import {
  findFirm, isCustomProduct, SHORT_PRODUCT_LABEL, sizeLabel,
} from '../prop/propFirms.js';
import { findPlatformCard } from './platformCatalog.js';

/** Bump when the draft's shape changes incompatibly. It is IN the storage key, so
 *  a bump orphans the old blob rather than reading it — the version check in
 *  reviveDraft is the second line of defence, not the first. */
export const FLOW_VERSION = 1;
export const DRAFT_KEY = `propvexis.newAccount.v${FLOW_VERSION}`;

/** The eleven routes of spec §8.1, in route order. */
export const STEP_IDS = [
  'welcome', 'capital', 'firm', 'product', 'phase',
  'name', 'platform', 'import', 'connect', 'upload', 'done',
];

/** The three values challenges.phase accepts (migration 0016). Mirrors PHASES in
 *  src/domain/accounts/provision.js — the validator is what enforces it; this is
 *  what stops the UI offering a fourth. */
export const PHASES = ['p1', 'p2', 'funded'];

const AUTO_SYNC_METHODS = ['auto_sync', 'ea'];

// Every field the draft has ever had, with its empty value. Written out rather
// than built, so `emptyDraft` is readable as the answer to "what does the wizard
// know", and so reviveDraft can fill a short stored blob to full shape.
export function emptyDraft({ provisionKey = null, firstRun = false } = {}) {
  return {
    v: FLOW_VERSION,
    // Server state, not draft state: it comes from user.onboarded_at on every
    // revive and is never trusted from storage.
    firstRun: firstRun === true,
    // Minted ONCE per draft by the provider (crypto.randomUUID) and injected, so
    // this module stays dependency-free AND a retry after a dropped response
    // replays the same key instead of creating a second account.
    provision_key: provisionKey,
    welcomed: false,

    capital_kind: null,          // 'prop' | 'live'
    firm_id: null,
    firm_name: null,             // for firm_id 'other' this is what the user TYPED
    product_id: null,
    phase: null,                 // one of PHASES

    label: '',
    currency: 'USD',
    start_balance: null,         // the account SIZE on the prop path
    account_type: 'eval',        // 'eval' | 'funded', derived from the phase
    daily_dd_pct: null,
    max_dd_pct: null,
    profit_target_pct: null,
    payout_split_pct: null,
    dd_type: 'static',
    min_trading_days: null,

    platform: null,
    broker: null,                // free text, live path only (spec §7.2)
    import_method: null,         // 'auto_sync' | 'ea' | 'file' | 'manual'

    // Set by the commit. From here navigation is forward-only (spec §6.2).
    account: null,               // { id, mt5_login }
    uploadDone: false,
  };
}

/**
 * Rebuild a draft from what sessionStorage held.
 *
 * Anything unparseable, from another schema version, or not a plain object
 * becomes a FRESH draft. Resuming a half-understood draft is worse than starting
 * over: the user can retype four answers, but a payload assembled from fields
 * that mean something else creates the wrong account.
 */
export function reviveDraft(raw, opts = {}) {
  const blank = emptyDraft(opts);
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return blank;
    if (parsed.v !== FLOW_VERSION) return blank;
    return {
      ...blank,
      ...parsed,
      v: FLOW_VERSION,
      // firstRun is server state (users.onboarded_at). A stale `true` would put
      // the welcome step in front of an onboarded user; a stale `false` would deny
      // it to a genuinely new one.
      firstRun: blank.firstRun,
    };
  } catch {
    return blank;
  }
}

/** Which import methods this platform offers. Unknown platform → none, so an
 *  unrecognised id can never keep a method alive. */
const methodsFor = (platformId) => findPlatformCard(platformId)?.importMethods || [];

/**
 * The steps THIS draft's branch has, in order.
 *
 * Computed from the current draft, so the count grows honestly as the branch
 * resolves rather than overstating the work up front (decision B2). Spec §3's
 * numbers hold: Live + Manual is 5, Prop + Auto Sync is 9.
 *
 * `name` sits after `phase` on the prop path (decision B1) so the suggested label
 * can name the product — a 1-Step and a 2-Step account of the same size are two
 * accounts a trader has to tell apart, and firm + size alone cannot.
 */
export function stepsFor(draft) {
  const d = draft || {};
  const steps = [];
  if (d.firstRun === true) steps.push('welcome');
  steps.push('capital');
  if (d.capital_kind === 'prop') steps.push('firm', 'product', 'phase');
  steps.push('name', 'platform', 'import');
  if (AUTO_SYNC_METHODS.includes(d.import_method)) steps.push('connect');
  else if (d.import_method === 'file') steps.push('upload');
  steps.push('done');
  return steps;
}

/**
 * Which step writes the account (spec §6.2): the last one that collects data.
 * Auto Sync and the EA both collect on `connect`; Manual and File upload have
 * nothing left to ask after `import`.
 */
export function commitStep(draft) {
  const method = draft?.import_method;
  if (!method) return null;
  return AUTO_SYNC_METHODS.includes(method) ? 'connect' : 'import';
}

export const isCommitted = (draft) => draft?.account != null;

// A number is present if it is a real number — 0 included. `min_trading_days: 0`
// means "no requirement" and a 0% drawdown is a legitimate answer, so a falsy
// check here would be the same bug numOrNull avoids on the server.
const has = (v) => v != null && v !== '' && Number.isFinite(Number(v));

// Completeness per step, keyed by step id. A step is complete when the data it
// exists to collect is present — nothing about whether it was visited, except
// where there is no data (welcome, upload) and a flag is the only signal.
const COMPLETE = {
  welcome: (d) => d.welcomed === true,
  capital: (d) => d.capital_kind === 'prop' || d.capital_kind === 'live',
  firm: (d) => Boolean(d.firm_id),
  // The balance and BOTH drawdowns, because of the custom-rules path: a missing
  // percentage is numOrNull'd by validateProvision and then COALESCEd by
  // mt5_accounts to 5/10/8, so an unlisted firm's account would silently be
  // judged against GoatFundedTrader's rules.
  product: (d) => Boolean(d.product_id) && has(d.start_balance) && has(d.daily_dd_pct) && has(d.max_dd_pct),
  // Plus the one number the phase decides: a target for an evaluation, a split
  // for a funded account.
  phase: (d) => PHASES.includes(d.phase)
    && (d.account_type === 'funded' ? has(d.payout_split_pct) : has(d.profit_target_pct)),
  name: (d) => String(d.label ?? '').trim() !== '',
  // Not merely "a platform was chosen": three of the five cards are badged `soon`
  // and the backend refuses exactly those (platforms.js `enabled: false`), so a
  // chosen-but-unavailable platform would pass this step and then 400 at the
  // commit two steps later. patchDraft already withdraws an import method the
  // platform cannot serve, for precisely this class of mismatch — leaving the
  // platform itself unchecked was the asymmetry. `status: 'live'` <=> `enabled:
  // true` is pinned by test/platform-catalog.test.js.
  platform: (d) => findPlatformCard(d.platform)?.status === 'live',
  // On the Manual and File branches `import` IS the commit step, so choosing a
  // card is not enough — a failed provision must leave the user on the step that
  // failed rather than one past it.
  import: (d) => Boolean(d.import_method) && (commitStep(d) !== 'import' || isCommitted(d)),
  connect: (d) => isCommitted(d),
  upload: (d) => d.uploadDone === true,
  // Terminal: never complete, so firstIncomplete always has somewhere to come to
  // rest and never falls off the end of the list.
  done: () => false,
};

export function isStepComplete(draft, stepId) {
  const check = COMPLETE[stepId];
  return check ? check(draft || {}) === true : false;
}

/**
 * The step a cold arrival belongs on: the first one in this branch whose data is
 * missing. Each page compares its own id to this on mount and <Navigate replace>s
 * if it is ahead, so deep-linking /accounts/new/phase lands on capital.
 */
export function firstIncomplete(draft) {
  const steps = stepsFor(draft);
  for (const step of steps) if (!isStepComplete(draft, step)) return step;
  return steps[steps.length - 1];
}

/**
 * May the wizard render this step for this draft?
 *
 * The shell asks this once per navigation and redirects to firstIncomplete() when
 * the answer is no. Spec §8.1 puts the check in each page; one implementation in
 * the shell cannot drift from itself and eleven can, and the rule is the same
 * either way — so it lives here, where a test can reach it.
 *
 * Answered steps stay reachable so Back works, EXCEPT once the account exists:
 * from there the draft can only be where it is, because re-entering an earlier
 * step and pressing Continue would write a second account (spec §6.2).
 */
export function canVisit(draft, stepId) {
  const steps = stepsFor(draft);
  const i = steps.indexOf(stepId);
  if (i === -1) return false;                       // not a step of THIS branch
  const target = steps.indexOf(firstIncomplete(draft));
  return isCommitted(draft) ? i === target : i <= target;
}

export function nextStep(draft, stepId) {
  const steps = stepsFor(draft);
  const i = steps.indexOf(stepId);
  return i === -1 || i === steps.length - 1 ? null : steps[i + 1];
}

/**
 * The step behind this one, or null when there is none.
 *
 * NULL FOR EVERY STEP ONCE COMMITTED (spec §6.2). The alternative is a Back
 * button that walks the user to a step whose Continue writes a SECOND account.
 */
export function prevStep(draft, stepId) {
  if (isCommitted(draft)) return null;
  const steps = stepsFor(draft);
  const i = steps.indexOf(stepId);
  return i <= 0 ? null : steps[i - 1];
}

/** One-based position in this branch, and the branch's real length. `index: 0`
 *  for a step the branch does not have — the guard is about to redirect, and
 *  claiming a position would render a wrong number for a frame. */
export function progress(draft, stepId) {
  const steps = stepsFor(draft);
  const i = steps.indexOf(stepId);
  return { index: i === -1 ? 0 : i + 1, total: steps.length };
}

// What each identity choice invalidates. Kept as data so the cascade reads as one
// rule set rather than as branching, and so a new dependent field is added in one
// place.
const RULES_CLEARED = {
  start_balance: null,
  account_type: 'eval',
  daily_dd_pct: null,
  max_dd_pct: null,
  profit_target_pct: null,
  payout_split_pct: null,
  dd_type: 'static',
  min_trading_days: null,
};
const FIRM_CLEARED = { firm_id: null, firm_name: null, product_id: null, phase: null };

/**
 * Apply a patch, invalidating whatever it contradicts.
 *
 * ONE PLACE FOR THE CASCADE (spec §6.1). Scattering it across eleven page
 * components is how a wizard submits an FTMO product against a GFT account.
 *
 * INVALIDATION RUNS BEFORE THE MERGE, and that order is load-bearing: the product
 * step applies templateToFields in a single patch that sets product_id AND the
 * five rule fields together. Clearing the rules after merging would wipe the
 * numbers the step just resolved, and the step could never complete.
 *
 * AFTER COMMIT only `uploadDone` is writable. Everything else fed the INSERT, the
 * user has no route back to re-submit, and a changed draft would disagree with a
 * row nothing can reconcile it with.
 */
export function patchDraft(draft, patch = {}) {
  const d = draft || emptyDraft();
  if (isCommitted(d)) {
    return 'uploadDone' in patch ? { ...d, uploadDone: patch.uploadDone === true } : { ...d };
  }

  const changed = (key) => key in patch && patch[key] !== d[key];

  let next = { ...d };
  if (changed('capital_kind')) next = { ...next, ...FIRM_CLEARED, ...RULES_CLEARED, broker: null };
  if (changed('firm_id')) next = { ...next, product_id: null, phase: null, ...RULES_CLEARED };
  if (changed('product_id')) next = { ...next, phase: null, ...RULES_CLEARED };

  next = { ...next, ...patch };

  // account_type is DERIVED from the phase, never trusted from a page. It is one
  // fact under two names, and eleven page components each remembering to set both
  // is how a funded challenge gets filed as an evaluation — not a cosmetic error:
  // challenges.phase would say funded while account_type says eval, and the prop
  // engine would score it against a profit target it does not have. Deriving it
  // here also removes the dead end on the custom path, where templateToFields
  // returns null and the page would otherwise have to set the pair by hand.
  //
  // Sound because accountType === 'funded' <=> phase.id === 'funded' holds for
  // every phase of every product in the catalog; a product that broke it would
  // also break propFirms.test.js's shape assertions, so it cannot land silently.
  if ('phase' in patch) next.account_type = patch.phase === 'funded' ? 'funded' : 'eval';

  // A platform can withdraw an import method: `other` and MT4 offer only file and
  // manual, and the EA is a .mq5 file so it is MT5-only. Read AFTER the merge,
  // because it depends on the final pair. Submitting a withdrawn method is a 400
  // from platformSupports() at the end of a nine-step flow.
  if (next.platform !== d.platform && next.import_method
      && !methodsFor(next.platform).includes(next.import_method)) {
    next.import_method = null;
  }

  return next;
}

/**
 * The account name to offer on the `name` step, or '' when there is nothing to
 * suggest.
 *
 * Includes the product, which is the gap Phase A left: GFT 1-Step 25K and 2-Step
 * 25K both suggested "GoatFundedTrader 25K", giving one name to two accounts a
 * trader has to tell apart. Uses the TYPED firm name where there is one, so an
 * unlisted firm never gets "Other / not listed" as an account label.
 */
export function suggestedLabel(draft) {
  const d = draft || {};
  if (d.capital_kind !== 'prop' || !d.firm_id) return '';
  const firm = findFirm(d.firm_id);
  if (!firm) return '';
  const name = String(d.firm_name || '').trim() || firm.name;
  const parts = [name];
  if (!isCustomProduct(d.firm_id, d.product_id)) {
    const short = SHORT_PRODUCT_LABEL[d.product_id];
    if (short) parts.push(short);
  }
  if (has(d.start_balance)) parts.push(sizeLabel(d.start_balance));
  return parts.join(' ');
}

/**
 * The POST /api/accounts/provision body.
 *
 * Built field by field rather than by spreading the draft, and that is the point:
 * a spread would carry `welcomed`, `uploadDone`, `account`, `v` — and anything a
 * future step wrongly parked on the draft, a password included. The credential is
 * NOT here at all; the connect step adds it at call time (spec §6.1).
 *
 * The prop fields are nulled on the live path deliberately. validateProvision
 * REJECTS a live payload that names a firm, product or phase, because silently
 * dropping them would create an account the user believes is tracking firm rules —
 * exactly the bug capital_kind exists to end.
 */
export function toProvisionPayload(draft) {
  const d = draft || {};
  const prop = d.capital_kind === 'prop';
  return {
    capital_kind: d.capital_kind,
    label: String(d.label ?? '').trim(),
    currency: d.currency || 'USD',
    broker: prop ? null : (d.broker || null),
    platform: d.platform,
    import_method: d.import_method,
    firm_id: prop ? d.firm_id : null,
    firm_name: prop ? d.firm_name : null,
    product_id: prop ? d.product_id : null,
    phase: prop ? d.phase : null,
    start_balance: d.start_balance,
    account_type: d.account_type,
    daily_dd_pct: prop ? d.daily_dd_pct : null,
    max_dd_pct: prop ? d.max_dd_pct : null,
    profit_target_pct: prop ? d.profit_target_pct : null,
    payout_split_pct: prop ? d.payout_split_pct : null,
    dd_type: d.dd_type || 'static',
    min_trading_days: prop ? d.min_trading_days : null,
    provision_key: d.provision_key,
  };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `node --test test/new-account-flow.test.js`
Expected: PASS, 50 tests.

**If any test fails, do not adjust the test.** These are the spec's own claims. Fix the module, or STOP and ask the user.

- [ ] **Step 5: Full suite**

Run: `npm test`
Expected: all green. No frontend build needed — nothing imported this module yet, and `newAccountFlow.js` is not reachable from `main.jsx` until Task 6. Run the build anyway if you want the reassurance; it will pass either way.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/accounts/newAccountFlow.js test/new-account-flow.test.js
git commit -m "$(cat <<'MSG'
Put the whole Add Account flow in one testable module

Eleven routes and no way to render one: this repo has no jsdom and no React
Testing Library, by decision. So the flow is pure functions and the pages will
be thin — render, patch, navigate. That buys real coverage of the things that
actually break: step counts per branch (Live+Manual 5, Prop+AutoSync 9), the
guard that sends a cold deep link back to the first unanswered question, the
invalidation cascade, the commit point, and a payload asserted against Phase A's
own validateProvision rather than a restatement of it.

Two orderings are load-bearing and tested as such. Invalidation runs BEFORE the
merge, because the product step sets product_id and its five resolved rule
fields in one patch and a later clear would wipe them. And the platform ->
import-method check runs AFTER, because it depends on the final pair.

The product step is not complete without both drawdowns: a missing percentage is
numOrNull'd by the validator and then COALESCEd by mt5_accounts to 5/10/8, so an
unlisted firm's account would have been judged against GoatFundedTrader's rules.

emptyDraft is asserted to hold no password-shaped field at all — the draft is
mirrored to sessionStorage, which any script on the origin can read.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---
## Task 4: The API client for provision and the login pre-check

Two calls the wizard needs and `api.js` does not have. Both must surface the **server's own message**, the way `syncCall` already does for the sync endpoints — every failure here is something the user must act on (a taken login, a plan cap, an unconfigured server), and a status code tells them none of it.

The 409 needs more than a message: spec §6.3 says the connect step *"keeps the typed values, names the collision, and links to the account if it is theirly"*. So the thrown error carries `status` and `conflict` as properties.

`api.js` reads `import.meta.env.VITE_BACKEND_URL` at module scope, so `node:test` **cannot import it** — it would throw `TypeError: Cannot read properties of undefined`. The test is therefore a source-text assertion, anchored on each function's own body.

**Files:**
- Modify: `frontend/src/lib/api.js` (add after `deleteAccount`, before the `---- Server-side MT5 sync ----` comment)
- Create: `test/provision-client.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `provisionAccount(payload) → Promise<account>` — throws `Error` with `.status` and `.conflict` (`'login_taken'` | `'key_replayed'` | `undefined`)
  - `checkLoginAvailable(login, platform) → Promise<{ available, mine, account_id? }>`

- [ ] **Step 1: Write the failing test**

```js
// test/provision-client.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSrc } from './helpers/src-files.js';

// frontend/src/lib/api.js reads import.meta.env.VITE_BACKEND_URL at MODULE SCOPE.
// In node that is `undefined.VITE_BACKEND_URL` — a TypeError on import — so this
// file asserts over the source as text, as every other frontend test in this repo
// does for the same reason.
//
// Each assertion is scoped to the function's OWN body: from its declaration to
// the first line at column 0 that follows it. A fixed byte window would spill
// into whichever neighbour happens to sit next in the file, which for a NEGATIVE
// assertion means testing that neighbour rather than this function.
const api = readSrc('lib/api.js');

/** One exported function's body, bounded by the next top-level declaration. */
function body(name) {
  const decl = new RegExp(`^export (?:async function|const) ${name}\\b`, 'm').exec(api);
  assert.ok(decl, `api.js has no exported ${name}`);
  const from = decl.index;
  const rest = api.slice(from + decl[0].length);
  // The next top-level construct: an export, a bare declaration, or a
  // column-0 comment banner. Whichever comes first ends this body.
  const end = /^(?:export |async function |function |const |\/\/ ----)/m.exec(rest);
  return rest.slice(0, end ? end.index : rest.length);
}

test('provisionAccount posts the payload to the provision endpoint', () => {
  const fn = body('provisionAccount');
  assert.match(fn, /'\/api\/accounts\/provision'/);
  assert.match(fn, /method:\s*'POST'/);
  assert.match(fn, /JSON\.stringify\(payload\)/);
});

test('provisionAccount goes through apiFetch, so a 401 still logs the user out', () => {
  // A bare fetch() here would leave an expired session stuck on a wizard step
  // that fails forever with no explanation.
  assert.match(body('provisionAccount'), /apiFetch\(/);
  assert.equal(/\bawait fetch\(/.test(body('provisionAccount')), false,
    'must not bypass apiFetch — a 401 would not reach the unauthorized handler');
});

test('provisionAccount surfaces the server message, not a status code', () => {
  // Every failure here is actionable: "That MT5 login is already registered",
  // "Your plan allows up to 3 synced accounts", "Auto Sync is not configured on
  // this server yet". A generic "provision 409" tells the user nothing.
  const fn = body('provisionAccount');
  assert.match(fn, /\berror\b/, 'the server error field must be read');
  assert.match(fn, /res\.ok/);
});

test('provisionAccount carries the status and the conflict onto the error', () => {
  // Spec §6.3: the connect step must keep the typed values, name the collision
  // and link to the account when it is the caller's own. It cannot do any of that
  // from a message string.
  const fn = body('provisionAccount');
  assert.match(fn, /\.status\s*=/, 'the HTTP status must be attached to the thrown error');
  assert.match(fn, /\.conflict\s*=/, 'the typed conflict must be attached to the thrown error');
});

test('provisionAccount returns the account, not the envelope', () => {
  // The route replies { account }. A caller handed the envelope would read
  // `account.id` as undefined and provision a challenge against nothing.
  assert.match(body('provisionAccount'), /\.account\b/);
});

test('checkLoginAvailable asks the pre-check endpoint with both query fields', () => {
  const fn = body('checkLoginAvailable');
  assert.match(fn, /\/api\/accounts\/login-available/);
  assert.match(fn, /login=/);
  assert.match(fn, /platform=/);
});

test('checkLoginAvailable never throws — it is a typing-time hint', () => {
  // It fires while the user types. A rejected promise on every keystroke while
  // offline would either spam an error banner or need a try/catch at each call
  // site; the unique index at commit is the real guard, so an unknown answer is
  // reported as "we do not know" instead.
  const fn = body('checkLoginAvailable');
  assert.match(fn, /catch/, 'a failed pre-check must resolve, not reject');
});

test('the two new calls are the only account endpoints Phase B adds', () => {
  // Guard against a subagent inventing /api/accounts/validate or similar: the
  // backend is Phase A and closed. Any new path here means the plan was exceeded.
  const paths = [...api.matchAll(/'(\/api\/accounts[^']*)'/g)].map((m) => m[1]);
  const unique = [...new Set(paths)].sort();
  assert.deepEqual(unique, [
    '/api/accounts',
    '/api/accounts/login-available',
    '/api/accounts/provision',
  ], 'an unexpected /api/accounts path appeared — the Phase A backend is closed');
});
```

**Note:** the last test's list must also tolerate the template-literal paths (`/api/accounts/${id}`) which the regex does not match because they use backticks. Verify by running it; if a `'/api/accounts/...'` single-quoted path exists that the list omits, add it — do **not** loosen the assertion into a subset check.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `node --test test/provision-client.test.js`
Expected: FAIL — `api.js has no exported provisionAccount`.

- [ ] **Step 3: Add the two calls to `api.js`**

Insert immediately after `deleteAccount` and before the `// ---- Server-side MT5 sync ----` banner:

```js
/**
 * Create an account and everything that must exist with it, atomically
 * (POST /api/accounts/provision). This is what the Add Account wizard calls.
 *
 * Surfaces the SERVER's message rather than a status code, like syncCall below and
 * for the same reason: every failure here is something the user has to act on —
 * a login already registered, a plan cap, Auto Sync not configured on this server.
 *
 * The status and the typed conflict ride on the error because the connect step
 * needs them: a 409 must keep the values the user typed, name the collision and
 * link to the account when it is their own, and none of that can be recovered
 * from a message string.
 */
export async function provisionAccount(payload) {
  const res = await apiFetch('/api/accounts/provision', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `could not create the account (${res.status})`);
    err.status = res.status;
    err.conflict = data.conflict;
    throw err;
  }
  // The route replies { account } — and on a provision_key replay it is the
  // EXISTING account with a 200 rather than a 201, which is a success either way.
  return data.account;
}

/**
 * Is this platform login free? (GET /api/accounts/login-available.)
 *
 * Called while the user types, so it NEVER rejects: a failed pre-check resolves
 * to "we do not know" and the step stays usable. The unique index at commit is
 * the real guard — this only spares the user a 409 at the end of a nine-step flow.
 */
export async function checkLoginAvailable(login, platform) {
  try {
    const q = new URLSearchParams({ login: String(login), platform: String(platform ?? '') });
    const res = await apiFetch(`/api/accounts/login-available?${q}`);
    if (!res.ok) return { available: null, mine: false };
    return await res.json();
  } catch {
    return { available: null, mine: false };
  }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `node --test test/provision-client.test.js`
Expected: PASS, 8 tests.

- [ ] **Step 5: Full suite + frontend build**

Run: `npm test` — all green.
Run: `cd frontend && npm run build` — `✓ built`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/api.js test/provision-client.test.js
git commit -m "$(cat <<'MSG'
Add the provision and login-availability calls the wizard needs

Both surface the server's own message rather than a status code, like the sync
calls already do: every failure is actionable — a login already registered, a
plan cap, Auto Sync unconfigured — and "provision 409" tells the user none of it.

The status and the typed conflict ride on the thrown error, because the connect
step has to keep what the user typed, name the collision and link to the account
when it is their own, and it cannot recover any of that from a string.

checkLoginAvailable never rejects. It fires while the user types, the unique index
at commit is the real guard, and an unknown answer is more useful than a rejected
promise on every keystroke.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Task 5: Extract the CSV dry-run/confirm logic (decision B7 · spec §8.3)

The wizard's `upload` step runs the same sequence `ImportTradesModal` does: pick a file → read it → dry-run → show the preview → confirm → done. Spec §8.3 requires that logic **extracted and shared, not copied**. What is shared is the *state machine and the guards*; the markup stays each surface's own, because a modal in a page and a full-bleed wizard step are not the same layout.

It also adds the guard §8.3 asks for: `POST /api/trades/import` carries the CSV **inside JSON** at a 12 MB `bodyLimit` (`src/routes/trades.js:324`), and JSON escaping inflates a statement past its file size — so the size is checked client-side rather than surfacing a 413 after a long upload.

**Files:**
- Create: `frontend/src/features/trades/csvImportFlow.js`
- Create: `test/csv-import-flow.test.js`
- Modify: `frontend/src/features/trades/ImportTradesModal.jsx`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `IMPORT_BODY_LIMIT: number` (12 MB, mirrors `src/routes/trades.js`)
  - `csvSizeVerdict(bytes) → { ok: boolean, error: string|null }`
  - `initialImportState() → state`
  - `importReducer(state, action) → state` — actions `{type:'file'|'preview'|'error'|'busy'|'imported'|'reset'}`
  - `previewSummary(preview) → { willImport, duplicates, skipped, canImport }`

- [ ] **Step 1: Write the failing test**

```js
// test/csv-import-flow.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  IMPORT_BODY_LIMIT, csvSizeVerdict, initialImportState, importReducer, previewSummary,
} from '../frontend/src/features/trades/csvImportFlow.js';

// The CSV import sequence is now driven by two surfaces — the modal reached from
// the trade log, and the Add Account wizard's upload step — so the sequence lives
// here once (spec §8.3: extracted, not copied). The markup stays each surface's
// own; what is shared is the state machine and the guards.

test('the client size limit is the server bodyLimit, read from the route', () => {
  // Two numbers naming one fact drift. This reads the server's own literal, so
  // raising the bodyLimit without raising the client guard fails here.
  const route = readFileSync(new URL('../src/routes/trades.js', import.meta.url), 'utf8');
  const m = /bodyLimit:\s*(\d+)\s*\*\s*1024\s*\*\s*1024/.exec(route);
  assert.ok(m, 'could not find the import route bodyLimit — has it moved?');
  assert.equal(IMPORT_BODY_LIMIT, Number(m[1]) * 1024 * 1024);
});

test('a comfortable file passes', () => {
  assert.deepEqual(csvSizeVerdict(2 * 1024 * 1024), { ok: true, error: null });
  assert.deepEqual(csvSizeVerdict(0), { ok: true, error: null });
});

test('a file that JSON escaping would push over the limit is refused BEFORE upload', () => {
  // The CSV rides inside a JSON body, so escaping inflates it. Refusing at the
  // limit itself would still 413 after a long upload; the margin is what makes
  // the message honest.
  const verdict = csvSizeVerdict(IMPORT_BODY_LIMIT);
  assert.equal(verdict.ok, false);
  assert.match(verdict.error, /MB/, 'the message must name a size the user can compare against');
});

test('the size message never asks the user to guess', () => {
  const verdict = csvSizeVerdict(IMPORT_BODY_LIMIT * 4);
  assert.equal(verdict.ok, false);
  assert.match(verdict.error, /split|smaller|shorter|date/i,
    'refusing a statement without saying what to do is a dead end');
});

test('csvSizeVerdict is total', () => {
  for (const bad of [undefined, null, NaN, -1, 'x']) {
    assert.equal(typeof csvSizeVerdict(bad).ok, 'boolean', String(bad));
  }
});

test('the initial state has nothing loaded and nothing in flight', () => {
  const s = initialImportState();
  assert.equal(s.csv, '');
  assert.equal(s.fileName, '');
  assert.equal(s.preview, null);
  assert.equal(s.done, null);
  assert.equal(s.error, null);
  assert.equal(s.busy, false);
});

test('loading a file clears a previous preview, result and error', () => {
  // Otherwise the counts from the PREVIOUS file stay on screen beside the new
  // file's name, and the user confirms an import of numbers that no longer apply.
  const loaded = importReducer(
    { ...initialImportState(), preview: { willImport: 5 }, done: { imported: 5 }, error: 'old' },
    { type: 'file', fileName: 'statement.csv', csv: 'a,b\n1,2' },
  );
  assert.equal(loaded.fileName, 'statement.csv');
  assert.equal(loaded.csv, 'a,b\n1,2');
  assert.equal(loaded.preview, null);
  assert.equal(loaded.done, null);
  assert.equal(loaded.error, null);
});

test('a preview arriving clears busy and any error', () => {
  const s = importReducer(
    { ...initialImportState(), busy: true, error: 'earlier' },
    { type: 'preview', preview: { willImport: 12, duplicates: 1, skipped: 0 } },
  );
  assert.equal(s.busy, false);
  assert.equal(s.error, null);
  assert.equal(s.preview.willImport, 12);
});

test('an error clears busy but KEEPS the loaded file', () => {
  // The user should be able to retry without picking the file again.
  const s = importReducer(
    { ...initialImportState(), busy: true, csv: 'a,b', fileName: 'x.csv' },
    { type: 'error', error: 'server said no' },
  );
  assert.equal(s.busy, false);
  assert.equal(s.error, 'server said no');
  assert.equal(s.csv, 'a,b');
  assert.equal(s.fileName, 'x.csv');
});

test('a finished import clears the preview, so no confirm button survives it', () => {
  const s = importReducer(
    { ...initialImportState(), preview: { willImport: 12 }, busy: true },
    { type: 'imported', result: { imported: 12, duplicates: 0, skipped: 0 } },
  );
  assert.equal(s.done.imported, 12);
  assert.equal(s.preview, null, 'a surviving preview means a second Import button');
  assert.equal(s.busy, false);
});

test('reset returns exactly the initial state', () => {
  const dirty = importReducer(initialImportState(), { type: 'file', fileName: 'a', csv: 'b' });
  assert.deepEqual(importReducer(dirty, { type: 'reset' }), initialImportState());
});

test('an unknown action returns the SAME state object, not a copy', () => {
  // Identity, so a stray dispatch cannot trigger a re-render loop in a component
  // whose effect depends on the state object.
  const s = initialImportState();
  assert.equal(importReducer(s, { type: 'nope' }), s);
  assert.equal(importReducer(s, {}), s);
});

test('importReducer never mutates the state it was given', () => {
  const before = initialImportState();
  const snapshot = JSON.parse(JSON.stringify(before));
  importReducer(before, { type: 'file', fileName: 'a.csv', csv: 'x' });
  assert.deepEqual(before, snapshot);
});

test('previewSummary defaults every count and refuses an empty import', () => {
  assert.deepEqual(previewSummary({ willImport: 7, duplicates: 2, skipped: 1 }),
    { willImport: 7, duplicates: 2, skipped: 1, canImport: true });
  assert.deepEqual(previewSummary({ willImport: 0, duplicates: 9, skipped: 0 }),
    { willImport: 0, duplicates: 9, skipped: 0, canImport: false });
  assert.deepEqual(previewSummary({}), { willImport: 0, duplicates: 0, skipped: 0, canImport: false });
  assert.deepEqual(previewSummary(null), { willImport: 0, duplicates: 0, skipped: 0, canImport: false });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `node --test test/csv-import-flow.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `csvImportFlow.js`**

```js
// The CSV import SEQUENCE, shared by the two surfaces that run it: the modal
// reached from the trade log, and the Add Account wizard's upload step (spec §8.3,
// "extracted out of ImportTradesModal and shared, not copied").
//
// What is shared is the state machine and the guards. The MARKUP is not: a dialog
// over the trade log and a full-bleed wizard step are different layouts, and
// forcing one component to be both is how a modal ends up rendered inside a page.
//
// JSX-free and React-free so node:test can import it — CI installs backend
// dependencies only.

/**
 * The server's own limit, mirrored (src/routes/trades.js: the import route sets
 * `bodyLimit: 12 * 1024 * 1024` because the CSV text rides inside the JSON body).
 * test/csv-import-flow.test.js reads that literal out of the route, so raising one
 * without the other fails.
 */
export const IMPORT_BODY_LIMIT = 12 * 1024 * 1024;

// JSON escaping inflates the text: every quote, backslash, newline and non-ASCII
// character grows. 20% is comfortably above what a broker statement's punctuation
// costs and well below a factor that would refuse a legitimate file. Checking at
// the limit itself would still 413 after a long upload, which is the failure this
// margin exists to prevent.
const ESCAPE_HEADROOM = 0.8;
const MB = 1024 * 1024;

/**
 * May a file of this many bytes be sent? A refusal names a size the user can
 * compare against and says what to do about it — refusing a statement without
 * that is a dead end, and this is the last step of a nine-step flow.
 */
export function csvSizeVerdict(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return { ok: true, error: null };
  const max = IMPORT_BODY_LIMIT * ESCAPE_HEADROOM;
  if (n <= max) return { ok: true, error: null };
  const limitMb = Math.floor(max / MB);
  const gotMb = (n / MB).toFixed(1);
  return {
    ok: false,
    error: `That file is ${gotMb} MB and the limit is about ${limitMb} MB. Export a shorter date range, or split the statement and import it in parts.`,
  };
}

export const initialImportState = () => ({
  fileName: '',
  csv: '',
  preview: null,   // the dry-run result
  done: null,      // the confirmed-import result
  error: null,
  busy: false,
});

/**
 * The sequence, as a reducer.
 *
 * `file` clears the previous preview, result and error deliberately: leaving last
 * file's counts beside this file's name is how a user confirms an import of
 * numbers that no longer apply. `error` does NOT clear the loaded CSV, so a retry
 * does not mean choosing the file again. `imported` clears the preview, or a
 * second Import button survives the import it performed.
 *
 * An unrecognised action returns the SAME object rather than a copy, so a stray
 * dispatch cannot drive a re-render loop in a component with an effect keyed on
 * this state.
 */
export function importReducer(state, action) {
  switch (action?.type) {
    case 'file':
      return { ...state, fileName: action.fileName ?? '', csv: action.csv ?? '', preview: null, done: null, error: null };
    case 'busy':
      return { ...state, busy: true, error: null };
    case 'preview':
      return { ...state, preview: action.preview ?? null, busy: false, error: null };
    case 'error':
      return { ...state, error: action.error ?? 'Something went wrong.', busy: false };
    case 'imported':
      return { ...state, done: action.result ?? null, preview: null, busy: false, error: null };
    case 'reset':
      return initialImportState();
    default:
      return state;
  }
}

/** The dry-run counts, every one defaulted, plus whether confirming does anything.
 *  A 0-row import is refused here rather than sent and reported as "imported 0". */
export function previewSummary(preview) {
  const p = preview || {};
  const willImport = Number(p.willImport) || 0;
  return {
    willImport,
    duplicates: Number(p.duplicates) || 0,
    skipped: Number(p.skipped) || 0,
    canImport: willImport > 0,
  };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `node --test test/csv-import-flow.test.js`
Expected: PASS, 14 tests.

- [ ] **Step 5: Drive `ImportTradesModal` from the extracted module**

Replace the six `useState` calls with one `useReducer`, add the size check, and read the counts through `previewSummary`. **The markup and the copy do not change** — this is a refactor, and any visible difference is a regression.

```jsx
import React, { useReducer, useState } from 'react';
import { Modal } from '@/components/primitives';
import { importTrades } from '../../lib/api.js';
import {
  csvSizeVerdict, initialImportState, importReducer, previewSummary,
} from './csvImportFlow.js';
```

```jsx
export default function ImportTradesModal({ onClose, onImported, manualAccounts = [], defaultAccountId = '' }) {
  const [state, dispatch] = useReducer(importReducer, undefined, initialImportState);
  const [accountId, setAccountId] = useState(defaultAccountId || '');
  const { fileName, csv, preview, done, error, busy } = state;
  const counts = previewSummary(preview);

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Checked before the read, not after: the CSV rides inside a JSON body at a
    // 12 MB limit and escaping inflates it, so a large statement 413s at the end
    // of a long upload instead of failing here in one line.
    const verdict = csvSizeVerdict(file.size);
    if (!verdict.ok) {
      dispatch({ type: 'file', fileName: file.name, csv: '' });
      dispatch({ type: 'error', error: verdict.error });
      return;
    }
    const text = await file.text();
    dispatch({ type: 'file', fileName: file.name, csv: text });
    dispatch({ type: 'busy' });
    try {
      dispatch({ type: 'preview', preview: await importTrades(text, true, accountId) });
    } catch (err) {
      dispatch({ type: 'error', error: err.message });
    }
  }

  // Changing the target account changes the dedupe scope — re-preview if a file
  // is already loaded so the duplicate/import counts stay accurate.
  async function onAccountChange(e) {
    const next = e.target.value;
    setAccountId(next);
    if (!csv || done) return;
    dispatch({ type: 'busy' });
    try {
      dispatch({ type: 'preview', preview: await importTrades(csv, true, next) });
    } catch (err) {
      dispatch({ type: 'error', error: err.message });
    }
  }

  async function doImport() {
    dispatch({ type: 'busy' });
    try {
      const res = await importTrades(csv, false, accountId);
      dispatch({ type: 'imported', result: res });
      onImported?.();
    } catch (err) {
      dispatch({ type: 'error', error: err.message });
    }
  }
```

In the preview block, read the counts from `counts` rather than `preview` directly, keeping the identical rendering:

```jsx
              <div className="import-counts">
                <span className="import-stat ok">{counts.willImport} to import</span>
                {counts.duplicates > 0 && <span className="import-stat dup">{counts.duplicates} duplicate</span>}
                {counts.skipped > 0 && <span className="import-stat skip">{counts.skipped} skipped</span>}
              </div>
```

```jsx
                <button className="primary" onClick={doImport} disabled={busy || !counts.canImport}>
                  {busy ? 'Importing…' : `Import ${counts.willImport} trade${counts.willImport === 1 ? '' : 's'}`}
                </button>
```

Leave `preview.detectedColumns` and `preview.warnings` read from `preview` — they are pass-through display data with no counting rule, and `previewSummary` deliberately does not launder them.

- [ ] **Step 6: Full suite + frontend build**

Run: `npm test` — all green.
Run: `cd frontend && npm run build` — `✓ built`.

- [ ] **Step 7: Manual check of the refactor (5 minutes, do not skip)**

The modal has no automated coverage of its rendering, so the refactor's only real verification is running it.

```bash
npm run dev &            # backend on :3000, Postgres on 5433
cd frontend && npm run dev
```

Open the trade log → Import, and confirm: choosing a CSV shows the detected columns and the three counts; switching the target account re-previews; Import reports what it imported; an over-size file is refused with the new message and no upload. Then stop both servers.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/trades/csvImportFlow.js test/csv-import-flow.test.js \
        frontend/src/features/trades/ImportTradesModal.jsx
git commit -m "$(cat <<'MSG'
Share the CSV import sequence instead of copying it into the wizard

Spec §8.3: the wizard's upload step runs the same pick-file -> dry-run ->
confirm sequence as the trade log's modal, and a second copy is how the two
diverge on what a duplicate count means. The state machine and the guards move
into csvImportFlow.js; the markup stays each surface's own, because a dialog and
a full-bleed wizard step are not the same layout.

Adds the size guard the spec asks for. The CSV rides inside a JSON body at a
12 MB bodyLimit and escaping inflates it, so a large statement used to 413 at
the end of a long upload. The client limit is drift-tested against the route's
own literal, and the refusal says what to do about it.

Reducer details that are behaviour, not style: loading a file clears the previous
preview (or the old counts sit beside the new file's name and the user confirms
numbers that no longer apply), an error keeps the loaded CSV so a retry needs no
second file pick, and an unknown action returns the same object so a stray
dispatch cannot drive a re-render loop.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---
# ⛔ Tasks 6–13 are GATED on `docs/design-system/DESIGN-LANGUAGE.md`

Do not begin Task 6 until the owner has supplied that file. Everything below assumes it is present and readable at that path.

Each gated task carries a **Visual conformance** block naming what it must trace to. The rule from CLAUDE.md applies without exception: *every UI decision must trace to a rule in the design language; "it looks better" is not a justification.* If the doc has no rule for something a page needs, **do not invent one** — write the question into the task's notes and ask the owner.

Three enforced constraints are already known and apply to every task below:
- **§7** No `box-shadow` with both an offset and a blur unless it is `var(--sh-1/2/3)`. `test/design-language.test.js` scans the whole legacy stylesheet.
- **§14** Hover may only intensify a colour family the element already wears at rest. A neutral control may not hover to a brand fill.
- **§6** Every floating overlay uses `var(--r-2xl)`. If a wizard step introduces a popover or menu, add its selector to that test's `overlays` list in the same commit.

---

## Task 6: The wizard shell, its routes, and the `capital` step

**Visual conformance:** page-level layout and full-bleed composition; the progress indicator / stepper pattern; primary vs secondary action placement; the choice-card pattern (`capital` is two large cards); focus treatment; `prefers-reduced-motion` and the motion tokens (`--ease`, `--dur`, `--dur-fast`) for §8.4's transition. Cite the sections in the CSS comment block.

**Files:**
- Create: `frontend/src/features/accounts/NewAccountFlow.jsx`
- Create: `frontend/src/features/accounts/steps/CapitalStep.jsx`
- Create: `test/new-account-pages.test.js`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/styles/legacy/app.css`

**Interfaces:**
- Consumes: everything Task 3 exports; `provisionAccount` from Task 4; `autoSyncGate` from Task 1.
- Produces — the **outlet context** every step consumes via `useOutletContext()`:
  ```js
  {
    draft,                      // the current draft
    patch(patchObject),         // patchDraft + persist, returns the new draft
    advance(),                  // navigate to nextStep(draft, step)
    back(),                     // navigate to prevStep(draft, step); null-safe
    canGoBack: boolean,         // prevStep(draft, step) !== null
    step,                       // this step's id, from the URL
    index, total,               // progress(draft, step)
    accounts,                   // the user's accounts, from App
    plan,                       // from useAuth()
    firstRun: boolean,          // user.onboarded_at is null
    onOnboarded(user),          // setUser, from App — WelcomeStep's skip needs it (Task 12)
    commit(extra, draftOverride) => Promise,  // provision; resolves to the account, throws
    committing: boolean,
    finish(),                   // select the new account and leave for the dashboard
  }
  ```
  `commit`'s second argument exists because a step sometimes has to patch the
  draft and commit in the same handler (the `connect` step's EA branch patches
  `import_method: 'ea'` then provisions). `patch()` returns the new draft but the
  shell's `draft` state has not re-rendered yet, so the payload is built from
  `draftOverride ?? draft`. **Do not** work around this with a `setTimeout` or a
  second render.
- Also produces `useFlow()` — a named export from `NewAccountFlow.jsx` wrapping `useOutletContext()`, so a step never repeats the hook and a future context change touches one line.

- [ ] **Step 1: Write the failing structural test**

There is no jsdom, so the assertions are structural: the routes exist, the wizard is outside `<Layout>`, the guard is in the shell, the password never reaches the draft, and no step writes a Tailwind utility that would compile to nothing.

```js
// test/new-account-pages.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STEP_IDS } from '../frontend/src/features/accounts/newAccountFlow.js';
import { readSrc, allSrcFiles } from './helpers/src-files.js';

// The eleven wizard pages cannot be rendered here — no jsdom, no React Testing
// Library, by decision — so what is asserted is structure: the routes exist, the
// wizard sits OUTSIDE <Layout>, the guard lives in one place, no page writes a
// Tailwind class that silently compiles to nothing, and no page can leak a
// password into the draft.

const app = readSrc('App.jsx');
const shell = readSrc('NewAccountFlow.jsx');
const stepFiles = () => allSrcFiles().filter((f) => f.startsWith('features/accounts/steps/'));

test('every step id has a route, and every route is a step id', () => {
  // A step in stepsFor() with no <Route> is a redirect to a blank page; a <Route>
  // with no step is dead. Read from the shell's route table, which is where the
  // paths are declared.
  const declared = [...app.matchAll(/<Route\s+path="([a-z]+)"/g)]
    .map((m) => m[1])
    .filter((p) => STEP_IDS.includes(p));
  for (const id of STEP_IDS) {
    assert.ok(declared.includes(id), `no <Route path="${id}"> in App.jsx`);
  }
});

test('the wizard is a SIBLING of Layout, so it has no sidebar and no filter bar', () => {
  // Spec §8.1. Nested inside the Layout route the wizard would render through
  // Layout's <Outlet>, inheriting the shell's chrome AND its outlet context, and
  // the whole full-bleed design would be gone.
  //
  // Nesting is the thing being asserted, so it is MEASURED rather than guessed at
  // from distances or indentation: this walks forward from the Layout route's own
  // opening `<Route`, counting nested `<Route` elements in and `</Route>` out, and
  // stops at the tag that closes it. That span is the Layout route's children.
  // A self-closing `/>` opens and closes in one tag and so never changes depth.
  const layoutOpen = app.lastIndexOf('<Route', app.indexOf('<Layout'));
  assert.ok(layoutOpen > -1, 'could not find the Layout route');

  let depth = 0;
  let layoutEnd = -1;
  const tag = /<Route\b[\s\S]*?(\/>|>)|<\/Route>/g;
  tag.lastIndex = layoutOpen;
  for (let m = tag.exec(app); m; m = tag.exec(app)) {
    if (m[0] === '</Route>') depth -= 1;
    else if (m[1] === '>') depth += 1;      // an opening tag with children
    // `/>` is self-closing: in and out in one tag, no depth change.
    if (depth === 0) { layoutEnd = m.index + m[0].length; break; }
  }
  assert.ok(layoutEnd > layoutOpen, 'could not find the tag that closes the Layout route');

  // Both call sites of the shared route table (first-run and onboarded) must fall
  // outside that span. `wizardRoutes` is a function, so its own JSX literal lives
  // elsewhere in the file entirely — what matters is where it is CALLED.
  // `...wizardRoutes(` only — the spread is what a call site looks like here, and
  // matching the bare name would also hit `function wizardRoutes(`.
  const calls = [...app.matchAll(/\.\.\.wizardRoutes\(/g)].map((m) => m.index);
  assert.ok(calls.length >= 1, 'wizardRoutes is never spread into <Routes>');
  for (const at of calls) {
    assert.equal(at > layoutOpen && at < layoutEnd, false,
      'a wizardRoutes() call sits inside the Layout route — the wizard must be a sibling');
  }
});

test('the wizard takes the three things App owns, since it has no outlet context', () => {
  // Spec §8.1: reloadAccounts, setAccountId and accounts come from App as props,
  // because a sibling of <Layout> gets no outlet context. Scoped to the route's
  // OWN registration — from its path to that registration's closing </Route>.
  const open = app.indexOf('path="/accounts/new"');
  assert.ok(open > -1, 'the wizard route is missing');
  const registration = app.slice(open, app.indexOf('</Route>', open));
  for (const prop of ['accounts', 'reloadAccounts', 'setAccountId']) {
    assert.ok(registration.includes(prop), `the wizard route does not pass ${prop}`);
  }
});

test('the guard lives in the shell, once, not in eleven pages', () => {
  assert.match(shell, /canVisit\(/, 'the shell must gate on canVisit');
  assert.match(shell, /firstIncomplete\(/, 'the shell must know where to send a rejected visit');
  const offenders = stepFiles().filter((f) => /canVisit\(|firstIncomplete\(/.test(readSrc(f)));
  assert.deepEqual(offenders, [],
    'a step re-implements the guard — it belongs in the shell, where one copy cannot drift from itself');
});

test('the shell mirrors the draft to sessionStorage under the versioned key', () => {
  // Spec §6.1: a mid-flow refresh resumes, and the draft dies with the tab.
  assert.match(shell, /sessionStorage/);
  assert.match(shell, /DRAFT_KEY/, 'the key must come from the flow module, not be retyped');
  assert.equal(/localStorage/.test(shell), false,
    'localStorage outlives the tab — an abandoned draft would greet the user days later');
});

test('the provision key is minted with crypto.randomUUID, once', () => {
  // A guessable or shared key is a denial-of-service on other users' account
  // creation: provision_key is UNIQUE globally while its lookup is per-user, so
  // one user's key can occupy the index slot another user's would need.
  assert.match(shell, /crypto\.randomUUID\(\)/);
  assert.equal((shell.match(/crypto\.randomUUID\(\)/g) || []).length, 1,
    'minted in exactly one place — a second call per attempt defeats the idempotency guard');
});

test('no step component holds the broker password in the draft', () => {
  // Spec §6.1: sessionStorage is readable by any script on the origin, so the
  // password lives in component state and goes straight to the provision call.
  for (const f of stepFiles()) {
    const src = readSrc(f);
    for (const m of src.matchAll(/patch\(\{([^}]*)\}/g)) {
      assert.equal(/password|secret/i.test(m[1]), false,
        `${f} patches a password into the draft: patch({${m[1]}})`);
    }
  }
});

test('no wizard file writes a Tailwind utility, which would compile to nothing', () => {
  // tailwind.css scopes @source to components/{ui,primitives} ONLY. A utility
  // class written in a page under src/ emits no CSS and fails silently — the
  // element simply renders unstyled, which no reviewer catches by eye.
  const UTILITY = /className="[^"]*\b(?:flex|grid|hidden|block|p-\d|px-\d|py-\d|m-\d|mx-\d|my-\d|gap-\d|w-full|h-full|text-(?:sm|xs|lg|xl)|font-(?:medium|semibold|bold)|rounded(?:-\w+)?|border(?:-\w+)?|bg-\w+|items-center|justify-\w+)\b/;
  const files = [...stepFiles(), 'features/accounts/NewAccountFlow.jsx'];
  const offenders = files.filter((f) => UTILITY.test(readSrc(f)));
  assert.deepEqual(offenders, [],
    'these write Tailwind utilities that will not compile — compose primitives or add a class to legacy/app.css');
});

test('every wizard navigation target is an absolute path', () => {
  // router-surface.test.js enforces this app-wide; asserted here too so a step
  // added later fails in the test that names the wizard rather than in a sweep.
  const files = [...stepFiles(), 'features/accounts/NewAccountFlow.jsx'];
  for (const f of files) {
    for (const m of readSrc(f).matchAll(/\bto=(?:"([^"]+)"|\{`([^`]+)`\})/g)) {
      const target = m[1] ?? m[2];
      assert.ok(target.startsWith('/'), `${f}: to="${target}" must be absolute`);
    }
  }
});

test('the capital step offers exactly the two kinds the column admits', () => {
  const src = readSrc('CapitalStep.jsx');
  assert.match(src, /'prop'/);
  assert.match(src, /'live'/);
  // migration 0026's CHECK is `capital_kind IN ('prop','live')`. A third card
  // would 400 at provision after the user answered eight more questions.
  const kinds = [...src.matchAll(/capital_kind:\s*'(\w+)'/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(kinds)].sort(), ['live', 'prop']);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test test/new-account-pages.test.js`
Expected: FAIL — `no such file under frontend/src: 'NewAccountFlow.jsx'`.

- [ ] **Step 3: Write the shell**

`frontend/src/features/accounts/NewAccountFlow.jsx`. Behaviour, in order:

1. **Mint the provision key once.** `useRef(crypto.randomUUID())` — not `useState(crypto.randomUUID())`, which re-evaluates the initializer expression on every render in the eyes of a reader even though React discards it; a ref makes "once" obvious. It is minted once **per mount**, and a revived draft keeps the stored key over it (Task 3's `reviveDraft`).
2. **Hydrate the draft.** `useState(() => reviveDraft(sessionStorage.getItem(DRAFT_KEY), { provisionKey: keyRef.current, firstRun }))`, wrapped in `try/catch` — `sessionStorage` throws in a private window with site data blocked, and a wizard that white-screens there is worse than one that starts fresh.
3. **Mirror on change.** `useEffect` writing `JSON.stringify(draft)`, in `try/catch` for the same reason.
4. **Derive the current step from the URL,** not from state: `useLocation().pathname.split('/').pop()`. The URL is the source of truth — that is the point of real routes over one stateful page.
5. **Guard.** If `!canVisit(draft, step)`, render `<Navigate to={`/accounts/new/${firstIncomplete(draft)}`} replace />` in place of the `<Outlet>`. One check, one redirect.
6. **`patch(p)`** → `setDraft((d) => patchDraft(d, p))`.
7. **`advance()` / `back()`** → `navigate('/accounts/new/' + nextStep(draft, step))`, absolute. `back()` is a no-op when `prevStep` is null.
8. **`commit(extra)`** — the only place that provisions:
   ```js
   async function commit(extra = {}) {
     setCommitting(true);
     try {
       const account = await provisionAccount({ ...toProvisionPayload(draft), ...extra });
       // Record it BEFORE anything that can fail: from here the draft is
       // committed, navigation is forward-only, and a retry would create a
       // second account. reloadAccounts and completeOnboarding are both
       // best-effort by comparison.
       setDraft((d) => patchDraft(d, { account: { id: account.id, mt5_login: account.mt5_login } }));
       await reloadAccounts?.();
       // Decision B9: stamp onboarding at COMMIT, not on `done`. A first-run user
       // who closes the tab after creating an account must not be asked to create
       // a second one next login.
       if (firstRun) { try { onOnboarded?.(await completeOnboarding()); } catch { /* the account exists; the stamp can wait */ } }
       return account;
     } finally {
       setCommitting(false);
     }
   }
   ```
   `extra` is how the connect step passes `{ credential }` without it ever entering the draft.
9. **`finish()`** — select the new account and leave: `if (draft.account?.mt5_login != null) setAccountId(String(draft.account.mt5_login));` then `navigate('/')`. Spec §8.1: *"'Home page' lands on a dashboard already scoped to what was just created."*
10. **Chrome**: the brand mark (reuse `Logo` + `BRAND` from `lib/theme.js`, as `AuthShell` does), the progress indicator from `index`/`total`, a Back control shown only when `canGoBack`, and an **Exit** control. Exit is not in the spec and is needed: a wizard that is a sibling of `<Layout>` has no sidebar, so without it a user who opened it by accident has no way out but the browser button. It navigates to `/settings/accounts` for a returning user; on first run it does not render (the first-run escape is `welcome`'s "Skip for now", Task 12).
11. **Transitions** (§8.4): a `key={step}` on the step container plus a CSS class; **no animation library**.
12. Export `useFlow()`:
    ```js
    export const useFlow = () => useOutletContext();
    ```

Route wiring in `App.jsx` — declare it once and use it in both branches. In this task only the **logged-in, onboarded** branch is wired; Task 12 adds the first-run branch.

```jsx
// The Add Account wizard. A SIBLING of <Layout> on purpose (spec §8.1): eleven
// full-bleed pages with no sidebar and no filter bar, so it cannot nest inside the
// shell — and therefore has no outlet context, which is why accounts,
// reloadAccounts and setAccountId are passed as props.
// Returns an ARRAY, not a fragment: both branches spread it into <Routes>, and an
// array of keyed <Route> elements is the form this file already relies on (see the
// LEGACY_REDIRECTS map below). Fragments are traversed too, but there is no reason
// to introduce a second shape.
function wizardRoutes({ accounts, reloadAccounts, setAccountId, firstRun, onOnboarded }) {
  return [
    <Route
      key="new-account"
      path="/accounts/new"
      element={
        <NewAccountFlow
          accounts={accounts}
          reloadAccounts={reloadAccounts}
          setAccountId={setAccountId}
          firstRun={firstRun}
          onOnboarded={onOnboarded}
        />
      }
    >
      <Route index element={<FlowIndex />} />
      <Route path="welcome" element={<WelcomeStep />} />
      <Route path="capital" element={<CapitalStep />} />
      <Route path="firm" element={<FirmStep />} />
      <Route path="product" element={<ProductStep />} />
      <Route path="phase" element={<PhaseStep />} />
      <Route path="name" element={<NameStep />} />
      <Route path="platform" element={<PlatformStep />} />
      <Route path="import" element={<ImportStep />} />
      <Route path="connect" element={<ConnectStep />} />
      <Route path="upload" element={<UploadStep />} />
      <Route path="done" element={<DoneStep />} />
    </Route>,
  ];
}
```

Call it in the onboarded branch as a sibling of the `<Route element={<Layout …>}>` block:

```jsx
        ) : user ? (
          [
            ...wizardRoutes({ accounts, reloadAccounts, setAccountId, firstRun: false, onOnboarded: setUser }),
            <Route key="app-shell" element={<Layout /* …every existing prop, unchanged… */ />}>
              {/* …the existing route tree, unchanged… */}
            </Route>,
          ]
        ) : (
```

The existing `<Route element={<Layout …>}>` needs a `key` once it is an array member. Nothing else inside it changes.

`FlowIndex` is a two-line component in `NewAccountFlow.jsx`: it reads the draft from the outlet context and returns `<Navigate to={`/accounts/new/${firstIncomplete(draft)}`} replace />`. That is spec §8.1's *"/accounts/new redirects to the first incomplete step"*.

**In this task, stub the ten steps other than `capital`** as a one-line component rendering the step's name, so the route table is complete and the guard is exercisable from the first commit. Each later task replaces its stubs. Add a `// TASK N` comment on each stub naming the task that fills it, so a half-finished stub cannot ship unnoticed.

- [ ] **Step 4: Write `CapitalStep.jsx`**

Two choice cards — **Prop Firm** and **Live Capital** — each patching `capital_kind` and advancing in one action. Copy must earn the distinction: this is the question the whole `capital_kind` column exists to ask, and getting it wrong gives a trader an invented 5% / 10% / 8% challenge (migration 0026's own header). Suggested copy, subject to the design language's voice rules:

- **Prop Firm** — *"An evaluation or funded account with a firm's money. We track the drawdown limits, the profit target and the payouts."*
- **Live Capital** — *"Your own money, at your own broker. Journalled and analysed, with no challenge rules applied."*

The step's own heading and the cards must make clear that the choice is not cosmetic. It is re-choosable from this step (Back works until commit), and `patchDraft` clears the other branch's answers — so no warning copy is needed.

- [ ] **Step 5: Write the wizard CSS**

Add a clearly-fenced block at the end of `frontend/src/styles/legacy/app.css`, prefixed `.naf-` (new account flow). Open it with a comment naming the DESIGN-LANGUAGE sections each rule traces to, in the style the rest of that file already uses.

Rules needed by this task: the full-bleed page, the header (brand, progress, exit), the step container and its transition, the choice-card grid, and the footer action row. **Tokens only.** Elevation via `--sh-1/2/3`. Spacing from `--s-*`. Radius per §6's assignment rule.

```css
@media (prefers-reduced-motion: reduce) {
  .naf-step { animation: none; transition: none; }
}
```

- [ ] **Step 6: Run the tests**

Run: `node --test test/new-account-pages.test.js`
Expected: PASS, 10 tests.

Run: `npm test`
Expected: all green — including `design-language.test.js` (the new CSS is inside the blob it scans) and `router-surface.test.js` (every new `to=` is absolute).

Run: `cd frontend && npm run build`
Expected: `✓ built`.

- [ ] **Step 7: Run it (do not skip — the tests cannot see a page)**

```bash
npm run dev &
cd frontend && npm run dev
```

Confirm, as a logged-in onboarded user: `/accounts/new` redirects to `/accounts/new/capital`; both cards advance and the URL changes; the browser Back button works; `/accounts/new/phase` typed cold redirects to `/accounts/new/capital`; a refresh mid-flow resumes on the same step; the progress reads "1 of 5"; there is no sidebar and no filter bar. Stop both servers.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/accounts/NewAccountFlow.jsx \
        frontend/src/features/accounts/steps/ \
        frontend/src/App.jsx frontend/src/styles/legacy/app.css \
        test/new-account-pages.test.js
git commit -m "$(cat <<'MSG'
Mount the Add Account wizard as eleven routes beside the shell

A sibling of <Layout>, not a child (spec §8.1): full-bleed pages with no sidebar
and no filter bar, which also means no outlet context — so accounts,
reloadAccounts and setAccountId arrive as props from App.

The guard is in the shell rather than in eleven pages. The spec puts it per page;
one implementation cannot drift from itself and eleven can, and canVisit() is
already a tested pure function. A cold /accounts/new/phase lands on capital.

The draft mirrors to sessionStorage, never localStorage — it should die with the
tab, not greet the user days later — and every read and write is wrapped, because
sessionStorage throws in a private window with site data blocked and a
white-screened wizard is worse than one that starts fresh.

The provision key is minted with crypto.randomUUID exactly once. It is UNIQUE
globally while its lookup is per-user, so a guessable or shared key lets one
user's draft occupy the index slot another user's account needs.

Ten steps ship as named stubs so the route table is complete and the guard is
exercisable from this commit; each carries the task number that fills it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---
## Task 7: The prop branch — `firm`, `product`, `phase`

**Visual conformance:** the searchable/selectable card-grid pattern; form field and label density for the custom-rules editor; the "unconfirmed / needs attention" treatment if the design language has one; disabled and empty states.

Three steps, and the one that carries the risk is `product`: it is where a percentage becomes a number that scores a real challenge. Two behaviours are non-negotiable —

- **Only `wizardProducts()` renders** (Task 2). GFT's 1-Step and Instant products carry `verified: false` with unconfirmed drawdowns; they must not reach a user.
- **The custom product asks, it does not guess.** For `other`/`custom` the step renders rule *inputs*, and `isStepComplete` refuses to advance until the balance and both drawdowns are entered — a missing percentage is `numOrNull`'d by the validator and then `COALESCE`d by `mt5_accounts` to 5/10/8, so an unlisted firm's account would be judged against GoatFundedTrader's rules.

**Files:**
- Modify: `frontend/src/features/accounts/steps/FirmStep.jsx` `ProductStep.jsx` `PhaseStep.jsx` (replacing Task 6's stubs)
- Modify: `frontend/src/styles/legacy/app.css`
- Modify: `test/new-account-pages.test.js`

**Interfaces:**
- Consumes: `useFlow()`; `wizardFirms`, `wizardProducts`, `findFirm`, `findProduct`, `isCustomProduct`, `templateToFields`, `sizeLabel`, `PHASES`.
- Produces: nothing new — the steps write to the draft through `patch()`.

- [ ] **Step 1: Add the failing assertions to `test/new-account-pages.test.js`**

```js
// ---- the prop branch -------------------------------------------------------

test('the firm step renders only firms the wizard can complete', () => {
  // A firm whose every product is unverified would be a card that leads to an
  // empty product page. wizardFirms() already drops those; this is what stops the
  // page reaching past it to the raw catalog.
  const src = readSrc('FirmStep.jsx');
  assert.match(src, /wizardFirms\(/);
  assert.equal(/\bPROP_FIRMS\b/.test(src), false,
    'the firm step must not read the raw catalog — it would offer unverified-only firms');
});

test('the product step renders only verified or custom products', () => {
  // THE ONE THAT MATTERS. GFT 1-Step and Instant Funding carry verified: false
  // with drawdown percentages nobody has checked against the firm, and a wrong
  // drawdown does not fail loudly — it mis-scores a real trader's account for the
  // length of a challenge.
  const src = readSrc('ProductStep.jsx');
  assert.match(src, /wizardProducts\(/);
  assert.equal(/\.products\b/.test(src), false,
    'the product step must not read firm.products directly — that includes unverified rules');
});

test('the product step resolves its rules through templateToFields', () => {
  // Not by reading phase objects itself. templateToFields is what enforces size
  // membership and the eval/funded target-vs-split split, and it is tested.
  assert.match(readSrc('ProductStep.jsx'), /templateToFields\(/);
});

test('the custom product gets inputs, not defaults', () => {
  const src = readSrc('ProductStep.jsx');
  assert.match(src, /isCustomProduct\(/, 'the step must branch on the custom product');
  for (const field of ['daily_dd_pct', 'max_dd_pct', 'start_balance']) {
    assert.ok(src.includes(field), `the custom editor does not collect ${field}`);
  }
});

test('no wizard step hardcodes a drawdown percentage', () => {
  // Every number a challenge is judged against comes from the catalog or from the
  // user. A literal here is an invented rule with nothing pinning it.
  for (const f of stepFiles()) {
    const src = readSrc(f);
    for (const m of src.matchAll(/(daily_dd_pct|max_dd_pct|profit_target_pct):\s*([0-9.]+)/g)) {
      assert.fail(`${f} hardcodes ${m[1]}: ${m[2]} — rules come from the catalog or the user`);
    }
  }
});

test('the phase step offers only the three values challenges.phase accepts', () => {
  const src = readSrc('PhaseStep.jsx');
  assert.match(src, /PHASES/, 'the phase list must come from the flow module, not be retyped');
  const literals = [...src.matchAll(/phase:\s*'(\w+)'/g)].map((m) => m[1]);
  for (const p of literals) {
    assert.ok(['p1', 'p2', 'funded'].includes(p), `${p} is not a phase the schema accepts`);
  }
});

test('the phase step derives account_type from the phase rather than asking twice', () => {
  // Two controls naming one fact drift. The phase decides it: p1/p2 are eval,
  // funded is funded, and that is what templateToFields already returns.
  const src = readSrc('PhaseStep.jsx');
  assert.match(src, /account_type/);
  assert.equal(/<select[^>]*account_type|name="account_type"/.test(src), false,
    'account_type must not be a control — the phase decides it');
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --test test/new-account-pages.test.js` → FAIL (the stubs contain none of this).

- [ ] **Step 3: `FirmStep.jsx`**

A card grid over `wizardFirms()`, plus a search input when the list grows past a handful (it is three today — render the search only if the design language's pattern calls for it at this size; if not, omit it and say so in a comment).

Choosing a listed firm: `patch({ firm_id: f.id, firm_name: f.name })` then `advance()`.

Choosing **Other / not listed** must collect the firm's name before advancing — the label suggestion and the accounts table both read `firm_name`, and "Other / not listed" as an account's firm is useless. So that card reveals a text input and the Continue action is disabled until it has a value:

```jsx
patch({ firm_id: 'other', firm_name: typedName.trim() });
```

`patchDraft` clears the product, the phase and the rules on any firm change, so switching firms mid-flow needs no handling here.

- [ ] **Step 4: `ProductStep.jsx`**

Two modes, chosen by `isCustomProduct(draft.firm_id, productId)`:

**Catalog mode** — a card per `wizardProducts(draft.firm_id)`, and once one is chosen, its `product.sizes` as a second selection.

**Read this before writing the patch, because the obvious version does not work.** `templateToFields` needs all four arguments — firm, product, size **and phase** — and returns `null` without a phase. The phase is the *next* step. So the product step cannot resolve the rules, and it must not try.

But `isStepComplete(draft, 'product')` requires the balance **and both drawdowns**, so a product step that stored only the identity could never complete. Two ways out, and only the second is acceptable:

1. Loosen `product`'s completeness rule. **No.** It is the only thing standing between the custom-rules path and an account judged against GoatFundedTrader's 5 / 10 / 8 defaults.
2. **Store the drawdowns provisionally here, and let the phase step overwrite all five.** They come off the product's first phase, and the phase step's single `templateToFields` call replaces them with the chosen phase's real values.

```jsx
// The drawdowns come from the product's phases and are identical across them for
// every product in the catalog today — but that is a property of the DATA, not a
// guarantee, so this is PROVISIONAL and the phase step overwrites all five from
// templateToFields the moment the phase is known. Recording something here is what
// lets this step complete at all, and an account carrying no drawdown forward is
// the one thing the flow must never allow.
const product = findProduct(draft.firm_id, productId);
const first = product.phases[0];
patch({
  product_id: productId,
  start_balance: Number(size),
  daily_dd_pct: first.dailyDdPct,
  max_dd_pct: first.maxDdPct,
  dd_type: findFirm(draft.firm_id).ddType,
});
```

`patchDraft` clears the phase and the rules on a `product_id` change and then applies this patch on top — which is why the invalidate-before-merge ordering in Task 3 is tested rather than assumed.

**Custom mode** — a small form collecting `start_balance`, `daily_dd_pct`, `max_dd_pct`, `dd_type` and `min_trading_days`, patched together. Reuse `PropFields`' field semantics (`step="0.1"` on percentages — real firms use half-percent drawdowns, and `insertAccountQuery`'s `::numeric` cast exists because of it) but **write the markup here**: `PropFields` is `AccountFormModal`'s field set, and importing a JSX component from a file the wizard otherwise does not touch buys a coupling for six inputs. Say that in a comment so a reviewer does not read it as duplication by accident.

Do **not** collect `profit_target_pct` or `payout_split_pct` here — they depend on the phase, and the phase step collects whichever one applies.

- [ ] **Step 5: `PhaseStep.jsx`**

**Catalog product:** a card per `product.phases`, and on selection the single authoritative resolution:

```jsx
const fields = templateToFields(draft.firm_id, draft.product_id, draft.start_balance, phaseId);
if (!fields) return;   // an impossible combination; the guard sends the user back
patch({ phase: phaseId, ...fields });
advance();
```

`templateToFields` returns `firm_id`, `firm_name`, `product_id`, `account_type`, `start_balance` and all five rule fields, so this overwrites the product step's provisional drawdowns with the phase's real ones and sets `account_type` from `phase.accountType` — no second control, and `profit_target_pct`/`payout_split_pct` land correctly (a target for an eval, a split for funded).

**Custom product:** the three `PHASES` as cards with plain labels — *Phase 1*, *Phase 2*, *Funded* — plus the one phase-dependent number:

```jsx
// account_type is DERIVED, never asked: two controls naming one fact drift, and
// templateToFields already derives it the same way for catalog products.
const account_type = phaseId === 'funded' ? 'funded' : 'eval';
patch({
  phase: phaseId,
  account_type,
  profit_target_pct: account_type === 'eval' ? Number(target) : null,
  payout_split_pct: account_type === 'funded' ? Number(split) : null,
});
```

An eval phase needs a profit target and a funded one needs a split — `isStepComplete` enforces exactly that pair, so Continue stays disabled until the right one is filled.

- [ ] **Step 6: CSS, tests, build**

Extend the `.naf-` block with the card grid and the inline rule-editor form. Tokens only.

Run: `node --test test/new-account-pages.test.js` → PASS.
Run: `npm test` → all green.
Run: `cd frontend && npm run build` → `✓ built`.

- [ ] **Step 7: Run it**

Walk the prop path for GFT 2-Step 25K Phase 1 and confirm the resolved rules are 5 / 10 / 8 / 3 days. Then walk it again for **Other / not listed**, type a firm name and your own percentages, and confirm Continue stays disabled until the balance and both drawdowns are in. Confirm GFT shows **only** 2-Step — no 1-Step, no Instant Funding.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/accounts/steps/FirmStep.jsx \
        frontend/src/features/accounts/steps/ProductStep.jsx \
        frontend/src/features/accounts/steps/PhaseStep.jsx \
        frontend/src/styles/legacy/app.css test/new-account-pages.test.js
git commit -m "$(cat <<'MSG'
Build the prop branch: firm, product and phase

The product step is where a percentage becomes a number that scores a real
challenge, so two things are enforced by test rather than by care. It reads
wizardProducts(), never firm.products, so GFT's unverified 1-Step and Instant
drawdowns cannot reach a user. And no step may hardcode a drawdown at all —
every rule comes from the catalog or from the trader.

templateToFields is called ONCE, on the phase step, because that is the only
place with all four arguments. The product step records the drawdowns off the
product's first phase as a provisional value, so the step can complete at all,
and the phase step overwrites all five. account_type is derived from the phase
in both modes rather than asked: two controls naming one fact drift.

The unlisted firm asks for its name before advancing — firm_name feeds the label
suggestion and the accounts table, and "Other / not listed" is useless in both.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Task 8: `name` and `platform`

**Visual conformance:** single-field page layout; input + inline-hint pattern; the searchable grid with a "Soon" badge state; the show-more/expand affordance; badge treatment for an unavailable option.

**Files:**
- Modify: `frontend/src/features/accounts/steps/NameStep.jsx` `PlatformStep.jsx`
- Modify: `frontend/src/styles/legacy/app.css`, `test/new-account-pages.test.js`

**Interfaces:**
- Consumes: `useFlow()`; `suggestedLabel` (Task 3); `PLATFORM_CARDS`, `searchPlatforms`, `findPlatformCard` (`platformCatalog.js`); `findFirm` (for the firm's platform list).

- [ ] **Step 1: Add the failing assertions**

```js
// ---- name and platform -----------------------------------------------------

test('the name step offers the suggested label rather than inventing one', () => {
  const src = readSrc('NameStep.jsx');
  assert.match(src, /suggestedLabel\(/);
  assert.equal(/firm_name\s*\+|`\$\{.*firm/.test(src), false,
    'the page must not compose its own label — suggestedLabel is tested, a template string is not');
});

test('the name step never overwrites what the user typed', () => {
  // The suggestion seeds the input; it is not re-applied. Overwriting a typed
  // label because a later step changed is how a user loses their own text.
  const src = readSrc('NameStep.jsx');
  assert.match(src, /useState\(/, 'the input is local state seeded once, not derived every render');
});

test('the platform step reads the presentation catalog, not the backend registry', () => {
  // src/domain/sync/platforms.js is the authority and the frontend cannot import
  // it (the deploy ships the two trees separately). platformCatalog.js is the
  // presentation half and platform-catalog.test.js keeps them in step.
  const src = readSrc('PlatformStep.jsx');
  assert.match(src, /platformCatalog/);
  assert.equal(/domain\/sync\/platforms/.test(src), false,
    'the page must never import backend source — it works locally and crashes on the box');
});

test('the platform step cannot select a Soon platform', () => {
  // provision 400s on any platform whose `enabled` is false, so an enabled card
  // would be a dead end after the user answered six questions.
  const src = readSrc('PlatformStep.jsx');
  assert.match(src, /status/, "the card's status must gate selection");
  assert.match(src, /'soon'/);
});

test('the platform step narrows to the firm on the prop path', () => {
  // Spec §7.2: for a prop account the firm implies the platform, with the rest
  // behind "show all".
  const src = readSrc('PlatformStep.jsx');
  assert.match(src, /findFirm\(/);
  assert.match(src, /platforms/);
});

test('only the live path collects a broker, and it is free text', () => {
  // Spec §7.2 and §4: `broker` is free text on the Live path. toProvisionPayload
  // nulls it for prop, so collecting it there would be discarded input.
  const src = readSrc('PlatformStep.jsx');
  assert.match(src, /broker/);
  assert.match(src, /capital_kind/, 'the broker field must be gated on the capital kind');
});
```

- [ ] **Step 2: Run and confirm failure.**

- [ ] **Step 3: `NameStep.jsx`**

One text input, seeded once from `suggestedLabel(draft)`:

```jsx
// Seeded ONCE. The suggestion is a starting point, not a derived value — deriving
// it every render would overwrite the name a user typed the moment a later step
// changed anything it is built from. Empty for a live account: there is no firm
// to name, and a placeholder does that job better than a guess.
const [label, setLabel] = useState(() => draft.label || suggestedLabel(draft));
```

Patch on blur and on Continue (`patch({ label })`), not on every keystroke — the draft is mirrored to `sessionStorage` on change, and a write per character is pointless churn. Continue is disabled while `label.trim()` is empty, matching `isStepComplete`.

Show the currency control **only if** the design language has a pattern for a secondary field on a single-question page; otherwise leave `currency` at its `'USD'` default and note that a non-USD account is an edit away. (`updateAccount` already accepts `currency`.)

- [ ] **Step 4: `PlatformStep.jsx`**

- **Prop path:** the grid is `PLATFORM_CARDS` filtered to `findFirm(draft.firm_id)?.platforms`, with the remainder behind a **Show all platforms** toggle (spec §7.2). The `other` firm names every platform (Task 2), so an unlisted firm sees the full grid without a special case.
- **Live path:** the full grid, plus a free-text **Broker** input — patched as `broker`. `toProvisionPayload` nulls `broker` on the prop path, so it is only collected here.
- **Selection:** `status === 'soon'` cards render **disabled with the card's `blurb`** as the reason. Every card has a mandatory blurb precisely so a greyed name is never bare (`platformCatalog.js`'s own header). A live card patches `{ platform: c.id }` and advances.
- **Search:** `searchPlatforms(query)` — it matches the id as well as the name, so typing "mt5" works.
- Do **not** filter by `status` inside `searchPlatforms`; the Soon cards must remain findable, or the catalog stops reading as the roadmap it is meant to be.

`patchDraft` drops a chosen `import_method` the new platform does not offer, so switching from MetaTrader 5 to *Other* after choosing Auto Sync needs no handling here — the `import` step simply asks again.

- [ ] **Step 5: CSS, tests, build, run it**

Run: `node --test test/new-account-pages.test.js` → PASS.
Run: `npm test` → all green. `cd frontend && npm run build` → `✓ built`.

Then run it: on the prop path with GFT selected, confirm the grid shows MetaTrader 5 (GFT's only platform) with the rest behind Show all; that MT4/cTrader/TradeLocker are visibly disabled with their blurbs; that typing `mt5` finds MetaTrader 5; and that on the live path the broker field appears and the full grid shows.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/accounts/steps/NameStep.jsx \
        frontend/src/features/accounts/steps/PlatformStep.jsx \
        frontend/src/styles/legacy/app.css test/new-account-pages.test.js
git commit -m "$(cat <<'MSG'
Build the name and platform steps

The name step seeds its input from suggestedLabel ONCE. Deriving it every render
would overwrite the name a user typed the moment anything it is built from
changed, and the suggestion is a starting point rather than a value.

The platform step reads platformCatalog.js, never src/domain/sync/platforms.js —
importing backend source into the frontend works locally and crashes on the box,
which is why the two catalogs and their drift test exist at all. Soon platforms
stay findable and stay unselectable, each showing its own blurb: provision 400s
on a platform whose `enabled` is false, so an enabled card would be a dead end
six questions in.

On the prop path the grid narrows to the firm's platforms with the rest behind
Show all; the unlisted firm names every platform, so it needs no special case.
The broker free-text field is live-path only, because toProvisionPayload nulls it
for prop and collecting it there would be input we discard.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---
## Task 9: The `import` step — three cards, and the only place gating happens

**Visual conformance:** the three-option card pattern; the **disabled-with-a-reason** state (this is the page where it carries the most weight); inline upgrade-link treatment; the primary-action-is-the-card interaction.

Spec §7.5: **gating happens here, never at submit.** Free is `syncedAccounts: 0`, so both Auto Sync options render disabled with the reason and an upgrade link while Manual and File upload stay live. A Pro user at the cap sees "3 of 3 synced accounts used" on the card rather than a 402 after typing a broker password.

This step is also the **commit point for Manual and File upload** (spec §6.2) — those two have nothing left to ask.

**Files:**
- Modify: `frontend/src/features/accounts/steps/ImportStep.jsx`
- Modify: `frontend/src/styles/legacy/app.css`, `test/new-account-pages.test.js`

**Interfaces:**
- Consumes: `useFlow()` (`commit`, `committing`, `patch`, `advance`, `accounts`, `plan`); `autoSyncGate` (Task 1); `findPlatformCard` (for which methods this platform offers); `commitStep` (Task 3).

- [ ] **Step 1: Add the failing assertions**

```js
// ---- the import step -------------------------------------------------------

test('the import step gates through autoSyncGate, not its own plan arithmetic', () => {
  const src = readSrc('ImportStep.jsx');
  assert.match(src, /autoSyncGate\(/);
  assert.equal(/=== 'free'|!== 'free'|'premium'/.test(src), false,
    'a second copy of the plan rule here is how the UI and the server disagree');
});

test('the import step shows the reason and the upgrade route, not a bare disabled card', () => {
  // Spec §7.5. A greyed card with no sentence beside it reads as a bug in our app.
  const src = readSrc('ImportStep.jsx');
  assert.match(src, /reason/);
  assert.match(src, /\/billing/, 'the refusal must offer the route that lifts it');
});

test('gating never blocks Manual or File upload', () => {
  // Free users journal by hand and by CSV — that is the whole free tier. A gate
  // that caught all four cards would make the flow uncompletable for them.
  const src = readSrc('ImportStep.jsx');
  const gated = src.slice(src.indexOf('autoSyncGate'));
  const manualCard = src.indexOf("'manual'");
  assert.ok(manualCard > -1, 'the manual option is missing');
  assert.equal(/gate\.allowed[^;]*'manual'|'manual'[^;]*gate\.allowed/.test(gated), false,
    'the manual card must not depend on the Auto Sync gate');
});

test('the import step offers only methods this platform supports', () => {
  // `other` and MT4 offer file and manual only. Offering auto_sync there submits
  // a payload platformSupports() refuses with a 400.
  const src = readSrc('ImportStep.jsx');
  assert.match(src, /importMethods|findPlatformCard\(/);
});

test('the import step commits for the branches that end here, and only those', () => {
  // Spec §6.2: `import` is the commit point for Manual and File upload; Auto Sync
  // and the EA commit on `connect`. Committing for all four would create the
  // account before the credential was collected — the half-configured row this
  // whole commit strategy exists to avoid.
  const src = readSrc('ImportStep.jsx');
  assert.match(src, /commit\(/);
  assert.match(src, /commitStep\(/, 'the branch decision must come from the tested function');
});

test('no step calls provisionAccount directly — the shell owns the commit', () => {
  // One call site means one place that records the account, reloads the list and
  // stamps onboarding. Two means one of them forgets.
  for (const f of stepFiles()) {
    assert.equal(/provisionAccount\(/.test(readSrc(f)), false,
      `${f} provisions directly — use commit() from the flow context`);
  }
});
```

- [ ] **Step 2: Run and confirm failure.**

- [ ] **Step 3: Write `ImportStep.jsx`**

Render the cards `findPlatformCard(draft.platform).importMethods` allows, in this order and with this copy (subject to the design language's voice rules):

| Method | Card | Enabled when |
|---|---|---|
| `auto_sync` | **Auto Sync** — *"We connect to your account and keep it in sync. Nothing to install, nothing left running."* | `gate.allowed` |
| `manual` | **Enter trades by hand** — *"Log each trade yourself. You can add a CSV or connect a platform later."* | always |
| `file` | **Import a statement** — *"Upload a CSV export from your platform. We detect the columns and skip duplicates."* | always |

`ea` is deliberately **not** a card here: spec §2 decision 5 and §7.4 make the EA a **sub-choice under Auto Sync**, decided on `connect`. Say so in a comment — a future reader will want to add a fourth card.

The gate:

```jsx
const gate = autoSyncGate({ plan, accounts });
```

A disabled Auto Sync card renders `gate.reason` and, when `gate.upgrade`, a `<Link to="/billing">` (absolute — `router-surface.test.js`).

Choosing a card:

```jsx
async function choose(method) {
  const next = patch({ import_method: method });
  // Manual and File upload have nothing left to ask, so this IS the commit point
  // (spec §6.2). Auto Sync and the EA collect a credential first and commit on
  // `connect`.
  if (commitStep(next) === 'import') {
    try { await commit(); } catch (e) { setErr(e.message); return; }
  }
  advance();
}
```

`patch()` must return the new draft for that to work — confirm the shell's `patch` does (Task 6's interface says it does; if it does not, fix the shell, not this step).

**Error handling.** A failed commit leaves `import_method` set and `account` null, which `isStepComplete(draft,'import')` reports as incomplete — so the user stays here with the server's message shown and can retry. The retry reuses the same `provision_key`, which is exactly what the column is for. Show the message plainly; a 402 here means the gate and the server disagree, so include that possibility in the copy ("something changed on our side — try again, or pick another way in").

- [ ] **Step 4: Tests, build, run it**

Run: `node --test test/new-account-pages.test.js` → PASS. `npm test` → green. `cd frontend && npm run build` → `✓ built`.

Then run it **as a free user** (set `users.plan = 'free'` for your dev account on the 5433 database) and confirm: both Auto Sync affordances are disabled with a reason and a Billing link; Manual and File upload work; choosing Manual creates the account and lands on `done`; choosing File upload creates it and lands on `upload`. Then set the plan to `pro` and confirm Auto Sync becomes selectable.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/accounts/steps/ImportStep.jsx \
        frontend/src/styles/legacy/app.css test/new-account-pages.test.js
git commit -m "$(cat <<'MSG'
Gate Auto Sync at the import step, never at submit

Spec §7.5. A Pro user at the cap sees "3 of 3 synced accounts used" on the card;
a Free user sees the reason and a Billing link. Both beat a 402 that arrives
after the user has typed a broker password at the end of a nine-step flow. The
gate comes from autoSyncGate, not from a second copy of the plan rule here —
that copy is how the UI and the server come to disagree.

Manual and File upload are never gated. They are the whole free tier, and a gate
that caught all four cards would make the flow uncompletable.

This step is also the commit point for those two branches, because they have
nothing left to ask (spec §6.2). A failed commit leaves the step incomplete, so
the user stays here with the server's message and retries against the same
provision_key — which is what that column is for.

The EA is not a fourth card. It is a sub-choice under Auto Sync, decided on
connect (spec §2 decision 5).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Task 10: The `connect` step — the Auto Sync sub-choice, the credential, and the EA

**Visual conformance:** the two-option sub-choice pattern; secure-input treatment; the inline validation-hint pattern (the login availability check reports as you type); the numbered-instructions block for the EA (`SetupCard` already has one — reuse its markup verbatim and re-skin only if the design language demands it).

Spec §7.4. This step asks **how** before asking for anything secret:

- **"We run the terminal"** (recommended) → server + login + investor password → provision stores the credential and enqueues `first_sync`.
- **"I'll run the EA on my PC"** → provision mints an ingest token and the step becomes today's `SetupCard` rendered as a page, **unchanged**, so "how do I attach the EA" keeps exactly one answer.

### ⚠ Open decision this task depends on

Spec §7.5 says *"If `SYNC_CRED_KEY` is unset the server-side path is genuinely unavailable and the step says so, steering to the EA route."* **The client has no way to know that before committing.** `credentialsEnabled()` is exposed only on `GET /api/accounts/:id/sync`, which needs an account that does not exist yet.

**Plan of record (no backend change):** the "we run the terminal" branch attempts the provision and, on **503**, shows the server's message and switches the step to the EA sub-choice inline. Nothing was written — every provision failure leaves zero rows — so the user loses one button press, not their work. Cost: they may have typed a password before learning the route is unavailable.

**The alternative, if the owner prefers it:** add `autoSyncConfigured: credentialsEnabled()` to the existing `GET /api/accounts/login-available` response. The connect step already calls that endpoint while the user types the **login**, which is before the password field is touched, so the answer arrives in time with no new route and no new client call. It is a one-line backend change in a UI phase, which is why it is not the default. **Ask the owner before taking it.**

**Files:**
- Modify: `frontend/src/features/accounts/steps/ConnectStep.jsx`
- Modify: `frontend/src/styles/legacy/app.css`, `test/new-account-pages.test.js`

**Interfaces:**
- Consumes: `useFlow()` (`commit`, `committing`, `patch`, `advance`, `draft`); `checkLoginAvailable` (Task 4); `SetupCard` (`AccountForms.jsx`); `findPlatform`… **no** — that is backend. The credential field list and the read-only note live in `src/domain/sync/platforms.js`, which the frontend cannot import. See Step 3.

- [ ] **Step 1: Add the failing assertions**

```js
// ---- the connect step ------------------------------------------------------

test('the connect step asks HOW before it asks for anything secret', () => {
  // Spec §7.4: the sub-choice comes first. A page that renders a password field
  // before the user has chosen to give us one is asking for a broker credential
  // by default.
  const src = readSrc('ConnectStep.jsx');
  assert.match(src, /'auto_sync'/);
  assert.match(src, /'ea'/);
});

test('the connect step keeps the password out of the draft entirely', () => {
  // Spec §6.1. Local state, straight into commit()'s `extra`. The draft is
  // mirrored to sessionStorage, which any script on the origin can read.
  const src = readSrc('ConnectStep.jsx');
  assert.match(src, /useState/);
  for (const m of src.matchAll(/patch\(\{([^}]*)\}/g)) {
    assert.equal(/password/i.test(m[1]), false, `patch({${m[1]}}) carries a password`);
  }
  assert.match(src, /commit\(\s*\{\s*credential/,
    'the credential must go to commit() as extra, never through the draft');
});

test('the connect step names the read-only guarantee as a checked fact', () => {
  // The worker reads account_info().trade_allowed on every login and DELETES a
  // credential that can trade. That is a checked fact, not a promise, and the
  // copy must say the tradeable password is rejected — spec §7.6.
  const src = readSrc('ConnectStep.jsx');
  assert.match(src, /investor/i);
  assert.match(src, /reject|delete/i);
});

test('the read-only copy stays MT5-specific, so P2 cannot inherit it', () => {
  // Spec §7.6 and §10 risk 1: TradeLocker has no investor-password concept, so
  // this promise becomes false the moment TradeLocker ships. It must be reachable
  // only for the platform that keeps it.
  const src = readSrc('ConnectStep.jsx');
  assert.match(src, /mt5|platform/,
    'the read-only note must be gated on the platform, not printed unconditionally');
});

test('the connect step pre-checks the login while the user types', () => {
  // Spec §6.3: a collision reported before the password is typed beats a 409 at
  // the end of a nine-step flow.
  const src = readSrc('ConnectStep.jsx');
  assert.match(src, /checkLoginAvailable\(/);
  assert.match(src, /setTimeout|debounce/i, 'the pre-check fires on every keystroke without one');
});

test('a 409 keeps what the user typed', () => {
  // Spec §6.3. Clearing the form on a collision makes the user retype a server
  // name and a login to change one digit.
  const src = readSrc('ConnectStep.jsx');
  assert.match(src, /conflict/, 'the typed conflict from the error must be read');
  assert.equal(/setServer\(''\)|setLogin\(''\)/.test(src.slice(src.indexOf('catch'))), false,
    'the catch path must not clear the typed values');
});

test('the EA branch reuses SetupCard rather than restating the three steps', () => {
  // Spec §7.4: "how do I attach the EA" keeps exactly one answer, whether it is
  // asked at creation or a month later from the accounts table.
  assert.match(readSrc('ConnectStep.jsx'), /SetupCard/);
});
```

- [ ] **Step 2: Run and confirm failure.**

- [ ] **Step 3: Write `ConnectStep.jsx`**

**Sub-choice first.** Two cards; nothing secret is on screen until one is chosen.

**"I'll run the EA on my PC":**
```jsx
// The EA leaves mt5_login NULL to bind on the first trade, exactly as it does
// today (provisionAccount's `login` is only set for auto_sync).
const account = await commit({ import_method: 'ea' });
```
Wait — `import_method` is on the draft, not in `extra`. Patch it, then commit, so `toProvisionPayload` carries it: `patch({ import_method: 'ea' })` then `commit()`. `patch` returns the new draft, but `commit()` reads the shell's `draft` state which has not re-rendered yet — so **the shell's `commit` must accept a draft override**, or `commit` must build its payload from the value `patch` returned. Resolve it in the shell: `commit(extra, draftOverride)` where `toProvisionPayload(draftOverride ?? draft)`. Add that to Task 6's shell if it is not already there; do **not** work around it with a `setTimeout` or a second render.

Then render `<SetupCard account={account} />` on the same page, followed by Continue. `provisionAccount` returns the row through `ACCOUNT_COLUMNS`, which includes `ingest_token` — the one field `SetupCard` needs.

**"We run the terminal":** a three-field form — MT5 server, MT5 login, investor password.

The field list and the read-only note are the connector's, in `src/domain/sync/platforms.js` (`credentialFields`, `credentialNote`) — **which the frontend cannot import.** The three fields and the note are therefore written out here, gated on `draft.platform === 'mt5'`, with a comment naming the authority and pointing at spec §7.6. **Do not** add them to `platformCatalog.js` unless you also extend `platform-catalog.test.js` to drift-test them — and if you do that, say so, because it is a real improvement and a scope addition.

The login pre-check, debounced ~400ms:
```jsx
const { available, mine, account_id } = await checkLoginAvailable(login, draft.platform);
```
- `available === true` → nothing to say.
- `available === false && mine` → *"You already have an account on this login."* with a `<Link to="/settings/accounts">`.
- `available === false && !mine` → *"That login is already registered."*
- `available === null` → say nothing. The check failed; the unique index at commit is the real guard and a spurious warning is worse than silence.

Submit:
```jsx
const credential = { server: server.trim(), login: Number(login), password };
try {
  await commit({ credential });
  advance();
} catch (e) {
  if (e.status === 503) { setUnavailable(e.message); setMode('ea'); return; }  // steer to the EA route
  setErr(e.message);   // 409 and everything else: the typed values stay
}
```
`password` never leaves component state and never enters `patch()`.

- [ ] **Step 4: Tests, build, run it**

Run: `node --test test/new-account-pages.test.js` → PASS. `npm test` → green. `cd frontend && npm run build` → `✓ built`.

Then run it. As a Pro user, walk the prop path to `connect`, choose the EA branch and confirm the download and the WebRequest URL appear. Then start again, choose "we run the terminal", type a login that already exists on one of your own accounts and confirm the pre-check says so **before** you type a password. Then submit a real credential against a local `SYNC_CRED_KEY`-less server and confirm the 503 steers you to the EA branch with nothing written (check `SELECT count(*) FROM mt5_accounts` on the 5433 database before and after).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/accounts/steps/ConnectStep.jsx \
        frontend/src/styles/legacy/app.css test/new-account-pages.test.js
git commit -m "$(cat <<'MSG'
Build the connect step: sub-choice, credential, EA

Spec §7.4 — it asks HOW before it asks for anything secret. A page that renders
a password field before the user has chosen to give us one is asking for a
broker credential by default.

The password lives in component state and goes straight to commit() as extra.
It never touches the draft, because the draft is mirrored to sessionStorage and
any script on the origin can read that.

The login is pre-checked while the user types, debounced, and an unknown answer
says nothing at all: the unique index at commit is the real guard and a spurious
warning is worse than silence. A 409 keeps every typed value — clearing the form
on a collision makes the user retype a server name to change one digit.

The read-only note is gated on MT5 rather than printed unconditionally. The
worker checks trade_allowed on every login and deletes a credential that can
trade, so it is a checked fact for MT5 and a false promise for TradeLocker
(spec §7.6, §10 risk 1).

The EA branch renders SetupCard, so "how do I attach the EA" keeps exactly one
answer whether it is asked at creation or a month later from the accounts table.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Task 11: `upload` and `done`

**Visual conformance:** file-drop / file-picker pattern; the results-summary pattern for the dry-run counts; the terminal success page (`done`) and its primary action; skip-as-secondary-action treatment.

**Files:**
- Modify: `frontend/src/features/accounts/steps/UploadStep.jsx` `DoneStep.jsx`
- Modify: `frontend/src/styles/legacy/app.css`, `test/new-account-pages.test.js`

**Interfaces:**
- Consumes: `useFlow()`; `csvImportFlow.js` (Task 5); `importTrades` from `api.js`.

- [ ] **Step 1: Add the failing assertions**

```js
// ---- upload and done ------------------------------------------------------

test('the upload step drives the shared CSV flow rather than its own', () => {
  // Spec §8.3: extracted and shared, not copied. A second copy is how the two
  // surfaces come to disagree about what a duplicate count means.
  const src = readSrc('UploadStep.jsx');
  assert.match(src, /csvImportFlow/);
  assert.match(src, /importReducer|csvSizeVerdict/);
});

test('the upload step checks the file size before uploading it', () => {
  // The CSV rides inside a JSON body at a 12 MB limit and escaping inflates it.
  // A 413 after a long upload at the LAST step of a nine-step flow is the worst
  // possible place to discover it.
  assert.match(readSrc('UploadStep.jsx'), /csvSizeVerdict\(/);
});

test('the upload step imports into the account that was just created', () => {
  // Not into the god view. The account exists by now (the commit was at `import`),
  // and rows filed account-less would not show in the per-account view the user is
  // about to be dropped into.
  const src = readSrc('UploadStep.jsx');
  assert.match(src, /draft\.account/);
  assert.match(src, /mt5_login/, 'importTrades scopes by mt5_login, not by the row id');
});

test('the upload step is skippable, and skipping records that it was', () => {
  // The account is already real, so skipping costs nothing — but the guard needs
  // to know, or a refresh sends the user back to a step they chose to leave.
  const src = readSrc('UploadStep.jsx');
  assert.match(src, /uploadDone/);
});

test('done selects the new account before leaving', () => {
  // Spec §8.1: "Home page" must land on a dashboard already scoped to what was
  // just created, not on the god view.
  const src = readSrc('DoneStep.jsx');
  assert.match(src, /finish\(/);
});

test('neither terminal step offers a way back', () => {
  // Spec §6.2. canVisit already refuses it and prevStep returns null, but a Back
  // control rendered here would be a visible dead control.
  for (const page of ['UploadStep.jsx', 'DoneStep.jsx']) {
    assert.equal(/back\(\)/.test(readSrc(page)), false,
      `${page} renders a Back control after the account has been created`);
  }
});
```

- [ ] **Step 2: Run and confirm failure.**

- [ ] **Step 3: `UploadStep.jsx`**

`useReducer(importReducer, undefined, initialImportState)`, the same sequence `ImportTradesModal` runs, with the wizard's own markup. The account is fixed — it was just created — so there is no "import into" select:

```jsx
// The account exists (the commit was at `import`), and importTrades scopes by
// mt5_login. Rows filed account-less would be invisible in the per-account view
// the user is about to land in.
const target = draft.account?.mt5_login;
```

Size-check with `csvSizeVerdict(file.size)` before reading. Dry-run, show `previewSummary` counts plus the detected columns and warnings, confirm, then:

```jsx
patch({ uploadDone: true });
advance();
```

**Skip** does the same patch without importing. Spec §8.3: *"The step is skippable; the account is already real, so skipping costs nothing."*

No Back control (the account exists; `prevStep` returns `null`).

- [ ] **Step 4: `DoneStep.jsx`**

A success page naming the account that was created, what happens next per branch, and one primary action calling `finish()`:

| Branch | What to say next |
|---|---|
| `auto_sync` | A first sync is queued; trades appear as the terminal reads them. |
| `ea` | Attach the EA and place a trade — the account links on the first one. Link back to `/settings/accounts` for the setup card. |
| `file` | *N* trades imported (or nothing imported, if skipped). |
| `manual` | Add trades from the trade log, or import a CSV any time. |

`finish()` selects the new account and navigates to `/`. Reuse the Welcome/Done **voice** from the deleted `Onboarding.jsx` where it fits (`"You're all set"` / `"Jump into your dashboard"`) — that copy was written for this moment.

**Do not** call `completeOnboarding()` here. Decision B9 moved it to the commit, in the shell. A second call would be a redundant request whose failure has no meaning.

- [ ] **Step 5: Tests, build, run it**

Run: `node --test test/new-account-pages.test.js` → PASS. `npm test` → green. `cd frontend && npm run build` → `✓ built`.

Then run it: create a prop account on the File upload branch, import a small CSV, and confirm on `done` → Home that the dashboard is already scoped to the new account and the imported trades are visible in it. Then create another and **skip** the upload, confirming a refresh on `done` does not send you back to `upload`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/accounts/steps/UploadStep.jsx \
        frontend/src/features/accounts/steps/DoneStep.jsx \
        frontend/src/styles/legacy/app.css test/new-account-pages.test.js
git commit -m "$(cat <<'MSG'
Build the upload and done steps

The upload step drives the shared CSV flow from Task 5 with the wizard's own
markup, imports into the account that was just created (rows filed account-less
would be invisible in the view the user is about to land in), and size-checks
before uploading — a 413 at the last step of a nine-step flow is the worst place
to discover the 12 MB JSON body limit.

Skipping records uploadDone, so a refresh does not send the user back to a step
they chose to leave. Neither terminal step renders a Back control: the account
exists, prevStep returns null, and a visible dead control is worse than none.

done() selects the new account before navigating home, so the dashboard is
already scoped to what was just created rather than showing the god view.
completeOnboarding is NOT called here — it happens at the commit, so a first-run
user who closes the tab is not asked to create a second account.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---
## Task 12: The onboarding swap, and one way to create an account

**Visual conformance:** the welcome/pillars layout (the deleted `Onboarding.jsx` has the existing composition and copy — reuse the copy, re-implement the markup against the design language); skip-as-tertiary-action treatment.

This is the task the spec's decision 7 exists for: **one account-creation UI in the app.** Three add entry points collapse into one route.

**Discovered during planning — there is a THIRD add surface.** `PropChallenges.jsx` renders `<AccountFormModal mode="add">` behind a "Start New Challenge" button (two of them: an empty-state action and a header action), and `test/prop-challenges.test.js` asserts that wiring by name. It must be repointed with the other two, or deleting the add branch breaks a green test and leaves a dead button.

Four existing test files assert the world this task changes. **Every one of those assertions must be repointed, not deleted** — each is pinning a real invariant that still holds in a new shape.

**Files:**
- Create: `frontend/src/features/accounts/steps/WelcomeStep.jsx` (replacing Task 6's stub)
- Delete: `frontend/src/features/auth/Onboarding.jsx`
- Modify: `frontend/src/App.jsx` (first-run branch; drop the `Onboarding` import)
- Modify: `frontend/src/features/accounts/AccountForms.jsx` (edit-only; rename the export)
- Modify: `frontend/src/features/settings/SettingsAccounts.jsx` (two buttons → navigate)
- Modify: `frontend/src/features/prop/PropChallenges.jsx` (two buttons → navigate; drop the modal and its state)
- Modify: `frontend/src/styles/legacy/app.css` (retire the `.onb-*` rules)
- Modify: `test/settings-module.test.js`, `test/prop-challenges.test.js`, `test/design-language.test.js`, `test/onboarding.test.js`, `test/new-account-pages.test.js`

**Interfaces:**
- Consumes: `useFlow()`; `completeOnboarding` from `api.js`.
- Produces: `AccountEditModal` replaces `AccountFormModal` (same file, edit-only, no `mode` prop).

- [ ] **Step 1: Write the failing assertions**

Add to `test/new-account-pages.test.js`:

```js
// ---- one creation UI (spec §2 decision 7, §8.2) -----------------------------

test('the duplicate account form is gone for good', () => {
  // srcExists, not a path check: a `!existsSync('features/auth/Onboarding.jsx')`
  // starts passing for the wrong reason the moment the tree is reorganised,
  // because it points at a location the file would never be re-created in.
  assert.equal(srcExists('Onboarding.jsx'), false,
    "Onboarding.jsx's own copy of the account form is the duplication this change removes");
});

test('first run renders the same wizard routes, plus a catch-all to welcome', () => {
  // Spec §8.2: ONE route table, one component. The old branch mounted
  // <Route path="*"> and swallowed every URL, which would fight per-step routing.
  assert.match(app, /wizardRoutes\(/, 'the route table must be declared once and reused');
  assert.equal((app.match(/wizardRoutes\(/g) || []).length, 3,
    'declared once, called once per branch (first-run and onboarded)');
  assert.match(app, /to="\/accounts\/new\/welcome"/);
  assert.equal(/from '\.\/features\/auth\/Onboarding\.jsx'/.test(app), false,
    'the Onboarding import must go with the file');
});

test('welcome exists only on first run', () => {
  // stepsFor already enforces it; this checks the page does not also render a
  // second escape for a returning user, who reaches the wizard from Settings and
  // must not be offered "skip onboarding".
  const src = readSrc('WelcomeStep.jsx');
  assert.match(src, /firstRun|draft\.firstRun/);
});

test('the first-run escape completes onboarding with no account', () => {
  // The current "Skip for now" survives as a FIRST-RUN-ONLY escape (spec §8.2).
  // Without it a new user with no trading account yet cannot reach the app at all.
  const src = readSrc('WelcomeStep.jsx');
  assert.match(src, /completeOnboarding\(/);
});

test('every Add Account affordance in the app navigates to the wizard', () => {
  // Three surfaces used to open a dialog: Settings > Accounts (two buttons),
  // Prop OS > Challenges (two buttons), and the onboarding wizard's own form.
  for (const page of ['SettingsAccounts.jsx', 'PropChallenges.jsx']) {
    const src = readSrc(page);
    assert.match(src, /\/accounts\/new\/capital/, `${page} does not route to the wizard`);
    assert.equal(/mode="add"|mode='add'/.test(src), false, `${page} still opens an add dialog`);
  }
});

test('the edit dialog can no longer add', () => {
  const forms = readSrc('AccountForms.jsx');
  assert.match(forms, /export function AccountEditModal\(/);
  assert.equal(/AccountFormModal/.test(forms), false, 'the add-capable name must go with the branch');
  assert.equal(/mode\s*===\s*'edit'|mode\s*=\s*'add'/.test(forms), false,
    'there is one mode now, so there is no mode');
  assert.equal(/acct-kind/.test(forms), false, 'the kind radios were an add-time question only');
  assert.equal(/eaAllowed\(/.test(forms), false, 'the add-time plan gate went with the add branch');
});

test('the account label is still asked in exactly one place per surface', () => {
  // The point of the whole change: two copies of a drawdown field is how a rule
  // means one thing on first run and another afterwards. The wizard collects them
  // now; the edit dialog corrects them. Nothing collects them twice.
  const label = allSrcFiles()
    .filter((f) => /\.jsx$/.test(f))
    .filter((f) => /placeholder="[^"]*(?:Challenge #1|Account label)/.test(readSrc(f)));
  assert.equal(label.length <= 2, true, `the account-label input appears in ${label.length} files: ${label}`);
});
```

- [ ] **Step 2: Run and confirm failure.** Several of these fail; so will `settings-module.test.js` and `prop-challenges.test.js` once you start editing. Work through them in the order below.

- [ ] **Step 3: `WelcomeStep.jsx`**

Port the composition from the deleted `Onboarding.jsx`: the greeting (`Welcome, <firstName>`), the three pillars (Journal / Prop OS / Reports — **keep the copy verbatim**, it is good and it is already written), a **Get started** primary action that patches `{ welcomed: true }` and advances, and the first-run-only **Skip for now**:

```jsx
// The first-run escape. Without it a brand-new user who does not yet have a
// trading account cannot reach the app at all — and "add an account" is not a
// reasonable thing to require before someone has seen the product.
async function skip() {
  try { onOnboarded?.(await completeOnboarding()); } catch { setErr('Could not finish setup — please try again.'); }
}
```

`onOnboarded` is `setUser` from `App`; it comes through the flow context. `welcome` is only in `stepsFor` when `draft.firstRun`, so a returning user can never reach this page — but render the skip control on `draft.firstRun` anyway, because a control that completes onboarding is not something to leave reachable by a routing accident.

- [ ] **Step 4: `App.jsx` — the first-run branch**

```jsx
        {user && !user.onboarded_at ? (
          // First run renders the SAME wizard routes as everyone else (spec §8.2):
          // one route table, one component. It differs in exactly two ways — the
          // `welcome` step exists, and the commit stamps onboarded_at. The old
          // branch mounted <Route path="*"> and swallowed every URL, which would
          // fight per-step routing.
          [
            ...wizardRoutes({ accounts, reloadAccounts, setAccountId, firstRun: true, onOnboarded: setUser }),
            <Route key="first-run-catchall" path="*" element={<Navigate to="/accounts/new/welcome" replace />} />,
          ]
        ) : user ? (
```

`wizardRoutes` must therefore return an **array** of `<Route>` elements, each keyed — arrays of routes are already proven in this file by the `LEGACY_REDIRECTS` map. Do **not** return a fragment; `<Routes>` traversal of fragments works but the array form is what this codebase already relies on.

In the onboarded branch, add the same call with `firstRun: false` beside the `<Route element={<Layout …>}>` block, as a sibling.

- [ ] **Step 5: `AccountForms.jsx` — edit only**

Delete, in `AccountFormModal`:
- the `kind` state, the `acct-kind` radio block and the `acct-kind-upsell` link;
- `eaOk` / the `eaAllowed` call (the re-export from Task 1 stays — `SettingsPanels` uses it);
- the `created` state and the whole `if (created) { … }` early return with its `SetupCard`;
- the `createAccount` branch of `submit`, and the `createAccount` import;
- the `mode` prop and every `editing` conditional.

Rename the export to `AccountEditModal` and rewrite the header comment. The header currently argues for one component doing both jobs; that argument is now **wrong** and leaving it would mislead the next reader. Replace it with why there is only one job:

```jsx
// ---------------------------------------------------------------------------
// AccountEditModal — correct an existing account's label and its rules.
//
// IT NO LONGER ADDS. Creating an account is the Add Account wizard
// (/accounts/new), and it is the ONLY way: firm, product, size and phase are four
// decisions with dependencies between them, which is why the firm picked in this
// dialog's template strip was not even being saved before migration 0026. Three
// surfaces used to open this dialog in add mode — Settings > Accounts, Prop OS >
// Challenges, and the onboarding wizard's own duplicate form — and all three now
// navigate to the wizard.
//
// What stays: the template picker and the six rule fields, as a CORRECTION tool.
// A firm changes its drawdown, or a wizard answer was wrong, and this is where it
// is fixed. `kind` remains immutable after provisioning by design (see
// domain/accounts/accounts.js), so there is nothing add-time left to ask.
// ---------------------------------------------------------------------------
```

`TemplatePicker`, `PropFields`, `toPayload`, `formFrom` and `applyTemplateToForm` all **stay exported** — this dialog uses them, and `TemplatePicker` keeps the unverified products it shows today. That is pre-existing behaviour, not something this task introduces; see the Risks section.

- [ ] **Step 6: Repoint the four buttons**

`SettingsAccounts.jsx` — both actions (the card-head button and the empty-state action):
```jsx
<Button variant="primary" size="sm" render={<Link to="/accounts/new/capital" />}>
  <Plus aria-hidden="true" />
  <span>Add Account</span>
</Button>
```
Follow the `render={<Link …/>}` pattern the top bar already uses (`settings-module.test.js` asserts it there). Drop `{ mode: 'add' }` from the `form` state — it becomes `setForm(account)` for edit only — and rename the import to `AccountEditModal`.

`PropChallenges.jsx` — both "Start New Challenge" actions become the same `Link`. Delete the `addOpen` state, the `<AccountFormModal>` render and the import. Nothing else in that page changes.

- [ ] **Step 7: Retire the `.onb-*` CSS**

Delete the `.onb-screen` / `.onb-card` / `.onb-top` / `.onb-steps` / `.onb-brand` / `.onb-body` / `.onb-h` / `.onb-sub` / `.onb-pillars` / `.onb-pillar*` / `.onb-actions*` / `.onb-primary` / `.onb-ghost` / `.onb-check` / `.onb-done` rules. Grep first — `grep -n 'onb-' frontend/src` — and delete only what nothing references.

**`test/design-language.test.js` has `.onb-card` in its §6 overlays list.** Remove that entry with the rule, and add nothing in its place: the wizard is a full-bleed **page**, not a floating overlay, so §6's overlay rule does not apply to it. Say exactly that in a comment where the entry was, so the next reader does not read the removal as the rule being relaxed.

- [ ] **Step 8: Repoint the four existing test files**

**`test/settings-module.test.js`:**
- `assert.match(forms, /export function AccountFormModal\(/)` → `AccountEditModal`.
- Delete `assert.match(forms, /const editing = mode === 'edit'/)` and `assert.match(forms, /\{!editing && \(/)`, and replace the surrounding comment. In their place assert the new invariant: the dialog cannot add.
  ```js
  // One form, one job. Creating an account is the wizard (/accounts/new) and this
  // dialog corrects an existing one — `kind` is immutable after provisioning, so
  // there is nothing add-time left for it to ask.
  assert.equal(/acct-kind|createAccount\(/.test(forms), false, 'the edit dialog must not create');
  ```
- `assert.match(readSrc('Onboarding.jsx'), /from '\.\.\/accounts\/AccountForms\.jsx'/)` → the file is deleted and `readSrc` **throws**. Replace with:
  ```js
  // The onboarding wizard's own copy of these fields is GONE (spec §8.2): first
  // run renders the same Add Account wizard everyone else does, so the fields have
  // one caller each instead of three.
  assert.equal(srcExists('Onboarding.jsx'), false);
  ```
- `assert.equal((forms.match(/<SetupCard account=/g) || []).length, 2)` → **1**. `AccountEditModal` lost its copy; the second instance now lives on the wizard's `connect` step. Update the comment to say where it went, and assert it there:
  ```js
  assert.equal((forms.match(/<SetupCard account=/g) || []).length, 1, 'only EaSetupModal renders it here');
  assert.match(readSrc('ConnectStep.jsx'), /<SetupCard account=/, 'the creation-time copy moved to the wizard');
  ```
- The `'the account FIELDS still have one source of truth across three callers'` title now says something false. Rename it to `'…across its remaining callers'` and fix the comment.

**`test/prop-challenges.test.js`** — the `'Start New Challenge is an entry point to the EXISTING flow, not a fake purchase'` test. Its **point still holds**: no invented commerce, and the button goes to the app's real creation flow. Only the destination changed.
```js
test('Start New Challenge is an entry point to the EXISTING flow, not a fake purchase', () => {
  // It opens the app's own Add Account wizard. It used to open AccountFormModal in
  // add mode; creating an account is one route now (spec §2 decision 7), and a
  // challenge IS an account, so this is the same entry point at a new address.
  assert.match(page, /<span>Start New Challenge<\/span>/);
  assert.match(page, /to="\/accounts\/new\/capital"/);
  assert.equal(/AccountFormModal|setAddOpen/.test(page), false,
    'the dialog and its state must go together — a button wired to nothing is worse');
  // No invented commerce anywhere in the module.
  for (const f of [page, card, details, lifecycle, kpis]) {
    assert.ok(!/checkout|payment|razorpay|price|amount/i.test(code(f)), 'no purchase flow in this module');
  }
  assert.ok(!/Modal(?!s)/.test(code(page)), 'no second dialog invented here');
});
```
Note the last line drops the `.replace(/AccountFormModal/g, '')` that existed only to exempt the modal being removed.

**`test/onboarding.test.js`** — `needsOnboarding` is unchanged (it is server-side). Add the routing fact this task establishes:
```js
test('first run resolves to the wizard, not to a separate onboarding screen', () => {
  // The route table is now shared (spec §8.2). Asserted here as well as in
  // new-account-pages.test.js because this is the file a reader checks when asking
  // "what happens to a user with no onboarded_at".
  const app = readSrc('App.jsx');
  assert.match(app, /!user\.onboarded_at/);
  assert.match(app, /to="\/accounts\/new\/welcome"/);
  assert.equal(srcExists('Onboarding.jsx'), false);
});
```
(Add the `readSrc`/`srcExists` import from `./helpers/src-files.js`.)

- [ ] **Step 9: Full suite + build**

Run: `npm test`
Expected: all green. If anything still references `AccountFormModal` or `Onboarding.jsx`, it fails here — that is the point.

Run: `cd frontend && npm run build`
Expected: `✓ built`. **This is the task most likely to break the build** (a deleted file with a live import is exactly the MISSING_EXPORT / unresolved-import case), and CI would not catch it on the PR.

- [ ] **Step 10: Run it — both branches**

As an onboarded user: Settings → Accounts → Add Account goes to the wizard; Prop OS → Challenges → Start New Challenge goes to the wizard; the row menu's Edit still opens the edit dialog and saving still works.

Then as a first-run user (`UPDATE users SET onboarded_at = NULL WHERE email = '…'` on the 5433 database, then reload): every URL lands on `/accounts/new/welcome`; **Skip for now** completes onboarding and drops you on the dashboard; and starting again, completing the flow stamps `onboarded_at` at the **commit** — verify by closing the tab immediately after the account is created and logging in again: you should land on the dashboard, not back in the wizard.

- [ ] **Step 11: Commit**

```bash
git add -A frontend/src test/settings-module.test.js test/prop-challenges.test.js \
        test/onboarding.test.js test/design-language.test.js test/new-account-pages.test.js
git commit -m "$(cat <<'MSG'
One way to create an account, and the duplicate form is deleted

Spec §2 decision 7. Three surfaces opened an add dialog — Settings > Accounts,
Prop OS > Challenges, and Onboarding.jsx's own copy of the same fields — and all
three now navigate to /accounts/new. Onboarding.jsx is gone; first run renders
the SAME wizard routes with the welcome step in front, so there is one route
table and one component instead of a <Route path="*"> that swallowed every URL
and would have fought per-step routing.

PropChallenges was a third add surface that planning turned up, asserted by name
in prop-challenges.test.js. Its button and the dialog's state go together — a
button wired to nothing is worse than the dialog.

AccountFormModal becomes AccountEditModal. Its header used to argue for one
component doing both jobs; that argument is now wrong, and a stale rationale
misleads the next reader more than no comment would.

Four existing test files asserted the old shape. Every assertion is repointed
rather than removed: each was pinning a real invariant that still holds at a new
address. .onb-card leaves the §6 overlay list because the wizard is a page, not a
floating surface — noted in place so the removal does not read as a relaxation.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Task 13: Close the route surface, and sweep

The last task exists because two app-wide test files make claims that eleven new routes and one new stylesheet block can quietly falsify.

**Files:**
- Modify: `test/router-surface.test.js`, `test/new-account-pages.test.js`
- Modify: `frontend/src/styles/legacy/app.css` (only if the sweep finds something)

- [ ] **Step 1: Add the route-surface and a11y assertions**

To `test/router-surface.test.js`:

```js
test('the wizard is declarative routing like everything else', () => {
  // The v7 upgrade rested on this app using only the declarative router. Eleven
  // new routes are the largest addition since, so the assumption is re-checked
  // where it can be named rather than only in the app-wide sweep above.
  const shell = readSrc('features/accounts/NewAccountFlow.jsx');
  assert.equal(/createBrowserRouter|RouterProvider|useLoaderData|useFetcher/.test(shell), false,
    'the wizard must not adopt the data router — the v7 migration reasoning stops holding');
  // It navigates by <Navigate> and useNavigate, and every target is absolute,
  // which the app-wide relative-`to` test already enforces.
  assert.match(shell, /useNavigate|<Navigate/);
});
```

To `test/new-account-pages.test.js`:

```js
// ---- accessibility and the stylesheet -------------------------------------

test('every step is announced — the page changes without a page load', () => {
  // design-b-a11y.test.js establishes ONE polite live region for the app. A wizard
  // that swaps its content under a fixed header gives a screen-reader user no
  // signal that the question changed, and the URL change alone does not announce.
  const shell = readSrc('NewAccountFlow.jsx');
  assert.match(shell, /aria-live|role="status"|<h1|autoFocus|\.focus\(\)/,
    'the shell must move focus or announce on a step change');
});

test('the progress indicator is readable, not just visible', () => {
  const shell = readSrc('NewAccountFlow.jsx');
  assert.match(shell, /aria-label|aria-valuenow|Step \$\{|of \$\{/,
    'a bar with no text is silent to a screen reader');
});

test('the wizard writes only its own namespace into the stylesheet', () => {
  // The convention every module in this file follows (prop-challenges.test.js
  // asserts the same for `pc-`). A rule outside the namespace either duplicates a
  // shared system or leaks into one.
  const css = readFileSync(new URL('../frontend/src/styles/legacy/app.css', import.meta.url), 'utf8');
  const start = css.indexOf('/* ===== ADD ACCOUNT FLOW');
  assert.ok(start > -1, 'the wizard CSS block must be fenced and findable by its banner');
  const block = css.slice(start);
  for (const sel of block.match(/^\.[a-z][\w-]*/gm) || []) {
    assert.match(sel, /^\.naf-/, `${sel} is outside the wizard's namespace`);
  }
});

test('the wizard block uses tokens, never a raw colour', () => {
  const css = readFileSync(new URL('../frontend/src/styles/legacy/app.css', import.meta.url), 'utf8');
  const block = css.slice(css.indexOf('/* ===== ADD ACCOUNT FLOW'));
  const hex = block.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  assert.deepEqual(hex, [], 'components reference tokens, never raw hex — tokens.css is the rebrand surface');
});
```

(`readFileSync` and the `node:url` import are needed at the top of that file.)

- [ ] **Step 2: Run and fix whatever fails**

Run: `npm test`

Anything that fails here is a real gap in Tasks 6–12: a missing `aria-label`, a stray hex, a selector outside `.naf-`. Fix the source, not the assertion.

- [ ] **Step 3: The full sweep**

```bash
npm test
cd frontend && npm run build && cd ..
grep -rn 'onb-' frontend/src || echo 'no orphaned onboarding CSS classes'
grep -rn 'AccountFormModal' frontend/src test || echo 'no references to the removed export'
grep -rn 'TASK ' frontend/src/features/accounts || echo 'no stub markers left'
```

Each of the last three must come back empty. The `TASK` grep is the one that catches a stub that was never filled — a route rendering the word "phase" would otherwise ship.

- [ ] **Step 4: Walk all four branches end to end, on a real database**

Local Postgres on **5433**. For each, confirm the account row is correct afterwards:

```sql
SELECT id, label, capital_kind, platform, import_method, kind, product_id, firm_id, mt5_login,
       start_balance, daily_dd_pct, max_dd_pct, profit_target_pct
  FROM mt5_accounts ORDER BY id DESC LIMIT 4;
SELECT mt5_account_id, phase, status FROM challenges ORDER BY id DESC LIMIT 4;
```

| Branch | Expect |
|---|---|
| Live Capital + Manual | `capital_kind='live'`, `import_method='manual'`, `kind='manual'`, negative `mt5_login`, **no `challenges` row** |
| Prop (GFT 2-Step 25K, Phase 1) + File upload | `capital_kind='prop'`, `product_id='2step'`, `import_method='file'`, a `challenges` row with `phase='p1'`, and the rules 5 / 10 / 8 |
| Prop (unlisted firm, own rules) + Manual | `firm_id='other'`, `firm_name` as typed, `product_id='custom'`, and the drawdowns **as typed** — not 5 / 10 / 8 |
| Prop + Auto Sync | `import_method='auto_sync'`, `kind='synced'`, `mt5_login` set **at insert**, an `mt5_credentials` row, and a `sync_jobs` row with `kind='first_sync'` and `platform='mt5'` |

Then confirm the two invariants a wrong result would hide: the **live** account does **not** appear on any Prop OS surface (Overview, Accounts, Challenges, Finance) but **does** appear in the account switcher (spec §5.3), and Settings → Accounts shows its Type as the capital kind rather than "Evaluation".

- [ ] **Step 5: Commit**

```bash
git add test/router-surface.test.js test/new-account-pages.test.js frontend/src
git commit -m "$(cat <<'MSG'
Close the route surface and the stylesheet around the wizard

Two app-wide test files make claims eleven new routes can quietly falsify. The
declarative-router assumption is re-checked where it can be named rather than
only in the app-wide sweep, and the wizard's CSS block is fenced to its own
namespace with no raw hex — the convention every other module here follows,
because a rule outside the namespace either duplicates a shared system or leaks
into one.

The a11y assertions are the ones worth having: a wizard swaps its content under
a fixed header, so without moved focus or an announcement a screen-reader user
gets no signal that the question changed, and a URL change does not announce.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Risks, and what this plan does not solve

1. **A GoatFundedTrader 1-Step or Instant Funding trader has no template.** Decision B5 hides `verified: false` products, so those traders pick **Other / not listed** and type their own rules — which is correct behaviour, not a workaround, but it means the firm we know best is the firm with the thinnest coverage. **Confirming those percentages against goatfundedtrader.com and flipping the two flags is a one-line change** and it should happen before public launch. The catalog and its tests are already shaped for it.

2. **`TemplatePicker` in the edit dialog still shows unverified products.** That is pre-existing behaviour and Phase B does not change it — the owner's decision was scoped to the wizard's product step. It does mean an unverified drawdown remains reachable, one dialog deep, by a user correcting an account. **Recommendation: filter `TemplatePicker` through `wizardProducts()` too**, in its own commit, and say so in the PR. Not done here because it was not asked for.

3. **The `SYNC_CRED_KEY` pre-check.** See the open decision in Task 10. As planned, a user may type a broker password before learning the server-side route is unavailable. Nothing is written either way.

4. **The eleven pages have no behavioural coverage.** Structural and source-text assertions plus a build are what this repo's testing strategy allows, and they cannot catch a wrong render. Every UI task therefore ends in a **run it** step, and those steps are not optional.

5. **`provision_key` lives in `sessionStorage`.** It must, or a refresh-then-retry creates a second account. It is a `crypto.randomUUID()` per draft, so it is not guessable — but it is readable by any script on the origin, which for this value is an availability question (someone could burn a key) rather than a confidentiality one. The password, which is the confidentiality question, is never there.

6. **`capital_kind` still has three `NOT NULL` rule columns.** Spec §5.2's invariant is unchanged by Phase B: a future reader of `max_dd_pct` that does not filter `capital_kind` silently gets `10` for an account with no drawdown limit. `capital-kind.test.js` is what keeps that honest, and Phase B adds nothing to the risk.

7. **No ESLint.** A called-but-unimported identifier in any of these eleven pages ships as a blank page behind the error boundary, or in a route module as a per-request 500 with the suite green — which already happened on `/api/prop/finance`. The frontend build catches the *import* case (`MISSING_EXPORT` is promoted to a failure in `vite.config.js`), which is why every UI task runs it. It does not catch a bare undefined identifier. **Proposing ESLint is a separate PR** and deliberately not folded in here.

---

## Self-review against the spec

| Spec section | Covered by |
|---|---|
| §3 the flow, step counts | Task 3 (`stepsFor`, asserted at 5 and 9) |
| §4 which step writes what | Tasks 6–11, one step per row |
| §5.4 firm catalog products | Task 2 |
| §6.1 draft, `patchDraft`, no password | Task 3 + Task 6 (shell) |
| §6.2 `POST /provision`, commit points, forward-only | Task 3 (`commitStep`, `prevStep`, `canVisit`), Tasks 9 & 10 |
| §6.3 failure modes (409 / 402 / 503 / 400 / 500) | Task 4 (typed error), Task 9 (402 unreachable), Task 10 (409, 503) |
| §7.1 two catalogs | Already Phase A; Task 8 asserts the page reads the right one |
| §7.2 platform not broker, firm filter, broker free text | Task 8 |
| §7.4 the EA sub-choice | Task 10 |
| §7.5 gating at `import` | Tasks 1 and 9 |
| §7.6 read-only stays MT5-specific | Task 10 |
| §8.1 eleven routes, guard, sibling of Layout, props | Tasks 3, 6 |
| §8.2 onboarding embeds the wizard, form deleted | Task 12 |
| §8.3 file upload, shared dry-run, size check | Tasks 5, 11 |
| §8.4 transitions, reduced motion | Task 6 |
| §8.5 the Auto Sync rename | **Out of scope — Phase C** |
| §9.1–§9.8 test plan | §9.1 Task 3 · §9.2/§9.3 Task 2 · §9.4/§9.5 already Phase A · §9.6 Tasks 6, 13 · §9.7 already Phase A (`capital-kind.test.js`) · §9.8 Task 12 |
| §10 risks | Risks section above |

**Spec requirements deliberately not implemented:** §8.5 (Phase C, by the owner's scope). Nothing else in §3–§9 is unassigned.

---

## Execution

Tasks 1–5 are doc-independent and may start immediately. Tasks 6–13 are gated on `docs/design-system/DESIGN-LANGUAGE.md`.

Run this plan with **superpowers:subagent-driven-development** — one fresh subagent per task, in plan order, review between tasks, each task ending in a green `npm test` (plus `cd frontend && npm run build` wherever it touches `frontend/`) and its own commit. Open the PR `dev` → `main` at the end and hand the URL to the owner; **never self-merge to `main`.**

**Stop and ask the owner rather than:** weakening an assertion to get green; adding a test dependency (`supertest`, `jsdom`, RTL, a DB fixture); changing a backend file; touching the `verified` flags or the drawdown percentages; adding ESLint; or taking the Task 10 alternative.
