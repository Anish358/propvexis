import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bridgeCss, radiusScale, tokensCss } from './helpers/app-css.js';

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

/* RESOLVED, NOT PARSED (2026-09-09). This used to read `--r-sm: 8px` straight out of
 * tokens.css with `/^(\d+)px/`. Preset b2qLMFPO4 derives the whole scale from one base, so
 * no radius token holds a number any more — `--r-md` is `var(--radius-md)` is
 * `calc(var(--radius) * 0.8)`. The old regex would have matched NOTHING and this file would
 * have gone quiet while still reporting green, which is the exact failure its own header
 * warns about. `radiusScale()` in helpers/app-css.js does the arithmetic the browser does,
 * once, for this file and design-language.test.js both. */

/* THE FOUR UTILITY NAMES THAT FOLLOW OUR LADDER, and the reason `ab7d518` touched nine
 * files instead of thirty-six. `bridge.css` points these at our tokens;
 * `rounded-xl/2xl/3xl/4xl` are pinned to FIXED literals (14/16/24) because they are what
 * GENERATED components ask for, and that commit deliberately left them alone. A
 * component on a fixed literal did not move — and equally cannot regress when a token
 * does, which is why it is out of scope here rather than merely unchecked. */
const ladder = () => {
  const r = radiusScale();
  return {
    'rounded-sm': r.sm,
    'rounded-md': r.md,
    'rounded-lg': r.lg,
    'rounded-card': r.card,
  };
};

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
  /* THE VALUES ARE FRACTIONAL NOW and that is expected — 0.45rem x 0.6 is 4.32px. A
   * browser antialiases a radius, so it draws; what it is not is an integer, which is why
   * nothing in this file rounds or compares for equality. */
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

/* ── RESOLVING A RADIUS AGAINST A SIZE THAT LIVES SOMEWHERE ELSE ────────────────────
 *
 * THE HOLE THIS CLOSES (owner, 2026-09-09). `pairs()` above only pairs a radius with a
 * size found in the SAME class string, because that is the only pairing provable without
 * rendering. Every generated control breaks that: the radius sits in a `cva()` BASE string
 * and the height sits in one of its `size` variants, so the two are never written together
 * and the check silently found nothing. The Clear button on the filter strip had to be
 * measured BY HAND to answer "does 10px draw on a 28px box?" — which is exactly the review
 * this file exists to remove.
 *
 * A cva call is structured enough to resolve honestly:
 *
 *     cva("… rounded-2xl …", { variants: { size: { sm: "h-7 …", lg: "h-10 …" } } })
 *
 * The base applies to EVERY size, so the real question is the base radius against the
 * SMALLEST size — and that is a pair worth asserting.
 *
 * AND IT FOLLOWS THE WRAPPER. `cn()` is tailwind-merge, so a radius named in
 * `primitives/X.jsx` REPLACES the generated base for every size. That is the case that
 * actually bit: `button.jsx` sets `rounded-md` for `variant="chrome"` while the heights
 * stay in `ui/button.jsx`. So when a wrapper of the same name declares a ladder radius,
 * that radius is what gets checked against the generated sizes.
 */

/** Brace-match from `size:` to the end of its object, so a bounded character scan cannot
 *  read past it into the next variant group. */
function sizeVariantStrings(src) {
  const at = src.indexOf('size:');
  if (at === -1) return [];
  const open = src.indexOf('{', at);
  if (open === -1) return [];
  let depth = 0;
  let end = -1;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) return [];
  return [...src.slice(open, end).matchAll(/"([^"\n]*)"|'([^'\n]*)'/g)]
    .map((m) => (m[1] ?? m[2] ?? '').split(/\s+/).filter(Boolean));
}

/** The cva base string's tokens, which apply to every variant. */
function cvaBase(src) {
  const m = /cva\(\s*"([^"]*)"/.exec(src) || /cva\(\s*'([^']*)'/.exec(src);
  return m ? m[1].split(/\s+/).filter(Boolean) : null;
}

/* Every (radius, smallest size-variant box) pair across the cva boundary — and across the
 * wrapper boundary too, where a wrapper of the same name replaces the radius. */
