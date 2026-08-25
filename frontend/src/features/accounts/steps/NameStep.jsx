import React, { useState } from 'react';
import {
  Button, Field, FieldDescription, FieldLabel, Input, WizardForm, WizardHeading,
} from '@/components/primitives';
import { useFlow } from '../NewAccountFlow.jsx';
import { suggestedLabel } from '../newAccountFlow.js';

/* What to call this account.
 *
 * SEEDED ONCE, NEVER DERIVED. `suggestedLabel(draft)` is a starting point, not a
 * value: deriving it on every render would overwrite whatever the user typed the
 * moment anything it is built from changed — go back, switch the size from 25K to
 * 50K, come forward, and their own name is gone. So it seeds `useState` and is
 * never re-applied.
 *
 * The suggestion also comes from the tested pure function rather than being composed
 * here. `suggestedLabel` knows the things a template string in a page would get
 * wrong: the unlisted firm's typed name wins over the catalog's, a custom product
 * contributes nothing, and a missing size is simply absent rather than "undefined".
 * A live account gets no suggestion at all — there is no firm to name, and the
 * placeholder does that job better than a guess.
 *
 * PATCHED ON BLUR AND ON CONTINUE, not per keystroke. The shell mirrors the draft to
 * sessionStorage on every change, so a write per character is a JSON.stringify per
 * character for a value nothing reads until the step is left.
 *
 * NO CURRENCY CONTROL HERE, deliberately. The plan made it conditional on the design
 * language having a pattern for a secondary field on a single-question page, and it
 * has none — §8 (dividers) and §15 (empty states) are the open items nearest to it,
 * and inventing the pattern to fit one optional field would settle it in a side
 * street. `currency` stays at its 'USD' default and a non-USD account is one edit
 * away in Settings, which `updateAccount` already accepts.
 */
export default function NameStep() {
  const { draft, patch, advance } = useFlow();
  const [label, setLabel] = useState(() => draft.label || suggestedLabel(draft));

  const ready = label.trim() !== '';

  function commitLabel() {
    if (label !== draft.label) patch({ label });
  }

  function onSubmit(e) {
    e.preventDefault();
    if (!ready) return;
    patch({ label });
    advance();
  }

  return (
    <>
      <WizardHeading
        title="What should we call it?"
        description="Only you see this. It labels the account everywhere in the journal, so something you would recognise in a list works better than the login number."
      />
      {/* A form, so Enter submits. On a one-field step, reaching for the mouse to
          continue is the wrong ending. */}
      <WizardForm onSubmit={onSubmit}>
        <Field>
          <FieldLabel htmlFor="naf-label">Account name</FieldLabel>
          <Input
            id="naf-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={commitLabel}
            placeholder="FTMO Challenge #1"
            autoFocus
            autoComplete="off"
            maxLength={80}
          />
          <FieldDescription>You can rename it later.</FieldDescription>
        </Field>
        {/* Disabled while blank, which is exactly isStepComplete's rule for this
            step — the guard and the button agree rather than the button being
            optimistic and the guard bouncing the user back. */}
        <Button type="submit" variant="primary" disabled={!ready}>Continue</Button>
      </WizardForm>
    </>
  );
}
