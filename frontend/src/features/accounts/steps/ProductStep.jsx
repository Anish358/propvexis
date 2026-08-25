import React, { useState } from 'react';
import {
  Button, ChoiceCard, ChoiceGrid, Field, FieldDescription, FieldLabel, Input,
  ToggleGroupExclusive, ToggleGroupItem, WizardFields, WizardForm, WizardGroup,
  WizardHeading,
} from '@/components/primitives';
import { useFlow } from '../NewAccountFlow.jsx';
import {
  findFirm, findProduct, isCustomProduct, sizeLabel, wizardProducts,
} from '../../prop/propFirms.js';

/* Which product, and at what size — the step where a percentage becomes a number
 * that scores a real challenge.
 *
 * IT READS wizardProducts(), NEVER firm.products. GFT's 1-Step and Instant Funding
 * carry `verified: false` with drawdown percentages nobody has checked against the
 * firm, and a wrong drawdown does not fail loudly: it mis-scores a real trader's
 * account for the length of a challenge, and the trader has no way to tell. This is
 * the assertion in the test file that matters most.
 *
 * NOTHING HERE HARDCODES A RULE. Every percentage comes from the catalog or from the
 * trader. A literal in this file would be an invented rule with nothing pinning it.
 *
 * WHY THE DRAWDOWNS ARE WRITTEN HERE AT ALL, which reads wrong until you see the
 * bind. `templateToFields` needs all four of firm, product, size AND phase, and
 * returns null without the phase — and the phase is the NEXT step. So this step
 * cannot resolve the real rules. But `isStepComplete(draft, 'product')` requires the
 * balance and BOTH drawdowns, deliberately: it is the only thing standing between the
 * custom path and an account silently judged against mt5_accounts' COALESCEd
 * 5 / 10 / 8 defaults. Loosening it was the alternative and it is not acceptable.
 *
 * So the drawdowns are recorded PROVISIONALLY from the product's first phase, and the
 * phase step's single templateToFields call overwrites all five the moment the phase
 * is known. They happen to be identical across the phases of every product in the
 * catalog today, but that is a property of the DATA and not a guarantee — which is
 * exactly why this is provisional rather than final.
 *
 * patchDraft clears the phase and the rules on a product_id change and THEN applies
 * this patch on top. That ordering is why Task 3 tests invalidate-before-merge rather
 * than assuming it.
 *
 * THE CUSTOM EDITOR'S MARKUP IS WRITTEN HERE, not imported. AccountForms' `PropFields`
 * is the same six fields, and reusing it would couple the wizard to the edit modal's
 * field set for six inputs — the semantics are what carry over (step="0.1", because
 * real firms use half-percent drawdowns and insertAccountQuery's ::numeric cast exists
 * for them), not the component. Read as duplication by accident, this looks wrong; it
 * is deliberate.
 *
 * profit_target_pct and payout_split_pct are NOT collected here. They depend on the
 * phase, and the phase step collects whichever one applies.
 */
