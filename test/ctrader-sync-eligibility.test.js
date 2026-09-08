import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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

test('a SCHEDULED sync is labelled by the job history, not by an MT5 column', () => {
  /* EVERY SCHEDULED cTRADER SYNC WAS LABELLED `first_sync`, FOR THE LIFE OF THE ACCOUNT.
   *
   * The label was `CASE WHEN c.verified_at IS NULL THEN 'first_sync' ELSE 'schedule'`,
   * and verified_at is an MT5 fact — markVerified stamps it after a successful login.
   * A cTrader account has no mt5_credentials row at all, so the LEFT JOIN leaves it
   * NULL forever and the CASE could only ever pick the first arm.
   *
   * Harmless to the sync itself, which is why it survived: it made the job HISTORY
   * unreadable. Prod showed eleven consecutive `first_sync` rows on two accounts that
   * had been syncing for days, and that cost real time while diagnosing the
   * orphaned-identity bug — the one signal that would have said "these accounts have
   * been running fine" was reporting the opposite.
   *
   * The job-based question needs no CASE per platform: on MT5 it agrees with
   * verified_at (markVerified and completeJob are driven by the same result), and on
   * cTrader it is simply correct. Verified against the database for both branches — a
   * text assertion cannot tell which arm a real row takes.
   */
  const t = dueAccountsQuery().text.replace(/\s+/g, ' ');
  assert.doesNotMatch(t, /WHEN c\.verified_at IS NULL THEN 'first_sync'/,
    'the label must not be derived from a column one platform does not have');
  assert.match(t, /EXISTS \(SELECT 1 FROM sync_jobs d WHERE d\.account_id = a\.id AND d\.status = 'done'\) THEN 'schedule' ELSE 'first_sync' END/);
});

test('the MT5 lease payload keeps its OWN first_sync flag', () => {
  /* Not the same thing, and it must not be folded into the label above. The worker's
   * payload carries `first_sync: row.verified_at == null`, which answers "has this
   * CREDENTIAL ever logged in successfully" — an MT5 question about an MT5 fact, used
   * by the agent rather than by the sync history. Only the scheduler's label was wrong. */
  const routes = readFileSync(
    fileURLToPath(new URL('../src/routes/sync.js', import.meta.url)), 'utf8');
  assert.match(routes, /first_sync: row\.verified_at == null/);
});
