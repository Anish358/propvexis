# PropVexis Design Language

**Status:** authored 2026-08-23 · **Foundation:** shadcn Build Your Own preset **`b2qKmlY80`** — 🔒 LOCKED 2026-08-04

## 0. What this document is

**The preset is the single source of truth.** This document does not restate it.

It exists for exactly two things:

1. **The rule about how UI gets built** (§1).
2. **A register of the intentional overrides** — the places where PropVexis
   deliberately departs from the preset, and why (§3–§14).

> **No value appears in this document unless it is an intentional override of the
> preset.** And even then, the *value* lives in
> [`frontend/src/styles/tokens.css`](../../frontend/src/styles/tokens.css) — this
> document carries the **rule**. One fact, one home. A number written in both
> places is a number that will disagree with itself.

If the preset changes, this document changes. Nothing else.

### The preset

| | |
|---|---|
| Preset ID | `b2qKmlY80` |
| Style | Base Rhea |
| Typography | Geist |
| Base colour | Neutral |
| Theme | Blue |
| Dark mode | Default |

Applied with `pnpm dlx shadcn@latest apply --preset b2qKmlY80` (Existing Project →
Full preset: components + theme + fonts). Local config:
[`frontend/components.json`](../../frontend/components.json) (`style: base-rhea`,
`baseColor: neutral`, `iconLibrary: lucide`, `tsx: false`).

The preset owns, and this document will not describe: **colours · spacing · radii ·
shadows · elevations · typography · buttons · inputs · dialogs · dropdowns · cards ·
tabs · hover states · animations · focus states.**

Changing a preset value requires owner approval + a new preset ID + a matching
amendment here, committed together.

---

## 1. How UI gets built

**In this order. Stop at the first step that works.**

1. **A component that already exists** — `@/components/primitives` is the single
   component entry point for application code. Check it first.
2. **A component from a registry** — `@coss` (configured in `components.json`,
   `https://coss.com/ui/r/{name}.json`) then `@shadcn`. Reach for these *before*
   writing anything. Use the **shadcn MCP** (`.mcp.json`, pointed at `frontend`)
   to search and view: `search_items_in_registries`, `view_items_in_registries`,
   `get_item_examples_from_registries`, and `get_add_command_for_items` for the
   install command.
3. **A composition of the above.** Most "new components" are two existing ones in
   a wrapper.
4. **Hand-written, last.** Writing a component from scratch when a registry ships
   one is the failure this section exists to prevent — the preset's styling arrives
   *through* those components, so a hand-rolled equivalent is off-foundation by
   construction.

**Generated components are not edited in place.** A generated file lands in
`frontend/src/components/ui/`; if PropVexis needs it to behave differently, the
difference goes in a thin wrapper under `frontend/src/components/primitives/`,
which is what application code imports. That seam is what makes replacing an
implementation a one-file change.

### Two mechanical constraints that are easy to trip

- **Tailwind utilities compile only under `components/ui` and
  `components/primitives`.** `frontend/src/tailwind.css` scopes `@source` to those
  two directories, deliberately: scanning all of `src/` harvests candidates out of
  hyphenated legacy class names (`dash-grid` → `grid`) and emits live rules that
  legacy markup collides with. **A Tailwind class written in a page emits no CSS
  and fails silently.** So pages are built by composing components, not by writing
  utilities in place. Widening that scope is a deliberate, reviewable change.
- **Legacy CSS is not a layer.** `tokens.css` and `styles/legacy/app.css` are
  unlayered, so they beat anything Tailwind or shadcn emits regardless of source
  order. The library can only ever *add*; it cannot outrank. The exception is
  §3–§14 below: **a 🔒 locked rule outranks the preset's default appearance**, and
  a wrapper correcting a generated component is the intended mechanism.

### Enforcement

> **Documentation states intent; tests prevent regression. A rule with no test is
> a rule that will erode.**

