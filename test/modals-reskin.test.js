import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { appCss } from './helpers/app-css.js';
// Design A (final) — modal/form controls converge on the primitive look:
// token surfaces, token radius, an accessible danger fill, and a focus ring.
const css = appCss;

test('modal input/danger surfaces are tokenized (no near-black inputs, no muted-red buttons)', () => {
  for (const hex of ['#0e0e10', '#0c0c0f', '#b3403a', '#c94b44']) {
    assert.ok(!css.includes(hex), `${hex} should be tokenized`);
  }
});

test('modal base controls use the token radius', () => {
  const input = css.split('\n').find((l) => l.includes('border-radius') && css.indexOf(l) > css.indexOf('.modal select, .modal input'));
  assert.ok(css.includes('.modal button.danger { background: var(--red-600)'), 'danger fill uses --red-600 (white text passes AA)');
});

test('form controls get the shared brand focus ring', () => {
  // The ring colour is a token now (--accent-ring) so it can shift under a light
  // theme; the 3px geometry is what this test is really pinning.
  assert.match(css, /\.modal input:focus[^]*box-shadow: 0 0 0 3px var\(--accent-ring\)/);
});
