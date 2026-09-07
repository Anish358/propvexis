/* select.jsx
 *
 * @design unreviewed — the owner has not signed off how this LOOKS. It is not a
 *   §1 step-1 stop: reuse it in existing screens, but a redesigned screen may not
 *   adopt it until it is reviewed. See test/primitives-status.test.js.
 */

import React from 'react';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
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
 *    THE HEIGHT IS EXPLICIT SO THE TWO CANNOT DRIFT APART — and the reason written here
 *    before was a different one, which has since expired. It read "`sm:` IS DEAD IN THIS
 *    BUILD": bridge.css cleared Tailwind's min-width breakpoints, so the trigger's
 *    `sm:min-h-8` emitted nothing, only `min-h-9` survived, and the select stood 4px
 *    taller than the input beside it. THAT IS NO LONGER TRUE. bridge.css re-declared
 *    `--breakpoint-sm: 40rem` and `--breakpoint-md: 900px` on 2026-09-07 for exactly
 *    this class of bug (the alert-dialog was stuck in its phone layout), so the
 *    generated `sm:min-h-8` and the Input's own `md:text-sm` both apply now.
 *
 *    The override stays, for a smaller reason than the one it was written for: Input
 *    sets a FIXED `h-8` and the trigger only ever sets a MINIMUM, so a tall value or a
 *    stray line-height grows one and not the other. Same number, stated the same way.
 *
 *    WHAT DID NOT SURVIVE THE EXPIRY IS THE ROW, three paragraphs down — it was written
 *    under the old paragraph, dropped the generated `sm:` steps as dead weight, and has
 *    been rendering its options at 16px under a trigger at 14px ever since the
 *    breakpoints came back. See the note on `SelectItem`.
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
 *    with a FLEX layout. The indicator TRAILS the label rather than leading it — an owner
 *    decision, and the reason the grid's reserved first column is not reproduced at all;
 *    see the note on `SelectItem`.
 *
 *    The scroll arrows ARE carried over, as of the owner's ruling that the list opens on
 *    the trigger. They were dropped while it opened downwards, where `overflow-y-auto`
 *    inside `--available-height` was the whole story and no list in this app was long
 *    enough to want an affordance. Aligned to the trigger, a long list scrolls in place
 *    instead of flipping, and the arrows are what say so. See `SelectPopup`.
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
/* `border-border` is right again: `--color-border` is contextual, and the popup declares
 * `data-overlay-surface`, so it resolves to the panel's edge. See tokens.css. */
const SURFACE = [
  'min-w-(--anchor-width) rounded-2xl border border-border bg-popover shadow-2',
  'origin-(--transform-origin) text-foreground outline-none',
].join(' ');

/* The arrows overlay the first and last rows and fade them out underneath themselves,
 * which is what tells you the list continues. Copied from the generated component with
 * two changes, both because ours sit INSIDE the surface rather than beside it: the
 * z-index is local to the popup rather than a raw 50 (§19 owns the app's layer order and
 * a bare 50 is outside it), and the inner rounding follows OUR panel radius —
 * `--radius-2xl` less the 1px border — rather than the `--radius-lg` the generated panel
 * is built on. Two constants rather than one parameterised by a data attribute: Base UI
 * does not label these by direction, and inventing an attribute it does not set is how a
 * class list silently applies to nothing. */
const SCROLL_ARROW = 'z-1 flex h-6 w-full cursor-default items-center justify-center '
  + 'before:pointer-events-none before:absolute before:inset-x-px before:h-[200%] '
  + 'before:from-50% before:from-popover [&>svg]:relative';
const SCROLL_UP = `${SCROLL_ARROW} top-0 before:top-px before:bg-linear-to-b `
  + 'before:rounded-t-[calc(var(--radius-2xl)-1px)]';
const SCROLL_DOWN = `${SCROLL_ARROW} bottom-0 before:bottom-px before:bg-linear-to-t `
  + 'before:rounded-b-[calc(var(--radius-2xl)-1px)]';

