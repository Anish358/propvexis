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

function Modal({
  open = true,
  onClose,
  className,
  surface = 'modal',
  backdrop = 'modal-backdrop',
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
        <DialogOverlay className={backdrop} forceRender>
          <DialogPopup
            ref={popupRef}
            className={[surface, 'select-text', className].filter(Boolean).join(' ')}
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