function cvaPairs() {
  const steps = ladder();
  const out = [];
  for (const f of readdirSync(UI).filter((n) => /\.jsx?$/.test(n))) {
    const src = readFileSync(UI + f, 'utf8');
    const base = cvaBase(stripComments(src));
    if (!base) continue;
    const sizes = sizeVariantStrings(stripComments(src));
    if (!sizes.length) continue;

    /* The smallest box any size variant declares. `h-*` and `size-*` both count: a square
     * icon button's constraint is the same number in both axes. */
    const boxes = sizes.flatMap((toks) => toks.map(boxPx)).filter((v) => v !== null && v > 0);
    if (!boxes.length) continue;
    const box = Math.min(...boxes);

    /* WHICH RADIUS ACTUALLY LANDS. The wrapper's wins where it names one, because cn() is
     * tailwind-merge. Collect every ladder radius the wrapper can apply, not just the
     * first — a wrapper with one radius per variant would otherwise be half-checked. */
    const radii = [];
    const wrapper = DIR + f;
    if (existsSync(wrapper)) {
      const w = readFileSync(wrapper, 'utf8');
      const importsIt = new RegExp(`@/components/ui/${f.replace(/\.jsx?$/, '')}`).test(w);
      if (importsIt) {
        for (const toks of classStrings(w)) {
          for (const t of toks) if (t in steps && !radii.some((r) => r.tok === t)) {
            radii.push({ tok: t, from: `primitives/${f}` });
          }
        }
      }
    }
    if (!radii.length) {
      const b = base.find((t) => t in steps);
      if (b) radii.push({ tok: b, from: `ui/${f}` });
    }

    for (const r of radii) {
      out.push({ file: r.from, sizeFrom: `ui/${f}`, radius: r.tok, px: steps[r.tok], box });
    }
  }
  return out;
}

