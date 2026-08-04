import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';

import {
  Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader,
  DialogOverlay, DialogPortal, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';

/* Dialog — PropVexis primitive, and the base of the shared modal shell in
 * `modal.jsx`. Most of this is a re-export; two parts are not, and the reasons are
 * the substance of the modal migration.
 *
 * WHY `DialogContent` IS NOT RE-EXPORTED. The generated one hardcodes
 * `<DialogOverlay />` inside itself with no way to pass a className. Our scrim is
 * `--scrim-3`; the library's is `bg-black/30`, a raw colour literal that the locked
 * "no raw colour anywhere" rule forbids and that the light theme would not flip. So
 * the shell composes portal + overlay + popup itself, which costs six lines and keeps
 * the scrim ours.
 *
 * WHAT THE SKIN ACTUALLY CONTRIBUTES, having measured rather than assumed. The owner
 * chose the generated skin for the modals (unlike the top bar), and it turns out to
 * show through less than that decision implies — because `.modal` in legacy CSS is
 * unlayered and therefore beats every utility for the properties it declares:
 *
 *     background   .modal wins   --panel, not bg-popover's --surface-2
 *     border       .modal wins   1px --line (so `ring-1` must be cancelled, or both draw)
 *     radius       .modal wins   --r-2xl — and the skin agrees, via --radius-4xl
 *     padding      .modal wins   24px — and the skin agrees, p-6
 *     shadow       .modal wins   --sh-3 — and the skin agrees, now that --shadow-xl is bridged
 *     width        .modal wins   640px, and each variant class its own
 *
 * So what the skin genuinely adds is the **entrance animation**, `text-sm` (13px, the
 * §3 body role, where modals previously inherited 14px), and the close button. That is
 * worth having and it is what was chosen — but it is a smaller visual delta than
 * "adopt the skin" sounds, and the real prize here is behavioural.
 *
 * THREE UTILITIES MUST BE CANCELLED or the skin fights the legacy box:
 *   `grid`    -> `block`   .modal is a scrolling block, not a grid
 *   `gap-6`   -> `gap-0`   every modal's contents already carry their own margins —
 *                          the same doubling that bit the Card (see card.jsx)
 *   `ring-1`  -> `ring-0`  .modal already draws a 1px border; both would show
 *
 * AND ONE THAT CANNOT BE FIXED HERE. The generated Dialog uses `sm:max-w-md` and
 * `sm:flex-row sm:justify-end`, and bridge.css deliberately clears Tailwind's
 * min-width breakpoints (§4 — mixing max- and min-width conventions is how responsive
 * bugs get written). Those three utilities therefore compile to NOTHING. For width it
 * is harmless: `.modal`'s own 640px wins anyway. For `DialogFooter` it is not — the
 * footer would stay `flex-col-reverse` instead of becoming a right-aligned row, so the
 * shell does not use `DialogFooter`; modals keep their own `<footer>`, which legacy CSS
 * already lays out correctly. Recorded as an open question: every generated component
 * with a responsive utility has this problem, and there are five more in the tree.
 */

// Base UI's popup, exposed so the shell can build content around our own overlay.
const DialogPopup = DialogPrimitive.Popup;

export {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPopup,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
