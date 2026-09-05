import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../src/platform/paths.js';
import {
  isOutcomeSuppressed, recursOnItsOwn, resolveChallengeOutcome,
} from '../src/domain/prop/challengeStatus.js';
import {
  closedGroupOf, defaultScopeFor, effectiveScope, isOpenAccount, SCOPE_ALL, SCOPE_OPEN,
} from '../frontend/src/lib/scope.js';
import { readCode } from './helpers/src-files.js';

/* CLOSING AN ACCOUNT, AND WHAT EACH PAGE COUNTS (owner spec 2026-09-05).
 *
 * Three tiers — open, closed, archived — and an acknowledgement that moves an account
 * between the first two. The rules that can be wrong in an expensive way are pure
 * functions here, because CI has no Postgres; the writes are asserted as SQL, which for
 * a scope predicate is the sharper test anyway.
 */

const read = (p) => readFileSync(path.join(repoRoot, p), 'utf8');
const migration = read('db/migrations/0033_account_lifecycle.sql');
const accountsDomain = read('src/domain/accounts/accounts.js');
const groups = read('src/domain/prop/challengeGroups.js');
const queue = read('src/domain/sync/queue.js');
const propRoute = read('src/routes/prop.js');
const challenges = read('src/domain/prop/challenges.js');
const app = read('frontend/src/App.jsx');

// ---------------------------------------------------------------------------
// Suppression — the rule that stops "Not passed yet" being a one-tick button
// ---------------------------------------------------------------------------

test('a rejected PASS stays quiet even as the days roll on', () => {
  /* THE BUG THIS EXISTS TO PREVENT. The obvious rule — "a new day is a new event, so
     report it again" — is right for a daily-loss breach and catastrophically wrong here:
     a profit target does not stop being reached, so a day-keyed pass would put the strip
     back every single morning. The trader would press "Not passed yet" for ever. */
  const suppressed = { status: 'passed', reason: null, day: null };
  assert.equal(isOutcomeSuppressed(suppressed, { status: 'passed', reason: null, day: null }), true);
  assert.equal(isOutcomeSuppressed(suppressed, { status: 'passed', reason: null, day: '2026-09-09' }), true);
});

test('a rejected MAX-DD breach is sticky for the same reason', () => {
  // Equity below the overall floor stays below it. There is no "tomorrow" in which that
  // becomes a fresh event.
  const suppressed = { status: 'breached', reason: 'max_dd', day: null };
  assert.equal(isOutcomeSuppressed(suppressed, { status: 'breached', reason: 'max_dd', day: null }), true);
  assert.equal(recursOnItsOwn({ status: 'breached', reason: 'max_dd' }), false);
  assert.equal(recursOnItsOwn({ status: 'passed', reason: null }), false);
});

test('a rejected DAILY breach silences that day only — the next one speaks', () => {
  /* The one outcome that genuinely recurs, and the reason suppression is keyed to an
     event rather than to a timer: a trader disputing Monday's daily-loss breach must
     still be told when they blow Tuesday's. */
  const suppressed = { status: 'breached', reason: 'daily_dd', day: '2026-09-06' };
  assert.equal(recursOnItsOwn({ status: 'breached', reason: 'daily_dd' }), true);
  assert.equal(isOutcomeSuppressed(suppressed, { status: 'breached', reason: 'daily_dd', day: '2026-09-06' }), true);
  assert.equal(isOutcomeSuppressed(suppressed, { status: 'breached', reason: 'daily_dd', day: '2026-09-07' }), false);
});

test('silencing one verdict never silences a different one', () => {
  // Rejecting a pass must not swallow the breach that follows it, and silencing one
  // breach reason must not silence the other — that would be an account quietly dying.
  const passRejected = { status: 'passed', reason: null, day: null };
  assert.equal(isOutcomeSuppressed(passRejected, { status: 'breached', reason: 'max_dd', day: null }), false);
  const dailyRejected = { status: 'breached', reason: 'daily_dd', day: '2026-09-06' };
  assert.equal(isOutcomeSuppressed(dailyRejected, { status: 'breached', reason: 'max_dd', day: null }), false);
  assert.equal(isOutcomeSuppressed(null, { status: 'passed', reason: null, day: null }), false);
});

