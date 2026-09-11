import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bridgeCss, tokensCss } from './helpers/app-css.js';

/* THE TWO WAYS A GENERATED COMPONENT SILENTLY ARRIVES WRONG IN THIS APP.
 *
 * Both are properties of OUR build rather than of any component, both have bitten
 * repeatedly, and both were being fixed one component at a time until 2026-09-09. This
 * file exists so neither is ever found by eye again.
 *
 * ── 1. WE DO NOT IMPORT TAILWIND'S PREFLIGHT ─────────────────────────────────────────
 *
 * `tailwind.css` says so and gives the reason: a global reset would visibly restyle every
 * legacy page. The cost is that a generated component which declares no background, no
 * border or no margin gets the USER-AGENT's value instead of zero. That has now happened
 * five times:
 *
 *   · anchors inside generated components took the UA's blue underline
 *   · `variant="ghost"` buttons painted `buttonface` — an opaque mid-grey slab
 *   · the rebuilt empty state drew a 3px white dashed box (`border-style` with no width)
 *   · Dialog's `h2`/`p` carried UA margins, so the gap under a title was 20px not 6px
 *   · the filter builder's search input painted a UA box over the middle of its own pill
 *
 * Every one looked like a design bug and none of them was. The fix is always the same
 * shape — a `:where(...[data-slot]...)` rule in `@layer base` — and the failure mode is
 * always the same too: it gets scoped to where it was FIRST SEEN rather than to where it
 * applies, and is then found again somewhere else. The border reset was widened for that
 * reason on 09-08; the background reset for the same reason on 09-09.
 *
 * ── 2. CHROME IS CONTEXTUAL, AND AN OVERLAY HAS TO SAY SO ────────────────────────────
 *
 * `--chrome-hover` and `--chrome-line` resolve to a CARD's values by default and to a
 * panel's only inside `[data-overlay-surface]`. Six bugs had that single cause, and the
 * seventh was found by the owner on 09-09 looking at an unwrapped Command. A generated
 * overlay that does not declare the attribute hovers to #1c1c1f on a #18181b panel — four
 * units of lift, which reads as "the hover is broken" and is invisible in review.
 */

const at = (p) => fileURLToPath(new URL(p, import.meta.url));
const PRIM = fileURLToPath(new URL('../frontend/src/components/primitives/', import.meta.url));

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/* Collapse whitespace so a multi-line selector matches the same as a one-line one — the
 * background reset is written across five lines for readability and must not become
 * unassertable because of it. */
const css = bridgeCss.replace(/\s+/g, ' ');

test('the scan works at all — this file must never pass vacuously', () => {
  /* THE GUARD ON THE GUARD. A lint-style test has one serious failure mode: matching
   * nothing. `radius-clamp.test.js` learned this the hard way, and its note is worth
   * repeating — a test that fails open is worse than no test. */
  assert.ok(css.length > 1000, 'bridge.css did not load');
  assert.ok(/@layer base \{/.test(css), 'bridge.css no longer declares a base layer');
  assert.ok(
    readdirSync(PRIM).length > 20,
    'the primitives directory did not load, so the overlay scan below proves nothing',
  );
});

test('the Preflight substitutes cover every generated form control, not just buttons', () => {
  /* Asserted per ELEMENT rather than as one string, so the selector can be reformatted or
   * reordered without breaking the test — and so a failure names the element that lost
   * its reset rather than "the selector changed". */
  for (const el of ['button', 'input', 'select', 'textarea']) {
    assert.ok(
      css.includes(`${el}[data-slot]`) && css.includes(`[data-slot] ${el}`),
      `the background reset no longer covers <${el}>. Without Preflight the UA sheet paints `
        + `its own control background, and a generated <${el}> that declares none gets it. `
        + 'Both forms are needed: the element may CARRY data-slot (a generated control) or '
        + 'merely sit inside one (a control the library renders itself, like cmdk\'s input).',
    );
  }
  assert.ok(
    /background-color: transparent/.test(bridgeCss),
    'the reset no longer sets a transparent background, so it is not doing its job',
  );
});

test('a reset can only REMOVE a browser default, never beat an author rule', () => {
  /* THE PROPERTY THAT MAKES THESE SAFE, and the reason they can be widened without fear.
   *
   * `:where()` keeps specificity at ZERO and `@layer base` loses to `@layer utilities`, so
   * a component's own `bg-input/50` still wins and this reaches only a control that
   * declares nothing. Widening the reset therefore cannot take a fill away from anything —
   * which is exactly the check that was made before widening it on 09-09.
   *
   * If either property is ever lost, these stop being resets and become opinions that
   * silently outrank the design system. */
  /* COMMENTS OUT FIRST, THEN WHITESPACE FLATTENED. These resets are explained at length —
   * the base layer is more prose than CSS — and the first draft of this scan matched a `}`
   * followed by a comment and called it an un-wrapped selector. The second draft then broke
   * on the background reset itself, which is written across five lines for readability. A
   * scan that only works on one-line rules is a scan that punishes formatting. */
  const flat = bridgeCss.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\s+/g, ' ');
  const open = flat.indexOf('@layer base {');
  assert.ok(open !== -1, 'bridge.css no longer declares a base layer');

  /* Walk the base block brace by brace so nesting cannot confuse it, collecting the text
   * that precedes each `{` — that text is the selector. */
  const selectors = [];
  let depth = 0;
  let buf = '';
  for (let i = open + '@layer base {'.length; i < flat.length; i += 1) {
    const ch = flat[i];
    if (ch === '{') {
      if (depth === 0) selectors.push(buf.trim());
      depth += 1;
      buf = '';
    } else if (ch === '}') {
      if (depth === 0) break; // end of @layer base
      depth -= 1;
      buf = '';
    } else {
      buf += ch;
    }
  }

  assert.ok(
    selectors.length >= 4,
    `expected the base-layer resets, found ${selectors.length} — the scan is broken`,
  );
  for (const sel of selectors) {
    assert.ok(
      sel.startsWith(':where('),
      `a rule in @layer base is not wrapped in :where() — "${sel.slice(0, 70)}". Without it `
        + 'the reset carries real specificity and can outrank a component or a legacy rule, '
        + 'which is the difference between removing a browser default and having an opinion.',
    );
  }
  assert.ok(
    /@layer legacy, theme, base, components, utilities;/.test(
      readFileSync(at('../frontend/src/tailwind.css'), 'utf8'),
    ),
    'the layer order changed. These resets are safe ONLY while `base` loses to `utilities` '
      + '— otherwise they start overriding the backgrounds components ask for.',
  );
});

