/* separator.js
 *
 * @design unreviewed — the owner has not signed off how this LOOKS. It is not a
 *   §1 step-1 stop: reuse it in existing screens, but a redesigned screen may not
 *   adopt it until it is reviewed. See test/primitives-status.test.js.
 */

/* Separator — PropVexis primitive.
 *
 * Colour is `bg-border` = var(--line). Base UI sets the ARIA role, and marks it
 * decorative when it carries no meaning.
 *
 * §8 IS SETTLED (2026-09-07): a divider is 1px, spans the full width of its container,
 * and is never inset. The generated component already draws exactly that —
 * `h-px w-full bg-border` — so this stays a bare re-export with nothing to correct. */
export { Separator } from "@/components/ui/separator";
