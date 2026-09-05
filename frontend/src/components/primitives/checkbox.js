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
