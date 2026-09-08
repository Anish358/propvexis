/* modal.jsx
 *
 * @design approved 2026-09-07 — the owner has not signed off how this LOOKS. It is not a
 *   §1 step-1 stop: reuse it in existing screens, but a redesigned screen may not
 *   adopt it until it is reviewed. See test/primitives-status.test.js.
 */

import { useRef } from 'react';

import {
  Dialog, DialogOverlay, DialogPopup, DialogPortal,
} from './dialog.jsx';
import { OverlayContainerContext } from './overlay-container.js';

/* Modal — THE shared shell. All 11 of this app's modals adopt it, content unchanged.
 *
 * This is the change UI-MIGRATION-PLAN §9 calls "the highest-value structural change"
 * and §19 marks ⭐ the payoff, and the audit says why. Measured across the 11 before
 * any of this landed:
 *
 *     Escape closes it ................ 2 of 11
 *     role="dialog" ................... 2 of 11
 *     aria-modal ...................... 0 of 11
 *     focus trapped inside ............ 0 of 11
 *     focus returns to the opener ..... 0 of 11
 *     background page scroll locked ... 0 of 11
 *     rendered through a portal ....... 7 of 11
 *
 * Nine modals could not be closed with a keyboard. None of them contained focus, so
 * Tab walked straight out of the dialog and into the page behind it — where a screen
 * reader also happily read the whole page, because nothing was marked as blocked. The
 * four that skipped the portal rendered inside whatever container held them, subject to
 * its overflow and stacking.
 *
 * Every one of those is now Base UI's job, once, rather than eleven approximations of
 * it. That is the entire argument for this shell.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not touch a modal's content, its width, or
 * its chrome: `.modal` and each `<name>-modal` variant class come through as
 * `className`, so the box stays exactly the size and shape it was (those widths are A1
 * layout, not refinement). Migrating a modal is deleting its backdrop div, its popup
 * div, its `createPortal` and its stopPropagation, and wrapping what is left.
 *
 * TWO SURFACES, NOT ONE, WHICH IS WHY `surface`/`backdrop` ARE PROPS. Ten of the eleven
 * modals are `.modal-backdrop` > `.modal`. Replay is not: it is `.rp-backdrop` >
 * `.rp-modal`, a 960×640 chart frame that predates the shared look. Adding `.modal`
 * alongside `.rp-modal` would not be harmless — `.rp-modal` overrides most of what
 * `.modal` declares, but it declares no padding, so Replay would silently gain
 * `.modal`'s 24px and its chart would shrink. That is an A1 regression, so the base
 * class is a parameter rather than a constant. The default is the shared surface;
 * Replay is the one caller that overrides it.
 *
 * `onClose` is kept as the prop name rather than Base UI's `onOpenChange` because all
 * 11 already pass one, several conditionally (`() => !saving && onClose()`), and that
 * logic is theirs to keep.
 *
 * ── WHY THE POPUP IS A CHILD OF THE BACKDROP, WHICH IS NOT HOW shadcn DOES IT ──
 *
 * The legacy modal is centred by the *parent*: `.modal-backdrop` is a fixed, full-screen
 * flex container with `place-items: center` and `padding: 24px`, and `.modal` is its
 * child. Nothing in `.modal` positions itself — it is a `position: relative` block that
 * relies entirely on being laid out by that parent.
 *
 * Base UI (and shadcn's generated `DialogContent`) make Backdrop and Popup *siblings*,
 * and shadcn's skin compensates with `fixed top-1/2 left-1/2 -translate-1/2 z-50` on the
 * popup. We cannot take that route, for a reason specific to this codebase: **`.modal` is
 * unlayered legacy CSS, so it beats every Tailwind utility.** A `fixed` utility on the
 * popup loses to `.modal { position: relative }`; a `z-50` loses to nothing but sits far
 * below the backdrop's own `z-index: 2147483000`. The popup would render unpositioned in
 * normal document flow at the end of `<body>`, underneath the scrim.
 *
 * So the shell restores the containment the CSS assumes. `.modal-backdrop` goes on the
 * Backdrop and the Popup renders *inside* it, reproducing `div.modal-backdrop > div.modal`
 * exactly. Every geometric value — the fixed inset, the centring, the 24px viewport gap
 * that `.modal`'s `width: 100%` resolves against, the z-index — keeps coming from the one
 * legacy rule that already declared it. Nothing is restated as a utility, which is §3
 * Principle 1 (the bridge points; it never copies) applied to layout.
 *
 * Three consequences of nesting, each handled here rather than discovered later:
 *
 *   1. `forceRender`. Base UI skips the Backdrop for a *nested* dialog, and a skipped
 *      backdrop would now mean a skipped popup. No modal opens another today, so this
 *      changes nothing now; it means a future nested dialog gets its own scrim instead of
 *      vanishing.
 *   2. `select-text` on the popup. Base UI sets `user-select: none` inline on the
 *      Backdrop, which as a sibling never reached the popup and as a parent would —
 *      silently making every modal's text unselectable. Inline styles beat classes, so
 *      this is overridden on the child, where the cascade lets it win.
 *   3. Outside-click dismissal still works, and only because of the nesting. Base UI
 *      closes a modal on outside press only when the press target *is* the registered
 *      backdrop element (`useDialogRoot`'s `outsidePress`). A neutral wrapper div would
 *      have swallowed the click and broken the dismissal all 11 modals had.
 *
 * ── AND ONE CONSEQUENCE OF THAT z-index, WHICH IS WHAT `popupRef` IS FOR ──
 *
 * `.modal-backdrop`'s `z-index: 2147483000` also outranks anything that opens INSIDE a
 * modal, because an overlay's portal does not land in the popup — it lands beside the
 * backdrop, on the dropdown tier. So the shell publishes its popup as the container
 * every overlay below it should portal into. `overlay-container.js` carries the full
 * chain; the short version is that a menu in a modal has to be a DESCENDANT of the
 * modal to be painted above it, and only the shell knows what that element is.
 */

