import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { appCss } from './helpers/app-css.js';
// Guards the Phase 1 component layer: the canonical `u-*` primitives exist in
// both the CSS and the React kit, and the adoption retrofits stay wired.
const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const css = appCss;
const ui = read('../frontend/src/ui.jsx');
const comingSoon = read('../frontend/src/components/ComingSoon.jsx');

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
  // Superseded in scope by test/theme-tokens.test.js, which now enforces this
  // across the WHOLE stylesheet rather than just this block (and so no longer
  // needs the old three-literal amber exception — those are tokens now). Kept as
  // a targeted regression guard on the primitive layer specifically.
  const start = css.indexOf('Phase 1 — canonical component layer');
  const end = css.indexOf('Shell v2', start);
  const block = css.slice(start, end === -1 ? undefined : end);
  const hexes = block.match(/#[0-9a-fA-F]{6}/g) || [];
  assert.deepEqual(hexes, [], `component layer should use tokens, found raw hex: ${hexes.join(', ')}`);
});

test('ui.jsx exports the primitive kit', () => {
  for (const name of ['Button', 'Card', 'Badge', 'Tabs', 'Field', 'Input', 'Skeleton', 'LoadingBlock', 'EmptyState']) {
    assert.match(ui, new RegExp(`export (function|const) ${name}\\b`), `ui.jsx missing export ${name}`);
  }
});

test('ComingSoon adopts the EmptyState primitive', () => {
  assert.match(comingSoon, /from '@\/components\/primitives'/);
  assert.match(comingSoon, /<EmptyState/);
  assert.doesNotMatch(comingSoon, /className="panel coming-soon"/); // old bespoke markup gone
});

// ── The primitives layer is the only component entry point ───────────────────
//
// `ui.jsx` above is kept as the migration's kill switch (UI-MIGRATION-PLAN §22), not
// as a live import target. The whole value of the seam is that there is exactly ONE
// place application code imports components from — the moment a page imports from
// both, "swap an implementation without touching callers" stops being true.

test('no application file imports ui.jsx any more', () => {
  const src = fileURLToPath(new URL('../frontend/src/', import.meta.url));
  const offenders = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.jsx?$/.test(e.name) || e.name === 'ui.jsx') continue;
      // A comment may mention ui.jsx (several explain why they left it); an
      // `import ... from` is the thing that must not exist.
      if (/^\s*import[^;]*from\s*'[^']*\bui\.jsx'/m.test(readFileSync(p, 'utf8'))) {
        offenders.push(relative(src, p));
      }
    }
  };
  walk(src);
  assert.deepEqual(offenders, [], 'these files must import from @/components/primitives instead');
});

test('the primitives barrel exports every primitive a page needs', () => {
  const barrel = read('../frontend/src/components/primitives/index.js');
  // Badge, EmptyState, LoadingBlock and Tabs are NOT library-backed — no generated
  // component can express them yet. They are exported anyway, because the seam is
  // about where callers import from, not about what is behind it.
  for (const name of ['Badge', 'Button', 'Card', 'EmptyState', 'LoadingBlock', 'Skeleton', 'Tabs']) {
    assert.match(barrel, new RegExp(`export \\{[^}]*\\b${name}\\b[^}]*\\} from`), `barrel missing ${name}`);
  }
});

test('the Card imposes no vertical rhythm unless asked', () => {
  // The library card spaces its children with gap-(--card-spacing). Every card in
  // this app has children that already carry their own margins, so inheriting that
  // gap ADDS to them rather than replacing them: 16px became 32px on the Dashboard's
  // activity and chart cards, 8px became 24px inside each Journal Overview KPI. The
  // default must stay "do not fight the stylesheet" until pages are converted.
  const card = read('../frontend/src/components/primitives/card.jsx');
  assert.match(card, /gap\s*=\s*false/, 'the gap must default to off');
  assert.match(card, /!gap\s*&&\s*'gap-0'/, "gap-0 is what cancels the library's gap");
});

test('cards whose children carry their own margins do not also ask for a gap', () => {
  // The inverse guard: these child margins are the app's spacing model. If one of
  // them is ever removed in favour of the card's gap, that is a real change and this
  // test should be updated deliberately — not discovered as doubled spacing on screen.
  for (const rule of [
    /\.dash-activity-body \{[^}]*margin-top:\s*16px/,
    /\.dash-equity-head \{[^}]*margin-bottom:\s*16px/,
    /\.jo-kpi-value \{[^}]*margin-top:\s*8px/,
    /\.jo-section-title \{[^}]*margin:\s*0 0 12px/,
  ]) {
    assert.match(css, rule, 'a card child lost the margin the card is relying on it to have');
  }
});

test('the Card clips its overflow only when flush', () => {
  // The generated card sets overflow-hidden unconditionally, to clip a child <img>
  // to the radius. We have no images in cards; we do have Explain tooltips that
  // overhang the top edge, and clipping swallowed them outright — feature behaviour,
  // so a defect rather than a visual diff. Clipping belongs to `flush`, which is
  // where `.u-card--flush` always had it.
  const card = read('../frontend/src/components/primitives/card.jsx');
  assert.match(card, /flush\s*\?\s*'[^']*overflow-hidden[^']*'\s*:\s*'[^']*overflow-visible/,
    'flush clips; every other card must be free to show an overhanging popover');
});