test('the day is recorded only for the outcome that has one', () => {
  const state = (over) => ({
    maxDd: { fracRemaining: 1 },
    dailyDd: { fracRemaining: 1, day: '2026-09-06' },
    tradingDays: { met: true },
    profitTarget: { reached: true },
    breach: { breached: false, reason: null },
    ...over,
  });
  const challenge = { id: 1, mt5_account_id: 1, phase: 'p1', status: 'active' };
  assert.equal(resolveChallengeOutcome({ challenge, state: state() }).day, null, 'a pass has no day');
  assert.equal(
    resolveChallengeOutcome({ challenge, state: state({ breach: { breached: true, reason: 'max_dd' } }) }).day,
    null, 'a max-DD breach has no day',
  );
  assert.equal(
    resolveChallengeOutcome({ challenge, state: state({ breach: { breached: true, reason: 'daily_dd' } }) }).day,
    '2026-09-06',
  );
});

test('every reopen suppresses, and it is not a caller option', () => {
  // Reopening MEANS "the engine was wrong about this", from the strip and from Prop OS
  // alike. An unsuppressed reopen re-settles on the next ingest, seconds later.
  assert.match(propRoute, /reopenChallenge\(acct\.id, \{ suppress: true \}\)/);
  assert.match(groups, /suppressed_outcome = CASE WHEN \$2 THEN/);
  // Taken from the row being undone, so the pairing of status/reason/day cannot drift.
  assert.match(groups, /jsonb_build_object\('status', c\.status, 'reason', c\.breach_reason, 'day', c\.outcome_day\)/);
});

test('correcting the rules clears the suppression', () => {
  // Suppression buys time; corrected rules are the fix, and re-judging against them is
  // wanted immediately. Without this, a disputed account is muted for ever.
  assert.match(challenges, /sets\.push\('suppressed_outcome = NULL'\)/);
});

test('an unanswered outcome outranks every other banner action', () => {
  /* THE BUG THIS PINS, which only running the app caught. This branch was written third,
     behind one that matched `action === 'lock'` — and a breach alert carried exactly that
     intent, so on a breached account the lock branch won and these buttons never
     rendered. It looked like the feature had not shipped. It worked on a pass, so the
     half that was dead was the half about losing an account. */
  const banner = read('frontend/src/features/prop/AccountAlertBanner.jsx');
  const first = banner.indexOf('if (onCloseAccount && onReject)');
  assert.notEqual(first, -1, 'the strip branch is gone');
  for (const later of ["alert.action === 'balance'", "alert.action === 'challenge'"]) {
    assert.ok(banner.indexOf(later) > first, `${later} must not shadow the strip`);
  }
  // And the negative button is worded for what the trader means in each case.
  assert.match(banner, /data\?\.status === 'breached' \? 'Still trading' : 'Not passed yet'/);
});

test('"Lock account" is gone from the app, not just from the banner', () => {
  /* Owner 2026-09-06. It archived the account — `is_active = false` — which takes its
     entire history out of every analytic the trader has. Offering that at the moment an
     account dies is close to the worst thing the app could do, and the lifecycle work
     gave the moment a better answer: Close account, which keeps everything.
     Archiving is still reachable, one deliberate step away, in Settings › Accounts. */
  /* readCode, not read: these files now CARRY prose about the removal — the banner
     explains which branch was deleted and why — and a raw text search would match the
     explanation and report the code it describes as still present. */
  const banner = readCode('AccountAlertBanner.jsx');
  const alertMeta = readCode('accountAlert.js');
  const dash = readCode('Dashboard.jsx');
  assert.ok(!/onLock\b/.test(banner), 'the banner still takes an onLock');
  assert.ok(!/action === 'lock'/.test(banner), 'the lock branch survived');
  assert.ok(!/action: 'lock'/.test(alertMeta), 'an alert still declares the lock intent');
  assert.ok(!/lockAccount/.test(dash), 'the dashboard still holds the handler');
  // The archive itself is untouched — it just lives where it belongs.
  assert.match(readCode('SettingsAccounts.jsx'), /is_active/);
});