/* THE ENTRANCE — DESIGN-LANGUAGE §10, whose OPEN item this closes (2026-09-03).
 *
 * IMPORTING tw-animate-css WAS NOT ENOUGH ON ITS OWN, and that is worth recording
 * because it looked like it would be. The generated components/ui/dialog.jsx carries
 * shadcn’s `data-open:animate-in` classes and they went live the moment the library was
 * imported — but THIS shell does not use that component. It renders Base UI’s Dialog
 * wearing the LEGACY `.modal-backdrop` / `.modal` classes (see the note above on why),
 * and legacy CSS has no entrance at all. So every one of the app’s thirteen dialogs
 * would still have appeared instantly while §10 claimed otherwise. The rule and the code
 * have to agree, so the classes are written here.
 *
 * SAFE OVER THE LEGACY RULES, CHECKED RATHER THAN ASSUMED: neither `.modal-backdrop` nor
 * `.modal` sets `opacity`, `transform` or `animation`, so nothing is being fought. The
 * backdrop is a fixed flex centring box and the popup is a plain child, which is why the
 * popup can scale in place — there is no centring translate for `zoom-in-95` to
 * multiply against.
 *
 * `overlay-motion` CARRIES THE DURATIONS, not a `duration-*` utility: it sets
 * `--tw-animation-duration`, which tw-animate-css reads BEFORE `--tw-duration`, so §10’s
 * enter-at-`--dur` / leave-at-`--dur-fast` split wins by variable precedence rather than
 * by cascade order. bridge.css explains that at length; menu.jsx and popover.jsx already
 * use it, and this makes the third overlay family agree with them.
 *
 * THE BACKDROP DOES NOT ZOOM. A scrim is not an object arriving, it is the room
 * dimming — scaling it would drag the whole viewport. It fades; the popup fades and
 * scales. */
const BACKDROP_MOTION = 'overlay-motion data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0';
const POPUP_MOTION = 'overlay-motion data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95';

