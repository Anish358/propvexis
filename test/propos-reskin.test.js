import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Design A — Prop OS reskin: charts + meters token-driven.
//
// THE FILE LIST GREW WITH THE FINANCE REBUILD (2026-08-17). PropOS.jsx used to hold
// the module's only chart (the ROI progression line). It now holds none: the ROI
// chart moved to FinanceSummary.jsx and the Overview's accounts ring lives in
// PropCards.jsx. The assertion is about the module's charts, so it follows them
// rather than staying pointed at a file that no longer draws anything.
const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const CHART_FILES = ['PropCards', 'FinanceSummary'];

test('Prop OS charts pull theme from tokens (no hardcoded colors)', () => {
  for (const f of CHART_FILES) {
    const src = read(`../frontend/src/${f}.jsx`);
    for (const hex of ['#23232a', '#6f6f78', '#3a3a42', '#151518', '#2a2a30', '#6bd58a', '#e0918d', '#6ea8fe', '#9a9aa2']) {
      assert.ok(!src.includes(hex), `${f}: color ${hex} should be tokenized`);
    }
    // Resolved per render via chartPalette(), not captured into a module const —
    // a capture pins the palette to the theme active at first load.
    assert.match(src, /import \{ chartPalette \} from '\.\/theme\.js'/, `${f} must read the palette from theme.js`);
    assert.match(src, /chartPalette\(\)/, `${f} must resolve its palette at render time`);
    assert.ok(!/^const .*chartPalette\(/m.test(src), `${f}: no module-level palette capture`);
  }
});

test('PropOS.jsx no longer draws its own chart', () => {
  // Not a style rule — a duplication one. Two ROI charts in the module is how the
  // Overview's and Finance's idea of "net over time" would come to differ.
  const prop = read('../frontend/src/PropOS.jsx');
  assert.ok(!prop.includes('recharts'), 'PropOS.jsx should import no chart library');
  assert.ok(!prop.includes('chartPalette'), 'PropOS.jsx needs no palette without a chart');
});
