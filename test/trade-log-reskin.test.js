import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Design A — Trade Log reskin: grid/table + toolbar are token-driven.
const css = readFileSync(fileURLToPath(new URL('../frontend/src/styles.css', import.meta.url)), 'utf8');

test('trade-log grid no longer uses hardcoded grays/greens/roses', () => {
  for (const hex of ['#1b1b1f', '#1a1a1e', '#8fe0a6', '#e0918d', '#6bd58a', '#b9b9c0', '#6ea8fe']) {
    assert.ok(!css.includes(hex), `grid color ${hex} should be tokenized`);
  }
});

test('the shared hover-border gray is fully tokenized app-wide', () => {
  assert.ok(!css.includes('#3a3a42'), '#3a3a42 hover border should be var(--line-strong)');
});

test('trade outcome cells map to the outcome tokens', () => {
  const win = css.split('\n').find((l) => l.startsWith('.cell-win {'));
  const loss = css.split('\n').find((l) => l.startsWith('.cell-loss {'));
  assert.ok(win.includes('var(--profit)'), '.cell-win uses --profit');
  assert.ok(loss.includes('var(--loss)'), '.cell-loss uses --loss');
});
