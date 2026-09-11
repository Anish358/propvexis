/* separator.jsx
 *
 * @design approved 2026-09-08 — owner signed off Batch 5 (Small pieces) as a family
 *   on the Test page. See test/primitives-status.test.js.
 */

import React from 'react';
import { Separator as UISeparator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

/* Separator — PropVexis primitive.
 *
 * Base UI sets the ARIA role, and marks it decorative when it carries no meaning.
 *
 * §8 IS SETTLED (2026-09-07): a divider is 1px, spans the full width of its container,
 * and is never inset. The generated component draws exactly that — `h-px w-full` — so
 * the GEOMETRY needs no correction and this file states none.
 *
 * ── THE COLOUR WAS THE WRONG STEP OF THE RAMP (owner, 2026-09-08) ─────────────────────
 *
 * The owner looked at three dividers stacked in a card and said "brighten the divider
 * lines slightly". They were right, and this is not a taste call — §4's border ramp
 * already names the token a divider takes, and this component was not using it:
 *
 *     --line-inset    #1a1a1d   a divider INSIDE a card (tab strip, footer rule)
 *     --line          #1b1b1e   A CARD'S EDGE                 <- what bg-border gave us
 *     --line-control  #252528   a pill control's edge
 *     --line-strong   #29292c   THE STANDARD VISIBLE BORDER — dashed empties, SEPARATORS
 *     --line-chip     #2d2d31   a chip's edge on a filled ground
 *
 * `bg-border` resolves through `--color-border` to `--chrome-line`, which is a CARD'S
 * EDGE on a card. A card's edge is tuned to separate the card from the page behind it,
 * which is a different job from separating two rows from each other INSIDE the card —
 * and at #1b1b1e against a #111114 card it was doing neither loudly enough to read as a
 * deliberate line. `--line-strong` is +14 on it, and the ramp's own comment names
 * separators as what the token is for.
 *
 * So this is a correction to the ramp's own intent rather than a new value: nothing is
 * invented, no token moves, and every other user of `--line-strong` (the dashed empty
 * states) already draws at this weight.
 *
 * `bg-line-strong` rather than `bg-[var(--line-strong)]`: bridge.css maps
 * `--color-line-strong`, so the utility exists and following the token means the next
 * ramp change reaches this component without an edit.
 *
 * IT STAYS CONTEXT-FREE, unlike `--color-border`. A divider inside an overlay is still a
 * divider; menus draw their own (`MenuSeparator`, at half the current surface's edge)
 * and that is the component that needed the contextual treatment, not this one. */
export function Separator({ className, ...rest }) {
  return <UISeparator className={cn('bg-line-strong', className)} {...rest} />;
}
