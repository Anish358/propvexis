/* avatar.js
 *
 * @design unreviewed — the owner has not signed off how this LOOKS. It is not a
 *   §1 step-1 stop: reuse it in existing screens, but a redesigned screen may not
 *   adopt it until it is reviewed. See test/primitives-status.test.js.
 */

/* Avatar — PropVexis primitive (compound: 6 parts).
 *
 * Base UI handles image-load fallback, so AvatarFallback appears only when the
 * image genuinely fails — the behaviour the hand-built version approximated. */
export {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@/components/ui/avatar";
