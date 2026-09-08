# PropVexis Design Language — Base Rhea

**Status:** 🔒 LOCKED 2026-08-29 · rewritten from the shipped dashboard
· foundation re-valued 2026-09-07
**Foundation:** shadcn **Build Your Own** preset `b2qLMFPP6`, style **Base Rhea**
(supersedes `b2qKmlY80`, §21 amendment 2026-09-07)
**Reference implementation:** the dashboard — `features/dashboard/`,
`components/primitives/{rail,topbar,brief,kpi,account,panel,calendar}.jsx`,
and the owner's `PropVexis Dashboard Zinc` mockup, which the surface ramp is taken from

> **THE PRESET IS A REFERENCE, NOT A DRIVER — read this before reasoning from it.**
> Applying a preset to this project changes nothing on screen, and two independent
> mechanisms make that true:
>
> 1. **`bridge.css` overrides it.** shadcn's names are mapped onto our tokens through
>    `@theme inline`, so `--color-popover` reads `--surface-2` no matter what a preset
>    writes into `tailwind.css`.
> 2. **Its dark block cannot match.** A preset puts every dark value inside `.dark {}`.
>    Nothing in this app sets a `.dark` class — the theme travels on `data-theme`, and
>    the app is dark by default on bare `:root`. The whole block is dead CSS.
>
> So the preset ID records **where our values came from**, and it is not installed into
> `components.json`. Alignment is done by moving OUR values to match, which is the only
> lever that works. The same trap applies to any `dark:` utility inside a generated
> component: it never matches here, and it fails silently.

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

1. **A settled primitive** in `@/components/primitives` — check its *status*, below, not
   merely that a file with the name exists.
2. **`@shadcn`** — the default component system here. Never write your own Button, Card,
   Dialog, Dropdown, Select, Tabs, Tooltip, Sheet, Command, Table, Badge, Input or
   Sidebar. Search with the shadcn MCP, install, then style it in a wrapper.
3. **`@coss`** — only for what `@shadcn` does not ship. Its particle catalogue is a good
   source of composition *patterns*, but a pattern is not a reason to pull a second
   implementation of a component shadcn already has. Cite what was missing, in the file.
4. **A composition of the above** — most new components are two existing ones in a
   wrapper. A cascading filter menu is `DropdownMenu` + `Command`, both already
   installed; it is not a new registry item and never a hand-drawn popover.
5. **Hand-written, last** — with an argument in the file for why the registry could not
   serve.

**Install under `style: base-rhea`.** The registry serves a different implementation per
style, and this project is Base UI, not Radix — check the style before rejecting an item
over its dependencies.

### A primitive has two statuses, and both must be clear

| | The question | Who decides |
|---|---|---|
| `@status provisional` | Does it still render legacy `.u-*` markup? | derived — the test computes it |
| `@design unreviewed` | Has the owner signed off how it LOOKS? | **only the owner** |

**Either one makes it a redirect to step 2, not a stop.** The replacement keeps the same
export name, so no call site churns. An unreviewed primitive may stay in the screens that
already use it; a **redesigned** screen may not adopt it.

**Approval is never inferred** — not from age, not from usage, not from passing the legacy
check. `menu.jsx` passed every mechanical check and had reached **30 screens** before
anyone asked whether the owner liked it.

Held by `test/primitives-status.test.js`. Process:
`docs/architecture/PRIMITIVE-REVIEW-PLAN.md`.

### The wrapper seam

**Generated components land in `components/ui/` and are never edited in place.** A
difference goes in a thin wrapper under `components/primitives/`, which is what
application code imports — that is what makes `shadcn add --overwrite` safe. Customise by
**props and utilities**, never by forking.

### Legacy CSS: delete it, never patch it

⛔ **When a component looks wrong and the cause is a rule in `styles/legacy/app.css`, the
fix is never to edit that rule.** Delete it and move the component onto the generated one.
**The goal is removing `legacy/app.css` entirely** — every edit either moves toward zero
or is wrong.

