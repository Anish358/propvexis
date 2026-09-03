# PropVexis Design Language — Base Rhea

**Status:** 🔒 LOCKED 2026-08-29 · rewritten from the shipped dashboard
**Foundation:** shadcn **Build Your Own** preset `b2qKmlY80`, style **Base Rhea**
**Reference implementation:** the dashboard — `features/dashboard/`,
`components/primitives/{rail,topbar,brief,kpi,account,panel,calendar}.jsx`

---

## §0 How to use this document

This is the rulebook for building the rest of the app. It was **written from the
dashboard after the dashboard was built**, so every rule below has a working
implementation you can open, and the component headers carry the reasoning this file
only summarises.

**Three things, in order, when you build a page:**

1. Read §1. It is the only section about *process*, and getting it wrong costs more
   than every other rule combined.
2. Find the closest thing the dashboard already does and copy its component. Most
   "new" surfaces are a `PanelCard` with different children.
3. If a rule here does not cover your case, that is a **design question**, not a
   licence to invent. Say so and ask.

**What is not here.** Values. Every number lives in
[`frontend/src/styles/tokens.css`](../../frontend/src/styles/tokens.css); the colour
derivation lives in [`dashboard/COLOUR-INVENTORY.md`](dashboard/COLOUR-INVENTORY.md).
One fact, one home — a number written in two places is a number that will disagree with
itself.

> **Every 🔒 rule names the test that holds it.** Documentation states intent; tests
> prevent regression. A rule with no test is a rule that will erode.

---

## §1 How UI gets built — 🔒 LOCKED

### The build order

**In this order. Stop at the first step that works.**

1. **A component that already exists** in `@/components/primitives`. That directory is
   the single component entry point for application code. Check it first.
2. **A component from a registry** — `@shadcn` (and `@coss`, configured in
   `components.json`). **shadcn is the default component system for this codebase.**
   Do not write your own Button, Card, Dialog, Dropdown, Select, Tabs, Tooltip, Sheet,
   Command, Table, Badge, Input or Sidebar. Search first with the shadcn MCP
   (`search_items_in_registries`, `view_items_in_registries`), install with
   `npx shadcn@latest add <name>`, then **customise its styling** in a wrapper.
3. **A composition of the above.** Most new components are two existing ones in a
   wrapper.
4. **Hand-written, last** — and it needs an argument in the file saying why the registry
   could not serve.

**Install under `style: base-rhea`.** The registry serves a different implementation per
style, and this project is Base UI, not Radix. `@shadcn/sidebar`'s *default* manifest
lists `radix-ui`; its `base-rhea` manifest is Base UI like everything else here. Check
the style before rejecting an item over its dependencies.

### The wrapper seam

**Generated components land in `components/ui/` and are never edited in place.** A
difference goes in a thin wrapper under `components/primitives/`, which is what
application code imports. That seam is what makes `shadcn add --overwrite` safe.

Customise by **props and utilities**, never by forking. The generated components expose
more seams than they look like they do — the sidebar takes its two widths as custom
properties on the provider, which is how the rail became 248/70px with no fork.

### Two mechanical constraints that will bite you

**A Tailwind class written outside `components/{ui,primitives}` emits NO CSS and fails
silently.** `tailwind.css` scopes `@source` to those two directories, deliberately:
scanning all of `src/` harvests candidates out of hyphenated legacy class names
(`dash-grid` → `grid`) and emits live rules that legacy markup collides with.

This is the one failure in this repo with **no error message**. It has cost real
debugging time five times:

| written in a page | what happened |
|---|---|
| `w-40` on a skeleton | rendered 36px tall and **zero wide** — reserving space, painting nothing |
| `h-7` on a skeleton line | silently kept the default height |
| `size-4` on a chevron | full-size glyph in a nav row |
| `text-right` on a table header | left-aligned header over a right-aligned column |
| `grid` anywhere | collided with legacy `.grid`, a 1012px `<table>` |

**So: a caller-supplied dimension, alignment or column template is a PROP, turned into
an inline style or a class inside the library.** `SkeletonBlock({w})`,
`PanelTableCell({align})`, `PanelTableRow({cols})` all exist for this reason.

**`hidden` does nothing when the element has an author `display`.** The UA's `[hidden]`
rule loses to any author rule, and nearly everything here is inside a flex parent.
**Conditionally render instead.**

Held by: `utility-collisions.test.js`, `nav-rail.test.js`, `dash-panels.test.js`.

