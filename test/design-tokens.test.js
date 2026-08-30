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
  fileURLToPath(new URL('../frontend/src/lib/theme.js', import.meta.url)),
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
  /* WHAT THIS USED TO PIN: that --profit and --loss pointed at the --green-500 /
   * --red-500 PRIMITIVES. Those primitives are gone (Rhea foundation, 2026-08-29):
   * the outcome roles hold their hues directly and the raw green/red/amber scales
   * they aliased were deleted, because a primitive with exactly one consumer is a
   * second name for the same fact.
   *
   * So this asserts the HUE rather than the indirection, which is what the test was
   * ever really for — green must be green and red must be red, however it is spelled.
   * That also survives the next palette move without needing a rewrite. */
  const hue = (name) => {
    const m = root.match(new RegExp(`(?<![\\w-])--${name}\\s*:\\s*(#[0-9a-f]{6})`, 'i'));
    assert.ok(m, `--${name} must resolve to a literal hue in the token layer`);
    const [, r, g, b] = m[1].match(/#(..)(..)(..)/).map((x, i) => (i ? parseInt(x, 16) : x));
    return { r, g, b, hex: m[1] };
  };
  const profit = hue('profit');
  assert.ok(profit.g > profit.r && profit.g > profit.b, `--profit (${profit.hex}) must be green-dominant`);
  const loss = hue('loss');
  assert.ok(loss.r > loss.g && loss.r > loss.b, `--loss (${loss.hex}) must be red-dominant`);
  assert.match(root, /--ai:\s*var\(--purple-500\)/);    // purple = AI/insight

  /* THE SECOND GREEN AND THE SECOND RED ARE LOAD-BEARING, so they are pinned too.
   * The structural hue is drawn on the page; the bright one is drawn ON A TINT, where
   * the structural one does not carry. Collapsing them to one token is the change that
   * would quietly make a losing day cell unreadable. */
  for (const n of ['profit-bright', 'loss-bright']) {
    assert.ok(root.includes(`--${n}:`), `--${n} must exist — see COLOUR-INVENTORY §6`);
  }
});

test('the risk ramp carries no green at any fill', () => {
  /* A drawdown meter measures CONSUMPTION, so its bar runs yellow -> orange -> red and
   * never reaches green: used drawdown is never good news, only less bad. A green
   * drawdown bar would be the app congratulating a trader for surviving, and it is
   * also what §4 forbids — green and red are trade outcomes, never status. */
  const ramp = root.match(/--risk-ramp:\s*([^;]+);/);
  assert.ok(ramp, '--risk-ramp must exist');
  for (const step of ['--risk-1', '--risk-2', '--risk-3']) {
    assert.ok(ramp[1].includes(step), `the ramp must be built from ${step}, not from literals`);
  }
  const stops = ['risk-1', 'risk-2', 'risk-3'].map((n) => {
    const m = root.match(new RegExp(`(?<![\\w-])--${n}\\s*:\\s*(#[0-9a-f]{6}|var\\(--loss\\))`, 'i'));
    return m[1] === 'var(--loss)' ? root.match(/--loss:\s*(#[0-9a-f]{6})/i)[1] : m[1];
  });
  for (const hex of stops) {
    const [, r, g, b] = hex.match(/#(..)(..)(..)/).map((x, i) => (i ? parseInt(x, 16) : x));
    assert.ok(!(g > r && g > b), `risk ramp stop ${hex} is green-dominant — the ramp must never read as "good"`);
  }
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

test('theme.js JS fallbacks match the CSS tokens (chart/canvas parity)', () => {
  // Canvas and chart code cannot read var(), so theme.js keeps literal fallbacks
  // for non-DOM contexts. Their whole job is to AGREE with tokens.css, so this
  // resolves both sides and compares them rather than pinning a hex that a preset
  // amendment is allowed to change.
  const resolve = (name) => {
    const raw = root.match(new RegExp(`(?<![\\w-])--${name}\\s*:\\s*([^;]+);`));
    if (!raw) return null;
    const v = raw[1].trim();
    const ref = v.match(/^var\(--([\w-]+)\)$/);
    return ref ? resolve(ref[1]) : v;
  };
  for (const name of ['accent', 'accent-on-surface', 'profit', 'loss']) {
    const css = resolve(name);
    const js = themeJs.match(new RegExp(`'--${name}':\\s*'([^']+)'`));
    assert.ok(css, `--${name} must exist in the token layer`);
    assert.ok(js, `theme.js must carry a fallback for --${name}`);
    assert.equal(js[1].toLowerCase(), css.toLowerCase(),
      `theme.js fallback for --${name} has drifted from tokens.css`);
  }
});
