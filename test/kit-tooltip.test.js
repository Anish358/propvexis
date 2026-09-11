import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bridgeCss, radiusScale, tokensCss } from './helpers/app-css.js';

/* THE KIT'S TOOLTIP — Cycle 00, piece 2.
 *
 * `ui/tooltip.jsx` had been installed since `sidebar` pulled it in and had never been
 * wrapped, exported or looked at. This pins what the wrapper does to it, because every
 * item is invisible until someone hovers the right thing on the right page:
 *
 *   1. the surface, which the bridge INVERTS relative to what the registry meant
 *   2. the corner, which the wrapper deliberately does NOT touch (owner, 09-09)
 *   3. the delay, which the registry zeroed and which lives on a part the Root is not
 *   4. the panel attribute, without which the edge resolves against a card
 *
 * TWO OF THESE ARE OWNER RULINGS RATHER THAN RULES, AND THEY ARE PINNED THE SAME WAY.
 * On 2026-09-09 the owner kept our surface and took the registry's corner, and cut the
 * delay to 100ms. Both reversed something this file previously asserted the other way.
 * A test that encodes a decision has to move WITH the decision or it enforces a stale
 * one — which this codebase has already been bitten by once (see the note in
 * `primitives-status.test.js` about the tone check that outlived its reason).
 *
 * WHAT IS DELIBERATELY NOT HERE. Whether the tooltip LOOKS right is the owner's, on the
 * Test page; `primitives-status.test.js` holds the `@design unreviewed` line until they
 * sign it. What is asserted is that the rulings above cannot be undone by accident.
 */

const at = (p) => fileURLToPath(new URL(p, import.meta.url));
const src = readFileSync(at('../frontend/src/components/primitives/tooltip.jsx'), 'utf8');
const generated = readFileSync(at('../frontend/src/components/ui/tooltip.jsx'), 'utf8');
const barrel = readFileSync(at('../frontend/src/components/primitives/index.js'), 'utf8');
const kit = readFileSync(at('../frontend/src/features/dev/KitTooltip.jsx'), 'utf8');

/* Comments discuss what they explain — this wrapper's header names `bg-foreground`,
 * `rounded-xl` and `delay = 0` at length while applying none of them — so every scan
 * below reads code only. Same reason `primitives-status.test.js` strips them. */
const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

test('the tooltip is the registry component, wrapped — and ui/ is not edited in place', () => {
  assert.match(
    code, /from '@\/components\/ui\/tooltip'/,
    'DESIGN-LANGUAGE §1 step 2: never hand-build a tooltip. If this import is gone the '
      + 'component has been forked and the argument for it must be in the file.',
  );
  /* THE GUARD ON THE OTHER DIRECTION, and it is the one that matters here. The arrow's
   * colour and the Portal's container are both baked into the generated file, and the
   * tempting fix for each is to reach in and change it. The standing rule is that a
   * difference goes in the WRAPPER; this asserts the generated file still says what the
   * registry shipped, so a silent edit there cannot pass as a wrapper decision. */
  assert.match(
    generated, /bg-foreground/,
    'ui/tooltip.jsx no longer carries the registry\'s own `bg-foreground`. A generated '
      + 'component is not edited in place — the difference belongs in primitives/tooltip.jsx, '
      + 'and if the registry itself changed, say so and re-install rather than patching.',
  );
});

test('§25 — the inverted surface is CANCELLED, because our bridge means the opposite by it', () => {
  /* THE FINDING THIS PIECE EXISTS FOR. shadcn draws a tooltip as the negative of the
   * page: `bg-foreground text-background`. Our bridge points --color-foreground at --text
   * and --color-background at --bg, so on this dark app those same two utilities produce
   * a near-white slab — the only white surface in the product. Asserted from the BRIDGE
   * rather than from a belief about it, so a remapping there fails here first. */
  const mapped = (name) => {
    const m = new RegExp(`--color-${name}:\\s*var\\((--[a-z0-9-]+)\\)`).exec(bridgeCss);
    assert.ok(m, `--color-${name} is not mapped in bridge.css`);
    return m[1];
  };
  assert.equal(
    mapped('foreground'), '--text',
    'the premise of this wrapper is that `bg-foreground` paints TEXT colour here. If the '
      + 'bridge no longer says so, re-read §25 and the tooltip\'s header before changing it.',
  );
  assert.equal(mapped('background'), '--bg');

  assert.match(
    code, /bg-popover/,
    'the wrapper must repaint the popup onto the app\'s floating-panel surface. tokens.css '
      + 'calls --surface-2 "EVERY FLOATING PANEL — menu, popover, select, combobox", §4 says '
      + 'an overlay is not a card, and the owner ruled the same way on 2026-09-09 '
      + '("keep our color").',
  );
  assert.ok(
    /--color-popover:\s*var\(--surface-2\)/.test(bridgeCss),
    '`bg-popover` is only the panel surface while the bridge points --color-popover at '
      + '--surface-2. It does not, so the tooltip is now painting something else.',
  );
});