### The cascade

```
layer(legacy)  →  theme  →  base  →  components  →  utilities      tokens.css: UNLAYERED
```

`styles/legacy/app.css` is the **lowest** layer, so no legacy rule can beat a Tailwind,
shadcn or `@coss` rule at any specificity with no `!important`. `tokens.css` is
**unlayered**, so token values win everywhere and stay the single rebrand surface.

Legacy CSS cannot be deleted yet — ~800 of its 1,025 classes are still live, mostly Prop
OS, the Trade Log and the Calendar page. It gets deleted **page by page** as each is
rebuilt. The `--neutral-*` and `--tint-*` tokens exist only to feed it and are fenced off
at the bottom of `tokens.css`: **do not reach for one in new work.**

---

## §2 Structure is not a visual concern — 🔒 LOCKED

Layouts, information hierarchy, user flows, interactions, responsive behaviour and
business logic **do not change for visual work.** A reskin changes the visual
implementation and nothing else.

This cuts both ways, and the second way matters more:

- Do not restructure a page because a design frame is drawn differently.
- **Do not delete a feature because the design omits it.** The prototype draws a bare
  7-column calendar; the app's week-summary column is a *feature*, so it stayed and took
  the design's vocabulary instead.

Equally: **do not build a control the product cannot honour.** The prototype's
Appearance toggle (there is no light theme) and its Lock-account button (there is no
lock action) are deliberately not built. A control that does nothing is worse than an
absent one — most of all on a banner a trader has to trust.

---

## §3 Typography — 🔒 LOCKED

- **Geist + Geist Mono**, self-hosted via `@fontsource-variable/*`. **Never the Google
  CDN** — offline-safe, no third-party request, no CSP exception.
- **Numerics are mono.** Every figure — P&L, R, drawdown, percentages, times, dates in a
  table, the clock — is `--font-mono`. Prose is `--font-sans`. Tabular figures align
  digits; mono also gives a figure the *texture* that separates data from prose, and
  this app is mostly numbers.
- **Weights: 400 / 450 / 500 / 550 / 600 / 650. Half-steps are legal.** Geist is variable
  and 550-against-500 is a real hierarchy step. **700 is brand-lockup only** and has its
  own token name (`--fw-lockup`) so it cannot be reached for by accident. Tailwind's
  `font-bold` is repointed at 650.
- **Title Case for labels. All-caps for exactly one register:** a small, muted,
  letterspaced **eyebrow** (≤12.5px) naming a column, a section or a state. Anything
  larger, darker, or in a sentence is shouting.
  The exemption list is in `typography.test.js` and each entry names what it covers —
  it fails if an exempted file stops using caps, so the list cannot quietly grow.
  Current members: the brief's column eyebrows, the rail's *Soon* badge, the meter rule
  names and the stop-trading banner's label.
- **A title must not rewrite itself.** If a control elsewhere changes what a card shows,
  the change goes in a **chip beside the title**, not in the title. ("Cumulative P&L"
  with a `USD` chip, never "Daily net cumulative P&L".)
- **Breakeven is written `BE`**, never a dash — a dash reads as missing data.
- Prose fields (the journal note) get 1.6 leading and a ~68ch measure.

Tests: `typography.test.js`, `token-bridge.test.js`, `dash-brief.test.js`.

---

## §4 Colour — 🔒 LOCKED

**The palette is zinc.** Ten of the design's greys are byte-exact Tailwind zinc steps
and the rest are interpolations between them. `components.json` still says
`baseColor: neutral` because the preset generates from neutral and the token layer
overrides it — that override is the mechanism this document exists to record.

**No raw colour anywhere.** Components reference tokens; `tokens.css` is the rebrand
surface. A hex literal in a component is a bug, with one argued exemption (§12).

### The reserved families

| Family | Means | Never means |
|---|---|---|
| **green / red** | a **trade outcome** | status, chrome, notifications, health |
| **amber → red ramp** | **risk consumption** (drawdown) | a trade result |
| **light** (`--action`) | the primary action, and "attend to this" | data |
| **brand blue** (`--accent`) | the product, links, breakeven | profit, or "good" |
| **purple** (`--ai`) | AI / insight | anything else |
| **cyan** (`--payout`) | funded-account payouts, calendar holidays | anything else |

**Green and red are trade outcomes ONLY. Never status, never chrome.** The unread
notification badge was red and is not any more: a red dot in the top bar of a trading app
spends the one colour a trader reads as *money lost* on "you have mail". If you want to
say "attend to this" in chrome, use light.

