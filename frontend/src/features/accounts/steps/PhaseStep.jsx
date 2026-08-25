import React, { useState } from 'react';
import {
  Button, ChoiceCard, ChoiceGrid, Field, FieldDescription, FieldLabel, Input,
  WizardForm, WizardGroup, WizardHeading,
} from '@/components/primitives';
import { useFlow } from '../NewAccountFlow.jsx';
import { PHASES } from '../newAccountFlow.js';
import { findProduct, isCustomProduct, templateToFields } from '../../prop/propFirms.js';

/* Which phase the account is at — and the one place the catalog's rules are resolved.
 *
 * templateToFields IS CALLED HERE AND NOWHERE ELSE, because this is the only step
 * with all four of its arguments. It returns the firm, the product, account_type,
 * the balance and all five rule fields, so this single call overwrites the product
 * step's provisional drawdowns with the chosen phase's real ones and lands
 * profit_target_pct / payout_split_pct on the right side of the eval-vs-funded split.
 * Reading `phase.dailyDdPct` here by hand would work today and skip the size-membership
 * check that stops a typed 37000 becoming a start_balance the firm never sold.
 *
 * account_type IS DERIVED FROM THE PHASE IN BOTH MODES, never asked. Two controls
 * naming one fact drift, and the failure is not cosmetic: challenges.phase would say
 * funded while account_type said eval, and the prop engine would score the account
 * against a profit target it does not have. patchDraft derives it too, so this is
 * belt-and-braces on the custom path rather than the only guard.
 *
 * PHASES comes from the flow module. Retyping ['p1','p2','funded'] here would be a
 * fourth copy of migration 0016's CHECK with nothing pinning it; the flow module's
 * copy is drift-tested against provision.js.
 */
const PHASE_LABEL = { p1: 'Phase 1', p2: 'Phase 2', funded: 'Funded' };
const PHASE_BLURB = {
  p1: 'The first evaluation. Scored against a profit target.',
  p2: 'The second evaluation. Scored against a profit target.',
  funded: 'Trading the firm\'s capital. Scored against payouts, not a target.',
};

export default function PhaseStep() {
  const { draft, patch, advance } = useFlow();
  const custom = isCustomProduct(draft.firm_id, draft.product_id);
  const product = custom ? null : findProduct(draft.firm_id, draft.product_id);

  const [phaseId, setPhaseId] = useState(() => draft.phase || null);
  const [target, setTarget] = useState(() => (draft.profit_target_pct ?? '') + '');
  const [split, setSplit] = useState(() => (draft.payout_split_pct ?? '') + '');

  function chooseCatalogPhase(id) {
    const fields = templateToFields(draft.firm_id, draft.product_id, draft.start_balance, id);
    // An impossible combination — a size the product does not sell, or a phase it does
    // not have. Returning here leaves the step incomplete and the shell's guard sends
    // the user back to whichever answer is missing, rather than committing a challenge
    // assembled from nothing.
    if (!fields) return;
    patch({ phase: id, ...fields });
    advance();
  }

  // Custom: account_type decides WHICH number the phase needs, so it is computed
  // before the field renders rather than inside the submit handler.
  const customType = phaseId === 'funded' ? 'funded' : 'eval';
  const customValue = customType === 'funded' ? split : target;
  const customReady = phaseId != null
    && String(customValue).trim() !== '' && Number.isFinite(Number(customValue));

  function submitCustom(e) {
    e.preventDefault();
    if (!customReady) return;
    patch({
      phase: phaseId,
      account_type: customType,
      profit_target_pct: customType === 'eval' ? Number(target) : null,
      payout_split_pct: customType === 'funded' ? Number(split) : null,
    });
    advance();
  }

  const phases = custom
    ? PHASES.map((id) => ({ id, label: PHASE_LABEL[id], blurb: PHASE_BLURB[id] }))
    : product.phases.map((p) => ({ id: p.id, label: p.label, blurb: PHASE_BLURB[p.id] }));

  return (
    <>
      <WizardHeading
        title="Where are you in it?"
        description="An evaluation is scored against a profit target; a funded account is scored against its payout split. Pick where the account stands today — you can move it on later."
      />

      <WizardGroup>
        <ChoiceGrid>
          {phases.map((p) => (
            <ChoiceCard
              key={p.id}
              title={p.label}
              description={p.blurb}
              selected={custom ? phaseId === p.id : draft.phase === p.id}
              onClick={() => (custom ? setPhaseId(p.id) : chooseCatalogPhase(p.id))}
            />
          ))}
        </ChoiceGrid>

        {custom && phaseId ? (
          <WizardForm onSubmit={submitCustom}>
            {/* Exactly one of the two, chosen by the phase — isStepComplete enforces
                that same pair, so a form offering both would let the user fill the
                wrong one and then be refused by the guard. */}
            {customType === 'funded' ? (
              <Field>
                <FieldLabel htmlFor="naf-split">Payout split (%)</FieldLabel>
                <Input
                  id="naf-split" type="number" inputMode="decimal" min="0" max="100" step="0.1"
                  value={split} onChange={(e) => setSplit(e.target.value)}
                  placeholder="80" autoFocus
                />
                <FieldDescription>Your share of the profits, as the firm states it.</FieldDescription>
              </Field>
            ) : (
              <Field>
                <FieldLabel htmlFor="naf-target">Profit target (%)</FieldLabel>
                <Input
                  id="naf-target" type="number" inputMode="decimal" min="0" max="100" step="0.1"
                  value={target} onChange={(e) => setTarget(e.target.value)}
                  placeholder="8" autoFocus
                />
                <FieldDescription>What you need to make to pass this phase.</FieldDescription>
              </Field>
            )}
            <Button type="submit" variant="primary" disabled={!customReady}>Continue</Button>
          </WizardForm>
        ) : null}
      </WizardGroup>
    </>
  );
}
