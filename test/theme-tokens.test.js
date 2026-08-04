import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { appCss } from './helpers/app-css.js';
// Guards the token layer, which is the prerequisite for a light theme: if every
// colour lives in :root, a light theme is one `:root[data-theme="light"]` block.
// A raw literal in a component rule is a colour that CAN'T be themed, so it would
// stay dark on a light page — these tests exist to stop that creeping back.

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const css = appCss;
const lines = css.split('\n');

// The three regions where a literal is legitimate, and why:
//   :root            — the token definitions themselves
//   @media print     — print is always on white paper; nothing to theme
//   category palette — one hue per data category, each used once (see the marker
//                      comment in styles.css for the full reasoning)
function classifyLines() {
  let inRoot = false; let inPrint = false; let inCategory = false;
  return lines.map((l) => {
    if (l.startsWith(':root')) inRoot = true;  // covers :root and :root[data-theme=...]
    if (l.includes('@media print')) inPrint = true;
    if (l.includes('data-category palette (START)')) inCategory = true;
    const region = inRoot ? 'root' : inPrint ? 'print' : inCategory ? 'category' : 'component';
    if (inRoot && l.startsWith('}')) inRoot = false;
    if (inPrint && l.trim() === '}') inPrint = false;
    if (inCategory && l.includes('data-category palette (END)')) inCategory = false;
    return { text: l, region };
  });
}

const isComment = (l) => l.trim().startsWith('/*') || l.trim().startsWith('*');

test('no raw colour literal outside the token layer', () => {
  // Matches rgb/rgba AS WELL AS hex. The first version of this test only looked
  // for #hex, so it passed while 21 rgba() values — every modal scrim, every drop
  // shadow, and the top bar's own background — sat un-themed in component rules.
  // The light theme shipped with a black top bar because of it.
  const LITERAL = /#[0-9a-fA-F]{3,6}\b|rgba?\(\s*[\d.]+[^)]*\)/g;
  const offenders = [];
  classifyLines().forEach(({ text, region }, i) => {
    if (region !== 'component' || isComment(text)) return;
    for (const c of text.match(LITERAL) || []) {
      offenders.push(`${i + 1}: ${c} — ${text.trim().slice(0, 70)}`);
    }
  });
  assert.deepEqual(offenders, [], `hardcoded colours can't be themed:\n${offenders.join('\n')}`);
});

test('scrims, shadow colours and rings are themed in both directions', () => {
  // These are the rgba half of the layer and they invert differently from each
  // other: a scrim still has to darken a light page, while a shadow on white needs
  // far less alpha. Both sides must declare all of them.
  const needed = ['--topbar-bg', '--scrim-1', '--scrim-2', '--scrim-3', '--scrim-4',
    '--shadow-40', '--shadow-45', '--shadow-50', '--shadow-60', '--shadow-70',
    '--accent-ring', '--skeleton-sheen'];
  const inBlock = (block, t) => new RegExp(`${t}\\s*:`).test(block);
  const root = css.slice(css.indexOf(':root {'), css.indexOf('\n}', css.indexOf(':root {')));
  const at = css.indexOf(':root[data-theme="light"] {');
  const lightB = at < 0 ? '' : css.slice(at, css.indexOf('\n}', at));
  for (const t of needed) {
    assert.ok(inBlock(root, t), `${t} missing from :root`);
    assert.ok(inBlock(lightB, t), `${t} missing from the light theme`);
  }
});

test('the three literal-bearing regions are all still explicitly marked', () => {
  // If a marker is renamed, classifyLines silently reclassifies that whole region
  // as `component` — the test above would then fail loudly rather than pass
  // vacuously, but assert the markers directly so the failure names the cause.
  assert.ok(css.includes(':root {'));
  assert.ok(css.includes('@media print'));
  assert.ok(css.includes('data-category palette (START)'));
  assert.ok(css.includes('data-category palette (END)'));
  const regions = new Set(classifyLines().map((l) => l.region));
  for (const r of ['root', 'print', 'category', 'component']) {
    assert.ok(regions.has(r), `region ${r} not found — a marker comment probably moved`);
  }
});