**Two greens and two reds, and the split is load-bearing:**

- `--profit` / `--loss` are **structural** — drawn on the page (a KPI figure, a gauge, a
  ring).
- `--profit-bright` / `--loss-bright` are drawn **on a tint of their own hue**, where the
  structural colour does not carry (a day cell, a table row, a chart line over its own
  area, an alert glyph).

Collapsing them is the change that quietly makes a losing day cell unreadable.

**Primary actions are LIGHT, not brand.** `--action` / `--on-action`. On a near-black
page a light fill outranks any hue, and it leaves blue free to mean "brand / link / data"
instead of competing for "the button you press".

**Brand blue splits in two.** `--accent` is a **fill**, always under a light foreground.
Read as a foreground itself it measures 2.24:1 on `--bg` and fails WCAG AA, so text and
links use `--accent-on-surface` (5.26:1). This is an accessibility override, not a
preference.

**Selection chrome is grayscale, never tinted** — `--sel-bg` (raised, on the rail) and
`--sel-well` (recessed, on a card). Those point in opposite directions and both are
correct: selected reads as raised on a dark rail and recessed on a lighter card.

**Dark is the only theme.** There is no light block and no `data-theme`; `:root` IS the
theme. The architecture that made light cheap is intact — components reference tokens, so
it returns as one re-declaring block plus a toggle. It was deleted rather than disabled
because a palette no screen is designed against and no test renders drifts out of true
silently.

**No gradients** — except the one in §12, which encodes a value.

Tests: `theme-tokens.test.js`, `token-bridge.test.js`, `design-tokens.test.js`.

---

### Surfaces — depth is a ramp, and each step means something

`#09090b → #26262b`, and the design is consistent about which depth means what.

| Token | What sits on it |
|---|---|
| `--bg` | the page |
| `--rail-bg` | the rail; a weekend/no-trade calendar cell |
| `--surface-sunken` | a card's footer strip, a meter cell, an untraded weekday |
| `--surface` | **every card** |
| `--surface-raised` | the one card that outranks the others (Net P&L) |
| `--row-bg` | a row inside a card |
| `--control-bg` | a pill control at rest |
| `--control-bg-strong` | a filled quiet button |
| `--surface-hover` | any control's or row's hover |

**A card is a thing you read; a control is a thing you press.** Do not give a control
card colours — at 92% opacity over a blurred bar, `--surface` reads as a hole.

**Lines are a ramp too**, and a divider *inside* a card must not read as loud as the
card's own edge: `--line-inset` < `--line` < `--line-control` < `--line-strong` <
`--line-chip` < `--line-selected` < `--line-hover`.

**A card border carries meaning in exactly one place:** the account card reddens its own
edge when the account is inside its stop-trading zone. Do not add a second.

---

## §5 → see §6

Radius. Several files in `components/primitives/` cite the radius rule as §5. The rule
is unchanged; only the number drifted, and the alias is recorded rather than swept
because a silent renumber is worse than a documented one.

---

## §6 Radius — assignment by surface — 🔒 LOCKED

**The scale is 5 / 6 / 10 / 12 / 14 / 99px, and 10 carries half of everything drawn.**

| Surface | Token |
|---|---|
| Cards, floating overlays (menus, popovers, modals) | `--r-2xl` (14) |
| Tiles, chips-with-content, a chart well | `--r-xl` (12) |
| Buttons, inputs, nav rows, list rows, day cells | `--r-lg` (10) |
| Small chrome, badges, menu rows | `--r-md` (6) / `--r-sm` (5) |
| Pills: badges, toggles, icon buttons, progress bars | `--r-full` (99) |

**An overlay is a card that floats**, so a menu and the card it opens over never disagree
by two pixels. `bridge.css` maps the preset's `rounded-2xl/3xl/4xl` onto `--r-2xl` — that
mapping is load-bearing and tested, because a missing one renders a popover at Tailwind's
24px beside menus at 14px.

**Chrome in the top bar is a capsule.** Everything in that bar is `--r-full` at one
height; nothing outside it uses that shape.

Test: `design-language.test.js` §6.

---

## §7 Elevation — three levels, by detachment — 🔒 LOCKED

| Level | Meaning |
|---|---|
| `--sh-1` | rests on the page (cards) |
| `--sh-2` | raised above it, page still usable behind (menus, popovers, panels) |
| `--sh-3` | blocks the page (anything with a backdrop) |