test('§4 — the popup declares itself an overlay, or its edge resolves against a card', () => {
  assert.match(
    code, /data-overlay-surface/,
    'the SEVENTH instance of this fault was found on 2026-09-07 and the fix was one '
      + 'attribute. --color-border is contextual (tokens.css, "CHROME IS CONTEXTUAL"), so '
      + 'without this the tooltip\'s edge is a CARD\'s edge and disappears on a panel.',
  );
  assert.ok(
    /\[data-overlay-surface\]\s*\{/.test(tokensCss),
    'the contextual rule this attribute triggers is gone from tokens.css, so declaring it '
      + 'now does nothing at all.',
  );
});

test('§6 — the corner is the REGISTRY\'s, and the way to keep it there is to not restate it', () => {
  /* THIS TEST USED TO ASSERT THE OPPOSITE, AND THE REVERSAL IS THE POINT.
   *
   * The wrapper first forced `rounded-md` (10px), on the grounds that the generated
   * `rounded-xl` cannot draw on a box this small. The arithmetic was right and is checked
   * below — it is just no longer an objection. The owner looked at both and asked for the
   * registry's corner (2026-09-09: "I want corners like registry"), which makes the
   * tooltip a DELIBERATE PILL: measured, shown, and chosen, unlike the checkbox that
   * turned into a circle nobody picked and went unnoticed for a day.
   *
   * SO WHAT IS PINNED IS THE MECHANISM, NOT THE NUMBER. "Like the registry" only stays
   * true if we never write the value down ourselves — a wrapper that restates 14px agrees
   * with the registry until the day the registry changes, and then silently does not. */
  assert.doesNotMatch(
    code, /rounded-/,
    'the wrapper is declaring a radius. It must declare NONE: the owner asked for the '
      + "registry's corner, and the only way to guarantee that is to let the generated "
      + '`rounded-xl` through untouched. Restating the value re-opens the drift this '
      + 'ruling closed.',
  );
  assert.match(
    generated, /rounded-xl/,
    'the generated tooltip no longer asks for `rounded-xl`, so "the registry\'s corner" now '
      + 'means something different from what the owner approved. Show them the new one '
      + 'rather than pinning the old value here.',
  );

  /* THE CLAMP, kept as a live measurement so the CONSEQUENCE of the ruling cannot rot —
   * and on 2026-09-09 the consequence CHANGED while the ruling stood.
   *
   * The owner's ruling was "corners like registry", and at the time the registry's
   * `rounded-xl` was a FIXED 14px on a 28px popup: exactly half, so it drew a stadium, and
   * they accepted a pill knowingly. Then the preset moved to b2qLMFPO4 (radius small) and
   * every rung became derived — `xl` is now `--radius x 1.4` = 10.08px. Same class, same
   * ruling, and the tooltip is no longer a pill.
   *
   * SO THIS ASSERTS THE RULING, NOT THE PIXELS. What must stay true is that the tooltip
   * wears whatever the registry's `rounded-xl` resolves to, and that the value DRAWS on the
   * box it has. It used to assert `radius === 14` and `radius * 2 >= popupH` — a pinned
   * number and a required clamp, both of which were consequences of a preset that has since
   * changed. Pinning a consequence as if it were the rule is how a test ends up enforcing
   * the opposite of what was decided. */
  const r = radiusScale();
  /* A tiny local reader for the ONE literal still involved — the type step. The radius
   * side comes from radiusScale(), which resolves the preset's calc() chain.
   *
   * `String.raw` AND NOT A PLAIN TEMPLATE LITERAL, and this cost a round: inside a normal
   * template literal `\s` is an escape that resolves to the letter "s", so the pattern
   * became `--fs-label:s*(d+...)px` and matched NOTHING — the reader returned null and the
   * assertion failed on a token that was sitting right there. It is the same trap
   * `radius-clamp.test.js` opens with a warning about (`\b` as a backspace character), met
   * from the other direction. */
  const px = (decl, css) => {
    const m = new RegExp(String.raw`${decl}:\s*(\d+(?:\.\d+)?)px`).exec(css);
    return m ? Number(m[1]) : null;
  };
  const fs = px('--fs-label', tokensCss);
  assert.equal(fs, 12, 'the tooltip is `text-xs`, which the bridge points at --fs-label');

  const popupH = Math.round(fs * (1 / 0.75)) + 6 + 6; // line-height + py-1.5 top and bottom
  assert.equal(
    popupH, 28,
    `the tooltip popup is ${popupH}px tall, not 28. Its corner is judged against this box, `
      + 'so if the padding or the type step moved, re-measure before trusting the result.',
  );

  assert.ok(
    r.xl > 0 && r.xl < popupH / 2,
    `the tooltip draws the registry's rounded-xl at ${r.xl}px on a ${popupH}px box. Half is `
      + `${popupH / 2}px, so at or above that it clamps to a stadium. It DID clamp until `
      + '2026-09-09, when the preset moved and xl came down to 10.08px — the owner\'s '
      + '"corners like registry" ruling is unchanged; the preset it points at is not. If '
      + 'this fails, the tooltip is a pill again: check whether that is the preset\'s doing '
      + 'before treating it as a bug.',
  );
});

test('the delay is the 100ms the owner set, on a part that actually reads it', () => {
  /* WHERE IT GOES IS THE WHOLE POINT. `delay` is a prop of Base UI's Trigger and of its
   * Provider. The ROOT does not take one — it renders no element — so a delay written
   * there is accepted by JSX, reaches nothing, and the tooltip fires instantly with no
   * error anywhere. The first draft of the wrapper did exactly that. */
  assert.match(
    code, /function TooltipTrigger\(\{\s*delay = TOOLTIP_DELAY/,
    'the delay must be on the TRIGGER, so a tooltip outside any Provider — which is most '
      + 'of them — still waits. On the Root it silently does nothing.',
  );
  assert.match(
    code, /function TooltipProvider\(\{\s*delay = TOOLTIP_DELAY/,
    'the Provider must carry it too, or the registry\'s `delay = 0` wins for every tooltip '
      + 'inside a grouped region — which is exactly the table this was built for.',
  );
  assert.match(
    code, /function Tooltip\(props\)/,
    'the Root is a passthrough on purpose. Giving it a `delay` reads as configuring the '
      + 'tooltip and configures nothing.',
  );
  assert.match(
    generated, /delay = 0/,
    'the registry no longer zeroes the delay, so the wrapper\'s override may be arguing '
      + 'with something that is already gone. Re-read `ui/tooltip.jsx` before keeping it.',
  );
  const m = /const TOOLTIP_DELAY = (\d+);/.exec(code);
  assert.ok(m, 'TOOLTIP_DELAY must be a literal this test can read');
  assert.equal(
    Number(m[1]), 100,
    'THE OWNER SET THIS (2026-09-09), and it replaced Base UI\'s own 600 which the first '
      + 'build had restored. 100ms asks "are you pointing at this?" rather than "have you '
      + 'stopped on it?", which is the right question for a cell holding the only copy of '
      + 'why a rule was broken. It is not a default to be tidied back to a library value.',
  );
});

test('the decision is MADE, so the switch that existed to ask it is gone', () => {
  /* THE PROP WAS RIGHT AND THEN IT WAS WRONG, WHICH IS THE WHOLE LIFECYCLE.
   *
   * `surface="panel" | "inverted"` existed for one afternoon so the two schemes could be
   * hovered side by side — a specimen that shows only our answer is not a review. The
   * owner answered on 2026-09-09 ("keep our color"), and at that moment the switch stopped
   * being a review affordance and became a way for one overlay to disagree with the other
   * four. This codebase has caught the same shape four times under the name "a reason that
   * had expired"; this asserts it does not come back. */
  /* `data-overlay-surface` is an ATTRIBUTE that carries the word and must stay, so the
   * scan drops it first. The first draft of this assertion did not, and failed on the one
   * line it was written to protect. */
  const noAttr = code.replace(/data-overlay-surface/g, ' ');
  assert.doesNotMatch(
    noAttr, /surface/,
    'the tooltip has a `surface` option again. The colour is decided (panel), so a caller '
      + 'must not be able to pick the other one — that is how the menu, the popover and '
      + 'the select end up on three different surfaces. If the owner has REVERSED the '
      + 'ruling, change the constant rather than reintroducing the choice.',
  );
  assert.doesNotMatch(
    kit, /surface="inverted"/,
    'the Test page still renders the alternative through our wrapper. The registry pane '
      + 'imports `ui/tooltip.jsx` directly, which is the honest way to show the registry '
      + 'and does not need a prop on ours.',
  );
  assert.match(
    kit, /RawTooltipContent/,
    'the registry comparison must stay on the page even though the question is closed — it '
      + 'is the only place the bridge re-meaning is visible rather than described, and it '
      + 'is what to open first if a tooltip looks wrong after a token move.',
  );
});

test('§10 — the tooltip animates like every other overlay, and not on its own timing', () => {
  assert.match(
    code, /overlay-motion/,
    'every overlay in this app enters at --dur and leaves at --dur-fast through one '
      + 'utility. A tooltip with its own duration is a fourth number nobody decided.',
  );
  assert.ok(
    /@utility overlay-motion/.test(bridgeCss),
    'the overlay-motion utility is gone from bridge.css, so this class now emits nothing '
      + '— silently, which is the trap §1 lists.',
  );
});

test('the tooltip is exported from the barrel, because that is the only door', () => {
  for (const name of ['Tooltip', 'TooltipContent', 'TooltipProvider', 'TooltipTrigger']) {
    assert.ok(
      new RegExp(`\\b${name}\\b`).test(barrel),
      `${name} is not exported from primitives/index.js. Application code imports the `
        + 'barrel and only the barrel, so an unexported part is an invitation to reach '
        + 'into components/ui directly.',
    );
  }
  assert.match(
    barrel, /from '\.\/tooltip\.jsx'/,
    'the barrel must export the WRAPPER, not the generated component.',
  );
});

test('the adherence reason still travels on `title=`, and Cycle 01 is what changes that', () => {
  /* THIS TEST WAS AIMED AT THE WRONG FILE AND THE CORRECTION IS WORTH RECORDING.
   *
   * It first asserted that `data-table.jsx` renders no Tooltip, on the theory that the
   * adherence cell would move onto this component the day the tooltip was signed. It
   * would not, and it cannot: the kit table is PRESENTATIONAL — the caller supplies every
   * cell — so no adherence cell has ever lived in it. The `title=` is in
   * `features/trades/TradesTable.jsx`, the legacy shipped table, and it moves when the
   * TRADE LOG migrates in Cycle 01. Signing the tooltip does not touch it.
   *
   * A guard on a file that could never hold the thing it guards passes for ever and
   * protects nothing, which is the "fails open" failure `radius-clamp.test.js` was
   * rewritten to avoid. So this now points at the real location and the real trigger. */
  const shipped = readFileSync(at('../frontend/src/features/trades/TradesTable.jsx'), 'utf8');
  assert.match(
    shipped, /title=\{`Broke: /,
    'the shipped adherence cell no longer carries its reason on `title=`. If the Trade Log '
      + 'has migrated onto the kit table, that reason belongs on the Tooltip primitive now '
      + '(which is approved, so it may be adopted) — and this test should be deleted in '
      + 'the same commit as the migration, together with the legacy `.adh-*` rules.',
  );
  assert.doesNotMatch(
    shipped, /Tooltip/,
    'the legacy table has grown a Tooltip. It is scheduled for DELETION in Cycle 01, not '
      + 'for improvement — every edit to it is work that gets thrown away. Migrate the '
      + 'page onto the kit table instead.',
  );
});
