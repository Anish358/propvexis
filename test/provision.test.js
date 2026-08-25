import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PHASES, kindForImportMethod, validateProvision, provisionGate,
} from '../src/domain/accounts/provision.js';

// A valid prop + Auto Sync body, spread and overridden per case.
const propBody = () => ({
  capital_kind: 'prop',
  label: 'GFT 50K',
  platform: 'mt5',
  import_method: 'auto_sync',
  firm_id: 'gft',
  firm_name: 'GoatFundedTrader',
  product_id: '2step',
  phase: 'p1',
  start_balance: 50000,
  account_type: 'eval',
  daily_dd_pct: 5,
  max_dd_pct: 10,
  profit_target_pct: 8,
  dd_type: 'static',
  min_trading_days: 3,
  credential: { server: 'GoatFunded-Server', login: 314943467, password: 'investor-pw' },
});

test('kindForImportMethod encodes the CHECK constraint from migration 0026', () => {
  assert.equal(kindForImportMethod('auto_sync'), 'synced');
  assert.equal(kindForImportMethod('ea'), 'synced');
  assert.equal(kindForImportMethod('file'), 'manual');
  assert.equal(kindForImportMethod('manual'), 'manual');
  assert.equal(kindForImportMethod('nope'), null);
  assert.equal(kindForImportMethod(undefined), null);
});

test('a complete prop body validates and derives kind', () => {
  const r = validateProvision(propBody());
  assert.equal(r.ok, true);
  assert.equal(r.value.kind, 'synced');
  assert.equal(r.value.capital_kind, 'prop');
  assert.equal(r.value.phase, 'p1');
  assert.equal(r.value.currency, 'USD', 'currency defaults rather than being required');
});

test('a complete live body validates and carries no prop fields', () => {
  const r = validateProvision({
    capital_kind: 'live',
    label: 'My IC Markets account',
    platform: 'mt5',
    import_method: 'manual',
    broker: 'IC Markets',
    start_balance: 5000,
    currency: 'EUR',
  });
  assert.equal(r.ok, true);
  assert.equal(r.value.kind, 'manual');
  assert.equal(r.value.firm_id, null);
  assert.equal(r.value.product_id, null);
  assert.equal(r.value.phase, null, 'a live account has no challenge, so no phase');
  assert.equal(r.value.currency, 'EUR');
  assert.equal(r.value.broker, 'IC Markets');
});

test('capital_kind must be one of the two the CHECK allows', () => {
  for (const capital_kind of [undefined, '', 'both', 'PROP', 'demo']) {
    const r = validateProvision({ ...propBody(), capital_kind });
    assert.equal(r.ok, false, `${String(capital_kind)} must be rejected`);
    assert.match(r.error, /capital/i);
  }
});

test('the label is required and trimmed', () => {
  assert.equal(validateProvision({ ...propBody(), label: '   ' }).ok, false);
  assert.equal(validateProvision({ ...propBody(), label: undefined }).ok, false);
  assert.equal(validateProvision({ ...propBody(), label: '  GFT 50K  ' }).value.label, 'GFT 50K');
});

test('the label is capped, because it is rendered in a table cell and a switcher', () => {
  const r = validateProvision({ ...propBody(), label: 'x'.repeat(500) });
  assert.equal(r.ok, false);
  assert.match(r.error, /label/i);
});

test('an unknown or not-yet-selectable platform is refused', () => {
  assert.equal(validateProvision({ ...propBody(), platform: 'nope' }).ok, false);
  assert.equal(validateProvision({ ...propBody(), platform: undefined }).ok, false);
  const soon = validateProvision({ ...propBody(), platform: 'tradelocker', import_method: 'file' });
  assert.equal(soon.ok, false, 'a Soon platform must not be accepted even with a valid method');
  assert.match(soon.error, /platform/i);
});