**No component writes its own elevation shadow.** The discriminator between 2 and 3 is
*blocking*, not anchoring. One allowlisted exception by name: an edge-attached drawer
casts along its edge (`.tp-panel`).

Test: `design-language.test.js` §7 — it scans the whole stylesheet for any `box-shadow`
carrying both an offset and a blur.

---

## §8 Dividers — ⬜ OPEN

Inset vs. full-width is undecided. `Separator` is `bg-border` = `--line` and pre-empts
nothing. Do not settle this in a side street.

*(`spec §8.x` in `App.jsx`, `newAccountFlow.js` and the wizard steps refers to the Add
Account spec, not to this document. Check the surrounding comment before following a
number here.)*

---

## §9 Focus — 🔒 LOCKED

The ring is **neutral** (`--accent-ring`), not brand. It is `0 0 0 Npx` — no offset, no
blur — which keeps it out of §7's business. **Every interactive element has a visible
focus state.**

---

## §10 Motion — 🔒 LOCKED

- Three durations and one easing (`--dur-fast`, `--dur`, `--dur-slow`, `--ease`). Enter
  at `--dur`, leave faster.
- **`--dur-slow` (400ms) is for a VALUE TRAVELLING, never for a surface appearing.**
  Amended 2026-09-03, owner-approved, replacing "two durations". The reason it earns a
  third number: everything else in this app animates a change of STATE, which the eye
  registers rather than follows — a colour arrives, a panel is there. A meter bar moving
  from one percentage to another is the one thing a reader has to track along a path,
  and 200ms is not long enough to follow a bar across the width of a card. Its only use
  today is the account card’s rule meters and the reload entrance below. It is NOT
  licence to slow an overlay down: an entrance taking 400ms is a surface the user is
  waiting for. Held by `test/motion.test.js`.
- **`prefers-reduced-motion` collapses durations to zero — the state change still
  happens.** A reduced-motion user gets the result instantly, never nothing.
- **Animation settles. A LOOP IS ONLY LEGAL WHILE ITS CONDITION HAS NOT.** Two things
  loop in this app and both stop the moment the state they describe resolves — that is the
  test, not a count. Amended 2026-09-03 (it read "one exception" and named only the first).

  - The **stop-trading banner breathes**, because an account 88% through its daily loss
    limit is still 88% through it a minute later, and a static red bar is something the eye
    stops seeing. It pulses a ring, not the fill, so no text reflows — and it is gated
    behind `motion-safe:`.
  - **Loading skeletons breathe**, because the app does not have the data yet and the
    pulse ends when it does. A MOTIONLESS GREY BOX SAYS "THIS AREA IS EMPTY"; a breathing
    one says "still working" — same pixels, opposite meaning, and the difference is the
    only thing telling a trader whether to wait or reload. Reported as "the dashboard
    looks blank on reload" and it was: `SkeletonBlock` painted a flat fill and nothing
    else. Opacity at 2s, slower than every settling duration on purpose — a heartbeat, not
    an event, and nineteen boxes pulsing at 400ms is a strobe.

  Anything that loops while its condition HAS settled is decoration and is forbidden.
- Once a user has dismissed something, it does not animate back.

- **THE APP ARRIVES ONCE PER BROWSER LOAD, AS A CASCADE.** Amended 2026-09-03,
  owner-approved, and it REVERSES what this section and `primitives/page-entrance.jsx`
  said the same morning: that the routed page fades as one flat block and the chrome
  paints instantly. The owner reviewed a prototype that staggers both and chose both.

  The objection the first version was built on was FREQUENCY — a dashboard opened fifteen
  times a day playing a choreography fifteen times a day, in front of the one screen whose
  job is three numbers, fast. The gate already answers it: the entrance is confined to a
  real browser load, and in this SPA every navigation between Dashboard, Prop OS and
  Settings is client-side and plays nothing. At that frequency a cascade costs nothing a
  flat fade does not.

  Two limits survive the reversal, because neither was ever about frequency:

  - **Sections arrive as WHOLE BLOCKS. No figure animates.** Calendar day cells, trade
    rows and the P&L chart line are simply there inside the section that carried them in.
    The prototype ladders all three; that half was declined. A figure animating toward its
    place is unreadable for exactly as long as the animation runs, and §10 already says
    motion carries state changes rather than decorating data.
  - **An entrance transform bars a hover transform on the same element.** The entrance
    settles on `transform: none`, so a hover transform on the same node fights it. The app
    has none today and §14 is why — hover intensifies what is already there, it does not
    move it. The prototype's lift-on-hover KPI card was declined on the same grounds.