Every 🔒 rule below names the test that holds it. Adding a rule here without a test
is half the work.

---

## 2. Structure is not a visual concern

Layouts, information hierarchy, user flows, interactions, responsive behaviour and
business logic **do not change for visual work.** A reskin changes the visual
implementation and nothing else. This is the invariant that makes a component-by-
component migration safe.

---

# The override register

Each entry is a deliberate departure from the preset or an extension the preset has
no opinion on. Values live in `tokens.css`.

## §3 Typography — 🔒 LOCKED

- **Type scale roles are ours, not the preset's sizes.** The preset's scale is
  calibrated for marketing pages; this app is dense. The *shape* of the hierarchy
  is kept and the sizes are re-calibrated. Roles are named in `tokens.css`
  (`--fs-page-title`, `--fs-section-title`, `--fs-card-title`,
  `--fs-primary-metric`, `--fs-body`, `--fs-label`) and `bridge.css` points
  Tailwind's `text-sm`/`text-xs` at ours rather than its own defaults.
- **Weight ceiling is 600.** No 700/800 anywhere in the UI layer. Brand wordmark
  lockups are the one deliberate exception.
- **Numerics are mono** (`--font-mono`). A column of figures that does not align is
  a column you cannot scan.
- **Title Case for labels, never all-caps.** All-caps loses the tracking that makes
  it legible at label sizes.
- **Prose fields** (the journal note) get 1.6 leading and a ~68ch measure.
- **Breakeven is written `BE`**, never a dash — a dash reads as missing data.
- Tests: `typography.test.js`, `settings-module.test.js`, `day-journal.test.js`.

## §4 Colour semantics — 🔒 LOCKED

The preset ships one `--primary`. PropVexis splits it and reserves three families.

- **Brand blue splits in two.** `--accent` is a **fill**, always paired with a light
  foreground. Read as a foreground itself it measures 2.24:1 on `--bg` and fails
  WCAG AA, so text, links and chart lines use `--accent-on-surface` (5.26:1). This
  is an accessibility override, not a preference.
- **Selection chrome is grayscale, never tinted.** Active/selected states use
  `--sel-bg`/`--sel-bg-strong`. Blue is reserved for primary actions and data.
  `bridge.css` maps shadcn's `accent` (a *hover surface*, confusingly named) onto
  our neutral hover, never onto brand blue.
- **Green and red are trade outcomes only.** Never status, never chrome. Purple
  (`--ai`) is AI/insight only. Cyan (`--payout`) is funded-account payouts only.
- **Breakeven is the one place brand blue carries data meaning** — there is no
  fourth outcome to confuse it with, and a breakeven cell is never a brand
  affordance.
- **No raw colour anywhere.** Components reference tokens; `tokens.css` is the
  rebrand surface. A hex literal in a component is a bug.
- **No gradients.** Flat surfaces, generous whitespace, subtle shadows.
- **Dark is the default.** `:root` holds the dark values; the light theme
  re-declares the token layer and nothing else, so no component CSS is
  theme-aware.
- **Max-width breakpoints only.** `bridge.css` clears Tailwind's `min-width`
  breakpoints — mixing the two conventions is how responsive bugs get written.
- Tests: `theme-tokens.test.js`, `token-bridge.test.js`, `design-tokens.test.js`.

## §5 → see §6

Radius. Some files in `components/primitives/` cite this rule as §5. See the
citation index (§20).

## §6 Radius — assignment by surface — 🔒 LOCKED

**This is the one rule that routinely corrects a generated component.** The
generated Button draws `rounded-2xl`; the locked assignment gives buttons the
smaller step and reserves the card radius for cards and floating overlays.

| Surface | Token |
|---|---|
| Cards, floating overlays (menus, popovers, modals) | `--r-2xl` |
| Buttons | `--r-lg` |
| Inputs | `--r-input` |
| Badges, pills, chips | `--r-full` |
| Smaller chrome (icon buttons, menu rows) | `--r-sm` / `--r-md` |

