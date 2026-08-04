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

/** Class names the application puts on elements, plus every class legacy CSS styles. */
function appClassNames() {
  const out = new Set();
  for (const f of readdirSync(appDir).filter((n) => n.endsWith('.jsx') || n.endsWith('.js'))) {
    const s = readFileSync(`${appDir}/${f}`, 'utf8');
    for (const m of s.matchAll(/className=(?:"([^"]*)"|\{([^}]*)\})/g)) {
      for (const tok of (m[1] ?? m[2] ?? '').split(/[^\w-]+/)) {
        if (/^[a-z][a-z0-9-]*$/.test(tok)) out.add(tok);
      }
    }
  }
  for (const m of legacyCss.matchAll(/\.([a-z][a-z0-9-]*)\b/g)) out.add(m[1]);
  return out;
}

test('no unaccounted collision between utility names and app class names', () => {
  const utils = new Set([...utilitiesUsed(readDir(uiDir)), ...utilitiesUsed(readDir(primDir))]);
  const app = appClassNames();
  const collisions = [...utils].filter((u) => app.has(u) && !ACCOUNTED_FOR.has(u)).sort();
  assert.deepEqual(
    collisions,
    [],
    `Utility name(s) collide with existing app class names: ${collisions.join(', ')}. ` +
      `Either the legacy class must declare every property the utility sets, or one ` +
      `of the two names has to change. Do not just add it to ACCOUNTED_FOR.`,
  );
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

test('every generated primitive is reachable through the primitives barrel', () => {
  const barrel = readFileSync(`${primDir}/index.js`, 'utf8');
  for (const f of readdirSync(uiDir)) {
    const name = f.replace(/\.jsx$/, '');
    assert.match(barrel, new RegExp(`from './${name}(\\.jsx|\\.js)?'`), `${name} is not exported`);
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
