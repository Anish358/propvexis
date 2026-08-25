import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, AlertDescription, Button, ChoiceCard, ChoiceGrid, Field, FieldDescription,
  FieldLabel, Input, ToggleGroupExclusive, ToggleGroupItem, WizardFields, WizardForm,
  WizardGroup, WizardHeading,
} from '@/components/primitives';
import { useFlow } from '../NewAccountFlow.jsx';
import { PHASES, suggestedLabel } from '../newAccountFlow.js';
import {
  UNLISTED_FIRM_ID, findFirm, findProduct, isCustomProduct, sizeLabel,
  templateToFields, wizardProducts,
} from '../../prop/propFirms.js';

/* ONE PAGE FOR THE WHOLE ACCOUNT — size, phase, account type, name, then the rules.
 *
 * OWNER RESTRUCTURE 2026-08-25. This replaces three separate steps (`product`,
 * `phase`, `name`), on the reading that they were one question split three ways: you
 * cannot sensibly name an account before you know what it is, and you cannot see
 * whether the prefilled drawdown is right without the size and phase in front of you.
 * Seven pages for a prop account instead of nine.
 *
 * THE ORDER IS THE OWNER'S, and one part of it needs explaining because it looks
 * wrong. SIZE IS ASKED BEFORE ACCOUNT TYPE, but sizes are a property OF the type —
 * GFT's 2-Step sells 25K/50K/100K while Instant Funding sells only 25K/50K. So the
 * size row offers the UNION of every size the firm sells, and once the type is chosen
 * a size that type does not sell is called out rather than silently resolving to
 * nothing. Narrowing the row instead would make it change under the user mid-page,
 * and a free number input would let someone type 37000 — a balance no firm sells,
 * which every drawdown would then be scored against.
 *
 * THE PREFILL IS A STARTING POINT, NEVER A LOCK. Where the catalog knows the product,
 * `templateToFields` resolves all five rules and they are written into the fields as
 * editable values. Where it does not — the unlisted firm, or a size the product does
 * not sell — the fields are blank and the trader fills them. Either way what is
 * SUBMITTED is what is in the fields, so a firm that changed its drawdown last month
 * is corrected here rather than argued with.
 *
 * templateToFields is still the only thing that resolves catalog rules, and it is
 * still called with all four of its arguments — that is what enforces size membership
 * and puts profit_target/payout_split on the right side of the eval-vs-funded split.
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

// A field is "touched" once the user edits it, and a touched field is never
// overwritten by a later prefill. Without this, changing the phase after correcting a
// drawdown would silently discard the correction.
const emptyRules = () => ({
  start_balance: '', daily_dd_pct: '', max_dd_pct: '',
  profit_target_pct: '', payout_split_pct: '', min_trading_days: '',
});

export default function AccountStep() {
  const { draft, patch, advance } = useFlow();
  const isProp = draft.capital_kind === 'prop';
  const firm = isProp ? findFirm(draft.firm_id) : null;
  const products = isProp ? wizardProducts(draft.firm_id) : [];

  // 1. size · 2. phase · 3. account type · 4. name — the owner's order.
  const [size, setSize] = useState(() => (draft.start_balance ?? '') + '');
  const [phase, setPhase] = useState(() => draft.phase || '');
  const [productId, setProductId] = useState(
    () => draft.product_id || (products.length === 1 ? products[0].id : ''),
  );
  const [label, setLabel] = useState(() => draft.label || '');
  const [labelTouched, setLabelTouched] = useState(() => Boolean(draft.label));

  const [rules, setRules] = useState(() => {
    const r = emptyRules();
    for (const k of Object.keys(r)) if (draft[k] != null) r[k] = String(draft[k]);
    return r;
  });
  const [ddType, setDdType] = useState(() => draft.dd_type || firm?.ddType || 'static');
  const [rulesTouched, setRulesTouched] = useState(false);

  const custom = productId !== '' && isCustomProduct(draft.firm_id, productId);
  const product = productId && !custom ? findProduct(draft.firm_id, productId) : null;

  // The union of every size this firm sells — see the header for why it is not the
  // chosen product's list.
  const firmSizes = useMemo(() => {
    const all = products.flatMap((p) => p.sizes ?? []);
    return [...new Set(all)].sort((a, b) => a - b);
  }, [products]);

  // A size the chosen type does not sell. Named rather than hidden: the trader picked
  // both, and telling them which pair is impossible is more use than a blank form.
  const sizeMismatch = product && size !== '' && !product.sizes.includes(Number(size));

  const resolved = useMemo(() => {
    if (!isProp || custom || !product || !phase || size === '') return null;
    return templateToFields(draft.firm_id, productId, Number(size), phase);
  }, [isProp, custom, product, phase, size, draft.firm_id, productId]);

  // Prefill, once the four answers are in and only into fields the user has not
  // edited. `account_type` is NOT set here — patchDraft derives it from the phase, and
  // a second writer for one fact is what that derivation exists to prevent.
  useEffect(() => {
    if (!resolved || rulesTouched) return;
    setRules({
      start_balance: String(resolved.start_balance ?? ''),
      daily_dd_pct: String(resolved.daily_dd_pct ?? ''),
      max_dd_pct: String(resolved.max_dd_pct ?? ''),
      profit_target_pct: resolved.profit_target_pct == null ? '' : String(resolved.profit_target_pct),
      payout_split_pct: resolved.payout_split_pct == null ? '' : String(resolved.payout_split_pct),
      min_trading_days: String(resolved.min_trading_days ?? ''),
    });
    setDdType(resolved.dd_type || 'static');
  }, [resolved, rulesTouched]);

  // The name is suggested from what has been chosen so far, and stops suggesting the
  // moment the user types. Derived on a draft-shaped object rather than the draft,
  // because the answers are still local until Continue.
  const suggestion = useMemo(() => (isProp
    ? suggestedLabel({
      capital_kind: 'prop', firm_id: draft.firm_id, firm_name: draft.firm_name,
      product_id: productId, start_balance: size === '' ? null : Number(size),
    })
    : ''), [isProp, draft.firm_id, draft.firm_name, productId, size]);

  useEffect(() => {
    if (!labelTouched && suggestion) setLabel(suggestion);
  }, [suggestion, labelTouched]);

  const setRule = (k, v) => { setRulesTouched(true); setRules((p) => ({ ...p, [k]: v })); };

  const fundedPhase = phase === 'funded';
  const num = (v) => (String(v).trim() === '' ? null : Number(v));
  const filled = (v) => String(v).trim() !== '' && Number.isFinite(Number(v));

  const ready = label.trim() !== '' && (!isProp || (
    productId !== '' && phase !== ''
    && filled(rules.start_balance) && filled(rules.daily_dd_pct) && filled(rules.max_dd_pct)
    && filled(fundedPhase ? rules.payout_split_pct : rules.profit_target_pct)
  ));

  function onSubmit(e) {
    e.preventDefault();
    if (!ready) return;
    if (!isProp) { patch({ label: label.trim() }); advance(); return; }
    patch({
      product_id: productId,
      phase,
      label: label.trim(),
      start_balance: num(rules.start_balance),
      daily_dd_pct: num(rules.daily_dd_pct),
      max_dd_pct: num(rules.max_dd_pct),
      // Exactly one of the two, chosen by the phase — the other is nulled rather than
      // left over from an earlier answer.
      profit_target_pct: fundedPhase ? null : num(rules.profit_target_pct),
      payout_split_pct: fundedPhase ? num(rules.payout_split_pct) : null,
      dd_type: ddType,
      min_trading_days: rules.min_trading_days.trim() === '' ? 0 : num(rules.min_trading_days),
    });
    advance();
  }

  const pct = { type: 'number', inputMode: 'decimal', min: '0', max: '100', step: '0.1' };

  return (
    <>
      <WizardHeading
        title={isProp ? 'Tell us about the account' : 'What should we call it?'}
        description={isProp
          ? "Pick the size, the phase and the account type. Where we know the firm's rules we fill them in — check them against your dashboard and change anything that is wrong."
          : 'Only you see this. It labels the account everywhere in the journal, so something you would recognise in a list works better than the login number.'}
      />

      <WizardForm onSubmit={onSubmit}>
        {isProp ? (
          <WizardGroup>
            {/* 1 — size. The union of the firm's sizes; free input for the unlisted
                firm, which sells nothing we know about. */}
            {firmSizes.length > 0 ? (
              <Field>
                <FieldLabel>Account size</FieldLabel>
                <ChoiceGrid>
                  {firmSizes.map((n) => (
                    <ChoiceCard
                      key={n}
                      title={sizeLabel(n)}
                      description={Number(n).toLocaleString()}
                      selected={Number(size) === Number(n)}
                      onClick={() => setSize(String(n))}
                    />
                  ))}
                </ChoiceGrid>
              </Field>
            ) : (
              <Field>
                <FieldLabel htmlFor="naf-size">Account size</FieldLabel>
                <Input
                  id="naf-size" type="number" inputMode="decimal" min="0" step="1"
                  value={size} onChange={(e) => setSize(e.target.value)}
                  placeholder="25000" autoFocus
                />
              </Field>
            )}

            {/* 2 — phase */}
            <Field>
              <FieldLabel>Phase</FieldLabel>
              <ChoiceGrid>
                {(custom || !product ? PHASES : product.phases.map((p) => p.id)).map((id) => (
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

            {/* 3 — account type. A list of one is not a choice, so the unlisted firm's
                single custom product is selected for it and the row is not rendered. */}
            {products.length > 1 ? (
              <Field>
                <FieldLabel>Account type</FieldLabel>
                <ChoiceGrid>
                  {products.map((p) => (
                    <ChoiceCard
                      key={p.id}
                      title={p.label}
                      description={p.custom
                        ? 'Enter the rules yourself. Nothing is assumed.'
                        : `${p.sizes.map(sizeLabel).join(' · ')}`}
                      selected={productId === p.id}
                      onClick={() => setProductId(p.id)}
                    />
                  ))}
                </ChoiceGrid>
              </Field>
            ) : null}

            {sizeMismatch ? (
              <Alert variant="warning">
                <AlertDescription>
                  {product.label} is not sold at {sizeLabel(Number(size))}. Pick another
                  size, or leave it and enter the rules below yourself.
                </AlertDescription>
              </Alert>
            ) : null}
          </WizardGroup>
        ) : null}

        {/* 4 — name */}
        <Field>
          <FieldLabel htmlFor="naf-label">Account name</FieldLabel>
          <Input
            id="naf-label"
            value={label}
            onChange={(e) => { setLabelTouched(true); setLabel(e.target.value); }}
            placeholder={isProp ? 'FTMO Challenge #1' : 'IC Markets Live'}
            autoComplete="off"
            maxLength={80}
            autoFocus={!isProp}
          />
          <FieldDescription>You can rename it later.</FieldDescription>
        </Field>

        {/* 5 — the rules. Shown once there is something to show them for, prefilled
            where the catalog knows them and blank where it does not. Always editable:
            what is submitted is what is in these fields. */}
        {isProp && phase !== '' && productId !== '' ? (
          <WizardGroup>
            <WizardFields>
              <Field>
                <FieldLabel htmlFor="naf-balance">Starting balance</FieldLabel>
                <Input
                  id="naf-balance" type="number" inputMode="decimal" min="0" step="1"
                  value={rules.start_balance}
                  onChange={(e) => setRule('start_balance', e.target.value)}
                  placeholder="25000"
                />
              </Field>
              <Field>
                {/* step 0.1: real firms use half-percent drawdowns, which is also why
                    insertAccountQuery casts these to ::numeric. */}
                <FieldLabel htmlFor="naf-daily-dd">Daily drawdown (%)</FieldLabel>
                <Input
                  id="naf-daily-dd" {...pct}
                  value={rules.daily_dd_pct}
                  onChange={(e) => setRule('daily_dd_pct', e.target.value)}
                  placeholder="5"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="naf-max-dd">Max drawdown (%)</FieldLabel>
                <Input
                  id="naf-max-dd" {...pct}
                  value={rules.max_dd_pct}
                  onChange={(e) => setRule('max_dd_pct', e.target.value)}
                  placeholder="10"
                />
              </Field>
              {fundedPhase ? (
                <Field>
                  <FieldLabel htmlFor="naf-split">Payout split (%)</FieldLabel>
                  <Input
                    id="naf-split" {...pct}
                    value={rules.payout_split_pct}
                    onChange={(e) => setRule('payout_split_pct', e.target.value)}
                    placeholder="80"
                  />
                </Field>
              ) : (
                <Field>
                  <FieldLabel htmlFor="naf-target">Profit target (%)</FieldLabel>
                  <Input
                    id="naf-target" {...pct}
                    value={rules.profit_target_pct}
                    onChange={(e) => setRule('profit_target_pct', e.target.value)}
                    placeholder="8"
                  />
                </Field>
              )}
              <Field>
                <FieldLabel htmlFor="naf-min-days">Minimum trading days</FieldLabel>
                <Input
                  id="naf-min-days" type="number" inputMode="numeric" min="0" step="1"
                  value={rules.min_trading_days}
                  onChange={(e) => setRule('min_trading_days', e.target.value)}
                  placeholder="0"
                />
                <FieldDescription>Leave at 0 if the firm has no requirement.</FieldDescription>
              </Field>
            </WizardFields>

            {/* Two values, so a segmented control rather than a select: both are
                visible, and the difference decides when a breach is scored. */}
            <Field>
              <FieldLabel>Drawdown type</FieldLabel>
              <ToggleGroupExclusive
                value={ddType}
                onValueChange={(v) => { setRulesTouched(true); setDdType(v); }}
              >
                <ToggleGroupItem value="static">Static</ToggleGroupItem>
                <ToggleGroupItem value="trailing">Trailing</ToggleGroupItem>
              </ToggleGroupExclusive>
              <FieldDescription>
                Static measures from your starting balance. Trailing follows your peak.
              </FieldDescription>
            </Field>
          </WizardGroup>
        ) : null}

        <Button type="submit" variant="primary" disabled={!ready}>Continue</Button>
      </WizardForm>
    </>
  );
}
