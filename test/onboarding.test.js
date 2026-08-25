import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needsOnboarding } from '../src/platform/auth/onboarding.js';
import { readSrc, srcExists } from './helpers/src-files.js';

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

test('first run resolves to the wizard, not to a separate onboarding screen', () => {
  // The route table is now shared (spec §8.2): first run renders the SAME wizard routes
  // as everyone else, with `welcome` in front. Asserted here as well as in
  // new-account-pages.test.js because this is the file a reader checks when asking
  // "what happens to a user with no onboarded_at".
  const app = readSrc('App.jsx');
  assert.match(app, /!user\.onboarded_at/);
  assert.match(app, /to="\/accounts\/new\/welcome"/);
  assert.equal(srcExists('Onboarding.jsx'), false,
    'the separate first-run screen carried a duplicate of the account form');
});
