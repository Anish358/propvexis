/* form-section.jsx
 *
 * @design approved 2026-09-10 — 🔒 Cycle 00, piece 5, with `combobox.jsx` and
 *   `date-picker.jsx`. Signed off on the Test page. Three rulings came with it: Save
 *   greys out until something changes, the Symbol list is OPEN, and it offers the clean
 *   symbol. The piece also CORRECTED the brief's own call-site list — Settings has no
 *   forms in it — which is what found the real legacy layer.
 *   A redesigned screen may adopt it. See test/primitives-status.test.js.
 */

import React from 'react';
import { Fieldset, FieldsetLegend } from '@/components/ui/fieldset';
import { Button } from './button.jsx';
import { Spinner } from './spinner.js';

/* THE FORM SECTION — Cycle 00, piece 5. The four parts a form needs that the app does
 * not already have: a titled GROUP, a two-column GRID, a way to SPAN it, and a FOOTER
 * that knows whether it can be submitted.
 *
 * ── WHAT THIS PIECE IS NOT, BECAUSE THE BRIEF'S OWN LINE IS WRONG ────────────────────
 *
 * §4.3 says "Used by: 6 Settings sections, Add Account, and a 10-step wizard". The
 * Settings half does not survive contact with the screens. Those six sections are
 * label/value ROWS, not forms: Profile is read-only ON PURPOSE (identity comes from
 * Google OAuth, and an editable field there would either diverge from the account you
 * sign in with or be overwritten at the next login), Plan is a summary and a link out to
 * `/billing`, and Appearance writes the theme on change with no Save at all. There is not
 * one save/cancel form among them.
 *
 * THE REAL CALL SITES ARE MODALS. Nine of them — AddTrade, Tag, Fees, PayoutCycle,
 * Payouts, Sync, StrategyRules, AccountForms, plus the wizard steps and the three auth
 * pages. That matters because it identifies what this piece is actually FOR: the live
 * legacy form layer in this app is not a `.form-*` family, it is a set of BARE ELEMENT
 * selectors scoped to a dialog — `.modal input`, `.modal select`, `.modal textarea`,
 * `.modal footer`, `.modal button.primary`, `.modal button.secondary`,
 * `.modal button.danger`, `.field-row`, `label.full`. `modal.jsx` already names them:
 * the shell was migrated in Phase 4b and the class `modal` was KEPT precisely because
 * nineteen content rules still hang off it. This is the piece that lets those go.
 *
 * (`.u-field*` looks like the form layer and is not — its only references are in
 * `ui.jsx`, which is dead and kept as a kill switch. Four dead rules.)
 *
 * ── §1, RUN FOR REAL, AND STEP 2 PRODUCED THE FINDING OF THE PIECE ───────────────────
 *
 *   1. SETTLED PRIMITIVE? PARTLY, and this is the good news. `field.jsx` — Field,
 *      FieldLabel, FieldDescription, FieldError, FieldItem — is APPROVED (Batch 2,
 *      09-07) and runs on Base UI's Field, which does the aria wiring by hand nobody
 *      remembers. The individual field is DONE. What is missing is everything AROUND
 *      one: the group, the grid, the footer.
 *
 *   2. @shadcn? IT SHIPS THE WHOLE SECTION ANATOMY — `FieldSet`, `FieldLegend`,
 *      `FieldGroup`, `FieldContent`, `FieldTitle`, `FieldSeparator` — and we must NOT
 *      take it. The registry's `field` has been REWRITTEN since we installed ours: the
 *      version on disk is 78 lines on `@base-ui/react/field`; the current one is 239
 *      lines of plain `<div>`/`<p>` markup with `cva`, importing Label and Separator,
 *      and it has NO Base UI Field primitive in it at all.
 *
 *      Re-installing to gain the section would therefore DELETE the reason `field.jsx`
 *      was approved. It would take `FieldControl` and `FieldValidity` with it, change
 *      `FieldError` to an `errors`-prop component, and drop the ValidityState behaviour
 *      the account page's unique-name rule was built against. It also arrives with
 *      `import { cn } from "cn"` — the junk npm package that clobbered four locked
 *      components on 09-09.
 *
 *      **This is a REPORT, not a decision taken quietly** (standing rule: never
 *      hand-build silently — re-install from the registry first, then compose, then
 *      ask). The registry ships it; taking it costs more than it gives; the owner should
 *      know the divergence exists, because it will only widen.
 *
 *   3. @coss? YES, AND IT IS THE RIGHT ONE. `@coss/fieldset` is thirty-three lines on
 *      `@base-ui/react/fieldset` — the SAME primitive family as our Field, from the same
 *      library, already a dependency at 1.7.0. Installed 2026-09-10, cleanly: one file,
 *      no registry dependencies, `cn` correctly pointed at `@/lib/utils`, nothing else
 *      touched.
 *
 *      ⚠ AND IT IS THE COUNTER-EXAMPLE TO OUR OWN COSS WARNING. The standing note is
 *      that a coss component "arrives in our colours but coss's geometry" — the toggle
 *      group came with 21 literals against 8 tokens. This one declares exactly ONE
 *      class pair, `font-semibold text-foreground`, both semantic. There was nothing to
 *      absorb. The warning is about SIZE and SPACING literals, and a component that
 *      declares none cannot carry them.
 *
 *   4. COMPOSITION for the rest — the grid, the span and the footer, below, each with
 *      its argument. Nothing here is hand-built that a registry ships.
 */

