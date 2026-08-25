import React from 'react';
import { Button } from './button.jsx';
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
        className="max-w-64 flex-1"
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

/* The step container. `key={step}` on this element is what makes React remount it
 * per step, which is both the transition trigger and the reason a step's local state
 * (a typed password, a half-filled percentage) cannot survive into the next step.
 *
 * §10: enter at `--dur`, and reduced motion collapses it to zero rather than to
 * nothing — the step still appears.
 *
 * THE ENTRANCE IS `@starting-style`, NOT `animate-in`, and that is a finding rather
 * than a preference. tw-animate-css is in package.json and bridge.css's
 * `overlay-motion` recipe is written against its `--tw-animation-duration`, but it is
 * imported nowhere: `animate-in` and `fade-in` compile to NO CSS in this build, which
 * was verified by grepping the built stylesheet. The generated Dialog's
 * `data-open:animate-in` classes are therefore inert too — consistent with §10 still
 * listing the modal entrance animation as an OPEN item. Wiring that library in would
 * change every generated component's animation at once, so it is not done here on the
 * way past.
 *
 * `starting:opacity-0` with a transition needs no library and no keyframes, and lands
 * inside §10's stated rule rather than inventing one. Verified to emit real
 * `@starting-style` CSS. */
export function WizardBody({ className, children, ...rest }) {
  return (
    <main
      data-slot="wizard-body"
      className={cn(
        'mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 px-6 py-12',
        'transition-opacity duration-[var(--dur)] starting:opacity-0 motion-reduce:duration-0',
        className,
      )}
      {...rest}
    >
      {children}
    </main>
  );
}

/* One question per step, so the heading is the question and the description is
 * whatever the user needs to answer it honestly. Weight caps at 600 per §3, and
 * `text-balance` keeps a two-line heading from leaving one orphaned word. */
export function WizardHeading({ title, description, className, ...rest }) {
  return (
    <div data-slot="wizard-heading" className={cn('flex flex-col gap-2', className)} {...rest}>
      <h1 className="text-balance text-2xl font-semibold tracking-tight">{title}</h1>
      {description ? (
        <p className="text-pretty text-sm text-muted-foreground">{description}</p>
      ) : null}
    </div>
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
export function WizardForm({ className, children, ...rest }) {
  return (
    <form
      data-slot="wizard-form"
      noValidate
      className={cn('flex flex-col items-start gap-6', className)}
      {...rest}
    >
      {children}
    </form>
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
export function ChoiceGrid({ className, children, ...rest }) {
  return (
    <div
      data-slot="choice-grid"
      className={cn('grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(15rem,1fr))]', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

/* A choice card.
 *
 * IT IS A BUTTON, NOT A RADIO, AND THAT IS AN ACCESSIBILITY DECISION rather than a
 * styling one. The @coss radio-group card block (`p-radio-group-4`) is the obvious
 * candidate and is wrong for a step where CHOOSING IS THE ACTION: Base UI's radio
 * group selects as the arrow keys move focus, so a keyboard user arrowing across the
 * options would fire the choice — and advance the wizard — on every key press. A
 * button does one thing when it is activated. Steps that select-then-continue (a
 * product with rule fields to fill in) are the radio-group case; those are Task 7's.
 *
 * The radio block also styles its checked state `border-primary/48`, which §4
 * forbids outright: "selection chrome is grayscale, never tinted." Nothing here is
 * brand-tinted; `aria-pressed` state, when a caller passes it, reads through the
 * neutral ring.
 *
 * §14 read literally: this control HAS a border at rest, so hover brightens the edge
 * rather than filling the surface with a colour it was not already wearing. It gets a
 * keyboard twin for free by being a real button.
 */
export function ChoiceCard({
  title, description, icon, badge, selected, disabled, className, ...rest
}) {
  return (
    <Button
      variant="secondary"
      data-slot="choice-card"
      data-selected={selected ? '' : undefined}
      disabled={disabled}
      // A DISABLED CARD STAYS REACHABLE BY KEYBOARD, and that is the point of the
      // state. Its description is the REASON it is unavailable — every platform card
      // carries a mandatory blurb for exactly that (platformCatalog.js's header). A
      // natively-disabled button is removed from the tab order, so a keyboard or
      // screen-reader user could never reach the one sentence that explains why the
      // option is greyed out; they would find a gap in the grid instead of an answer.
      // Base UI keeps it focusable and swaps the native attribute for aria-disabled,
      // which is why the styles below target both.
      focusableWhenDisabled={disabled || undefined}
      className={cn(
        // §6: a card surface takes the card radius, not the button step.
        'h-auto items-start rounded-2xl border-border bg-card p-6 text-left shadow-sm',
        'flex flex-col gap-2 whitespace-normal',
        // §14: it wears an edge, so the edge is what intensifies.
        'hover:border-ring hover:bg-card',
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
      <span className="flex w-full items-start justify-between gap-2">
        {icon ? <span className="text-muted-foreground [&_svg]:size-5">{icon}</span> : <span />}
        {badge}
      </span>
      <span className="text-base font-medium">{title}</span>
      {description ? (
        <span className="text-sm font-normal text-pretty text-muted-foreground">{description}</span>
      ) : null}
    </Button>
  );
}
