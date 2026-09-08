import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { appCss } from './helpers/app-css.js';
// Guards the Phase 0 design-foundation invariant: the BRAND is blue, and
// green/red are reserved for trade OUTCOMES. If a future edit re-conflates
// them (e.g. makes --accent green again, or colors a .win with --accent),
// these tests fail before it ships.
const css = appCss;
const themeJs = readFileSync(
  fileURLToPath(new URL('../frontend/src/lib/theme.js', import.meta.url)),
  'utf8',
);
const buttonJsx = readFileSync(
  fileURLToPath(new URL('../frontend/src/components/primitives/button.jsx', import.meta.url)),
  'utf8',
);
/* COMMENTS STRIPPED, because these files argue with themselves on purpose: modal.jsx
 * quotes the opaque ring it replaced, in full, so a reader knows why it is not that any
 * more. A \`doesNotMatch\` over the raw source reads that history as the current value. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const modalJsx = code(readFileSync(
  fileURLToPath(new URL('../frontend/src/components/primitives/modal.jsx', import.meta.url)),
  'utf8',
));
const menuJsx = code(readFileSync(
  fileURLToPath(new URL('../frontend/src/components/primitives/menu.jsx', import.meta.url)),
  'utf8',
));
const popoverJsx = code(readFileSync(
  fileURLToPath(new URL('../frontend/src/components/primitives/popover.jsx', import.meta.url)),
  'utf8',
));
const selectJsx = code(readFileSync(
  fileURLToPath(new URL('../frontend/src/components/primitives/select.jsx', import.meta.url)),
  'utf8',
));

// Pull the :root block so we assert against declarations, not usages.
const root = css.slice(css.indexOf(':root'), css.indexOf('}', css.indexOf(':root')) + 1);

test('brand accent is the blue family, not green', () => {
  // The invariant is the FAMILY, not a literal hex: foundation values come from
  // the approved preset and can be re-pointed by a preset amendment. What may
  // never change is that the brand is a blue primitive and never green.
  assert.match(root, /--accent:\s*var\(--blue-\d00\)/);
  const blue = root.match(/--blue-500:\s*(#[0-9a-f]{6})/i);
  assert.ok(blue, '--blue-500 must exist as a primitive');
  const [, r, g, b] = blue[1].match(/#(..)(..)(..)/).map((x, i) => (i ? parseInt(x, 16) : x));
  assert.ok(b > r && b > g, `--blue-500 (${blue[1]}) must actually be blue-dominant`);
  // The old green brand color must be gone from the token layer.
  assert.doesNotMatch(root, /--accent:\s*#39d98a/i);
});

test('outcome + accent tokens exist and are the right hues', () => {
  /* WHAT THIS USED TO PIN: that --profit and --loss pointed at the --green-500 /
   * --red-500 PRIMITIVES. Those primitives are gone (Rhea foundation, 2026-08-29):
   * the outcome roles hold their hues directly and the raw green/red/amber scales
   * they aliased were deleted, because a primitive with exactly one consumer is a
   * second name for the same fact.
   *
   * So this asserts the HUE rather than the indirection, which is what the test was
   * ever really for — green must be green and red must be red, however it is spelled.
   * That also survives the next palette move without needing a rewrite. */
  const hue = (name) => {
    const m = root.match(new RegExp(`(?<![\\w-])--${name}\\s*:\\s*(#[0-9a-f]{6})`, 'i'));
    assert.ok(m, `--${name} must resolve to a literal hue in the token layer`);
    const [, r, g, b] = m[1].match(/#(..)(..)(..)/).map((x, i) => (i ? parseInt(x, 16) : x));
    return { r, g, b, hex: m[1] };
  };
  const profit = hue('profit');
  assert.ok(profit.g > profit.r && profit.g > profit.b, `--profit (${profit.hex}) must be green-dominant`);
  const loss = hue('loss');
  assert.ok(loss.r > loss.g && loss.r > loss.b, `--loss (${loss.hex}) must be red-dominant`);
  assert.match(root, /--ai:\s*var\(--purple-500\)/);    // purple = AI/insight

  /* THE SECOND GREEN AND THE SECOND RED ARE LOAD-BEARING, so they are pinned too.
   * The structural hue is drawn on the page; the bright one is drawn ON A TINT, where
   * the structural one does not carry. Collapsing them to one token is the change that
   * would quietly make a losing day cell unreadable. */
  for (const n of ['profit-bright', 'loss-bright']) {
    assert.ok(root.includes(`--${n}:`), `--${n} must exist — see COLOUR-INVENTORY §6`);
  }
});

