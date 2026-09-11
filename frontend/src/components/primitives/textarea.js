/* textarea.js
 *
 * @design approved 2026-09-07 — owner signed off Batch 2 (Form controls) as a family
 *   on the Test page. Locked WITH the other six: they share a height, a corner and a
 *   text size, and re-opening one re-opens all. See test/primitives-status.test.js.
 */

/* Textarea — PropVexis primitive.
 *
 * Same token surface as Input. Note this is the one primitive that will host
 * long-form prose (journal notes), and DESIGN-LANGUAGE §3 leaves maximum measure
 * undecided — so no width or line-height opinion is encoded here yet. */
export { Textarea } from "@/components/ui/textarea";
