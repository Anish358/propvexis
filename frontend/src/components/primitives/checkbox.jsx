/* checkbox.jsx
 *
 * @design approved 2026-09-09 — REOPENED and RE-SIGNED the same day. It was approved on
 *   09-07, the radius ladder then turned it into a circle, and Cycle 00 gave it a third
 *   state it never had — so what shipped was not what had been signed and it went back to
 *   the Test page. The owner signed the rebuilt version on 09-09: the registry's own 5px
 *   corner (our override deleted) and the indeterminate dash. It rejoins Batch 2.
 *   See test/primitives-status.test.js.
 */

import React from 'react';
import { Checkbox as UICheckbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

/* Checkbox — PropVexis primitive.
 *
 * `@shadcn/checkbox` at base-rhea, near enough untouched. Renders Base UI's Checkbox, so
 * the root is a real control: focusable, operable with Space, and its state is exposed to
 * assistive tech. The label pairs by htmlFor/id, exactly as Input's does.
 *
 * IT IS NOT DECORATION. Two things depend on its state being real rather than styled: the
 * credential consent gate, where an unticked box is what stops a trade-capable password
 * being submitted, and the trade log's row selection, which is what a bulk action
 * operates on. Do not swap it for a styled div.
 *
 * ── @shadcn, NOT @coss — OWNER RULING 2026-09-09 ─────────────────────────────────────
 *
 * It spent a few hours on `@coss/checkbox`, because that one ships an indeterminate state
 * and shadcn's does not. The owner looked at both and chose shadcn's. The reason is the
 * one this whole layer exists to protect, and it is worth stating because it applies to
 * EVERY future coss item, not just this one:
 *
 *   **A `@coss` COMPONENT ARRIVES IN OUR COLOURS AND IN COSS'S GEOMETRY.**
 *
 * Colours are fine: coss writes semantic names — `bg-primary`, `border-input`, `ring-ring`
 * — and `bridge.css` owns those names, so they resolve to our tokens automatically. But
 * everything coss states as a LITERAL comes in as coss's own number, and on that one
 * component there were twenty-one of them against eight that resolved through the bridge:
 * a `.25rem` corner, `size-4.5`, `shadow-xs/5`, an inner highlight, and an alpha ladder in
 * steps of /24 /32 /36 /48 /64 which is not the preset's.
 *
 * `components.json` sets `"style": "base-rhea"` and the shadcn registry **serves a
 * different implementation per style**, so a shadcn item is drawn with the preset's own
 * values. The coss registry is one URL with no style parameter: one implementation, coss's
 * numbers, and its `style` item ships a whole theme of its own that we do not install.
 *
 * THIS HAS ALREADY COST US ONCE. `alert.jsx` is @coss (§17 needs four tones, shadcn ships
 * two) and the owner's verdict in Batch 3 was "too colorful (doesn't go with our theme)" —
 * the fix was dropping its surface wash and taking the tone edge from 32% to 20%. That 32%
 * was coss's alpha step arriving unchallenged. `select.jsx` went the other way for a
 * related reason and is shadcn again.
 *
 * SO THE RULE, and it is now written where the next person will hit it: @coss stays step 3
 * of §1 for a capability shadcn genuinely lacks, and every literal it brings has to be
 * argued for or replaced. A missing state is not automatically worth a foreign geometry.
 *
 * ── THE CORNER: THE OVERRIDE IS DELETED, AND IT WAS THE BUG (2026-09-09) ─────────────
 *
 * This file used to force `rounded-sm` over the registry's `rounded-[5px]`, with an
 * argument: "our steps are 6 / 8 / 10 / 14 / 16, and a single arbitrary value is how a
 * scale stops being one." It was even asked rather than tidied, and the owner was told it
 * was a knowing 1px divergence.
 *
 * THAT OVERRIDE IS WHAT DESTROYED THE CONTROL. On 2026-09-08 the ladder moved up a step
 * and `--r-sm` went 6px -> 8px. The box is 16px. **Radius clamps to half its box**, so 8px
 * on 16px is a PERFECT CIRCLE — and every tick box in the app became a radio button
 * overnight: the filter bar, the finance ledger, the journal workspace, the consent gate,
 * the menu's tick rows, the trade log's row selection.
 *
 * A 16px BOX CANNOT WEAR ANY LADDER STEP, because the smallest one we have is exactly half
 * of it. So the tick box is §6's one documented exception, and the registry's own 5px is
 * that exception — taken from the component rather than invented here, which is one fewer
 * place where our layer silently re-means shadcn. The original argument was not wrong
 * about scales; it was wrong that this box could be on one.
 *
 * `radius-clamp.test.js` now recomputes every radius in the library against the box it is
 * written on, reading the ladder out of tokens.css at test time, so the next token move
 * cannot do this again quietly.
 *
 * ── THE THIRD STATE, WHICH SHADCN DOES NOT SHIP ──────────────────────────────────────
 *
 * `@shadcn/checkbox` has no indeterminate state — checked today against the live registry,
 * and there is no example that adds one. It hard-renders a `CheckIcon` and ignores
 * children, and Base UI does not set `data-checked` when a box is indeterminate, so the
 * generated component draws a TICK for a partial selection and paints nothing at all.
 *
 * A SELECT-ALL SHOWING A TICK FOR NINE OF FOUR HUNDRED ROWS IS A LIE about what the bulk
 * action will do. So it is absorbed HERE, in the wrapper, which is what §25 prescribes and
 * what the barrel's own note prescribes for a gap in the generated layer:
 *
 *   · paint like checked, because Base UI omits `data-checked` while indeterminate
 *   · hide the tick, since the component's own Indicator renders one regardless
 *   · draw the dash as a 2px rounded bar on `before:`
 *
 * `before:` is free — the generated root spends `after:` on its enlarged hit area.
 *
 * THE DASH IS A MARK, NOT AN ICON, so §23 ("never hand-drawn SVG paths for UI icons") is
 * not in play: there is no path here, just a bar that inherits `currentColor` and scales
 * with nothing. If shadcn ever ships the state, delete this block and the tests that pin
 * it — `kit-data-table.test.js` says so where it checks for it.
 */
const INDETERMINATE = [
  // Base UI sets `data-indeterminate` and NOT `data-checked`, so the generated
  // `data-checked:*` fill rules do not fire and the box would stay empty.
  'data-[indeterminate]:border-primary data-[indeterminate]:bg-primary',
  'data-[indeterminate]:text-primary-foreground',
  // The Indicator renders whenever checked OR indeterminate, and its glyph is a tick.
  'data-[indeterminate]:[&_svg]:hidden',
  'data-[indeterminate]:before:absolute data-[indeterminate]:before:h-0.5',
  'data-[indeterminate]:before:w-2.5 data-[indeterminate]:before:rounded-full',
  'data-[indeterminate]:before:bg-current',
].join(' ');

export function Checkbox({ className, ...rest }) {
  return <UICheckbox className={cn(INDETERMINATE, className)} {...rest} />;
}
