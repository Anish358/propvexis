import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entitlements, canUseEA, canUseMetaApi, accountLimit, isValidPlan, DEFAULT_PLAN } from '../src/plans.js';

test('free plan: manual + csv only, no EA/MetaApi, zero synced accounts', () => {
  assert.equal(canUseEA('free'), false);
  assert.equal(canUseMetaApi('free'), false);
  assert.equal(accountLimit('free'), 0);
  assert.equal(entitlements('free').csvImport, true);
  assert.equal(entitlements('free').manual, true);
});

test('pro plan: EA enabled with an account cap, no MetaApi', () => {
  assert.equal(canUseEA('pro'), true);
  assert.equal(canUseMetaApi('pro'), false);
  assert.equal(accountLimit('pro'), 3);
});

test('premium plan: EA + MetaApi enabled', () => {
  assert.equal(canUseEA('premium'), true);
  assert.equal(canUseMetaApi('premium'), true);
  assert.equal(accountLimit('premium') >= 1, true);
});

test('unknown / missing / invalid plan fails closed to free', () => {
  for (const bad of ['enterprise', '', null, undefined, 42, {}]) {
    assert.equal(isValidPlan(bad), false, `${String(bad)} should be invalid`);
    assert.equal(canUseEA(bad), false, `${String(bad)} must not unlock EA`);
    assert.equal(canUseMetaApi(bad), false, `${String(bad)} must not unlock MetaApi`);
    assert.equal(accountLimit(bad), 0, `${String(bad)} must not grant synced accounts`);
  }
  assert.equal(DEFAULT_PLAN, 'free');
});

test('isValidPlan recognizes the three tiers', () => {
  assert.equal(isValidPlan('free'), true);
  assert.equal(isValidPlan('pro'), true);
  assert.equal(isValidPlan('premium'), true);
});