**An overlay is a card that floats**, so a menu and the card it opens over never
disagree by two pixels. `bridge.css` maps the preset's `rounded-2xl/3xl/4xl` onto
`--r-2xl` so a generated component asking for a radius lands on our scale rather
than Tailwind's — the mapping is load-bearing and tested, because a missing one
renders a popover at Tailwind's 24px beside menus at 13px.

Test: `design-language.test.js` §6.

## §7 Elevation — three levels, by detachment — 🔒 LOCKED

| Level | Meaning |
|---|---|
| `--sh-1` | rests on the page (cards) |
| `--sh-2` | raised above it, page still usable behind (menus, popovers, filter panel) |
| `--sh-3` | blocks the page (anything with a backdrop) |

**No component writes its own elevation shadow.** The discriminator between 2 and 3
is *blocking*, not anchoring. Each level is themed for both modes — a level defined
only for dark falls back to a dark shadow on a white surface.

One allowlisted exception, by name: an **edge-attached drawer** casts along its
edge (`.tp-panel`), and the ladder has no directional variant.

Test: `design-language.test.js` §7 — it scans the whole stylesheet for any
`box-shadow` carrying both an offset and a blur.

## §8 Dividers — ⬜ OPEN

Inset vs. full-width is undecided. `Separator` is `bg-border` = `--line` and
pre-empts nothing. Do not settle this in a side street.

## §9 Focus — 🔒 LOCKED

The focus ring is **neutral** (`--accent-ring`), not brand. It is `0 0 0 Npx` — no
offset, no blur — which is what keeps it out of §7's business. Every interactive
element has a visible focus state; the preset's is kept where it applies.

## §10 Motion — 🔒 LOCKED

- Two durations and one easing, from `tokens.css` (`--dur-fast`, `--dur`,
  `--ease`). Enter at `--dur`, leave faster.
- **`prefers-reduced-motion` collapses durations to zero — the state change still
  happens.** A reduced-motion user gets the result instantly, never nothing.
- **Motion is explicitly not a foundation concern**: the preset expresses it as
  component animation, and the recipe is defined once in `bridge.css` rather than
  per component.
- Once a user has dismissed something, it does not animate back.
- Tests: `topbar-overlays.test.js`, `token-bridge.test.js`.

**Still open under this rule:** skeleton fidelity and loading-state timing
thresholds; the modal entrance animation (see `primitives/dialog.jsx`, which
records the gap rather than inventing a rule).

## §11 Density and spacing — 🔒 LOCKED

8px grid. The allowed steps are `--s-1 … --s-12`; **4px is the sole sub-8
exception**, for hairline gaps. A value off the scale is a bug, not a nudge.

## §12 Data visualisation — ⬜ PARTIALLY OPEN

- **`--profit` and `--loss` are untouched** by any chart palette and remain the
  outcome colours.
- The categorical palette comes from the preset (`chartColor: green`) and is
  **adopted provisionally**: green is this product's profit colour, so a
  categorical chart in these hues can read as profit. **This is an open item** —
  resolve before charts carry more than one category series.
- Per-category domain hues (pair / session / setup / probability / MTF) are a
  block the light theme overrides wholesale rather than through tokens.

## §13 → see §14

Hover. Some files in `components/primitives/` cite this rule as §13. See §20.

## §14 Hover — intensify, never introduce — 🔒 LOCKED

**Hover intensifies what the element already wears.** A hover to a brand fill is
legal only on a control that is *already* in the brand family at rest — filled
**or** edged. A neutral control hovering to a brand fill is a violation.

Read literally: a control with a border brightens the edge; a control without one
fills the surface.

- **Only interactive elements respond to hover.** (Owner decision.)
- **Every hover treatment has a keyboard twin.** A row styled for `:hover` alone is
  interactive for the mouse and inert for the keyboard. Base UI marks the
  arrow-key-focused item with `[data-highlighted]`; the generated menu item styles
  `focus:`, which covers pointer and keyboard alike.