test('every primitive that wraps a floating panel declares data-overlay-surface', () => {
  /* THE SEVENTH INSTANCE, TURNED INTO A TEST (owner, 2026-09-09).
   *
   * Six bugs had one cause — a token tuned for a card's ground used on an overlay's — and
   * the fix is one attribute that nothing forces you to remember. The owner found the
   * seventh by hovering an unwrapped Command on the Test page and noticing the highlight
   * barely moved. That is not a review anyone should have to do.
   *
   * DERIVED, NOT LISTED. A primitive is "a floating panel" if it paints the panel surface
   * (`bg-popover`) or wraps a generated component whose own popup does. Both are read out
   * of the file, so the set cannot go stale — a new overlay is caught the day it lands
   * rather than the day someone hovers it.
   *
   * TO ADD AN EXEMPTION you have to say why in EXEMPT below. There is exactly one. */
  const EXEMPT = {
    /* THE DRAWER, AND IT IS THE CASE THIS MAP WAS BUILT FOR (owner ruling, 2026-09-10).
     *
     * `sheet.jsx` wraps a generated overlay and is caught by `wrapsOverlay` above, which
     * is the scan working: it DOES float, it portals, it takes a scrim and it traps
     * focus. What it does not do is paint the floating-panel SURFACE. The owner ruled it
     * onto the CARD colour — 480px wide, full height, holding a card, twenty fields and
     * a paragraph, which is a place you go to read rather than a menu — so it declares
     * `bg-card`, and everything inside it must resolve chrome against a CARD because a
     * card is now what they are on.
     *
     * DECLARING THE ATTRIBUTE HERE WOULD BE THIS TEST'S OWN BUG, INVERTED. The failure it
     * exists to catch is a panel whose contents resolve against a card. This would be a
     * card whose contents resolve against a panel: --chrome-hover at #27272a over a
     * #111114 ground, an overlay's edge on a card's surface. Same fault, other direction,
     * and just as invisible.
     *
     * The distinction the attribute actually draws is COLOUR CONTEXT, not stacking, and
     * this is the one component in the library where the two answers to "is it an
     * overlay?" disagree. An overlay opened INSIDE the drawer is still a floating panel
     * and still declares the attribute in its own wrapper, so nothing below is affected.
     * See test/kit-drawer.test.js, which pins the ruling from the other side. */
    'sheet.jsx': 'ruled onto the CARD surface 2026-09-10 — it floats, but its contents sit '
      + 'on a card and must resolve chrome against one',
  };

  const offenders = [];
  for (const f of readdirSync(PRIM).filter((n) => /\.jsx?$/.test(n) && n !== 'index.js')) {
    const src = readFileSync(PRIM + f, 'utf8');
    const code = strip(src);
    // Does this primitive put something on the app's floating-panel surface?
    const paintsPanel = /\bbg-popover\b/.test(code);
    // …or wrap one of the generated components whose popup is a floating panel?
    const wrapsOverlay = /from '@\/components\/ui\/(dropdown-menu|popover|select|tooltip|command|sheet|combobox)'/.test(code);
    if (!paintsPanel && !wrapsOverlay) continue;
    if (EXEMPT[f]) continue;
    if (!/data-overlay-surface/.test(code)) offenders.push(f);
  }

  assert.deepEqual(
    offenders, [],
    'these primitives render a floating panel and do not declare `data-overlay-surface`:\n'
      + `  ${offenders.join('\n  ')}\n\n`
      + 'Inside one, --chrome-hover is #1c1c1f (tuned for a CARD at #111114). A panel is '
      + '#18181b, so that is four units of lift and the hover all but disappears; the edge '
      + 'goes the same way. Add the attribute to the popup element — that is the whole fix '
      + '— or put the file in EXEMPT with a reason.',
  );
});

test('the contextual rule the attribute triggers still exists', () => {
  /* THE OTHER HALF. The test above is worthless if the rule it depends on is deleted:
   * every overlay would carry a correct attribute that resolves to nothing. */
  assert.ok(
    /\[data-overlay-surface\]\s*\{/.test(tokensCss),
    'the [data-overlay-surface] block is gone from tokens.css, so declaring the attribute '
      + 'now does nothing at all and every overlay is back on a card\'s chrome.',
  );
  /* --chrome-label joined these on 2026-09-09: a group heading inside a panel takes the
   * preset's #a1a1aa, where a card's label stays --text-2. Three components had each
   * hard-coded that by hand before it became a token. */
  for (const tok of ['--chrome-hover', '--chrome-line', '--chrome-label']) {
    assert.ok(
      new RegExp(`\\[data-overlay-surface\\][\\s\\S]{0,300}${tok}`).test(tokensCss),
      `${tok} is no longer re-pointed inside [data-overlay-surface], so that half of the `
        + 'card-vs-overlay fix is gone.',
    );
  }
});