/* ── FormSection ──────────────────────────────────────────────────────────────────────
 *
 * A titled group of fields, on Base UI's Fieldset — which renders a real `<fieldset>`
 * with a real `<legend>`, so the grouping is in the accessibility tree rather than
 * implied by a bold `<div>`. That is the whole reason not to hand-roll it: assistive
 * tech announces the legend when focus enters any control inside, and no arrangement of
 * divs reproduces that.
 *
 * THE LEGEND IS NOT A `text-*` OVERRIDE. coss sets `font-semibold text-foreground` and
 * leaves the size alone, so a legend inherits — which lands on our 14px body step. The
 * shipped section titles are `--fs-section-title` (`.modal-head h3`), and that is a
 * SCREEN's heading rather than a group's, so it stays where it is. A group inside a form
 * is not a heading of the page it is on.
 *
 * `title` is optional. A form with one group needs no legend — AddTradeModal is eleven
 * fields with no sections at all — and a `<legend>` reading "Details" above every form
 * in the app would be chrome, not structure. When it is omitted the fieldset still
 * groups; it just does not announce a name. */
function FormSection({ title, description, className, children, ...rest }) {
  return (
    <Fieldset
      className={['flex flex-col gap-3', className].filter(Boolean).join(' ')}
      {...rest}
    >
      {title ? <FieldsetLegend>{title}</FieldsetLegend> : null}
      {description ? (
        <p className="-mt-1 text-xs text-[var(--text-2)]">{description}</p>
      ) : null}
      {children}
    </Fieldset>
  );
}

/* ── FormGrid ─────────────────────────────────────────────────────────────────────────
 *
 * The two-column field grid. `.at-form` is `grid-template-columns: 1fr 1fr; gap: 12px`
 * and that is what nine modals lay their fields out on, so the shape is not being
 * invented — it is being taken off a bare element selector and given a name.
 *
 * ⚠ `columns` IS A PROP AND CANNOT BE A CLASS. This is the rule that has cost this
 * codebase real debugging time five separate times: Tailwind's `@source` covers
 * `components/{ui,primitives}` only, so a `grid-cols-3` written in a modal — which is
 * where every caller of this lives — emits NO CSS AT ALL, silently, and the grid
 * quietly stays at two. §1 names a caller-supplied column template as the worked
 * example. It therefore travels as an inline `gridTemplateColumns`, which no build step
 * can drop.
 *
 * The gap is NOT a prop, deliberately: 12px between fields is the one every modal
 * already uses, and a gap a caller can change is how nine dialogs end up with nine
 * rhythms. */
