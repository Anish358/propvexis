import { test } from 'node:test';
import assert from 'node:assert/strict';

import { appCss } from './helpers/app-css.js';
import { readSrc } from './helpers/src-files.js';

// The UI for server-side MT5 sync. Two classes of bug are worth pinning here:
// a password leaking back into the page, and a styling class that silently emits
// nothing (utilities only compile for components/{ui,primitives}, so a Tailwind
// class in a feature file produces no CSS, no error and no failing test).

const modal = readSrc('SyncModal.jsx');
const account = readSrc('Account.jsx');
const api = readSrc('lib/api.js');

test('the password is write-only in the UI as well as the API', () => {
  // The component may send a password and must never display one. There is no
  // endpoint that returns it, so any read of a stored password is a bug by
  // definition — this catches someone "helpfully" adding one later.
  assert.match(modal, /type="password"/);
  assert.match(modal, /autoComplete="new-password"/);
  assert.ok(!/cred(ential)?\.password/.test(modal), 'must never read a password back');
  assert.ok(!/value=\{cred/.test(modal), 'no stored credential field is bound to an input');
  // And it is dropped from component state the moment the save succeeds.
  assert.match(modal, /setPassword\(''\);/);
});

test('the investor-password requirement is stated, not assumed', () => {
  // Users will reach for the password they know. If the copy does not say
  // "investor", the trade_allowed check turns into a confusing rejection.
  assert.match(modal, /investor \(read-only\) password/i);
  assert.match(modal, /rejected and deleted/i);
});

test('a bound login cannot be repointed from the UI', () => {
  // Trades are filed under mt5_login, so changing it would hand another account's
  // history to this one. The backend refuses too; this stops the user trying.
  assert.match(modal, /disabled=\{account\.mt5_login != null\}/);
});

test('live sync is offered only where it can work', () => {
  // A manual bucket has no MT5 login to log into, and an archived account should
  // not be woken up by the scheduler.
  assert.match(account, /a\.kind !== 'manual' && !archived/);
  assert.match(account, /<SyncModal\b/);
});

test('the sync API surfaces the server message, not a status code', () => {
  // "enter the investor password" and "sync not configured" are the entire value
  // of these responses; `sync 409` tells the user nothing actionable.
  const call = api.slice(api.indexOf('async function syncCall'), api.indexOf('export const fetchAccountSync'));
  assert.match(call, /body\.error \|\|/);
});

test('every class the sync UI uses actually exists in the stylesheet', () => {
  // THE FAILURE THIS PREVENTS: utilities compile for components/{ui,primitives}
  // only. A Tailwind class written in a feature file emits no CSS — no build
  // error, no failing test, just an unstyled panel. Asserting the class is
  // present in app.css catches both that and an ordinary typo.
  const classes = new Set();
  for (const m of [...modal.matchAll(/className="([^"{]+)"/g)]) {
    for (const c of m[1].split(/\s+/).filter(Boolean)) classes.add(c);
  }
  assert.ok(classes.size > 5, 'expected to find classes to check');
  const missing = [...classes].filter((c) => !appCss.includes(`.${c}`));
  assert.deepEqual(missing, [], `classes with no CSS: ${missing.join(', ')}`);
});

test('the new account-card action row is styled', () => {
  assert.match(appCss, /\.acct-card-actions/);
  assert.match(appCss, /\.sync-modal/);
  // Flex-wrap rather than shrink: at the 900px drawer breakpoint the card is too
  // narrow for two buttons side by side and the labels would truncate.
  assert.match(appCss, /\.acct-card-actions \{[^}]*flex-wrap: wrap/);
});

test('the sync UI hardcodes no colours', () => {
  // Same rule the design-system tests apply to generated components: colour comes
  // from tokens so both themes stay correct.
  const block = appCss.slice(appCss.indexOf('.sync-modal'), appCss.indexOf('/* ---- Alerts page'));
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(block), 'raw hex in the sync CSS');
  assert.ok(!/rgba?\(/.test(block), 'raw rgb/rgba in the sync CSS');
  assert.match(block, /var\(--/);
});
