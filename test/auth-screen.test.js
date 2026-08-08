import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { appCss } from './helpers/app-css.js';
// The auth screen (login + signup) is a split layout: copy + Google CTA on the
// left, an abstract chart panel on the right. These pin the parts that are easy
// to break later — the shared-component contract, the decorative panel staying
// out of the a11y tree and off small screens, and the colour-role invariant
// inside the artwork (blue = product, green/red = trade outcomes only).
const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const login = read('../frontend/src/features/auth/Login.jsx');
const art = read('../frontend/src/features/auth/AuthArt.jsx');
const css = appCss;

test('one component serves both routes, differing only in copy', () => {
  assert.match(login, /mode = 'login'/);
  assert.match(login, /isSignup = mode === 'signup'/);
  assert.match(login, /Create new account/);
  assert.match(login, /Log in to your journal/);
  // Each mode links to the other one in-app (no full page reload). The header
  // is wordmark-only — the Home/Join nav was removed, so this is the only route
  // switch on the page.
  assert.match(login, /<Link to="\/login">Log in<\/Link>/);
  assert.match(login, /<Link to="\/signup">Create an account<\/Link>/);
  assert.ok(!login.includes('auth-top-nav'), 'the auth header carries no nav links');
});

test('brand mark is the shared Logo, and the wordmark link stays on-origin locally', () => {
  assert.match(login, /import Logo from '[^']*Logo\.jsx'/);
  assert.match(login, /<Logo size=\{22\} \/>/);
  assert.match(login, /const SITE = isLocal \? '\/' : 'https:\/\/propvexis\.com'/);
  for (const host of ['localhost', '127.0.0.1']) {
    assert.ok(login.includes(`'${host}'`), `${host} must count as local`);
  }
});

test('email + password form: real fields, labelled, with the right autofill hints', () => {
  assert.match(login, /type="email" name="email" autoComplete="email" required/);
  assert.match(login, /autoComplete=\{isSignup \? 'new-password' : 'current-password'\}/);
  assert.match(login, /type=\{showPw \? 'text' : 'password'\}/);      // reveal toggle
  assert.match(login, /aria-label=\{showPw \? 'Hide password' : 'Show password'\}/);
  // Every input carries a visible <span> label inside its <label>, not a
  // placeholder standing in for one.
  assert.equal((login.match(/className="auth-field"/g) || []).length, 3);
  assert.match(login, /signupWithPassword\({ name: form\.name\.trim\(\), email, password: form\.password }\)/);
  assert.match(login, /loginWithPassword\({ email, password: form\.password }\)/);
});

test('submit gives feedback and cannot be double-fired', () => {
  assert.match(login, /setBusy\(true\)/);
  assert.match(login, /disabled=\{busy\}/);
  assert.match(login, /busy \? 'One moment…'/);
  assert.match(login, /role="alert"/);                                // errors are announced
  assert.match(login, /form\.password\.length < PASSWORD_MIN/);       // client-side floor
  assert.match(login, /PASSWORD_MIN = 8/);                            // mirrors the server
});

test('the Google button is our dark face, not the white GSI widget', () => {
  // The widget itself is stacked over our button at zero opacity — that's what
  // keeps the click on Google's own surface without its white logo tile.
  assert.match(css, /\.auth-gsi \{ position: absolute; inset: 0; opacity: 0; \}/);
  assert.match(css, /\.auth-google-face \{[\s\S]*?background: var\(--surface-2\)/);
  assert.match(css, /\.auth-google-face \{[\s\S]*?pointer-events: none/);
  // Keyboard users still get a ring, since focus lands inside the widget.
  assert.match(css, /\.auth-google:focus-within \.auth-google-face \{/);
  assert.match(login, /data-ready=\{ready \? 'yes' : 'no'\}/);
  // Google is optional now: no client id must not break the email form.
  assert.match(login, /if \(!CLIENT_ID\) return;/);
  assert.match(login, /\{CLIENT_ID && \(/);
});

test('the artwork is decoration: hidden from AT and dropped on small screens', () => {
  assert.match(login, /className="auth-art" aria-hidden="true"/);
  assert.match(login, /className="auth-curve"[\s\S]*?aria-hidden="true"/);
  const mq = css.slice(css.indexOf('@media (max-width: 900px)'));
  assert.match(mq, /\.auth-art, \.auth-curve \{ display: none; \}/);
});

test('artwork keeps the colour roles: blue curve, green/red candles', () => {
  // The curve must be BRAND, never an outcome. Which brand token carries it is a
  // foundation detail: --accent is the preset's fill value and measures ~2:1 on
  // --panel, so a 2.5px stroke uses --accent-on-surface instead. Either is brand.
  assert.match(art, /stroke="var\(--accent(-on-surface)?\)"/);
  assert.match(art, /up \? 'var\(--profit\)' : 'var\(--loss\)'/);  // candles = outcomes
  assert.ok(!/var\(--profit\)/.test(art.slice(art.indexOf('CURVE ='), art.indexOf('const BODY_W'))),
    'the equity curve must not be coloured with an outcome token');
});

test('auth layer is fully tokenized', () => {
  const block = css.slice(css.indexOf('.auth-screen {'), css.indexOf('@media (max-width: 900px)'));
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(block), 'no raw hex in the auth layer');
  assert.match(block, /\.auth-panel \{[^}]*max-width/);
});

test('.login-error survives — the modals still use it', () => {
  assert.match(css, /\.login-error \{ color: var\(--loss\)/);
});
