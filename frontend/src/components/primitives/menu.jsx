/* menu.jsx
 *
 * @design approved 2026-09-07 — reviewed against preset b2qLMFPP6 side by side on the
 *   Test page (features/dev/PrimitiveReview.jsx, "Dropdown — preset reference vs ours").
 *   THE FIRST PRIMITIVE TO CLEAR REVIEW, and it is the one that made the review process
 *   necessary: it had reached 30 screens while nobody had signed off how it looks.
 *   What the review changed is recorded in the PRESET PARITY block below — five
 *   differences, none of them visible until they were measured against a reference.
 */

import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
  DropdownMenuLabel, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { cn } from '@/lib/utils';
import { useOverlayContainer } from './overlay-container.js';

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
 *   That last relation is why a menu opened inside a MODAL needs the container below.
 *   It is on the dropdown tier, the modal's scrim is above it, and the tier is right —
 *   a page's menu must not float over a modal. So the menu is portaled into the modal
 *   instead of argued above it. `overlay-container.js` has the whole chain.
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
// `sideOffset` IS THE PRESET'S 4, NOT 8 (2026-09-07). It had been 8 — double — with no
// comment and no rule behind it, which by §21 makes it a preference rather than an
// override, and it read as the panel detaching from the button that opened it. The
// submenu's went 4 -> 0 for the same reason: the generated default sits it flush against
// its parent, and a gap there reads as two unrelated panels. Both numbers are now the
// generated component's own, so the menu hangs where the preset hangs it.
//
// `w-auto` is not cosmetic: it cancels the generated `w-(--anchor-width)` so the menu
// sizes to its content instead of to its trigger button. See the header.
//
// `container` is not a caller's decision, which is why it is read from context rather
// than accepted as a prop: inside a modal an overlay MUST portal into the modal or it
// paints under the scrim (see the header), and outside one the context yields
// `undefined`, so nothing about the ~dozen existing menus changes. A caller may still
// override it — Base UI's own prop wins through `rest`.
/* NO EDGE OVERRIDE HERE ANY MORE. This wrapper used to force `border-[var(--overlay-line)]`
 * because the generated `border` resolved to a CARD's edge and vanished on a panel.
 * `--color-border` is contextual now (tokens.css, "CHROME IS CONTEXTUAL"), so declaring
 * `data-overlay-surface` on the panel is the whole fix and the generated class is right.
 * The same deletion happened in popover.jsx and select.jsx. */
function MenuContent({
  className, align = 'end', side = 'bottom', sideOffset = 4, ...rest
}) {
  const container = useOverlayContainer();
  return (
    <DropdownMenuContent
      align={align}
      side={side}
      sideOffset={sideOffset}
      container={container}
      data-overlay-surface=""
      className={['w-auto', MOTION, className].filter(Boolean).join(' ')}
      {...rest}
    />
  );
}

/* PRESET PARITY FOR THE MENU ONLY (owner, 2026-09-07).
 *
 * The generated item styles itself with `text-sm rounded-xl text-muted-foreground` —
 * shadcn's own names, which in preset b2qLMFPP6 mean 14px, 14px and #a1a1aa. When this
 * was written OUR bridge re-meant all four for the app at large: `text-sm` -> 13px,
 * `text-xs` -> 11px, `--radius-xl` -> 12px, `--color-muted-foreground` -> #c9c9d1. So the
 * same component rendered smaller and brighter here than in the preset preview.
 *
 * The owner asked for the DROPDOWN to match the preset exactly and for nothing else to
 * move, so the difference is absorbed here rather than in the bridge — changing those
 * four globally would re-size and re-colour every screen in the app. This is precisely
 * the job of the wrapper seam: the generated file stays untouched and one file carries
 * the divergence.
 *
 * THREE OF THE FOUR ARE NO LONGER DIVERGENCES (checked 2026-09-07, hours after this was
 * written). The type scale moved onto the preset the same day: `--text-sm` is `--fs-body`
 * = 14px, `--text-xs` is `--fs-label` = 12px, and `--radius-xl` is 14px. The bridge now
 * MEANS what the preset means for all three, so the two literals below restate the tokens
 * instead of correcting them. Only `--muted` is still load-bearing: `muted-foreground`
 * resolves to `--text-2` (#c9c9d1), and `--muted` is zinc-400 (#a1a1aa), the preset's
 * value exactly — a token rather than a literal.
 *
 * THEY ARE LEFT AS LITERALS ON PURPOSE, PENDING THE OWNER. Correct today, frozen
 * tomorrow: bound to numbers rather than to the scale, this menu will not follow the next
 * scale move. Swapping them for `text-sm rounded-xl` / `text-xs` is not a pure no-op
 * either — an arbitrary `text-[14px]` sets font-size ALONE, while `text-sm` also brings
 * Tailwind's paired line-height, and tailwind-merge drops the generated `text-sm`
 * wholesale today. So the change is a line-height change on a component the owner has
 * already signed off, which is a review decision, not a cleanup. (Phrased without the
 * tag word on purpose: `primitives-status.test.js` counts every occurrence of it in the
 * file and a second one reads as a second status.) `PrimitiveReview.jsx` MENU_PARITY
 * carries this for the next review round. */
