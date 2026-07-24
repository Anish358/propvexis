import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripNullProfitTarget } from '../src/accounts.js';

// mt5_accounts.profit_target_pct is NOT NULL (the eval-template default);
// challenges.profit_target_pct is nullable (NULL = no target). Clearing a
// funded account's manual target sends profit_target_pct: null, which must be
// dropped before it reaches the NOT NULL column, or the account-row UPDATE
// throws (this broke the dashboard's "Remove target" button with a 500).

test('stripNullProfitTarget: drops a null profit_target_pct, keeps other fields', () => {
  const fields = { label: 'GFT 25k', profit_target_pct: null };
  assert.deepEqual(stripNullProfitTarget(fields), { label: 'GFT 25k' });
});

test('stripNullProfitTarget: leaves a numeric profit_target_pct untouched', () => {
  const fields = { profit_target_pct: 10 };
  assert.deepEqual(stripNullProfitTarget(fields), { profit_target_pct: 10 });
});

test('stripNullProfitTarget: leaves fields without profit_target_pct untouched', () => {
  const fields = { label: 'GFT 25k' };
  assert.deepEqual(stripNullProfitTarget(fields), { label: 'GFT 25k' });
});