- **AN ENTRANCE TRAVELS, AND ITS DURATION IS THE SIZE OF WHAT MOVES.** A page section or
  a piece of chrome is a large surface and takes `--dur-slow`; a row inside a list is
  small and takes `--dur`. That is the second legal use of 400ms and it does not widen the
  rule above — both are something travelling along a path. What stays forbidden is
  slowing down anything the user is WAITING ON: an overlay they just opened still enters
  at `--dur`. The distinction is what the motion answers — a click, or a page load.

  Direction is language, not decoration: **chrome enters from the left, the top bar from
  above, content upward.** Three keyframes, defined once in `bridge.css`
  (`pv-sweep-in`, `pv-drop-in`, `pv-rise-in`).

- **THE STAGGER RHYTHM: 60ms between page sections, 30ms between rail rows, 45ms between
  rows in a list, and no list sweep runs longer than ~0.45s** — cap the per-item step
  rather than the count. The rail is half the page's step on purpose: nine rows of one
  list against six different cards, and the same step would leave the rail still
  assembling after the page beside it had finished.

  These live as named constants in JS, NOT as tokens in `tokens.css`, and that is
  deliberate: no CSS rule reads them: a delay is computed per index and handed over as an
  inline `animationDelay`. A token nothing resolves would be decoration in the one file
  whose whole job is to be the single source of values. `bridge.css` owns the animation,
  the caller owns only the delay — which is also what keeps this working in pages, where
  a Tailwind utility compiles to nothing at all (§1).

- **A STAGGERED ENTRANCE MUST ZERO ITS DELAY UNDER `prefers-reduced-motion`.** The global
  reset collapses `animation-duration` and does NOT touch `animation-delay`, which leaves
  a delayed element holding `backwards` at opacity 0 for the whole of its delay and then
  snapping in — no animation and a third of a second of blank chrome, which is worse than
  the motion it replaces. `bridge.css` zeroes it for every `[data-entrance]`.

- **EVERY RE-ENTRANCE NEEDS A REMOUNT, AND THE REMOUNT IS A KEY ON THE CONTAINER.** A CSS
  animation fires once per element. A list that re-populates in place from a different
  array — Today → Week in the brief — has rows React will happily reuse, so the animation
  does not run, the list snaps to new data, and nothing errors. `key={selection}` on the
  list CONTAINER, never on the rows: the rows keep their identity, the container tears
  down, and the ladder replays from i=0. The container itself gets no entrance, so the
  card's header and divider stay anchored while its contents re-ladder.

- **AN OVERLAY ENTERS; IT DOES NOT ARRIVE.** Closed 2026-09-03, owner-approved, and it
  closes the OPEN item this section carried since it was written. A dialog, menu,
  popover or tooltip fades and scales in from 95% at `--dur`, and leaves the same way at
  `--dur-fast` — the enter/leave split at the top of this section, applied. It is not a
  page entrance and must not become one: an overlay animates because the USER OPENED IT,
  which is a state change they caused and are waiting on.

  The gap was never a missing rule. `tw-animate-css` was a dependency that nothing
  imported, so the `data-open:animate-in` classes shadcn ships on every generated overlay
  compiled to no CSS — the intent had been written down for months and simply never ran.
  `tailwind.css` imports it now; `bridge.css`’s `overlay-motion` utility carries the
  duration split, by variable precedence rather than cascade order. Held by
  `test/motion.test.js`.

  `primitives/wizard.jsx` keeps `@starting-style` and is not a contradiction: a wizard
  step is content replaced in place, with no open or closed state to drive.

---

## §11 Density and spacing — 🔒 LOCKED

8px grid: `--s-1 … --s-12`. **4px is the sole sub-8 exception**, for hairline gaps. A
value off the scale is a bug, not a nudge.

---

## §12 Data visualisation — shapes, and what each one is for — 🔒 LOCKED

**A figure alone is a fact. A figure with its shape is an answer.** Every headline metric
carries one of these, and which one is an argument, not a preference.