/* THE SHELL OWNS ITS SURFACE NOW (2026-09-07) — `.modal` and `.modal-backdrop` are
 * deleted from legacy CSS and these two strings replace them, carrying the generated
 * dialog's own values from `ui/dialog.jsx`:
 *
 *     bg-popover  p-6  text-sm  shadow-xl  ring-1  max-w-md  bg-black/30
 *
 * WHY THE CLASSES ARE INLINED HERE rather than importing `DialogContent`. That component
 * renders its own Portal, its own Overlay as a SIBLING of the popup, and a close button.
 * This shell needs the popup to be a CHILD of the backdrop — `overlay-container.js`
 * explains why, and `modal-shell.test.js` pins it — and none of the 13 dialogs want a
 * second close button. So the skin's values are adopted; its structure is not.
 *
 * TWO DEVIATIONS FROM THE SKIN, both deliberate:
 *   · `relative` not `fixed top-1/2 left-1/2 -translate-1/2`. The shell centres by
 *     containment, so the popup must not position itself. This is the row the old
 *     dialog.jsx note called load-bearing.
 *   · `ring-[var(--detached-line)]` not `ring-foreground/10`. Same value, ours by name.
 *
 *     WHAT THIS ROW USED TO SAY, BECAUSE THE CORRECTION IS THE USEFUL PART: it read
 *     `ring-[var(--overlay-line)]` (an OPAQUE #2f2f33) and justified it with "the skin's
 *     readable value is behind `dark:`, a variant this app can never match". That reason
 *     is false, and was false when it was written — `bridge.css` declares
 *     `@custom-variant dark (&)`, so `dark:` matches EVERYWHERE here precisely so that
 *     generated components do not silently lose their dark styling. The skin's value was
 *     always reachable.
 *
 *     What the opaque value cost: `ring-1` is an OUTSET box-shadow, painted outside the
 *     popup on the blurred backdrop rather than on our own panel. An opaque grey there is
 *     the same weight all the way round whatever the page behind it is doing; the
 *     preset's alpha brightens where the page is light and recedes where it is dark. Set
 *     side by side that is the whole difference between the two dialogs, and it is the
 *     one place in the app where an alpha edge is correct — see `--detached-line` in
 *     tokens.css and §4.
 *
 *     It is still spelled as OUR token rather than `foreground/10`, so the exception to
 *     §4's opaque-borders rule is visible in the token layer where that rule lives,
 *     instead of as a bare alpha inside one component.
 *
 * `surface` and `backdrop` stay PROPS because ReplayModal passes its own pair, and its
 * surface deliberately declares no padding. */
const SURFACE = [
  /* `modal` STAYS, and it now declares NOTHING. The rule was deleted; the class remains
     as the hook for nineteen CONTENT rules that still match on it — `.modal header`,
     `.modal footer`, `.modal input`, `.modal button.primary` and the rest. Those style
     what dialogs CONTAIN, not the shell, and they migrate with the screens that own
     them. Dropping the class here would unstyle the inside of all 13 dialogs. */
  'modal',
  'relative w-full max-w-md max-h-[86vh] overflow-hidden overflow-y-auto',
  'rounded-[24px] bg-popover p-6 text-sm text-popover-foreground',
  'shadow-xl ring-1 ring-[var(--detached-line)] outline-none',
].join(' ');

const BACKDROP = [
  'fixed inset-0 z-[2147483000] flex items-center justify-center p-6',
  'bg-black/30 supports-backdrop-filter:backdrop-blur-sm',
].join(' ');

function Modal({
  open = true,
  onClose,
  className,
  surface = SURFACE,
  backdrop = BACKDROP,
  label,
  children,
  ...rest
}) {
  // Handed to every overlay below this modal as its portal container — see the note
  // above. A ref, not state, so it costs no render: `overlay-container.js` says why.
  const popupRef = useRef(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => { if (!next) onClose?.(); }}
    >
      <DialogPortal>
        {/* Our scrim, our centring — see the note above and dialog.jsx. Dismissing on
            an outside click is Base UI's default, so the old `onClick={onClose}` on
            the backdrop is gone rather than reimplemented. */}
        <DialogOverlay className={[backdrop, BACKDROP_MOTION].join(' ')} forceRender>
          <DialogPopup
            ref={popupRef}
            data-overlay-surface=""
            className={[surface, 'select-text', POPUP_MOTION, className].filter(Boolean).join(' ')}
            aria-label={label}
            {...rest}
          >
            <OverlayContainerContext.Provider value={popupRef}>
              {children}
            </OverlayContainerContext.Provider>
          </DialogPopup>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}

export { Modal };
