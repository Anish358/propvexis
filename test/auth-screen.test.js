import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The auth screen (login + signup) is a split layout: copy + Google CTA on the
// left, an abstract chart panel on the right. These pin the parts that are easy
// to break later — the shared-component contract, the decorative panel staying
// out of the a11y tree and off small screens, and the colour-role invariant
// inside the artwork (blue = product, green/red = trade outcomes only).
const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const login = read('../frontend/src/Login.jsx');
const art = read('../frontend/src/AuthArt.jsx');
const css = read('../frontend/src/styles.css');

test('one component serves both routes, differing only in copy', () => {
  assert.match(login, /mode = 'login'/);
  assert.match(login, /isSignup = mode === 'signup'/);
  assert.match(login, /Create new account/);
  assert.match(login, /Log in to your journal/);
  // Each mode links to the other one in-app (no full page reload).
  assert.match(login, /to=\{isSignup \? '\/login' : '\/signup'\}/);
  assert.match(login, /<Link to="\/login">Log in<\/Link>/);
  assert.match(login, /<Link to="\/signup">Create an account<\/Link>/);
});

test('sign-in stays Google-only and says so (no fake password field)', () => {
  assert.match(login, /uses Google sign-in only/);
  for (const bad of ['type="password"', 'type="email"']) {
    assert.ok(!login.includes(bad), `auth screen must not fake a ${bad} input`);
  }
  // Loading feedback while the GSI script is still in flight.
  assert.match(login, /!ready && !error &&/);
  assert.match(login, /role="alert"/);           // errors are announced
});

test('the artwork is decoration: hidden from AT and dropped on small screens', () => {
  assert.match(login, /className="auth-art" aria-hidden="true"/);
  assert.match(login, /className="auth-curve"[\s\S]*?aria-hidden="true"/);
  const mq = css.slice(css.indexOf('@media (max-width: 900px)'));
  assert.match(mq, /\.auth-art, \.auth-curve \{ display: none; \}/);
});

test('artwork keeps the colour roles: blue curve, green/red candles', () => {
  assert.match(art, /stroke="var\(--accent\)"/);            // equity curve = brand
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
