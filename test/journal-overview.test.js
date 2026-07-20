import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NAV } from '../frontend/src/nav.js';

// Phase 2 — Journal Overview module is built and wired (no longer a `soon` stub).
const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const app = read('../frontend/src/App.jsx');
const overview = read('../frontend/src/JournalOverview.jsx');

test('the /journal Overview nav item is no longer marked soon', () => {
  const journal = NAV.find((i) => i.base === '/journal');
  const item = journal.children.find((c) => c.to === '/journal');
  assert.ok(item, '/journal overview item exists');
  assert.notEqual(item.soon, true, 'Overview should be a real page now');
});

test('App renders JournalOverview at the /journal index (not ComingSoon)', () => {
  assert.match(app, /import JournalOverview from '\.\/JournalOverview\.jsx'/);
  assert.match(app, /<Route index element=\{<JournalOverview \/>\}/);
});

test('JournalOverview composes the shared component kit and real metrics', () => {
  assert.match(overview, /from '\.\/ui\.jsx'/);
  assert.match(overview, /computeMetrics/);
  assert.match(overview, /<EmptyState/); // handles the no-trades case
});