const ITEM = 'text-[14px] rounded-[14px]';
const LABEL = 'text-[12px] text-[var(--muted)]';
/* §8's divider needs no override either: the generated `bg-border/50` is a divider at
 * half the CURRENT surface's edge, which is exactly the rule, now that `border` is
 * contextual. */
function MenuItem({ className, ...rest }) {
  return <DropdownMenuItem className={cn(ITEM, className)} {...rest} />;
}

// A checkbox item does NOT close the menu when activated, which is the behaviour the
// account switcher always wanted ("checkboxes keep it open") and originally got by not
// implementing dismissal at all. Base UI gives it properly, plus
// role="menuitemcheckbox" + aria-checked, which the <label><input> version never had.
//
// The generated item also renders its own check indicator, so a call site passes the
// `checked` state and nothing else — the hand-rolled <input type="checkbox"> is gone.
function MenuCheckboxItem({ className, ...rest }) {
  return <DropdownMenuCheckboxItem closeOnClick={false} className={cn(ITEM, className)} {...rest} />;
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

function MenuGroupLabel({ className, ...rest }) {
  return <DropdownMenuLabel className={cn(LABEL, className)} {...rest} />;
}

/* SUBMENUS (added 2026-09-07). The generated file has exported Sub/SubTrigger/SubContent
 * all along; this wrapper simply never imported them, so a nested menu was unreachable
 * from application code even though it was installed and tested upstream.
 *
 * SubTrigger is an ITEM — same type size and radius as any other row, plus the chevron
 * and the open-state highlight the generated component already handles.
 *
 * SUBCONTENT NEEDS NO EDGE OVERRIDE, and the one it had was making the exact mismatch it
 * claimed to prevent (deleted 2026-09-07). What stood here forced
 * `ring-[var(--overlay-line)]` — an opaque #2f2f33 — reasoning that SubContent draws a
 * RING rather than a border, so the contextual `--color-border` cannot reach it, and that
 * the opaque token was therefore needed "so a submenu and its parent panel are outlined
 * identically".
 *
 * The ring-vs-border half was right. The premise was not: `MenuContent` carries NO edge
 * override either, so the parent panel is wearing the generated `ring-foreground/10` — a
 * white alpha, not the surface's edge. A ring is OUTSET, so the parent's edge composites
 * against whatever is behind it (~#212123 over the page) while the submenu's was a flat
 * #2f2f33 — about fourteen units brighter than the panel it hangs off. The two were
 * outlined identically only in the comment.
 *
 * Deleting it is the whole fix: both panels now take the generated alpha, which is also
 * what §4 asks for — a floating panel's outer ring is drawn on a ground we do not own,
 * so it composites rather than freezing one value. Nothing here needs to say that,
 * because saying nothing is what gets it.
 *
 * (An earlier version of this note also claimed `dark:ring-foreground/10` was dead
 * because no `@custom-variant dark` existed. That was wrong too — bridge.css declares
 * `@custom-variant dark (&)`, so `dark:` matches unconditionally.) */

function MenuSub(props) {
  return <DropdownMenuSub {...props} />;
}

function MenuSubTrigger({ className, ...rest }) {
  return <DropdownMenuSubTrigger className={cn(ITEM, className)} {...rest} />;
}

function MenuSubContent({ className, sideOffset = 0, ...rest }) {
  const container = useOverlayContainer();
  return (
    <DropdownMenuSubContent
      sideOffset={sideOffset}
      container={container}
      data-overlay-surface=""
      className={cn(MOTION, className)}
      {...rest}
    />
  );
}

export {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
};
