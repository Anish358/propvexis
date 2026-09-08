/* checkbox.js
 *
 * @design unreviewed — the owner has not signed off how this LOOKS. It is not a
 *   §1 step-1 stop: reuse it in existing screens, but a redesigned screen may not
 *   adopt it until it is reviewed. See test/primitives-status.test.js.
 */

/* Checkbox — PropVexis primitive.
 *
 * Renders Base UI's Checkbox via the base-rhea generated component, which carries
 * the accessibility contract: the root is a real control, so it is focusable,
 * keyboard-operable with Space, and exposes checked state to assistive tech. The
 * label pairs by htmlFor/id, exactly as Input's does.
 *
 * IT IS NOT DECORATION. The one thing this app uses it for is the credential
 * consent gate, where an unticked box is what stops a trade-capable password
 * being submitted — so the disabled-submit path depends on its state being real
 * rather than styled. Do not swap it for a styled div. */
export { Checkbox } from "@/components/ui/checkbox";