test('the strip appears exactly while an outcome is settled and unanswered', () => {
  // Read from the ACCOUNT (closed_at), which is what the scope resolves on — deriving it
  // from the challenge here would give the page a second opinion about what it counts.
  const dash = read('frontend/src/features/dashboard/Dashboard.jsx');
  assert.match(dash, /acctRecord\.closed_at == null && isSettled\(data\)/);
  assert.match(dash, /onCloseAccount=\{unanswered \? closeAccount : null\}/);
  assert.match(dash, /onReject=\{unanswered \? rejectOutcome : null\}/);
});

// ---------------------------------------------------------------------------
// The scope predicate
// ---------------------------------------------------------------------------

test('open is a NEGATIVE — an account is open unless something closed it', () => {
  /* THE DEPLOY-DAY BUG THIS SHAPE AVOIDS. Stated positively — "its challenge is active,
     or its outcome is unacknowledged" — an account with NO challenge row satisfies
     neither clause, and live-capital, manual and CSV accounts have no challenge row.
     Every one of them would have vanished from the dashboard. */
  assert.match(accountsDomain, /openOnly \? 'AND closed_at IS NULL' : ''/);
  assert.equal(isOpenAccount({ closed_at: null }), true);
  assert.equal(isOpenAccount({}), true, 'an account with no lifecycle at all is open');
  assert.equal(isOpenAccount({ closed_at: '2026-09-05T00:00:00Z' }), false);
});

test('an explicit list is honoured whatever tier it names', () => {
  // Rule 3.2: only the DEFAULTS differ per page. A trader who ticks a breached account
  // has said what they want, and a scope that dropped it would be overriding a choice.
  // The named-scope branch returns early; the list branch never consults closed_at.
  const resolve = accountsDomain.slice(accountsDomain.indexOf('export async function resolveScope'));
  assert.match(resolve, /if \(requested === 'open'\)/);
  const from = resolve.indexOf('const wanted');
  const listBranch = resolve.slice(from, resolve.indexOf('\n}', from));
  assert.ok(!/closed_at/.test(listBranch), 'a named login must not be filtered by tier');
});

test('a closed account leaves the sync rotation but not manual sync', () => {
  // The farm runs a serial slot per poll; a blown account left in the schedule spends
  // one every few hours for ever on a login that will never report another trade.
  const due = queue.slice(queue.indexOf('export function dueAccountsQuery'));
  assert.match(due, /AND a\.closed_at IS NULL/);
  const manual = queue.slice(queue.indexOf('export function enqueueQuery'), queue.indexOf('export function dueAccountsQuery'));
  assert.ok(!/closed_at/.test(manual), 'Sync now must still work on a closed account');
});

// ---------------------------------------------------------------------------
// Per-page defaults
// ---------------------------------------------------------------------------

test('the dashboard defaults to open; every other analytic defaults to all', () => {
  /* Stated as a RULE rather than a list of pages, so a surface built next year inherits
     the answer instead of guessing. Analytics counting closed accounts is not a
     convenience: a trader's real record includes the accounts they blew, and hiding them
     would flatter every user with a track record they did not earn. */
  assert.equal(defaultScopeFor('/'), SCOPE_OPEN);
  for (const p of ['/journal/analytics', '/journal/trades', '/reports', '/journal/calendar', '/prop/accounts']) {
    assert.equal(defaultScopeFor(p), SCOPE_ALL, `${p} must count closed accounts by default`);
  }
});

test('an explicit pick beats every page default', () => {
  assert.equal(effectiveScope(null, '/'), SCOPE_OPEN);
  assert.equal(effectiveScope('', '/journal/analytics'), SCOPE_ALL);
  assert.equal(effectiveScope('12345', '/'), '12345', 'the dashboard honours a named login');
  assert.equal(effectiveScope(SCOPE_ALL, '/'), SCOPE_ALL, 'including an explicit "all"');
});

test('landing on a page never records a choice', () => {
  /* Rule 3.3, and the failure it prevents: Analytics defaults to "All accounts, incl.
     closed". If merely opening that menu and clicking the already-highlighted row counted
     as a decision, a trader checking what was selected would have silently switched their
     DASHBOARD to include closed accounts, with nothing on screen connecting the two. */
  assert.match(app, /accountId == null && id === defaultScopeFor\(pathname\) \? null : id/);
});

