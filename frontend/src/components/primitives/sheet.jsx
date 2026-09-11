/* sheet.jsx
 *
 * @design approved 2026-09-10 — 🔒 Cycle 00, piece 4. Signed off on the Test page on two
 *   rulings, the first of which went against the registry AND against a token's own
 *   description of itself: the drawer takes the CARD colour, not the floating-panel one,
 *   and `data-overlay-surface` came off with it. The close control is an ✕ in the actions
 *   row. What is signed is the SHELL — width, surface, motion, edge, portal behaviour —
 *   which is all this file contains; the owner has said the drawer's CONTENTS are being
 *   redesigned later, and that is not a reopening of this component.
 *   A redesigned screen may adopt it. See test/primitives-status.test.js.
 */

import React, { useRef } from 'react';
import {
  Sheet as UiSheet, SheetClose as UiSheetClose, SheetContent as UiSheetContent,
  SheetDescription as UiSheetDescription, SheetFooter as UiSheetFooter,
  SheetHeader as UiSheetHeader, SheetTitle as UiSheetTitle,
} from '@/components/ui/sheet';
import { OverlayContainerContext } from './overlay-container.js';

/* Sheet — PropVexis primitive, on the GENERATED `@shadcn/sheet` (base-rhea). THE DETAIL
 * DRAWER: a full-height panel that slides in from the edge of the viewport, holding one
 * record in full while the list behind it stays where it was.
 *
 * ── THE THIRD "INSTALLED BUT NEVER WRAPPED", AND BOTH CAME IN THE SAME BOX ───────────
 *
 * `ui/sheet.jsx` has been on disk the whole time. It arrived as a registry dependency of
 * `@shadcn/sidebar` — which is also exactly how `ui/tooltip.jsx` arrived — and the Cycle
 * 00 audit filed both under "already installed" and therefore under "nothing to do".
 * Nobody checked whether the APPLICATION could reach it. It could not: nothing imports
 * it except `ui/sidebar.jsx`, which uses it privately for the mobile rail, and there has
 * never been a wrapper or a barrel export. INSTALLED IS NOT THE SAME AS USABLE, and this
 * is the second time that sentence has had to be written in two days.
 *
 * The brief's §0 grew a fourth row for the tooltip on 09-09. This is that row's second
 * entry, and the pattern behind it is now specific enough to act on: a registry component
 * that installs a DEPENDENCY installs it silently, and a dependency is exactly the thing
 * an audit counts as present without asking who can use it. `@shadcn/sidebar` brought in
 * two of the kit's six pieces.
 *
 * ── WHY A SKIN, AND NOT A COMPONENT ──────────────────────────────────────────────────
 *
 * §1 was run for real rather than assumed, because the brief's own line ("the drawer is
 * a skin on Sheet, not a new component") is an audit note from 09-06 and audit notes have
 * expired before in this review — nine times, by the primitive review's own count.
 *
 *   1. SETTLED PRIMITIVE? No. There is no drawer in `components/primitives/`. The one
 *      that ships is `features/trades/TradePreview.jsx`, which is not a primitive at all:
 *      187 hand-written lines wearing 26 `.tp-*` legacy classes.
 *   2. @shadcn? YES, and already on disk. Stop here.
 *   3. @coss? Not reached, and the answer would not have changed anything: coss ships a
 *      `drawer` (14 particles) but it is a MOBILE GESTURE OBJECT — drag bars, snap points,
 *      swipe areas — and a `sheet` (3 particles) that is the same object shadcn ships.
 *      Pulling a second implementation of a component we already have installed is what
 *      §1 step 3 exists to prevent. Recorded because "we checked" has to be checkable.
 *
 * ── THE DRAWER AND THE MODAL ARE THE SAME BASE UI COMPONENT ──────────────────────────
 *
 * `ui/sheet.jsx` imports `Dialog` from `@base-ui/react/dialog`. So does `ui/dialog.jsx`,
 * which `modal.jsx` wraps. A sheet IS a dialog that happens to be pinned to an edge, and
 * everything `modal.jsx` learned in Phase 4b about Base UI's dialog applies here without
 * being rediscovered. Two of its three lessons are carried over below and the third is
 * deliberately NOT — see the containment note.
 */