function FormGrid({ columns = 2, className, style, children, ...rest }) {
  const template = typeof columns === 'number' ? `repeat(${columns}, minmax(0, 1fr))` : columns;
  return (
    <div
      className={['grid gap-3', className].filter(Boolean).join(' ')}
      style={{ gridTemplateColumns: template, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}

/* ── FormWide ─────────────────────────────────────────────────────────────────────────
 *
 * A grid child that spans every column — `.at-wide`, which the real modals put on
 * exactly three things: a comments field, an error line, and the actions row.
 *
 * IT IS A COMPONENT RATHER THAN A `wide` PROP ON THE FIELD for one reason: `Field` is an
 * APPROVED primitive (Batch 2, locked as a family with six others that share a height, a
 * corner and a text size). Adding a layout prop to it would re-open that lock to solve a
 * problem that belongs to the grid, not to the field. The span is the GRID's concern and
 * it lives here. */
function FormWide({ className, children, ...rest }) {
  return (
    <div className={['col-span-full', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
}

/* ── FormFooter ───────────────────────────────────────────────────────────────────────
 *
 * Save and Cancel, right-aligned, with the states that decide whether Save can be
 * pressed. §4.3 asks for the footer AND its disabled/dirty states, and the states are
 * the actual deliverable: `.modal footer` is nine lines of flexbox that every dialog
 * already gets for free, whereas "is this submittable" is re-decided by hand in every
 * one of them.
 *
 * ── WHY IT TAKES PROPS RATHER THAN CHILDREN ──────────────────────────────────────────
 *
 * A footer that took children would be a flex row, and a flex row is not worth a
 * component. What is worth a component is that the RULE lives in one place. Today each
 * modal writes its own `disabled={busy}` and its own pending string — AddTradeModal has
 * `{busy ? 'Adding…' : 'Add trade'}` inline — and the result is nine dialogs that each
 * decide separately whether a spinner appears, whether Cancel is reachable mid-save, and
 * what disabled means. Those are not per-dialog decisions.
 *
 * `leading` is the exception and it is a real one: `.modal footer .footer-spacer` and
 * `.modal button.danger` exist because some dialogs carry a DESTRUCTIVE action, and it
 * belongs hard left, far from Save. A slot, not a `danger` prop, because what goes there
 * varies (a button, a link, a confirmation) and the footer's job is only to place it.
 *
 * ── THE PENDING STATE CLOSES AN OPEN ITEM ────────────────────────────────────────────
 *
 * `spinner.js` was approved on 2026-09-08 WITH NO CALL SITES, and its entry says why in
 * as many words: "approved so that the first button that needs one is not inventing it".
 * This is that button. Nothing here designs a spinner; it renders the one that was
 * signed off eighteen months of decisions ago and has been waiting.
 *
 * Cancel is disabled while pending. That is a behaviour choice and it is deliberate: the
 * request is in flight and cannot be recalled, so a live Cancel would close the dialog
 * over a write that still lands. The shipped modals leave it enabled, which is a bug
 * nobody has hit yet because the requests are fast.
 *
 * ── `dirty` — RULED ON 2026-09-10: SAVE GREYS OUT UNTIL SOMETHING CHANGES ───────────
 *
 * The owner said yes. **That is a policy about FORMS, and the default here is a separate
 * question about this API — they are not in conflict, and conflating them would ship a
 * bug.**
 *
 * THE POLICY: every dialog migrated onto this footer computes `dirty` against the values
 * it opened with, and Save is dead until one of them differs. No form in the app does
 * that today (there is no `isDirty`/`hasChanges`/`unsaved` anywhere in the source), so it
 * is per-form work at migration time, and the Test page shows it working.
 *
 * THE DEFAULT STAYS `true`, i.e. "assume submittable", and the reason is which failure it
 * chooses. Default `false` would make a forgotten `dirty` prop produce a Save button that
 * can never be pressed — a dead control in production. Default `true` makes a forgotten
 * prop produce today's behaviour, which is not a regression. Loud failure is usually the
 * right trade in this codebase, but not when the loud failure is a shipped form nobody
 * can submit. The migration checklist carries the requirement instead. */
function FormFooter({
  onCancel,
  cancelLabel = 'Cancel',
  submitLabel = 'Save',
  pendingLabel,
  pending = false,
  dirty = true,
  disabled = false,
  leading,
  className,
  ...rest
}) {
  const blocked = pending || disabled || !dirty;
  return (
    <div
      className={['flex items-center gap-3 pt-1', className].filter(Boolean).join(' ')}
      {...rest}
    >
      {leading}
      {/* The spacer that pushes the pair right, and the reason `justify-end` is not used
          instead: with a `leading` slot present the two groups must sit at opposite ends,
          and with it absent this collapses to the same thing. One layout, both cases —
          which is what `.footer-spacer` was doing by hand. */}
      <div className="flex-1" />
      {onCancel ? (
        <Button type="button" variant="secondary" onClick={onCancel} disabled={pending}>
          {cancelLabel}
        </Button>
      ) : null}
      <Button type="submit" disabled={blocked}>
        {pending ? <Spinner /> : null}
        {pending ? (pendingLabel ?? submitLabel) : submitLabel}
      </Button>
    </div>
  );
}

export {
  FormFooter, FormGrid, FormSection, FormWide,
};
