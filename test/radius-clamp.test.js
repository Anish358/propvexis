import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bridgeCss, tokensCss } from './helpers/app-css.js';

/* §6 TRAP 1 — A RADIUS VALUE IS A CEILING, NOT A PROMISE.
 *
 * A corner draws the radius it asks for only while that radius is at most HALF the
 * shorter side of its box. Past that the browser clamps every corner to half, and the
 * element is a pill or a circle whatever number was written. §6 has said so in prose
 * since it was written, and it still happened.
 *
 * WHAT HAPPENED, AND IT IS THE WHOLE REASON THIS FILE EXISTS. On 2026-09-08 the ladder
 * moved up one step (`ab7d518`): --r-sm 6 -> 8, --r-md 8 -> 10, --r-lg 10 -> 14,
 * --r-xl 12 -> 18, --r-2xl 14 -> 24. That was the right change and it was judged on
 * cards, panels and the dashboard — which is where the mockup that decided it was drawn.
 *
 * The checkbox is a 16px box asking for `rounded-sm`. At 6px it drew a rounded square.
 * At 8px — exactly half of 16 — it became a PERFECT CIRCLE, in every screen with a tick
 * box: the filter bar, the finance ledger, the journal workspace, the credential consent
 * gate, the menu's tick rows and the trade log's row selection. It had been APPROVED as
 * a rounded square four weeks earlier, its own file still said "`rounded-sm` is 6px
 * here", and nobody saw it for a day. The owner found it, not this suite.
 *
 * WHAT THIS ASSERTS is not WHICH radius — `radius-ladder.test.js` owns that. It is:
 * **if a component names a radius, its box must be big enough for that radius to mean
 * anything.** Either the box is at least twice the radius, or the element is declared a
 * deliberate pill. A number that cannot draw is a decision nobody made.
 *
 * WHY IT CATCHES THE NEXT TOKEN MOVE AND NOT ONLY THIS ONE: the values are read out of
 * `tokens.css` at test time rather than typed here. Move a token and this recomputes
 * against every box in the library, which is precisely the check that was missing.
 *
 * NO CONSTRUCTED REGEXES IN HERE, DELIBERATELY. The first draft built its patterns with
 * `new RegExp` over a template literal, where `\b` is not a word boundary but a
 * BACKSPACE character — so the pattern searched for control codes, matched nothing, and
 * the test PASSED while the component was broken. A test that fails open is worse than
 * no test at all. Everything below splits on whitespace and compares tokens, and the
 * first test in the file exists to prove the scan found something.
 */

const DIR = fileURLToPath(new URL('../frontend/src/components/primitives/', import.meta.url));
const UI = fileURLToPath(new URL('../frontend/src/components/ui/', import.meta.url));

/** Read one ladder token out of tokens.css. Line-based, so a value can never be picked
 *  up out of a comment that merely discusses it — this file's own header names five. */
function tokenPx(name) {
  const decl = `--r-${name}:`;
  for (const line of tokensCss.split('\n')) {
    const at = line.indexOf(decl);
    if (at === -1) continue;
    const comment = line.indexOf('/*');
    if (comment !== -1 && comment < at) continue;
    const m = /^(\d+)px/.exec(line.slice(at + decl.length).trim());
    assert.ok(m, `--r-${name} does not hold a px value`);
    return Number(m[1]);
  }
  assert.fail(`--r-${name} is not declared in tokens.css`);
  return 0;
}

/* THE FOUR UTILITY NAMES THAT FOLLOW OUR LADDER, and the reason `ab7d518` touched nine
 * files instead of thirty-six. `bridge.css` points these at our tokens;
 * `rounded-xl/2xl/3xl/4xl` are pinned to FIXED literals (14/16/24) because they are what
 * GENERATED components ask for, and that commit deliberately left them alone. A
 * component on a fixed literal did not move — and equally cannot regress when a token
 * does, which is why it is out of scope here rather than merely unchecked. */
const ladder = () => ({
  'rounded-sm': tokenPx('sm'),
  'rounded-md': tokenPx('md'),
  'rounded-lg': tokenPx('lg'),
  'rounded-card': tokenPx('card'),
});