The modal is why: it was "fixed" three times by tuning legacy values before anyone noticed
`DialogPopup` was the bare Base UI primitive and the shadcn skin had never been applied at
all. Deleting a rule often means keeping its **class** as a hook — `.modal` still has 19
descendant content rules that migrate with the screens that own them.

```
layer(legacy)  →  theme  →  base  →  components  →  utilities     tokens.css: UNLAYERED
```

Legacy is the **lowest** layer, so no legacy rule beats a Tailwind, shadcn or `@coss` rule
at any specificity, with no `!important`. `tokens.css` is **unlayered**, so token values
win everywhere and stay the single rebrand surface. The `--neutral-*` and `--tint-*`
tokens exist only to feed legacy and are fenced off at the bottom of `tokens.css`: **do
not reach for one in new work.**

### A Tailwind class outside `components/{ui,primitives}` emits NOTHING

`tailwind.css` scopes `@source` to those two directories deliberately — scanning all of
`src/` harvests candidates out of hyphenated legacy names (`dash-grid` → `grid`) and
emits rules that legacy markup then collides with.

**This is the one failure here with no error message.** It has cost real debugging time
five times:

| written in a page | what happened |
|---|---|
| `w-40` on a skeleton | 36px tall and **zero wide** — reserving space, painting nothing |
| `h-7` on a skeleton line | silently kept the default height |
| `size-4` on a chevron | full-size glyph in a nav row |
| `text-right` on a table header | left-aligned header over a right-aligned column |
| `grid` anywhere | collided with legacy `.grid`, a 1012px `<table>` |

**So a caller-supplied dimension, alignment or column template is a PROP**, turned into a
style or class inside the library — `SkeletonBlock({w})`, `PanelTableCell({align})`,
`PanelTableRow({cols})` all exist for this.

**`hidden` does nothing against an author `display`.** The UA's `[hidden]` rule loses to
any author rule, and nearly everything here is in a flex parent — **conditionally render
instead.**

Held by `utility-collisions.test.js`, `nav-rail.test.js`, `dash-panels.test.js`.

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

**The type scale is the preset's** (amended 2026-09-07): `--fs-label` **12** · `--fs-body`
**14** · `--fs-card-title` **16** · `--fs-section-title` **18** · `--fs-page-title` **24**.
`bridge.css` points Tailwind's `text-*` at these, so a registry component renders the size
it previewed at. Line-heights are Tailwind's unitless ratios and follow the sizes on their
own.

`--fs-primary-metric` **28** is the one value with no preset equivalent — it is what the
dashboard mockup draws the Net P&L at.

