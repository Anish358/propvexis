import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Design A — Reports reskin: its chart is token-driven.
const rep = readFileSync(fileURLToPath(new URL('../frontend/src/Reports.jsx', import.meta.url)), 'utf8');

test('Reports chart pulls theme from tokens (no hardcoded colors)', () => {
  for (const hex of ['#23232a', '#6f6f78', '#3a3a42', '#151518', '#2a2a30', '#6bd58a', '#e0918d', '#6ea8fe', '#9a9aa2']) {
    assert.ok(!rep.includes(hex), `Reports color ${hex} should be tokenized`);
  }
  assert.match(rep, /import \{ token \} from '\.\/theme\.js'/);
  assert.match(rep, /const rColor = \(r\) => \(r > 0 \? PROFIT/);
});