/* WIDTH — THE ONE CORRECTION THAT IS ABOUT THIS PRODUCT RATHER THAN ABOUT OUR LAYER.
 *
 * The registry draws `w-3/4` capped at `sm:max-w-sm`, which is 384px. That is a sensible
 * default for a component that does not know what goes in it. We do know: the real call
 * site puts a TWENTY-FIELD two-column grid in here — pair, session, setup, probability,
 * MTF phase, four prices, five figures, source, ticket — plus a result card and a notes
 * block. At 384px that grid's value column starts wrapping numbers, and a wrapped price
 * is unreadable in a way a wrapped sentence is not.
 *
 * 480px is what ships today (`.tp-panel`), it was arrived at by looking at that grid, and
 * nothing about the redesign changes the field count — §2: structure is a locked
 * invariant. So this is not a new value, it is the existing one kept deliberately.
 *
 * IT IS A CSS VARIABLE RATHER THAN A CLASS, AND THAT IS THE tailwind-merge TRAP TALKING.
 * The registry sets width through `data-[side=right]:w-3/4` and
 * `data-[side=right]:sm:max-w-sm`. `twMerge` only drops a conflicting class when the
 * MODIFIER SET MATCHES — the finding that killed the top bar's pill hover on 09-07 — so a
 * plain `w-[480px]` here would not remove either of those; all three would ship and the
 * winner would be whichever the stylesheet happened to emit last. Overriding at the same
 * modifiers is what actually replaces them, and routing the value through `--sheet-w`
 * keeps a caller's width out of a class name entirely, which it has to be: a
 * caller-supplied dimension is a PROP, not a class, because a utility written in a page
 * compiles to nothing.
 *
 * `min(…, 92vw)` keeps the legacy behaviour of never covering the whole screen on a
 * narrow window. It lives inside the variable rather than as a second `max-w-*` utility
 * for the same reason: two max-widths would be another unmerged pair. */
const WIDTH = [
  'data-[side=right]:w-[var(--sheet-w)] data-[side=right]:sm:max-w-[var(--sheet-w)]',
  'data-[side=left]:w-[var(--sheet-w)] data-[side=left]:sm:max-w-[var(--sheet-w)]',
].join(' ');

/* MOTION — §10, AND THE DURATION IS ALREADY OURS.
 *
 * The registry animates with `transition duration-200 ease-in-out`, and `--dur` is 200ms.
 * That is a genuine non-event of the same kind piece 3 turned up: the value is right
 * before we touch it. What is NOT ours is the curve and the exit.
 *
 *   · `--ease` is the app's curve. `ease-in-out` is the browser's.
 *   · §10: leaving is faster than arriving. The registry uses one duration both ways.
 *
 * THIS DOES NOT GO THROUGH `overlay-motion`, AND THE REASON IS A TRAP WORTH THE LINE.
 * That utility sets `--tw-animation-duration`, which only reaches `animate-in`/
 * `animate-out` — the KEYFRAME classes the modal, menu, popover and tooltip all use.
 * The sheet is the one overlay the registry built on CSS TRANSITIONS with
 * `data-starting-style` / `data-ending-style` instead. Applying `overlay-motion` here
 * would be accepted, would emit a custom property nothing reads, and would change
 * nothing — silently, which is the failure mode this codebase keeps meeting. The
 * durations are therefore written onto the transition directly.
 *
 * The reduced-motion fallback is the GLOBAL reset in tokens.css rather than a local
 * media query, the same way `account.jsx` leans on it (§10: durations collapse to zero,
 * the state change still happens, no substitute effect appears). */
const MOTION = [
  'ease-[var(--ease)] duration-[var(--dur)]',
  'data-ending-style:duration-[var(--dur-fast)]',
].join(' ');

