import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup,
  DropdownMenuLabel, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/* Menu — PropVexis primitive. A dropdown menu on the GENERATED shadcn component,
 * carrying the preset's appearance as well as Base UI's behaviour.
 *
 * ── THIS FILE PREVIOUSLY DECLINED THE SKIN. THAT DECISION WAS REVERSED 2026-08-05. ──
 *
 * The earlier version rendered Base UI directly and applied no classes of its own, so
 * the top bar's menus kept their hand-written legacy appearance. Two things changed:
 *
 *   1. **DESIGN-LANGUAGE now locks "the preset outranks legacy CSS"** (owner,
 *      2026-08-05). Where a generated component's preset appearance collides with a
 *      legacy rule, the preset wins and the legacy rule is deleted. The old reasoning
 *      here — "these menus already have an approved appearance" — was precisely the
 *      default that rule was written to overturn.
 *   2. **§10 Motion is locked**, so the open/close animation now has a rule behind it.
 *      The old comment declined the skin partly because the animation would have been
 *      an untraceable Category B change. It is now traceable, and the duration and
 *      curve come from `overlay-motion` rather than from shadcn's `duration-100`.
 *
 * WHAT THE PRESET NOW OWNS HERE: the popup's surface, radius, padding, ring and
 * shadow; every item's padding, radius, minimum height, text size and focus
 * background; the separator; and the entrance/exit animation.
 *
 * WHAT IT DOES NOT OWN, AND WHY EACH IS AN EXCEPTION RATHER THAN AN OVERSIGHT:
 *
 * · **Width.** The generated content is `w-(--anchor-width) min-w-32` — it sizes
 *   itself to its TRIGGER. That is right for a select and wrong for these: the user
 *   menu hangs off a 34px avatar button and would collapse to the 128px floor,
 *   truncating every label. Width is A1 layout, so each menu keeps its own, declared
 *   in the one legacy rule now reduced to nothing else. `w-auto` cancels the anchor
 *   width via `cn()`/tailwind-merge, which is the generated component's own designed
 *   override path rather than a specificity fight.
 * · **Destructive items** use the generated `variant="destructive"`, not a `.danger`
 *   class. `--destructive` is bridged to `--loss`, so this is the same colour reached
 *   through the component's own API.
 * · **Stacking is now the preset's.** The generated Positioner hardcodes `z-50` and
 *   accepts no className, so this can no longer pass `z-dropdown`. Rather than leave two
 *   disagreeing values for one concept, `--z-dropdown` was moved 40 → 50 to match. The
 *   ladder's ORDER is what matters and is unchanged: nav < dropdown < toast < modal.
 *
 * BEHAVIOUR — unchanged, and still the larger half of the value. Escape closes; focus
 * returns to the trigger; arrow keys, Home/End and typeahead move between items;
 * `aria-haspopup`/`aria-expanded` stay in sync; the popup is viewport-aware and flips
 * instead of running off the edge.
 *
 * ONE CSS CONSEQUENCE RETIRED. Legacy CSS needed a `[data-highlighted]` twin beside
 * every `:hover` rule, or arrow-keying moved focus with nothing changing on screen.
 * The generated item styles on `focus:` instead, which Base UI sets for both pointer
 * and keyboard — so the twin rules are deleted along with the surfaces they belonged
 * to. That hazard is now the library's problem, which is the point of using it.
 */

// Every overlay animates identically, per §10. Defined once in bridge.css.
const MOTION = 'overlay-motion';

function Menu(props) {
  return <DropdownMenu {...props} />;
}

function MenuTrigger(props) {
  return <DropdownMenuTrigger {...props} />;
}

// `align`/`side` default to the top bar's shape — a menu hanging below its trigger,
// right edges flush — because that is where all of its menus sit. Anything else
// passes its own.
//
// `w-auto` is not cosmetic: it cancels the generated `w-(--anchor-width)` so the menu
// sizes to its content instead of to its trigger button. See the header.
function MenuContent({
  className, align = 'end', side = 'bottom', sideOffset = 8, ...rest
}) {
  return (
    <DropdownMenuContent
      align={align}
      side={side}
      sideOffset={sideOffset}
      className={['w-auto', MOTION, className].filter(Boolean).join(' ')}
      {...rest}
    />
  );
}

function MenuItem(props) {
  return <DropdownMenuItem {...props} />;
}

// A checkbox item does NOT close the menu when activated, which is the behaviour the
// account switcher always wanted ("checkboxes keep it open") and originally got by not
// implementing dismissal at all. Base UI gives it properly, plus
// role="menuitemcheckbox" + aria-checked, which the <label><input> version never had.
//
// The generated item also renders its own check indicator, so a call site passes the
// `checked` state and nothing else — the hand-rolled <input type="checkbox"> is gone.
function MenuCheckboxItem(props) {
  return <DropdownMenuCheckboxItem closeOnClick={false} {...props} />;
}

function MenuSeparator(props) {
  return <DropdownMenuSeparator {...props} />;
}

// Static, non-focusable content inside a menu — an identity block, a plan row. As a
// bare <div> in a role="menu" it is an orphan node that assistive tech may skip or
// mis-announce; as a Label it is addressable. Wrap it in `MenuGroup` with the items it
// introduces.
function MenuGroup(props) {
  return <DropdownMenuGroup {...props} />;
}

function MenuGroupLabel(props) {
  return <DropdownMenuLabel {...props} />;
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
