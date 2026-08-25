import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tokensCss, legacyCss } from './helpers/app-css.js';

// Phase 3c wired the existing design system into Tailwind + shadcn. The whole
// point of that wiring is its DIRECTION: our tokens flow outward into the
// library's vocabulary, never the reverse. These tests guard that direction,
// because a single line in the wrong place inverts it silently — nothing would
// look broken, the design system would just quietly stop being the source of
// truth for values.
const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const bridge = read('../frontend/src/styles/bridge.css');
const entry = read('../frontend/src/styles/index.css');
const tailwind = read('../frontend/src/tailwind.css');

const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const bridgeCode = strip(bridge);

test('tokens.css is the only file that declares values', () => {
  const literals = bridgeCode.match(/:\s*(#[0-9a-fA-F]{3,8}|rgba?\(|oklch\(|hsla?\()/g) || [];
  assert.deepEqual(literals, [], 'bridge.css must not contain literal colour values');
  assert.match(tokensCss, /--bg:\s*#/, 'tokens.css holds the actual values');
});

test('tailwind.css stays a wiring file — no tokens, no values', () => {
  // It holds imports, the layer order and @source. Values belong to tokens.css and
  // the mapping to bridge.css; index.css documents that split as the whole point of
  // having four files.
  //
  // THIS IS AN INJECTION GUARD, not hygiene. `shadcn add` WRITES TO THIS FILE: adding
  // @coss/field appended a `--destructive-foreground` pair built from Tailwind's raw
  // palette (`var(--color-red-700)` / `var(--color-red-400)`) plus a `.dark` block —
  // duplicating what bridge.css already maps to `--on-accent`, and violating §4's "no
  // raw colour anywhere". The `.dark` half was caught by the next test; the values
  // half was not caught by anything, which is why this exists.
  const code = strip(tailwind);
  const literals = code.match(/:\s*(#[0-9a-fA-F]{3,8}|rgba?\(|oklch\(|hsla?\()/g) || [];
  assert.deepEqual(literals, [], 'tailwind.css must not contain literal colour values');
  const declared = [...code.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]);
  assert.deepEqual(declared, [],
    'tailwind.css declared a custom property — a `shadcn add` probably injected it; move it to tokens.css or bridge.css');
});

test('the bridge never redeclares one of our tokens', () => {
  const ours = [...strip(tokensCss).matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]);
  const redeclared = [...new Set(ours)].filter((t) =>
    new RegExp(`(?<![\\w-])${t}\\s*:`).test(bridgeCode),
  );
  assert.deepEqual(redeclared, [], 'bridge.css must reference our tokens, never define them');
});

test('every token the bridge references actually exists', () => {
  const declared = new Set([...strip(tokensCss).matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const dangling = [...new Set([...bridgeCode.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]))]
    .filter((t) => !declared.has(t));
  assert.deepEqual(dangling, [], 'bridge.css references a token that no longer exists');
});

test('the --accent collision stays resolved in our favour', () => {
  // shadcn's "accent" means a subtle hover background; ours means brand blue.
  // Their name is served from our neutral hover token — which also keeps chrome
  // grayscale (DESIGN-LANGUAGE N4). Our brand blue is exposed as brand-*.
  assert.match(bridgeCode, /--color-accent:\s*var\(--surface-hover\)/);
  assert.match(bridgeCode, /--color-brand:\s*var\(--accent\)/);
  assert.match(bridgeCode, /--color-primary:\s*var\(--accent\)/);
  // Which blue step is a foundation value (preset b2qKmlY80 uses blue-800 in
  // dark); that it is a blue at all is the invariant.
  assert.match(tokensCss, /--accent:\s*var\(--blue-\d00\)/);
});

test('the --muted collision stays resolved in our favour', () => {
  // Theirs is a surface, ours is a text colour.
  assert.match(bridgeCode, /--color-muted:\s*var\(--sel-bg\)/);
  assert.match(bridgeCode, /--color-muted-foreground:\s*var\(--text-2\)/);
  assert.match(tokensCss, /--muted:\s*var\(--slate-400\)/);
});

test('dark stays default and theming stays on data-theme', () => {
  for (const [name, css] of [['tokens', tokensCss], ['bridge', bridge], ['tailwind', tailwind]]) {
    assert.ok(!/(^|[\s,{>+~])\.dark\b/.test(strip(css)), `${name} must not introduce a .dark class`);
  }
  assert.match(tokensCss, /:root\[data-theme="light"\]/, 'light mode overrides tokens only');
  assert.match(bridgeCode, /@custom-variant dark \([^)]*data-theme="light"/, 'dark: derives from data-theme');
});

test('our domain ring survives and is first-class in Tailwind', () => {
  for (const t of ['profit', 'loss', 'loss-quiet', 'be', 'payout', 'warning', 'ai',
                   'status-good', 'status-warn', 'status-bad', 'status-info',
                   'tint-profit-1', 'tint-loss-1', 'tint-warn-1', 'tint-payout-1']) {
    assert.match(tokensCss, new RegExp(`--${t}:`), `tokens.css lost --${t}`);
    assert.match(bridgeCode, new RegExp(`--color-${t}:\\s*var\\(--${t}\\)`), `bridge lost --color-${t}`);
  }
});

test('typography stays ours', () => {
  assert.match(tokensCss, /--font-sans:\s*'Geist Variable'/);
  // Mapping --font-sans in @theme would be circular; the cascade already makes
  // ours win. Guard that nobody "fixes" it by duplicating the stack.
  assert.ok(!/--font-sans\s*:/.test(bridgeCode), 'bridge must not redeclare --font-sans');
  for (const role of ['page-title', 'section-title', 'card-title', 'primary-metric']) {
    assert.match(bridgeCode, new RegExp(`--text-${role}:\\s*var\\(--fs-${role}\\)`));
  }
  assert.match(bridgeCode, /--font-weight-semibold:\s*var\(--fw-semibold\)/);
});

test("Tailwind's own type ladder is repointed at our scale, not left on its defaults", () => {
  // Preset b2qKmlY80 defines no font sizes, so every `text-sm` / `text-xs` /
  // `text-base` in a generated component was resolving to Tailwind's 14/12/16px
  // instead of this app's 13/11/15px. That put every migrated primitive one step
  // above every unmigrated one, and it is a single mapping to get wrong — so it is a
  // single mapping to pin.
  assert.match(tokensCss, /--fs-body:\s*13px/, 'the body role is the app 13px workhorse');
  assert.match(tokensCss, /--fs-label:\s*11px/, 'the label role is the app 11px pill/label step');
  for (const [step, token] of [
    ['xs', 'fs-label'],
    ['sm', 'fs-body'],
    ['base', 'fs-card-title'],
    ['lg', 'fs-section-title'],
    ['2xl', 'fs-page-title'],
  ]) {
    assert.match(bridgeCode, new RegExp(`--text-${step}:\\s*var\\(--${token}\\)`),
      `text-${step} must resolve to var(--${token}), not Tailwind's default`);
  }
  // The line-height companions are ratios, so they follow the sizes on their own.
  // Overriding them would be inventing values the DLS has not decided.
  assert.ok(!/--text-\w+--line-height/.test(bridgeCode),
    'line-height companions are deliberately left to Tailwind — they are unitless ratios');
});

test("our breakpoints replace Tailwind's, they don't join them", () => {
  assert.match(bridgeCode, /--breakpoint-\*:\s*initial/, "Tailwind's min-width defaults must be cleared");
  for (const bp of [1100, 900, 760, 720, 560, 520]) {
    assert.match(bridgeCode, new RegExp(`@custom-variant max-${bp} \\(@media \\(max-width: ${bp}px\\)\\)`));
  }
});

test('Preflight stays out', () => {
  assert.ok(!/@import\s+"tailwindcss"\s*;/.test(strip(tailwind)), 'the bare import would enable Preflight');
});

test('the resets Preflight would have provided are present, and only remove UA defaults', () => {
  // Preflight is deliberately not imported (above), and the cost is that generated
  // components — which are written against it — inherit the browser's defaults where
  // they set nothing themselves. Each entry here is a UA default that ACTUALLY shipped
  // as a visible bug:
  //
  //   color / text-decoration  a MenuItem rendered as a <Link> went browser-blue and
  //                            underlined in the user menu
  //   background-color         `buttonface` resolves to an opaque rgb(107,107,107)
  //                            under color-scheme: dark, so every ghost/chrome button
  //                            in the top bar and every unpressed ToggleGroup item
  //                            painted itself a solid grey slab
  //
  // A third will come — bridge.css §8 says so — and it belongs in this list, not in a
  // component rule.
  // The one @layer base block, bounded by its own closing brace at column 0 (nested
  // rules close indented), so the motion utilities below it are not swept in.
  const at = bridgeCode.indexOf('@layer base');
  assert.notEqual(at, -1, 'bridge.css must carry the scoped reset layer');
  const base = bridgeCode.slice(at, bridgeCode.indexOf('\n}', at) + 2);
  for (const [selector, decl] of [
    ['a\\[data-slot\\], \\[data-slot\\] a', 'color:\\s*inherit'],
    ['a\\[data-slot\\], \\[data-slot\\] a', 'text-decoration:\\s*none'],
    ['button\\[data-slot\\], \\[data-slot\\] button', 'background-color:\\s*transparent'],
  ]) {
    assert.match(base, new RegExp(`:where\\(${selector}\\)\\s*\\{[^}]*${decl}`),
      `the ${selector} reset must declare ${decl}`);
  }
  // `:where()` is what makes these resets rather than opinions: specificity ZERO, so
  // every author rule still wins and none of this can ever impose an appearance.
  // Without it the anchor reset alone would flatten `.auth-alt a` and
  // `.acct-kind-upsell a`, which are deliberate.
  // Counted rather than parsed: every block inside the layer, minus the layer's own,
  // must be introduced by a `:where(`. A rule added without one shows up as a
  // mismatch here whatever its selector looks like.
  const blocks = (base.match(/\{/g) || []).length - 1;
  const wheres = (base.match(/:where\(/g) || []).length;
  assert.equal(wheres, blocks,
    `every rule in the scoped reset must be wrapped in :where() — ${blocks} rule(s), ${wheres} :where()`);
});

test('the entry imports the four layers in order', () => {
  const order = [...strip(entry).matchAll(/@import\s+"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ['../tailwind.css', './tokens.css', './bridge.css', './legacy/app.css']);
});

test('the split is clean: tokens hold no rules, legacy holds no tokens', () => {
  assert.ok(!/^:root\s*\{/m.test(legacyCss), 'a token block leaked into legacy/');
  const rules = strip(tokensCss).match(/^[.#*[a-z][^{}]*\{/gm) || [];
  assert.deepEqual(rules, [], 'a component rule leaked into tokens.css');
});
