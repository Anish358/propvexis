import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defaultDashLayout } from '../frontend/src/features/dashboard/dashLayout.js';

import { appCss } from './helpers/app-css.js';
// Guards the dashboard action strip (Sync Trades / Customize layout). Its whole
// point is to be chrome-free and to sit in a fixed slot in the page order, so
// those are the two things worth pinning down.
const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const css = appCss;
const dash = read('../frontend/src/features/dashboard/Dashboard.jsx');

test('out of the box, the strip sits between Today\'s Brief and the KPI row', () => {
  // Page order is now data, not markup order (see dash-layout.test.js), so this
  // asserts the default arrangement rather than the source order: brief first,
  // KPI row next, and the strip rendered in between the two.
  const sections = defaultDashLayout().sections;
  assert.equal(sections.indexOf('brief'), 0, 'Today\'s Brief should lead the default layout');
  assert.equal(sections.indexOf('kpis'), 1, 'the KPI row should follow it');
  assert.match(dash, /stripAfter === id && <DashActions/, 'strip must render after its anchor row');
  assert.match(dash, /stripAfter = isDashVisible\(layout, 'brief'\) \? 'brief'/, 'the anchor should be the brief');
});

test('action strip uses the shared Button primitive, not bespoke buttons', () => {
  const block = dash.slice(dash.indexOf('function DashActions'), dash.indexOf('// ---- Section 2'));
  assert.match(block, /<Button\b[\s\S]*variant="secondary"/, 'buttons should be secondary Button primitives');
  assert.doesNotMatch(block, /<button\b/, 'no raw <button> in the strip');
  assert.match(block, /dash-actions-status/, 'missing the last-synced status line');
});

test('Today\'s Brief banner has a titled head with a settings control', () => {
  const block = dash.slice(dash.indexOf('function DailyBanner'), dash.indexOf('// Dashboard-level actions'));
  assert.match(block, /<div className="dash-banner-head">/);
  assert.match(block, /<h3>Today's Brief<\/h3>/);
  // Icon-only, so it needs an accessible name. (The class is now a template
  // literal — it also carries an is-open state for the settings popover.)
  assert.match(block, /className=\{`dash-banner-settings [\s\S]*aria-label="Brief settings"/);
  // Head must precede the events/alerts content it titles.
  assert.ok(block.indexOf('dash-banner-head') < block.indexOf('dash-banner-news'));
  // Title uses the app's section-title tokens, not a bespoke size/weight.
  assert.match(css, /\.dash-banner-head h3 \{[^}]*font-size: var\(--fs-section-title\)/);
});

test('action strip carries no container chrome', () => {
  // Everything from `.dash-actions {` up to the next top-level rule — a
  // background, border, divider or shadow here would turn the strip into the
  // card/toolbar it is explicitly not meant to be.
  const start = css.indexOf('.dash-actions {');
  assert.ok(start > -1, 'missing .dash-actions rule');
  const rule = css.slice(start, css.indexOf('}', start));
  for (const prop of ['background', 'border', 'box-shadow']) {
    assert.doesNotMatch(rule, new RegExp(`\\b${prop}`), `.dash-actions should not set ${prop}`);
  }
  // Status text is subtle-but-readable, not --muted (which reads as disabled).
  assert.match(css, /\.dash-actions-status \{[^}]*color: var\(--text-2\)/);
});
