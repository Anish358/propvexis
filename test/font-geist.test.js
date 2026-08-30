import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../src/platform/paths.js';
import { appCss } from './helpers/app-css.js';
import { allSrcFiles, readSrc } from './helpers/src-files.js';

/* ONE TYPEFACE FAMILY, AND ITS MONO TWIN — DESIGN-LANGUAGE §3.
 *
 * Geist and Geist Mono, self-hosted. This is a test rather than a note because a font
 * does not creep in the way a colour does — it arrives once, in a fallback chain or a
 * stray import, and then renders to real users only in the moments nobody tests: a cold
 * cache, a slow link, a chunk that 404s. Inter sat first-in-line behind Geist in
 * --font-sans for two days after §3 locked Geist, and nothing failed, because on every
 * machine that looked at the app Geist had already loaded.
 *
 * So the rule is checked where it is decided — the token chain, the package manifest and
 * the font imports — not by looking at rendered text. */

const read = (p) => readFileSync(path.join(repoRoot, p), 'utf8');
const tokens = read('frontend/src/styles/tokens.css');
const mainJsx = read('frontend/src/main.jsx');
const pkg = JSON.parse(read('frontend/package.json'));

// Families that are not Geist and would render actual product text if they won the
// cascade. The platform stack (-apple-system, system-ui, ui-monospace, …) and the
// generic keywords are NOT here: they resolve to whatever the OS already draws its own
// interface in, which is the floor under a failed font load rather than a second brand.
const FOREIGN_FAMILIES = [
  'Inter', 'JetBrains', 'Roboto Mono', 'SF Pro', 'Helvetica', 'Arial',
  'Times', 'Georgia', 'Courier', 'Poppins', 'Montserrat', 'Open Sans', 'Lato', 'Manrope',
];

test('the font tokens name Geist and nothing else brand-bearing', () => {
  const sans = /--font-sans:([^;]+);/.exec(tokens)?.[1] ?? '';
  const mono = /--font-mono:([^;]+);/.exec(tokens)?.[1] ?? '';
  assert.match(sans, /'Geist Variable'/, '--font-sans must lead with Geist');
  assert.match(mono, /'Geist Mono Variable'/, '--font-mono must lead with Geist Mono');
  for (const family of FOREIGN_FAMILIES) {
    assert.ok(!sans.includes(family), `--font-sans still falls back to ${family}`);
    assert.ok(!mono.includes(family), `--font-mono still falls back to ${family}`);
  }
  // Geist must be FIRST, not merely present: a chain that lists it second renders the
  // other face every time both are available, which is every time.
  assert.match(sans.trim(), /^'Geist Variable'/);
  assert.match(mono.trim(), /^'Geist Mono Variable'/);
});

test('only the two Geist packages are imported, and only in main.jsx', () => {
  const imports = [...mainJsx.matchAll(/@fontsource[^']*'/g)].map((m) => m[0]);
  assert.deepEqual(
    imports.sort(),
    ["@fontsource-variable/geist'", "@fontsource-variable/geist-mono'"],
    'main.jsx imports a font that is not Geist',
  );
  // Nowhere else may pull one in — a font import in a feature file is a font that
  // loads on one route and changes how that page reads. Scans the WHOLE tree, library
  // included: the rule is about the bundle, not about which directory wrote the import.
  // An IMPORT, not a mention: tokens.css names @fontsource-variable in prose to say
  // where the faces come from, and a rule that cannot tell documentation from code
  // punishes the file for explaining itself.
  const IMPORTS_A_FONT = /(?:^|\n)\s*(?:import\s+|@import\s+)['"][^'"]*@fontsource/;
  for (const rel of allSrcFiles()) {
    if (rel === 'main.jsx' || !/\.(jsx?|css)$/.test(rel)) continue;
    assert.ok(!IMPORTS_A_FONT.test(readSrc(rel)), `${rel} imports a font directly`);
  }
});

test('no foreign font package is installed at all', () => {
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const fonts = Object.keys(deps).filter((d) => d.startsWith('@fontsource'));
  assert.deepEqual(
    fonts.sort(),
    ['@fontsource-variable/geist', '@fontsource-variable/geist-mono'],
    'an unused font package is still installed — it is one import away from shipping',
  );
});

test('nothing loads a font over the network', () => {
  // §3: self-hosted, never the CDN. The prototype links Geist from Google; we bundle it.
  const html = read('frontend/index.html');
  for (const [name, text] of [['index.html', html], ['tokens.css', tokens], ['app.css', appCss]]) {
    assert.ok(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(text.replace(/\/\*[\s\S]*?\*\//g, '')),
      `${name} loads a font from a third party`);
  }
});

test('no stylesheet names a foreign family in a font-family declaration', () => {
  // Legacy CSS is allowed `inherit` and `var(--font-mono)` — that is the whole point of
  // the token — but not a literal family of its own.
  const declarations = [...appCss.matchAll(/font-family\s*:\s*([^;}]+)/g)].map((m) => m[1]);
  for (const decl of declarations) {
    for (const family of FOREIGN_FAMILIES) {
      assert.ok(!decl.includes(family), `a stylesheet hard-codes ${family}: ${decl.trim()}`);
    }
  }
});
