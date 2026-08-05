import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { legacyCss } from './helpers/app-css.js';

/* Tailwind utility names and this app's 862 legacy class names share one global
 * namespace. When a generated component uses `grid` and a legacy <table> also has
 * class="grid", both rules match the same element — and because utilities sit in a
 * cascade layer while legacy CSS does not, the legacy rule wins ONLY for the
 * properties it declares. Any property it omits comes from Tailwind.
 *
 * That is how the Trade Log table nearly became a grid container: `.grid` set
 * border-collapse and width but never `display`.
 *
 * This test makes that failure mode loud. It compares the utility classes the
 * component library actually ships against the class names the application
 * actually uses, and fails on any overlap that is not explicitly accounted for
 * below. It is static — no build needed — so it fails on the commit that
 * introduces the clash rather than in production.
 */

const at = (p) => fileURLToPath(new URL(p, import.meta.url));
const uiDir = at('../frontend/src/components/ui');
const primDir = at('../frontend/src/components/primitives');
const appDir = at('../frontend/src');

// Known collisions. Each one's mitigation is asserted below. Adding a name here
// without a mitigation is not a fix — it is hiding a bug.
const ACCOUNTED_FOR = new Set(['grid']);

const readDir = (dir) =>
  !existsSync(dir) ? '' : readdirSync(dir)
    .filter((f) => f.endsWith('.jsx') || f.endsWith('.js'))
    .map((f) => readFileSync(`${dir}/${f}`, 'utf8'))
    .join('\n');

/** Utility class names the component library ships, minus variants and arbitrary
 *  values. Only strings inside cn(...) / cva(...) count as class lists — otherwise
 *  unrelated literals like role="status" get mistaken for utilities. */
function utilitiesUsed(source) {
  const out = new Set();
  for (const call of source.matchAll(/\b(?:cn|cva)\(/g)) {
    let i = call.index + call[0].length;
    let depth = 1;
    const start = i;
    while (i < source.length && depth) {
      if (source[i] === '(') depth += 1;
      else if (source[i] === ')') depth -= 1;
      i += 1;
    }
    for (const lit of source.slice(start, i - 1).matchAll(/"([^"\\]*)"|'([^'\\]*)'/g)) {
      for (let tok of (lit[1] ?? lit[2] ?? '').split(/\s+/)) {
        if (!tok) continue;
        tok = tok.replace(/\[[^\]]*\]/g, ''); // drop arbitrary values
        tok = tok.split(':').pop();           // drop variants (hover:, dark:, data-x:)
        tok = tok.split('/')[0];              // drop opacity + group names
        if (/^[a-z][a-z0-9-]*$/.test(tok)) out.add(tok);
      }
    }
  }
  return out;
}

/** Every class name legacy CSS styles.
 *
 * NARROWED 2026-08-05 (Phase 4c). This used to be the UNION of legacy selectors and
 * every token in an app `className=`, on the assumption that app markup only ever
 * carries legacy `.foo-bar` names. Phase 4c retired that assumption: the top bar's
 * controls are generated components now, and the geometry around them — a `truncate`
 * on the account label, `relative` + `-top-1` on the unread pill — is written as
 * utilities in app JSX, because that is the whole point of migrating off the legacy
 * stylesheet.
 *
 * With the union, every such utility was read as an "app class name" and reported as
 * colliding with itself the moment the library used the same one. Ten false positives,
 * and a test that fails for doing the right thing teaches people to widen
 * ACCOUNTED_FOR — the exact move its own comment forbids.
 *
 * The half that carries the invariant is this one. A collision only misbehaves when a
 * rule EXISTS to compete with the utility: `.grid` broke the Trade Log because legacy
 * CSS declared border-collapse and width but not `display`, so Tailwind supplied it. A
 * name that no legacy rule styles has nothing to partially override, and a utility in
 * app JSX that no legacy rule styles is not a collision at all — it is the mechanism
 * working. So the check is utilities ∩ legacy-styled classes, which still fails on the
 * day someone reuses a Tailwind name in `app.css`.
 */
function legacyStyledClassNames() {
  const out = new Set();
  for (const m of legacyCss.matchAll(/\.([a-z][a-z0-9-]*)\b/g)) out.add(m[1]);
  return out;
}

test('no unaccounted collision between utility names and legacy-styled class names', () => {
  const utils = new Set([...utilitiesUsed(readDir(uiDir)), ...utilitiesUsed(readDir(primDir))]);
  const legacy = legacyStyledClassNames();
  const collisions = [...utils].filter((u) => legacy.has(u) && !ACCOUNTED_FOR.has(u)).sort();
  assert.deepEqual(
    collisions,
    [],
    `Utility name(s) collide with class names legacy CSS styles: ${collisions.join(', ')}. ` +
      `Legacy CSS is unlayered, so its rule wins for the properties it declares and ` +
      `Tailwind supplies the rest. Either the legacy class must declare every property ` +
      `the utility sets, or one of the two names has to change. Do not just add it to ` +
      `ACCOUNTED_FOR.`,
  );
});

