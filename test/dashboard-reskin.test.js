import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Design A — Dashboard reskin: charts + cards are token-driven, not hardcoded.
const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const dw = read('../frontend/src/dashboardWidgets.jsx');
const css = read('../frontend/src/styles.css');

test('dashboard charts pull theme from tokens (no hardcoded grays)', () => {
  for (const gray of ['#1d1d23', '#5a5a63', '#33333b', '#2a2a32', '#151518']) {
    assert.ok(!dw.includes(gray), `chart color ${gray} should be tokenized`);
  }
  for (const c of ['const GRID = token', 'const AXIS = token', 'const WARN = token']) {
    assert.ok(dw.includes(c), `missing chart theme constant: ${c}`);
  }
});

test('card family uses the token radius scale (not raw 8px)', () => {
  for (const sel of ['.panel {', '.kpi {', '.bd {']) {
    const line = css.split('\n').find((l) => l.trimStart().startsWith(sel));
    assert.ok(line, `rule ${sel} exists`);
    assert.ok(line.includes('var(--r-lg)'), `${sel} should use var(--r-lg)`);
    assert.ok(!/border-radius:\s*8px/.test(line), `${sel} should not hardcode 8px radius`);
  }
});
