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

   NOT EVERY MODULE HERE IS LIBRARY-BACKED, AND THAT IS THE POINT. Four of them —
   Badge, EmptyState, LoadingBlock, Tabs — still render the app's `.u-*` classes,
   because no generated component can express what they do yet: Badge's tones are
   four-sixths domain colours, EmptyState and LoadingBlock have no registry
   equivalent at all, and Tabs is a documented interaction rule rather than a
   default. Each file says so in its own header.
   They live here anyway, because the seam is about WHERE application code imports
   from, not about what is behind it. With all of them exported from one place, a
   page has exactly one component import, and swapping any single implementation
   later touches one file and no callers. A module holding the old implementation is
   using this layer correctly, not waiting to.
   =========================================================================== */

export { Avatar, AvatarBadge, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage } from './avatar.js';
export { Badge } from './badge.jsx';
export { Button, buttonVariants } from './button.jsx';
export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card.jsx';
// A count, not a status — see count-badge.jsx for why this is separate from Badge.
export { CountBadge } from './count-badge.jsx';
export {
  Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogOverlay,
  DialogPopup, DialogPortal, DialogTitle, DialogTrigger,
} from './dialog.jsx';
export { EmptyState } from './empty-state.jsx';
export { Input } from './input.js';
export { Label } from './label.js';
export { LoadingBlock } from './loading-block.jsx';
// The shared shell all 11 modals adopt — Phase 4b's payoff. Built on Dialog above.
export { Modal } from './modal.jsx';
export {
  Menu, MenuCheckboxItem, MenuContent, MenuGroup, MenuGroupLabel, MenuItem,
  MenuSeparator, MenuTrigger,
} from './menu.jsx';
// Not a component — the seam that tells an overlay to render INSIDE the modal it was
// opened from, instead of under its scrim. `Modal` provides it and `Menu` consumes it,
// so nothing needs this until something builds an overlay by hand inside a modal (the
// TradePreview drawer is the candidate). Exported because the barrel is the only door.
export { OverlayContainerContext, useOverlayContainer } from './overlay-container.js';
export { Popover, PopoverContent, PopoverTrigger } from './popover.jsx';
export {
  Progress, ProgressIndicator, ProgressLabel, ProgressTrack, ProgressValue,
} from './progress.jsx';
export { Separator } from './separator.js';
export { Skeleton } from './skeleton.jsx';
export { Spinner } from './spinner.js';
export { Tabs } from './tabs.jsx';
export { Textarea } from './textarea.js';
export {
  ToggleGroup, ToggleGroupExclusive, ToggleGroupItem, ToggleGroupSeparator,
} from './toggle-group.jsx';
// The Add Account wizard's layout. App-specific like EmptyState and Tabs, and here
// for the same reason: this directory is where application code imports from, and it
// is the only place besides components/ui where a Tailwind utility compiles at all.
export {
  ChoiceCard, ChoiceGrid, WizardBody, WizardBrand, WizardFooter, WizardHeader,
  WizardHeading, WizardPage, WizardProgress,
} from './wizard.jsx';
