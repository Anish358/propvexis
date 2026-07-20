import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NAV } from '../frontend/src/nav.js';

// Phase 2 — Day View module is built and wired (no longer a `soon` stub).
const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const app = read('../frontend/src/App.jsx');
const dayView = read('../frontend/src/DayView.jsx');

test('the /journal/day nav item is no longer marked soon', () => {
  const journal = NAV.find((i) => i.base === '/journal');
  const item = journal.children.find((c) => c.to === '/journal/day');
  assert.ok(item);
  assert.notEqual(item.soon, true);
});

test('App renders DayView at /journal/day (not ComingSoon)', () => {
  assert.match(app, /import DayView from '\.\/DayView\.jsx'/);
  assert.match(app, /path="day" element=\{<DayView \/>\}/);
});

test('DayView composes the kit + shared day helpers', () => {
  assert.match(dayView, /from '\.\/ui\.jsx'/);
  assert.match(dayView, /dayKey|tradeOutcome/);
  assert.match(dayView, /<EmptyState/);
});
