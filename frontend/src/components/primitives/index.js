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

   REFS — THE LIMITATION IS GONE, AND THE NOTE OUTLIVED IT (corrected 2026-09-09).
   This paragraph used to say the generated components drop refs "because this
   project is on React 18.3, where `ref` is not an ordinary prop". The project is
   on React 19.2 and has been for some time, so a ref reaches these components as
   a plain prop and arrives. That matters rather than being trivia: the whole
   `<TooltipTrigger render={<Badge/>}/>` and `<MenuTrigger render={<Button/>}/>`
   pattern this library uses depends on it, and a note claiming it cannot work is
   an invitation to "fix" a dozen working call sites. Left as a correction rather
   than deleted, because it is the seventh time this review has found a rule
   outliving its reason.

   NOT EVERY MODULE HERE IS LIBRARY-BACKED, AND THAT IS THE POINT. THREE of them —
   EmptyState, LoadingBlock and Tabs — still render the app's `.u-*` classes, because
   no generated component can express what they do yet: EmptyState and LoadingBlock
   have no registry equivalent at all, and Tabs is a documented interaction rule
   rather than a default. Each file says so in its own header. (Badge was the fourth
   until 2026-09-07, when it moved onto the generated component and its legacy rules
   were deleted — which is what finishing one of these looks like.)
   They live here anyway, because the seam is about WHERE application code imports
   from, not about what is behind it. With all of them exported from one place, a
   page has exactly one component import, and swapping any single implementation
   later touches one file and no callers. A module holding the old implementation is
   using this layer correctly, not waiting to.
   =========================================================================== */

// ALL FOUR TONES RENDER. This said "only the `default` and `error` variants render",
// which was true while `--info` and `--success` did not exist and those variants resolved
// to an unstyled box, silently. §17 (owner, 2026-09-06) gave a system message a glyph and
// an edge, the two tokens landed as aliases, and alert.jsx has recorded the full ladder
// since — error · warning · info · success. See it there.
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

