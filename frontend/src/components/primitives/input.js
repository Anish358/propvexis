/* input.js
 *
 * @design unreviewed — the owner has not signed off how this LOOKS. It is not a
 *   §1 step-1 stop: reuse it in existing screens, but a redesigned screen may not
 *   adopt it until it is reviewed. See test/primitives-status.test.js.
 */

/* Input — PropVexis primitive.
 *
 * Border is `border-input` = var(--line); focus ring is `ring-ring` =
 * var(--accent-ring), so the focus treatment is the app's, not the library's.
 * Renders Base UI's Input, which carries the accessibility contract. */
export { Input } from "@/components/ui/input";