/* A BOX THAT IS DELIBERATELY A PILL OR A CIRCLE, declared by name.
 *
 * Not every clamp is a fault — a control the design draws as a capsule is SUPPOSED to
 * clamp, and §6 says so: "This is why controls and badges are ALREADY pills, and that
 * question is closed." This list exists so the deliberate ones are written down and the
 * accidents are loud. Adding a name here is a design statement, not a way to quiet a
 * failing test. */
const DELIBERATE_PILL = new Set([
  // nothing yet — every ladder-tracking radius in the library draws in full.
]);

/** Tailwind's spacing base is 4px (`--spacing: var(--s-1)`), so `size-4` is 16px. */
function boxPx(tok) {
  let m = /^(?:size|h|w|min-h|min-w)-(\d+(?:\.\d+)?)$/.exec(tok);
  if (m) return Number(m[1]) * 4;
  m = /^(?:size|h|w|min-h|min-w)-\[(\d+(?:\.\d+)?)px\]$/.exec(tok);
  if (m) return Number(m[1]);
  m = /^(?:size|h|w|min-h|min-w)-\[(\d+(?:\.\d+)?)rem\]$/.exec(tok);
  if (m) return Number(m[1]) * 16;
  return null;
}

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/** Every quoted string in a source file, as a token list. */
function classStrings(src) {
  const out = [];
  for (const lit of stripComments(src).matchAll(/'([^'\n]*)'|"([^"\n]*)"/g)) {
    out.push((lit[1] ?? lit[2] ?? '').split(/\s+/).filter(Boolean));
  }
  return out;
}

/* Every (radius, smallest box in the SAME class string) pair in one directory.
 *
 * Same string, deliberately: a radius and a size written together are one element's
 * class list, and that is the only pairing provable without rendering. A radius whose
 * size lives elsewhere — a cva variant, or the generated component under a wrapper —
 * comes back with `box: null` and is covered by the named test below rather than being
 * silently waved through. */
function pairs(dir) {
  const steps = ladder();
  const out = [];
  for (const f of readdirSync(dir).filter((n) => /\.jsx?$/.test(n) && n !== 'index.js')) {
    for (const toks of classStrings(readFileSync(dir + f, 'utf8'))) {
      const rad = toks.find((t) => t in steps);
      if (!rad) continue;
      const boxes = toks.map(boxPx).filter((v) => v !== null && v > 0);
      out.push({ file: f, radius: rad, px: steps[rad], box: boxes.length ? Math.min(...boxes) : null });
    }
  }
  return out;
}

test('the scan works at all — this file must never pass vacuously', () => {
  /* THE GUARD ON THE GUARD, and it is here because the first draft of this file passed
   * while the bug it was written for was still on screen. A lint-style test has exactly
   * one serious failure mode: matching nothing. So before asserting anything about
   * boxes, prove the numbers came through and are the ladder we think they are. */
  const steps = ladder();
  for (const [util, px] of Object.entries(steps)) {
    assert.ok(px > 0 && px < 100, `${util} resolved to ${px}px, which cannot be right`);
  }
  assert.ok(
    steps['rounded-sm'] < steps['rounded-md']
      && steps['rounded-md'] < steps['rounded-lg']
      && steps['rounded-lg'] < steps['rounded-card'],
    `the ladder must ascend; got ${JSON.stringify(steps)}`,
  );
  const found = [...pairs(DIR), ...pairs(UI)];
  assert.ok(found.length >= 5, `only found ${found.length} radius/box pairs — the scan is broken`);
});

test('§6 — no ladder radius sits on a box too small to draw it', () => {
  const clamped = [...pairs(DIR), ...pairs(UI)]
    .filter((p) => p.box !== null && p.box <= p.px * 2 && !DELIBERATE_PILL.has(p.file))
    .map((p) => `${p.file}: ${p.radius} (${p.px}px) on a ${p.box}px box — clamps to ${p.box / 2}px`);

  assert.deepEqual(
    clamped, [],
    'a radius cannot draw on the box it is written on, so the element is a pill or a '
      + `circle whatever the number says:\n  ${clamped.join('\n  ')}\n\n`
      + 'Either the box is at least twice the radius, or the element takes a smaller '
      + 'step, or it goes in DELIBERATE_PILL with a reason. This is the check that was '
      + 'missing when the ladder moved on 2026-09-08 and every checkbox in the app '
      + 'became a circle.',
  );
});