test('§6 — a radius resolves against the size its cva variants declare', () => {
  /* THE GUARD ON THE GUARD, first: this test is worthless if the resolver finds nothing,
   * which is precisely the state the suite was in before it existed. */
  const found = cvaPairs();
  /* NAMED, NOT COUNTED, AND THE NAME CHANGED ON 2026-09-09 — twice, which is the story.
   *
   * The first draft asserted "at least 3 pairs" and failed at 2, which told me nothing:
   * only FOUR generated components declare size variants, and most sit on the fixed
   * `rounded-2xl` literals §6 exempts from the ladder. So a count is not coverage.
   *
   * It then named the BUTTON, because that was the case that motivated the resolver: the
   * radius came from the wrapper (`variant="chrome"` -> `rounded-md`) and the heights from
   * the generated cva. Hours later the owner ruled "everything like the preset, no
   * deliberately leaving anything different for radius", that override was deleted, and the
   * button left the ladder entirely — so the pair this test named stopped existing. That is
   * the RIGHT outcome and a failing guard was the wrong way to hear about it.
   *
   * So it names the toggle instead: the last generated component whose cva base still
   * carries a ladder step. If that goes too, the resolver has nothing left to resolve — and
   * the assertion below is what will then be doing the real work. */
  assert.ok(
    found.some((r) => r.sizeFrom === 'ui/toggle.jsx'),
    'the cva resolver no longer reaches the toggle, which is the last generated component '
      + 'with a ladder radius in its cva base. Either it moved onto a fixed preset literal '
      + '(fine — say so here and point this at whatever is left) or `cva(`/`size:` no longer '
      + 'look the way cvaBase() and sizeVariantStrings() expect (not fine).',
  );

  /* AND THE RULE THE OWNER ACTUALLY SET, which this resolver is now the only thing able to
   * check: a wrapper must not put OUR ladder radius on a generated component. Every
   * generated variant asks for the preset's own step, so overriding it is by definition
   * "deliberately leaving something different for radius" — the thing that was ruled out.
   *
   * This is the assertion that would have caught `variant="chrome"` sitting on `rounded-md`
   * while every other button variant wore the preset's 16px. It was invisible for two
   * months and the owner found it by reading a measurement table. */
  const overrides = found.filter((r) => r.file.startsWith('primitives/'));
  assert.deepEqual(
    overrides.map((r) => `${r.file} puts ${r.radius} on ${r.sizeFrom}`), [],
    'a wrapper is overriding a generated component\'s radius with one of our ladder steps. '
      + 'Owner, 2026-09-09: "Everything like the preset. No deliberately leaving anything '
      + 'different for radius." The generated component already asks for the preset\'s step '
      + '— delete the override rather than re-valuing it. If a deviation is genuinely '
      + 'wanted, it needs an owner decision and a §6 amendment, not a class in a wrapper.',
  );

  const clamped = found
    .filter((r) => r.box <= r.px * 2 && !DELIBERATE_PILL.has(r.file.split('/').pop()))
    .map((r) => `${r.file}: ${r.radius} (${r.px}px) on a ${r.box}px box from ${r.sizeFrom}`
      + ` — clamps to ${r.box / 2}px`);

  assert.deepEqual(
    clamped, [],
    'a radius cannot draw on the smallest size its component ships, so that size is a pill '
      + `whatever the number says:\n  ${clamped.join('\n  ')}\n\n`
      + 'This is the pairing `pairs()` cannot see — the radius is in the cva base (or in the '
      + 'wrapper) and the height is in a size variant. Either the smallest size grows, or it '
      + 'takes a step that draws, or the file goes in DELIBERATE_PILL with a reason.',
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

test('every rung derives from --radius, and nothing points back at --r-*', () => {
  /* THIS TEST REPLACED ITS OWN OPPOSITE, AND THAT IS WHY IT IS WORTH READING.
   *
   * It used to assert that `--radius-xl/2xl/3xl` stayed FIXED LITERALS, decoupled from our
   * ladder — because `ab7d518` moved the ladder and deliberately did not move them, and a
   * later "tidy-up" onto the ladder would have re-rounded every control at once.
   *
   * On 2026-09-09 that decoupling stopped existing. The owner adopted preset b2qLMFPO4
   * whole ("Everything like the preset"), so there is no second ladder to decouple FROM:
   * one base, seven multipliers, and `--r-*` are aliases onto the rungs. The old assertion
   * still PASSED after the change — it looked for `var(--r-` and the new expressions say
   * `var(--radius)` — which is a test agreeing with something it was written to forbid.
   * A stale test that enforces is worse than a stale comment, so it is replaced rather
   * than deleted.
   *
   * WHAT MATTERS NOW IS THE DIRECTION OF THE ARROW: --r-* -> --radius-* -> --radius. If a
   * rung is ever pointed back at `--r-*` the reference becomes CIRCULAR, every radius in
   * the app resolves to nothing, and nothing errors — corners simply go square. That is
   * the failure this now guards. */
  const RUNGS = ['sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'];
  for (const name of RUNGS) {
    const decl = `--radius-${name}:`;
    const line = bridgeCss.split('\n').find((l) => l.includes(decl));
    assert.ok(line, `--radius-${name} must be defined in bridge.css`);
    const value = line.slice(line.indexOf(decl) + decl.length);

    assert.ok(
      value.includes('var(--radius)'),
      `--radius-${name} no longer derives from --radius: "${value.trim()}". The preset ships `
        + 'a base and seven multipliers; flattening one to a literal works today and makes '
        + 'the next preset change seven edits again.',
    );
    assert.ok(
      !value.includes('var(--r-'),
      `--radius-${name} points at --r-${name}, which is CIRCULAR — --r-* are aliases onto `
        + 'these rungs now. A circular custom property resolves to nothing, silently, and '
        + 'every corner in the app goes square with no error anywhere.',
    );
  }

  /* AND THE BASE IS THE ONLY NUMBER. If a second radius literal appears in tokens.css the
   * scale has grown a parallel value, which is how the last ladder started. */
  const literals = [...tokensCss.matchAll(/^\s*--r[a-z0-9-]*:\s*([\d.]+)(px|rem)\s*;/gm)]
    .map((m) => m[0].trim())
    .filter((l) => !l.startsWith('--r-full'));
  assert.deepEqual(
    literals, ['--radius: 0.45rem;'],
    'tokens.css should hold exactly ONE radius number — the base — plus --r-full for pills. '
      + `Found: ${JSON.stringify(literals)}. Anything else is a step with a value of its own, `
      + 'which is the parallel ladder the 09-09 change removed.',
  );
});