| Shape | For | Because |
|---|---|---|
| **Arc gauge** | a percentage of a whole (win rate, day win rate) | it points at a position on a known scale |
| **Ring** | a ratio of two quantities (profit factor) | it draws the two things the ratio is MADE of; a gauge would point at nothing |
| **Chips** | the value's parts (`75` green, `53` red) | the number's components, without a second sentence |
| **Stretched ramp bar** | risk consumption (drawdown) | see below |
| **Tinted cell** | a distribution over time (the month) | pattern needs the cells themselves to carry the sign |
| **Line + area** | a series over time (cumulative P&L) | — |

**The drawdown bar is ONE gradient stretched, not a flat fill.**
`background-size: (10000 / fill)% 100%` makes the gradient that many times wider than the
bar, so the visible slice is exactly the first `fill`% of the ramp: 30% is yellow, 62%
orange, 88% deep red, smoothly. A flat fill that switches colour at 70% and 90% teaches
the *thresholds* rather than the *trajectory*. A plain gradient without the stretch is
worse than either — the full ramp compresses into the bar and every meter ends in red
however much room is left.

**There is no green on the risk ramp at any fill.** Used drawdown is never good news,
only less bad. A green drawdown bar is the app congratulating a trader for surviving.
The one meter that fills up as *progress* — a profit target — opts out of the ramp
entirely and takes a flat `--profit-fill`, and drops the 90% wall with it.

**Draw the wall.** A risk meter marks 90% with a hairline: where "you have room" becomes
"one trade could end this". The trader should see it coming, not be told they hit it.

**NO DATA IS NOT A ZERO VALUE**, and this is the rule most likely to be broken by
accident. A ring whose base stroke is `--loss` paints itself entirely red at `share = 0`
— correct for "every trade lost", catastrophic for "you have not traded yet", which is
the state a first-time user opens the product in. Empty is a **separate input** from
zero. Likewise: a zero-length dash with a round linecap draws a **dot**, not nothing, so
every empty gauge grew a stray pip that read as a value.

**A single-series line is neutral** (`--chart-line`), not brand. A lone cumulative-P&L
line is the figures drawn as a shape; colour on a chart is reserved for series that mean
something.

**Escalation is never colour alone.** Every state carries a second encoding: a gauge's
fill is also its *angle*, a severity has a *word*, a health dot has a *glyph*, a meter
prints its *percentage*.

**⬜ OPEN — the categorical palette.** Multi-series chart colours come from the preset
(`chartColor: green`) and are adopted **provisionally**: green is this product's profit
colour, so a categorical chart in these hues can read as profit. Resolve before any
chart carries more than one category series. `--profit` and `--loss` are untouched by it
and remain the outcome colours.

Tests: `dash-layout.test.js`, `account-health.test.js`, `design-tokens.test.js`.

---

## §13 → see §14

Hover. `button.jsx` and `FilterBar.jsx` cite the hover rule as §13. See §20.

---

## §14 Hover — intensify, never introduce — 🔒 LOCKED

**Hover intensifies what the element already wears.** A hover to a brand fill is legal
only on a control already in the brand family at rest — filled *or* edged. A neutral
control hovering to a brand fill is a violation. Read literally: a control with a border
brightens the edge; a control without one fills the surface.

- **Only interactive elements respond to hover.**
- **Every hover treatment has a keyboard twin.** A row styled for `:hover` alone is
  interactive for the mouse and inert for the keyboard. Use `group-hover` **plus**
  `group-focus-within` — the brief's Clear button is the worked example, and the
  prototype's own hover-index version was pointer-only.
- **A hover affordance FADES, it does not unmount.** A list that reflows under the
  pointer is harder to click than one that does not.

Tests: `design-language.test.js` §13/§14, `dash-brief.test.js`.

---

## §15 States — 🔒 LOCKED

**Four, and every one is wired to a real condition, never to a prop.**

| State | Condition | Rule |
|---|---|---|
| **populated** | the default | — |
| **loading** | a real signal (`tradesLoading`) | see below |
| **empty** | no data at all | must not look like a bad result |
| **bad** | the same signal the component's own numbers use | never a second threshold |

**A skeleton mirrors the page, in the real card shells, at the real dimensions.** Every
placeholder sits where its content will, so nothing rearranges when data lands. A
skeleton that reserves a different *shape* from its content is the layout jump it exists
to prevent — and it will, if you hand stacked lines to a card that became a flex row.
Lines are pill-shaped (a rounded bar reads as "writing that has not arrived"); blocks
keep the radius of what they stand in for. `aria-busy` and a label go on the region.

