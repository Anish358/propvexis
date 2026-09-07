/* select.jsx
 *
 * @design unreviewed — the owner has not signed off how this LOOKS. It is not a
 *   §1 step-1 stop: reuse it in existing screens, but a redesigned screen may not
 *   adopt it until it is reviewed. See test/primitives-status.test.js.
 */

import React from 'react';
import {
  Select,
  SelectContent as UISelectContent,
  SelectItem as UISelectItem,
  SelectTrigger as UISelectTrigger,
  SelectValue as UISelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

/* Select — PropVexis primitive, over the generated `@shadcn/select` (base-rhea).
 *
 * THIS FILE WAS 250 LINES AND IS NOW TWO OVERRIDES. It is worth saying why, because the
 * reasons it gave for each of them were true when written and not one of them survived
 * (owner instruction, 2026-09-07: "I DON'T WANT YOU TO HANDBUILD ANYTHING UNTIL
 * NECESSARY. Shadcn -> CossUI -> Composition of both -> Then hand BUILD.").
 *
 * The wrapper carried, at its peak: a trigger re-skinned to look like our Input; a popup
 * re-implemented from the Base UI parts because the generated one hid its surface on an
 * inner <div>; a row rendered by hand because the generated one carried `grid`, which
 * collided with legacy CSS; the tick moved from the leading column to the trailing one;
 * `alignItemWithTrigger` forced off; and a row corner corrected from 6px to 14px.
 *
 * THE REGISTRY SHIPS ALL OF IT NOW. Re-installing the component (`shadcn add select`,
 * style base-rhea) replaced the version we had been holding since install with one
 * rewritten upstream:
 *
 *   · The trigger is `rounded-2xl border-transparent bg-input/50 h-8 text-sm` — our
 *     Input's shape, line for line, with no shadow and no hairline. The entire "the
 *     trigger has to look like an Input" override is gone. Its icon is a single chevron
 *     rather than the double one, which is what the owner's reference showed.
 *   · The panel draws `rounded-2xl bg-popover shadow-lg ring-1 ring-foreground/5` ON THE
 *     POPUP. No inner div, so nothing to reach around; §6's overlay radius and §7's
 *     elevation are what it already asks for, and it is now the SAME construction as
 *     `menu.jsx`'s panel instead of a different one. Note it is ring-drawn now, not
 *     border-drawn — §4 puts it on the alpha side of the table with the other overlays,
 *     which is where design-tokens.test.js said it would belong if this ever happened.
 *   · The row is `flex min-h-7 rounded-xl`, with `ItemText` FIRST and the indicator
 *     absolutely positioned at `right-2`. Tick trailing, 14px corner, no `grid` — the
 *     three things the hand-built row existed for — and the indicator now takes no part
 *     in layout at all, which is better than our version managed.
 *   · `alignItemWithTrigger` defaults to true, which is the behaviour the owner chose.
 *
 * So the two overrides left are the two the registry cannot know about, and both are
 * about this app's FORMS rather than about taste.
 *
 * ── WHAT THE RE-INSTALL DID THAT HAS TO BE WATCHED ────────────────────────────────────
 *
 * The CLI wrote `import { cn } from "cn"` into the generated file and installed an npm
 * package called `cn` to satisfy it. Every other generated file here imports from
 * `@/lib/utils`, which is clsx + tailwind-merge — and tailwind-merge is the mechanism by
 * which every override in this layer REPLACES a generated class instead of racing it on
 * source order. A different `cn` would have left every wrapper in the app quietly losing.
 * Import corrected, package removed, and `utility-collisions.test.js` now asserts the
 * import path across `components/ui` so the next install cannot repeat it.
 */

/* THE TRIGGER FILLS ITS CELL. The generated trigger is `w-fit` — sized to its content,
 * which is right for a toolbar and wrong for a form: the Add Account page puts two
 * pickers in a two-column grid, and content-sized triggers make the two columns different
 * widths and neither of them the column's. Our Input is `w-full`; this is the same
 * statement in the same place.
 *
 * `px-2.5` matches the Input's horizontal padding, where the generated trigger is `px-3`.
 * Two pixels, and it is the difference between a picker's value and a text box's value
 * starting on the same vertical line when the two sit in adjacent cells. */
const TRIGGER = 'w-full px-2.5';

function SelectTrigger({ className, ...rest }) {
  return <UISelectTrigger className={cn(TRIGGER, className)} {...rest} />;
}

/* THE PANEL INSETS ITS ROWS. The generated `SelectContent` puts no padding on the list:
 * the registry expects items inside a `SelectGroup`, which carries `p-1`, and every call
 * site in this app renders bare `SelectItem`s. Without this the first and last rows touch
 * the panel edge and the highlight has nothing to sit inside.
 *
 * It goes on the Popup, which is what `className` reaches here. `data-overlay-surface`
 * rides along so `--color-border` resolves to a panel's edge rather than a card's if a
 * `SelectSeparator` is ever used — the panel itself is ring-drawn and needs no border. */
function SelectPopup({ className, ...rest }) {
  return <UISelectContent className={cn('p-1', className)} data-overlay-surface="" {...rest} />;
}

export {
  Select,
  UISelectItem as SelectItem,
  SelectPopup,
  SelectTrigger,
  UISelectValue as SelectValue,
};
