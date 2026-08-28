import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bridgeCss, legacyCss, tokensCss } from './helpers/app-css.js';
import { appFiles, libraryFiles, readSrc, stripComments } from './helpers/src-files.js';

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
//
// EMPTY SINCE 2026-08-28. `grid` lived here for as long as the Trade Log's <table> was
// class="grid"; the table is `.log-grid` now, so there is nothing left to exempt. An
// empty set is the right resting state — the exemption list is a debt register, not a
// config knob.
const ACCOUNTED_FOR = new Set([]);

/* COMMENTS ARE STRIPPED BEFORE SCANNING, and that is a fix rather than tidiness.
 * `utilitiesUsed` reads STRING LITERALS inside cn(...)/cva(...), and a component's
 * explanation of its own classes usually lives inside that same call — where an
 * apostrophe opens a string literal that runs to the next apostrophe. "the reference's
 * own inset ... the row's edge" parses as a literal containing `the`, `row`, `on`,
 * `page`, and each of those is then reported as a utility the library ships. That is how
 * this test started failing on prose: `wide` and `page` are real legacy class names, so
 * the collision it reported was real-looking and entirely imaginary. */
const readDir = (dir) =>
  !existsSync(dir) ? '' : readdirSync(dir)
    .filter((f) => f.endsWith('.jsx') || f.endsWith('.js'))
    .map((f) => stripComments(readFileSync(`${dir}/${f}`, 'utf8')))
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
/* COMMENTS ARE STRIPPED FIRST, for the same reason the component scan above strips
 * them: a comment EXPLAINING a collision mentions the colliding name, and an unstripped
 * scan then reports the explanation as the collision. That is not hypothetical — the
 * note above `.log-grid` describes the `.grid{display:grid}` utility it was renamed away
 * from, and without this the rename could never be recorded in prose without failing
 * the test that the rename exists to satisfy. */