test('§6 — the tick box stays visibly square, because it is the one that was lost', () => {
  /* NAMED, ON TOP OF THE DERIVED CHECK ABOVE, for two reasons. The general test can only
   * pair a radius with a size found in the same class string, and here the radius is in
   * our wrapper while the size is in the generated component. And a 16px tick box is the
   * smallest square in the app, so it is the first thing any future radius change
   * destroys — this failure should name the component and say why, not print numbers.
   *
   * IT ACCEPTS A LITERAL RADIUS as well as a ladder step, so moving this primitive to a
   * registry that hardcodes its corner does not retire the assertion. The question is
   * whether the corner DRAWS, never where the number came from.
   *
   * WHY A CIRCLE IS WRONG HERE rather than merely different: a round tick box reads as a
   * radio button, and a radio button means "pick exactly one". This control means "pick
   * any", and on the trade log it is what selects rows for a bulk action. */
  const steps = ladder();
  const wrapper = readFileSync(`${DIR}checkbox.jsx`, 'utf8');
  const generated = readFileSync(`${UI}checkbox.jsx`, 'utf8');

  // `cn()` is tailwind-merge, so a radius named in the wrapper REPLACES the generated
  // one. Look there first, then fall back to whatever the component ships with.
  const radiusOf = (src) => {
    for (const toks of classStrings(src)) {
      for (const t of toks) {
        if (t in steps) return { how: t, px: steps[t] };
        /* `(?:\d+\.?\d*|\.\d+)` and not `\d+(\.\d+)?`, because @coss writes
         * `rounded-[.25rem]` with no leading zero and the stricter pattern silently
         * matched nothing — which made this assertion throw "could not resolve"
         * rather than check anything. */
        const lit = /^rounded-\[(\d+\.?\d*|\.\d+)(px|rem)\]$/.exec(t);
        if (lit) return { how: t, px: Number(lit[1]) * (lit[2] === 'rem' ? 16 : 1) };
      }
    }
    return null;
  };
  const radius = radiusOf(wrapper) || radiusOf(generated);
  assert.ok(radius, 'could not resolve the tick box radius — check what checkbox is built on');

  // The box is the element the radius lands on: the class string carrying both.
  const root = classStrings(generated)
    .find((toks) => toks.some((t) => t.startsWith('rounded-')) && toks.some((t) => boxPx(t)));
  assert.ok(root, 'could not find the tick box root — it should carry a radius and a size');
  const side = Math.min(...root.map(boxPx).filter((v) => v !== null && v > 0));

  assert.ok(
    radius.px * 2 < side,
    `the tick box draws ${radius.how} (${radius.px}px) on a ${side}px box. Radius clamps `
      + `to half the box, so anything at or above ${side / 2}px is a CIRCLE. It was `
      + 'approved as a rounded square on 2026-09-07 and became a circle on 09-08 when '
      + '--r-sm moved 6 -> 8. A round tick box reads as a radio button — "pick one" '
      + 'instead of "pick any" — and on the trade log it is what drives bulk actions.',
  );
});

test('the fixed bridge literals are still fixed, because that is what contained the damage', () => {
  /* `ab7d518` moved the ladder and deliberately did NOT move
   * `--radius-xl/2xl/3xl/4xl` — the numbers generated components ask for. That single
   * decision is why the move touched nine files instead of thirty-six: badge, input,
   * select, tabs, skeleton, switch, progress, menu, modal and the rest sit on a fixed
   * literal and did not budge.
   *
   * If someone later "tidies" these onto the ladder to make the scale look consistent,
   * every control in the app re-rounds at once. §6 trap 2 and §25 both say they are
   * deliberately decoupled; this is where a tidy-up finds out. */
  for (const name of ['xl', '2xl', '3xl']) {
    const decl = `--radius-${name}:`;
    const line = bridgeCss.split('\n').find((l) => l.includes(decl));
    assert.ok(line, `--radius-${name} must be defined in bridge.css`);
    assert.ok(
      !line.slice(line.indexOf(decl) + decl.length).includes('var(--r-'),
      `--radius-${name} must stay a FIXED literal rather than tracking --r-*. It is what `
        + 'generated components ask for, and pointing it at the ladder re-rounds every '
        + 'control in the app the next time the ladder moves (§6 trap 2, §25).',
    );
  }
});