/* THE PORTAL DIV MUST NOT BECOME A ROW — INHERITED FROM `modal.jsx`, AND IT MATTERS MORE
 * HERE THAN IT DID THERE.
 *
 * Any overlay opened inside this drawer portals into the popup (that is what the
 * container context below is for), and Base UI does not inject the panel directly: it
 * appends a plain `<div data-base-ui-portal>` and renders into that. The modal met this
 * as a latent bug — its 13 dialogs lay out as blocks, where an empty div is 0px, and it
 * only appeared when a dialog used grid or flex.
 *
 * `SheetContent` IS `flex flex-col`. There is no latent version here: the first menu or
 * select anyone opens inside this drawer adds a track and a gap, and the whole panel
 * shifts while they use it. `display: contents` removes the div from layout while its
 * children still render, and the panel inside is positioned against this popup either
 * way, so nothing about the positioning changes. */
const PORTAL_FIX = '[&>[data-base-ui-portal]]:contents';

/* SURFACE — RULED 2026-09-10: THE CARD COLOUR, NOT THE FLOATING-PANEL ONE.
 *
 * THE ONLY REAL DESIGN QUESTION IN THE PIECE, AND IT WENT AGAINST THE REGISTRY. The
 * registry draws `bg-popover`, which our bridge resolves to `--surface-2` (#18181b) —
 * the token whose own comment reads "EVERY FLOATING PANEL — menu, popover, select,
 * combobox". The owner picked `--surface` (#111114) instead, which is what `.tp-panel`
 * has always painted and is one visible step darker.
 *
 * WHY THAT IS RIGHT, now that it is decided: every previous holder of `--surface-2` is
 * SMALL AND TRANSIENT. This one is 480px wide, full height, and holds a card, a grid of
 * twenty fields and a paragraph of notes. The token's list is a description of the things
 * that had needed it, not a definition that a 480px reading surface has to satisfy. A
 * drawer is a place you go to read, and in this app that is a card colour.
 *
 * ── AND `data-overlay-surface` CAME OFF WITH IT, WHICH IS THE HALF THAT MATTERS ──────
 *
 * These were never two questions and the file said so before the ruling: the same
 * attribute that sets the panel's colour is what makes every hover, edge and separator
 * INSIDE it resolve to overlay values rather than card values. Answering one answered the
 * other. Choosing the card colour and keeping the attribute would have produced the exact
 * fault `[data-overlay-surface]` exists to prevent, only inverted — a card-coloured
 * surface whose contents all draw as though they were in a menu.
 *
 * So the drawer declares nothing, and its children resolve against a card, which is
 * correct because a card is now what they are on. `--color-border` is contextual, so the
 * registry's own `border-l` lands on `--line` — a card's edge — with no override, and
 * that is byte for byte what `.tp-panel` draws today.
 *
 * ⚠ THIS DOES NOT MAKE THE DRAWER "NOT AN OVERLAY". It still portals, still takes a
 * scrim, still traps focus. `data-overlay-surface` is about COLOUR CONTEXT, not stacking
 * or behaviour, and the two are independent. An overlay opened INSIDE the drawer — a menu,
 * a select — is still a floating panel and still declares the attribute itself, in its own
 * wrapper, so nothing about this ruling reaches it. */
const SURFACE = 'bg-card text-card-foreground';

/* THE EDGE AND THE SHADOW — §6 AND §7, BOTH LEFT AS THE REGISTRY DREW THEM.
 *
 * NO RADIUS, deliberately and not by omission. §6 assigns radius by SURFACE, and this
 * surface touches three viewport edges; a corner on the two right-hand ones would be
 * rounding against nothing. Only the left edge is interior and it takes the border. The
 * registry agrees, `.tp-panel` agrees, and the way to keep agreeing with the registry is
 * to not restate the value — which is exactly what the tooltip's corner ruling settled on
 * 09-09.
 *
 * The registry's `shadow-xl` and `border-l` are kept as-is. `.tp-panel` draws a
 * hand-rolled `-12px 0 40px` shadow and a `--line` border; §7 sizes elevation by
 * DETACHMENT and this is as detached as a surface gets, so the registry's top step is
 * the right one and there is no reason to author a second definition of it. */

