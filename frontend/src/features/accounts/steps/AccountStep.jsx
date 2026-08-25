import React, { useMemo, useState } from 'react';
import {
  Button, Field, FieldError, FieldLabel, Input, Select, SelectItem, SelectPopup,
  SelectTrigger, SelectValue, ToggleGroupExclusive, ToggleGroupItem, WizardActions,
  WizardFields, WizardForm, WizardHeading, WizardSectionTitle,
} from '@/components/primitives';
import { useFlow } from '../NewAccountFlow.jsx';
import { suggestedLabel } from '../newAccountFlow.js';
import {
  ACCOUNT_SIZES, ACCOUNT_TYPES, phasesFor, sizeLabel,
} from '../../prop/propFirms.js';
import { PHASE_LABEL } from '../../prop/propAccounts.js';

/* ONE PAGE FOR THE WHOLE ACCOUNT — type, size, phase, name, then the rules.
 *
 * Owner restructure 2026-08-25: this replaced three separate steps (`product`, `phase`,
 * `name`), which were one question split three ways. Seven pages for a prop account
 * instead of nine, six of them counted.
 *
 * THE LAYOUT IS THE OWNER'S SKETCH, field for field: type · size, then phase · name,
 * then an "Account Details" label over daily · max drawdown, target · minimum days, and
 * drawdown type on its own. Two even columns the whole way down, so every label starts
 * on one of two lines rather than wherever its control happens to sit.
 *
 * DROPDOWNS, NOT CARD GRIDS (owner decision, same pass). The four type cards and three
 * phase cards used ten times the height of a select for the same one-of-N answer, and
 * this page asks nine questions — the grids pushed the drawdowns below the fold, which
 * is where a rule nobody reads gets typed wrong.
 *
 * THE PHASE LIST IS DERIVED FROM THE TYPE. `phasesFor` is the single table: 1 Step has
 * Phase 1 and Funded, 2 Step adds Phase 2, 3 Step adds Phase 3, Instant is funded from
 * the start and has no evaluation at all. Offering every phase for every type would let
 * a trader file a Phase 2 on an Instant account — a challenge that cannot exist — and
 * the phase decides which number the account is scored against.
 *
 * NO PRESETS, BY OWNER DECISION (2026-08-25, second pass). Nothing is resolved from the
 * firm catalog. What that costs is worth writing down rather than discovering:
 *
 *   · A GoatFundedTrader 2-Step trader types 5 / 10 / 8 / 3 by hand, and NOTHING checks
 *     it against the catalog we already have. A typo in a drawdown does not fail loudly
 *     — it mis-scores that account for the length of the challenge.
 *   · `templateToFields` is called from no page at all. It stays tested and stays the
 *     only thing that enforces size membership, so when presets return they should come
 *     back through it rather than by reading phase objects here.
 *
 * account_type IS NEVER WRITTEN HERE. patchDraft derives it from the phase, and this
 * page reads it back only to decide which of the two phase-dependent numbers to ask
 * for. A page patching its own would be a second writer for one fact, and the failure
 * is a funded challenge filed as an evaluation and scored against a target it does not
 * have.
 *
 * A LIVE ACCOUNT SEES ONLY THE NAME. It has no firm, type or phase, and asking it for a
 * drawdown would be asking for a rule nothing scores.
 */

/* The sentinel for "not one of the eight sizes". A value the <select> can hold, because
 * the alternative — inferring custom mode from a size that is not in the list — cannot
 * tell "typing 8000" from "nothing chosen yet". */
const CUSTOM_SIZE = 'custom';