// THE DATA TABLE — Cycle 00's centrepiece, and the app's ONLY grid for a page of rows.
// `@shadcn/table` at base-rhea, wrapped. It is deliberately a different object from
// `PanelTable*` below (that one is a card's six-row list); data-table.jsx opens with the
// four differences and why they are not one component with a flag. Presentational only —
// no table engine lives in it, so the eleven other hand-rolled tables can adopt the look
// without adopting TanStack.
export {
  DataTable, DataTableBody, DataTableCell, DataTableDash, DataTableFooter,
  DataTableHeadCell, DataTableHeader, DataTableNote, DataTableNotice, DataTableRow,
  DataTableSelect, DataTableSkeleton, DataTableStack,
} from './data-table.jsx';
export { Field, FieldDescription, FieldError, FieldItem, FieldLabel } from './field.jsx';
export { Checkbox } from './checkbox.jsx';
export { ConsentField } from './consent-field.jsx';
export { Input } from './input.jsx';
export { Label } from './label.jsx';
// Cycle 00 piece 6 — the fourth of §15's states, and the one the app had nowhere to put:
// TWO of seventy-four route-level pages render anything when a fetch fails. A sibling of
// EmptyState on the same shell, kept distinct because §15 says an empty state is not an
// error state — solid edge not dashed, a toned glyph, and a retry. `Alert` is still the
// right answer for a failure INSIDE a working screen; this REPLACES the content.
export { ErrorState } from './error-state.jsx';
export { LoadingBlock } from './loading-block.jsx';
export {
  ContentArrival, PageEntrance, SECTION_STEP, useSectionEntrance,
} from './page-entrance.jsx';
// The shared shell all 11 modals adopt — Phase 4b's payoff. Built on Dialog above.
export { Modal } from './modal.jsx';
export {
  Menu, MenuCheckboxItem, MenuContent, MenuGroup, MenuGroupLabel, MenuItem,
  MenuSeparator, MenuSub, MenuSubContent, MenuSubTrigger, MenuTrigger,
} from './menu.jsx';
// Not a component — the seam that tells an overlay to render INSIDE the modal it was
// opened from, instead of under its scrim. `Modal` provides it, `Sheet` now provides it
// too (Cycle 00 piece 4 — the drawer this comment used to call "the candidate"), and
// `Menu` consumes it. Exported because the barrel is the only door.
export { OverlayContainerContext, useOverlayContainer } from './overlay-container.js';
export { Popover, PopoverContent, PopoverTrigger } from './popover.jsx';
// Cycle 00 piece 3 — the filter builder's two halves. `Command` is a SEARCHABLE LIST,
// which is what a cascade column is; `CommandDialog` is deliberately not wrapped, because
// this product has no palette. FilterChip is the one part of Cycle 00 no registry ships.
export {
  Command, CommandCount, CommandEmpty, CommandGroup, CommandInput, CommandItem,
  CommandList, CommandSeparator,
} from './command.jsx';
// A SELECT YOU CAN TYPE INTO — the list filters as you type. On @shadcn/combobox
// (Base UI), added 2026-09-10 for the Add Trade form's Symbol field, which ships as free
// text today. A Select becomes a Combobox when the list outgrows the EYE, not when it
// outgrows the developer: Session and Direction stay on Select. See combobox.jsx.
export {
  Combobox, ComboboxContent, ComboboxEmpty, ComboboxGroup, ComboboxInput, ComboboxItem,
  ComboboxLabel, ComboboxList, ComboboxTrigger, ComboboxValue,
} from './combobox.jsx';
export {
  FilterChip, FilterChipAdd, FilterChips, FilterChipsTail, FilterCount,
} from './filter-chip.jsx';
// The tooltip — the one overlay with no interaction in it. Cycle 00 piece 2, and the
// component the Trade Log's adherence cell has been faking with a `title=` attribute.
// `TOOLTIP_DELAY` is exported so a caller can state the pause rather than re-pick it.
export {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, TOOLTIP_DELAY,
} from './tooltip.jsx';
// The generated @shadcn select, near enough untouched. This used to read "the @coss
// select, with its trigger matched to our Input and its popup rendered from the Base UI
// parts" — a 250-line wrapper that was re-installed away on 2026-09-07 when the registry
// turned out to have rewritten the component into every override it carried. Two classes
// left, both about forms rather than looks. See select.jsx.
export { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from './select.jsx';
export {
  Progress, ProgressIndicator, ProgressLabel, ProgressTrack, ProgressValue,
} from './progress.jsx';
// Cycle 00 piece 5 — the form SECTION: the group, the grid, the span and the footer.
// The individual field is `Field` above (Batch 2, approved) and is untouched; what these
// add is everything AROUND one. FormSection is @coss/fieldset on Base UI's Fieldset, so
// the grouping is a real <fieldset>/<legend> in the accessibility tree. The footer owns
// the pending/dirty/disabled rule that nine modals currently each decide for themselves.
// ⚠ `columns` on FormGrid is a PROP because a grid-cols-* written in a modal compiles to
// nothing. See form-section.jsx.
export {
  FormFooter, FormGrid, FormSection, FormWide,
} from './form-section.jsx';
// Our calendar in a popover, behind a FIELD-shaped trigger. Replaces `<input type=
// "date">`, which rendered the BROWSER's picker — outside our stylesheet entirely and
// different on every OS. ⚠ NOT `calendar.jsx`: that is the dashboard's P&L month
// heatmap, approved and locked, and a completely different object. See date-picker.jsx.
export { DatePicker } from './date-picker.jsx';
export { Separator } from './separator.jsx';
// Cycle 00 piece 4 — the detail drawer. A skin on the generated @shadcn/sheet, which is
// the same Base UI Dialog `Modal` runs on, pinned to an edge instead of centred. The real
// call site is TradePreview; it still ships on 26 `.tp-*` legacy classes and migrates
// with the Trade Log in Cycle 01. `showCloseButton` is forced off — the header owns the
// close control, see sheet.jsx.
export {
  Sheet, SheetClose, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from './sheet.jsx';
export { Skeleton } from './skeleton.jsx';
export { Spinner } from './spinner.js';
// The @coss switch, with its OFF state made visible in our dark theme — the preset
// draws a dark thumb on a near-black track. See switch.jsx.
export { Switch } from './switch.jsx';
// Cycle 00 piece 7. `Tabs` is the short array form nine screens use; the PARTS are
// exported because that array is why this app grew THREE tab implementations — a caller
// could not reach a trigger, so anything wanting different metrics had to hand-build.
// Richer strips are compositions now, not copies. See tabs.jsx.
export { Tabs, TabsContent, TabsList, TabsRoot, TabsTrigger } from './tabs.jsx';
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
  AccountCardShell, AccountFootFigure, AccountMenuPanel, AccountMenuRow, AccountFootRule, AccountTab, AccountTabMore,
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
