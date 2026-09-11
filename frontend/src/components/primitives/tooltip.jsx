/* tooltip.jsx
 *
 * @design approved 2026-09-09 — 🔒 Cycle 00, piece 2. Signed off on the Test page after
 *   three rulings, two of which reversed what had been built: our panel colour (not the
 *   registry's inversion), the REGISTRY's corner (which draws a deliberate pill at this
 *   height), and a 100ms delay (not Base UI's 600). A redesigned screen may adopt it.
 *   See test/primitives-status.test.js.
 */

import React from 'react';
import {
  Tooltip as UiTooltip, TooltipContent as UiTooltipContent,
  TooltipProvider as UiTooltipProvider, TooltipTrigger as UiTooltipTrigger,
} from '@/components/ui/tooltip';

/* Tooltip — PropVexis primitive, on the GENERATED `@shadcn/tooltip` at base-rhea.
 *
 * Read `popover.jsx` first. This is the same decision — the registry owns the behaviour,
 * the wrapper cancels the skin utilities that describe a DIFFERENT app — applied to the
 * one overlay in the set that carries no interaction at all.
 *
 * WHAT IT IS FOR, AND WHAT IT IS NOT. A tooltip names a thing you can already see. It
 * never carries the only copy of anything, it holds nothing you can click or focus, and
 * a keyboard user reaches it by TABBING TO THE TRIGGER rather than into the panel. Its
 * one real call site today is the Trade Log's adherence cell — "Broke: max SL, session" —
 * which is the reason it is a kit piece rather than a nicety: that cell is a badge reading
 * "2 rules" and the reason is the whole content of the column.
 *
 *   Tooltip   a LABEL for its trigger. aria-describedby, no focus, hover or focus opens.
 *   Popover   an arbitrary panel of CONTENT. role="dialog", Tab moves through it.
 *   Menu      a list of COMMANDS.
 *
 * If a caller wants a link inside it, they want a Popover. This one is unreachable by
 * pointer for anything but reading.
 *
 * ── THREE THINGS THE GENERATED COMPONENT ASKS FOR THAT THIS APP DOES NOT MEAN ─────────
 *
 * §25, and all three are the bridge re-meaning a name rather than the registry being
 * wrong about its own design.
 *
 * 1. `bg-foreground text-background` — AN INVERTED TOOLTIP, and it is CANCELLED. shadcn
 *    draws a tooltip as the negative of the page: on a light app that is a dark chip. Our
 *    bridge maps `--color-foreground` to `--text` (zinc-50) and `--color-background` to
 *    `--bg` (zinc-950), so the SAME two utilities in this app produce a NEAR-WHITE SLAB —
 *    and it would be the only white surface in the product.
 *
 *    ANSWERED 2026-09-09 (owner): "keep our color". So the tooltip is `--surface-2`, which
 *    is what `tokens.css` already called it — "EVERY FLOATING PANEL — menu, popover,
 *    select, combobox" — and what §4 means by an overlay not being a card. It was briefly
 *    a `surface` prop so the owner could see both on one page; that prop is GONE now that
 *    the question is closed, because a switch whose only purpose was an open decision is
 *    the "reason that had expired" this review keeps catching. The registry's own scheme
 *    is still on the Test page — rendered from `ui/tooltip.jsx` directly, which is the
 *    honest way to show it anyway.
 *
 * 2. `rounded-xl` — KEPT, by owner ruling, and it is worth knowing exactly what it draws.
 *    This wrapper briefly forced `rounded-md` (10px) on the grounds that 14px cannot draw
 *    on a box this small. That arithmetic is right, and it is now the DESCRIPTION of the
 *    chosen look rather than an objection to it: `text-xs` is 12px on a 1.333 line-height
 *    = 16px, plus `py-1.5` top and bottom = EXACTLY 28px, and a corner clamps to half the
 *    shorter side — so 14px on 28px is a perfect stadium.
 *
 *    THE TOOLTIP IS THEREFORE A DELIBERATE PILL (owner, 2026-09-09: "I want corners like
 *    registry"). It is not the checkbox regression repeating: that was a control turning
 *    into a circle nobody chose, found a day later, and this was measured, shown and
 *    picked. The way it is kept is by NOT OVERRIDING IT AT ALL — the corner is the
 *    registry's own class, so it cannot drift from "like registry". Two consequences to
 *    know before touching this:
 *      · the radius is pinned to a FIXED 14px literal in `bridge.css`, not to our ladder,
 *        so a future ladder move does not reach it. That is what makes this ruling stable
 *        rather than a value that quietly changes underneath it.
 *      · the stadium is a consequence of the HEIGHT. If the popup ever grows past 28px —
 *        a second line, bigger text, more padding — the clamp stops applying and it
 *        becomes a 14px rounded rectangle. The height is load-bearing now.
 *
 * 3. `delay = 0` — the registry's Provider default, and it is wrong for the surface this
 *    was built for: a trader dragging the pointer across four hundred trade rows would fire
 *    a tooltip on every adherence cell they crossed. It is not 0, and it is not Base UI's
 *    600 either.
 *
 *    100ms, SET BY THE OWNER 2026-09-09. The first build used Base UI's own `OPEN_DELAY`
 *    (600) on the argument that a restored default is not a number we chose; the owner
 *    looked at it and cut it to 100. That is a different intent for the control and it is
 *    the right one here. 600ms asks "have you STOPPED on this?", which suits a tooltip you
 *    might not want; 100ms asks "are you pointing at this?", which suits one holding the
 *    only copy of why a rule was broken. Short enough to feel immediate, long enough that
 *    crossing a column does not strobe. Closing stays instant — Base UI has no close delay
 *    and we add none, because a tooltip lingering after the pointer has left is in the way
 *    of the row underneath.
 *
 *    WHERE THE NUMBER GOES IS NOT OBVIOUS AND THE FIRST DRAFT GOT IT WRONG. `delay` is a
 *    prop of the TRIGGER and of the Provider; `Tooltip` (Base UI's Root) does not take it
 *    at all, so a delay passed there is accepted by JSX, reaches an element-less component
 *    and does nothing — silently, with the tooltip firing instantly. It is set on both
 *    the trigger (so a lone tooltip is right) and the Provider (so a group is), and the
 *    Root is left a passthrough.
 *
 * ── AND ONE THING A WRAPPER CANNOT REACH ─────────────────────────────────────────────
 *
 * THE ARROW'S COLOUR IS BAKED INTO THE GENERATED COMPONENT. `TooltipContent` renders
 * `TooltipPrimitive.Arrow` with its own `bg-foreground fill-foreground` and takes no prop
 * for it, so `className` on the popup is the only handle. Base UI renders the arrow as
 * the popup's `aria-hidden` child, which is what `ARROW` below selects — the one such
 * child there is. This is the wrapper absorbing the difference (§25), not the bridge, and
 * it is written as a descendant selector rather than a fork of `ui/tooltip.jsx`.
 *
 * THE PORTAL IS A REPORTED GAP, NOT A FIXED ONE. `TooltipContent` spreads its props onto
 * the POPUP and hardcodes the Portal, so — unlike Menu, Popover and Select — this
 * primitive cannot pass `container` from `useOverlayContainer()`. Inside a modal Base UI
 * portals to the nearest portal context, which is the dialog's own node, and that node
 * sets no z-index (see `overlay-container.js`). No tooltip is inside a modal today. If
 * one is wanted there, the fix is a registry re-install or an upstream prop — it is NOT
 * an edit to `ui/tooltip.jsx`, and it is on the Test page as an open question.
 */

