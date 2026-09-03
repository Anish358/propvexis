import React from 'react';
import { SearchIcon, XIcon } from 'lucide-react';
import { Button } from './button.jsx';
import { Input } from './input.js';
import { Progress, ProgressIndicator, ProgressTrack } from './progress.jsx';
import { cn } from '@/lib/utils';

/* Wizard layout — PropVexis primitive.
 *
 * WHY THIS IS A COMPONENT AND NOT CSS, which is the whole point of the file.
 * tailwind.css scopes `@source` to components/{ui,primitives} only, so a utility
 * written in a page emits nothing and fails silently. DESIGN-LANGUAGE §1 draws the
 * conclusion: "pages are built by composing components, not by writing utilities in
 * place." The Add Account wizard's plan originally styled its eleven pages with
 * hand-written `.naf-*` rules in the 4,470-line legacy stylesheet; this file is what
 * replaces that, so the feature adds zero lines to it. test/new-account-pages.test.js
 * holds both halves — no `.naf-` rule, and no utility in a page.
 *
 * WHY IT LIVES HERE rather than in a new directory. index.js is explicit that not
 * every module here is library-backed and that that is the point — EmptyState,
 * LoadingBlock and Tabs are all app-specific. The seam is about WHERE application
 * code imports from. Adding a third source directory would widen the `@source` scope,
 * which §1 calls out as a deliberate reviewable change; nothing here needs it.
 *
 * `[display:grid]`, NOT `grid`, IN ALL FOUR GRID COMPONENTS — and this is a bug that
 * shipped, not a stylistic tic. legacy/app.css declares `.grid { display: table;
 * min-width: calc(var(--grid-cols, 11) * 92px); table-layout: fixed }` for the Trade
 * Log, UNLAYERED, and index.css is explicit that unlayered rules beat anything Tailwind
 * emits ("the library can only ever add; it cannot outrank"). The legacy rule even says
 * it declares `display` deliberately to win this collision. So every wizard grid was
 * rendering as a 1012px-wide TABLE: the choice cards stacked in one column, each sized
 * to its own text, overflowing the step — which is exactly what the owner reported.
 * `gap-4` does nothing on a table either, so they had no gutter.
 *
 * The arbitrary property emits `.\[display\:grid\]{display:grid}` — a class name no
 * legacy selector can claim — so it is the same declaration under a name that does not
 * collide. It is deliberately NOT a fix to legacy/app.css: renaming that rule touches
 * the Trade Log, its sticky header, print styles and four tests, which is its own
 * change. utility-collisions.test.js pins the legacy side; new-account-pages.test.js
 * now pins this side.
 *
 * EVERY VALUE TRACES TO A RULE. `--spacing` is `--s-1`, so p-2/p-4/p-6/p-8/p-12 are
 * §11's 8px grid exactly (the odd steps 5/7/9/11 are off it and are not used).
 * Radius is §6's assignment by surface: a choice card is a CARD, so it takes the card
 * step rather than the button step, even though it is activated like a button —
 * §6 assigns by surface, which is the same reasoning that makes "an overlay is a card
 * that floats". Elevation is §7 through the bridge (`shadow-sm` -> `--sh-1`, "rests on
 * the page"); no component writes its own shadow. Motion is §10's two durations, with
 * the reduced-motion collapse stated as a variant so it travels with the component.
 */

/* The full-bleed page. A sibling of <Layout>, so there is no sidebar and no filter
 * bar to leave room for — this owns the viewport. */
