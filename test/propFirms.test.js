import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROP_FIRMS, PRODUCT_IDS, SHORT_PRODUCT_LABEL, sizeLabel,
  findFirm, findProduct, templateToFields,
  wizardFirms, wizardProducts, isCustomProduct,
} from '../frontend/src/features/prop/propFirms.js';

// The catalog is JSX-free so its shape and resolver can be guarded here.
// templateToFields output must keep matching the account form-field shape
// AccountForms.toPayload consumes.

test('catalog: every firm, product and phase is well-formed', () => {
  for (const f of PROP_FIRMS) {
    assert.ok(f.id && f.name, 'firm needs id + name');
    assert.ok(['static', 'trailing'].includes(f.ddType), `${f.id} ddType`);
    assert.ok(Array.isArray(f.platforms) && f.platforms.length, `${f.id} needs platforms`);
    assert.ok(Array.isArray(f.products) && f.products.length, `${f.id} needs products`);
    for (const p of f.products) {
      assert.ok(PRODUCT_IDS.includes(p.id), `${f.id}/${p.id} is not a known product id`);
      assert.ok(p.label, `${f.id}/${p.id} needs a label`);
      assert.equal(typeof p.verified, 'boolean', `${f.id}/${p.id} must declare whether its rules are verified`);
      if (p.custom) { assert.equal(p.verified, false, `${f.id}/${p.id} carries no rules, so nothing is verified`); continue; }
      assert.ok(p.sizes.length, `${f.id}/${p.id} needs sizes`);
      assert.ok(p.phases.length, `${f.id}/${p.id} needs phases`);
      for (const ph of p.phases) {
        assert.ok(['eval', 'funded'].includes(ph.accountType), `${f.id}/${p.id}/${ph.id} accountType`);
        assert.equal(typeof ph.dailyDdPct, 'number');
        assert.equal(typeof ph.maxDdPct, 'number');
        assert.equal(typeof ph.minTradingDays, 'number');
      }
    }
  }
});

test('ids are unique — firms globally, products within a firm', () => {
  const firmIds = PROP_FIRMS.map((f) => f.id);
  assert.equal(new Set(firmIds).size, firmIds.length);
  for (const f of PROP_FIRMS) {
    const ids = f.products.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length, `${f.id} has duplicate products`);
    for (const p of f.products) {
      const phases = p.phases.map((x) => x.id);
      assert.equal(new Set(phases).size, phases.length, `${f.id}/${p.id} has duplicate phases`);
    }
  }
});

test('every phase id is one the challenges table accepts', () => {
  // challenges.phase is 'p1' | 'p2' | 'funded' (migration 0016). A fourth value
  // here would be stored and then never matched by the prop engine.
  for (const f of PROP_FIRMS) {
    for (const p of f.products) {
      for (const ph of p.phases) {
        assert.ok(['p1', 'p2', 'funded'].includes(ph.id), `${f.id}/${p.id}/${ph.id}`);
      }
    }
  }
});

test('every product ends in a funded phase — an evaluation you cannot pass is not a product', () => {
  for (const f of PROP_FIRMS) {
    for (const p of f.products) {
      if (p.custom) continue;   // no phases to end in; asserted empty above
      assert.equal(p.phases[p.phases.length - 1].id, 'funded', `${f.id}/${p.id} never reaches funded`);
    }
  }
});

test('the shape of each product matches its name', () => {
  for (const f of PROP_FIRMS) {
    for (const p of f.products) {
      const evals = p.phases.filter((x) => x.accountType === 'eval').length;
      if (p.id === 'instant') assert.equal(evals, 0, `${f.id}/instant must have no evaluation phase`);
      if (p.id === '1step') assert.equal(evals, 1, `${f.id}/1step must have exactly one evaluation phase`);
      if (p.id === '2step') assert.equal(evals, 2, `${f.id}/2step must have exactly two evaluation phases`);
    }
  }
});

test('only a funded phase carries no profit target', () => {
  for (const f of PROP_FIRMS) {
    for (const p of f.products) {
      for (const ph of p.phases) {
        if (ph.accountType === 'funded') {
          assert.equal(ph.profitTargetPct, null, `${f.id}/${p.id}/${ph.id} funded phases carry no target`);
        } else {
          assert.equal(typeof ph.profitTargetPct, 'number', `${f.id}/${p.id}/${ph.id} eval needs a target`);
        }
      }
    }
  }
});

