import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../src/platform/paths.js';
import { repointAccountsToIdentityQuery } from '../src/domain/sync/ctraderIdentities.js';
import {
  SYNC_CONNECTED_SQL, SYNC_CREDENTIAL_USABLE_SQL, SYNC_ELIGIBILITY_JOINS,
} from '../src/domain/sync/eligibility.js';
import {
  accountSyncConnectedQuery, autoSyncAccountsNeedingReconnectQuery,
  dueAccountsQuery, syncableAccountsQuery,
} from '../src/domain/sync/queue.js';

const src = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8');

/* RE-AUTHORIZING cTRADER SILENTLY DISCONNECTED EVERY ACCOUNT IT COVERED.
 *
 * PROD 2026-09-08, and it had been true for days. The OAuth callback creates a new
 * identity row on every consent (it must — the token pair is new and the cTID is not
 * known until discovery). Discovery then revokes the older row for the same cTID,
 * because uq_ctrader_identities_live would raise otherwise. Nothing repointed the
 * accounts that referenced the retired row:
 *
 *     account 32  ->  identity 4   REVOKED 09-05 20:15
 *     account 34  ->  identity 6   REVOKED 09-08 08:58
 *                     identity 7   live, owning nothing
 *
 * Every query that decides whether an account can sync joins ctrader_identities with
 * `revoked_at IS NULL`, so both accounts fell out of the 3-hour scheduler, out of the
 * Sync Trades button, and out of the worker's payload query — while Settings ›
 * Accounts went on reporting "Auto sync · Synced" for both, because that column read
 * import_method and the newest job, which are HISTORICAL facts.
 *
 * The trigger is the thing a trader does when sync looks unhealthy: authorize again.
 */

test('a new grant adopts the accounts of every older grant for the same cTrader login', () => {
  const q = repointAccountsToIdentityQuery(7, 12191876);
  assert.match(q.text, /UPDATE mt5_accounts a/);
  assert.match(q.text, /SET ctrader_identity_id = \$1/);
  assert.match(q.text, /a\.ctrader_identity_id = old\.id/);
  assert.match(q.text, /old\.ctid_user_id = \$2/);
  assert.match(q.text, /old\.id <> \$1/, 'never repoint an account onto the row it already has');
  assert.deepEqual(q.values, [7, 12191876]);
});

test('it does NOT require the old grant to still be live', () => {
  /* Deliberate, and it is what makes this both a fix and a repair: a trader who
   * disconnected a grant on purpose gets their accounts back by authorizing again, and
   * the already-orphaned prod rows are adopted by the next authorization rather than
   * needing a hand-written UPDATE. */
  assert.doesNotMatch(repointAccountsToIdentityQuery(7, 1).text, /old\.revoked_at IS NULL/);
});

test('it cannot hand an account to another tenant', () => {
  // ctid_user_id is a cTRADER-side id. Nothing stops two PropVexis users authorizing
  // the same cTrader login, and matching on it alone would move one user's account onto
  // the other's grant — a cross-tenant read of live trading data.
  const t = repointAccountsToIdentityQuery(7, 12191876).text;
  assert.match(t, /old\.user_id = \(SELECT user_id FROM ctrader_identities WHERE id = \$1\)/);
  assert.match(t, /a\.user_id = old\.user_id/);
});

test('the migration repairs the rows that already happened', () => {
  const mig = src('db/migrations/0034_ctrader_reclaim_orphaned_accounts.sql');
  assert.match(mig, /UPDATE mt5_accounts a/);
  assert.match(mig, /dead\.revoked_at IS NOT NULL/, 'only orphans are touched');
  assert.match(mig, /live\.revoked_at IS NULL/, 'and only onto a LIVE replacement');
  assert.match(mig, /live\.ctid_user_id = dead\.ctid_user_id/, 'the same cTrader login');
  assert.match(mig, /a\.user_id = live\.user_id/, 'the same owner');
  // An account whose grant was revoked and NOT replaced is a deliberate disconnect. It
  // has no live row to match and must be left disconnected, because that is the truth.
  assert.match(mig, /dead\.ctid_user_id IS NOT NULL/);
});

/* ── ONE DEFINITION OF "CAN THIS ACCOUNT SYNC" ─────────────────────────────────────
 *
 * The question was written out four times and the copies disagreed: the per-account
 * route asked only whether an account HAD an identity, while the other three required
 * it to be LIVE. So a revoked grant passed the route, a job was queued, and
 * ctraderLeasedPayloadQuery — which does check — returned no row for it: lease, report
 * nothing, expire, reclaim, forever, with no error anywhere.
 */

test('every consumer reads the SHARED predicate, not a fourth copy', () => {
  const queue = src('src/domain/sync/queue.js');
  const accounts = src('src/domain/accounts/accounts.js');

  for (const [name, text] of [
    ['dueAccountsQuery', queue], ['listAccounts', accounts],
  ]) {
    assert.match(text, /SYNC_CONNECTED_SQL/, `${name}'s module must import the shared predicate`);
    assert.match(text, /SYNC_ELIGIBILITY_JOINS/, `${name}'s module must import the shared joins`);
  }

  // And no module writes the predicate out by hand any more. The inline CASE was the
  // shape that drifted.
  for (const [file, text] of [['queue.js', queue], ['accounts.js', accounts]]) {
    assert.doesNotMatch(text, /WHEN 'ctrader' THEN ci\.id IS NOT NULL/,
      `${file} still contains a hand-written copy of the predicate`);
  }
});

