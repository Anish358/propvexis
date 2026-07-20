import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Design A — Analytics reskin: its charts are token-driven, not hardcoded.
const an = readFileSync(fileURLToPath(new URL('../frontend/src/Analytics.jsx', import.meta.url)), 'utf8');

test('Analytics charts pull theme from tokens (no hardcoded colors)', () => {
  for (const hex of ['#23232a', '#6f6f78', '#3a3a42', '#151518', '#2a2a30', '#6bd58a', '#e0918d', '#7a4a47', '#3a7a52', '#6ea8fe']) {
    assert.ok(!an.includes(hex), `Analytics color ${hex} should be tokenized`);
  }
  assert.match(an, /import \{ token \} from '\.\/theme\.js'/);
  assert.match(an, /const rColor = \(r\) => \(r > 0 \? PROFIT/);
});