test('REGRESSION: the 2-step rules carried over from the pre-products catalog are unchanged', () => {
  // These are the values the file shipped with. This restructure must not alter
  // the rules a live challenge is being judged against — that is a silent
  // mis-scoring, not a visible bug.
  const gft = findProduct('gft', '2step');
  assert.deepEqual(gft.sizes, [25000, 50000, 100000]);
  assert.deepEqual(
    gft.phases.map((p) => [p.id, p.accountType, p.dailyDdPct, p.maxDdPct, p.profitTargetPct, p.minTradingDays]),
    [
      ['p1', 'eval', 5, 10, 8, 3],
      ['p2', 'eval', 5, 10, 5, 3],
      ['funded', 'funded', 5, 10, null, 0],
    ],
  );
  const ftmo = findProduct('ftmo', '2step');
  assert.deepEqual(ftmo.sizes, [10000, 25000, 50000, 100000, 200000]);
  assert.deepEqual(
    ftmo.phases.map((p) => [p.id, p.accountType, p.dailyDdPct, p.maxDdPct, p.profitTargetPct, p.minTradingDays]),
    [
      ['p1', 'eval', 5, 10, 10, 4],
      ['p2', 'eval', 5, 10, 5, 4],
      ['funded', 'funded', 5, 10, null, 0],
    ],
  );
  assert.equal(gft.verified, true);
  assert.equal(ftmo.verified, true);
});

test('templateToFields: eval phase → target set, no split', () => {
  const f = templateToFields('ftmo', '2step', 100000, 'p1');
  assert.equal(f.firm_id, 'ftmo');
  assert.equal(f.firm_name, 'FTMO');
  assert.equal(f.product_id, '2step');
  assert.equal(f.account_type, 'eval');
  assert.equal(f.start_balance, 100000);
  assert.equal(f.daily_dd_pct, 5);
  assert.equal(f.max_dd_pct, 10);
  assert.equal(f.profit_target_pct, 10);
  assert.equal(f.payout_split_pct, null);
  assert.equal(f.dd_type, 'static');
  assert.equal(f.min_trading_days, 4);
});

test('templateToFields: funded phase → split set, no target', () => {
  const f = templateToFields('gft', '2step', 50000, 'funded');
  assert.equal(f.account_type, 'funded');
  assert.equal(f.profit_target_pct, null);
  assert.equal(f.payout_split_pct, 80);
  assert.equal(f.min_trading_days, 0);
});

test('templateToFields: GFT phase 2 lowers the target', () => {
  assert.equal(templateToFields('gft', '2step', 25000, 'p1').profit_target_pct, 8);
  assert.equal(templateToFields('gft', '2step', 25000, 'p2').profit_target_pct, 5);
});

test('templateToFields: instant funding resolves straight to a funded account', () => {
  const f = templateToFields('gft', 'instant', 25000, 'funded');
  assert.equal(f.account_type, 'funded');
  assert.equal(f.profit_target_pct, null);
  assert.ok(f.payout_split_pct > 0);
});

test('templateToFields: carries product_id so 1-step and 2-step stay distinguishable', () => {
  // firm_id + size + account_type cannot tell them apart, which is the whole
  // reason mt5_accounts.product_id exists.
  assert.equal(templateToFields('gft', '1step', 50000, 'p1').product_id, '1step');
  assert.equal(templateToFields('gft', '2step', 50000, 'p1').product_id, '2step');
});

test('templateToFields: unknown firm, product or phase → null (fail safe)', () => {
  assert.equal(templateToFields('nope', '2step', 50000, 'p1'), null);
  assert.equal(templateToFields('ftmo', 'nope', 50000, 'p1'), null);
  assert.equal(templateToFields('ftmo', '2step', 50000, 'nope'), null);
  assert.equal(templateToFields('gft', 'instant', 25000, 'p1'), null, 'instant has no p1');
  assert.equal(findFirm('nope'), null);
  assert.equal(findProduct('gft', 'nope'), null);
  assert.equal(findProduct('nope', '2step'), null);
});

test('every firm names at least one platform that the platform catalog knows', async () => {
  const { PLATFORM_IDS } = await import('../src/domain/sync/platforms.js');
  for (const f of PROP_FIRMS) {
    for (const p of f.platforms) {
      assert.ok(PLATFORM_IDS.includes(p), `${f.id} names unknown platform ${p}`);
    }
  }
});

// ---- the unlisted firm, added for the Add Account wizard --------------------
//
// A prop trader at any of the ~100 firms this catalog does not list still has to
// reach the prop path: validateProvision requires firm_id AND product_id for
// capital_kind 'prop', and with unverified products hidden from the wizard the
// catalog offers exactly two. The 'other' firm's single 'custom' product carries
// NO percentages — the wizard collects them by hand — and that absence is
// asserted rather than tolerated.

test('the unlisted-firm escape exists, is last, and carries no invented rules', () => {
  const other = findFirm('other');
  assert.ok(other, "a firm_id 'other' must exist or an unlisted firm cannot use the prop path");
  assert.equal(PROP_FIRMS[PROP_FIRMS.length - 1].id, 'other',
    'the escape belongs at the end of the list, after every real firm');
  assert.equal(other.products.length, 1, 'the escape has exactly one product');
  const custom = other.products[0];
  assert.equal(custom.id, 'custom');
  assert.equal(custom.custom, true, 'the custom product must mark itself, so the tests can partition');
  assert.deepEqual(custom.sizes, [], 'a custom product must offer no sizes — the user types the balance');
  assert.deepEqual(custom.phases, [], 'a custom product must carry no phases — the wizard offers all three');
});