// Every overlay animates identically, per DESIGN-LANGUAGE §10. Defined in bridge.css.
const MOTION = 'overlay-motion';

/* HOW LONG A POINTER HAS TO REST BEFORE THE TOOLTIP IS MEANT — the owner's number, not the
 * registry's 0 and not Base UI's 600. See note 3. Exported so the Test page can state the
 * value it shows rather than describe it, and so the two places it is applied cannot drift
 * apart. */
const TOOLTIP_DELAY = 100;

/* NO RADIUS AND NO WIDTH DECLARED HERE, DELIBERATELY — see note 2. The corner is the
 * registry's own `rounded-xl` because the owner asked for the registry's corner, and the
 * way to keep a value identical to the registry's is to not restate it. `max-w-xs` (320px)
 * is the registry's too: a tooltip that grows to its content's width is a paragraph
 * floating over a table. */

/* The panel scheme — the app's floating-panel surface, which is what every other overlay
 * in the library resolves to. `data-overlay-surface` on the popup makes the edge, the
 * hover and a control's edge inside it resolve against a PANEL rather than a card. */
const PANEL = 'bg-popover text-popover-foreground';

/* The arrow, which `className` reaches only as a descendant — see the header. It carries
 * both `bg-` and `fill-` upstream because Base UI allows an svg there; ours matches. */
const ARROW = '[&_[aria-hidden]]:bg-popover [&_[aria-hidden]]:fill-popover';

/* Grouped delay. Wrap a REGION that has many tooltips in it — a table, a form — not each
 * trigger. Base UI shares the wait across the group, so crossing from one adherence cell
 * straight to the next opens the second instantly: one deliberate pause per visit to the
 * column rather than one per cell. That grouping is the only thing the Provider does, and
 * it is why a table wants one and a lone icon does not. */
function TooltipProvider({ delay = TOOLTIP_DELAY, ...rest }) {
  return <UiTooltipProvider delay={delay} {...rest} />;
}

/* Groups the parts and renders no element of its own. A PASSTHROUGH on purpose — see
 * note 3: the Root takes no `delay`, so putting one here would do nothing at all. */
function Tooltip(props) {
  return <UiTooltip {...props} />;
}

/* The trigger, and where the delay actually lives — so a tooltip outside any Provider is
 * still right, which is most of them.
 *
 * `render` is Base UI's composition prop: pass the element that should BE the trigger (a
 * badge, an icon button) rather than wrapping it in a span, or the tooltip describes a
 * wrapper the user cannot see. §14's keyboard twin needs nothing here — Base UI opens on
 * focus-visible as well as hover, which is the whole reason this is a real trigger and
 * not a `title=` attribute. */
function TooltipTrigger({ delay = TOOLTIP_DELAY, ...rest }) {
  return <UiTooltipTrigger delay={delay} {...rest} />;
}

/* `side` defaults to `top`: the tooltip's own trigger is usually the thing furthest down
 * the row the user is reading, and a panel below it covers the next row.
 *
 * THERE IS NO `surface` PROP ANY MORE (owner, 2026-09-09: "keep our color"). It existed for
 * one afternoon so the panel and the registry's inversion could be compared on one page.
 * The answer is the panel, so the switch is gone rather than left behind as a colour a
 * caller could pick — which is how an overlay ends up disagreeing with the other four. */
function TooltipContent({ className, side = 'top', sideOffset = 6, ...rest }) {
  return (
    <UiTooltipContent
      side={side}
      sideOffset={sideOffset}
      data-overlay-surface=""
      className={[PANEL, ARROW, MOTION, className].filter(Boolean).join(' ')}
      {...rest}
    />
  );
}

export {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, TOOLTIP_DELAY,
};
