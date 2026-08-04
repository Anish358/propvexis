import { PopoverContent as UiPopoverContent, Popover as UiPopover, PopoverTrigger as UiPopoverTrigger } from '@/components/ui/popover';

/* Popover — PropVexis primitive, on the GENERATED shadcn component and carrying the
 * preset's appearance. Read `menu.jsx` first: it explains the precedence rule this
 * follows, and this file is the same decision applied to a non-menu surface.
 *
 * MENU OR POPOVER? The distinction is not cosmetic and it decides which of these two
 * files a caller reaches for:
 *
 *   Menu     a list of COMMANDS. role="menu", arrow keys move between items, and
 *            activating one closes it. The user menu, the account switcher.
 *   Popover  an arbitrary panel of CONTENT. role="dialog", Tab moves through it
 *            normally, and it closes on Escape or an outside click. The notification
 *            feed and the filter builder — both hold their own controls, and neither
 *            is a list of things to pick from.
 *
 * Forcing the filter builder into a Menu would put its inputs, chips and nested
 * cascading columns inside a role="menu", where arrow keys would fight the panel's own
 * keyboard handling. Both already declared themselves correctly in markup, so this is
 * not a reclassification — it is the same intent, honoured by the primitive.
 *
 * ── THREE SKIN UTILITIES ARE CANCELLED FOR EVERY CALLER, AND THE REASON MATTERS ──
 *
 * The generated popup is `w-72 flex flex-col gap-4 rounded-3xl bg-popover p-4 shadow-lg
 * ring-1`. Three of those describe a *self-contained* panel, and both of this app's
 * popovers hold content that already spaces itself:
 *
 *   `w-72`   -> `w-auto`   288px is not either panel's width. The notification feed is
 *                          340px and the filter stack sizes to its columns. Width is A1.
 *   `gap-4`  -> `gap-0`    16px between every child, ON TOP of the margins and padding
 *                          the children already carry. The same doubling that bit the
 *                          Card and then the Modal — third time, so it is cancelled at
 *                          the primitive rather than at each call site.
 *   `p-4`    -> `p-0`      The notification feed's rows carry their own `12px 16px` and
 *                          their dividers span the full width. 16px of popup padding
 *                          would inset every row and leave the dividers floating short
 *                          of both edges — which reads as a rendering bug, not a style.
 *
 * What the preset therefore genuinely contributes here: the surface, the radius (via
 * `--radius-3xl`, which had to be added to the bridge or it fell back to Tailwind's
 * 24px and put two overlays on different radii), the ring in place of a 1px border, the
 * shadow, and the entrance/exit animation.
 *
 * ONE POPOVER IS NOT A PANEL, WHICH IS WHAT `surface` IS FOR. `.fp-stack` is a flex
 * *container* that stacks the filter panel and its cascade columns, each of which draws
 * its own chrome. Given a background, ring and shadow it would paint a second panel
 * behind the real ones — so it passes `surface="none"` and gets the positioning, dismissal
 * and animation without the box.
 *
 * This started as three cancelling utilities at the call site, which was wrong for a
 * reason worth recording: the layer table puts *pages* at the bottom with "nothing
 * visual originates here", and `className="bg-transparent shadow-none ring-0"` in
 * FilterBar was a page originating appearance. `utility-collisions.test.js` caught it
 * from the other direction — it harvests class names out of page JSX to compare against
 * emitted utilities, and a page using raw utilities makes that comparison meaningless.
 * A named prop keeps the utilities inside this layer, where they belong, and reads as
 * intent rather than as subtraction.
 *
 * WHAT THE FILTER PANEL KEEPS. `FilterPanel` has 505 lines of deliberate keyboard
 * behaviour, including an Escape that unwinds one cascade level at a time rather than
 * closing everything. That is a product decision and it is untouched; this popover only
 * owns the outer open/close/dismiss/position shell that used to be six lines of
 * `mousedown` listener. `onOpenChange` is what lets the panel keep the inner levels
 * while the primitive owns the outermost one.
 */

// Every overlay animates identically, per DESIGN-LANGUAGE §10. Defined in bridge.css.
const MOTION = 'overlay-motion';
// See the header — these three are cancelled for every popover in the app.
const UNSKIN = 'w-auto gap-0 p-0';
// `surface="none"` additionally drops the box, for a popover whose content is already
// made of panels. Not a style choice at the call site — a kind of popover.
const NO_SURFACE = 'bg-transparent shadow-none ring-0';

function Popover(props) {
  return <UiPopover {...props} />;
}

function PopoverTrigger(props) {
  return <UiPopoverTrigger {...props} />;
}

// `align`/`side` default to the top bar's shape — a panel hanging below its trigger,
// right edges flush — because that is where both of its popovers sit.
function PopoverContent({
  className, align = 'end', side = 'bottom', sideOffset = 6, surface = 'panel', ...rest
}) {
  return (
    <UiPopoverContent
      align={align}
      side={side}
      sideOffset={sideOffset}
      className={[UNSKIN, surface === 'none' && NO_SURFACE, MOTION, className]
        .filter(Boolean).join(' ')}
      {...rest}
    />
  );
}

export { Popover, PopoverContent, PopoverTrigger };
