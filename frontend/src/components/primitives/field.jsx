/* field.jsx
 *
 * @design unreviewed — the owner has not signed off how this LOOKS. It is not a
 *   §1 step-1 stop: reuse it in existing screens, but a redesigned screen may not
 *   adopt it until it is reviewed. See test/primitives-status.test.js.
 */

import React from 'react';
import {
  Field, FieldDescription, FieldError as UIFieldError, FieldItem,
  FieldLabel as UIFieldLabel,
} from '@/components/ui/field';
import { cn } from '@/lib/utils';

/* Field — PropVexis primitive.
 *
 * Label, description and item are straight re-exports, per index.js's rule: a module
 * earns a wrapper when it has a reason, and that composition needs no PropVexis
 * difference. What it buys over a hand-rolled <label>+<input> is the aria wiring —
 * Base UI's Field links the label, the description and the control's
 * aria-describedby, which is the part that gets forgotten by hand.
 *
 * `FieldError` DOES have a reason, as of the account page's unique-name rule, and this
 * header used to record it as an open item ending "the first page that genuinely needs
 * inline validation copy is the one that should force the decision". This is that page.
 * Two things were wrong with it as shipped, and both are silent:
 *
 * 1. IT RENDERED NOTHING. `Field.Error` shows itself according to the control's native
 *    ValidityState, and a rule like "you already have an account with this name" is not
 *    in it — so the element was in the tree, compiled, and invisible. Screenshotted to
 *    confirm before and after. `match` (documented as "specifying `true` will always
 *    show the error message, and lets external libraries control the visibility") is the
 *    prop for a caller that has already decided; the caller renders the element only
 *    when there IS an error, so "always" is exactly right here.
 *
 * 2. IT WAS THE WRONG COLOUR. The generated class is `text-destructive-foreground`, and
 *    bridge.css maps that to `--on-accent` — a near-white whose job is text sitting ON
 *    a destructive FILL. As error text on the page background it is white text that
 *    reads as ordinary copy. It is now `text-destructive`.
 *
 * WHY THAT IS NOT SETTLING §17 IN A SIDE STREET, which this file previously worried
 * about. §17 (error vs. loss) is ⬜ OPEN on whether a failed ACTION and a losing TRADE
 * should share one red; bridge.css maps `destructive` → `--loss` today only because the
 * library has one slot. This change does not answer that. It makes one control agree
 * with what the app ALREADY does everywhere else: legacy `.error` is `color:
 * var(--loss)`, and `Alert variant="error"` resolves to the same red — including in this
 * very wizard, two steps later. A validation message in white while the alert beside it
 * is red is not a position on §17, it is a bug. The day §17 is settled, this line, the
 * Alert and the legacy rule change together, which is the point of them agreeing now.
 *
 * ALSO RECORDED, because it bites on install: `shadcn add @coss/field` WRITES TO
 * tailwind.css. It appended a `--destructive-foreground` pair built from Tailwind's raw
 * palette (`var(--color-red-700)` / `var(--color-red-400)`) plus a `.dark` block —
 * duplicating what bridge.css already maps and breaking §4's "no raw colour anywhere"
 * and dark-is-default-via-data-theme. Reverted. token-bridge.test.js catches both halves
 * now; it caught only the `.dark` one before.
 */
/* THE LABEL COLOUR IS THE MUTED ONE (owner, 2026-09-07), and this is the wrapper that
 * used to say "label and description are straight re-exports". One of them no longer is.
 *
 * `--text-2` at full opacity is the locked standard for label text — decided on the
 * dashboard, against the KPI captions — and the @coss FieldLabel ships `text-foreground`,
 * so every form label in the app rendered as bright as the value typed under it. The
 * owner was shown both readings and chose one colour for every label in the app rather
 * than one for captions and another for questions.

 * It is the same token `FieldDescription` already uses, on purpose: a label and its help
 * text differ by SIZE here (14 against 12), not by brightness. `label.jsx` carries the
 * matching change and the longer version of this note — the two must not drift, because
 * the review page draws them side by side precisely to catch that.
 *
 * tailwind-merge means this REPLACES `text-foreground`; a caller can still pass its own. */
function FieldLabel({ className, ...rest }) {
  return <UIFieldLabel className={cn('text-muted-foreground', className)} {...rest} />;
}

function FieldError({ className, ...rest }) {
  return (
    <UIFieldError
      // The caller decides. See 1 above — without this the element renders nothing
      // unless the browser's own ValidityState happens to agree.
      match
      className={cn('text-destructive', className)}
      {...rest}
    />
  );
}

export {
  Field, FieldDescription, FieldError, FieldItem, FieldLabel,
};
