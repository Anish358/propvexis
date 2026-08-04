import { Popover as PopoverPrimitive } from '@base-ui/react/popover';

/* Popover — PropVexis primitive. Behaviour only, for the same reasons `menu.jsx`
 * gives at length: the generated popover ships a skin (`w-72 rounded-3xl bg-popover
 * p-4 shadow-lg` plus open/close animation) and the two popovers in the top bar
 * already have an approved appearance in legacy CSS. Read that header first — it
 * explains why rendering Base UI directly is the architecture rather than a departure
 * from it; this file is the same decision applied to a non-menu surface.
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
 * cascading columns inside a role="menu", where arrow keys would fight the panel's
 * own keyboard handling. Both already declared themselves correctly in markup
 * (`role="dialog"` on the notification panel), so this is not a reclassification —
 * it is the same intent, now with a primitive that honours it.
 *
 * WHAT THE FILTER PANEL KEEPS. `FilterPanel` has 505 lines of deliberate keyboard
 * behaviour, including Escape that unwinds one cascade level at a time rather than
 * closing everything. That is a product decision and it stays exactly as it is; this
 * popover only replaces the outer open/close/dismiss/position shell that used to be
 * six lines of `mousedown` listener. `onOpenChange` is what lets the panel keep
 * owning the inner levels while the primitive owns the outermost one.
 */

function Popover(props) {
  return <PopoverPrimitive.Root {...props} />;
}

function PopoverTrigger(props) {
  return <PopoverPrimitive.Trigger {...props} />;
}

function PopoverContent({
  className, align = 'end', side = 'bottom', sideOffset = 6, ...rest
}) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        side={side}
        sideOffset={sideOffset}
        className="z-dropdown"
      >
        <PopoverPrimitive.Popup className={className} {...rest} />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverContent, PopoverTrigger };
