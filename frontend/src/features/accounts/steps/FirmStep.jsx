import React, { useState } from 'react';
import {
  Button, ChoiceCard, ChoiceGrid, Field, FieldDescription, FieldLabel, Input,
  WizardForm, WizardGroup, WizardHeading,
} from '@/components/primitives';
import { useFlow } from '../NewAccountFlow.jsx';
import { UNLISTED_FIRM_ID, wizardFirms } from '../../prop/propFirms.js';

/* Which firm the account is with.
 *
 * IT READS wizardFirms(), NEVER PROP_FIRMS. A firm whose every product carries
 * `verified: false` would be a card leading to an empty product page — wizardFirms()
 * drops those, and reaching past it to the raw catalog is how that card comes back.
 *
 * NO SEARCH FIELD. The plan made it conditional on the list growing past a handful;
 * it is three. A search box over three cards is chrome that costs a tab stop and
 * finds nothing, so it is omitted deliberately rather than forgotten. The platform
 * step has one because that grid can reach five and the ids differ from the names.
 *
 * THE UNLISTED FIRM ASKS FOR ITS NAME BEFORE ADVANCING. firm_name feeds
 * suggestedLabel and every Prop OS display of the account, and "Other / not listed"
 * is useless in both. COMPLETE.firm refuses to pass an unlisted firm without one, so
 * the page agrees with the guard rather than being optimistic and having the guard
 * bounce the user back a step.
 *
 * ONLY THE ESCAPE HATCH PATCHES firm_name. patchDraft DERIVES it from the catalog for
 * every firm the catalog names — one fact, one writer — so sending our own here would
 * be a second writer that a rename in the catalog would silently disagree with. The
 * unlisted firm is the exception because its name is the user's to type.
 *
 * patchDraft also clears the product, the phase and every rule on a firm change, so
 * switching firms mid-flow needs no handling here.
 */
export default function FirmStep() {
  const { draft, patch, advance } = useFlow();
  const firms = wizardFirms();

  // Which card is open, tracked separately from the draft: the draft says which firm
  // is chosen, this says whether the name field is showing. Re-entering the step with
  // an unlisted firm already chosen should show the field, not hide the answer.
  const [naming, setNaming] = useState(draft.firm_id === UNLISTED_FIRM_ID);
  const [typedName, setTypedName] = useState(() => draft.firm_name || '');

  function choose(firm) {
    if (firm.id === UNLISTED_FIRM_ID) {
      patch({ firm_id: UNLISTED_FIRM_ID });
      setNaming(true);
      return;
    }
    patch({ firm_id: firm.id });
    advance();
  }

  function onSubmitName(e) {
    e.preventDefault();
    const name = typedName.trim();
    if (!name) return;
    patch({ firm_name: name });
    advance();
  }

  return (
    <>
      <WizardHeading
        title="Which firm is it with?"
        description="We use this to pre-fill the drawdown limits and the profit target. If your firm is not listed you can enter its rules yourself."
      />

      <WizardGroup>
        <ChoiceGrid>
          {firms.map((firm) => (
            <ChoiceCard
              key={firm.id}
              title={firm.name}
              description={firm.id === UNLISTED_FIRM_ID
                ? 'Enter the firm name and its rules yourself. Nothing is assumed.'
                : `We know this firm's products, so the rules come pre-filled.`}
              selected={draft.firm_id === firm.id}
              onClick={() => choose(firm)}
            />
          ))}
        </ChoiceGrid>

        {naming ? (
          <WizardForm onSubmit={onSubmitName}>
            <Field>
              <FieldLabel htmlFor="naf-firm-name">Firm name</FieldLabel>
              <Input
                id="naf-firm-name"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder="FundedNext"
                autoFocus
                autoComplete="off"
                maxLength={80}
              />
              <FieldDescription>
                Accounts are grouped by this name, so two firms stay two firms.
              </FieldDescription>
            </Field>
            <Button type="submit" variant="primary" disabled={typedName.trim() === ''}>
              Continue
            </Button>
          </WizardForm>
        ) : null}
      </WizardGroup>
    </>
  );
}
