import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROP_FIRMS, findFirm, templateToFields } from '../frontend/src/features/prop/propFirms.js';

// The prop-firm catalog (frontend/src/features/prop/propFirms.js) is JSX-free so we can guard
// its shape + the resolver here. templateToFields output must match the account
// form-field shape AccountsModal.toPayload consumes.

test('catalog: every firm/phase is well-formed', () => {
  for (const f of PROP_FIRMS) {
    assert.ok(f.id && f.name, 'firm needs id + name');
    assert.ok(Array.isArray(f.sizes) && f.sizes.length, `${f.id} needs sizes`);
    assert.ok(['static', 'trailing'].includes(f.ddType), `${f.id} ddType`);
    assert.ok(f.phases.length, `${f.id} needs phases`);
    for (const p of f.phases) {
      assert.ok(['eval', 'funded'].includes(p.accountType), `${f.id}/${p.id} accountType`);
      assert.equal(typeof p.dailyDdPct, 'number');
      assert.equal(typeof p.maxDdPct, 'number');
      assert.equal(typeof p.minTradingDays, 'number');
    }
  }
});

test('firm ids are unique', () => {
  const ids = PROP_FIRMS.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('templateToFields: eval phase → target set, no split', () => {
  const f = templateToFields('ftmo', 100000, 'p1');
  assert.equal(f.account_type, 'eval');
  assert.equal(f.start_balance, 100000);
  assert.equal(f.daily_dd_pct, 5);
  assert.equal(f.max_dd_pct, 10);
  assert.equal(f.profit_target_pct, 10);   // FTMO Challenge target
  assert.equal(f.payout_split_pct, null);  // no split on eval
  assert.equal(f.dd_type, 'static');
  assert.equal(f.min_trading_days, 4);
});

test('templateToFields: funded phase → split set, no target', () => {
  const f = templateToFields('gft', 50000, 'funded');
  assert.equal(f.account_type, 'funded');
  assert.equal(f.start_balance, 50000);
  assert.equal(f.profit_target_pct, null);  // funded carries no target (engine expects null)
  assert.equal(f.payout_split_pct, 80);
  assert.equal(f.min_trading_days, 0);
});

test('templateToFields: GFT phase 2 lowers the target', () => {
  assert.equal(templateToFields('gft', 25000, 'p1').profit_target_pct, 8);
  assert.equal(templateToFields('gft', 25000, 'p2').profit_target_pct, 5);
});

test('templateToFields: unknown firm/phase → null (fail safe)', () => {
  assert.equal(templateToFields('nope', 50000, 'p1'), null);
  assert.equal(templateToFields('ftmo', 50000, 'nope'), null);
  assert.equal(findFirm('nope'), null);
});
