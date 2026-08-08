import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { appCss } from './helpers/app-css.js';
// Design A — Dashboard reskin: cards are token-driven, not hardcoded. Dashboard
// V1 replaced the old widget-toggle dashboard (which lived in dashboardWidgets.jsx
// with its own chart theming) with a fixed layout that has no charts, so this now
// checks the new Dashboard component + its CSS instead.
const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const dash = read('../frontend/src/features/dashboard/Dashboard.jsx');
const css = appCss;

test('Dashboard has no hardcoded gray colors (uses tokens/design-system classes)', () => {
  for (const gray of ['#1d1d23', '#5a5a63', '#33333b', '#2a2a32', '#151518']) {
    assert.ok(!dash.includes(gray), `Dashboard should not hardcode ${gray} — use a design token or existing class`);
  }
});

// Pulls a rule's full body (selector may open a multi-line block), so the
// radius check isn't fooled by which physical line the property sits on.
function ruleBody(source, selector) {
  const start = source.indexOf(`${selector} {`);
  if (start === -1) return null;
  const end = source.indexOf('}', start);
  return source.slice(start, end + 1);
}

test('new Dashboard V1 CSS uses the token radius scale (not raw 8px)', () => {
  for (const sel of ['.dash-banner']) {
    const body = ruleBody(css, sel);
    assert.ok(body, `rule ${sel} exists`);
    assert.ok(body.includes('var(--r-lg)'), `${sel} should use var(--r-lg)`);
    assert.ok(!/border-radius:\s*8px/.test(body), `${sel} should not hardcode 8px radius`);
  }
});

test('card family uses the token radius scale (not raw 8px)', () => {
  for (const sel of ['.panel {', '.kpi {', '.bd {']) {
    const line = css.split('\n').find((l) => l.trimStart().startsWith(sel));
    assert.ok(line, `rule ${sel} exists`);
    assert.ok(line.includes('var(--r-2xl)'), `${sel} should use var(--r-2xl)`);
    assert.ok(!/border-radius:\s*8px/.test(line), `${sel} should not hardcode 8px radius`);
  }
});

// ── The KPI card treatment, post-Card-migration ──────────────────────────────
//
// The five KPI cards render on the migrated Card primitive, so `.u-card` is no
// longer in their class list. That is what broke them once already: the hover
// `transition` sat on a `.u-card.dash-stat.dash-stat--*` compound selector, which
// silently stopped matching while the one-class `:hover` rules kept matching, so the
// wash and the lift fired with no easing at all. Nothing about that failure is
// visible in a diff — the rule is still there, still valid CSS, just dead — so it
// gets a test.

test('the KPI card treatment does not depend on .u-card', () => {
  // Any `.u-card`-qualified selector aimed at a dashboard element is dead code now,
  // and dead code that LOOKS live is how the easing was lost.
  const zombies = css.split('\n').filter((l) => /^\s*\.u-card\.(dash-|panel)/.test(l));
  assert.deepEqual(zombies, [], 'a .u-card compound selector still targets a migrated dashboard element');
});

test('the KPI cards have NO hover state — they are not clickable', () => {
  // DESIGN-LANGUAGE §14, "Only interactive elements respond to hover" (owner,
  // 2026-08-05). These five cards used to wash and lift on hover while doing nothing
  // on click, which is a promise the interface cannot keep and costs hover its meaning
  // on the controls that DO something.
  //
  // This test replaced two earlier ones that asserted the hover EASED correctly and
  // preserved the card's ring. Those were right for the treatment that existed — the
  // wash and lift had genuinely broken in the Card migration and were repaired first.
  // Repairing them is what made the treatment legible enough to judge, and judging it
  // is what retired it. The assertion inverts because the rule changed, not because
  // the old one was wrong.
  assert.ok(!css.includes('.dash-stat:hover'), 'a hover state is back on a non-clickable card');
  const body = ruleBody(css, '.dash-stat');
  assert.ok(body, '.dash-stat rule exists');
  assert.ok(!body.includes('transition'), 'nothing left to transition once the hover is gone');
  // Handing box-shadow back to the Card is the point: the preset draws the ring and
  // elevation, so this rule no longer has to restate them to survive a hover override.
  assert.ok(!body.includes('box-shadow'), '.dash-stat must not own box-shadow — the Card draws its box');
});

test('KPI cards share one box, with no per-card compensation offsets', () => {
  // Net P&L's padding IS the locked master dimension; the siblings used to fake
  // alignment against it with margin-top: 9px on the label and +6px on the value.
  // Same padding for all five means no offset can be needed — and if one reappears,
  // the row has silently gone back to being hand-tuned.
  const body = ruleBody(css, '.dash-stat');
  assert.match(body, /padding:\s*24px 20px 16px/, 'all five KPI cards carry the master card padding');
  assert.ok(!/\.dash-stat--typo-match\s+\.jo-kpi-(label|value)\s*\{[^}]*margin-top/.test(css),
    'a sibling-card compensation offset is back; the cards should share one box instead');
});