test('the stored scope is migrated on BOTH sides, server and device', () => {
  /* 'all' used to be the default AND the only value anyone had. It now means "including
     closed" specifically, so every stored value would read as a deliberate choice and
     hand every existing user a dashboard full of blown accounts. */
  assert.match(migration, /UPDATE user_view_state\s+SET state = state - 'accountId'/);
  assert.match(app, /const ACCT_KEY = 'amey\.accountId\.v2'/);
});

// ---------------------------------------------------------------------------
// The migration itself
// ---------------------------------------------------------------------------

test('the backfill closes what already settled, or launch day floods everyone', () => {
  /* Without this block every account that passed or breached months ago is Open on the
     morning this ships — back in the dashboard's default scope, each one raising a strip.
     A trader with seven blown accounts opens the app to seven things to acknowledge. */
  assert.match(migration, /UPDATE challenges\s+SET acknowledged_at = COALESCE\(passed_at, breached_at, now\(\)\)/);
  assert.match(migration, /SET closed_at\s+= COALESCE\(l\.settled_at, now\(\)\)/);
  // Dated to when it happened, not to now(), so the 7-day window reads a true timeline.
  assert.ok(!/closed_at\s+= now\(\)\s*,\s*closed_reason = l\.status/.test(migration));
  // An account mid-challenge (p1 passed, p2 running) stays open — it is still traded.
  assert.match(migration, /AND NOT EXISTS \(\s*SELECT 1 FROM challenges o\s+WHERE o\.mt5_account_id = a\.id AND o\.status = 'active'\)/);
});

test('the acknowledgement is stored on the CHALLENGE, not the account', () => {
  /* An account collects many settled challenge rows — the unique index only guarantees
     one ACTIVE row. A flag on the account would already be set the second time round,
     silently pre-acknowledging the pass that actually counted and eating its strip. */
  assert.match(migration, /ALTER TABLE challenges ADD COLUMN IF NOT EXISTS acknowledged_at/);
  assert.match(groups, /WHERE mt5_account_id = \$1 AND status <> 'active' AND acknowledged_at IS NULL/);
  // And the account stamp is written in the same transaction, so the two cannot disagree.
  const ack = groups.slice(groups.indexOf('export async function acknowledgeOutcome'));
  assert.match(ack.slice(0, ack.indexOf('COMMIT')), /UPDATE mt5_accounts\s+SET closed_at = now\(\), closed_reason = \$2/);
});

test('reopening an account brings it back into scope', () => {
  // Otherwise "Not passed yet" puts the challenge back to running while leaving the
  // account invisible on the page the trader watches while running it.
  const reopen = groups.slice(groups.indexOf('export async function reopenChallenge'));
  assert.match(reopen, /UPDATE mt5_accounts SET closed_at = NULL, closed_reason = NULL WHERE id = \$1/);
});

test('a hand-retired account is retired, not passed or breached', () => {
  /* A funded account never auto-passes, so without a manual close its only exits are a
     breach or Archive — and Archive takes its whole history out of every analytic, which
     is the opposite of what anyone wants for an account that made them money. */
  assert.match(accountsDomain, /closed_reason = \$\$\{params\.length\}/);
  assert.match(accountsDomain, /params\.push\('retired'\)/);
  assert.equal(closedGroupOf({ closed_reason: 'retired' }), 'retired');
  assert.equal(closedGroupOf({ closed_reason: 'breached' }), 'breached');
  assert.equal(closedGroupOf({ closed_reason: 'passed' }), 'passed');
});

test('the auto-acknowledgement needs silence AND no trades, and it announces itself', () => {
  /* Elapsed time alone would close an account the trader is visibly still trading — a
     reinstated breach, a disputed pass they keep trading through. And a sweep that fired
     silently would be the same unexplained P&L change the strip exists to prevent, moved
     to day 8. */
  const sweep = groups.slice(groups.indexOf('export async function sweepAutoAcknowledged'));
  assert.match(sweep, /NOT EXISTS \(SELECT 1 FROM trades t/);
  assert.match(sweep, /t\.close_time > COALESCE\(c\.passed_at, c\.breached_at\)/);
  const alerts = read('src/domain/alerts/alerts.js');
  // Its OWN dedup key: phase_passed has already fired for this challenge, on the day it
  // settled, so reusing that key would dedup this message into silence.
  assert.match(alerts, /dedupKey: `\$\{accountId\}:auto_closed:\$\{challengeId\}`/);
});
