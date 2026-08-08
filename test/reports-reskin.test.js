import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Design A — Reports reskin: its chart is token-driven.
const rep = readFileSync(fileURLToPath(new URL('../frontend/src/features/reports/Reports.jsx', import.meta.url)), 'utf8');

test('Reports chart pulls theme from tokens (no hardcoded colors)', () => {
  for (const hex of ['#23232a', '#6f6f78', '#3a3a42', '#151518', '#2a2a30', '#6bd58a', '#e0918d', '#6ea8fe', '#9a9aa2']) {
    assert.ok(!rep.includes(hex), `Reports color ${hex} should be tokenized`);
  }
  // Resolved per render via chartPalette(), not captured into a module const —
  // a capture pins the palette to the theme active at first load.
  assert.match(rep, /import \{ chartPalette \} from '[^']*theme\.js'/);
  assert.match(rep, /const rColor = \(r\) => \(r > 0 \? chartPalette\(\)\.profit/);
  assert.ok(!/^const .*token\(/m.test(rep), 'no module-level token capture');
});
