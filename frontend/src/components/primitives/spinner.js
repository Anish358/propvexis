/* spinner.js
 *
 * @design approved 2026-09-08 — owner signed off Batch 3 (Feedback) as a family on
 *   the Test page. Locked WITH the other three: they are the app talking about itself,
 *   and they have to agree. See test/primitives-status.test.js.
 */

/* Spinner — PropVexis primitive.
 *
 * Ships with role="status" and aria-label="Loading" from the generated component,
 * so it announces itself. Pass aria-label to say something more specific.
 *
 * Reduced motion is already honoured: the app's global
 * `@media (prefers-reduced-motion: reduce)` rule targets `*` with !important and
 * is unlayered, so it also governs `animate-spin` here. */
export { Spinner } from "@/components/ui/spinner";
