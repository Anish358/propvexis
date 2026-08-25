// test/provision-client.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSrc } from './helpers/src-files.js';

// frontend/src/lib/api.js reads import.meta.env.VITE_BACKEND_URL at MODULE SCOPE.
// In node that is `undefined.VITE_BACKEND_URL` — a TypeError on import — so this
// file asserts over the source as text, as every other frontend test in this repo
// does for the same reason.
//
// Each assertion is scoped to the function's OWN body: from its declaration to
// the first line at column 0 that follows it. A fixed byte window would spill
// into whichever neighbour happens to sit next in the file, which for a NEGATIVE
// assertion means testing that neighbour rather than this function.
const api = readSrc('lib/api.js');

/** One exported function's body, bounded by the next top-level declaration. */
function body(name) {
  const decl = new RegExp(`^export (?:async function|const) ${name}\\b`, 'm').exec(api);
  assert.ok(decl, `api.js has no exported ${name}`);
  const from = decl.index;
  const rest = api.slice(from + decl[0].length);
  // The next top-level construct: an export, a bare declaration, a column-0
  // comment banner, or a column-0 JSDoc opener. Whichever comes first ends this
  // body. The `/**` alternative is load-bearing and was missing at first: without
  // it a documented neighbour's whole doc comment bleeds into this slice, and the
  // negative assertion below would then be testing that neighbour's text.
  const end = /^(?:export |async function |function |const |\/\/ ----|\/\*\*)/m.exec(rest);
  return rest.slice(0, end ? end.index : rest.length);
}

test('provisionAccount posts the payload to the provision endpoint', () => {
  const fn = body('provisionAccount');
  assert.match(fn, /'\/api\/accounts\/provision'/);
  assert.match(fn, /method:\s*'POST'/);
  assert.match(fn, /JSON\.stringify\(payload\)/);
});

test('provisionAccount goes through apiFetch, so a 401 still logs the user out', () => {
  // A bare fetch() here would leave an expired session stuck on a wizard step
  // that fails forever with no explanation.
  assert.match(body('provisionAccount'), /apiFetch\(/);
  assert.equal(/\bawait fetch\(/.test(body('provisionAccount')), false,
    'must not bypass apiFetch — a 401 would not reach the unauthorized handler');
});

test('provisionAccount surfaces the server message, not a status code', () => {
  // Every failure here is actionable: "That MT5 login is already registered",
  // "Your plan allows up to 3 synced accounts", "Auto Sync is not configured on
  // this server yet". A generic "provision 409" tells the user nothing.
  const fn = body('provisionAccount');
  assert.match(fn, /\berror\b/, 'the server error field must be read');
  assert.match(fn, /res\.ok/);
});

test('provisionAccount carries the status and the conflict onto the error', () => {
  // Spec §6.3: the connect step must keep the typed values, name the collision
  // and link to the account when it is the caller's own. It cannot do any of that
  // from a message string.
  const fn = body('provisionAccount');
  assert.match(fn, /\.status\s*=/, 'the HTTP status must be attached to the thrown error');
  assert.match(fn, /\.conflict\s*=/, 'the typed conflict must be attached to the thrown error');
});

test('provisionAccount returns the account, not the envelope', () => {
  // The route replies { account }. A caller handed the envelope would read
  // `account.id` as undefined and provision a challenge against nothing.
  assert.match(body('provisionAccount'), /\.account\b/);
});

test('checkLoginAvailable asks the pre-check endpoint with both query fields', () => {
  const fn = body('checkLoginAvailable');
  assert.match(fn, /\/api\/accounts\/login-available/);
  // The fields are asserted as OBJECT KEYS, not as `login=`. The query is built
  // with URLSearchParams, which emits `login=…` only at runtime — a source-text
  // test cannot see that, and hand-rolling the encoding so a literal `=` appeared
  // would be reinventing a standard API for a test's benefit, with user input
  // going through hand-written escaping.
  assert.match(fn, /URLSearchParams\(/, 'build the query, do not concatenate it');
  assert.match(fn, /\blogin:/, 'the login rides in the query');
  // `platform` is deliberately UNREAD by the endpoint — mt5_login is globally
  // unique, so a per-platform lookup would answer a question the schema does not
  // ask — but it is part of the query contract, so the client still sends it.
  assert.match(fn, /\bplatform:/);
});

test('checkLoginAvailable never throws — it is a typing-time hint', () => {
  // It fires while the user types. A rejected promise on every keystroke while
  // offline would either spam an error banner or need a try/catch at each call
  // site; the unique index at commit is the real guard, so an unknown answer is
  // reported as "we do not know" instead.
  //
  // Asserting that the word `catch` appears is not enough: `catch (e) { throw e }`
  // contains it and rethrows, which is the exact regression this test exists to
  // stop. So the catch must be shown to RETURN the unknown-answer shape, and to
  // contain no throw at all.
  const fn = body('checkLoginAvailable');
  assert.match(fn, /catch[\s\S]*?return\s*\{[^}]*available:\s*null/,
    'the catch must resolve to an unknown answer');
  assert.equal(/catch[\s\S]*\bthrow\b/.test(fn), false, 'and must not rethrow');
});

test('the two new calls are the only account endpoints Phase B adds', () => {
  // Guard against a subagent inventing /api/accounts/validate or similar: the
  // backend is Phase A and closed. Any new path here means the plan was exceeded.
  const paths = [...api.matchAll(/'(\/api\/accounts[^']*)'/g)].map((m) => m[1]);
  const unique = [...new Set(paths)].sort();
  assert.deepEqual(unique, [
    '/api/accounts',
    '/api/accounts/login-available',
    '/api/accounts/provision',
  ], 'an unexpected /api/accounts path appeared — the Phase A backend is closed');
});
