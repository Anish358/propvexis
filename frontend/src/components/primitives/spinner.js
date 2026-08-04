/* Spinner — PropVexis primitive.
 *
 * Ships with role="status" and aria-label="Loading" from the generated component,
 * so it announces itself. Pass aria-label to say something more specific.
 *
 * Reduced motion is already honoured: the app's global
 * `@media (prefers-reduced-motion: reduce)` rule targets `*` with !important and
 * is unlayered, so it also governs `animate-spin` here. */
export { Spinner } from "@/components/ui/spinner";
