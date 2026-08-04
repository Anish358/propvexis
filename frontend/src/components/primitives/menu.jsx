import { Menu as MenuPrimitive } from '@base-ui/react/menu';

/* Menu — PropVexis primitive. A dropdown menu that carries BEHAVIOUR ONLY.
 *
 * WHY THIS RENDERS BASE UI DIRECTLY INSTEAD OF THE GENERATED `ui/dropdown-menu`,
 * which is the one real decision in this file — and it is NOT a departure from the
 * architecture. UI-MIGRATION-PLAN §13 says the point of choosing Base UI is that
 * every overlay resolves to "one accessibility model, one keyboard-interaction
 * contract, one positioning behaviour, one copy of the primitive code in the bundle."
 * This is that engine. What is declined is the preset's SKIN, not the source.
 *
 * The skin is the problem: `rounded-2xl bg-popover p-1 shadow-lg ring-1`, item
 * padding, a focus background, and `data-open:animate-in fade-in-0 zoom-in-95`. The
 * menus in the top bar already have an approved appearance in legacy CSS
 * (`.tb-user-menu`, `.acct-menu`), and this migration is behaviour-only by decision.
 *
 * Two ways to get there. Use the generated component and cancel its skin utility by
 * utility — bg, text, padding, radius, shadow, ring, min-width, width, overflow, and
 * four animation utilities — or don't apply the skin at all. The second is not just
 * shorter, it is the only one that stays correct: the first leaks a new utility into
 * these menus every time the library adds one, and it would also introduce an
 * open/close animation, a B10 Motion change with no DLS rule behind it (§16 is open).
 *
 * So this applies NO classes of its own; what the caller passes as `className` is the
 * whole appearance. `shadcn add dropdown-menu popover` was run, the output read, and
 * the files then REMOVED — they had no importer, and Tailwind was still scanning them
 * and emitting 3.9 kB of CSS for a skin nothing rendered, which is precisely the dead-
 * but-live rules that tailwind.css's own header warns about. Re-pull them the day a
 * NEW overlay wants the preset look rather than an existing appearance; regeneration
 * is meant to be boring (§15).
 *
 * WHAT THE APP GAINS, all of it from Base UI rather than from us:
 *   · Escape closes. The hand-rolled version had no key handling at all.
 *   · Focus returns to the trigger on close, instead of being dropped to <body>.
 *   · Arrow keys, Home/End and typeahead move between items. `UserMenu` declared
 *     role="menu" and role="menuitem" and implemented none of it — an ARIA contract
 *     that lies is worse than no roles, because a screen-reader user is told to
 *     expect arrow-key navigation that does not work.
 *   · The popup is positioned against the viewport, so it flips instead of running
 *     off the edge. The legacy rules pinned `right: 0` and hoped.
 *   · aria-haspopup / aria-expanded / aria-controls are wired and stay in sync.
 *
 * ONE CSS CONSEQUENCE, and it has to be handled or the keyboard win is invisible:
 * Base UI marks the focused item with `data-highlighted`, not `:hover`. Legacy CSS
 * styled `:hover` only, so arrow-keying through a menu would move focus with nothing
 * on screen changing. Every `:hover` rule on a menu item now has `[data-highlighted]`
 * beside it. That is not a new visual treatment — it is the existing one, reached by
 * the keyboard.
 *
 * POSITIONING MOVES OUT OF CSS. `Positioner` portals the popup to <body> and owns
 * placement, so the surfaces drop their `position/top/right/bottom/left/z-index`
 * declarations and keep everything visual. `side`/`align`/`sideOffset` reproduce
 * where each menu already sat.
 */

function Menu(props) {
  return <MenuPrimitive.Root {...props} />;
}

function MenuTrigger(props) {
  return <MenuPrimitive.Trigger {...props} />;
}

// `align`/`side` default to the top bar's shape — a menu hanging below its trigger,
// right edges flush — because that is where all three of its menus sit. Anything
// else passes its own.
function MenuContent({
  className, align = 'end', side = 'bottom', sideOffset = 8, ...rest
}) {
  return (
    <MenuPrimitive.Portal>
      {/* The positioner is portaled to <body>, so it carries the app's dropdown
          stacking level. `z-dropdown` is our token, registered as a utility in
          bridge.css — not Tailwind's z-50, which knows nothing about our ladder. */}
      <MenuPrimitive.Positioner
        align={align}
        side={side}
        sideOffset={sideOffset}
        className="z-dropdown"
      >
        <MenuPrimitive.Popup className={className} {...rest} />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

function MenuItem(props) {
  return <MenuPrimitive.Item {...props} />;
}

// A checkbox item does NOT close the menu when activated, which is the behaviour the
// account switcher's comment already asked for ("checkboxes keep it open") and had
// to get by not implementing dismissal at all. Base UI gives it properly, and adds
// role="menuitemcheckbox" + aria-checked, which the <label><input> version never had.
function MenuCheckboxItem(props) {
  return <MenuPrimitive.CheckboxItem closeOnClick={false} {...props} />;
}

function MenuSeparator(props) {
  return <MenuPrimitive.Separator {...props} />;
}

// Static, non-focusable content inside a menu — an identity block, a plan row. As a
// bare <div> in a role="menu" it is an orphan node that assistive tech may skip or
// mis-announce; as a GroupLabel it is addressable. Wrap it in `MenuGroup` with the
// items it introduces.
function MenuGroup(props) {
  return <MenuPrimitive.Group {...props} />;
}

function MenuGroupLabel(props) {
  return <MenuPrimitive.GroupLabel {...props} />;
}

export {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
};
