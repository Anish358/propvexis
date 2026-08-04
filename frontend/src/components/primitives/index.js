/* ===========================================================================
   PropVexis primitives — the ONLY component entry point for application code.
   ===========================================================================

   THE RULE: application code imports from `@/components/primitives`. Nothing
   outside this directory imports from `@/components/ui`.

   WHY THE INDIRECTION IS WORTH IT: `components/ui` is generated. It is
   regenerable and it is not ours — a `shadcn add --overwrite`, a preset change or
   a library upgrade can rewrite any file in it. If pages imported it directly,
   every such regeneration would be a change with unbounded blast radius. With
   this layer in between, regeneration touches files that nothing imports
   directly, and this directory is where we absorb the difference.

   WHY MOST OF THESE ARE RE-EXPORTS: today we add nothing to most primitives, and
   a pass-through component that adds nothing is not free — it is another node in
   every tree and another place for props to get dropped. So each primitive gets
   its own module (the boundary is per-primitive, not one shared barrel), and that
   module re-exports until it has a reason to do more. The day a primitive needs a
   PropVexis default, an accessibility fix or a renamed prop, its module becomes a
   real component and **not one caller changes**. That is the whole point of the
   seam: it is load-bearing before it is used.

   `button.jsx` and `skeleton.jsx` are the worked examples — they wrap, because
   they had reasons to. Button translates the app's existing prop vocabulary
   (variant="primary", size="md", block, as) onto shadcn's, so a page migrates by
   changing one import line rather than by rewriting its JSX.

   KNOWN LIMITATION — REFS. The generated components are plain function components
   written against React 19, where `ref` arrives as an ordinary prop. This project
   is on React 18.3, where it does not: a `ref` passed to one of these is dropped
   with a warning. Base UI itself forwards refs correctly, so the gap is entirely
   in the generated shadcn layer. Nothing here depends on refs yet. When something
   does — focus management or measurement — the fix is to render the Base UI
   primitive directly in that wrapper and reuse the generated variants, rather
   than to hand-edit generated code. Flagged, not silently worked around.
   =========================================================================== */

export { Avatar, AvatarBadge, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage } from './avatar.js';
export { Badge, badgeVariants } from './badge.js';
export { Button, buttonVariants } from './button.jsx';
export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card.jsx';
export { Input } from './input.js';
export { Label } from './label.js';
export { Separator } from './separator.js';
export { Skeleton } from './skeleton.jsx';
export { Spinner } from './spinner.js';
export { Textarea } from './textarea.js';