/* THE LIST OPENS OVER THE FIELD (owner, 2026-09-07 — reversing my own call).
 *
 * This read `alignItemWithTrigger={false}`, against the library's default, with the
 * argument that a panel which lands somewhere different depending on what is selected
 * reads as the panel jumping. The owner reviewed both on the Test page and chose the
 * library's behaviour — the selected row settles ON the trigger, the way a native
 * dropdown does — so the override is DELETED rather than re-valued. It was mine, not a
 * constraint, and it was the biggest of the differences from the shipped component.
 *
 * WHAT COMES BACK WITH IT, and neither is optional in this mode:
 *
 *   · THE SCROLL ARROWS. They exist FOR this mode: aligned to the trigger, a list longer
 *     than the space above or below it is scrolled in place rather than flipped, and the
 *     arrows are the only thing that says so. They were dropped when the panel opened
 *     downwards, where `overflow-y-auto` inside `--available-height` was the whole story.
 *     Base UI renders each one only when that direction can actually scroll, so a short
 *     list is unchanged. They sit INSIDE our surface rather than beside it — the
 *     generated component puts them next to an inner <div> it never exposes, which is the
 *     div we cannot reach and the reason this popup is hand-built at all.
 *   · THE ROW'S `side=none` WIDTH. Aligned to the trigger, the positioner reports
 *     `data-side="none"`, and the generated row widens itself by 1.25rem so the panel
 *     overhangs the field by 10px a side. Without it the panel is exactly the trigger's
 *     width and the rows sit tight against the edge. It is arithmetic, not taste, so it
 *     is copied verbatim.
 *
 * `side`, `sideOffset` and `align` stay as props: Base UI falls back to ordinary
 * anchored positioning when the aligned form does not fit, and those are what it uses. */
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
        data-slot="select-positioner"
      >
        <SelectPrimitive.Popup className={SURFACE} data-overlay-surface="" data-slot="select-popup" {...rest}>
          <SelectPrimitive.ScrollUpArrow className={SCROLL_UP} data-slot="select-scroll-up-arrow">
            <ChevronUpIcon aria-hidden="true" className="size-4" />
          </SelectPrimitive.ScrollUpArrow>
          <SelectPrimitive.List
            className={cn('max-h-(--available-height) overflow-y-auto p-1', className)}
            data-slot="select-list"
          >
            {children}
          </SelectPrimitive.List>
          <SelectPrimitive.ScrollDownArrow className={SCROLL_DOWN} data-slot="select-scroll-down-arrow">
            <ChevronDownIcon aria-hidden="true" className="size-4" />
          </SelectPrimitive.ScrollDownArrow>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

/* Row geometry from the generated item, minus the `grid` (see 3 above): the smaller-
 * chrome radius §6 gives a menu row, and a neutral highlight — `bg-accent` is
 * `--surface-hover`, which is the same hover surface every menu row in the app uses.
 *
 * THE `sm:` STEPS ARE BACK, AND DROPPING THEM WAS A REAL BUG (2026-09-07, found in the
 * Batch 2 audit). The generated item is `min-h-8 text-base sm:min-h-7 sm:text-sm`. This
 * row was copied from it while `sm:` compiled to nothing — so the two variants looked
 * like dead weight and were left out, correctly, at the time. bridge.css then restored
 * `--breakpoint-sm`, which revived them everywhere EXCEPT here, and the visible result
 * is a select whose value is 14px in the closed trigger and 16px in the open list: the
 * text changes size as the panel opens. It also left the rows 32px against the
 * dropdown's 28px, and §6 locked the overlays as a family precisely so a menu and a
 * select opening on the same page do not disagree about a row.
 *
 * Restored as `sm:`, not flattened to the resolved value, so this row keeps following
 * the generated component instead of freezing a number the way menu.jsx's literals did.
 *
 * The RADIUS is deliberately left alone and is a review question, not a bug: this is
 * `rounded-sm` (6px) and a dropdown row is `rounded-xl` (14px) — a split the PRESET
 * itself makes between its select and its menu, so closing it is an owner decision.
 * PrimitiveReview.jsx puts the two side by side for that call.
 *
 * ── THE TICK IS ON THE RIGHT (owner, 2026-09-07) ──────────────────────────────────────
 *
 * It was on the LEFT, in a reserved 16px column, and that is what both shadcn and @coss
 * ship — `grid-cols-[1rem_1fr]` with the indicator in column 1. This row is hand-built
 * (see 3 above) and the arrangement was preserved along with everything else.
 *
 * THE COST WAS VISIBLE AND NOBODY HAD NAMED IT. A reserved indicator column indents every
 * label past it, so the value sat at one x-position in the closed trigger and jumped ~24px
 * right the moment the list opened — on a control whose entire job is to show you the
 * thing you picked, in the place you picked it. The owner spotted it from a screenshot
 * before this file could explain it away.
 *
 * With the tick trailing, the label starts at the row's own padding and the panel's
 * `side=none` overhang lands it within a pixel or two of where the trigger draws it. The
 * indicator no longer needs a reserved box either — nothing sits after it, so it can come
 * and go without moving anything, and the `size-4` span is kept only to stop the row
 * height changing between a ticked and an unticked row.
 *
 * `px-2` rather than `ps-2 pe-4`: the trailing 16px existed to balance the leading tick
 * column, and with the tick moved it was simply a hole on the right. */
function SelectItem({ className, children, ...rest }) {
  return (
    <SelectPrimitive.Item
      className={cn(
        'flex min-h-8 cursor-default items-center gap-2 rounded-sm px-2 py-1 text-base outline-none sm:min-h-7 sm:text-sm',
        // The panel overhangs the trigger by 10px a side when it opens ON it, which is
        // what puts a row's label over the trigger's value. Verbatim from the generated
        // row; `data-side="none"` is what the positioner reports in that mode.
        'in-data-[side=none]:min-w-[calc(var(--anchor-width)+1.25rem)]',
        'data-highlighted:bg-accent data-highlighted:text-accent-foreground',
        'data-disabled:pointer-events-none data-disabled:opacity-64',
        className,
      )}
      data-slot="select-item"
      {...rest}
    >
      <SelectPrimitive.ItemText className="min-w-0 flex-1 truncate">{children}</SelectPrimitive.ItemText>
      <span className="flex size-4 shrink-0 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon aria-hidden="true" className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
    </SelectPrimitive.Item>
  );
}

export {
  Select, SelectItem, SelectPopup, SelectTrigger,
  UISelectValue as SelectValue,
};