function legacyStyledClassNames() {
  const css = legacyCss.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const out = new Set();
  for (const m of css.matchAll(/\.([a-z][a-z0-9-]*)\b/g)) out.add(m[1]);
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
  for (const f of appFiles()) {
    const s = readSrc(f);
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

test('the `grid` collision is gone, not merely mitigated', () => {
  /* WHAT THIS USED TO ASSERT, and why that is no longer enough. The Trade Log's <table>
   * was class="grid", colliding with Tailwind's `grid` utility. It survived on cascade
   * position: legacy CSS was unlayered and utilities are layered, so legacy's explicit
   * `display: table` beat `display: grid`. The test asserted that declaration.
   *
   * The 2026-08-28 redesign put legacy/app.css in `layer(legacy)` — the LOWEST layer —
   * so the utility now wins every property, and that mitigation silently inverted. The
   * old assertion would still have passed while the Trade Log rendered as a grid
   * container, which is the worst kind of green test.
   *
   * So the collision is removed at the source: the table is `.log-grid`, a name no
   * Tailwind utility can ever emit. This asserts the squat is gone AND stays gone. */
  assert.doesNotMatch(
    legacyCss,
    /^\.grid(?![-\w])/m,
    'legacy CSS is squatting the `grid` utility name again — namespace it (see .log-grid)',
  );
  const rule = legacyCss.match(/^\.log-grid\s*\{([^}]*)\}/m);
  assert.ok(rule, 'the Trade Log table rule has moved or been renamed');
  assert.match(rule[1], /display:\s*table/, '.log-grid must still declare display: table');
});

test('generated components hardcode no colours', () => {
  const src = readDir(uiDir);
  const literals = src.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\boklch\(|\bhsla?\(/g) || [];
  assert.deepEqual(literals, [], 'a colour literal appeared in generated components');
});

test('application code imports primitives, never generated components', () => {
  const offenders = [];
  for (const f of appFiles()) {
    // Relative form is matched path-agnostically — a page nested under features/
    // reaches the generated layer as `../../components/ui/...`, not `./`.
    if (/from\s+['"](@\/components\/ui|[.\/]*(?:\.\.\/)*components\/ui)/.test(readSrc(f))) offenders.push(f);
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

test('the component library uses three breakpoints and no others', () => {
  /* THE APP'S RANGE IS 1080 -> 1920 (tailwind.css, "BREAKPOINTS"), and exactly three
   * numbers reorganise it:
   *
   *   1200  paired columns become one column
   *   1080  the KPI row stops fitting on one line
   *    900  the rail leaves the flow and becomes a drawer
   *
   * A fourth number is how two sections come to reorganise at widths 24px apart — the
   * user sees one column collapse, resizes 30px, and watches a different one collapse.
   * Tailwind's own named screens are not in play here (v4 generates min-width variants
   * and these are all max), so a stray `max-[1024px]:` would look perfectly idiomatic
   * and never be questioned.
   *
   * Both directions are checked: `max-[n]px` and `min-[n]px`, since the hero's flex
   * ratio is applied as a min. */
  const ALLOWED = new Set(['900', '1080', '1200']);
  const offenders = [];
  for (const dir of ['max', 'min']) {
    const re = new RegExp(`${dir}-\\[(\\d+)px\\]`, 'g');
    for (const f of libraryFiles()) {
      for (const m of stripComments(readSrc(f)).matchAll(re)) {
        if (!ALLOWED.has(m[1])) offenders.push(`${f}: ${dir}-[${m[1]}px]`);
      }
    }
  }
  assert.deepEqual([...new Set(offenders)], [],
    `unknown breakpoint(s) — the set is 900 / 1080 / 1200:\n${offenders.join('\n')}`);
});

test('no app file writes a Tailwind utility, because it would compile to nothing', () => {
  /* THE ONE FAILURE IN THIS REPO WITH NO ERROR MESSAGE, and it is worth a test of its
   * own because it looks like working code in review.
   *
   * `@source` scopes Tailwind's scanner to components/{ui,primitives}. A class written
   * anywhere else is never seen, so no rule is emitted — the markup is correct, the
   * class is on the element, and the browser has nothing to apply. Worse, tailwind-merge
   * has usually already dropped the primitive's own default in favour of the class that
   * does not exist.
   *
   * IT HAPPENED TWICE while building the dashboard's loading state. `w-40` on a skeleton
   * block left it 36px tall and ZERO wide inside a flex row — reserving its space,
   * painting nothing — and `h-7` on a skeleton line silently kept the default height.
   * Neither was visible in the source; the first was found by dumping the rendered DOM.
   * The fix in both cases was to make the dimension a PROP the primitive turns into an
   * inline style, which is what a caller outside the library has to use.
   *
   * The patterns below are the unambiguous ones only. Legacy class names are
   * hyphenated and domain-shaped (`dash-grid`, `card-md`, `jo-kpi-label`), so a bare
   * `flex`, an arbitrary value, or a numeric spacing step cannot be one of them. */
  /* WHOLE TOKENS, NOT SUBSTRINGS. The first version used \\b and matched `grid` inside
   * `dash-grid` — every legacy grid class in the app. A class attribute is a
   * space-separated list, so each token is checked on its own. */
  const UTILITY = [
    /^(?:flex|grid|truncate|tabular-nums|shrink-0|items-center|justify-between|opacity-\d+)$/,
    /^(?:w|h|p|px|py|pt|pb|pl|pr|m|mx|my|gap|basis|size)-(?:\d|\[)/,
    /^(?:text|bg|border|rounded|min-w|max-w|min-h)-\[/,
  ];
  const isUtility = (tok) => UTILITY.some((re) => re.test(tok));

  const offenders = [];
  for (const f of appFiles({ ext: /\.jsx$/ })) {
    const src = stripComments(readSrc(f));
    // className="..." and className={`...`} — the two forms a static class arrives in.
    for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
      const value = m[1] ?? m[2] ?? '';
      const bad = value.split(/\s+/).filter(Boolean).filter(isUtility);
      if (bad.length) offenders.push(`${f}: ${bad.join(' ')}`);
    }
  }
  assert.deepEqual(offenders, [],
    `these classes emit NO CSS — utilities compile only under components/{ui,primitives}.\n`
    + `Move the style into a primitive, or take it as a prop:\n${offenders.join('\n')}`);
});

test('the stylesheet parses — comments close and braces balance', () => {
  /* A NEAR MISS ON 2026-08-28 IS WHY THIS EXISTS. A rule inserted programmatically
   * landed INSIDE an existing block comment, which swallowed the closing delimiter and
   * turned the rest of the file into commented-out text. The whole app rendered blank.
   * (Written without the delimiter itself: quoting it here closes THIS comment early,
   * which is the same bug one language over — it happened on the first draft.)
   *
   * `npm test` was green throughout: every test here reads the stylesheet as a STRING
   * and greps it, so a file that no longer parses as CSS still satisfies every
   * assertion about what it contains. Only running the app found it.
   *
   * This is the cheapest possible parser — comment nesting and brace depth — and it
   * catches exactly that class of damage. It is not a CSS validator and does not try to
   * be; it answers "could this file still be a stylesheet at all". */
  for (const [name, css] of [['legacy/app.css', legacyCss], ['tokens.css', tokensCss], ['bridge.css', bridgeCss]]) {
    // Comments first: an unterminated one hides every brace after it, so brace counting
    // on the raw text would report a confusing second failure instead of the real one.
    const opens = (css.match(/\/\*/g) || []).length;
    const closes = (css.match(/\*\//g) || []).length;
    assert.equal(opens, closes, `${name}: ${opens} comment openers vs ${closes} closers — one is unterminated`);

    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
    let depth = 0;
    for (const ch of stripped) {
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      assert.ok(depth >= 0, `${name}: a closing brace with nothing open`);
    }
    assert.equal(depth, 0, `${name}: ${depth} unclosed block(s)`);
  }
});

test('no rule is nested inside another rule\'s body', () => {
  /* THE SECOND HALF OF THE SAME LESSON, and it needed its own check because the first
   * one passed while the file was broken.
   *
   * The comment-and-brace test above catches an insertion that swallows a delimiter.
   * It does NOT catch a complete, well-formed rule dropped INSIDE another rule's body —
   * braces still balance, comments still close, and the stylesheet is quietly invalid.
   * That happened twice in one session, both times from inserting after a matched line
   * without noticing the line was the first of a multi-line rule.
   *
   * At-rule blocks are exempt: `@media`, `@supports` and `@layer` exist to CONTAIN
   * selectors, and this file is full of legitimate ones. What is never intended here is
   * a selector inside a DECLARATION block. (CSS nesting is valid modern syntax; this
   * stylesheet predates it and does not use it, so its appearance means an accident.) */
  for (const [name, css] of [['legacy/app.css', legacyCss], ['tokens.css', tokensCss], ['bridge.css', bridgeCss]]) {
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const stack = [];
    const offenders = [];
    stripped.split('\n').forEach((line, i) => {
      const t = line.trim();
      if (stack[stack.length - 1] === 'decl' && /^[.#][A-Za-z0-9_-][^;{}]*\{/.test(t)) {
        offenders.push(`${name}:${i + 1}: ${t.slice(0, 60)}`);
      }
      for (const ch of line) {
        if (ch === '{') stack.push(t.startsWith('@') ? 'at' : 'decl');
        else if (ch === '}') stack.pop();
      }
    });
    assert.deepEqual(offenders, [],
      `a rule is nested inside another rule's body — the stylesheet is invalid there:\n${offenders.join('\n')}`);
  }
});
