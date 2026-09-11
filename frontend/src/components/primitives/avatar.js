/* avatar.js
 *
 * @design approved 2026-09-08 — owner signed off Batch 5 (Small pieces) as a family
 *   on the Test page. See test/primitives-status.test.js.
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
