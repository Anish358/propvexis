import React, { useMemo, useState } from 'react';
import {
  Button, ChoiceCard, ChoiceGrid, Field, FieldDescription, FieldLabel, Input,
  ToggleGroupExclusive, ToggleGroupItem, WizardFields, WizardForm, WizardHeading,
  WizardPair,
} from '@/components/primitives';
import { useFlow } from '../NewAccountFlow.jsx';
import { PHASES, suggestedLabel } from '../newAccountFlow.js';
import { findFirm, sizeLabel, wizardProducts } from '../../prop/propFirms.js';

/* ONE PAGE FOR THE WHOLE ACCOUNT — size, account type, phase, the rules, then the name.
 *
 * Owner restructure 2026-08-25: this replaced three separate steps (`product`, `phase`,
 * `name`), which were one question split three ways. Seven pages for a prop account
 * instead of nine, six of them counted.
 *
 * NO PRESETS, BY OWNER DECISION (2026-08-25, second pass). The first version resolved
 * the firm's rules through templateToFields and prefilled the six metric fields, with
 * a touched-guard so an edit survived a later phase change. All of that is REMOVED and
 * will come back later. What that costs is worth writing down rather than discovering:
 *
 *   · A GoatFundedTrader 2-Step trader now types 5 / 10 / 8 / 3 by hand, and NOTHING
 *     checks it against the catalog we already have. A typo in a drawdown does not fail
 *     loudly — it mis-scores that account for the length of the challenge.
 *   · `templateToFields` is now called from no page at all. It stays tested and stays
 *     the only thing that enforces size membership, so when presets return they should
 *     come back through it rather than by reading phase objects here.
 *   · The size row can no longer be wrong: with no preset to resolve, a size the chosen
 *     type does not sell has no consequence, so the mismatch warning went with it.
 *
 * The layout is the owner's: size and type in one row, phase and the metrics in the
 * next, then drawdown type and the account name. That ordering is why the body is
 * `wide` — two columns of card grids inside the usual 42rem leaves each too narrow.
 *
 * account_type IS NEVER WRITTEN HERE. patchDraft derives it from the phase, and this
 * page reads it back to decide which of the two phase-dependent numbers to ask for. A
 * page patching its own would be a second writer for one fact, and the failure is a
 * funded challenge filed as an evaluation and scored against a target it does not have.
 *
 * A LIVE ACCOUNT SEES ONLY THE NAME. It has no firm, product or phase, and asking it
 * for a drawdown would be asking for a rule nothing scores.
 */
const PHASE_LABEL = { p1: 'Phase 1', p2: 'Phase 2', funded: 'Funded' };
const PHASE_BLURB = {
  p1: 'The first evaluation. Scored against a profit target.',
  p2: 'The second evaluation. Scored against a profit target.',
  funded: "Trading the firm's capital. Scored against payouts, not a target.",
};

