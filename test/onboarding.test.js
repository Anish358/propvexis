import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needsOnboarding } from '../src/platform/auth/onboarding.js';

// A brand-new user has no onboarded_at yet → must go through the wizard.
test('needsOnboarding: true when onboarded_at is null or absent', () => {
  assert.equal(needsOnboarding({ id: 1, onboarded_at: null }), true);
  assert.equal(needsOnboarding({ id: 1 }), true);
});

// Once stamped (any truthy timestamp), the wizard is done.
test('needsOnboarding: false once onboarded_at is set', () => {
  assert.equal(needsOnboarding({ id: 1, onboarded_at: '2026-07-25T00:00:00Z' }), false);
});

// No user (logged out / deleted) → nothing to onboard, never true.
test('needsOnboarding: false for a missing user', () => {
  assert.equal(needsOnboarding(null), false);
  assert.equal(needsOnboarding(undefined), false);
});