function Sheet({
  open = true,
  onClose,
  side = 'right',
  width = 480,
  label,
  className,
  style,
  children,
  ...rest
}) {
  /* Handed to every overlay opened below this drawer as its portal container. A ref, not
   * state, so it costs no render — `overlay-container.js` carries the full argument, and
   * this is the same seam `modal.jsx` publishes. Nothing puts a menu in the drawer today;
   * the actions row is two icon buttons. It is wired now because the alternative is that
   * the first person to add one gets a control that takes focus and paints under the
   * scrim, which is precisely the bug that made this context exist. */
  const popupRef = useRef(null);

  const w = typeof width === 'number' ? `${width}px` : width;

  return (
    <UiSheet
      open={open}
      onOpenChange={(next) => { if (!next) onClose?.(); }}
    >
      {/* NO BACKDROP-AS-PARENT HERE, AND THAT IS THE ONE MODAL LESSON DELIBERATELY LEFT
        * BEHIND. `modal.jsx` rebuilds Base UI's sibling layout into
        * `div.modal-backdrop > div.modal` because the LEGACY stylesheet centres the popup
        * from its parent and would otherwise drop it, unpositioned, under the scrim. That
        * is a legacy-compatibility shim, not a Base UI requirement. This drawer has no
        * legacy CSS to satisfy — its rules are being deleted, not matched — so it uses
        * the registry's own Portal/Overlay/Popup arrangement untouched, which is `fixed`
        * and positions itself. Copying the shim would be copying a workaround for a
        * problem this component does not have.
        *
        * Dismissing on an outside click and on Escape are both Base UI defaults, so
        * neither is reimplemented. `TradePreview` currently hand-rolls a document-level
        * `keydown` listener for Escape and a click handler on its own backdrop; both go
        * when it migrates, along with the focus trap and focus restore it never had. */}
      <UiSheetContent
        ref={popupRef}
        side={side}
        showCloseButton={false}
        aria-label={label}
        style={{ '--sheet-w': `min(${w}, 92vw)`, ...style }}
        className={[SURFACE, WIDTH, MOTION, PORTAL_FIX, className].filter(Boolean).join(' ')}
        {...rest}
      >
        <OverlayContainerContext.Provider value={popupRef}>
          {children}
        </OverlayContainerContext.Provider>
      </UiSheetContent>
    </UiSheet>
  );
}

/* THE CLOSE CONTROL — RULED 2026-09-10: AN `✕` IN THE ACTIONS ROW.
 *
 * Three candidates, and the ruling picked the one that is neither of the obvious two.
 * The registry floats a ghost button at `absolute top-4 right-4`, detached from
 * everything. The shipping drawer puts a `‹` chevron to the LEFT of the title, which
 * reads as "push this back". The owner took an `✕` sitting in the ACTIONS group beside
 * Edit and Delete — so closing is one of the things you can do to this record, in the
 * row where the things you can do to it live, rather than a separate gesture floating
 * over the corner.
 *
 * `showCloseButton` THEREFORE STAYS FORCED OFF, and the distinction is easy to lose: the
 * ruling is NOT the registry's button. Its is absolutely positioned over the panel; this
 * one is a sibling of the other two actions and shares their metrics. Leaving the prop at
 * its default would put the floating one on top of the chosen one — two controls doing
 * one job — which is the only outcome that was never arguable.
 *
 * IT IS FORCED RATHER THAN EXPOSED AS A PROP, and that is now the third time: the chip's
 * `operator` and the tooltip's `surface` were both DELETED on the ruling that answered
 * them. A switch that outlives its question is how one component ends up able to look
 * like two. */

export {
  Sheet,
  UiSheetClose as SheetClose,
  UiSheetDescription as SheetDescription,
  UiSheetFooter as SheetFooter,
  UiSheetHeader as SheetHeader,
  UiSheetTitle as SheetTitle,
};