export default function AccountStep() {
  const { draft, patch, advance } = useFlow();
  const isProp = draft.capital_kind === 'prop';
  const firm = isProp ? findFirm(draft.firm_id) : null;
  const products = isProp ? wizardProducts(draft.firm_id) : [];

  const [size, setSize] = useState(() => (draft.start_balance ?? '') + '');
  const [productId, setProductId] = useState(() => draft.product_id || '');
  const [phase, setPhase] = useState(() => draft.phase || '');
  const [label, setLabel] = useState(() => draft.label || '');
  const [labelTouched, setLabelTouched] = useState(() => Boolean(draft.label));
  const [ddType, setDdType] = useState(() => draft.dd_type || firm?.ddType || 'static');
  const [rules, setRules] = useState(() => {
    const keys = ['daily_dd_pct', 'max_dd_pct', 'profit_target_pct', 'payout_split_pct', 'min_trading_days'];
    return Object.fromEntries(keys.map((k) => [k, draft[k] == null ? '' : String(draft[k])]));
  });

  // Every size the firm sells, across its types. Still a choice rather than a free
  // number input: a typed 37000 is a balance no firm sold, and every drawdown would
  // then be scored against it.
  const firmSizes = useMemo(() => {
    const all = products.flatMap((p) => p.sizes ?? []);
    return [...new Set(all)].sort((a, b) => a - b);
  }, [products]);

  // Suggested from what has been chosen, and it stops the moment the user types —
  // otherwise picking a different size would silently discard their own text. Not a
  // preset: it names the account, it does not decide any rule.
  const suggestion = useMemo(() => (isProp
    ? suggestedLabel({
      capital_kind: 'prop', firm_id: draft.firm_id, firm_name: draft.firm_name,
      product_id: productId, start_balance: size === '' ? null : Number(size),
    })
    : ''), [isProp, draft.firm_id, draft.firm_name, productId, size]);
  const shownLabel = labelTouched ? label : (suggestion || label);

  const setRule = (k, v) => setRules((p) => ({ ...p, [k]: v }));
  const fundedPhase = phase === 'funded';
  const num = (v) => (String(v).trim() === '' ? null : Number(v));
  const filled = (v) => String(v).trim() !== '' && Number.isFinite(Number(v));

  const ready = shownLabel.trim() !== '' && (!isProp || (
    productId !== '' && phase !== '' && filled(size)
    && filled(rules.daily_dd_pct) && filled(rules.max_dd_pct)
    && filled(fundedPhase ? rules.payout_split_pct : rules.profit_target_pct)
  ));

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
      <FieldLabel htmlFor="naf-label">Account name</FieldLabel>
      <Input
        id="naf-label"
        value={shownLabel}
        onChange={(e) => { setLabelTouched(true); setLabel(e.target.value); }}
        placeholder={isProp ? 'FTMO Challenge #1' : 'IC Markets Live'}
        autoComplete="off"
        maxLength={80}
        autoFocus={!isProp}
      />
      <FieldDescription>You can rename it later.</FieldDescription>
    </Field>
  );

  if (!isProp) {
    return (
      <>
        <WizardHeading
          title="What should we call it?"
          description="Only you see this. It labels the account everywhere in the journal, so something you would recognise in a list works better than the login number."
        />
        <WizardForm onSubmit={onSubmit}>
          {nameField}
          <Button type="submit" variant="primary" disabled={!ready}>Continue</Button>
        </WizardForm>
      </>
    );
  }

  return (
    <>
      <WizardHeading
        title="Tell us about the account"
        description="The size, the type and the phase, then the rules it is scored against. Take the percentages from your firm's dashboard — we do not assume them."
      />

      <WizardForm onSubmit={onSubmit}>
        {/* Row 1 — account size · account type */}
        <WizardPair>
          <Field>
            <FieldLabel htmlFor={firmSizes.length ? undefined : 'naf-size'}>Account size</FieldLabel>
            {firmSizes.length > 0 ? (
              <ChoiceGrid>
                {firmSizes.map((n) => (
                  <ChoiceCard
                    key={n}
                    title={sizeLabel(n)}
                    description={Number(n).toLocaleString()}
                    selected={size !== '' && Number(size) === Number(n)}
                    onClick={() => setSize(String(n))}
                  />
                ))}
              </ChoiceGrid>
            ) : (
              <Input
                id="naf-size" type="number" inputMode="decimal" min="0" step="1"
                value={size} onChange={(e) => setSize(e.target.value)}
                placeholder="25000" autoFocus
              />
            )}
          </Field>

          {/* Always rendered, including when the firm has exactly one type. An earlier
              version hid a single-option row on the grounds that a list of one is not a
              choice; the owner's answer is that a trader picking "My own rules" should
              SEE that they picked it, and a row that appears for some firms and not
              others reads as a missing question. */}
          <Field>
            <FieldLabel>Account type</FieldLabel>
            <ChoiceGrid>
              {products.map((p) => (
                <ChoiceCard
                  key={p.id}
                  title={p.label}
                  description={p.custom
                    ? 'Your own rules, entered below.'
                    : p.sizes.map(sizeLabel).join(' · ')}
                  selected={productId === p.id}
                  onClick={() => setProductId(p.id)}
                />
              ))}
            </ChoiceGrid>
          </Field>
        </WizardPair>

        {/* Row 2 — phase · the metrics it decides */}
        <WizardPair>
          <Field>
            <FieldLabel>Phase</FieldLabel>
            <ChoiceGrid>
              {PHASES.map((id) => (
                <ChoiceCard
                  key={id}
                  title={PHASE_LABEL[id]}
                  description={PHASE_BLURB[id]}
                  selected={phase === id}
                  onClick={() => setPhase(id)}
                />
              ))}
            </ChoiceGrid>
          </Field>

          <WizardFields>
            <Field>
              {/* step 0.1: real firms use half-percent drawdowns, which is also why
                  insertAccountQuery casts these to ::numeric. */}
              <FieldLabel htmlFor="naf-daily-dd">Daily drawdown (%)</FieldLabel>
              <Input
                id="naf-daily-dd" {...pct} value={rules.daily_dd_pct}
                onChange={(e) => setRule('daily_dd_pct', e.target.value)} placeholder="5"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="naf-max-dd">Max drawdown (%)</FieldLabel>
              <Input
                id="naf-max-dd" {...pct} value={rules.max_dd_pct}
                onChange={(e) => setRule('max_dd_pct', e.target.value)} placeholder="10"
              />
            </Field>
            {/* One of the two, never both — the phase decides which, and
                isStepComplete enforces exactly that pair. */}
            {fundedPhase ? (
              <Field>
                <FieldLabel htmlFor="naf-split">Payout split (%)</FieldLabel>
                <Input
                  id="naf-split" {...pct} value={rules.payout_split_pct}
                  onChange={(e) => setRule('payout_split_pct', e.target.value)} placeholder="80"
                />
              </Field>
            ) : (
              <Field>
                <FieldLabel htmlFor="naf-target">Profit target (%)</FieldLabel>
                <Input
                  id="naf-target" {...pct} value={rules.profit_target_pct}
                  onChange={(e) => setRule('profit_target_pct', e.target.value)} placeholder="8"
                />
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="naf-min-days">Minimum trading days</FieldLabel>
              <Input
                id="naf-min-days" type="number" inputMode="numeric" min="0" step="1"
                value={rules.min_trading_days}
                onChange={(e) => setRule('min_trading_days', e.target.value)} placeholder="0"
              />
              <FieldDescription>Leave at 0 if the firm has no requirement.</FieldDescription>
            </Field>
          </WizardFields>
        </WizardPair>

        {/* Row 3 — drawdown type · account name */}
        <WizardPair>
          <Field>
            <FieldLabel>Drawdown type</FieldLabel>
            {/* Two values, so a segmented control rather than a select: both are visible,
                and the difference decides when a breach is scored. */}
            <ToggleGroupExclusive value={ddType} onValueChange={setDdType}>
              <ToggleGroupItem value="static">Static</ToggleGroupItem>
              <ToggleGroupItem value="trailing">Trailing</ToggleGroupItem>
            </ToggleGroupExclusive>
            <FieldDescription>
              Static measures from your starting balance. Trailing follows your peak.
            </FieldDescription>
          </Field>
          {nameField}
        </WizardPair>

        <Button type="submit" variant="primary" disabled={!ready}>Continue</Button>
      </WizardForm>
    </>
  );
}