test('the shared fragments actually reach the SQL, expanded', () => {
  // A template that failed to interpolate would leave a literal ${...} in the query and
  // fail at the database rather than here.
  for (const [name, q] of [
    ['dueAccountsQuery', dueAccountsQuery()],
    ['syncableAccountsQuery', syncableAccountsQuery(1)],
    ['accountSyncConnectedQuery', accountSyncConnectedQuery(1, 2)],
    ['autoSyncAccountsNeedingReconnectQuery', autoSyncAccountsNeedingReconnectQuery(1)],
  ]) {
    assert.doesNotMatch(q.text, /\$\{/, `${name} has an unexpanded template placeholder`);
    assert.match(q.text, /LEFT JOIN ctrader_identities ci/, `${name} must carry the shared joins`);
    assert.match(q.text, /ci\.revoked_at IS NULL/,
      `${name} must reject a revoked grant — that omission is the whole bug`);
  }
});

test('the identity join is LEFT, and the revoked filter is on the join', () => {
  // LEFT because a cTrader account has no mt5_credentials row at all — under an inner
  // join the query matched nothing for it, silently. Third time that has bitten.
  assert.match(SYNC_ELIGIBILITY_JOINS, /LEFT JOIN mt5_credentials c/);
  assert.match(SYNC_ELIGIBILITY_JOINS, /LEFT JOIN ctrader_identities ci/);
  assert.match(SYNC_ELIGIBILITY_JOINS, /ci\.revoked_at IS NULL/);
  // The MT5 master-password rule stays SCOPED to MT5: every TradeLocker credential is
  // legitimately read_only = FALSE, so unscoped this would queue no TradeLocker account
  // ever, with no error anywhere.
  assert.match(SYNC_CREDENTIAL_USABLE_SQL, /a\.platform <> 'mt5'/);
  // And "is there a way in" stays separate from "is the way in one we will use" — the
  // accounts list reports the first only, because a master password is a different fix.
  assert.doesNotMatch(SYNC_CONNECTED_SQL, /read_only/);
});

test('the per-account route requires a LIVE identity, not merely a present one', () => {
  const route = src('src/routes/sync.js');
  assert.match(route, /accountSyncConnected\(req\.user\.uid, acct\.id\)/);
  assert.match(route, /if \(!state\?\.connected\)/);
  assert.doesNotMatch(route, /acct\.ctrader_identity_id == null/,
    'the null check was the bug: it queued jobs the payload query could never serve');
  // The refusal names the fix rather than dead-ending.
  assert.match(route, /reconnect it to resume syncing/);
});

test('the workspace refusal distinguishes "none connected" from "reconnect me"', () => {
  const route = src('src/routes/sync.js');
  assert.match(route, /autoSyncAccountsNeedingReconnect\(req\.user\.uid\)/);
  assert.match(route, /needs reauthorizing/);
  // The old message was the entire response, and the owner read it on a workspace
  // holding two accounts the accounts page was calling "Synced".
  assert.match(route, /no accounts are connected for Auto Sync/,
    'the genuinely-empty case keeps its own sentence');
});

test('the reconnect query is the exact complement of the syncable one', () => {
  // Same population, negated predicate. If they were written independently an account
  // could fall into neither and be invisible to both the button and its explanation.
  const need = autoSyncAccountsNeedingReconnectQuery(9);
  const can = syncableAccountsQuery(9);
  for (const clause of [
    /a\.user_id = \$1/, /a\.is_active/, /a\.kind = 'synced'/, /a\.import_method = 'auto_sync'/,
  ]) {
    assert.match(need.text, clause);
    assert.match(can.text, clause);
  }
  assert.match(need.text, /AND NOT CASE a\.platform/, 'negated, not re-derived');
});

test('the accounts list can finally say a connection is dead', () => {
  const accounts = src('src/domain/accounts/accounts.js');
  assert.match(accounts, /AS sync_connected/);

  const page = readFileSync(
    path.join(repoRoot, 'frontend/src/features/settings/SettingsAccounts.jsx'), 'utf8');
  assert.match(page, /a\.sync_connected === false && a\.import_method === 'auto_sync'/);
  assert.match(page, /label: 'Reconnect', tone: 'loss'/);
  // Checked BEFORE `pending`: both can be true, and this is the actionable one — no
  // amount of waiting fixes a revoked grant.
  const reconnectAt = page.indexOf("label: 'Reconnect'");
  const pendingAt = page.indexOf("label: 'Waiting'");
  assert.ok(reconnectAt > 0 && pendingAt > 0);
  assert.ok(reconnectAt < pendingAt, 'Reconnect must outrank Waiting');
  // And "Sync now" is not offered on a connection that can only 409.
  assert.match(page, /disabled=\{syncing \|\| account\.sync_connected === false\}/);
});
