import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  eaAllowed, syncedAccountLimit, manualAccountLimit, autoSyncGate, syncedUsage, KNOWN_PLANS,
} from '../frontend/src/features/accounts/accountGating.js';
import { PLANS, DEFAULT_PLAN } from '../src/domain/billing/plans.js';

// THE DRIFT TEST. The plan entitlements exist twice — once as the server's
// enforcement (src/domain/billing/plans.js) and once as the UI's gate — because
// no frontend module imports outside frontend/, and the deploy shape is why
// (rsync ships `src db scripts ea` plus `frontend/dist`). Same arrangement
// platform-catalog.test.js enforces between the two platform catalogs.
//
// A backend test may import a frontend module only while that module is pure
// data: CI installs backend dependencies only, so anything pulling React would
// fail here and nowhere else.

test('the UI agrees with the server about every plan it knows', () => {
  for (const [plan, ent] of Object.entries(PLANS)) {
    assert.equal(eaAllowed(plan), ent.ea, `${plan}: ea`);
    assert.equal(syncedAccountLimit(plan), ent.syncedAccounts, `${plan}: syncedAccounts`);
    assert.equal(manualAccountLimit(plan), ent.manualAccounts, `${plan}: manualAccounts`);
  }
});

test('the UI knows exactly the plans the server does — no more, no fewer', () => {
  // A plan the server grants and the UI has never heard of falls to the free
  // gate, so a paying user is refused Auto Sync in the wizard and then allowed it
  // by provision — a contradiction the user cannot act on.
  assert.deepEqual([...KNOWN_PLANS].sort(), Object.keys(PLANS).sort());
});

test('an unknown, absent or malformed plan fails closed to free', () => {
  for (const bad of [undefined, null, '', 'enterprise', 42, {}]) {
    assert.equal(eaAllowed(bad), PLANS[DEFAULT_PLAN].ea, `${String(bad)}`);
    assert.equal(syncedAccountLimit(bad), PLANS[DEFAULT_PLAN].syncedAccounts);
  }
});

test('autoSyncGate: while gating is off, every plan may start an Auto Sync account', () => {
  // PLAN GATING IS CURRENTLY OFF (owner decision, 2026-08-25) — see the pin in
  // plans.test.js. Before it was lifted this test asserted that FREE was refused
  // with reason /Pro/ and upgrade true; that is what comes back with the caps.
  for (const plan of KNOWN_PLANS) {
    const g = autoSyncGate({ plan, accounts: [] });
    assert.equal(g.allowed, true, `${plan}: allowed`);
    assert.equal(g.reason, null, `${plan}: reason`);
    assert.equal(g.upgrade, false, `${plan}: upgrade`);
  }
});

test('autoSyncGate: pro under the cap is allowed and says nothing', () => {
  const g = autoSyncGate({ plan: 'pro', accounts: [{ kind: 'synced' }, { kind: 'manual' }] });
  assert.equal(g.allowed, true);
  assert.equal(g.reason, null);
  assert.equal(g.upgrade, false);
});

test('autoSyncGate: no number of existing accounts trips the gate while it is off', () => {
  // The refusal machinery is kept, not deleted — spec §7.5 wants "3 of 3 synced
  // accounts used" on the card rather than a 402 after the user has typed a broker
  // password, and that is what returns with the caps. What is asserted now is that
  // nothing reaches it: an uncapped plan must not refuse at some large count.
  const many = Array.from({ length: 50 }, () => ({ kind: 'synced' }));
  assert.equal(autoSyncGate({ plan: 'free', accounts: many }).allowed, true);
  assert.equal(autoSyncGate({ plan: 'pro', accounts: many }).allowed, true);
});

test('autoSyncGate: only synced accounts count toward the synced cap', () => {
  const manualOnly = Array.from({ length: 9 }, () => ({ kind: 'manual' }));
  assert.equal(autoSyncGate({ plan: 'pro', accounts: manualOnly }).allowed, true);
});

test('syncedUsage: an archived synced account still occupies its slot', () => {
  // is_active is a soft archive — the row, its ingest token and its MT5 login all
  // still exist, and syncedAccountCount on the server does not filter it. A UI that
  // discounted archived accounts would offer a slot provision then 402s on.
  //
  // Asserted against the COUNT rather than the gate's refusal: with the caps lifted
  // the refusal is unreachable, and this rule is the half of the gate that has an
  // actual landmine in it. It must not go untested for as long as gating is off.
  assert.equal(syncedUsage([
    { kind: 'synced', is_active: false },
    { kind: 'synced', is_active: false },
    { kind: 'synced', is_active: true },
  ]), 3);
  assert.equal(syncedUsage([{ kind: 'manual' }, { kind: 'synced' }]), 1, 'manual buckets take no slot');
  assert.equal(syncedUsage(undefined), 0, 'a missing list is no accounts');
  assert.equal(syncedUsage(null), 0);
  assert.equal(syncedUsage([null, {}, { kind: 'synced' }]), 1, 'a malformed row is not a synced account');
});

test('autoSyncGate is total — a missing accounts list is treated as none', () => {
  assert.equal(autoSyncGate({ plan: 'pro' }).allowed, true);
  assert.equal(autoSyncGate({ plan: 'pro', accounts: null }).allowed, true);
});
