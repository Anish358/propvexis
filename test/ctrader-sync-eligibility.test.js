import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueAccountsQuery } from '../src/domain/sync/queue.js';
import { ACCOUNT_COLUMNS } from '../src/domain/accounts/accounts.js';

test('THE 3-HOUR AUTO SYNC MUST REACH A PLATFORM WITH NO mt5_credentials ROW', () => {
  /* THE THIRD TIME THIS EXACT JOIN HAS BITTEN.
   *
   * dueAccountsQuery had `JOIN mt5_credentials c ON c.account_id = a.id` — an
   * INNER join. A cTrader account has no row there: its credential is an OAuth
   * token pair on ctrader_identities, at cTID grain, shared by every account that
   * identity owns.
   *
   * So the scheduled sync matched nothing for cTrader. Not an error, not a failed
   * job — no row was ever considered, and the account simply never synced. Same
   * shape as leasedPayloadQuery (fixed) and the read_only filter (fixed); this is
   * the one that was left.
   *
   * The join must be OUTER, and "does this account have a usable credential" must
   * be asked per platform. */
  const q = dueAccountsQuery();
  assert.match(q.text, /LEFT JOIN mt5_credentials/,
    'an inner join silently excludes every platform whose credential lives elsewhere');
  assert.match(q.text, /ctrader_identities/,
    'a cTrader account is eligible when its IDENTITY is live, not when a password row exists');
});

test('an MT5 account with no credential is still excluded', () => {
  // Loosening the join must not loosen the RULE. An MT5 account with no stored
  // password cannot sync, and queueing it produces a job the worker can only fail.
  const t = dueAccountsQuery().text.replace(/\s+/g, ' ');
  assert.match(t, /a\.platform <> 'mt5' OR c\.read_only IS NOT FALSE/,
    'the read_only rule stays scoped to MT5');
  assert.match(t, /c\.account_id IS NOT NULL/,
    'MT5 must still require its credential row to exist');
});

test('a revoked cTrader grant stops scheduling that account', () => {
  // Revoking is the user saying "stop reading my broker". Continuing to queue
  // jobs would produce a failure every three hours, forever.
  assert.match(dueAccountsQuery().text, /i\.revoked_at IS NULL/);
});

test('the account list carries the REAL login, not only the banded one', () => {
  /* THE MISLABEL THIS FIXES. mt5_login holds the BANDED value (4e12 + ctid), and
   * the accounts page printed it as `MT5 ${a.mt5_login}` — so a cTrader account
   * displayed as "MT5 4000048583094", which is neither its platform nor a number
   * the trader has ever seen. platform_login is the number cTrader shows them. */
  assert.match(ACCOUNT_COLUMNS, /platform_login/);
});
