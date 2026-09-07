/* label.js
 *
 * @design unreviewed — the owner has not signed off how this LOOKS. It is not a
 *   §1 step-1 stop: reuse it in existing screens, but a redesigned screen may not
 *   adopt it until it is reviewed. See test/primitives-status.test.js.
 */

/* Label — PropVexis primitive.
 *
 * Renders a plain <label>, so pairing is by htmlFor/id — the generated component
 * does not do that for you.
 *
 * DESIGN-LANGUAGE: labels are Title Case, never all-caps, and carry no extra
 * letter-spacing (N1, N9). Their standard colour is Secondary Text at full
 * opacity. None of that is enforceable from here — it is a usage rule, guarded by
 * the design-token tests. */
export { Label } from "@/components/ui/label";
