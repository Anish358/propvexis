import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { appCss, bridgeCss, legacyCss } from './helpers/app-css.js';
import { appFiles, appJsx, readSrc } from './helpers/src-files.js';
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

test('scrims, shadow colours and rings are all declared', () => {
  /* ONE DIRECTION SINCE 2026-08-28. This asserted every rgba token was declared twice,
   * once per theme, because a scrim has to darken a light page while a shadow on white
   * needs far less alpha. With the light theme gone there is one set to check — that it
   * is COMPLETE, which is the half of the guarantee that still bites: a missing scrim
   * resolves to nothing and the overlay it dims disappears. */
  const needed = ['--topbar-bg', '--scrim-1', '--scrim-2', '--scrim-3', '--scrim-4',
    '--shadow-40', '--shadow-45', '--shadow-50', '--shadow-60', '--shadow-70',
    '--accent-ring', '--skeleton-sheen'];
  const root = css.slice(css.indexOf(':root {'), css.indexOf('\n}', css.indexOf(':root {')));
  for (const t of needed) {
    assert.ok(new RegExp(`${t}\\s*:`).test(root), `${t} missing from :root`);
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
  for (const sel of ['.prop-controls .btn-primary', '.switch-knob']) {
    const at = css.indexOf(sel);
    assert.ok(at > -1, `${sel} not found`);
    const rule = css.slice(at, css.indexOf('}', at));
    assert.ok(rule.includes('var(--on-accent)'), `${sel} should use --on-accent`);
  }
  // `.notif-badge` was the third selector here until Phase 4c (2026-08-05) deleted it —
  // the unread count is the CountBadge primitive now. The requirement did not go away with
  // the rule, so it is asserted where the colour actually lives: `text-destructive-foreground`,
  // which the bridge maps to `--on-accent`. Getting this wrong is invisible in dark and
  // wrong in light, which is why it keeps its own assertion rather than being dropped.
  const count = read('../frontend/src/components/primitives/count-badge.jsx');
  assert.match(count, /text-destructive-foreground/,
    'the unread count must resolve to --on-accent, not --text and not a literal');
  assert.match(bridgeCss, /--color-destructive-foreground:\s*var\(--on-accent\)/,
    'the bridge is what makes that true — if it changes, white-on-red flips under light');
});

test('the JS-side chart colours carry no literals of their own', () => {
  // Canvas/SVG props can't consume var(), so this code resolves tokens at runtime
  // — but it must resolve TOKENS, never hold its own colours. (That the read
  // happens during render rather than at import is covered separately below; a
  // module-level const was the original bug.)
  const widgets = read('../frontend/src/features/dashboard/DashWidgets.jsx');
  assert.ok(!/'#[0-9a-fA-F]{3,6}'/.test(widgets), 'no colour literals in DashWidgets');
  // theme.js's fallbacks are the one place JS may hold literals: they cover
  // non-DOM contexts (tests) where getComputedStyle isn't available.
  //
  // WAS /'--neutral-7': '#23232a'/. The gauge/ring track was reading a LEGACY-ONLY
  // grey — one of the ~60 --neutral-*/--tint-* tokens that exist purely to hold
  // legacy/app.css's literals and are fenced off from the Rhea role set. It is
  // --chart-grid now, which is a role the chart owns rather than a ramp step it
  // borrowed. design-tokens.test.js checks these fallbacks AGREE with tokens.css;
  // this one only checks the fallback table is not empty.
  const theme = read('../frontend/src/lib/theme.js');
  assert.match(theme, /'--chart-grid': '#[0-9a-f]{6}'/i);
  assert.doesNotMatch(theme, /'--neutral-\d+'/,
    'the Rhea layer must not reach into the legacy-only grey ramp');
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

test('there is no light theme, and the token layer stays the only place it could live', () => {
  /* REPLACES FOUR TESTS (2026-08-28): that a `:root[data-theme="light"]` block existed,
   * that it re-declared every themed scale, that it covered the core surfaces, and that
   * every light foreground cleared 4.5:1 on its own background. The block is gone by
   * owner decision with the Figma redesign — dark-only — so all four asserted a thing
   * that must NOT exist.
   *
   * What is worth keeping is the invariant underneath them, and it is asserted here:
   * component CSS must not become theme-aware. As long as that holds, light returns as
   * one block plus a toggle. The moment a component starts branching on a theme
   * selector, it does not — which is why this watches the whole stylesheet, not just
   * the token file. */
  assert.doesNotMatch(css, /\[data-theme[^\]]*\]\s*\{/,
    'a data-theme block is back — if the light theme is returning, restore its contrast tests too');
  assert.doesNotMatch(legacyCss, /\[data-theme/,
    'component CSS must never be theme-aware — that is what the token layer is for');
  // Dark is not a mode, it is the only mode: :root declares it outright.
  assert.match(css, /:root\s*\{[\s\S]*?color-scheme:\s*dark/);
});

test('chart colours are read during render, never captured at import', () => {
  // A module-level `const X = token(...)` pins the palette to whichever theme was
  // active on first load, so switching would leave every chart on the old colours
  // until a reload. chartPalette() caches per data-theme instead.
  const theme = read('../frontend/src/lib/theme.js');
  assert.match(theme, /export function chartPalette\(\)/);
  assert.match(theme, /document\.documentElement\.dataset\.theme/, 'cache must key on the live theme');
  // PropOS.jsx left this list with the Finance rebuild: its ROI chart moved to
  // FinanceSummary.jsx, and the Overview's remaining chart (the accounts ring) lives
  // in PropCards.jsx. The list names the files that actually draw something.
  for (const f of ['Dashboard', 'Analytics', 'PropCards', 'FinanceSummary', 'Reports', 'DashWidgets']) {
    const src = readSrc(`${f}.jsx`);
    const captured = src.split('\n').filter((l) => /^const .*\btoken\(/.test(l));
    assert.deepEqual(captured, [], `${f}.jsx captures tokens at module scope: ${captured.join(' | ')}`);
    assert.match(src, /chartPalette\(\)/, `${f}.jsx should resolve its palette at render time`);
  }
});

test('no theme toggle, no theme state, no data-theme writer', () => {
  /* INVERTED 2026-08-28. This asserted the toggle existed, was mounted beside the
   * notification bell, and wrote a server-synced `theme` preference. All three are gone
   * with the light theme, and the inversion is the point: a toggle left mounted with
   * one reachable value, or an effect still writing `data-theme`, is exactly the kind of
   * half-removal that reads as working until someone wonders why the button does
   * nothing. */
  const app = read('../frontend/src/App.jsx');
  const bar = read('../frontend/src/features/filters/FilterBar.jsx');
  const layout = read('../frontend/src/app/Layout.jsx');
  assert.doesNotMatch(bar, /ThemeToggle/, 'the top-bar theme toggle must be gone');
  assert.doesNotMatch(app, /dataset\.theme/, 'nothing may write the data-theme attribute');
  assert.doesNotMatch(app, /viewConfigs\.theme/, 'theme is no longer a stored preference');
  for (const p of ['theme={', 'setTheme']) {
    assert.ok(!layout.includes(p), `Layout must no longer pass ${p}`);
  }
});

test('nothing calls token() without importing it', () => {
  // esbuild does no scope analysis, so an unimported `token` builds fine and then
  // throws a ReferenceError on render — which is exactly how the whole app went
  // blank behind an error boundary after the chartPalette refactor.
  const files = appFiles().filter((f) => !f.endsWith('lib/theme.js'));
  const broken = [];
  for (const f of files) {
    const src = readSrc(f);
    if (!/\btoken\(/.test(src)) continue;
    // The specifier is path-agnostic on purpose: what matters is that `token` comes
    // from theme.js, not how many `../` the importer's depth in the tree needs.
    if (!/import \{[^}]*\btoken\b[^}]*\} from '[^']*\btheme\.js'/.test(src)) broken.push(f);
  }
  assert.deepEqual(broken, [], `token() used but not imported in: ${broken.join(', ')}`);
});

test('every chartPalette() key that is read actually exists', () => {
  // A typo'd key is silently `undefined` — no crash, just a chart drawn with no
  // colour, which is easy to miss.
  const theme = read('../frontend/src/lib/theme.js');
  // Search the closing marker FORWARD from the assignment: the cache-hit early
  // `return paletteCache;` sits above it, so an unanchored search slices nothing.
  const from = theme.indexOf('paletteCache = {');
  const block = theme.slice(from, theme.indexOf('return paletteCache;', from));
  const keys = new Set([...block.matchAll(/^\s{4}([a-zA-Z]+):/gm)].map((m) => m[1]));
  assert.ok(keys.size >= 5, 'could not parse the palette keys');
  const unknown = [];
  for (const f of appJsx()) {
    for (const [, k] of readSrc(f).matchAll(/chartPalette\(\)\.([a-zA-Z]+)/g)) {
      if (!keys.has(k)) unknown.push(`${f}: .${k}`);
    }
  }
  assert.deepEqual(unknown, [], `unknown palette keys: ${unknown.join(', ')}`);
});
