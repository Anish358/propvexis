import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// One brand mark everywhere. The geometry below is shared with the marketing
// site (propvexis-web: public/favicon.svg + src/components/Logo.astro) — if the
// mark is ever redrawn, all three places have to move together, and these tests
// are the reminder.
const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const logo = read('../frontend/src/Logo.jsx');
const favicon = read('../frontend/public/favicon.svg');
const sidebar = read('../frontend/src/Sidebar.jsx');
const css = read('../frontend/src/styles.css');

const CHEVRON = 'M9 21.5 15 10l6 11.5';

test('the component and the favicon draw the same mark', () => {
  for (const [name, src] of [['Logo.jsx', logo], ['favicon.svg', favicon]]) {
    assert.ok(src.includes(CHEVRON), `${name} must draw the shared chevron path`);
    assert.ok(src.includes('viewBox="0 0 32 32"'), `${name} must use the 32px viewBox`);
    assert.match(src, /rx="8"/, `${name} tile radius must match`);
  }
});

test('the old pre-rebrand favicon is gone', () => {
  // The retired mark was a green/purple gradient trend line from before blue
  // became the brand (see the theme-palette rebrand).
  for (const hex of ['#39d98a', '#7c5cff', '#5cffb0']) {
    assert.ok(!favicon.includes(hex), `${hex} is the old brand palette`);
  }
  assert.ok(favicon.includes('#3b82f6'), 'favicon accent is the brand blue');
  assert.ok(favicon.includes('#22c55e'), 'the data node stays profit-green');
});

test('in-app the mark is token-driven, so it follows the theme', () => {
  assert.match(logo, /stroke="var\(--accent\)"/);
  assert.match(logo, /fill="var\(--profit\)"/);
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(logo), 'no raw hex in Logo.jsx');
  assert.match(css, /\.pv-logo \{ display: inline-flex/);
});

test('the sidebar brand uses the shared Logo and routes in-app', () => {
  assert.match(sidebar, /import Logo from '\.\/Logo\.jsx'/);
  assert.match(sidebar, /<Link to="\/" className="sb-brand"><Logo size=\{24\} \/>\{BRAND\}<\/Link>/);
  // The CSS-gradient square it replaced must not linger.
  assert.ok(!css.includes('.sb-brand::before'), 'the old gradient tile is removed');
});
