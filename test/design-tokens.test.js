import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { appCss } from './helpers/app-css.js';
// Guards the Phase 0 design-foundation invariant: the BRAND is blue, and
// green/red are reserved for trade OUTCOMES. If a future edit re-conflates
// them (e.g. makes --accent green again, or colors a .win with --accent),
// these tests fail before it ships.
const css = appCss;
const themeJs = readFileSync(
  fileURLToPath(new URL('../frontend/src/theme.js', import.meta.url)),
  'utf8',
);

// Pull the :root block so we assert against declarations, not usages.
const root = css.slice(css.indexOf(':root'), css.indexOf('}', css.indexOf(':root')) + 1);

test('brand accent is the blue family, not green', () => {
  // The invariant is the FAMILY, not a literal hex: foundation values come from
  // the approved preset and can be re-pointed by a preset amendment. What may
  // never change is that the brand is a blue primitive and never green.
  assert.match(root, /--accent:\s*var\(--blue-\d00\)/);
  const blue = root.match(/--blue-500:\s*(#[0-9a-f]{6})/i);
  assert.ok(blue, '--blue-500 must exist as a primitive');
  const [, r, g, b] = blue[1].match(/#(..)(..)(..)/).map((x, i) => (i ? parseInt(x, 16) : x));
  assert.ok(b > r && b > g, `--blue-500 (${blue[1]}) must actually be blue-dominant`);
  // The old green brand color must be gone from the token layer.
  assert.doesNotMatch(root, /--accent:\s*#39d98a/i);
});

test('outcome + accent tokens exist and are the right hues', () => {
  assert.match(root, /--profit:\s*var\(--green-500\)/); // green = profit
  assert.match(root, /--loss:\s*var\(--red-500\)/);     // red = loss
  assert.match(root, /--ai:\s*var\(--purple-500\)/);    // purple = AI/insight
});

test('foundation token scales are defined', () => {
  for (const t of ['--r-md', '--s-4', '--sh-2', '--font-sans', '--font-mono', '--ease', '--surface-2', '--text-3']) {
    assert.ok(root.includes(t + ':'), `missing token ${t}`);
  }
});

test('no .win/profit rule is colored with the blue brand accent', () => {
  // Every line that styles a winning/profit element must NOT reference --accent.
  const offenders = css
    .split('\n')
    .filter((l) => /\.win\b|\bprofit\b/i.test(l) && /var\(--accent\b/.test(l));
  assert.deepEqual(offenders, [], `profit rules must use --profit, not --accent:\n${offenders.join('\n')}`);
});

test('theme.js JS fallback for --accent matches the brand blue (chart/canvas parity)', () => {
  assert.match(themeJs, /'--accent':\s*'#3b82f6'/);
  assert.match(themeJs, /'--profit':\s*'#22c55e'/);
});
