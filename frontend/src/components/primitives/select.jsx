import React from 'react';
import { CheckIcon } from 'lucide-react';
import { Select as SelectPrimitive } from '@base-ui/react/select';
import {
  SelectTrigger as UISelectTrigger,
  SelectValue as UISelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

/* Select — PropVexis primitive, over the @coss `select`.
 *
 * WHY IT IS WRAPPED, in two parts, and both are the seam doing exactly what
 * index.js says it is for.
 *
 * 1. THE TRIGGER HAS TO LOOK LIKE AN INPUT. A form that mixes the two puts them side
 *    by side in one row — the account page has a select and a text field on the same
 *    line — and the generated trigger draws a DIFFERENT field: `border-input
 *    bg-background` with a `shadow-xs` and a hairline `before:` shadow, 36px tall,
 *    `rounded-lg`. Our Input is a filled borderless field: `bg-input/50 border-transparent
 *    rounded-2xl`, 32px tall, no shadow. Two field shapes in one row is the third visual
 *    system the design language exists to prevent, so the trigger is corrected here,
 *    once, rather than at each call site. `cn()` is tailwind-merge, so each utility
 *    REPLACES the generated one instead of racing it on specificity.
 *
 *    THE HEIGHT IS EXPLICIT BECAUSE `sm:` IS DEAD IN THIS BUILD. bridge.css clears
 *    Tailwind's min-width breakpoints (`--breakpoint-*: initial`), so the trigger's
 *    `sm:min-h-8` compiles to nothing and only its `min-h-9` survives — a select 4px
 *    taller than the input beside it, from a rule that looks responsive and is inert.
 *    Same reason the Input's own `md:text-sm` never applies and both render at
 *    `text-base`.
 *
 * 2. THE POPUP IS OURS, rendered from the Base UI primitives rather than from the
 *    generated `SelectPopup`. Not a preference: that component hardcodes its surface —
 *    `rounded-lg` with `shadow-lg/5` and two `before:` hairlines — on an inner <div>
 *    it does not expose, so there is no prop that reaches it. §6 is 🔒 LOCKED and
 *    assigns floating overlays `--r-2xl` ("an overlay is a card that floats", which is
 *    what every menu and popover in this app already draws), and §7 assigns them
 *    `--sh-2`, from the ladder, with no component writing its own. A 7px dropdown
 *    beside 13px menus is the visible cost of accepting it.
 *
 *    index.js prescribes this exact escape hatch for this exact case — "render the Base
 *    UI primitive directly in that wrapper and reuse the generated variants, rather
 *    than hand-edit generated code that the next `shadcn add` would overwrite" — which
 *    is how button.jsx already handles refs.
 *
 * 3. THE ROW CANNOT CARRY THE `grid` CLASS, and this one is not a preference either. The
 *    generated SelectItem lays itself out with `grid grid-cols-[1rem_1fr]`, and
 *    legacy/app.css declares an UNLAYERED `.grid { display: table; min-width:
 *    calc(var(--grid-cols, 11) * 92px) }` for the Trade Log. Unlayered wins over
 *    anything Tailwind emits, so every option rendered as a 1012px-wide TABLE row and
 *    dragged the whole dropdown to the full width of the viewport — measured, in a
 *    browser: `item: disp=table minW=1012px`. It cannot be fixed with a className,
 *    because a layered utility loses to that rule no matter how specific; the element
 *    has to stop carrying the name. So the row is rendered here from the Base UI parts
 *    with a FLEX layout, and the indicator sits in a fixed 1rem box that is present
 *    whether or not the row is the selected one — the reserved column the grid was for.
 *
 *    The scroll arrows are deliberately not carried over. They exist for a list taller
 *    than the viewport; `overflow-y-auto` inside `--available-height` scrolls without
 *    them, and no list in this app is long enough to need a chrome affordance for it.
 */

/* Matched to `ui/input.jsx` line for line: h-8, rounded-2xl, border-transparent,
 * bg-input/50, px-2.5, no shadow. `before:hidden` kills the generated hairline, which
 * is a shadow a component wrote for itself (§7). */
const TRIGGER = 'h-8 min-h-8 rounded-2xl border-transparent bg-input/50 px-2.5 shadow-none before:hidden';

const Select = SelectPrimitive.Root;

function SelectTrigger({ className, ...rest }) {
  return <UISelectTrigger className={cn(TRIGGER, className)} {...rest} />;
}

/* §6 overlay radius + §7 level 2 elevation, and `bg-popover` = `--surface-2`, which is
 * what menus and popovers already sit on. `z-dropdown` is the token utility from
 * bridge.css rather than the generated `z-50`: §19 fixes the ORDER of the layers, and a
 * raw 50 is outside it — the value happens to agree today and would not survive a
 * change to the scale.
 *
 * THE LIST IS NOT OPTIONAL. Dropping `Select.List` and putting the items straight in the
 * Popup renders a full-width panel pinned to the left of the viewport with the rows
 * mis-laid-out: it is the listbox container Base UI positions and scrolls, so the
 * Positioner has nothing to size against without it. Verified by screenshotting both. */
const SURFACE = [
  'min-w-(--anchor-width) rounded-2xl border border-border bg-popover shadow-2',
  'origin-(--transform-origin) text-foreground outline-none',
].join(' ');

function SelectPopup({
  className, children, side = 'bottom', sideOffset = 4, align = 'start', ...rest
}) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        className="z-dropdown select-none"
        side={side}
        sideOffset={sideOffset}
        align={align}
        // FALSE, unlike the generated default. `alignItemWithTrigger` opens the list with
        // the SELECTED row on top of the trigger, which for a field that already shows
        // its value reads as the panel jumping somewhere different each time it is
        // opened. Anchored under the field, it opens where it was left.
        alignItemWithTrigger={false}
        data-slot="select-positioner"
      >
        <SelectPrimitive.Popup className={SURFACE} data-slot="select-popup" {...rest}>
          <SelectPrimitive.List
            className={cn('max-h-(--available-height) overflow-y-auto p-1', className)}
            data-slot="select-list"
          >
            {children}
          </SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

/* Row geometry from the generated item, minus the `grid` (see 3 above): 32px rows, the
 * smaller-chrome radius §6 gives a menu row, and a neutral highlight — `bg-accent` is
 * `--surface-hover`, which is the same hover surface every menu row in the app uses. */
function SelectItem({ className, children, ...rest }) {
  return (
    <SelectPrimitive.Item
      className={cn(
        'flex min-h-8 cursor-default items-center gap-2 rounded-sm py-1 ps-2 pe-4 text-base outline-none',
        'data-highlighted:bg-accent data-highlighted:text-accent-foreground',
        'data-disabled:pointer-events-none data-disabled:opacity-64',
        className,
      )}
      data-slot="select-item"
      {...rest}
    >
      {/* The box is always here; only the tick inside it comes and goes. Rendering the
          indicator alone would left-shift every unselected label by 24px. */}
      <span className="flex size-4 shrink-0 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon aria-hidden="true" className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText className="min-w-0 truncate">{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

export {
  Select, SelectItem, SelectPopup, SelectTrigger,
  UISelectValue as SelectValue,
};
