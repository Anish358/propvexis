/* dialog.jsx
 *
 * @design approved 2026-09-07 — the owner has not signed off how this LOOKS. It is not a
 *   §1 step-1 stop: reuse it in existing screens, but a redesigned screen may not
 *   adopt it until it is reviewed. See test/primitives-status.test.js.
 */

import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';

import {
  Dialog, DialogClose, DialogDescription as UiDialogDescription, DialogFooter,
  DialogHeader, DialogOverlay, DialogPortal, DialogTitle as UiDialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

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
 * THE RESPONSIVE PROBLEM THIS USED TO RECORD IS GONE. What stood here said the generated
 * `sm:max-w-md` and `sm:flex-row sm:justify-end` compile to NOTHING, because bridge.css
 * clears Tailwind's min-width breakpoints — so `DialogFooter` would stay
 * `flex-col-reverse` instead of becoming a right-aligned row, and modals had to keep
 * their own `<footer>`. That was true when `--breakpoint-*: initial` was the last word on
 * it. bridge.css now declares `--breakpoint-sm: 40rem` and `--breakpoint-md: 900px` for
 * exactly this case — a component's own stacked-vs-side-by-side switch, which is not an
 * app breakpoint — so both variants compile and `DialogFooter` lays out correctly.
 * Verified on the Test page: the shell's footer is a right-aligned row.
 */

/* ── THE HEADER TAKES THE ALERT DIALOG'S TREATMENT, NOT THE PLAIN DIALOG'S (owner,
 *    2026-09-07, from a side-by-side against the preset's own alert dialog) ──
 *
 * The registry ships TWO confirm surfaces and styles their headers differently:
 *
 *     AlertDialogTitle        text-lg font-medium                18px, line box 28px
 *     DialogTitle             text-base leading-none font-medium 16px, line box 16px
 *
 * Our `Modal` is one shell for all 13 dialogs and every one of them is the ALERT shape —
 * a question with two answers — so it is the alert dialog we are measured against. Built
 * on `Dialog`, it was inheriting the quieter of the two, and both halves compounded: two
 * pixels smaller AND a line box twelve pixels shorter. With the same `gap-1.5` between
 * title and description, `leading-none` costs about 5px of optical space under the title
 * that the preset has, so the header read nearly twice as tight as its reference.
 *
 * That was the whole of the "density is different" report, and NONE of it was spacing:
 * `--spacing` is `--s-1` = 4px, Tailwind's own base, so p-6, gap-6, gap-1.5 and gap-2 all
 * resolve identically on both sides. The box model was never the difference.
 *
 * `leading-7` IS the value, not an approximation: Tailwind's paired line-height for
 * `text-lg` is calc(1.75 / 1.125) = 28px, and `leading-7` on our 4px spacing base is
 * 7 x 4 = 28px exactly. It is written because tailwind-merge can REPLACE the generated
 * `leading-none` but cannot delete it — there is no utility for "inherit the paired
 * value", so the paired value is restated as the utility that equals it.
 *
 * ── AND THE DESCRIPTION TAKES THE PRESET'S GREY ──
 *
 * `text-muted-foreground` resolves to `--text-2` (#c9c9d1) here, against the preset's
 * #a1a1aa, so our body copy read a step brighter than its reference. `--text-2` is the
 * owner-locked colour for LABELS AND METADATA app-wide and it is not being changed — a
 * dialog's description is body copy, not metadata, so the exception is absorbed here.
 *
 * This is the second time the same divergence has been absorbed in a wrapper rather than
 * in the bridge, after `menu.jsx` did it for menu labels, and the reasoning is identical:
 * `--muted` IS zinc-400 (#a1a1aa), the preset's value exactly, so the fix is a token and
 * repointing `--color-muted-foreground` globally would re-colour every screen.
 *
 * `text-balance md:text-pretty` is copied verbatim from `AlertDialogDescription` rather
 * than chosen — the point is to render what the reference renders. (`md:` is live at
 * 900px, `sm:` at 640px; the note further down claiming both compile to nothing is from
 * before `--breakpoint-sm`/`-md` were declared in bridge.css.) */
const TITLE = 'text-lg leading-7';
const DESCRIPTION = 'text-[var(--muted)] text-balance md:text-pretty';

function DialogTitle({ className, ...rest }) {
  return <UiDialogTitle className={cn(TITLE, className)} {...rest} />;
}

function DialogDescription({ className, ...rest }) {
  return <UiDialogDescription className={cn(DESCRIPTION, className)} {...rest} />;
}

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