test('an import method the platform does not offer is refused', () => {
  // 'other' can only take file/manual — offering it auto_sync would create a
  // synced account no worker could ever service.
  const r = validateProvision({
    capital_kind: 'live', label: 'X', platform: 'other', import_method: 'auto_sync',
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /Other|import method/i);
});

test('a prop account needs a firm, a product and a phase', () => {
  for (const missing of ['firm_id', 'product_id', 'phase']) {
    const body = propBody();
    delete body[missing];
    const r = validateProvision(body);
    assert.equal(r.ok, false, `${missing} must be required for a prop account`);
  }
});

test('phase is validated because its values are a schema fact', () => {
  // 'p3' JOINED THE SET 2026-08-25 with the 3-Step account type. It is enforced HERE and
  // in the /api/prop/advance whitelist and nowhere else: migration 0016 declares `phase
  // TEXT NOT NULL DEFAULT 'p1'` and lists the values in a comment, so there is no CHECK
  // constraint behind this array.
  assert.deepEqual(PHASES, ['p1', 'p2', 'p3', 'funded']);
  for (const phase of PHASES) {
    assert.equal(validateProvision({ ...propBody(), phase }).ok, true, `${phase} must be accepted`);
  }
  // A fourth evaluation is not a phase, and neither is a typo.
  assert.equal(validateProvision({ ...propBody(), phase: 'p4' }).ok, false);
  assert.equal(validateProvision({ ...propBody(), phase: 'Funded' }).ok, false);
});

test('firm and product are NOT checked against the catalog, only for shape', () => {
  // The firm catalog lives in frontend/src, which the backend cannot import. So
  // membership is unverifiable here by design; the client sends the rule numbers
  // exactly as toPayload already does today.
  const r = validateProvision({ ...propBody(), firm_id: 'some-new-firm', product_id: '2step' });
  assert.equal(r.ok, true);
  assert.equal(r.value.firm_id, 'some-new-firm');
});

test('a live account may not smuggle in prop fields', () => {
  const r = validateProvision({
    capital_kind: 'live', label: 'X', platform: 'mt5', import_method: 'manual', firm_id: 'gft',
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /live/i);
});

test('auto_sync requires a credential block; the other methods must not carry one', () => {
  const noCred = validateProvision({ ...propBody(), credential: undefined });
  assert.equal(noCred.ok, false);
  assert.match(noCred.error, /credential/i);

  const strayCred = validateProvision({
    ...propBody(), import_method: 'ea', credential: { server: 'S', login: 1, password: 'p' },
  });
  assert.equal(strayCred.ok, false, 'an EA account stores no password — a stray one must not be accepted');
});

test('the validated value never carries the password onward', () => {
  // The route hands the credential to the connector separately. Keeping it out of
  // `value` means the object that gets logged, spread or serialized cannot leak it.
  const r = validateProvision({ ...propBody(), credential: { server: 'S', login: 7, password: 'secret' } });
  assert.equal(r.ok, true);
  assert.equal(JSON.stringify(r.value).includes('secret'), false, 'the password must not appear in value');
});

test('numeric rule fields are coerced, and blank becomes null not zero', () => {
  const r = validateProvision({ ...propBody(), start_balance: '50000', min_trading_days: '', max_dd_pct: '10.5' });
  assert.equal(r.value.start_balance, 50000);
  assert.equal(r.value.min_trading_days, null, 'blank must not become 0 — 0 means "no requirement"');
  assert.equal(r.value.max_dd_pct, 10.5);
});

test('provision_key is passed through when present and null otherwise', () => {
  assert.equal(validateProvision({ ...propBody(), provision_key: 'abc-123' }).value.provision_key, 'abc-123');
  assert.equal(validateProvision(propBody()).value.provision_key, null);
  assert.equal(validateProvision({ ...propBody(), provision_key: 'x'.repeat(200) }).ok, false,
    'an unbounded key would be an unbounded unique index entry');
});

// PLAN GATING IS CURRENTLY OFF (owner decision, 2026-08-25) — see the pin in
// plans.test.js, which lists what comes back here with the caps: free refused a
// synced account entirely (402, /Pro/), free capped at 5 manual accounts, pro at 3
// synced with the cap named in the message, and an unknown plan inheriting the
// free refusal. What is asserted while it is off is that NOTHING refuses, at any
// count and on any plan — a cap left behind at one call site is a 402 the UI has
// no gate for and cannot explain.
test('provisionGate: no plan and no count is refused while gating is off', () => {
  for (const plan of ['free', 'pro', 'premium', undefined, 'enterprise']) {
    for (const kind of ['synced', 'manual']) {
      for (const n of [0, 5, 250]) {
        const r = provisionGate({ plan, kind, syncedCount: n, manualCount: n });
        assert.equal(r.ok, true, `${String(plan)}/${kind} at ${n}: ${r.error}`);
      }
    }
  }
});

test('provisionGate still routes by kind, so restoring a cap needs no rewiring', () => {
  // The two branches are what the caps hang off. An unknown kind must take the
  // manual branch rather than the synced one, or restoring the synced cap would
  // silently leave a way past it.
  assert.equal(provisionGate({ plan: 'free', kind: 'synced', syncedCount: 0, manualCount: 0 }).ok, true);
  assert.equal(provisionGate({ plan: 'free', kind: 'nonsense', syncedCount: 0, manualCount: 0 }).ok, true);
  assert.equal(provisionGate({ plan: 'free', kind: undefined, syncedCount: 0, manualCount: 0 }).ok, true);
});