export function WizardPage({ className, children, ...rest }) {
  return (
    <div
      data-slot="wizard-page"
      className={cn('flex min-h-screen flex-col bg-background text-foreground', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

/* The header row: brand at the left, progress in the middle, exit at the right.
 * Not sticky — the step bodies are short by design (one question each), and a
 * sticky header on a short page is chrome competing with content. */
export function WizardHeader({ className, children, ...rest }) {
  return (
    <header
      data-slot="wizard-header"
      className={cn('flex shrink-0 items-center gap-4 px-6 py-4', className)}
      {...rest}
    >
      {children}
    </header>
  );
}

export function WizardBrand({ className, children, ...rest }) {
  return (
    <div
      data-slot="wizard-brand"
      className={cn('flex shrink-0 items-center gap-2 text-sm font-medium', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

/* Progress. Two facts, one control: the bar for glanceable position and the count
 * for the exact answer, because a bar alone cannot say "two more questions".
 *
 * `Progress` is Base UI's, so it carries role="progressbar" with the aria value
 * attributes — a hand-rolled div pair would have looked identical and told a screen
 * reader nothing, which is the concrete reason this comes from the registry.
 *
 * The count is `tabular-nums` per §3 ("numerics are mono... a column of figures that
 * does not align is a column you cannot scan") — here it stops the label reflowing by
 * a pixel each time the step advances. */
export function WizardProgress({ index, total, className, ...rest }) {
  const safeTotal = Number(total) > 0 ? Number(total) : 1;
  const safeIndex = Math.min(Math.max(Number(index) || 0, 0), safeTotal);
  return (
    <div
      data-slot="wizard-progress"
      className={cn('flex min-w-0 flex-1 items-center justify-center gap-3', className)}
      {...rest}
    >
      <Progress
        value={(safeIndex / safeTotal) * 100}
        // Wider than the 16rem it started at, because the bar is now the only thing
        // at the top of the page carrying position: the step count beside it says
        // "3 of 6", and the bar's job is to make that visible without being read.
        // A 16rem bar advancing a sixth per step moves ~43px, which is a change the
        // eye does not register between two full-page transitions.
        className="max-w-md flex-1"
        aria-label={`Step ${safeIndex} of ${safeTotal}`}
      >
        <ProgressTrack>
          <ProgressIndicator />
        </ProgressTrack>
      </Progress>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {safeIndex} of {safeTotal}
      </span>
    </div>
  );
}

/* The way out, top right — an icon, not the word "Exit".
 *
 * WHY IT IS A COMPONENT AND NOT A `<Button>` IN THE SHELL. An icon-only control needs
 * two things a caller keeps forgetting: an accessible name ("icon-only buttons
 * without labels" is a listed accessibility anti-pattern) and a `title`, so a mouse
 * user gets the same answer on hover that a screen reader gets read out. Stated once
 * here, every caller gets both. The glyph size is the generated Button's own 16px —
 * the same as every other icon button in the app's chrome, so it is not restated.
 *
 * `chrome` + `icon-lg` is the app's existing icon-button pair (button.jsx documents
 * `chrome` as the one control four legacy rules were each hand-writing), so this
 * matches the top bar's icon buttons rather than introducing a fourth shape. §6 files
 * icon buttons under the smaller-chrome radius, which is what the variant already
 * carries — the reason it applies its own `rounded-md` after the button radius.
 *
 * A LABEL, NOT A BARE GLYPH, FOR THE SCREEN READER: "Exit setup" rather than
 * "Close", because this leaves a flow with answers in it — and the draft it leaves
 * behind is resumable, which "Close" would imply is not true. */
export function WizardExit({ label = 'Exit setup', className, ...rest }) {
  return (
    <Button
      variant="chrome"
      size="icon-lg"
      data-slot="wizard-exit"
      aria-label={label}
      title={label}
      className={cn('shrink-0', className)}
      {...rest}
    >
      <XIcon aria-hidden="true" />
    </Button>
  );
}

/* The step container. `key={step}` on this element is what makes React remount it
 * per step, which is both the transition trigger and the reason a step's local state
 * (a typed password, a half-filled percentage) cannot survive into the next step.
 *
 * §10: enter at `--dur`, and reduced motion collapses it to zero rather than to
 * nothing — the step still appears.
 *
 * THE ENTRANCE IS `@starting-style`, NOT `animate-in`, and it STAYS that way — but the
 * reason has changed, so the old note is corrected rather than left to mislead.
 *
 * IT WAS ORIGINALLY A WORKAROUND. tw-animate-css was a dependency that nothing
 * imported, so `animate-in` and `fade-in` compiled to no CSS at all; this component
 * reached for `@starting-style` because the library route was silently dead. That was
 * fixed on 2026-09-03 — tailwind.css imports the library now, and §10’s modal entrance
 * is closed rather than OPEN.
 *
 * SO WHY NOT SWITCH? Because a wizard step is not an overlay. `animate-in` is built for
 * something that opens over the page and closes again, and it is driven by
 * `data-open`/`data-closed` — a wizard step has neither state. It is content being
 * REPLACED in place, keyed on `step`, and `starting:opacity-0` on a plain transition
 * expresses exactly that with no keyframes and nothing to keep in step. Switching now
 * would be churn in pursuit of consistency with a component this one is not.
 *
 * Verified to emit real `@starting-style` CSS. */
/* THE MEASURE IS PER STEP, because the steps are not the same shape and the reference
 * varies it the same way. `wide` is the step that lays its controls out in a GRID rather
 * than asking a single question: two columns of fields need room for two labels and two
 * values, and 42rem gives each column less than a text input wants. `narrow` is a step
 * whose answers are LIST ROWS — at 42rem a two-column list of 40px marks and short labels
 * is mostly empty space between the mark and the next column, which is why the reference
 * draws its broker picker in about 27rem and its card row in twice that.
 *
 * A TABLE OUT HERE RATHER THAN A TERNARY INSIDE `cn()`, and that is not a style
 * preference: utility-collisions.test.js reads every string literal inside a cn() call as
 * a class the library ships, so a prop VALUE written there — `size === 'wide'` — is
 * indexed as a utility named `wide`. Legacy CSS has a `.wide` rule, so it reported a real
 * collision for a string that never reaches an element. Variant values belong in a table;
 * only classes belong inside cn(). */
/* 48rem for `wide`, down from 56rem: it was sized for two columns of CARD GRIDS, and
 * since the account page became a form of dropdowns and inputs, 56rem stretched each
 * field to about 26rem — a text input twice as wide as anything anyone types into it. */
const BODY_MEASURE = { wide: 'max-w-3xl', narrow: 'max-w-md', default: 'max-w-2xl' };

export const WizardBody = React.forwardRef(function WizardBody(
  { className, size = 'default', children, ...rest }, ref,
) {
  return (
    <main
      ref={ref}
      data-slot="wizard-body"
      // FOCUSABLE ONLY PROGRAMMATICALLY. The shell focuses this on every step change:
      // a wizard swaps its content under a fixed header, so without it a screen-reader
      // user is left wherever they were with no signal that the question changed, and a
      // URL change announces nothing by itself. Focusing the container reads the new
      // <h1> AND repositions the cursor, so the next Tab lands inside the new step
      // instead of back in the old one.
      //
      // `-1` keeps it out of the tab order, so it is not a stop a keyboard user has to
      // pass through — which is also why there is no focus ring on it. §9 requires a
      // visible focus state on INTERACTIVE elements; a container that cannot be reached
      // by Tab is not one, and drawing a ring around the whole step on every advance
      // would read as an error state.
      tabIndex={-1}
      className={cn(
        'mx-auto flex w-full flex-1 flex-col justify-center gap-8 px-6 py-12',
        BODY_MEASURE[size] || BODY_MEASURE.default,
        'outline-none',
        'transition-opacity duration-[var(--dur)] ease-[var(--ease)] starting:opacity-0 motion-reduce:duration-0',
        className,
      )}
      {...rest}
    >
      {children}
    </main>
  );
});

/* One question per step, so the heading is the question and the description is
 * whatever the user needs to answer it honestly. Weight caps at 600 per §3, and
 * `text-balance` keeps a two-line heading from leaving one orphaned word.
 *
 * `align="center"` is the owner's reference layout for a step that is NOTHING BUT a
 * question and a row of answers — the question sits over the middle of the row it
 * belongs to, which is where the eye already is. It is a prop rather than the new
 * default because it is wrong for every step that also collects fields: a centred
 * heading over a left-aligned form is two axes competing, and the merged account
 * page has five fields under its heading.
 *
 * THE SIZE DOES NOT CHANGE WITH THE ALIGNMENT. The reference draws a much larger
 * hero heading; `text-2xl` is `--fs-page-title`, and §3 ("type scale roles are ours")
 * is 🔒 LOCKED, so a bigger question would need a new role and an amendment, not a
 * value picked here. Centring is a layout decision and needs neither.
 *
 * The description gets a measure in centred mode. Centred prose running the full
 * width of the card row gives every line a different start point, which is the one
 * thing centred text cannot afford. */
export function WizardHeading({
  eyebrow, title, description, align = 'start', className, ...rest
}) {
  const centred = align === 'center';
  return (
    <div
      data-slot="wizard-heading"
      className={cn('flex flex-col gap-2', centred && 'items-center text-center', className)}
      {...rest}
    >
      {/* The flow's name above the step's question — the reference's "Add Trades" over
          "Choose Broker". It answers "where am I" in a full-page takeover that has no
          sidebar and no breadcrumb, which the progress bar can only answer as a
          fraction. NOT a heading element: it is a label for the h1 below it, and an
          <h2> above an <h1> would invert the document outline for a screen reader.
          Muted rather than tinted — the reference gives it a brand tint, and §4 spends
          brand blue on primary actions and data only. */}
      {eyebrow ? (
        <p className="text-xs font-medium text-muted-foreground">{eyebrow}</p>
      ) : null}
      <h1 className="text-balance text-2xl font-semibold tracking-tight">{title}</h1>
      {description ? (
        <p className={cn('text-pretty text-sm text-muted-foreground', centred && 'max-w-lg')}>
          {description}
        </p>
      ) : null}
    </div>
  );
}

/* The search field, with the magnifier inside its trailing edge — the reference's
 * layout exactly.
 *
 * WHY THIS IS A COMPOSITION AND NOT THE REGISTRY BLOCK, which the build order would
 * otherwise require. @coss ships `p-input-group-20` ("Input group with search icon")
 * and it is the right component; `shadcn add @coss/input-group` was run to get it.
 * It arrives depending on a NEWER generated `Input` and `Textarea` — the CLI rewrote
 * both — and those are not drop-in: the new Input renders an extra wrapper `<span>`
 * with its own border and a hand-written `before:` shadow, changes the field height off
 * `h-8`, and the new Textarea renders through `FieldPrimitive.Control`, so a textarea
 * outside a `<Field>` is a different component than the one the journal note is written
 * against. Adopting all of that changes every input in eleven modals, Settings and the
 * journal at once. That is its own change with its own review, so it was reverted and
 * this composes the Input primitive we already have — build-order step 3 ("a
 * composition of those"), not step 4. The preset still supplies the field's skin.
 *
 * `type="text"`, not `type="search"`: Chrome draws its own cancel button at the
 * trailing edge of a search input, which is exactly where the magnifier sits. The
 * caller passes `aria-label` — the icon is the visible label, and an icon is not a
 * name. */
export function WizardSearch({ className, ...rest }) {
  return (
    <div data-slot="wizard-search" className={cn('relative w-full', className)}>
      {/* `pe-9` clears the icon, so a long query scrolls under the field's edge rather
          than under the glyph. */}
      <Input type="text" autoComplete="off" className="pe-9" {...rest} />
      <SearchIcon
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 end-3 my-auto size-4 text-muted-foreground"
      />
    </div>
  );
}

/* A label over a group of answers — the reference's "Popular Brokers".
 *
 * A REAL <h2>, because it names a section of the page and the step's question is the
 * <h1> above it. `text-base` is the card-title role (15px), which is the step below the
 * page title and the step above body text — the same relationship the reference draws.
 * Weight stops at medium per §3's 600 ceiling. */
export function WizardSectionTitle({ className, children, ...rest }) {
  return (
    <h2
      data-slot="wizard-section-title"
      className={cn('text-base font-medium', className)}
      {...rest}
    >
      {children}
    </h2>
  );
}

/* One line of quiet prose inside a step — "nothing matched", "this is optional".
 * Exists because a page cannot set a type size or a colour: `text-sm
 * text-muted-foreground` written in a step file compiles to nothing. */
export function WizardNote({ className, children, ...rest }) {
  return (
    <p
      data-slot="wizard-note"
      className={cn('text-pretty text-sm text-muted-foreground', className)}
      {...rest}
    >
      {children}
    </p>
  );
}

/* A step's form: the field(s) and the action that leaves the step.
 *
 * It exists because a page cannot space its own children — a `gap-6` written on a
 * <form> in a step file emits no CSS. That is the constraint doing its job rather
 * than getting in the way: the spacing between a field and its Continue button is a
 * layout decision, and layout decisions belong where they can be stated once.
 *
 * `items-start` so the action sizes to its label instead of stretching the width of
 * the page, which is what a stretched primary button on a one-field step looks like. */
export function WizardForm({ stretch = false, className, children, ...rest }) {
  return (
    <form
      data-slot="wizard-form"
      noValidate
      className={cn(
        'flex flex-col gap-6',
        // `items-start` so a lone action sizes to its label instead of stretching the
        // width of the page. `stretch` is for a form that is a GRID of fields rather
        // than one question: its rows have to fill the measure, or a two-column layout
        // collapses to the width of its longest label.
        stretch ? 'items-stretch' : 'items-start',
        className,
      )}
      {...rest}
    >
      {children}
    </form>
  );
}

/* The step's own action, centred under the question it answers.
 *
 * DISTINCT FROM WizardFooter, which is the SHELL's row and holds Back. This is a
 * control that belongs to the step's content: on a step whose whole body is a
 * question and a row of answers, the thing that leaves it reads as the last item of
 * that column, not as page chrome pinned to the bottom of the viewport. The
 * reference puts it exactly there.
 *
 * IT IS A NARROW COLUMN, NOT `justify-center`, because the action inside it is
 * `block` — a primary button stretched across the full measure of the step is the
 * shape a stretched submit button has on a one-field form, which WizardForm already
 * avoids with `items-start`. 20rem is about the width of one choice card, so the
 * action lines up with the row above it instead of floating at some other width.
 *
 * `self-center` rather than `mx-auto`: the body is a flex column, so centring is the
 * child's business there, and a margin would fight `gap-8` on a narrow viewport. */
export function WizardActions({ stretch = false, className, children, ...rest }) {
  return (
    <div
      data-slot="wizard-actions"
      className={cn(
        'flex w-full flex-col items-stretch gap-3 self-center',
        // `stretch` fills the step's own measure instead of the 20rem column. It is for
        // a step that is ALREADY narrow: the reference runs its Continue edge to edge
        // with the search field and the list above it, and a 20rem button centred under
        // a 25rem list is a third alignment on a page that has two.
        stretch ? 'max-w-none' : 'max-w-xs',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/* The welcome step's three pillars. Same auto-fit grid as ChoiceGrid and separate
 * from it on purpose: these cards are not choices, and a reader finding <ChoiceGrid>
 * wrapped around three non-interactive cards would reasonably read it as a bug. */
export function WizardPillars({ className, children, ...rest }) {
  return (
    <div
      data-slot="wizard-pillars"
      className={cn('[display:grid] gap-4 [grid-template-columns:repeat(auto-fit,minmax(12rem,1fr))]', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

/* A wrapping row — the import step's three counts, the detected-column chips. Its own
 * component for the same reason as WizardGroup: a page cannot space its own children,
 * and `flex-wrap` matters here because a statement with eight detected columns must
 * wrap rather than overflow the step. */
export function WizardRow({ className, children, ...rest }) {
  return (
    <div
      data-slot="wizard-row"
      className={cn('flex flex-wrap items-center gap-2', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

/* THE two-up field grid — the account page's whole layout, and the credential step's
 * login/password pair. It collapses to one column on a narrow viewport with no
 * breakpoint, same auto-fit reasoning as ChoiceGrid.
 *
 * 16rem, NOT 12rem, AND THAT IS WHAT MAKES IT TWO COLUMNS. `auto-fit` fits as many
 * tracks as the floor allows: at the account page's measure a 12rem floor fits THREE,
 * so the owner's two-up sketch rendered as a three-across grid with a ragged last row.
 * 16rem fits exactly two there and still two at the default measure, and a pair of
 * fields is unaffected either way because empty tracks collapse.
 *
 * `items-start` so a field that grows — the size select opening a second input under
 * itself for a custom amount — does not stretch the field beside it. It also replaces
 * WizardPair, which was this same grid with a different gap: two components differing
 * only in spacing were two answers to one question. */
export function WizardFields({ className, children, ...rest }) {
  return (
    <div
      data-slot="wizard-fields"
      className={cn('[display:grid] w-full items-start gap-6 [grid-template-columns:repeat(auto-fit,minmax(16rem,1fr))]', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

/* A group of controls inside a step — the platform grid's search box above its cards,
 * or the live path's broker field beside them. Same reason as WizardForm. */
export function WizardGroup({ className, children, ...rest }) {
  return (
    <div
      data-slot="wizard-group"
      className={cn('flex flex-col gap-4', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

/* The action row. Back sits left and the primary action right, so the primary
 * action lands under the thumb on a narrow viewport and at the end of the reading
 * order on a wide one. Back is rendered by the caller only when it can go back —
 * a disabled Back on the first step is a control that explains nothing. */
export function WizardFooter({ className, children, ...rest }) {
  return (
    <footer
      data-slot="wizard-footer"
      className={cn('flex shrink-0 items-center justify-between gap-4 px-6 py-4', className)}
      {...rest}
    >
      {children}
    </footer>
  );
}

/* The choice grid. `auto-fit` with a floor rather than a column count, so two cards
 * sit side by side on a wide viewport and stack on a narrow one without a breakpoint
 * — §4 clears Tailwind's min-width breakpoints (max-width only), and a layout that
 * needs no breakpoint at all cannot pick the wrong convention. */
/* Cards carry a title AND a description, so their floor is a readable measure.
 *
 * ROWS are a mark and a label. The floor is what a 40px mark plus "Interactive Brokers"
 * needs and no more, so two columns fit the narrow measure the reference uses — at the
 * card floor the same list would collapse to one column and run down the page.
 *
 * THE ROW GUTTER IS MEASURED FROM THE REFERENCE, not chosen: its rows are 50px tall on a
 * 69px pitch, so the air between them is wider than the padding inside them. That is what
 * makes a list read as a list rather than as a block of buttons — 16px here against the
 * row inset of 4px, and both are steps on §11's scale (a 19px gutter is not).
 *
 * A table for the same reason as BODY_MEASURE: variant values do not belong inside cn(). */
const CHOICE_GRID = {
  cards: 'gap-4 [grid-template-columns:repeat(auto-fit,minmax(15rem,1fr))]',
  rows: 'gap-4 [grid-template-columns:repeat(auto-fit,minmax(12rem,1fr))]',
};

export function ChoiceGrid({ layout = 'cards', className, children, ...rest }) {
  return (
    <div
      data-slot="choice-grid"
      data-layout={layout}
      className={cn('[display:grid]', CHOICE_GRID[layout] || CHOICE_GRID.cards, className)}
      {...rest}
    >
      {children}
    </div>
  );
}

/* The mark: the small square that identifies an option — a logo, a glyph, or the
 * firm's initials when there is no asset for it.
 *
 * ONE COMPONENT FOR BOTH SIZES so the selected-state behaviour is written once. It
 * steps from `--sel-bg` to `--sel-bg-strong` when the option is chosen, because
 * `data-selected` fills the option itself with `--sel-bg` and a mark that stayed there
 * would vanish into the surface at the moment it matters most. §4 names exactly those
 * two tokens for selection, and neither is tinted: the reference colours both the tile
 * and the glyph with its brand hue, and "selection chrome is grayscale, never tinted"
 * is 🔒 LOCKED.
 *
 * RADIUS BY WHAT IT SITS IN, which is §6 read literally. In a card (`lg`) the container
 * is `--r-2xl`, so the mark takes the step below it, `--r-xl`. In a row (`md`) the
 * container is a button at `--r-lg` and the mark matches it — at an 8px inset two equal
 * radii read as concentric, and a smaller one would read as a chip inside a row.
 *
 * IT NEEDS `group` ON THE OPTION to see the state — ChoiceCard and ChoiceRow both set
 * it. Tailwind has no parent selector, and passing `selected` down as well would put
 * one fact in two places. */
const MARK_SIZE = { lg: 'size-12 rounded-xl', md: 'size-10 rounded-lg' };

export function ChoiceMark({ size = 'md', className, children, ...rest }) {
  return (
    <span
      data-slot="choice-mark"
      className={cn(
        'flex shrink-0 items-center justify-center',
        'bg-muted text-sm font-medium text-muted-foreground',
        'group-data-selected:bg-sel-bg-strong group-data-selected:text-foreground',
        MARK_SIZE[size] || MARK_SIZE.md,
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

/* A choice ROW — a mark, a label, and nothing else. The reference's broker picker.
 *
 * A ROW RATHER THAN A CARD IS AN INFORMATION DECISION, not a visual one. A card exists
 * to carry a description; these options do not have one, because the label IS the whole
 * answer — a trader looking for FTMO is looking for the word FTMO, and a sentence under
 * it would be filler. Two columns of rows put eight of them in the space four cards
 * would take, which is why the reference lists brokers this way and asks "whose money"
 * with cards.
 *
 * THE STATE LIVES IN THE BORDER, NOT THE FILL, and that is deliberate. `--surface-hover`
 * (#262626) and `--sel-bg` (#27272a) are a hair apart by design — they are neighbours on
 * the same neutral ramp — so a hover fill and a selected fill cannot be told apart on
 * their own. The border and the mark carry the state; the fill only says "the pointer is
 * here". That also makes the row immune to a cascade race between its hover and its
 * selected rule, which is the class of bug this file has now hit three times.
 *
 * `hover:bg-accent` AND `dark:hover:bg-accent` because the generated ghost variant ships
 * both halves (`hover:bg-muted` and `dark:hover:bg-muted/50`) and `cn()` is
 * tailwind-merge: same variant chain plus same property means REPLACED, not raced. The
 * dark half is not optional — bridge.css defines `dark:` as
 * `html:not([data-theme="light"])`, so it is live by default in this dark-first app,
 * and leaving it would let a half-transparent fill darken the row on hover.
 */
export function ChoiceRow({
  mark, title, badge, selected, disabled, className, ...rest
}) {
  return (
    <Button
      variant="ghost"
      data-slot="choice-row"
      data-selected={selected ? 'true' : undefined}
      aria-pressed={typeof selected === 'boolean' ? selected : undefined}
      disabled={disabled}
      // Same reason as ChoiceCard: a disabled option's reason has to stay reachable.
      focusableWhenDisabled={disabled || undefined}
      className={cn(
        // `px-3 py-1` IS THE REFERENCE'S OWN INSET, measured: its rows sit 12px in from
        // the row's edge and 5px above and below the 40px mark, which lands the row at
        // 50px tall. `p-2` on every side made a 58px row — the same content reading as a
        // chunky button instead of a list item. 4px is `--s-1`, the smallest step on
        // §11's scale.
        'group h-auto w-full justify-start gap-3 whitespace-normal px-3 py-1 text-left',
        // §6: it is a button, so it takes the button radius. A transparent border at
        // rest, so gaining one when chosen cannot shift the label by a pixel.
        'rounded-lg border border-transparent',
        'hover:bg-accent dark:hover:bg-accent',
        'data-selected:border-ring data-selected:bg-muted',
        'disabled:cursor-not-allowed disabled:opacity-100 disabled:text-muted-foreground',
        'aria-disabled:cursor-not-allowed aria-disabled:opacity-100 aria-disabled:text-muted-foreground',
        className,
      )}
      {...rest}
    >
      {mark}
      {/* `truncate` rather than wrap: every row in the grid is one line tall, and a
          two-line label would break the alignment of the whole column. */}
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
      {badge}
    </Button>
  );
}

/* A choice card.
 *
 * IT IS A BUTTON, NOT A RADIO, AND THAT IS AN ACCESSIBILITY DECISION rather than a
 * styling one. The @coss radio-group card block (`p-radio-group-4`) is the obvious
 * candidate and is wrong for a step where CHOOSING IS THE ACTION: Base UI's radio
 * group selects as the arrow keys move focus, so a keyboard user arrowing across the
 * options would fire the choice — and advance the wizard — on every key press. A
 * button does one thing when it is activated.
 *
 * THAT ARGUMENT SURVIVED THE CAPITAL STEP GAINING A CONTINUE BUTTON, which is worth
 * saying because it removes the argument's original premise: with an explicit
 * Continue, arrowing across the options would no longer advance the wizard, so the
 * radio group stops being disqualified by that. It is still not what this is. Every
 * card step in the flow — firm, size, product, phase, platform, import method — is
 * already this control with `selected` passed in, so switching one of them to a radio
 * group would make two shapes for one decision; and the radio block styles its
 * checked state `border-primary/48`, which §4 forbids outright.
 *
 * The radio block also styles its checked state `border-primary/48`, which §4
 * forbids outright: "selection chrome is grayscale, never tinted." Nothing here is
 * brand-tinted; the chosen card reads through the neutral ring, and `aria-pressed`
 * carries the same fact to a screen reader.
 *
 * §14 read literally: this control HAS a border at rest, so hover brightens the edge
 * rather than filling the surface with a colour it was not already wearing. It gets a
 * keyboard twin for free by being a real button.
 */
export function ChoiceCard({
  title, description, icon, badge, selected, disabled, align = 'start', className, ...rest
}) {
  const centred = align === 'center';

  /* THE SIZE GOES ON THE ICON, NOT ON A `[&_svg]` UTILITY ABOVE IT, and that is a
   * finding about the generated Button rather than a style choice. Its cva base ends
   * with `[&_svg:not([class*='size-'])]:size-4`, whose compiled selector is
   * `svg:not([class*=size-])` — one attribute selector MORE specific than the
   * `[&_svg]:size-N svg` a wrapper emits. So a size written on an ancestor loses, in
   * silence, and the glyph renders at 16px however large the wrapper asks for. Verified
   * in the built stylesheet, the same way the `data-selected` variant was.
   *
   * Cloning is the mechanism that `:not([class*='size-'])` exists FOR: it is the
   * generated component's own way of saying "if the icon declares a size, that wins".
   * With `size-6` on the svg itself the guard stops matching and there is one rule on
   * the element instead of two racing. The caller's own class comes last so an icon that
   * arrives already sized keeps its own.
   *
   * The row variant below is deliberately left alone: its `[&_svg]:size-5` loses the
   * same race and has been rendering at 16px since it was written. Fixing it changes
   * the platform, import and firm grids, which are not this page — flagged here rather
   * than quietly rolled in. */
  const sizedIcon = centred && React.isValidElement(icon)
    ? React.cloneElement(icon, { className: cn('size-6', icon.props.className) })
    : icon;

  return (
    <Button
      variant="secondary"
      data-slot="choice-card"
      // `'true'`, NOT `''`. Tailwind v4 compiles the `data-selected:` variant to
      // `:where([data-selected=true])` — it matches the VALUE, not the attribute's
      // presence. An empty-string attribute is present and never matches, so the
      // selected state compiled to real CSS that could not fire: the cards simply never
      // highlighted, with nothing in the build or the tests to say so.
      data-selected={selected ? 'true' : undefined}
      // THE STATE HAS TO BE ANNOUNCED, NOT ONLY DRAWN. `data-selected` is a styling
      // hook and reads as nothing to a screen reader, so before this a card that was
      // chosen was indistinguishable from the one beside it — and on a select-then-
      // Continue step that is the whole state of the page. `aria-pressed` is the right
      // property for a button that holds a state, and it is set only when the caller
      // actually passes `selected`: a card that is a plain action (nothing to hold)
      // must not claim to be a toggle.
      aria-pressed={typeof selected === 'boolean' ? selected : undefined}
      disabled={disabled}
      // A DISABLED CARD STAYS REACHABLE BY KEYBOARD, and that is the point of the
      // state. What explains it is the BADGE, which renders inside this button and so
      // becomes part of its accessible name: a keyboard user lands on "MetaTrader 4,
      // Soon" rather than on a dead name. It used to be the card's description — every
      // platform card carried a mandatory blurb for exactly that — and the blurbs came
      // out with the rest of the explanation text on 2026-08-25; platformCatalog.js's
      // header records the handover. A natively-disabled button is removed from the tab
      // order entirely, so without this a keyboard or screen-reader user would find a
      // gap in the grid instead of an answer.
      // Base UI keeps it focusable and swaps the native attribute for aria-disabled,
      // which is why the styles below target both.
      focusableWhenDisabled={disabled || undefined}
      className={cn(
        // `group` so the icon tile below can read this card's own selected state.
        // Tailwind has no parent selector, and the alternative — passing `selected`
        // into the tile as well — would put one fact in two places.
        'group',
        // §6: a card surface takes the card radius, not the button step.
        'h-auto items-start rounded-2xl border-border bg-card p-6 text-left shadow-sm',
        'flex flex-col gap-2 whitespace-normal',
        // The centred variant: the reference's layout, and the reason it needs its own
        // spacing is the icon tile — a 3rem block above the title reads as a header for
        // it, so the gap that separates the two of them from the description has to be
        // larger than the gap inside the pair.
        centred && 'items-center gap-3 p-8 text-center',
        // §14: it wears an edge, so the edge is what intensifies.
        //
        // `not-data-selected:` ON THE BACKGROUND HALF, because the plain `hover:bg-card`
        // this replaces UNDID the selection while the pointer was over it. Verified in
        // the built stylesheet: the selected rule compiles to
        // `.data-selected\:bg-muted:where([data-selected=true])`, and `:where()`
        // contributes NOTHING to specificity, so a one-class-plus-`:hover` rule outranks
        // it. Hovering the card you had just chosen returned it to the unchosen fill —
        // which on a select-then-Continue step reads as having lost the choice.
        // Scoping the hover instead of racing it means the two rules cannot both match,
        // so neither source order nor specificity decides the outcome.
        'hover:border-ring not-data-selected:hover:bg-card',
        // A chosen card reads through the NEUTRAL ring, never a brand tint — §4:
        // "selection chrome is grayscale, never tinted."
        'data-selected:border-ring data-selected:bg-muted',
        // A disabled card still has to be READ: the blurb is the reason it is
        // disabled, so dimming it to the point of illegibility would remove the
        // only thing that explains the state. The generated Button's
        // disabled:opacity is loosened rather than accepted.
        'disabled:opacity-100 disabled:text-muted-foreground disabled:cursor-not-allowed',
        'disabled:hover:border-border disabled:hover:bg-card',
        // The aria-disabled twin, because focusableWhenDisabled means the native
        // attribute is not what carries the state.
        'aria-disabled:opacity-100 aria-disabled:text-muted-foreground aria-disabled:cursor-not-allowed',
        'aria-disabled:hover:border-border aria-disabled:hover:bg-card',
        className,
      )}
      {...rest}
    >
      {centred ? (
        /* The icon in a tile of its own, which is what the reference draws and what
         * makes a card of this size read as one thing rather than a glyph with text
         * under it.
         *
         * §6 assigns radius by surface and its table has no row for a decorative
         * surface nested inside a card — it is not a card, a button, an input or a
         * pill. `rounded-xl` is the step between the smaller-chrome radius and the
         * card's, which is what this is, and it is a real token on our scale
         * (`--r-xl`) rather than a value invented here.
         *
         * IT IS GRAYSCALE, AND THAT IS §4, NOT A PREFERENCE. The reference tints
         * both the tile and the glyph with its brand colour; "selection chrome is
         * grayscale, never tinted — blue is reserved for primary actions and data"
         * is 🔒 LOCKED, and on this step the one primary action is Continue. So the
         * chosen card is read through the neutral ladder: the tile steps from
         * `--sel-bg` up to `--sel-bg-strong`, which are the two tokens §4 names for
         * exactly this, and the glyph comes up to full strength.
         *
         * The step is necessary, not decorative: `data-selected` fills the card
         * itself with `--sel-bg`, so a tile that stayed there would vanish into the
         * surface at the moment it matters most. */
        <ChoiceMark size="lg">{sizedIcon}</ChoiceMark>
      ) : (
        <span className="flex w-full items-start justify-between gap-2">
          {icon ? <span className="text-muted-foreground [&_svg]:size-5">{icon}</span> : <span />}
          {badge}
        </span>
      )}
      <span className="text-base font-medium">{title}</span>
      {description ? (
        <span className="text-sm font-normal text-pretty text-muted-foreground">{description}</span>
      ) : null}
      {/* Under the description in the centred variant, because the top-right corner
          the row layout puts it in does not exist here — there is no row. */}
      {centred ? badge : null}
    </Button>
  );
}