test('utilities written in app JSX are not also styled by legacy CSS', () => {
  // The other direction of the same invariant, and the reason narrowing the test above
  // loses no coverage. App code is now allowed to write utilities; what it must never
  // do is write one that `app.css` also has a rule for, because the unlayered rule
  // would silently outrank it and the element would render neither thing cleanly.
  const legacy = legacyStyledClassNames();
  const offenders = [];
  for (const f of readdirSync(appDir).filter((n) => n.endsWith('.jsx') || n.endsWith('.js'))) {
    const s = readFileSync(`${appDir}/${f}`, 'utf8');
    for (const m of s.matchAll(/className=(?:"([^"]*)"|\{([^}]*)\})/g)) {
      for (const tok of (m[1] ?? m[2] ?? '').split(/[^\w-]+/)) {
        // A Tailwind-shaped token — has a `-` or is a known bare utility — that legacy
        // CSS also styles. Bare legacy names (`topbar`, `tb-acct`) are expected here and
        // are not what this looks for, so the token must be one the LIBRARY also ships.
        if (!/^[a-z][a-z0-9-]*$/.test(tok)) continue;
        if (legacy.has(tok) && !ACCOUNTED_FOR.has(tok)) {
          const utils = new Set([...utilitiesUsed(readDir(uiDir)), ...utilitiesUsed(readDir(primDir))]);
          if (utils.has(tok)) offenders.push(`${f}: ${tok}`);
        }
      }
    }
  }
  assert.deepEqual(offenders, [], 'app JSX writes a utility that legacy CSS also styles');
});

test('the known `grid` collision keeps its mitigation', () => {
  // The legacy rule must declare `display`, or Tailwind's display:grid wins.
  const rule = legacyCss.match(/^\.grid\s*\{([^}]*)\}/m);
  assert.ok(rule, 'the legacy .grid rule has moved or been renamed — re-check the collision');
  assert.match(rule[1], /display:\s*table/, '.grid must declare display or the Trade Log breaks');
});

test('generated components hardcode no colours', () => {
  const src = readDir(uiDir);
  const literals = src.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\boklch\(|\bhsla?\(/g) || [];
  assert.deepEqual(literals, [], 'a colour literal appeared in generated components');
});

test('application code imports primitives, never generated components', () => {
  const offenders = [];
  for (const f of readdirSync(appDir).filter((n) => n.endsWith('.jsx') || n.endsWith('.js'))) {
    const s = readFileSync(`${appDir}/${f}`, 'utf8');
    if (/from\s+['"](@\/components\/ui|\.\/components\/ui)/.test(s)) offenders.push(f);
  }
  assert.deepEqual(offenders, [], 'these files bypass the primitives layer');
});

test('every generated primitive is reachable — no dead generated code', () => {
  // THE INVARIANT is that no file in `components/ui` is orphaned. A generated file that
  // nothing imports is not merely unused: `@source` still scans it, so Tailwind emits its
  // whole skin into the bundle for a component no element renders. That cost 3.9 kB of
  // dead CSS once already, which is why this test exists.
  //
  // THE MECHANISM WIDENED ON 2026-08-05. It used to require a same-named file re-exported
  // from the barrel — `ui/button.jsx` ⇒ `from './button.jsx'`. That assumed a primitive
  // always shares its generated file's name, and `dropdown-menu` broke the assumption:
  // our primitive is `menu.jsx`, because the app calls it a Menu. It was reachable and
  // reported as dead. So reachability is now what it should always have been — does ANY
  // primitives module import it — which is the thing that actually keeps Tailwind honest.
  const barrel = readFileSync(`${primDir}/index.js`, 'utf8');
  const prims = readdirSync(primDir).filter((f) => /\.jsx?$/.test(f) && f !== 'index.js');
  const sources = prims.map((f) => readFileSync(`${primDir}/${f}`, 'utf8'));
  for (const f of readdirSync(uiDir)) {
    const name = f.replace(/\.jsx$/, '');
    const direct = new RegExp(`from './${name}(\\.jsx|\\.js)?'`).test(barrel);
    const viaPrimitive = sources.some((s) => s.includes(`@/components/ui/${name}`));
    assert.ok(direct || viaPrimitive,
      `ui/${name}.jsx is imported by nothing — Tailwind still emits its skin. Wire it or delete it.`);
  }
  // And the barrel must still be the only door out: every primitive module is exported,
  // or a page has no way to reach it and would import from `ui/` directly.
  for (const f of prims) {
    const name = f.replace(/\.jsx?$/, '');
    assert.match(barrel, new RegExp(`from './${name}(\\.jsx|\\.js)?'`),
      `primitives/${f} is not exported from the barrel`);
  }
});

test('scanning stays scoped to the component library', () => {
  // Widening @source to all of src/ harvests utility candidates out of hyphenated
  // legacy class names (`dash-grid` yields `grid`, `dle-hidden` yields `hidden`)
  // and emits live rules that legacy markup can collide with.
  const tw = readFileSync(at('../frontend/src/tailwind.css'), 'utf8');
  const sources = [...tw.matchAll(/@source\s+"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(sources.length > 0, 'scanning must be enabled for the component library to compile');
  for (const s of sources) {
    assert.match(s, /^\.\/components\//, `@source "${s}" is wider than the component library`);
  }
});
