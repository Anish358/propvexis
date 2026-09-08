/* checkbox.jsx
 *
 * @design unreviewed — REOPENED 2026-09-09 (owner). It was approved on 09-07 as part of
 *   Batch 2 and is now a DIFFERENT component: it moved from @shadcn to @coss, because
 *   only the coss one has an indeterminate state. The owner has not seen the replacement,
 *   and approval is never inferred (§1) — not from the fact that its predecessor was
 *   signed off. It is on the Test page to be re-signed. See test/primitives-status.test.js.
 */

import React from 'react';
import { Checkbox as UICheckbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

/* Checkbox — PropVexis primitive.
 *
 * Renders Base UI's Checkbox through the generated component, which carries the
 * accessibility contract: the root is a real control, so it is focusable, operable with
 * Space, and exposes its state to assistive tech. The label pairs by htmlFor/id, exactly
 * as Input's does.
 *
 * IT IS NOT DECORATION. Two things in this app depend on its state being real rather
 * than styled: the credential consent gate, where an unticked box is what stops a
 * trade-capable password being submitted, and the trade log's row selection, which is
 * what a bulk action operates on. Do not swap it for a styled div.
 *
 * ── IT IS @coss NOW, AND THE REASON IS A CAPABILITY, NOT A LOOK (2026-09-09) ──────────
 *
 * `@shadcn/checkbox` HAS NO INDETERMINATE STATE. It hard-renders a `CheckIcon` in its
 * indicator and ignores children, and Base UI does not set `data-checked` when a box is
 * indeterminate — so a shadcn checkbox in a select-all position draws a TICK when nine of
 * four hundred rows are selected. That is a lie about what the bulk action will do.
 *
 * `@coss/checkbox` renders the dash itself, off `state.indeterminate`. So this is §1 step
 * 3 working exactly as written — "`@coss` only for what `@shadcn` does not ship" — and it
 * is the same argument `alert.jsx` and `progress.jsx` already run on: shadcn ships two
 * alert variants and §17 needs four, so those are coss too. A missing state is a missing
 * capability, not a preference.
 *
 * WHAT THIS COST BY BEING FOUND LATE, recorded because the process failure matters more
 * than the component. The data table was built with the indeterminate dash HAND-DRAWN in
 * its own wrapper — `data-[indeterminate]:before:` rules to fake what coss ships — and
 * the file even wrote up "the registry has no indeterminate state" as a finding. The
 * registry does. `@coss` was never searched, because the Cycle 00 brief said "the kit
 * needs almost no @coss" and that sentence was taken as a check having been done. It was
 * written about the primitives, on a different day, by someone answering a different
 * question. The owner found this, not the audit. Those rules are deleted now.
 *
 * ── THE CORNER IS 4px AND IT IS OFF THE LADDER, DELIBERATELY (2026-09-09) ─────────────
 *
 * This file used to force `rounded-sm` with an argument: "our steps are 6 / 8 / 10 / 14 /
 * 16, and a single arbitrary value is how a scale stops being one." That argument was
 * right on 09-07 and expired on 09-08, when the ladder moved up a step and `--r-sm` went
 * 6px -> 8px.
 *
 * A 16px BOX CANNOT WEAR ANY LADDER STEP. Radius clamps to half the box, so 8px on 16px
 * is a PERFECT CIRCLE — and the smallest step we have is 8px. Following the token turned
 * every tick box in the app into a radio button overnight: the filter bar, the finance
 * ledger, the journal workspace, the consent gate, the menu's tick rows, the trade log's
 * row selection. It had been approved as a rounded square the day before and nothing
 * caught it, because §6's warning about this lives in prose.
 *
 * So the tick box is the one control whose corner is a literal below the ladder, and
 * `@coss`'s own `rounded-[.25rem]` (4px) is that literal — we take what the component
 * ships rather than picking a fifth opinion. `radius-clamp.test.js` now asserts the
 * corner DRAWS on the box it sits on, for every component, computed from tokens.css at
 * test time — so the next ladder move cannot do this again silently.
 *
 * WHY A CIRCLE IS WRONG rather than merely different: a round tick box reads as a radio
 * button, and a radio button means "pick exactly one". This control means "pick any".
 *
 * ── WHAT ELSE CHANGED WITH THE REGISTRY, so it is judged rather than discovered ───────
 *
 *   · the box is `size-4.5 sm:size-4` — 18px below 640px, 16px above. Desktop is 16px,
 *     the same as before. shadcn's was a flat `size-4`.
 *   · the tick and the dash are the component's own SVG paths at `size-3.5 sm:size-3`,
 *     where shadcn used lucide's `CheckIcon`. A hair heavier stroke (3 vs lucide's 2).
 *   · it draws a 1px inner highlight (`before:shadow-*`) that shadcn does not, and a
 *     `focus-visible` ring with an offset rather than a 3px halo.
 *   · checked fills with `--color-primary` in both, so the fill colour is unchanged from
 *     what was signed off.
 */
export function Checkbox({ className, ...rest }) {
  return <UICheckbox className={className && cn(className)} {...rest} />;
}
