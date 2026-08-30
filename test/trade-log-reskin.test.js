import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { appCss, legacyCss } from './helpers/app-css.js';
// Design A — Trade Log reskin: grid/table + toolbar are token-driven.
const css = appCss;

/* THESE TWO SCAN `legacyCss`, NOT `appCss` (narrowed 2026-08-29, Rhea foundation).
 *
 * What they protect is unchanged: no COMPONENT RULE may carry a raw literal instead
 * of a token. But `appCss` is tokens.css + legacy/app.css, and the token layer's whole
 * job is to be the one place literals ARE written — so the moment Rhea gave
 * `--surface-hover` the value #1a1a1e and `--line-selected` the value #3a3a42, both
 * tests failed on the very file that fixes the thing they exist to catch.
 *
 * Reading legacy CSS alone says the real rule: a literal is legal in tokens.css and
 * nowhere else. `design-tokens.test.js` ("no raw colour literal outside the token
 * layer") is the other half and covers the component library. */
test('trade-log grid no longer uses hardcoded grays/greens/roses', () => {
  for (const hex of ['#1b1b1f', '#1a1a1e', '#8fe0a6', '#e0918d', '#6bd58a', '#b9b9c0', '#6ea8fe']) {
    assert.ok(!legacyCss.includes(hex), `grid color ${hex} should be tokenized`);
  }
});

test('the shared hover-border gray is fully tokenized app-wide', () => {
  assert.ok(!legacyCss.includes('#3a3a42'), '#3a3a42 hover border should be var(--line-selected)');
});

test('trade outcome cells map to the outcome tokens', () => {
  const win = css.split('\n').find((l) => l.startsWith('.cell-win {'));
  const loss = css.split('\n').find((l) => l.startsWith('.cell-loss {'));
  assert.ok(win.includes('var(--profit)'), '.cell-win uses --profit');
  assert.ok(loss.includes('var(--loss)'), '.cell-loss uses --loss');
});
