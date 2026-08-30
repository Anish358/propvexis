# Rhea colour inventory — 87 literals → 34 roles

Built before `tokens.css` was touched, per the implementation brief. Every hex in
`PropVexis Dashboard.dc.html` is accounted for below: it maps to an existing token,
becomes a new one, or is argued as a genuine one-off.

## The finding that collapses the list

**Ten of the prototype's greys are exact Tailwind `zinc` steps.** Not approximately —
byte-identical:

| zinc | hex | in the prototype |
|---|---|---|
| 950 | `#09090b` | the page |
| 900 | `#18181b` | icon-button hover, the "Soon" badge |
| 700 | `#3f3f46` | hover edges, the `·` separator glyph |
| 600 | `#52525b` | empty day numbers, today's ring |
| 500 | `#71717a` | eyebrow labels |
| 400 | `#a1a1aa` | **the muted text colour — 29 uses, the most-used non-white** |
| 300 | `#d4d4d8` | links, the clock, avatar ink |
| 200 | `#e4e4e7` | the brand tile, the active tab underline |
| 50 | `#fafafa` | primary text — 40 uses, the single most-used value |

The rest are **interpolations between those steps** — the Rhea style's own half-steps.
So the palette is not 87 decisions; it is one scale (zinc) plus a surface ramp and a
text ramp drawn between its stops. That is what §22 means by "Rhea uses zinc", and it
is why the mapping below is mostly *naming*, not *choosing*.

`#26262b` is the one near-miss: zinc-800 is `#27272a`. The prototype's value is used
18 times as the standard border, so the prototype wins and the token carries `#26262b`.

---

## 1 · Surfaces — 8 roles, from 20 literals

The ramp runs `#09090b → #26262b`. Each step is a *depth*, and the prototype is
consistent about which depth means what.

| Role | Value | What it is | Absorbs |
|---|---|---|---|
| `--bg` | `#09090b` | the page | — |
| `--rail-bg` | `#0b0b0d` | the rail; also a weekend/no-trade calendar cell — both "below the page" | — |
| `--surface-sunken` | `#0d0d10` | the account card's footer strip, a meter cell, a weekday no-trade cell | `#0e0e11` |
| `--surface` | `#101013` | **every card.** 17 uses | — |
| `--surface-raised` | `#111115` | the Net P&L card only — the one card that sits above the others | — |
| `--row-bg` | `#121215` | an event or alert row inside a card | — |
| `--control-bg` | `#131316` | a pill control at rest: unit toggle track, Filters, the icon buttons | `#141417` (table head, range track) |
| `--control-bg-strong` | `#16161a` | a *filled* quiet button: Sync Trades, This month, Import trades, Connect broker | `#16161b` |

**Why `--surface-raised` earns a token for one card.** The Net P&L card is `#111115`
behind a `#24242a` border where every other KPI card is `#101013` behind `#1a1a1d`.
That is the prototype saying "this is the headline", and it is the same decision the
existing `KpiCard hero` prop already encodes. One role, not a one-off.

## 2 · Hover and selection — 3 roles, from 6 literals

| Role | Value | What it is | Absorbs |
|---|---|---|---|
| `--surface-hover` | `#1a1a1e` | any control's hover | `#191920` (row hover), `#18181b` (icon-button hover) |
| `--sel-bg` | `#1c1c21` | a quiet active fill: the active rail item, count chips, the Clear button | — |
| `--sel-well` | `#17171c` | a selected account chip | — |

**`--sel-bg` and `--sel-well` point in opposite directions and both are correct.**
`#1c1c21` on the `#0b0b0d` rail is *lighter* than its ground; `#17171c` on a `#101013`
card is *darker*. Selected reads as raised on the rail and as recessed on a card. Two
roles, not one token used twice.

## 3 · Lines — 7 roles, from 11 literals

| Role | Value | What it is | Absorbs |
|---|---|---|---|
| `--line-inset` | `#17171a` | a divider *inside* a card (tab strip, footer rule) | — |
| `--line` | `#1a1a1d` | a card's edge. 16 uses | `#1c1c20` (rail + top-bar edge) |
| `--line-control` | `#232327` | a pill control's edge | `#24242a` (the Net P&L card's edge) |
| `--line-strong` | `#26262b` | **the standard visible border**: dashed empties, separators, the switcher. 18 uses | — |
| `--line-chip` | `#2a2a30` | a chip's edge on a filled ground | `#2c2c32`, `#2c2c33` |
| `--line-selected` | `#3a3a42` | the selected account chip's edge | — |
| `--line-hover` | `#3f3f46` | a hover edge; also the `·` glyph between header items | — |

## 4 · Text — 8 roles, from 14 literals

