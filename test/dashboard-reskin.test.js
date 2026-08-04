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
const dash = read('../frontend/src/Dashboard.jsx');
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
