import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { srcDir, resolveSrc } from './helpers/src-files.js';
import { commitStep, stepsFor, isStepComplete, STEP_IDS } from '../frontend/src/features/accounts/newAccountFlow.js';

const app = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const front = (name) => readFileSync(path.join(srcDir, resolveSrc(name)), 'utf8');

const step = front('CtraderAccountsStep.jsx');
const routes = app('../src/routes/ctrader.js');

/* THE ACCOUNT PICKER ASKED THE SAME QUESTION TWICE (owner decision 2026-09-06).
 *
 * cTrader's own consent screen is where a trader chooses which accounts an app may see,
 * and ProtoOAGetAccountListByAccessTokenReq returns ONLY the accounts that grant covers.
 * A second list of checkboxes could not narrow anything the trader had not already
 * narrowed -- it could only make them do it again.
 *
 * THE STEP SURVIVES THE PICKER. Nothing in the web tier can enumerate a cTID's accounts;
 * it is the worker's job, and this page is the only thing that WAITS for it. Delete the
 * step and a trader whose worker is a few seconds behind reaches the receipt with zero
 * accounts created and nothing on screen to say so.
 */

test('the step is still in the flow, and is still where cTrader commits', () => {
  assert.ok(STEP_IDS.includes('ctrader-accounts'));
  const draft = { platform: 'ctrader', import_method: 'auto_sync', capital_kind: 'live' };
  assert.ok(stepsFor(draft).includes('ctrader-accounts'));
  assert.equal(commitStep(draft), 'ctrader-accounts',
    'authorizing tells us the grant exists; only the worker can say what it covers');
  // And it is still only complete once an account exists, which is what stops the
  // wizard walking past a discovery that produced nothing.
  assert.equal(isStepComplete({ ...draft, account: null }, 'ctrader-accounts'), false);
  assert.equal(isStepComplete({ ...draft, account: { id: 1 } }, 'ctrader-accounts'), true);
});

test('the step no longer asks — no checkboxes, no submit', () => {
  assert.doesNotMatch(step, /ConsentField/, 'the checkbox list is gone');
  assert.doesNotMatch(step, /<form/, 'and so is the form it needed');
  assert.doesNotMatch(step, /Choose your accounts/);
  assert.match(step, /Adding your accounts/);
});

test('it provisions on its own, once discovery lands', () => {
  assert.match(step, /if \(!res\.pending\) \{ await provision\(rows\); return; \}/);
  // The commit is guarded by a ref, not by the shell's `committing` state: the poll
  // resolves inside an effect, StrictMode runs effects twice, and state has not
  // re-rendered at the moment a second call would be made.
  assert.match(step, /if \(submitted\.current\) return;/);
  assert.match(step, /submitted\.current = true;/);
});

test('already-connected accounts are never submitted', () => {
  // mt5_accounts.ctid_trader_account_id is uniquely indexed. Sending a claimed account
  // would turn "you already have all of these" into a 409, which is the wrong word for
  // a trader whose accounts are all present and correct.
  assert.match(step, /rows\.filter\(\(a\) => a\.claimed !== true\)/);
  assert.match(step, /if \(!fresh\.length\) return;/);
});

test('every dead end has a way out', () => {
  /* Three states here can never commit -- the grant owns none, they are all connected
   * already, and the worker never answered -- and the wizard's guard will not advance
   * past an uncommitted step. Without an exit the trader is simply stuck, which is what
   * the picker did. */
  assert.match(step, /const exit = /);
  assert.match(step, /to="\/settings\/accounts"/);
  assert.match(step, /const allClaimed = /);
  assert.match(step, /already in PropVexis/);
  assert.match(step, /has no trading accounts/);
  assert.match(step, /Still waiting on cTrader/);
});

test('the retry actually restarts the poll', () => {
  // Clearing the error alone re-renders a page whose poll loop has already returned —
  // a button that visibly does nothing. The attempt counter is in the effect's deps,
  // which is the only reason it is state rather than a ref.
  assert.match(step, /setAttempt\(\(n\) => n \+ 1\)/);
  assert.match(step, /\}, \[identityId, attempt\]\);/);
});

test('pending is still distinguished from empty', () => {
  // Now that the step provisions automatically, mistaking "the worker has not looked
  // yet" for "this grant owns nothing" would silently create no accounts at all.
  assert.match(step, /setPending\(Boolean\(res\.pending\)\)/);
  assert.match(step, /!pending && rows\.length === 0/);
});

// --------------------------------------------------------------------------
// The server half.
// --------------------------------------------------------------------------

test('a claimed account is SKIPPED, not fatal mid-loop', () => {
  /* THE BUG THIS CLOSES. The provision loop answered 409 the moment it hit an
   * already-connected account -- with the accounts before it ALREADY CREATED. Three
   * accounts where the second is claimed left the first in the database while the
   * request reported failure. Harmless-ish when a human ticked boxes over a list that
   * greyed claimed rows out; not harmless when nobody is looking at the list. */
  assert.match(routes, /const claimed = wanted\.filter\(\(c\) => byCtid\.get\(c\)\?\.claimed === true\)/);
  assert.match(routes, /const fresh = wanted\.filter\(\(c\) => !claimed\.includes\(c\)\)/);
  assert.match(routes, /for \(const ctid of fresh\)/);
  // The race the filter cannot close — another tab connecting between the read and the
  // write — skips too, instead of abandoning the rest of the batch.
  assert.match(routes, /if \(err\.conflict === PROVISION_CONFLICT\.LOGIN\) \{[\s\S]{0,220}skipped\.push\(ctid\);[\s\S]{0,40}continue;/);
});

test('creating nothing is a 409, so the wizard never reads an empty list', () => {
  assert.match(routes, /if \(!created\.length\) \{[\s\S]{0,200}reply\.code\(409\)/);
  const shell = front('NewAccountFlow.jsx');
  assert.match(shell, /\[account\] = accounts \?\? \[\];/);
  assert.match(shell, /if \(!account\) throw new Error/,
    'reading .id off undefined would replace the wizard with the error boundary');
});

test('the plan gate counts what will actually be created', () => {
  // An account that already exists is already counted against the cap. Charging for it
  // again would refuse a batch that creates nothing new.
  assert.match(routes, /syncedAccountCount\(req\.user\.uid\)\) \+ fresh\.length - 1/);
});

test('several accounts from one grant get distinguishable labels', () => {
  /* ONE GRANT, SEVERAL ACCOUNTS, ONE FORM. The wizard collects a single label and
   * stamps the whole batch with it, so a cTID covering three accounts produced three
   * rows all called "GoatFundedTrader 2-Step 25K" — indistinguishable in the account
   * switcher, which is the one place they must be told apart. Invisible while the
   * trader ticked one box; the default now that all of them are provisioned. */
  assert.match(routes, /fresh\.length > 1 && \(found\.trader_login \?\? null\) != null/);
  assert.match(routes, /\$\{found\.trader_login\}/);
  // The trader-facing number, NEVER mt5_login — that column carries the banded key
  // (4e12 + ctid), which printed "MT5 4000048583094" in prod once already.
  assert.doesNotMatch(routes, /suffix[\s\S]{0,80}mt5_login/);
});