| Role | Value | What it is | Absorbs |
|---|---|---|---|
| `--text` | `#fafafa` | primary. 40 uses | — |
| `--text-body` | `#e8e8ec` | the page's base colour — what `<body>` sets | `#ededf0` (rail hover text) |
| `--text-link` | `#d4d4d8` | links, the clock, avatar ink | — |
| `--text-2` | `#c9c9d1` | table heads, a non-high-impact event name, the Clear label | `#c4c4cc`, `#b4b4bc` |
| `--muted` | `#a1a1aa` | **secondary text. 29 uses** | — |
| `--text-3` | `#8a8a93` | tertiary — descriptions, phase labels | `#7b7b84` (the currency code) |
| `--text-4` | `#71717a` | eyebrows and quiet metadata. 18 uses | `#6b6b73` (meter labels) |
| `--text-5` | `#5b5b63` | the faintest readable tier: info glyphs, axis ticks, weekday heads | `#57575f`, `#4f4f57` |
| `--text-dim` | `#52525b` | not-really-text: an empty day's number, the no-account dot | — |

## 5 · Action — 2 roles

| Role | Value | What it is |
|---|---|---|
| `--action` | `#fafafa` | the light primary fill — active unit toggle, Add prop account, active state chip |
| `--action-2` | `#e4e4e7` | the brand tile, the active tab underline, the selected account ring, `--action`'s hover |

Confirms §4's "primary actions are LIGHT, not brand" — unchanged, revalued.

## 6 · Outcomes — 9 roles, from 13 literals

§22 reverts the hues. Note the prototype uses **two greens and two reds**, and the
distinction is load-bearing.

| Role | Value | What it is |
|---|---|---|
| `--profit` | `#22c55e` | the *structural* green: gauge arcs, the profit-factor ring, the net-P&L figure |
| `--profit-bright` | `#4ade80` | the green actually drawn *on a tint*: day cells, trade rows, the chart line, chips |
| `--profit-fill` | `#16a34a` | the target meter's bar — a fill under text, so it is darker than either |
| `--profit-deep` | `#166534` | the chart's area-gradient stop |
| `--loss` | `#ef4444` | the structural red: the ring's track, the breach pulse |
| `--loss-bright` | `#f87171` | the red drawn on a tint: day cells, trade rows, the chart line, critical glyphs |
| `--loss-deep` | `#7f1d1d` | the chart's negative gradient stop, the Lock button's edge |
| `--loss-fg` | `#fecaca` | text *on* a red wash — the banner heading, a critical meter's figure |
| `--loss-fg-2` | `#fca5a5` | the second tier of that text — the banner's sentence, a critical meter's label |

Tints, which stay `color-mix` of the above rather than literals:
`rgba(20,83,45,.22)` profit day cell · `rgba(76,17,17,.22)` loss day cell ·
`rgba(69,10,10,.34)` critical alert · `rgba(127,29,29,.3)` the stop-trading banner.
Their borders `#183a26` / `#3a1b1b` / `#4c1d1d` / `#401818` / `#5c1a1a` / `#450d0d` /
`#5c1111` all fall out of the same mix and become **no new tokens**.

## 7 · The risk ramp — 5 roles, from 6 literals

The meter bar is a gradient `#facc15 → #f97316 55% → #ef4444`, stretched by `barSize`
so the visible slice shows how far up the ramp this account has climbed. That is one
idea, not three colours.

| Role | Value | What it is |
|---|---|---|
| `--risk-1` | `#facc15` | the ramp's floor |
| `--risk-2` | `#f97316` | its middle — and the label colour for a *healthy* meter |
| `--risk-3` | `#ef4444` | its top (`= --loss`) |
| `--warning` | `#f59e0b` | a gauge under 50% |
| `--warning-bright` | `#fbbf24` | a medium-impact event, a warning alert |

**One thing to flag, not fix.** A healthy daily-drawdown meter draws its percentage in
`--risk-2` *orange*, never green — because used drawdown is never good news, only less
bad. It is consistent with §4 ("green and red are trade outcomes only, never status")
and I am keeping it, but it is the kind of thing that looks like a bug in review.

## 8 · Info and OK alert rows — 4 roles

| Role | Value | What it is |
|---|---|---|
| `--info-bg` / `--info-border` | `#0f1319` / `#1e2532` | a neutral informational alert row |
| `--ok-bg` / `--ok-border` | `#0d1410` / `#16301f` | the payout-eligible alert row |

These are the only blue-tinted surfaces in the design and they are *not* brand blue —
they are a cool grey. Worth naming so nobody later "corrects" them to `--accent`.

## 9 · Genuine one-offs — 7 literals, deliberately NOT tokens

| Literal | Why it stays a literal |
|---|---|
| `#c8102e` `#0a3161` `#f5f5f5` | the US flag |
| `#012169` | the UK flag |
| `#003399` `#ffcc00` | the EU flag |
| `rgba(255,255,255,.045)` | the chart's hover column — a scrim, not a colour |

National flag colours are *specified by law*, not by us. Tokenising them would invite
a rebrand to recolour the United States. They live inline in one flag component.

---

## What this deletes

The current `tokens.css` carries a **themed-scale block** — `--neutral-1…15`,
`--tint-profit-1…11`, `--tint-loss-1…15`, `--tint-warn-1…11`, `--tint-payout-1…7`,
`--tint-ai-1…2` — 60 tokens that exist only to hold legacy CSS's exact literals so
tokenising it changed nothing. None of them appear in Rhea. They stay until legacy CSS
goes (800 of its 1,025 classes are still live), and they are explicitly *not* part of
the Rhea role set. The new roles are declared above them, and the old block is marked
as legacy-only rather than intermixed — so an agent building a new page reads one list.