**Say what is loading, not just that something is.** On a page with five independent
loads, a bare spinner is the difference between "the app is working" and "the app is
stuck".

**An empty state is not an error state.** See §12's "no data is not a zero value".

**Never invent a value to fill a state.** If the feed does not exist, the label says so
("Manual sync — not yet wired"), because a trader will act on a timestamp.

---

## §16 → see §10

Motion. `dialog.jsx`, `skeleton.jsx`, `loading-block.jsx`, `panel.jsx` and
`progress.jsx` cite the motion rule as §16 — and several add "skeleton fidelity is
undecided". **It is decided now: see §15.** Those comments are stale in that one
respect; the motion rule they cite is §10 and is unchanged.

---

## §17 Error vs. loss — ⬜ OPEN

The library has one `destructive` slot, meaning *a failed action*. **A losing trade is
not a destructive action.** `bridge.css` maps `destructive` → `--loss` only because
there is no other slot. Revisit; do not build on it. `alert.jsx` is the call site to
revisit when it is decided.

---

## §18 Destructive confirmation — ⬜ OPEN

There is no confirmation pattern yet. Until there is, destructive actions use the same
`confirm()` the rest of the app uses — inventing a bespoke dialog for one action would
settle a pending question in a side street.

---

## §19 Z-index — 🔒 LOCKED (order), preset-reconciled (values)

The **order** is the rule: `nav < dropdown < toast < modal`. Values live in `tokens.css`.

---

## §20 Citation index

Code comments cite sections by number. This is what each number resolves to, and the
three aliases the component library still uses.

| § | Topic | State |
|---|---|---|
| §1 | How UI gets built | 🔒 |
| §2 | Structure is not visual | 🔒 |
| §3 | Typography | 🔒 |
| §4 | Colour, and the surface ramp | 🔒 |
| §5 | *alias* → §6 Radius | — |
| §6 | Radius assignment | 🔒 |
| §7 | Elevation ladder | 🔒 |
| §8 | Dividers | ⬜ |
| §9 | Focus | 🔒 |
| §10 | Motion | 🔒 |
| §11 | Density and spacing | 🔒 |
| §12 | Data visualisation | 🔒 (categorical palette ⬜) |
| §13 | *alias* → §14 Hover | — |
| §14 | Hover | 🔒 |
| §15 | States — loading, empty, bad | 🔒 |
| §16 | *alias* → §10 Motion | — |
| §17 | Error vs. loss | ⬜ |
| §18 | Destructive confirmation | ⬜ |
| §19 | Z-index | 🔒 order |
| §20 | This index | — |
| §21 | Amending this document | — |
| §22 | Breakpoints | 🔒 |
| §23 | Iconography | 🔒 |
| §24 | Copy | 🔒 |

**Not this document.** `§9`, `§19` and `§22` inside `modal.jsx`, `tabs.jsx`,
`dialog.jsx` and `ui.jsx` cite `docs/architecture/UI-MIGRATION-PLAN.md`, which numbers
its own sections; `spec §8.x` cites the Add Account spec. Both name their file
explicitly — check the surrounding comment before following a number here.

`bridge.css` line 50 cites "DESIGN-LANGUAGE **N4**" — read as §4.

---

## §21 Amending this document

- A new **override** needs four things: the rule, the reason, the token it lives in, and
  the test that holds it. Four or it is not an override, it is a preference.
- Changing a **preset value** needs owner approval, a new preset ID, and an amendment
  here, committed together.
- Closing an **⬜ OPEN** item needs a decision recorded here and a test added in the same
  commit.
- *"It looks better"* is not a justification for anything in this file.

**Numbers are stable even when sections move.** Two hundred code comments cite this
document by §, so a section keeps its number for the life of the citation. §5, §13 and
§16 are aliases rather than reused slots for exactly that reason, and new sections take
the next free number (§23, §24) rather than renumbering what exists.

**History lives in git, not here.** This document was rewritten on 2026-08-29 to state
the rules as they now stand rather than to accumulate a record of how they got here. Why
a rule is what it is lives in the component that implements it — the headers in
`components/primitives/*.jsx` carry the arguments, including the ones that were reversed
and why.

## §22 Breakpoints — the set is CLOSED — 🔒 LOCKED

**1080 → 1920, fluid, no max-width.** A trader on a 1920 monitor gets the calendar and
the trade table at full width. Design frames are drawn at 1440; that is one point inside
the range, not the design's width.

