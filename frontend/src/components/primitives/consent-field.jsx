import React from 'react';
import { Checkbox } from './checkbox.js';
import { Field, FieldItem, FieldLabel } from './field.jsx';

/* ConsentField — a tick-box the user must actively affirm, with its sentence beside it.
 *
 * WHY THIS IS A PRIMITIVE AND NOT THREE ELEMENTS IN THE PAGE. Two rules force it,
 * both of which this repo has paid for before:
 *
 * 1. TAILWIND UTILITIES COMPILE ONLY UNDER components/{ui,primitives}. A class
 *    written in a page emits NOTHING, silently. The alignment and gap below are
 *    real layout decisions, so they have to live somewhere they actually build.
 * 2. `Field` is `flex flex-col` and `FieldLabel` is `inline-flex items-center
 *    font-medium`, both shaped for a one-line label beside a control. A consent
 *    sentence is three lines long. Dropped in as-is it centres a wrapped paragraph
 *    against the box and renders it as bold as a heading.
 *
 * The composition is therefore: FieldItem (the row) + a box pinned to the FIRST
 * line via `mt-0.5`, not centred against the whole paragraph, and a label returned
 * to normal weight and readable leading.
 *
 * IT IS A GATE, NOT DECORATION. The one caller is the credential step, where an
 * unticked box is what keeps a trade-capable password from being submitted, so the
 * control must be the real Base UI checkbox — focusable, Space-operable, and
 * exposing checked state to assistive tech. `htmlFor`/`id` pairing means clicking
 * the sentence toggles the box, which for a three-line label is the whole target.
 */
export function ConsentField({ id, checked, onCheckedChange, children }) {
  return (
    <Field>
      <FieldItem className="items-start gap-3">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={onCheckedChange}
          className="mt-0.5 shrink-0"
        />
        <FieldLabel htmlFor={id} className="block font-normal leading-relaxed">
          {children}
        </FieldLabel>
      </FieldItem>
    </Field>
  );
}
