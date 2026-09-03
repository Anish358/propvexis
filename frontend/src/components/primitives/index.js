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

// NOTE: only the `default` and `error` variants render — see alert.jsx.
export { Alert, AlertAction, AlertDescription, AlertTitle } from './alert.jsx';
export { Avatar, AvatarBadge, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage } from './avatar.js';
export { Badge } from './badge.jsx';
export { Button, ButtonDot, ButtonLabel, buttonVariants } from './button.jsx';
export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card.jsx';
// A count, not a status — see count-badge.jsx for why this is separate from Badge.
export { CountBadge } from './count-badge.jsx';
export {
  Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogOverlay,
  DialogPopup, DialogPortal, DialogTitle, DialogTrigger,
} from './dialog.jsx';
export { EmptyState } from './empty-state.jsx';
export { Field, FieldDescription, FieldError, FieldItem, FieldLabel } from './field.jsx';
export { Input } from './input.js';
export { Label } from './label.js';
export { LoadingBlock } from './loading-block.jsx';
export {
  ContentArrival, PageEntrance, SECTION_STEP, useSectionEntrance,
} from './page-entrance.jsx';
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
// The @coss select, with its trigger matched to our Input and its popup rendered from
// the Base UI parts so it takes §6's overlay radius and §7's elevation — see select.jsx.
export { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from './select.jsx';
export {
  Progress, ProgressIndicator, ProgressLabel, ProgressTrack, ProgressValue,
} from './progress.jsx';
export { Separator } from './separator.js';
export { Skeleton } from './skeleton.jsx';
export { Spinner } from './spinner.js';
// The @coss switch, with its OFF state made visible in our dark theme — the preset
// draws a dark thumb on a near-black track. See switch.jsx.
export { Switch } from './switch.jsx';
export { Tabs } from './tabs.jsx';
export { Textarea } from './textarea.js';
export {
  ToggleGroup, ToggleGroupExclusive, ToggleGroupItem, ToggleGroupSeparator,
} from './toggle-group.jsx';
// The Add Account wizard's layout. App-specific like EmptyState and Tabs, and here
// for the same reason: this directory is where application code imports from, and it
// is the only place besides components/ui where a Tailwind utility compiles at all.
export {
  ChoiceCard, ChoiceGrid, ChoiceMark, ChoiceRow, WizardActions, WizardBody, WizardBrand,
  WizardExit, WizardFields, WizardFooter, WizardForm, WizardGroup, WizardHeader,
  WizardHeading, WizardNote, WizardPage, WizardPillars, WizardProgress, WizardRow,
  WizardSearch, WizardSectionTitle,
} from './wizard.jsx';

// The navigation rail. App-specific like the wizard above, and here for the same two
// reasons: application code imports from this directory, and this is one of only two
// places a Tailwind utility compiles at all.
// `RailProvider` and `useRail` are the generated SidebarProvider/useSidebar, re-exported
// under our names so app code keeps ONE import path and never reaches into
// components/ui directly (ui-primitives.test.js asserts that).
export {
  Rail, RailAction, RailAvatar, RailBrand, RailCta, RailDot, RailFooter, RailItem, RailNav,
  RailNudge, RailProvider, RailSoon, RailSub, RailSubItem, RailUser, useRail,
} from './rail.jsx';

// Today's Brief — the dashboard's top card. Here for the same reason as the rail.
export {
  BriefAction, BriefAlert, BriefCard, BriefClock, BriefColumns, BriefEvent, BriefHeader,
  BriefNote, BriefRange, BriefSection,
} from './brief.jsx';

// The KPI row. Here for the same reason as the rail and the brief.
export {
  KpiAside, KpiCard, KpiChip, KpiChips, KpiGauge, KpiLabel, KpiMain, KpiPill,
  KpiRing, KpiRow, KpiValue,
} from './kpi.jsx';

// Account Health — the full-width rule-meter card. Same reasoning as the rail.
export {
  AccountBanner, AccountBannerAction, BANNER_CRITICAL, AccountCardFoot, AccountCardLink,
  AccountCardShell, AccountFootFigure, AccountFootRule, AccountTab, AccountTabMore,
  AccountTabs, Meter, MeterRow,
} from './account.jsx';

// The dashboard's generic content card, its table vocabulary, the action strip and the
// skeleton parts — see panel.jsx.
export {
  ActionStatus, ActionStrip, LoadingNote, PanelBody, PanelCard, PanelCell, PanelFill,
  PanelChip, PanelHead, PanelHint, PanelLink, PanelMeta, PanelRow, PanelRowHead,
  PanelTab, PanelTableCell, PanelTableHead, PanelTableRow, PanelTabs, PanelValue,
  SkeletonBlock, SkeletonLine, SkeletonRegion,
} from './panel.jsx';

// The P&L calendar's cells.
export {
  CalCell, CalCellBody, CalDayNum, CalDow, CalGrid, CalNavButton, CalRoot, CalWeek,
} from './calendar.jsx';

// The top bar's shell and title. Its controls keep their current skin — topbar.jsx
// says why.
export { TopBar, TopBarActions, TopBarTitle } from './topbar.jsx';