- **A figure fitted to a fixed cell is off the scale, and may stay there.** The calendar's
  day P&L is 15px mono inside an 82px cell and the KPI delta chip is 10px — both sized to
  a container the design fixes, not to a role. Everything that is not this or an eyebrow
  takes a role token: **43 hardcoded sizes across six primitives were moved onto the scale
  on 2026-09-07**, and a literal in a primitive should now be read as a bug.
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
- **A dialog header takes the ALERT dialog's treatment**, not the plain dialog's — title
  `text-lg` (18px) on a 28px line box, description at `--muted` (#a1a1aa), not
  `--text-2`. (Owner, 2026-09-07.) The registry styles its two confirm surfaces
  differently and `Modal` is built on the quieter one, so every dialog was 2px small with
  a line box 12px short — which reads as *density*, not as type, and was reported as
  spacing. It is not spacing: `--spacing` is 4px, Tailwind's own base, so every padding
  and gap already matches the preset exactly. The override lives in
  `primitives/dialog.jsx`, never in the bridge — `--text-2` stays the locked colour for
  labels and metadata, and a description is body copy. Held by `modal-shell.test.js`.

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

### The surface ramp

Ten depths, taken from the owner's `PropVexis Dashboard Zinc` mockup. Values live in
`tokens.css`; what is locked here is the **order** and the reason each step exists.

| | token | value |
|---|---|---|
| page | `--bg` | `#09090b` |
| rail | `--rail-bg` | `#0b0b0d` |
| a card's footer, a meter cell | `--surface-sunken` | `#0e0e11` |
| **every card** | `--surface` | `#111114` |
| the one card above the others | `--surface-raised` | `#131316` |
| a row inside a card | `--row-bg` | `#141417` |
| a pill control at rest | `--control-bg` | `#151518` |
| a filled quiet button | `--control-bg-strong` | `#19191c` |
| a row's hover **on a card** | `--surface-hover` | `#1c1c1f` |
| a quiet active fill | `--sel-bg` | `#1e1e21` |

**A ramp must climb.** An inverted pair — a "raised" card below the cards it sits on, a
"strong" fill below the quiet one — is a bug you see rather than read, and lifting a ramp
in the middle is what causes it. `design-tokens.test.js` asserts the order.

**Borders are opaque and graded, in six ascending weights:** `--line-inset` `#1a1a1d`
(a divider inside a card) → `--line` `#1b1b1e` (a card's edge) → `--line-control`
`#252528` → `--line-strong` `#29292c` → `--line-chip` `#2d2d31` → `--line-selected`
`#3d3d43`. A single translucent white edge was tried and reverted: one alpha produces one
weight that *strengthens* as the surface beneath it lightens, which is the opposite of
what six deliberate weights are for.

**The exception, and its test: an edge is opaque where we OWN THE GROUND, alpha where we
do not.** (Owner, 2026-09-07.) The revert above is about edges drawn on our own surfaces —
a card, a row, a panel, a control — where the ground is known, so the weight can and must
be tuned per surface. **A floating panel's OUTER RING is not one of those.** `ring-1` is
an outset box-shadow, painted outside the element on whatever the page happens to be
showing, so there is no ground to tune against and a frozen value is wrong in both
directions — too heavy over a dark page, too light over a bright one. Every outer ring
takes a white alpha at 10%: `--detached-line` where we write the edge ourselves, and the
generated `ring-foreground/10` where the component already writes it — the same value,
left alone rather than renamed.

**Decide this by CONSTRUCTION, not by component.** Whether a surface floats is not the
question; which property draws its edge is:

| | draws its edge with | so it takes |
|---|---|---|
| modal, menu panel, submenu, popover | an outset `ring` | the white alpha |
| select popup | a `border` | `--color-border`, contextual → `--overlay-line` |
| a card, a chip, an outline control | a `border` | the graded ramp |

A `border` sits ON the element and knows its ground. A `ring` sits outside it and does
not. Held by `design-tokens.test.js`.

*This replaced a wrong paragraph written the same day,* and the way it was wrong is the
warning. It said a menu, popover and select all "keep `--overlay-line`" and that exactly
one surface did not own its ground. In fact three of the four ring-drawn panels were
already on the preset's alpha and always had been — the modal was the exception, not the
rule. The one real divergence was the SUBMENU, forced to `--overlay-line` so that it would
"match its parent panel". Its parent was on the alpha, so the override produced the
mismatch it was written to prevent: roughly fourteen units brighter than the panel it hung
off. **Reasoning about the component instead of the property is what made both errors.**

### An overlay is not a card — 🔒 LOCKED

**A floating panel needs its own surface, its own hover and its own edge.** This is the
single most expensive mistake in this palette's history: one token was asked to serve a
`#111114` card and a `#18181b` panel at once, and that one fault made the panel, the row
highlight and the panel's edge all fail at the same time.

| | token | value | why a card's value fails |
|---|---|---|---|
| panel | `--surface-2` | `#18181b` | `--control-bg` is a pill in the top bar, not a floating surface |
| a row highlighted in it | `--overlay-hover` | `#27272a` | `--surface-hover` is +11 on a card and +4 on a panel |
| its edge | `--overlay-line` | `#2f2f33` | `--line` is +10 on a card and +3 on a panel |

`bridge.css` maps `--color-popover` and `--color-accent` here, so every generated menu,
select, combobox and command item picks them up. `--overlay-line` is applied in the
`menu`, `popover` and `select` wrappers, because the generated panels draw a bare
`border` (and `SubContent` a `ring`) that resolves to the card's edge.

**Chrome is CONTEXTUAL, and this is what stops the bug returning.** Two tokens name a
job; the surface supplies the value:

| | at `:root` (a card) | inside `[data-overlay-surface]` |
|---|---|---|
| `--chrome-line` | `--line` | `--overlay-line` |
| `--chrome-hover` | `--surface-hover` | `--overlay-hover` |
| `--chrome-line-control` | `--line-control` | `--line-chip` |

**A control's edge is contextual too, and a literal is not a fix.** `--line-control`
`#252528` is tuned to a card the same way `--line` is — +20 over `#111114`. Written as a
literal into a component it becomes +13 on a `#18181b` panel, so an outline button inside
a dialog drew a QUIETER edge than the dialog around it. The overlay value keeps the +20
the card case was tuned for (+21, at `--line-chip`), which is why it is an existing ramp
step rather than a seventh weight. Held by `design-tokens.test.js`.

This was the seventh instance of the fault above, and its shape is the warning: the
outline button's HOVER was fixed contextually and its BORDER, one property away, was
fixed with a literal on the same day. **A hard-coded token reference beats a contextual
one by never asking.** When a component names a `--line-*` or `--surface-*` step
directly, check whether it can float.

`bridge.css` points `--color-border` and `--color-accent` at them, so a **generated**
component resolves against whatever surface it actually sits on, with no wrapper override.
Any floating panel declares `data-overlay-surface` — menu, submenu, popover, select and
modal all do. **A seventh instance of this bug is an attribute you forgot, not a token you
need.**

**THE RAIL IS THE ONE NAMED EXCEPTION** (owner, 2026-09-07). It is a third ground — it
sits on `--rail-bg` (#0b0b0d), below a card — and it deliberately keeps `--surface-hover`
rather than taking a rail-relative value, so a nav row lights up harder than a row inside
a card. Navigation should answer a pointer more loudly than content does. This is a
decision, not the bug above: do not "fix" the rail onto `--chrome-hover`.

`--input-line` (`rgba(255,255,255,.15)`) is the one deliberate alpha in the palette: every
consumer reduces it further (`bg-input/30`, `/50`, `/64`), and reducing an opaque grey
darkens where an alpha lightens. Being an alpha it needs no context.

**Before adding an eleventh depth, ask which ground it sits on.** If the answer is "both",
it is two tokens.

**A card is a thing you read; a control is a thing you press.** Do not give a control card
colours — at 92% opacity over a blurred bar, `--surface` reads as a hole.

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

**A card border carries meaning in exactly one place:** the account card reddens its own
edge when the account is inside its stop-trading zone. Do not add a second.

---

**OUR SURFACE RAMP IS OURS. Compare STEPS with the preset, never hexes.** (Owner,
2026-09-07.) The ten depths come from the owner's `PropVexis Dashboard Zinc` mockup, and
the dashboard — the one page that is finished and signed off — was built against them.
The preset's are lighter throughout: its card is `#18181b` where ours is `#111114`.

This surfaces constantly and always looks like a bug: a menu panel, a badge tint, a
dropdown trigger's open fill will each read a few units off the shadcn preview, because
every alpha and every hover composites on a darker ground here. **It is not a bug and it
is not a licence to nudge a token.** When comparing against the preset, compare the STEP —
our hover is +11 over the card, theirs is +15 over theirs — and expect the absolute values
to differ.

Moving the ramp onto the preset's was considered and declined: it changes every surface in
the app, requires a new preset ID and an amendment under §21, and re-opens the locked
dashboard for review. The one page that is done would be the first casualty.

*Corollary, and the reason this is in §4 rather than a note somewhere:* three separate
"fixes" this year were literals written to close a gap that this ramp explains — the
switch's unchecked track, the submenu's ring, the outline button's border. Each was
correct against the preset's ground and wrong against ours. **Before hard-coding a value
to match a screenshot, check whether the ramp is the whole difference.**

---

## §5 → see §6

Radius. Several files in `components/primitives/` cite the radius rule as §5. The rule
is unchanged; only the number drifted, and the alias is recorded rather than swept
because a silent renumber is worse than a documented one.

---

## §6 Radius — 🔒 LOCKED

**The scale is the preset's, and so is the card — there is no exception left.**

| Component asks for | Value | Who asks |
|---|---|---|
| `rounded-sm` / `rounded-md` | **8 / 10px** | small chrome, menu rows |
| `rounded-lg` | **14px** | buttons, nav rows, list rows, day cells |
| `rounded-xl` | 14px | tiles, chips |
| `rounded-2xl` | 16px | controls — button, input, textarea, badge, menu |
| `rounded-3xl` | 24px | popovers |
| `min(--radius-4xl, 24px)` | 24px | dialogs |
| `rounded-card` | **24px** | cards, panels, KPI tiles |
| `rounded-full` | 99px | pills — toggles, icon buttons, progress bars, badges |

**The three bold values moved on 2026-09-08** and this table did not follow them for a
day. It does now. `rounded-sm/md/lg` and `rounded-card` resolve through our own
`--r-*` tokens, so they track the ladder; `rounded-xl/2xl/3xl/4xl` are the bridge's own
numbers and are deliberately fixed — see the closure note above for why that is not the
inconsistency it looks like.

**A VALUE HERE IS A CEILING, NOT A PROMISE.** Radius clamps to half the box, so on
anything under about 32px tall the number above is never what draws. A 20px badge caps
at 10px whether it asks for 16 or 99. Check the height before reading a row as a
guarantee.

### CLOSED 2026-09-09 (owner) — THE CONTROLS ARE ALREADY PILLS. DO NOT REOPEN THIS.

The amendment below left one thing open: the mockup draws controls as full pills and
this app draws them at 16px, so should the bridge move? **The question was malformed,
and the arithmetic is why.**

**A BORDER-RADIUS CANNOT EXCEED HALF THE BOX.** When the two radii on a side add up to
more than that side, the browser scales every corner down to fit (CSS Backgrounds 3,
corner overlap). Our controls are short, so their radius is capped long before any
token gets a say:

| control | height | the most the browser will draw |
|---|---|---|
| Input, Select trigger, Button | `h-8` = 32px | **16px** |
| Badge | `h-5` = 20px | **10px** |

**So 16px on a 32px control IS a pill** — exactly, not approximately. The mockup and
the app already agree; there was never a gap to close. A 99px control step would clamp
straight back to 16px and change literally nothing, and the 14px alternative differs by
two pixels on a shape that is already a semicircle at each end. The owner looked at all
three rendered side by side and could not tell them apart, which is the correct answer
rather than a failure of the pane.

**AND THE CHANGE WOULD HAVE BEEN ACTIVELY WRONG.** `--radius-2xl` is not a
"control" token. It also draws the **dropdown panel, the select panel, the textarea,
the sidebar and the skeleton** — all tall, none clamped. Moving it to 99px would have
left every control exactly as it is and turned the panels into lozenges. The token that
looks like it means "controls" means "whatever the registry put it on".

**THE RULE THIS LEAVES.** Before changing a radius token, check the HEIGHT of what
draws it. Under ~32px the token is decorative — the box decides. Judge a radius change
on the tall things it touches, because those are the only places it is visible. And
never infer a token's scope from its name.

Controls stay at 16px. Buttons stay at 14px via the wrapper. Nothing to do.

---
### AMENDED 2026-09-08 (owner) — THE LADDER MOVED UP ONE STEP

The card change below was the first half. The owner then ran the same question through a
Claude Design mockup of this dashboard and kept its result: **a softer ladder anchored on
the 24px card, one step down each level.**

| was | now | what moved |
|---|---|---|
| 6px | **8px** | smallest chrome, thin skeleton bars |
| 8px | **10px** | badges, count chips, icon buttons, menu rows |
| 10px | **14px** | buttons, nav rows, event rows, alert rows, day cells, meter cells |
| 12px | **18px** | account chips, tiles, a chart well |
| 14px | **24px** | card and section shells |
| 24px | 24px | cards — already moved |
| 99px | 99px | **pills untouched** — toggles, avatars, dots, progress tracks |

**Two rows matched our own comments almost word for word before anything moved**, which is
what made the mapping unambiguous rather than a guess: the mockup's *"10px → 14px: sidebar
nav items, brief event rows, alert rows, calendar day cells"* against `--r-lg`'s *"nav rows,
event rows, day cells"*, and its *"12px → 18px: account chips, meter cells, chart
placeholder"* against `--r-xl`'s *"account chips, tiles, a chart well"*.

**THIS IS SOFTER THAN THE PRESET, NOT EQUAL TO IT**, and the heading above still says the
scale is the preset's — so this is the exception being recorded rather than hidden. Preset
b2qLMFPP6 steps 6/8/10/14/16/24/32; this ladder is 8/10/14/18/24, and **18px is not a preset
step at all**. The owner chose it from a rendered mockup of this product rather than from a
preset table, which is the stronger of the two kinds of evidence.

**What did NOT move, and why.** The bridge's `--radius-xl/2xl/3xl/4xl` are what GENERATED
components ask for, and the mockup does not cover them — it draws buttons and inputs as full
pills where this app draws them at 16px. Moving those to match would be redesigning every
control on the strength of a mockup answering a different question. Open, not taken.

---

### AMENDED 2026-09-08 (owner) — the card takes the preset step

| Component asks for | Value | Who asks |
|---|---|---|
| `rounded-card` | 24px | **cards** — panels, KPI tiles, the Brief, the account strip |

The card was the single documented deviation: the scale was the preset's everywhere
except here, where the generated card asks for 24px and ours was pinned to 14. The owner
compared the two in the running app and kept 24. **It was also the frame's own number** —
`panel.jsx` records the Figma frame drawing these cards at 24 radius, and the page being
"scaled two steps down" from it, so the shipped 14 was the outlier rather than the intent.

**`--r-card` is surface-named, not a scale step**, because this section assigns radius BY
SURFACE: the token a card reads should say "card". Same reasoning as `--r-input`.

**`--r-2xl` stays 14px** for floating overlays and the legacy rules still reading it.
Only cards moved.

#### What the deviation taught, which outlives it

It was pinned in `primitives/card.jsx` rather than in the bridge, because `dialog.jsx`
and `alert-dialog.jsx` read the same `--radius-4xl` and capping the token would have
dragged every dialog down with it. **That decision is why the change could be tried and
kept in one line.** A deviation belongs in the wrapper that owns it, never in the bridge —
the rule survives the exception that prompted it.

#### And the reason it was invisible for so long

Five card surfaces hand-typed `rounded-[14px]` instead of reading the token, so `--r-2xl`
— documented as "CARDS" — controlled **no card at all**. Changing the token would have
changed nothing on the dashboard. **A token that names a surface must be the only way that
surface gets its value**, or the documentation is describing something that is not
happening. Twelve hand-typed radii across the dashboard primitives were replaced with
named utilities in the same change.

**Chrome in the top bar is a capsule** — everything in that bar is `--r-full` at one
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

## §8 Dividers — 🔒 LOCKED

**A divider is 1px, spans the full width of its container, and is never inset.** Inside a
padded surface it goes **full-bleed** — a negative margin cancels the padding so it
reaches both edges.

This is the preset's answer, adopted 2026-09-07, and the generated components already
draw it: `Separator` is `h-px w-full bg-border`, `DropdownMenuSeparator` is
`-mx-1 my-1 h-px bg-border/50`.

**A divider inside a surface that already has an edge is HALF that edge**, so it reads as
a division rather than a second border. In an overlay that is `--overlay-line` at 50%; in
a card it is `--line-inset`, the quietest line in the ramp.

*(`spec §8.x` in `App.jsx`, `newAccountFlow.js` and the wizard steps refers to the Add
Account spec, not to this document. Check the surrounding comment before following a
number here.)*

Test: `design-language.test.js` §8.

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

**THE ONE CARVE-OUT: an OPEN trigger takes its variant's own rule, even when that means
hover reduces it.** (Owner, 2026-09-07.) The generated variants carry both
`aria-expanded:bg-muted` and `dark:hover:bg-input/30`, and Tailwind sorts the compound
`dark:hover:` after the plain `aria-expanded:` — so hovering an `outline` or `ghost`
trigger whose menu is open makes it *quieter*, and the open state only appears once the
pointer leaves. That is this section read backwards, and we shipped an override
(`OPEN_HOVER`) to stop it.

The override was removed because it was applied to EVERY variant, and only two have an
open state at all: on `default` and `destructive` it was the only open styling there was,
and it painted a primary CTA and a destructive button a neutral `--sel-bg` for as long as
the pointer sat on one. Fixing the wrong half of that trade is what made the choice — the
owner took preset parity per variant over our stricter reading here.

So the ladder below is what each variant does, and it is not uniform:

| variant | open, pointer away |
|---|---|
| `default`, `destructive`, `link` | no rule — reads as REST |
| shadcn `secondary` (our `tinted`) | `aria-expanded:bg-secondary` — its own rest fill |
| `outline` (our `secondary`), `ghost` | `aria-expanded:bg-muted` — holds a fill |

**This is a knowing divergence from the paragraph above, not an oversight**, and it is
written here so it is not "fixed" again. An open trigger already has its feedback: the
panel hanging off it. Held by `topbar-overlays.test.js`.

Tests: `design-language.test.js` §13/§14, `dash-brief.test.js`, `topbar-overlays.test.js`.

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

## §17 System message colour — 🔒 LOCKED

**A system message may colour its GLYPH and its EDGE. It may not colour its words, and it
may not wash its surface. Inside a data surface, red and green mean money and nothing
else.**

An error the user does not notice is a worse failure than one they briefly misread. That
is why colour is spent here at all, and the licence is drawn narrowly enough to cost the
outcome colours nothing.

| May carry status colour | Must not |
|---|---|
| the **icon** of a message, at full strength | the message's **body text** |
| a **1px border** or left edge, at 32% | the surface as a **fill** — 4% is the ceiling |
| a **destructive button or menu item** — a dangerous action | **anything inside a data surface** |

**"Data surface" is the load-bearing exclusion:** a table cell, a KPI figure, a chart
mark, a calendar day, a meter fill. There, red and green are the trader's money. A system
message never appears inside one, so the two never meet at the same scale. The test the
eye applies: colour on a *glyph or an edge* reads as "the system is telling me
something"; colour on a *number* reads as "this is my money".

### The four tones

All four share one geometry — `border-<tone>/32`, `bg-<tone>/4`, glyph at full strength —
because that is what the registry generates and §1 prefers the unforked component.
Escalation is therefore carried by hue, glyph and **behaviour**, never by spending more
colour:

| Tone | Hue | Behaviour |
|---|---|---|
| `info` | `--info` | auto-dismisses; never blocks |
| `success` | `--success` | auto-dismisses; never blocks |
| `warning` | `--warning` | persists; no action required |
| `error` | `--destructive` | **persists, and is the only tone that may carry an action** |

### Red serves both money and danger — in different shades

| Token | Value | For |
|---|---|---|
| `--loss` | `#ef4444` | a **figure** — every P&L number, every chart mark |
| `--destructive` | `#ff6467` | a **glyph or label** — an error icon, a Delete item |
| `--success` | `--profit` | a success glyph. One green, never a second |
| `--info` | `--status-info` | an informational glyph |

`--destructive` is the preset's red-400 so a generated component previews truthfully
against the registry. A Delete button and a losing figure are **not** the same red, and
`design-tokens.test.js` asserts that rather than asserting a mapping.

**§4 is narrowed by this**, not overturned: never a status *fill*, never a status
*figure*. The red-dot notification badge stays banned — it was chrome, not a message.
Selection state is `--foreground` or `--accent`, never an outcome colour.

Tests: `design-tokens.test.js` — the tones resolve, success is THE green, destructive is
red and is not `--loss`, and no tone tints its own body text.


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
| §8 | Dividers | 🔒 |
| §9 | Focus | 🔒 |
| §10 | Motion | 🔒 |
| §11 | Density and spacing | 🔒 |
| §12 | Data visualisation | 🔒 (categorical palette ⬜) |
| §13 | *alias* → §14 Hover | — |
| §14 | Hover | 🔒 |
| §15 | States — loading, empty, bad | 🔒 |
| §16 | *alias* → §10 Motion | — |
| §17 | System message colour | 🔒 |
| §18 | Destructive confirmation | ⬜ |
| §19 | Z-index | 🔒 order |
| §20 | This index | — |
| §21 | Amending this document | — |
| §22 | Breakpoints | 🔒 |
| §23 | Iconography | 🔒 |
| §24 | Copy | 🔒 |
| §25 | A generated component does not arrive as previewed | 🔒 |

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

**A CHANGED DECISION REPLACES THE OLD ONE. It does not sit beside it.** (Owner,
2026-09-07.) When a rule changes, rewrite it — do not append an amendment note under the
one it supersedes. Two statements of the same rule is how a reader ends up following the
wrong one, and it has happened here: §4 carried two surface tables for a day, and the
older one was stale.

Write a separate entry only for an **exception** to a rule, or for something genuinely new
— and put it under the section it belongs to, not in a section of its own.

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

**`sm` (40rem) exists for the COMPONENT LIBRARY only** (amended 2026-09-07). App layout
still uses the three max-width numbers above and nothing else. `sm` is declared because
`--breakpoint-*: initial` had killed every `sm:` inside a generated component — see §25.

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

## §25 A generated component does not arrive as previewed — 🔒 LOCKED

**Installing a component is not the end of the job.** Our layer changes what it renders,
and none of it reports an error. Two causes, and both fail silently.

### 1. The bridge re-means shadcn's names

| it asks for | shadcn means | it gets here |
|---|---|---|
| `text-sm` / `text-xs` | 14 / 12px | **13 / 11px** |
| `text-muted-foreground` | `#a1a1aa` | **`#c9c9d1`** |
| `bg-popover`, `bg-accent`, `border` | the preset's | **ours** |

This is deliberate — it is why the app has one type scale and one palette instead of two.

### 2. Variants that can never match

A variant this app does not define compiles to **nothing**, and the component falls back
to the other half of the rule:

| variant | why it is dead | what it broke |
|---|---|---|
| a **preset's** `.dark {}` block | it is a CLASS selector, and nothing sets `.dark` | applying a preset changes nothing on screen |
| `sm:` | fixed 2026-09-07 by declaring `--breakpoint-sm` | **every component rendered its phone layout** — the alert-dialog was centred with stacked buttons |

`--breakpoint-*: initial` in `bridge.css` wipes Tailwind's defaults, so any breakpoint not
re-declared there is dead the same way.

**`dark:` itself is NOT dead** — `bridge.css` redefines it as `@custom-variant dark (&)`,
so it always matches and generated components keep their dark styling. Only a *preset's*
`.dark {}` block is unreachable, because that is a class selector rather than a variant.
Worth stating because the two look identical and the difference decides whether a value
applies.

### The rules

- **Absorb the difference in the WRAPPER, never in the bridge.** Changing a bridge
  mapping to fix one component re-sizes or re-colours every screen. `menu.jsx` carries
  five such corrections; `card.jsx` carries the radius exception.
- **When a generated component looks wrong, check this section before changing a token.**
  Most of 2026-09-07's dead ends were a value being tuned when a variant was dead.

Test: `token-bridge.test.js` pins the mappings that must never collapse — shadcn's
`accent` is a neutral hover and never our brand blue.
