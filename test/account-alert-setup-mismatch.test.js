import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  ALERT, accountAlert, accountAlertFor, accountAlertState, describeAccount,
} from '../frontend/src/features/prop/accountAlert.js';
import { srcDir, resolveSrc } from './helpers/src-files.js';

const read = (name) => readFileSync(path.join(srcDir, resolveSrc(name)), 'utf8');

/* THE SEVENTH ALERT STATE: the account's configured starting balance and the broker's
 * reported balance describe different accounts.
 *
 * PROD, 2026-09-05. A cTrader demo holding EUR 999.87 was added from the
 * GoatFundedTrader 2-Step 25K template. The card drew a full-width ACCOUNT BREACH strip
 * over "$24,000.13 used of $2,500" on an account whose whole history is one trade for
 * -$0.13, because 25,000 - 999.87 = 24,000.13. The engine now refuses to mix the two
 * scales (src/domain/prop/prop.js, balanceReconciliation) and reports the disagreement;
 * this file is the banner's half of it.
 *
 * accountAlert.js is a .js module on purpose — node:test cannot import .jsx, so the
 * whole state machine is testable and only the glyph/control join lives in the .jsx. */

// The prod shape, as GET /api/prop now returns it.
const MISMATCHED = {
  account_id: 4000048583094,
  label: 'GoatFundedTrader 2-Step 25K',
  phase: 'p1',
  balanceCheck: {
    ok: false, expected: 24999.87, reported: 999.87, discrepancy: 24000,
    tolerance: 2500, startBalance: 25000,
  },
  // What the engine reports once it stops trusting the contradicting broker figure.
  maxDd: { limit: 2500, roomLeft: 2499.87, fracRemaining: 0.99995, breached: false },
  dailyDd: { limit: 1250, usedToday: 0.13, roomLeft: 1249.87, fracRemaining: 0.9999 },
  profitTarget: { target: 2000, current: -0.13, pctToTarget: 0, reached: false },
  tradingDays: { required: 0, completed: 1, remaining: 0, met: true },
  breach: { breached: false, reason: null },
};

test('a mismatched account raises SETUP_MISMATCH', () => {
  assert.equal(accountAlertState(describeAccount(MISMATCHED)), ALERT.SETUP_MISMATCH);
});

test('the sentence quotes BOTH numbers, because the app cannot know which is wrong', () => {
  const alert = accountAlertFor(MISMATCHED);
  assert.match(alert.message, /\$25,000/, 'what the trader configured');
  assert.match(alert.message, /\$999\.87/, 'what the broker reports');
  assert.match(alert.message, /GoatFundedTrader 2-Step 25K/, 'always names the account');
  // The meters below the strip keep drawing from the configured baseline, so the
  // sentence has to say which of the two they are using or the figures are ambiguous.
  assert.match(alert.message, /meters below use your setup/);
});

test('it is amber and NOT the breach red', () => {
  const alert = accountAlertFor(MISMATCHED);
  // BANNER_CRITICAL is `new Set(['breach'])`, and the card reddens its own edge from it.
  // A setup problem the trader fixes in one field must not spend the one colour that
  // means "this account is gone".
  assert.equal(alert.tone, 'caution');
  assert.equal(alert.label, 'Setup mismatch');
  assert.equal(alert.icon, 'warning');
  assert.equal(alert.action, 'balance');
});

test('SETUP_MISMATCH outranks the breach', () => {
  /* THE ORDERING IS THE POINT OF THE STATE. Every verdict below it is computed from
   * start_balance; when the broker says the account holds nothing like that, a breach
   * flag is not evidence of a breach. A baseline set too LOW manufactures one out of an
   * ordinary losing day — which is the direction that shouts at a trader who is fine. */
  const breachedToo = {
    ...MISMATCHED,
    maxDd: { limit: 2500, roomLeft: -100, fracRemaining: 0, breached: true },
    breach: { breached: true, reason: 'max_dd' },
  };
  assert.equal(accountAlertState(describeAccount(breachedToo)), ALERT.SETUP_MISMATCH);
});

test('a reconciled account is unaffected — every other state still behaves', () => {
  // The regression that would matter: gating a new clause at the TOP of the ladder is
  // one typo away from swallowing all six states beneath it.
  const ok = { ...MISMATCHED, balanceCheck: { ok: true, expected: 24999.87, reported: 24999.87, discrepancy: 0, tolerance: 2500, startBalance: 25000 } };
  assert.equal(accountAlertState(describeAccount(ok)), null, 'a healthy account shows no strip');

  const breached = {
    ...ok,
    maxDd: { limit: 2500, roomLeft: -100, fracRemaining: 0, breached: true },
    breach: { breached: true, reason: 'max_dd' },
  };
  assert.equal(accountAlertState(describeAccount(breached)), ALERT.BREACH);

  const nearTarget = { ...ok, profitTarget: { target: 2000, current: 1600, pctToTarget: 0.8, reached: false } };
  assert.equal(accountAlertState(describeAccount(nearTarget)), ALERT.TARGET_NEAR);
});

test('null balanceCheck means UNCHECKED, and never raises the alert', () => {
  // No broker balance (never synced, manual account) and no configured baseline both
  // arrive as null. Treating "we could not compare" as "they disagree" would put a
  // setup warning on every manual account in the product.
  const unchecked = { ...MISMATCHED, balanceCheck: null };
  assert.equal(accountAlertState(describeAccount(unchecked)), null);
  const absent = { ...MISMATCHED };
  delete absent.balanceCheck;
  assert.equal(describeAccount(absent).balanceCheck, null);
  assert.equal(accountAlertState(describeAccount(absent)), null);
});

test('an `ok: false` is required — a truthy object alone must not fire it', () => {
  // `if (acct.balanceCheck)` would fire on every reconciled account in the product.
  const ok = { ...MISMATCHED, balanceCheck: { ok: true, startBalance: 25000, reported: 25000 } };
  assert.equal(accountAlert(describeAccount(ok))?.state, undefined);
});

test('the banner resolves the balance intent into a control, and only when it can act', () => {
  // Nothing in CI renders a DOM, so this is asserted on the source: the .jsx is the one
  // place the intent becomes a button, and a third intent added to accountAlert.js with
  // no arm here would render a banner whose one useful action is silently missing.
  const jsx = read('AccountAlertBanner.jsx');
  assert.match(jsx, /alert\.action === 'balance' && onFixBalance/,
    'null onFixBalance means the card holds no account record to write to');
  assert.match(jsx, /Use broker balance/);

  const dash = read('Dashboard.jsx');
  assert.match(dash, /onFixBalance=\{acctRecord \? fixStartBalance : null\}/);
  // CONFIRMED, NEVER AUTOMATIC. Adopting the broker's figure rewrites the rules a trader
  // deliberately configured; on a real funded account that is their firm's band being
  // silently moved.
  assert.match(dash, /if \(!confirm\(/);
  assert.match(dash, /start_balance: check\.reported/);
});
