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
 * ⚠️ THE SKIN IS NOT APPLIED, AND THAT IS A DISCREPANCY WITH A RECORDED DECISION.
 * §19/4b records the owner choosing the generated skin for the modals, deliberately
 * unlike the top bar. What is exported below is `DialogPrimitive.Popup` — Base UI's
 * bare popup — so the modals currently carry **none** of the generated skin: no
 * entrance animation, no `text-sm`, no close button. Stated plainly here rather than
 * left for someone to discover, because the alternative is a comment that describes a
 * component the code does not build. Resolving it is a Category B decision that needs
 * a DESIGN-LANGUAGE §16 motion rule the animation does not yet have.
 *
 * WHY THE SKIN WOULD SHOW THROUGH LESS THAN THAT DECISION IMPLIES, when it is applied.
 * `.modal` in legacy CSS is unlayered and therefore beats every utility for the
 * properties it declares:
 *
 *     background   .modal wins   --panel, not bg-popover's --surface-2
 *     border       .modal wins   1px --line (so `ring-1` must be cancelled, or both draw)
 *     radius       .modal wins   --r-2xl — and the skin agrees, via --radius-4xl
 *     padding      .modal wins   24px — and the skin agrees, p-6
 *     shadow       .modal wins   --sh-3 — and the skin agrees, now that --shadow-xl is bridged
 *     width        .modal wins   560px, and each variant class its own
 *     position     .modal wins   relative — see modal.jsx, this one is load-bearing
 *
 * That last row is why the skin cannot simply be pasted on: its centring is
 * `fixed top-1/2 left-1/2 -translate-1/2`, and `.modal { position: relative }` beats it.
 * The shell centres by containment instead; `modal.jsx` carries the full argument.
 *
 * So what the skin would genuinely add is the **entrance animation**, `text-sm` (13px,
 * the §3 body role, where modals currently inherit 14px), and the close button — a
 * smaller visual delta than "adopt the skin" sounds. The real prize here is behavioural,
 * exactly as it was for the top bar.
 *
 * THREE UTILITIES WOULD HAVE TO BE CANCELLED, since `.modal` declares none of them:
 *   `grid`    -> `block`   .modal is a scrolling block, not a grid
 *   `gap-6`   -> `gap-0`   every modal's contents already carry their own margins —
 *                          the same doubling that bit the Card (see card.jsx)
 *   `ring-1`  -> `ring-0`  .modal already draws a 1px border; both would show
 *
 * AND ONE COULD NOT BE FIXED HERE. The generated Dialog uses `sm:max-w-md` and
 * `sm:flex-row sm:justify-end`, and bridge.css deliberately clears Tailwind's
 * min-width breakpoints (§4 — mixing max- and min-width conventions is how responsive
 * bugs get written). Those three utilities compile to NOTHING. For width it is
 * harmless: `.modal`'s own width wins anyway. For `DialogFooter` it is not — the footer
 * would stay `flex-col-reverse` instead of becoming a right-aligned row, so the shell
 * does not use `DialogFooter`; modals keep their own `<footer>`, which legacy CSS
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