test('no comment closes itself early', () => {
  // A `*` immediately before a `/` inside a comment (e.g. writing a selector glob
  // like `.pair-*/.session-*`) terminates it there. The rest of the comment then
  // parses as CSS and the declarations after it are silently dropped — the build
  // only warns. Hit once while writing the scales header.
  const offenders = [];
  lines.forEach((l, i) => {
    const body = l.replace(/\/\*/g, '').replace(/\*\/\s*$/, '');
    if (/\*\//.test(body)) offenders.push(`${i + 1}: ${l.trim().slice(0, 80)}`);
  });
  assert.deepEqual(offenders, [], `comment terminated mid-line:\n${offenders.join('\n')}`);
});

test('every themed scale is declared, ordered darkest to lightest', () => {
  // The scales are luminance-ordered so a light theme can be authored by walking
  // each one; an out-of-order entry means the light values would zig-zag.
  const root = css.slice(css.indexOf(':root {'), css.indexOf('\n}', css.indexOf(':root {')));
  const lum = (hex) => {
    const h = hex.length === 4 ? hex.slice(1).split('').map((c) => c + c).join('') : hex.slice(1);
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
  };
  const families = ['neutral', 'tint-profit', 'tint-loss', 'tint-warn', 'tint-payout', 'tint-ai'];
  for (const fam of families) {
    const found = [...root.matchAll(new RegExp(`--${fam}-(\\d+):\\s*(#[0-9a-fA-F]{3,6});`, 'g'))]
      .map((m) => ({ n: Number(m[1]), hex: m[2] }))
      .sort((a, b) => a.n - b.n);
    assert.ok(found.length >= 2, `${fam} scale missing or too short`);
    // Contiguous from 1 — a gap means a token was deleted without renumbering.
    assert.deepEqual(found.map((f) => f.n), found.map((_, i) => i + 1), `${fam} numbering has a gap`);
    for (let i = 1; i < found.length; i += 1) {
      assert.ok(
        lum(found[i].hex) >= lum(found[i - 1].hex),
        `${fam}-${found[i].n} (${found[i].hex}) is darker than ${fam}-${found[i - 1].n} (${found[i - 1].hex})`,
      );
    }
  }
});

test('white-on-fill uses --on-accent, not a literal or --text', () => {
  // --text inverts under a light theme; --on-accent doesn't. Text sitting on a
  // filled accent/danger button has to stay white either way.
  for (const sel of ['.prop-controls .btn-primary', '.notif-badge', '.switch-knob']) {
    const at = css.indexOf(sel);
    assert.ok(at > -1, `${sel} not found`);
    const rule = css.slice(at, css.indexOf('}', at));
    assert.ok(rule.includes('var(--on-accent)'), `${sel} should use --on-accent`);
  }
});

test('the JS-side chart colours carry no literals of their own', () => {
  // Canvas/SVG props can't consume var(), so this code resolves tokens at runtime
  // — but it must resolve TOKENS, never hold its own colours. (That the read
  // happens during render rather than at import is covered separately below; a
  // module-level const was the original bug.)
  const widgets = read('../frontend/src/DashWidgets.jsx');
  assert.ok(!/'#[0-9a-fA-F]{3,6}'/.test(widgets), 'no colour literals in DashWidgets');
  // theme.js's fallbacks are the one place JS may hold literals: they cover
  // non-DOM contexts (tests) where getComputedStyle isn't available.
  const theme = read('../frontend/src/theme.js');
  assert.match(theme, /'--neutral-7': '#23232a'/);
});

// ---- light theme ------------------------------------------------------------

const lightBlock = (() => {
  const at = css.indexOf(':root[data-theme="light"] {');
  return at < 0 ? '' : css.slice(at, css.indexOf('\n}', at));
})();
const rootBlock = css.slice(css.indexOf(':root {'), css.indexOf('\n}', css.indexOf(':root {')));
const declared = (block) => Object.fromEntries(
  [...block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
);
const darkTokens = declared(rootBlock);
const lightTokens = declared(lightBlock);

test('a light theme exists and is a pure token override', () => {
  assert.ok(lightBlock, ':root[data-theme="light"] block missing');
  // Nothing but token declarations — a selector in here would mean component CSS
  // is becoming theme-aware, which is what the token layer exists to prevent.
  const body = lightBlock.slice(lightBlock.indexOf('{') + 1).replace(/\/\*[\s\S]*?\*\//g, '');
  const nonDecl = body.split('\n').map((l) => l.trim())
    .filter((l) => l && !/^--[a-z0-9-]+\s*:/.test(l) && !/^color-scheme:/.test(l));
  assert.deepEqual(nonDecl, [], 'light block should only re-declare tokens');
});

test('every themed scale token gets a light value', () => {
  // A scale token with no light override keeps its dark value — i.e. stays dark
  // on a light page. This is the failure mode most likely to slip through when a
  // new token is added later.
  const missing = Object.keys(darkTokens)
    .filter((t) => /^--(neutral|tint-|surface-tint)/.test(t))
    .filter((t) => !(t in lightTokens));
  assert.deepEqual(missing, [], `no light value for: ${missing.join(', ')}`);
});

test('the core surfaces and text tokens are overridden too', () => {
  // Without these the page itself never turns light, however good the scales are.
  for (const t of ['--bg', '--panel', '--surface', '--surface-2', '--text', '--line',
    '--line-strong', '--surface-hover', '--muted', '--sidebar-bg', '--sh-1']) {
    assert.ok(t in lightTokens, `--${t.slice(2)} needs a light value`);
  }
  // Text on a filled accent button is white in BOTH themes, so it must not flip.
  assert.ok(!('--on-accent' in lightTokens), '--on-accent must stay white in light mode');
});

test('every light foreground clears 4.5:1 on its own background', () => {
  // The reason the light values are contrast-solved rather than hand-picked: at a
  // fixed lightness amber and cyan are far brighter than red or blue, so one
  // lightness range can't be accessible across hues. This recomputes the
  // guarantee from the shipped values.
  const rgb = (h) => {
    let s = h.replace('#', '');
    if (s.length === 3) s = s.split('').map((c) => c + c).join('');
    return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
  };
  const relLum = (h) => {
    const [r, g, b] = rgb(h).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => {
    const [x, y] = [relLum(a), relLum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  // Role comes from how each token is actually used, same as when the values
  // were generated — a `color:` use is text and has to be readable.
  const body = css.slice(css.indexOf('\n}', css.indexOf(':root {')) + 2).replace(/\/\*[\s\S]*?\*\//g, '');
  const role = {};
  for (const [, prop, val] of body.matchAll(/([a-z-]+)\s*:\s*([^;{}]+)/g)) {
    for (const [, tok] of val.matchAll(/var\((--(?:neutral|tint|surface-tint)[a-z0-9-]*)\)/g)) {
      const r = prop.startsWith('background') ? 'bg' : prop === 'color' ? 'fg' : prop.includes('border') ? 'border' : 'other';
      role[tok] = role[tok] || {};
      role[tok][r] = (role[tok][r] || 0) + 1;
    }
  }
  const dominant = (t) => Object.entries(role[t] || {}).sort((a, b) => b[1] - a[1])[0]?.[0];
  const family = (t) => (t.startsWith('--neutral') ? 'neutral'
    : t.startsWith('--surface') ? 'surface' : t.replace(/-\d+$/, ''));

  const fails = [];
  for (const [tok, val] of Object.entries(lightTokens)) {
    if (!/^#[0-9a-fA-F]{3,6}$/.test(val) || dominant(tok) !== 'fg') continue;
    const bgs = Object.entries(lightTokens)
      .filter(([t, v]) => family(t) === family(tok) && dominant(t) === 'bg' && /^#[0-9a-fA-F]{3,6}$/.test(v))
      .map(([, v]) => v);
    // The palest sibling background is the worst case for a dark foreground.
    const worst = bgs.length ? bgs.reduce((a, b) => (relLum(a) > relLum(b) ? a : b)) : '#ffffff';
    for (const [label, bg] of [['white', '#ffffff'], ['tint', worst]]) {
      const r = ratio(val, bg);
      if (r < 4.5) fails.push(`${tok} (${val}) on ${label} ${bg}: ${r.toFixed(2)}:1`);
    }
  }
  assert.deepEqual(fails, [], `light foregrounds below 4.5:1:\n${fails.join('\n')}`);
});

test('chart colours are read during render, never captured at import', () => {
  // A module-level `const X = token(...)` pins the palette to whichever theme was
  // active on first load, so switching would leave every chart on the old colours
  // until a reload. chartPalette() caches per data-theme instead.
  const theme = read('../frontend/src/theme.js');
  assert.match(theme, /export function chartPalette\(\)/);
  assert.match(theme, /document\.documentElement\.dataset\.theme/, 'cache must key on the live theme');
  for (const f of ['Dashboard', 'Analytics', 'PropOS', 'Reports', 'DashWidgets']) {
    const src = read(`../frontend/src/${f}.jsx`);
    const captured = src.split('\n').filter((l) => /^const .*\btoken\(/.test(l));
    assert.deepEqual(captured, [], `${f}.jsx captures tokens at module scope: ${captured.join(' | ')}`);
    assert.match(src, /chartPalette\(\)/, `${f}.jsx should resolve its palette at render time`);
  }
});

test('the theme toggle is wired to a server-synced preference', () => {
  const app = read('../frontend/src/App.jsx');
  const bar = read('../frontend/src/FilterBar.jsx');
  const layout = read('../frontend/src/Layout.jsx');
  // Stored alongside the other global prefs, not in localStorage or per-scope.
  assert.match(app, /viewConfigs\.theme === 'light'/);
  assert.match(app, /theme: t === 'light' \? 'light' : 'dark'/);
  // Dark is :root, so the attribute is only present for light — and must be
  // REMOVED going back, not set to "dark", or :root[data-theme="light"] logic
  // and any future selector would drift apart.
  assert.match(app, /el\.dataset\.theme = 'light'/);
  assert.match(app, /delete el\.dataset\.theme/);
  for (const p of ['theme', 'setTheme']) assert.ok(layout.includes(p), `Layout must pass ${p}`);
  // Mounted, sitting next to the notification bell. The light palette it switches
  // to is knowingly unfinished; dark is unaffected, since dark is :root and the
  // toggle only adds data-theme="light".
  assert.match(bar, /function ThemeToggle/);
  assert.ok(bar.indexOf('<ThemeToggle') < bar.indexOf('<NotificationBell'));
  assert.match(bar, /aria-label=\{toLight \? 'Switch to light theme' : 'Switch to dark theme'\}/);
});

test('nothing calls token() without importing it', () => {
  // esbuild does no scope analysis, so an unimported `token` builds fine and then
  // throws a ReferenceError on render — which is exactly how the whole app went
  // blank behind an error boundary after the chartPalette refactor.
  const files = readdirSync(fileURLToPath(new URL('../frontend/src', import.meta.url)))
    .filter((f) => (f.endsWith('.jsx') || f.endsWith('.js')) && f !== 'theme.js');
  const broken = [];
  for (const f of files) {
    const src = read(`../frontend/src/${f}`);
    if (!/\btoken\(/.test(src)) continue;
    if (!/import \{[^}]*\btoken\b[^}]*\} from '\.\/theme\.js'/.test(src)) broken.push(f);
  }
  assert.deepEqual(broken, [], `token() used but not imported in: ${broken.join(', ')}`);
});

test('every chartPalette() key that is read actually exists', () => {
  // A typo'd key is silently `undefined` — no crash, just a chart drawn with no
  // colour, which is easy to miss.
  const theme = read('../frontend/src/theme.js');
  // Search the closing marker FORWARD from the assignment: the cache-hit early
  // `return paletteCache;` sits above it, so an unanchored search slices nothing.
  const from = theme.indexOf('paletteCache = {');
  const block = theme.slice(from, theme.indexOf('return paletteCache;', from));
  const keys = new Set([...block.matchAll(/^\s{4}([a-zA-Z]+):/gm)].map((m) => m[1]));
  assert.ok(keys.size >= 5, 'could not parse the palette keys');
  const files = readdirSync(fileURLToPath(new URL('../frontend/src', import.meta.url)))
    .filter((f) => f.endsWith('.jsx'));
  const unknown = [];
  for (const f of files) {
    for (const [, k] of read(`../frontend/src/${f}`).matchAll(/chartPalette\(\)\.([a-zA-Z]+)/g)) {
      if (!keys.has(k)) unknown.push(`${f}: .${k}`);
    }
  }
  assert.deepEqual(unknown, [], `unknown palette keys: ${unknown.join(', ')}`);
});
