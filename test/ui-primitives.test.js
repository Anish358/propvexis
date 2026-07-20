import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Guards the Phase 1 component layer: the canonical `u-*` primitives exist in
// both the CSS and the React kit, and the adoption retrofits stay wired.
const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const css = read('../frontend/src/styles.css');
const ui = read('../frontend/src/ui.jsx');
const comingSoon = read('../frontend/src/ComingSoon.jsx');

test('CSS defines the canonical component classes', () => {
  for (const c of [
    '.u-btn', '.u-btn--primary', '.u-btn--danger',
    '.u-card', '.u-badge', '.u-badge--profit',
    '.u-tabs', '.u-tab', '.u-input', '.u-field',
    '.u-skeleton', '.u-empty',
  ]) {
    assert.ok(css.includes(c + ' ') || css.includes(c + ',') || css.includes(c + '{') || css.includes(c + ':'),
      `missing CSS class ${c}`);
  }
});

test('primitive components are built on tokens (no raw hex leaking into the layer)', () => {
  // Extract JUST the Phase 1 component block (bounded to the next major banner)
  // and assert it references tokens, not hardcoded surface/brand hex (warn-amber
  // literals are the only allowed exception). Later shell/gradient blocks are
  // out of scope — they intentionally carry sampled gradient stops.
  const start = css.indexOf('Phase 1 — canonical component layer');
  const end = css.indexOf('Shell v2', start);
  const block = css.slice(start, end === -1 ? undefined : end);
  const hexes = (block.match(/#[0-9a-fA-F]{6}/g) || []).filter((h) => !['#2a2412', '#4a3f18', '#3a2f66'].includes(h.toLowerCase()));
  assert.deepEqual(hexes, [], `component layer should use tokens, found raw hex: ${hexes.join(', ')}`);
});

test('ui.jsx exports the primitive kit', () => {
  for (const name of ['Button', 'Card', 'Badge', 'Tabs', 'Field', 'Input', 'Skeleton', 'LoadingBlock', 'EmptyState']) {
    assert.match(ui, new RegExp(`export (function|const) ${name}\\b`), `ui.jsx missing export ${name}`);
  }
});

test('ComingSoon adopts the EmptyState primitive', () => {
  assert.match(comingSoon, /from '\.\/ui\.jsx'/);
  assert.match(comingSoon, /<EmptyState/);
  assert.doesNotMatch(comingSoon, /className="panel coming-soon"/); // old bespoke markup gone
});