- Tests: `design-language.test.js` §14, `dashboard-reskin.test.js`,
  `settings-module.test.js`, `topbar-overlays.test.js`.

## §15 Empty states — ⬜ OPEN

**Presets ship components, not states** — no registry has an empty state, because
what belongs in one is a product decision. What an empty state must contain, when
it offers an action, and how it differs from a filtered-to-nothing result are all
undecided. `primitives/empty-state.jsx` is where that decision will land.

## §16 → see §10

Motion. `primitives/dialog.jsx`, `skeleton.jsx` and `loading-block.jsx` cite the
motion rule as §16. See §20.

## §17 Error vs. loss — ⬜ OPEN

The library has one `destructive` slot, meaning *a failed action*. **A losing trade
is not a destructive action.** `bridge.css` currently maps `destructive` → `--loss`
only because there is no other slot. Revisit; do not build on it.

## §18 Destructive confirmation — ⬜ OPEN

There is no confirmation pattern yet. Until there is, destructive actions use the
same `confirm()` the rest of the app uses — inventing a bespoke dialog for one
action would settle a pending question in a side street.

## §19 Z-index — 🔒 LOCKED (order), preset-reconciled (values)

The **order** is the rule: `nav < dropdown < toast < modal`. Values live in
`tokens.css`. `--z-dropdown` was reconciled *toward* the preset (the generated
dropdown hardcodes `z-50` and accepts no className), per "the preset outranks
legacy CSS" — not toward our previous number.

---

## §20 Citation index, and three legacy aliases

Code comments cite sections by number. This is what each number means, so a
citation resolves to a section rather than to a guess.

| § | Topic | State |
|---|---|---|
| §3 | Typography | 🔒 |
| §4 | Colour semantics | 🔒 |
| §6 | Radius assignment | 🔒 |
| §7 | Elevation ladder | 🔒 |
| §8 | Dividers | ⬜ |
| §9 | Focus | 🔒 |
| §10 | Motion | 🔒 (skeleton/modal-entrance open) |
| §11 | Density and spacing | 🔒 |
| §12 | Data visualisation | ⬜ partially |
| §14 | Hover | 🔒 |
| §15 | Empty states | ⬜ |
| §17 | Error vs. loss | ⬜ |
| §18 | Destructive confirmation | ⬜ |
| §19 | Z-index | 🔒 order |

**Three legacy aliases.** `components/primitives/*` was written against an earlier
numbering and cites three rules by their old numbers. The rules are unchanged;
only the numbers drifted. Recorded rather than swept, because a silent renumber is
worse than a documented alias:

| Cited as | Means | Where |
|---|---|---|
| §5 | §6 Radius | `button.jsx`, `count-badge.jsx`, `toggle-group.jsx`, `legacy/app.css` |
| §13 | §14 Hover | `button.jsx`, `FilterBar.jsx` |
| §16 | §10 Motion | `dialog.jsx`, `skeleton.jsx`, `loading-block.jsx` |

**Not this document.** `§9`, `§19` and `§22` in `modal.jsx`, `tabs.jsx`,
`dialog.jsx` and `ui.jsx` cite **`docs/architecture/UI-MIGRATION-PLAN.md`**, which
numbers its own sections and phases. Those citations name that file explicitly;
check the surrounding comment before following a number here.

`bridge.css` line 50 cites "DESIGN-LANGUAGE **N4**" — read as §4.

---

## §21 Amending this document

- A new **override** needs: the rule, the reason, the token it lives in, and the
  test that holds it. Four things or it is not an override, it is a preference.
- A change to a **preset value** needs owner approval, a new preset ID, and an
  amendment here, committed together.
- Closing an **⬜ OPEN** item needs a decision recorded here and a test added in the
  same commit.
- *"It looks better"* is not a justification for anything in this file.
