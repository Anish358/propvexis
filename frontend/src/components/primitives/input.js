/* input.js
 *
 * @design approved 2026-09-07 — owner signed off Batch 2 (Form controls) as a family
 *   on the Test page. Locked WITH the other six: they share a height, a corner and a
 *   text size, and re-opening one re-opens all. See test/primitives-status.test.js.
 */

/* Input — PropVexis primitive.
 *
 * Border is `border-input` = var(--line); focus ring is `ring-ring` =
 * var(--accent-ring), so the focus treatment is the app's, not the library's.
 * Renders Base UI's Input, which carries the accessibility contract. */
export { Input } from "@/components/ui/input";