**Three numbers, all max-width** — the app narrows out of a desktop layout rather than
building up from a phone, which is why `@theme` screens (min-width) are not used:

| px | What reorganises |
|---|---|
| 1200 | paired columns become one column |
| 1080 | the KPI row stops fitting on one line |
| 900 | the rail leaves the flow and becomes a drawer |

**A fourth number is how two sections come to reorganise at widths 24px apart** — the
user watches one column collapse, resizes 30px, and watches a different one collapse.
`utility-collisions.test.js` fails on any other value in the component library.

**900 is written in two places and they must agree:** `--breakpoint-md` in `bridge.css`
(Tailwind's `md` screen is repointed at it) and `MOBILE_BREAKPOINT` in
`hooks/use-mobile.js`. The generated Sidebar decides drawer-vs-rail in JS and paints the
desktop rail in CSS; if the two drift, then *between* the numbers the rail is a drawer
that still reserves its gap, or a rail with no way to open it — silently.

> **`--breakpoint-md` must live in a plain `@theme`, never `@theme inline`.** Declared
> inline it does not register as a screen, `md:block` is emitted by nothing, and the
> entire navigation disappears at every width. Found by grepping the served CSS.

**Prefer a content floor plus `flex-wrap` over a breakpoint** where it works: the KPI row
reflows continuously across the whole range from a `min-w` alone.

### A DESIGN IS ONE POINT IN THE RANGE, NEVER THE RANGE — 🔒 LOCKED

**Every design handed over is drawn at one width. Shipping it means making it work at
every width between 1080 and 1920, and that is part of implementing it, not a follow-up.**

A frame drawn at 1440 says nothing about 1080 or 1920, and the two ends fail in opposite
directions: the narrow end runs out of room, the wide end runs out of *reasons* — a card
that was sized to its content at 1440 becomes a band of empty surface at 1920. Both are
the implementer's to answer, and the answer is not "add a breakpoint".

**In this order. Stop at the first that works:**

1. **A content floor plus `flex-wrap`.** The row re-splits itself continuously; nothing
   snaps at one width and there is no number to keep in sync. The KPI row is the worked
   example — `[&>*]:min-w-[12.5rem] [&>*]:flex-1` and no media query at all.
2. **`minmax()` / `fr` / `auto-fit` in a grid.** Lets a track absorb the slack rather
   than being told a width. The calendar's rows are `minmax(var(--cal-cell-h), 1fr)`:
   they take whatever height the card's span gives them, at every viewport.
3. **A token re-declared at a breakpoint.** When a real size has to change, change the
   TOKEN — `--dash-card-h-md`, `--cal-cell-h` — so the whole page narrows from one
   declaration instead of a media query per component.
4. **A layout breakpoint from the closed set of three,** and only for things that
   genuinely reorganise.

**Two things a laptop must never get:** a horizontal scrollbar on the page body, and a
label truncated to nothing while the badges beside it keep their full width. If a
control cannot fit, drop its *label* (`ButtonLabel`) rather than squeezing everything.

**Verify by rendering at both ends before calling it done.** 1080 and 1920, every state.
This is the check that has caught every responsive defect in this codebase — a 0-width
skeleton, a truncated nav label, a dead 250px under a five-week month — and none of them
were visible in the source.

Test: `nav-rail.test.js`, `utility-collisions.test.js`.

---

## §23 Iconography — 🔒 LOCKED

**lucide**, declared in `components.json`. Never hand-drawn SVG paths for UI icons — a
bespoke path has to be re-tuned every time the label size changes.

Sized by the parent (`[&_svg]:size-4`), never by width/height on the icon, so a row owns
its own rhythm.

The one exemption: **national flags**, whose colours are specified by law rather than by
us. They are inline SVG with literal hex in `brief.jsx` and exempted by name. Only the
three the design specifies are drawn — inventing six more from memory is how a product
ships a wrong flag to someone's country — and **the currency code always renders beside
the flag**, so the flag is a scanning aid and never the only thing carrying which market
a row is about.

---

## §24 Copy — 🔒 LOCKED

- **Do not say the same thing twice in one card.** Two identical facts teach the reader
  that neither is worth reading. If a component renders a percentage, its footer must not
  print the percentage again.
- **A label is not a heading.** "Daily performance" over a grid of daily P&L figures is
  the app narrating itself.
- **Tabs that name themselves need no heading above them.**
- Give a figure a **unit**, not a sentence, where one will do.

---
