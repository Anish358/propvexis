import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  eaAllowed, syncedAccountLimit, manualAccountLimit, autoSyncGate, KNOWN_PLANS,
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

test('autoSyncGate: free is refused with an upgrade route', () => {
  const g = autoSyncGate({ plan: 'free', accounts: [] });
  assert.equal(g.allowed, false);
  assert.equal(g.upgrade, true);
  assert.match(g.reason, /Pro/, 'the reason must name the plan that lifts it');
});

test('autoSyncGate: pro under the cap is allowed and says nothing', () => {
  const g = autoSyncGate({ plan: 'pro', accounts: [{ kind: 'synced' }, { kind: 'manual' }] });
  assert.equal(g.allowed, true);
  assert.equal(g.reason, null);
  assert.equal(g.upgrade, false);
});

test('autoSyncGate: pro AT the cap is refused and names the number', () => {
  // Spec §7.5: "3 of 3 synced accounts used" on the card, not a 402 after the
  // user has typed a broker password.
  const accounts = [{ kind: 'synced' }, { kind: 'synced' }, { kind: 'synced' }];
  const g = autoSyncGate({ plan: 'pro', accounts });
  assert.equal(g.allowed, false);
  assert.equal(g.upgrade, true);
  assert.match(g.reason, /3 of 3/, 'the reason must carry the count, not a bare "upgrade"');
});

test('autoSyncGate: only synced accounts count toward the synced cap', () => {
  const manualOnly = Array.from({ length: 9 }, () => ({ kind: 'manual' }));
  assert.equal(autoSyncGate({ plan: 'pro', accounts: manualOnly }).allowed, true);
});

test('autoSyncGate: an archived synced account still occupies its slot', () => {
  // is_active is a soft archive — the row, its ingest token and its MT5 login all
  // still exist, and syncedAccountCount on the server does not filter it. A UI
  // that discounted archived accounts would offer a slot provision then 402s on.
  const accounts = [
    { kind: 'synced', is_active: false },
    { kind: 'synced', is_active: false },
    { kind: 'synced', is_active: true },
  ];
  assert.equal(autoSyncGate({ plan: 'pro', accounts }).allowed, false);
});

test('autoSyncGate is total — a missing accounts list is treated as none', () => {
  assert.equal(autoSyncGate({ plan: 'pro' }).allowed, true);
  assert.equal(autoSyncGate({ plan: 'pro', accounts: null }).allowed, true);
});
