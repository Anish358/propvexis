import {
  Dialog, DialogOverlay, DialogPopup, DialogPortal,
} from './dialog.jsx';

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
 * `onClose` is kept as the prop name rather than Base UI's `onOpenChange` because all
 * 11 already pass one, several conditionally (`() => !saving && onClose()`), and that
 * logic is theirs to keep.
 */

// Cancels the three skin utilities that would fight the legacy box. See dialog.jsx for
// why each one: .modal is a scrolling block with its own border and its own child
// margins, and the skin assumes a gapped grid with a ring.
const UNSKIN = 'block gap-0 ring-0';

function Modal({
  open = true,
  onClose,
  className,
  label,
  children,
  ...rest
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => { if (!next) onClose?.(); }}
    >
      <DialogPortal>
        {/* Our scrim, not the library's bg-black/30 — see dialog.jsx. Dismissing on
            an outside click is Base UI's default, so the old `onClick={onClose}` on
            the backdrop is gone rather than reimplemented. */}
        <DialogOverlay className="modal-backdrop" />
        <DialogPopup
          className={['modal', UNSKIN, className].filter(Boolean).join(' ')}
          aria-label={label}
          {...rest}
        >
          {children}
        </DialogPopup>
      </DialogPortal>
    </Dialog>
  );
}

export { Modal };
