import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripNullProfitTarget, ACCOUNT_COLUMNS } from '../src/domain/accounts/accounts.js';

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

// There is no test database, so updateAccount's PATCH allowlist is pinned as
// TEXT — the same pattern test/migration-0026.test.js and test/capital-kind.test.js
// use to slice a function and assert on it. Anchored on the function's own
// boundary (the next export), not a fixed byte count or a file-wide scan.
const accountsSrc = readFileSync(
  new URL('../src/domain/accounts/accounts.js', import.meta.url),
  'utf8',
);
const updateAccountSrc = accountsSrc.slice(
  accountsSrc.indexOf('export async function updateAccount'),
  accountsSrc.indexOf('export async function deleteAccount'),
);

test('updateAccount: product_id is in the PATCH allowlist, or editing a prop account cannot re-point its template', () => {
  // TemplatePicker renders unconditionally on the edit form (AccountForms.jsx),
  // so applying the GFT 1-Step template while editing sends product_id
  // alongside the rule percentages it pre-fills. If product_id is missing from
  // `allowed`, the UPDATE silently drops it: the new percentages save but
  // product_id stays whatever it was (normally NULL), and the account then
  // reads as hand-configured — exactly the drift the products layer exists to
  // prevent.
  const allowedMatch = updateAccountSrc.match(/const allowed = \[([^\]]*)\];/);
  assert.ok(allowedMatch, 'could not find the allowed-fields array in updateAccount');
  const allowed = allowedMatch[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
  assert.ok(allowed.includes('product_id'), 'product_id must be PATCHable');
});

// PRE-EXISTING gap, surfaced by this branch's own drift test above: listAccounts'
// SELECT omitted dd_type/min_trading_days even though ACCOUNT_COLUMNS (and
// updateAccount) both know about them. The full chain this breaks: an account
// loaded from listAccounts() has no min_trading_days -> formFrom (AccountForms.jsx)
// defaults it to '' -> toPayload sends min_trading_days: null -> updateAccount
// writes NULL into a column that is INT NOT NULL (0016_challenges_equity.sql) ->
// every account edit from Settings > Accounts 500s. It also silently resets a
// trailing-drawdown account's dd_type back to 'static', because toPayload
// defaults that field too.
//
// What this proves: every column named in ACCOUNT_COLUMNS (the column set
// createAccount/updateAccount/provisioning all read and write) is present in
// listAccounts' own SELECT, as `a.<column>` — the alias listAccounts' query
// uses for mt5_accounts. What this does NOT prove: column order, that
// listAccounts selects nothing EXTRA it shouldn't, or that ACCOUNT_COLUMNS
// itself is complete — a column missing from BOTH lists would pass this test
// silently. It only catches the two lists drifting apart from each other, which
// is exactly the failure mode above.
test('listAccounts: its SELECT never drifts behind ACCOUNT_COLUMNS', () => {
  const listAccountsSrc = accountsSrc.slice(
    accountsSrc.indexOf('export async function listAccounts'),
    accountsSrc.indexOf('export const ACCOUNT_COLUMNS'),
  );
  const columns = ACCOUNT_COLUMNS.split(',').map((s) => s.trim());
  for (const col of columns) {
    assert.match(
      listAccountsSrc,
      new RegExp(`\\ba\\.${col}\\b`),
      `listAccounts' SELECT is missing a.${col} (present in ACCOUNT_COLUMNS)`,
    );
  }
});