export default function AccountStep() {
  const { draft, patch, advance, accounts } = useFlow();
  const isProp = draft.capital_kind === 'prop';

  const [productId, setProductId] = useState(() => draft.product_id || '');
  const [phase, setPhase] = useState(() => draft.phase || '');
  const [label, setLabel] = useState(() => draft.label || '');
  const [labelTouched, setLabelTouched] = useState(() => Boolean(draft.label));
  const [ddType, setDdType] = useState(() => draft.dd_type || 'static');
  const [rules, setRules] = useState(() => {
    const keys = ['daily_dd_pct', 'max_dd_pct', 'profit_target_pct', 'payout_split_pct', 'min_trading_days'];
    return Object.fromEntries(keys.map((k) => [k, draft[k] == null ? '' : String(draft[k])]));
  });

  /* Size is two pieces of state: which row of the dropdown, and the typed number when
   * that row is `custom`. A revived draft whose balance is not one of the eight comes
   * back in custom mode with the number intact. */
  const storedSize = draft.start_balance == null ? '' : String(draft.start_balance);
  const [sizeChoice, setSizeChoice] = useState(() => {
    if (storedSize === '') return '';
    return ACCOUNT_SIZES.includes(Number(storedSize)) ? storedSize : CUSTOM_SIZE;
  });
  const [customSize, setCustomSize] = useState(
    () => (sizeChoice === CUSTOM_SIZE ? storedSize : ''),
  );
  const size = sizeChoice === CUSTOM_SIZE ? customSize : sizeChoice;

  const phases = phasesFor(productId);

  /* Suggested from what has been chosen, and it stops the moment the user types —
   * otherwise picking a different size would silently discard their own text. Not a
   * preset: it names the account, it does not decide any rule. */
  const suggestion = useMemo(() => (isProp
    ? suggestedLabel({
      capital_kind: 'prop', firm_id: draft.firm_id, firm_name: draft.firm_name,
      product_id: productId, start_balance: size === '' ? null : Number(size),
    })
    : ''), [isProp, draft.firm_id, draft.firm_name, productId, size]);
  const shownLabel = labelTouched ? label : (suggestion || label);

  /* THE NAME HAS TO BE UNIQUE, per the owner's spec. Compared case-insensitively and
   * trimmed against the accounts the user already has, because "FTMO 25K" and "ftmo 25k "
   * in one account switcher are two rows nobody can tell apart.
   *
   * CLIENT-SIDE ONLY, and that is worth stating: nothing in the database or in
   * validateProvision enforces it, so a second tab can still create a duplicate. This
   * blocks the way a user actually gets there. */
  const takenNames = useMemo(
    () => new Set((accounts || []).map((a) => String(a.label ?? '').trim().toLowerCase())),
    [accounts],
  );
  const duplicateName = shownLabel.trim() !== ''
    && takenNames.has(shownLabel.trim().toLowerCase());

  const setRule = (k, v) => setRules((p) => ({ ...p, [k]: v }));
  const fundedPhase = phase === 'funded';
  const num = (v) => (String(v).trim() === '' ? null : Number(v));
  const filled = (v) => String(v).trim() !== '' && Number.isFinite(Number(v));

  const ready = shownLabel.trim() !== '' && !duplicateName && (!isProp || (
    productId !== '' && phase !== '' && filled(size)
    && filled(rules.daily_dd_pct) && filled(rules.max_dd_pct)
    && filled(fundedPhase ? rules.payout_split_pct : rules.profit_target_pct)
  ));

  /* Changing the type can invalidate the phase — picking Instant after Phase 2, or
   * 1 Step after Phase 3 — so the phase is cleared unless the new type still has it.
   * The draft's own cascade does the same thing one layer down (patchDraft clears the
   * phase on a product change); this keeps the FORM from showing a phase the dropdown
   * no longer offers. */
  function chooseType(nextId) {
    setProductId(nextId);
    setPhase((p) => (phasesFor(nextId).includes(p) ? p : ''));
  }

  function onSubmit(e) {
    e.preventDefault();
    if (!ready) return;
    if (!isProp) { patch({ label: shownLabel.trim() }); advance(); return; }
    patch({
      product_id: productId,
      phase,
      label: shownLabel.trim(),
      start_balance: num(size),
      daily_dd_pct: num(rules.daily_dd_pct),
      max_dd_pct: num(rules.max_dd_pct),
      // Exactly one of the two, decided by the phase — the other is nulled rather than
      // left over from an earlier answer.
      profit_target_pct: fundedPhase ? null : num(rules.profit_target_pct),
      payout_split_pct: fundedPhase ? num(rules.payout_split_pct) : null,
      dd_type: ddType,
      min_trading_days: rules.min_trading_days.trim() === '' ? 0 : num(rules.min_trading_days),
    });
    advance();
  }

  const pct = { type: 'number', inputMode: 'decimal', min: '0', max: '100', step: '0.1' };

  const nameField = (
    <Field>
      <FieldLabel htmlFor="naf-label">Account Name</FieldLabel>
      <Input
        id="naf-label"
        value={shownLabel}
        onChange={(e) => { setLabelTouched(true); setLabel(e.target.value); }}
        placeholder={isProp ? 'FTMO Challenge #1' : 'IC Markets Live'}
        autoComplete="off"
        maxLength={80}
        aria-invalid={duplicateName || undefined}
        autoFocus={!isProp}
      />
      {/* An error, not a hint: it says what is wrong with what is in the field, and it
          is the one piece of prose on this page for exactly that reason. */}
      {duplicateName ? <FieldError>You already have an account with this name.</FieldError> : null}
    </Field>
  );

  if (!isProp) {
    return (
      <>
        <WizardHeading align="center" eyebrow="Add Account" title="Name the account" />
        <WizardForm onSubmit={onSubmit}>
          {nameField}
          <Button type="submit" variant="primary" disabled={!ready}>Continue</Button>
        </WizardForm>
      </>
    );
  }

  return (
    <>
      <WizardHeading align="center" eyebrow="Add Account" title="Tell us about the account" />

      <WizardForm onSubmit={onSubmit} stretch>
        {/* Row 1 — Account Type · Account Size.  Row 2 — Select Phase · Set Account Name */}
        <WizardFields>
          <Field>
            <FieldLabel htmlFor="naf-type">Account Type</FieldLabel>
            <Select value={productId} onValueChange={chooseType} items={TYPE_LABELS}>
              <SelectTrigger id="naf-type">
                <SelectValue placeholder="Select account type" />
              </SelectTrigger>
              <SelectPopup>
                {ACCOUNT_TYPES.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </Field>

          <Field>
            <FieldLabel htmlFor="naf-size">Account Size</FieldLabel>
            <Select value={sizeChoice} onValueChange={setSizeChoice} items={SIZE_LABELS}>
              <SelectTrigger id="naf-size">
                <SelectValue placeholder="Select account size" />
              </SelectTrigger>
              <SelectPopup>
                {ACCOUNT_SIZES.map((n) => (
                  <SelectItem key={n} value={String(n)}>{sizeLabel(n)}</SelectItem>
                ))}
                {/* The eight cover what firms usually sell; they also sell 8K and 1M. */}
                <SelectItem value={CUSTOM_SIZE}>Other amount…</SelectItem>
              </SelectPopup>
            </Select>
            {sizeChoice === CUSTOM_SIZE ? (
              <Input
                id="naf-size-custom" type="number" inputMode="decimal" min="0" step="1"
                value={customSize} onChange={(e) => setCustomSize(e.target.value)}
                placeholder="8000" autoFocus aria-label="Account size"
              />
            ) : null}
          </Field>

          <Field>
            <FieldLabel htmlFor="naf-phase">Select Phase</FieldLabel>
            {/* Disabled until the type is chosen, because the type is what decides the
                options — an empty dropdown that opens onto nothing reads as broken. */}
            <Select value={phase} onValueChange={setPhase} items={PHASE_LABEL} disabled={phases.length === 0}>
              <SelectTrigger id="naf-phase">
                <SelectValue placeholder={phases.length ? 'Select phase' : 'Choose a type first'} />
              </SelectTrigger>
              <SelectPopup>
                {phases.map((id) => (
                  <SelectItem key={id} value={id}>{PHASE_LABEL[id]}</SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </Field>

          {nameField}
        </WizardFields>

        <WizardSectionTitle>Account Details</WizardSectionTitle>

        <WizardFields>
          <Field>
            {/* step 0.1: real firms use half-percent drawdowns, which is also why
                insertAccountQuery casts these to ::numeric. */}
            <FieldLabel htmlFor="naf-daily-dd">Daily Drawdown (%)</FieldLabel>
            <Input
              id="naf-daily-dd" {...pct} value={rules.daily_dd_pct}
              onChange={(e) => setRule('daily_dd_pct', e.target.value)} placeholder="5"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="naf-max-dd">Max Drawdown (%)</FieldLabel>
            <Input
              id="naf-max-dd" {...pct} value={rules.max_dd_pct}
              onChange={(e) => setRule('max_dd_pct', e.target.value)} placeholder="10"
            />
          </Field>
          {/* One of the two, never both — the phase decides which, and isStepComplete
              enforces exactly that pair. */}
          {fundedPhase ? (
            <Field>
              <FieldLabel htmlFor="naf-split">Payout Split (%)</FieldLabel>
              <Input
                id="naf-split" {...pct} value={rules.payout_split_pct}
                onChange={(e) => setRule('payout_split_pct', e.target.value)} placeholder="80"
              />
            </Field>
          ) : (
            <Field>
              <FieldLabel htmlFor="naf-target">Profit Target (%)</FieldLabel>
              <Input
                id="naf-target" {...pct} value={rules.profit_target_pct}
                onChange={(e) => setRule('profit_target_pct', e.target.value)} placeholder="8"
              />
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="naf-min-days">Minimum Trading Days</FieldLabel>
            <Input
              id="naf-min-days" type="number" inputMode="numeric" min="0" step="1"
              value={rules.min_trading_days}
              onChange={(e) => setRule('min_trading_days', e.target.value)} placeholder="0"
            />
          </Field>
          <Field>
            <FieldLabel>Drawdown Type</FieldLabel>
            {/* Two values, so a segmented control rather than a dropdown: both are
                visible, and the difference decides when a breach is scored. */}
            <ToggleGroupExclusive value={ddType} onValueChange={setDdType}>
              <ToggleGroupItem value="static">Static</ToggleGroupItem>
              <ToggleGroupItem value="trailing">Trailing</ToggleGroupItem>
            </ToggleGroupExclusive>
          </Field>
        </WizardFields>

        <WizardActions>
          <Button type="submit" variant="primary" size="lg" block disabled={!ready}>
            Continue
          </Button>
        </WizardActions>
      </WizardForm>
    </>
  );
}

/* value -> label, for the closed trigger. Base UI's Select.Value renders the raw value
 * unless the Root is told the labels, so without these the field would read "2step" and
 * "25000" after being chosen. Built from the same tables the options are, so a label can
 * only be wrong in one place. */
const TYPE_LABELS = Object.fromEntries(ACCOUNT_TYPES.map((t) => [t.id, t.label]));
const SIZE_LABELS = {
  ...Object.fromEntries(ACCOUNT_SIZES.map((n) => [String(n), sizeLabel(n)])),
  [CUSTOM_SIZE]: 'Other amount…',
};