test('the risk ramp carries no green at any fill', () => {
  /* A drawdown meter measures CONSUMPTION, so its bar runs yellow -> orange -> red and
   * never reaches green: used drawdown is never good news, only less bad. A green
   * drawdown bar would be the app congratulating a trader for surviving, and it is
   * also what §4 forbids — green and red are trade outcomes, never status. */
  const ramp = root.match(/--risk-ramp:\s*([^;]+);/);
  assert.ok(ramp, '--risk-ramp must exist');
  for (const step of ['--risk-1', '--risk-2', '--risk-3']) {
    assert.ok(ramp[1].includes(step), `the ramp must be built from ${step}, not from literals`);
  }
  const stops = ['risk-1', 'risk-2', 'risk-3'].map((n) => {
    const m = root.match(new RegExp(`(?<![\\w-])--${n}\\s*:\\s*(#[0-9a-f]{6}|var\\(--loss\\))`, 'i'));
    return m[1] === 'var(--loss)' ? root.match(/--loss:\s*(#[0-9a-f]{6})/i)[1] : m[1];
  });
  for (const hex of stops) {
    const [, r, g, b] = hex.match(/#(..)(..)(..)/).map((x, i) => (i ? parseInt(x, 16) : x));
    assert.ok(!(g > r && g > b), `risk ramp stop ${hex} is green-dominant — the ramp must never read as "good"`);
  }
});

test('foundation token scales are defined', () => {
  for (const t of ['--r-md', '--s-4', '--sh-2', '--font-sans', '--font-mono', '--ease', '--surface-2', '--text-3']) {
    assert.ok(root.includes(t + ':'), `missing token ${t}`);
  }
});

test('no .win/profit rule is colored with the blue brand accent', () => {
  // Every line that styles a winning/profit element must NOT reference --accent.
  const offenders = css
    .split('\n')
    .filter((l) => /\.win\b|\bprofit\b/i.test(l) && /var\(--accent\b/.test(l));
  assert.deepEqual(offenders, [], `profit rules must use --profit, not --accent:\n${offenders.join('\n')}`);
});

test('theme.js JS fallbacks match the CSS tokens (chart/canvas parity)', () => {
  // Canvas and chart code cannot read var(), so theme.js keeps literal fallbacks
  // for non-DOM contexts. Their whole job is to AGREE with tokens.css, so this
  // resolves both sides and compares them rather than pinning a hex that a preset
  // amendment is allowed to change.
  const resolve = (name) => {
    const raw = root.match(new RegExp(`(?<![\\w-])--${name}\\s*:\\s*([^;]+);`));
    if (!raw) return null;
    const v = raw[1].trim();
    const ref = v.match(/^var\(--([\w-]+)\)$/);
    return ref ? resolve(ref[1]) : v;
  };
  for (const name of ['accent', 'accent-on-surface', 'profit', 'loss']) {
    const css = resolve(name);
    const js = themeJs.match(new RegExp(`'--${name}':\\s*'([^']+)'`));
    assert.ok(css, `--${name} must exist in the token layer`);
    assert.ok(js, `theme.js must carry a fallback for --${name}`);
    assert.equal(js[1].toLowerCase(), css.toLowerCase(),
      `theme.js fallback for --${name} has drifted from tokens.css`);
  }
});

/* ===== §17 / §4-as-amended — system-message colour, ruled 2026-09-06 =====
 *
 * A system message may colour its GLYPH and a 1px EDGE. It may not colour its words,
 * it may not wash its surface beyond a trace, and nothing inside a DATA surface may
 * use status colour at all. These tests are what closes §17 from DECIDED to LOCKED
 * (§21: a decision and its test land together).
 */

const alertJsx = readFileSync(
  fileURLToPath(new URL('../frontend/src/components/ui/alert.jsx', import.meta.url)),
  'utf8',
);
// bridge.css is the shadcn-token seam and is NOT part of appCss, which is the token
// layer only. The destructive mapping lives there, so read it directly.
const bridgeCss = readFileSync(
  fileURLToPath(new URL('../frontend/src/styles/bridge.css', import.meta.url)),
  'utf8',
);

test('§17: the success and info tones resolve at all', () => {
  // They were deliberately absent while §4 banned status colour outright, and the
  // alert variants that used them rendered an unstyled box, SILENTLY. That is the
  // failure mode this test exists to prevent recurring.
  for (const name of ['success', 'info']) {
    assert.match(
      root,
      new RegExp(`(?<![\w-])--${name}\s*:`),
      `--${name} must be declared, or the alert's "${name}" tone renders nothing`,
    );
  }
});

test('§17: success is THE green, not a second one', () => {
  // The licence is narrow precisely because it spends an EXISTING hue. A separate
  // emerald for status would be a new colour, a new preset ID and a §21 sign-off —
  // which is what the CLI's default `shadcn add @coss/alert` tried to do once.
  assert.match(root, /--success:\s*var\(--profit\)/);
});

test('§17: destructive is a red, and NOT the money red', () => {
  /* Three rulings landed on this in one day, so pin the INVARIANT rather than the
   * mapping: red serves BOTH a losing trade and a dangerous action, and the two take
   * different SHADES of it — `--loss` for a figure, a lighter red for a glyph or a
   * label. `--destructive` carries preset b2qLMFPP6's red-400, so a generated component
   * previews truthfully against the registry.
   *
   * What must not happen: destructive drifting to a non-red (the first ruling, since
   * reversed), or collapsing back onto `--loss` so a Delete button and a losing P&L
   * figure become the same colour. */
  assert.match(bridgeCss, /--color-destructive:\s*var\(--destructive\)/);

  const dm = root.match(/(?<![\w-])--destructive\s*:\s*(#[0-9a-f]{6})/i);
  assert.ok(dm, '--destructive must resolve to a literal hue in the token layer');
  const [dr, dg, db] = dm[1].match(/#(..)(..)(..)/).slice(1).map((x) => parseInt(x, 16));
  assert.ok(dr > dg && dr > db, `--destructive (${dm[1]}) must actually be red-dominant`);

  const lm = root.match(/(?<![\w-])--loss\s*:\s*(#[0-9a-f]{6})/i);
  assert.ok(lm, '--loss must exist');
  assert.notEqual(
    dm[1].toLowerCase(), lm[1].toLowerCase(),
    'a Delete button and a losing P&L figure must not be the same red',
  );
});

test('§17: the alert spends colour on edge and glyph, never on its words', () => {
  // This is the whole rule, asserted against the built component rather than trusted.
  for (const tone of ['destructive', 'success', 'info', 'warning']) {
    const variant = alertJsx.match(new RegExp(`"[^"]*\b(?:border|bg|text)-${tone}[^"]*"`));
    if (!variant) continue;
    const decl = variant[0];
    // A glyph may take the tone at full strength...
    // ...but the surface may only ever carry a TRACE of it (§17 sets 4% as the ceiling).
    const bg = decl.match(new RegExp(`bg-${tone}\/(\d+)`));
    if (bg) {
      assert.ok(
        Number(bg[1]) <= 8,
        `alert "${tone}" washes its surface at ${bg[1]}% — §17 caps a status fill at a trace`,
      );
    }
    // ...and the body text must never be tinted: that is the half of §4 still intact.
    assert.doesNotMatch(
      decl,
      new RegExp(`(?<!\[&>svg\]:)text-${tone}(?![\w-])`),
      `alert "${tone}" tints its own text — §17 allows the glyph and the edge only`,
    );
  }
});

/* ===== The surface ramp — taken from the dashboard mockup, 2026-09-07 =====
 *
 * These moved twice in one day. First widened to shadcn preset b2qLMFPP6's spacing;
 * then replaced by the values in `PropVexis Dashboard Zinc.dc.html`, which the owner
 * handed over as the target. The mockup is the authority now.
 *
 * The mockup is DARKER than the preset pass it replaced — card #111114 against
 * #131316 — and it separates hover from selected again after the preset had collapsed
 * them. Both are deliberate.
 *
 * These pin INVARIANTS, not literals, so the next palette move is free.
 */

function resolveToken(name, depth = 0) {
  if (depth > 10) return null;
  const m = root.match(new RegExp(`(?<![\w-])--${name}\s*:\s*([^;]+);`));
  if (!m) return null;
  const v = m[1].trim();
  const ref = v.match(/^var\(\s*--([\w-]+)\s*\)$/);
  return ref ? resolveToken(ref[1], depth + 1) : v;
}

// Near-neutral greys, so the red channel orders them as luminance would.
function depthOf(name) {
  const v = resolveToken(name);
  assert.ok(v, `--${name} must be declared`);
  const hex = v.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  assert.ok(hex, `--${name} must be an opaque hex to sit on a ramp (got ${v})`);
  return parseInt(hex[1], 16);
}

function assertClimbs(order, what) {
  for (let i = 1; i < order.length; i += 1) {
    const below = depthOf(order[i - 1]);
    const above = depthOf(order[i]);
    assert.ok(
      above > below,
      `${what}: --${order[i]} (${above}) must sit above --${order[i - 1]} (${below})`,
    );
  }
}

test('the surface ramp climbs — no depth sits below the one beneath it', () => {
  /* Order is the DESIGN: a card sits on the page, a special card sits above the others,
   * a row sits on a card, an overlay above that. An inverted pair is a bug you see
   * rather than read. This caught a real one when the ramp was lifted in the middle.
   *
   * NOTE the mockup puts --surface-raised BELOW --row-bg (#131316 under #141417). That
   * looked wrong until you see what they are: "raised" is one special CARD sitting on
   * the page, "row" is a strip inside an ordinary card. They are not rungs of one
   * ladder, and the mockup is consistent about both. */
  assertClimbs(
    ['bg', 'rail-bg', 'surface-sunken', 'surface', 'surface-raised', 'row-bg',
      'control-bg', 'surface-2', 'control-bg-strong', 'surface-hover', 'overlay-hover'],
    'surface ramp',
  );
});

test('the border ramp climbs too, in five deliberate weights', () => {
  /* THE EARLIER PASS COLLAPSED ALL OF THESE INTO ONE TRANSLUCENT WHITE, and that is why
   * it was reverted: a single alpha produces one edge weight that gets STRONGER as the
   * surface under it lightens, which is the opposite of what the mockup wants. A divider
   * inside a card must stay quieter than the card's own edge, a control's edge louder
   * than that, a selected chip's louder again. Six roles, six values, ascending. */
  assertClimbs(
    ['line-inset', 'line', 'line-control', 'line-strong', 'line-chip', 'line-selected'],
    'border ramp',
  );
});

test("a control's edge is CONTEXTUAL — it keeps its contrast on a floating panel", () => {
  /* THE SEVENTH card-vs-overlay bug, and the first one caught by comparing our modal
   * with the preset's own rather than by using the app.
   *
   * `--line-control` (#252528) is tuned to a CARD exactly the way `--line` is: +20 over
   * #111114, which is where it reads. `button.jsx` wrote that token as a LITERAL to stop
   * an outline button drawing a card's edge — correct in intent, but a literal cannot
   * follow the surface, so on a #18181b panel the same edge is +13 and the Cancel button
   * in a dialog receded into the dialog. `[data-overlay-surface]` had already fixed the
   * same button's HOVER contextually on the same day; only the border missed the memo.
   *
   * THE INVARIANT IS THE CONTRAST, NOT THE HEX. Whatever the two values become, an
   * outline control must separate from a floating panel by at least as much as it
   * separates from a card — otherwise the control is quieter inside the surface that is
   * meant to be carrying it, which is the bug in one sentence. */
  /* THE RULE, not the four comments that name it — anchored at column 0, because
     `indexOf` found the mention inside :root's own comment and happily read :root's
     declarations as the overlay's. That made the first run of this test pass the wrong
     value and fail for the right reason, which is the only reason it was noticed. */
  const block = css.match(/^\[data-overlay-surface\]\s*\{([^}]*)\}/m);
  assert.ok(block, 'the overlay context block must exist');
  const overlay = block[1];

  const overlayRef = overlay.match(/--chrome-line-control:\s*var\(\s*--([\w-]+)\s*\)/);
  assert.ok(overlayRef, 'a floating panel must give --chrome-line-control its own value');
  assert.match(root, /--chrome-line-control:\s*var\(--line-control\)/,
    'on a card the job resolves to the ramp step §4 assigns a pill control');

  const onCard = depthOf('line-control') - depthOf('surface');
  const onPanel = depthOf(overlayRef[1]) - depthOf('surface-2');
  assert.ok(
    onPanel >= onCard,
    `an outline control's edge is +${onCard} on a card but only +${onPanel} on a panel `
    + '— it must not get quieter on the louder surface',
  );

  /* AND THE CONSUMER, because the token only helps if the component asks for it. A
   * literal --line-control here is the exact regression this test is named for. */
  assert.match(buttonJsx, /const OUTLINE_EDGE = 'border-\[var\(--chrome-line-control\)\]'/,
    "the outline variant's edge must come from the contextual token");
  assert.doesNotMatch(buttonJsx, /const OUTLINE_EDGE = 'border-\[var\(--line-control\)\]'/,
    'a literal ramp step cannot follow the surface — that is what broke it');
});

test('an edge is opaque where we own the ground, alpha where we do not', () => {
  /* §4's exception, and the ONLY one. The six-weight ramp is opaque because every step
   * is tuned against a surface we control. A modal's outer ring is not: `ring-1` is an
   * OUTSET box-shadow, so it lands on the blurred backdrop, over whatever the page is
   * showing. An opaque grey there is one weight everywhere — too heavy over a dark page,
   * too light over a bright one — and that is the whole visible difference between our
   * dialog and the preset's when they are set side by side.
   *
   * `--overlay-line` was COMPUTED from this value (white/10 over #18181b) and frozen.
   * This is the same edge, left to composite. */
  const detached = resolveToken('detached-line');
  assert.ok(detached, '--detached-line must be declared');
  const alpha = detached.match(/^rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([\d.]+)\s*\)$/);
  assert.ok(alpha, `--detached-line must stay a white alpha to composite at all (got \)`);
  assert.ok(Number(alpha[1]) > 0 && Number(alpha[1]) < 0.2,
    'a detached edge lightens what is behind it; at full strength it is a border again');

  assert.match(modalJsx, /ring-1 ring-\[var\(--detached-line\)\]/,
    'the modal shell must draw its outer ring with the alpha, not a frozen grey');
  assert.doesNotMatch(modalJsx, /ring-border|ring-\[var\(--overlay-line\)\]/,
    'an opaque ring cannot respond to the page behind it — that is what this replaced');

  /* THE RULE IS BY CONSTRUCTION, NOT BY COMPONENT, and these two assertions replaced a
   * pair that had it exactly backwards — they required the SUBMENU to carry
   * `ring-[var(--overlay-line)]` on the reasoning that a menu "owns its ground". It does
   * not: `MenuContent` carries no edge override at all, so the parent panel wears the
   * generated `ring-foreground/10`, and the submenu's opaque #2f2f33 sat about fourteen
   * units brighter than the panel it hung off — the mismatch the override was written to
   * prevent. A ring is OUTSET; whether the thing floats is not the question.
   *
   * So no menu panel may pin an opaque edge. What they must NOT do is reintroduce one. */
  assert.doesNotMatch(menuJsx, /ring-\[var\(--overlay-line\)\]/,
    'a menu panel draws an OUTSET ring — an opaque edge there cannot follow the page behind it');
  assert.doesNotMatch(popoverJsx, /ring-\[var\(--overlay-line\)\]/,
    'same for the popover — it is the same construction');

  /* AND THE ONE THAT LEGITIMATELY STAYS OPAQUE. The select popup draws a `border`, not a
   * ring, in the generated component and in ours — a border sits ON the element and knows
   * its ground, so the contextual token is right there and the ramp still applies. If this
   * ever becomes a ring, it joins the alpha side of the table. */
  assert.match(selectJsx, /border border-border/,
    'the select popup is border-drawn, so it keeps the contextual edge — §4 decides by construction');
});

test('the ramp is wide enough to see — page to overlay clears 12 steps', () => {
  // The original complaint, as a number: page->card->overlay used to climb +7 then +3.
  assert.ok(
    depthOf('surface') - depthOf('bg') >= 6,
    'a card must separate from the page it sits on',
  );
  assert.ok(
    depthOf('control-bg') - depthOf('bg') >= 12,
    'an overlay panel must separate from the page by more than a rounding error',
  );
});

test('hover and selected are separate values again', () => {
  /* The preset pass collapsed them onto one #27272a. The mockup separates them —
   * hover #1c1c1f, selected #1e1e21 — and that is a real distinction on screen here in
   * a way the ORIGINAL two (#1a1a1e and #1c1c21, two units apart) was not. */
  assert.notEqual(resolveToken('surface-hover'), resolveToken('sel-bg'));
  assert.ok(
    depthOf('sel-bg') > depthOf('surface-hover'),
    'a selected fill must read stronger than a passing hover',
  );
});

test('KNOWN AND ACCEPTED: the card edge and the hover fill are one unit apart', () => {
  /* This is the bug that started the whole colour pass — `--line` and `--surface-hover`
   * one unit apart, so a hovered row took the colour of the border around it. The
   * translucent-edge pass fixed it by construction. The mockup brings it back, and the
   * owner chose the mockup, so it is DOCUMENTED rather than prevented.
   *
   * The mockup survives it by COMPOSITION, not by distance: the rows that hover (event,
   * trade, alert) carry no border, and the surfaces that carry a border (cards, chips)
   * change their BORDER on hover rather than their fill. Put a --surface-hover fill
   * inside a --line border and it will look wrong; nothing here will stop you.
   *
   * This test exists to make that trade visible in CI rather than to enforce it — if
   * the gap ever widens, delete it and go back to asserting a real minimum. */
  const gap = Math.abs(depthOf('surface-hover') - depthOf('line'));
  assert.ok(gap <= 2, `the gap is now ${gap} — if that was deliberate, replace this test with a real minimum`);
});

test('an overlay separates from the page, and its rows separate from IT', () => {
  /* THE COMPLAINT THAT STARTED THE WHOLE COLOUR PASS, and until now nothing asserted it.
   * A dropdown barely separated from the page, and a hovered row barely separated from
   * the dropdown. Both had one cause: `--surface-2` was an alias for `--control-bg`, and
   * `--surface-hover` served a card and a panel at once. A pill control in the top bar
   * and a floating menu are not the same surface, and a row on a #111114 card and a row
   * on a #18181b panel cannot share one highlight.
   *
   * The owner's dashboard mockup could not settle either number: it contains no menu,
   * popover or dropdown at all. These two come from preset b2qLMFPP6. */
  assert.ok(
    depthOf('surface-2') - depthOf('bg') >= 12,
    'a floating panel must separate from the page it floats over',
  );
  assert.ok(
    depthOf('surface-2') > depthOf('surface'),
    'a floating panel must sit above the CARD it may open over, not just the page',
  );
  assert.ok(
    depthOf('overlay-hover') - depthOf('surface-2') >= 12,
    'a highlighted row must clearly separate from the panel holding it',
  );
  // And it must out-read the panel's own edge, or hovering paints the border colour.
  assert.ok(
    depthOf('overlay-hover') - depthOf('line') >= 8,
    'an overlay row highlight must not land on the border colour around it',
  );
});
