/* select.jsx
 *
 * @design unreviewed — the owner has not signed off how this LOOKS. It is not a
 *   §1 step-1 stop: reuse it in existing screens, but a redesigned screen may not
 *   adopt it until it is reviewed. See test/primitives-status.test.js.
 */

import React from 'react';
import { CheckIcon } from 'lucide-react';
import { Select as SelectPrimitive } from '@base-ui/react/select';
import {
  SelectPopup as UISelectPopup,
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
 * 2. THE PANEL TAKES §6 AND §7, AND THAT IS THE ONLY THING WE CHANGE ABOUT IT.
 *    The generated `SelectPopup` draws its surface on an inner <div> it does not expose
 *    — `rounded-lg` with `shadow-lg/5` and two `before:` hairlines — so there is no prop
 *    that reaches it. §6 is LOCKED and assigns floating overlays `--r-2xl` ("an overlay
 *    is a card that floats", which is what every menu and popover in this app already
 *    draws), and §7 assigns them `--sh-2`, from the ladder, with no component writing
 *    its own. A 10px dropdown beside 16px menus is the visible cost of accepting it.
 *
 *    THIS USED TO BE A REASON TO RE-IMPLEMENT THE WHOLE POPUP from the Base UI parts —
 *    Portal, Positioner, Popup, List and the scroll arrows, by hand. It is not. Base UI
 *    merges the `render` element's className with the component's own (mergeProps
 *    concatenates `className`; it does not replace it), so a wrapper can reach that
 *    inner div with a descendant selector and change exactly the two properties a
 *    locked rule requires. The build order in DESIGN-LANGUAGE §1 is shadcn → @coss →
 *    composition → hand-written, and this is the third step, not the fourth.
 *
 *    WHAT RE-IMPLEMENTING COST, since it is the argument for not doing it again: the
 *    hand-built popup silently dropped the scroll arrows (they matter — aligned to the
 *    trigger, a long list scrolls in place rather than flipping), and the row that came
 *    with it dropped two responsive steps and rendered its options a size bigger than
 *    the trigger above them. Neither was a decision anyone made. Both are the ordinary
 *    cost of maintaining a copy.
 *
 *    `:not([data-slot])` is what picks the surface out: the arrows are its siblings and
 *    they are the ones that carry a slot name, so the unlabelled div is the panel. It
 *    survives the arrows unmounting, which `nth-child` would not.
 *
 * 3. THE ROW IS THE ONE PART STILL BUILT BY HAND, and the reason it gives has changed
 *    completely — the ORIGINAL reason is gone, and it is worth recording what it was.
 *
 *    IT USED TO BE A CSS COLLISION. The generated SelectItem lays itself out with `grid
 *    grid-cols-[1rem_1fr]`, and legacy/app.css declared an unlayered `.grid { display:
 *    table; min-width: calc(var(--grid-cols, 11) * 92px) }` for the Trade Log — so every
 *    option rendered as a 1012px-wide TABLE row and dragged the dropdown to the width of
 *    the viewport. Measured in a browser: `item: disp=table minW=1012px`.
 *
 *    THAT WAS FIXED ON 2026-08-28, BEFORE THIS FILE WAS WRITTEN, and this paragraph
 *    went on citing it for another ten days. The table is `.log-grid` now — a name
 *    Tailwind will never emit — AND legacy/app.css moved into `layer(legacy)`, the
 *    lowest layer, so it outranks nothing at any specificity. Either fix alone closes
 *    the collision; both are in, and `utility-collisions.test.js` holds them ("the
 *    `grid` collision is gone, not merely mitigated"). Second expired justification
 *    found in this one file, after the `sm:` paragraph above — see the note there.
 *
 *    WHAT KEEPS THE ROW HAND-BUILT IS AN OWNER RULING, not a constraint: the tick
 *    TRAILS the label here, and the generated row puts it in a reserved leading column.
 *    Flipping that from the outside means overriding `grid-cols` on the row AND
 *    re-pointing both children's `col-start`, and Base UI unmounts the indicator when
 *    the row is not selected — so `:first-child` and `:last-child` become the same
 *    element and the two overrides land on top of each other. The generated component
 *    pins each child's column explicitly for exactly that reason. A four-selector
 *    override that breaks on the unselected rows is worse than a nine-line row.
 */

/* Matched to `ui/input.jsx` line for line: h-8, rounded-2xl, border-transparent,
 * bg-input/50, px-2.5, no shadow. `before:hidden` kills the generated hairline, which
 * is a shadow a component wrote for itself (§7). */
const TRIGGER = 'h-8 min-h-8 rounded-2xl border-transparent bg-input/50 px-2.5 shadow-none before:hidden';

const Select = SelectPrimitive.Root;

function SelectTrigger({ className, ...rest }) {
  return <UISelectTrigger className={cn(TRIGGER, className)} {...rest} />;
}

/* THE PANEL, AS THE GENERATED COMPONENT DRAWS IT, with two properties corrected.
 *
 * `render` is Base UI's composition hook and the coss reference names it as the
 * supported one ("where composition is needed, prefer documented coss/Base UI `render`
 * patterns"). Its className is MERGED with the component's own — mergeProps concatenates
 * className rather than replacing it — so this adds to the popup without touching the
 * generated file.
 *
 * The two overrides are the two a LOCKED rule requires and nothing else: §6 gives a
 * floating overlay `--r-2xl` (16px, what every menu and popover here already draws) and
 * §7 gives it `--sh-2` from the ladder, with no component writing its own — which is why
 * the generated `before:` hairlines go too. Everything else about the panel is the
 * preset's, including the row highlight, the padding and the scroll arrows.
 *
 * `data-overlay-surface` is what makes `--color-border` resolve to a PANEL's edge rather
 * than a card's; it sits on the popup and the inner div inherits the custom property.
 *
 * `z-dropdown` is deliberately NOT applied. The generated Positioner hardcodes `z-50`,
 * and tokens.css sets `--z-dropdown: 50` to match it on purpose — reaching the
 * Positioner would mean re-implementing it, and the value is already the one §19 wants.
 *
 * NOT PASSED, AND WORTH KNOWING WHY: `alignItemWithTrigger`. The generated component
 * defaults it to true and the owner chose that behaviour (the selected row settles on
 * the trigger, the way a native dropdown does). The coss reference agrees — "use
 * `alignItemWithTrigger={false}` ONLY when the default causes layout issues". This
 * wrapper used to pass `false`; that was its own call and it is gone. */
const PANEL = [
  '[&>div:not([data-slot])]:rounded-2xl',
  '[&>div:not([data-slot])]:shadow-2',
  '[&>div:not([data-slot])]:before:hidden',
  /* AND THE EDGE COLOUR, WHICH IS NOT A DESIGN OVERRIDE — it is the third thing this app
     has to supply that a stock shadcn install supplies for it. The generated panel asks
     for a bare `border`, which in Tailwind v4 sets WIDTH only; preflight's `border: 0
     solid` leaves the colour at `currentColor`, and shadcn's own starter closes that with
     a global `* { @apply border-border }` that this project does not have (bridge.css
     lists the three other preflight gaps it patches for the same reason — the outset
     button frame, the heading margins, the UA control border). Without this line the
     select panel draws a near-WHITE 1px edge. Caught by design-tokens.test.js on the
     commit that adopted the generated popup, which is the test doing its job.

     `border-border` is the right token rather than a frozen grey: `--color-border` is
     contextual and the popup carries `data-overlay-surface`, so it resolves to a panel's
     edge here and a card's elsewhere (§4, and tokens.css "CHROME IS CONTEXTUAL"). */
  '[&>div:not([data-slot])]:border-border',
].join(' ');

function SelectPopup({ className, ...rest }) {
  return (
    <UISelectPopup
      className={className}
      data-overlay-surface=""
      render={<div className={PANEL} />}
      {...rest}
    />
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
 * ── THE HIGHLIGHT IS THE DROPDOWN'S, NOT THE SELECT'S (owner, 2026-09-07) ────────────
 *
 * This was `rounded-sm` — 6px — and was parked as an open review question rather than
 * changed, because the split is the PRESET'S OWN: shadcn draws its select row at
 * `rounded-sm` and its menu row at `rounded-xl`, so matching them was a decision to put
 * to the owner rather than make. The owner put the two side by side and closed it: the
 * option row takes `rounded-xl`, the same 14px the dropdown menu locked in Batch 1.
 *
 * TWO THINGS AGREED, WHICH IS WHY IT IS NOT "it looks better". §6 locked the overlays as
 * a FAMILY on the argument that a menu and a select opening on the same page must not
 * disagree about a row — the row height was already held to that (`sm:min-h-7`, 28px in
 * both) and the corner was the one property still out. And the reference the owner was
 * comparing against draws a rounder highlight than 6px too, so preset parity and our own
 * locked rule pointed the same way for once.
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
        'flex min-h-8 cursor-default items-center gap-2 rounded-xl px-2 py-1 text-base outline-none sm:min-h-7 sm:text-sm',
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
