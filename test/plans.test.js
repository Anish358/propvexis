import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLANS, entitlements, canUseEA, canUseMetaApi, canUseReports,
  accountLimit, manualAccountLimit, isValidPlan, DEFAULT_PLAN,
} from '../src/domain/billing/plans.js';

// PLAN GATING IS CURRENTLY OFF (owner decision, 2026-08-25): which features belong
// to which tier is not decided yet, so every plan grants everything while the
// feature base is being built. These tests assert THAT policy rather than being
// deleted, so the file still fails when the values move.

const CAPABILITIES = ['ea', 'metaapi', 'csvImport', 'manual', 'reports'];
const CAPS = ['syncedAccounts', 'manualAccounts'];

test('THE POLICY PIN: every plan grants every capability, uncapped', () => {
  // This is the tripwire for re-segregating. When tiers return, this test fails
  // first — and what has to come back with them is the per-tier coverage that was
  // rewritten to the open policy in the SAME commit that lifted gating (find it
  // with `git log -p -- src/domain/billing/plans.js`):
  //   - here:                     per-tier capability and cap expectations
  //   - account-gating.test.js:   autoSyncGate refusing free, and pro AT its cap
  //   - provision.test.js:        provisionGate's 402 for each kind
  //   - reports.test.js:          canUseReports being Pro+
  // Restoring caps without restoring those leaves every 402 path untested.
  for (const plan of Object.keys(PLANS)) {
    for (const c of CAPABILITIES) assert.equal(PLANS[plan][c], true, `${plan}: ${c}`);
    for (const c of CAPS) assert.equal(PLANS[plan][c], Infinity, `${plan}: ${c}`);
  }
});

test('the three tiers still exist, and free is still the default', () => {
  // Lifting the restrictions must not collapse the tiers themselves: users.plan
  // stores these slugs, Razorpay maps to them, and re-segregating means changing
  // values in this shape rather than reintroducing it.
  assert.deepEqual(Object.keys(PLANS).sort(), ['free', 'premium', 'pro']);
  assert.equal(DEFAULT_PLAN, 'free');
});

test('every plan reaches the EA, MetaApi and reports paths while gating is off', () => {
  for (const plan of Object.keys(PLANS)) {
    assert.equal(canUseEA(plan), true, `${plan}: ea`);
    assert.equal(canUseMetaApi(plan), true, `${plan}: metaapi`);
    assert.equal(canUseReports(plan), true, `${plan}: reports`);
  }
});

test('no plan caps synced or manual accounts while gating is off', () => {
  for (const plan of Object.keys(PLANS)) {
    // The gates compare `count >= limit`, so Infinity is what makes them
    // unreachable — a large integer would still trip for a determined user.
    assert.equal(accountLimit(plan), Infinity, `${plan}: synced`);
    assert.equal(manualAccountLimit(plan), Infinity, `${plan}: manual`);
  }
});

test('an unknown, missing or invalid plan still resolves to free', () => {
  // The FALLBACK is the mechanism that fails closed once free is a floor again.
  // Today free restricts nothing, so what is asserted is the resolution itself —
  // which is what must keep holding for the fail-closed property to return with
  // the caps rather than needing to be rebuilt.
  for (const bad of ['enterprise', '', null, undefined, 42, {}]) {
    assert.equal(isValidPlan(bad), false, `${String(bad)} should be invalid`);
    assert.deepEqual(entitlements(bad), PLANS[DEFAULT_PLAN], `${String(bad)} must resolve to free`);
  }
});

test('isValidPlan recognizes the three tiers', () => {
  assert.equal(isValidPlan('free'), true);
  assert.equal(isValidPlan('pro'), true);
  assert.equal(isValidPlan('premium'), true);
});
