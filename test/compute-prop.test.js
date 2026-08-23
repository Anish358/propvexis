import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeProp } from '../frontend/src/lib/metrics.js';

// computeProp has no callers today (Phase B wires it up), but the trap it must
// not fall into is live even without one: a live (own-capital) account keeps
// daily_dd_pct/max_dd_pct/profit_target_pct at their NOT NULL schema defaults
// even though it has no rule to enforce, and this function reads those columns
// straight off the account with no filter.

test('computeProp: a live account gets null, not a fabricated drawdown/target', () => {
  assert.equal(computeProp([], { capital_kind: 'live', daily_dd_pct: 5, max_dd_pct: 10, profit_target_pct: 8 }), null);
});

test('computeProp: a prop account still computes', () => {
  const out = computeProp([], { capital_kind: 'prop', start_balance: 50000 });
  assert.ok(out, 'a real prop account must not be guarded away');
  assert.equal(out.start, 50000);
});

test('computeProp: a missing capital_kind defaults to prop, matching every other capital_kind check in the app', () => {
  // Pre-migration-0026 rows (and any account object built without the field)
  // must not be silently treated as live — see onlyPropCapital (propAccounts.js)
  // and propAccountsOnly (accounts.js) for the same fallback.
  const out = computeProp([], { start_balance: 25000 });
  assert.ok(out);
  assert.equal(out.start, 25000);
});