export default function ProductStep() {
  const { draft, patch, advance } = useFlow();
  const products = wizardProducts(draft.firm_id);
  const firm = findFirm(draft.firm_id);

  // A single product needs no card grid — the unlisted firm's only product is its
  // custom one, and asking a trader to pick from a list of one is a click that
  // carries no information.
  const [productId, setProductId] = useState(
    () => draft.product_id || (products.length === 1 ? products[0].id : null),
  );

  const custom = productId != null && isCustomProduct(draft.firm_id, productId);
  const product = productId ? findProduct(draft.firm_id, productId) : null;

  // The custom editor's fields. Strings, not numbers, because an <input> holds text
  // and a half-typed "1." must not become 1 under the user's cursor.
  const [balance, setBalance] = useState(() => (draft.start_balance ?? '') + '');
  const [dailyDd, setDailyDd] = useState(() => (draft.daily_dd_pct ?? '') + '');
  const [maxDd, setMaxDd] = useState(() => (draft.max_dd_pct ?? '') + '');
  const [ddType, setDdType] = useState(() => draft.dd_type || firm?.ddType || 'static');
  const [minDays, setMinDays] = useState(() => (draft.min_trading_days ?? '') + '');

  function chooseProduct(id) {
    setProductId(id);
    // Not patched yet for a catalog product: product_id without a size would leave
    // the step incomplete anyway, and patching it now would cascade-clear the rules
    // twice for one decision.
    if (isCustomProduct(draft.firm_id, id)) patch({ product_id: id });
  }

  function chooseSize(size) {
    const first = product.phases[0];
    patch({
      product_id: productId,
      start_balance: Number(size),
      daily_dd_pct: first.dailyDdPct,
      max_dd_pct: first.maxDdPct,
      dd_type: firm.ddType,
      min_trading_days: first.minTradingDays,
    });
    advance();
  }

  const customReady = [balance, dailyDd, maxDd].every((v) => String(v).trim() !== '' && Number.isFinite(Number(v)));

  function submitCustom(e) {
    e.preventDefault();
    if (!customReady) return;
    patch({
      product_id: productId,
      start_balance: Number(balance),
      daily_dd_pct: Number(dailyDd),
      max_dd_pct: Number(maxDd),
      dd_type: ddType,
      min_trading_days: minDays.trim() === '' ? 0 : Number(minDays),
    });
    advance();
  }

  return (
    <>
      <WizardHeading
        title={custom ? 'What are the rules?' : 'Which challenge is it?'}
        description={custom
          ? 'We do not guess these. Whatever you enter is what every drawdown and target is measured against, so take them from your firm\'s dashboard rather than from memory.'
          : 'Pick the product and the account size. The drawdown limits and the profit target come with it.'}
      />

      <WizardGroup>
        {products.length > 1 ? (
          <ChoiceGrid>
            {products.map((p) => (
              <ChoiceCard
                key={p.id}
                title={p.label}
                description={p.custom
                  ? 'Enter the balance, the drawdowns and the target yourself.'
                  : `${p.phases.length} ${p.phases.length === 1 ? 'phase' : 'phases'} · ${p.sizes.map(sizeLabel).join(' · ')}`}
                selected={productId === p.id}
                onClick={() => chooseProduct(p.id)}
              />
            ))}
          </ChoiceGrid>
        ) : null}

        {product && !custom ? (
          <ChoiceGrid>
            {product.sizes.map((size) => (
              <ChoiceCard
                key={size}
                title={sizeLabel(size)}
                description={`Account size ${Number(size).toLocaleString()}`}
                selected={Number(draft.start_balance) === Number(size)}
                onClick={() => chooseSize(size)}
              />
            ))}
          </ChoiceGrid>
        ) : null}

        {custom ? (
          <WizardForm onSubmit={submitCustom}>
            <WizardFields>
              <Field>
                <FieldLabel htmlFor="naf-balance">Account size</FieldLabel>
                <Input
                  id="naf-balance" type="number" inputMode="decimal" min="0" step="1"
                  value={balance} onChange={(e) => setBalance(e.target.value)}
                  placeholder="25000" autoFocus
                />
              </Field>
              <Field>
                {/* step="0.1": real firms use half-percent drawdowns, which is also
                    why insertAccountQuery casts these to ::numeric. */}
                <FieldLabel htmlFor="naf-daily-dd">Daily drawdown (%)</FieldLabel>
                <Input
                  id="naf-daily-dd" type="number" inputMode="decimal" min="0" max="100" step="0.1"
                  value={dailyDd} onChange={(e) => setDailyDd(e.target.value)}
                  placeholder="5"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="naf-max-dd">Max drawdown (%)</FieldLabel>
                <Input
                  id="naf-max-dd" type="number" inputMode="decimal" min="0" max="100" step="0.1"
                  value={maxDd} onChange={(e) => setMaxDd(e.target.value)}
                  placeholder="10"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="naf-min-days">Minimum trading days</FieldLabel>
                <Input
                  id="naf-min-days" type="number" inputMode="numeric" min="0" step="1"
                  value={minDays} onChange={(e) => setMinDays(e.target.value)}
                  placeholder="0"
                />
                <FieldDescription>Leave at 0 if the firm has no requirement.</FieldDescription>
              </Field>
            </WizardFields>

            {/* Two values, so a segmented control rather than a select: both options
                are visible, which matters because the difference between them changes
                when a breach is scored. */}
            <Field>
              <FieldLabel>Drawdown type</FieldLabel>
              <ToggleGroupExclusive value={ddType} onValueChange={setDdType}>
                <ToggleGroupItem value="static">Static</ToggleGroupItem>
                <ToggleGroupItem value="trailing">Trailing</ToggleGroupItem>
              </ToggleGroupExclusive>
              <FieldDescription>
                Static measures from your starting balance. Trailing follows your peak.
              </FieldDescription>
            </Field>

            {/* Disabled until the balance and BOTH drawdowns are in — the same rule
                isStepComplete enforces, so the button and the guard agree. A missing
                percentage here is COALESCEd to GoatFundedTrader's defaults downstream. */}
            <Button type="submit" variant="primary" disabled={!customReady}>Continue</Button>
          </WizardForm>
        ) : null}
      </WizardGroup>
    </>
  );
}