test('the custom product is the ONLY product that carries no rules', () => {
  // The inverse guard. Without it, marking a real product `custom: true` would
  // silently exempt it from every percentage assertion in this file.
  for (const f of PROP_FIRMS) {
    for (const p of f.products) {
      const bare = p.sizes.length === 0 && p.phases.length === 0;
      assert.equal(bare, p.custom === true,
        `${f.id}/${p.id}: a product is rule-free if and only if it is the custom one`);
    }
  }
});

test('the unlisted firm names every platform, since we cannot know which it uses', async () => {
  const { PLATFORM_IDS } = await import('../src/domain/sync/platforms.js');
  assert.deepEqual([...findFirm('other').platforms].sort(), [...PLATFORM_IDS].sort(),
    'the platform step filters to the firm\'s platforms — an unknown firm must not narrow it');
});

test('templateToFields refuses a custom product — there is nothing to resolve', () => {
  assert.equal(templateToFields('other', 'custom', 50000, 'p1'), null);
  assert.equal(templateToFields('other', 'custom', 50000, 'funded'), null);
});

// ---- size membership -------------------------------------------------------

test('templateToFields rejects a size the product does not sell', () => {
  // Phase A had no membership check: today's <select> cannot produce a bad size,
  // but the wizard's product step can, and an accepted 37000 would write a
  // start_balance the firm never offered and score the challenge against it.
  assert.equal(templateToFields('gft', '2step', 37000, 'p1'), null);
  assert.equal(templateToFields('ftmo', '2step', 1, 'p1'), null);
  assert.equal(templateToFields('gft', '2step', null, 'p1'), null);
  assert.equal(templateToFields('gft', '2step', undefined, 'p1'), null);
  // A string from a form control that names a real size still resolves — the
  // caller is an <input>/<select>, and Number() was always applied.
  assert.equal(templateToFields('gft', '2step', '50000', 'p1').start_balance, 50000);
});

// ---- the wizard's view of the catalog ---------------------------------------

test('wizardProducts hides unverified rules and keeps the custom escape', () => {
  // GFT 1step and instant carry verified: false with UNCONFIRMED drawdown
  // percentages (see the file header). A wrong drawdown mis-scores a real
  // trader's account for a whole challenge, so the wizard must not offer them
  // until they are checked.
  assert.deepEqual(wizardProducts('gft').map((p) => p.id), ['2step']);
  assert.deepEqual(wizardProducts('ftmo').map((p) => p.id), ['2step']);
  assert.deepEqual(wizardProducts('other').map((p) => p.id), ['custom']);
  assert.deepEqual(wizardProducts('nope'), []);
  assert.deepEqual(wizardProducts(undefined), []);
});

test('wizardProducts never returns a product with unverified rules', () => {
  for (const f of PROP_FIRMS) {
    for (const p of wizardProducts(f.id)) {
      // The custom product's verified: false means "nothing to verify" (asserted
      // above), not a hidden real rule set — it is the one product this test's
      // own guarantee (wizardProducts hides unverified rules) does not apply to.
      if (p.custom) continue;
      assert.notEqual(p.verified, false, `${f.id}/${p.id} is unverified and must not reach a user`);
    }
  }
});

test('every firm the wizard offers has at least one product to pick', () => {
  // Otherwise the firm step shows a card that leads to an empty page.
  for (const f of wizardFirms()) {
    assert.ok(wizardProducts(f.id).length > 0, `${f.id} would be a dead end in the wizard`);
  }
});

test('isCustomProduct is exact and fails safe', () => {
  assert.equal(isCustomProduct('other', 'custom'), true);
  assert.equal(isCustomProduct('gft', '2step'), false);
  assert.equal(isCustomProduct('gft', 'custom'), false, 'no real firm has a custom product');
  assert.equal(isCustomProduct('nope', 'custom'), false);
  assert.equal(isCustomProduct(undefined, undefined), false);
});

// ---- labels ----------------------------------------------------------------

test('every product id has a short label, and only the custom one is blank', () => {
  // The Phase A gap: "GoatFundedTrader 25K" was suggested for BOTH the 1-Step and
  // the 2-Step 25K account, so two accounts a trader must tell apart got one name.
  for (const id of PRODUCT_IDS) {
    assert.equal(typeof SHORT_PRODUCT_LABEL[id], 'string', `${id} has no short label`);
    if (id !== 'custom') assert.ok(SHORT_PRODUCT_LABEL[id].length > 0, `${id} short label is empty`);
  }
  assert.equal(SHORT_PRODUCT_LABEL.custom, '',
    'an unlisted firm has no product name to add — the label is firm + size');
  assert.notEqual(SHORT_PRODUCT_LABEL['1step'], SHORT_PRODUCT_LABEL['2step']);
});

test('sizeLabel renders thousands the way a trader writes them', () => {
  assert.equal(sizeLabel(25000), '25K');
  assert.equal(sizeLabel(200000), '200K');
  assert.equal(sizeLabel(1000), '1K');
  assert.equal(sizeLabel(2500), '2.5K');
  assert.equal(sizeLabel(500), '500');
  assert.equal(sizeLabel('50000'), '50K', 'form controls hand over strings');
});
