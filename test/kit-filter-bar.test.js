import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bridgeCss, legacyCss } from './helpers/app-css.js';

/* THE KIT'S FILTER BUILDER — Cycle 00, piece 3.
 *
 * Two parts with opposite origins, and that contrast is what this file is really pinning:
 *
 *   command.jsx      the registry's, near enough untouched. The finding was how LITTLE
 *                    was wrong — `menu.jsx` settled this vocabulary on 09-07 and the
 *                    registry agrees with it.
 *   filter-chip.jsx  HAND-WRITTEN, the first in Cycle 00. §1 allows that only as the last
 *                    step and only with an argument in the file, so the argument is
 *                    asserted here — a hand-written part whose justification quietly
 *                    disappears is how a library grows a second button.
 *
 * WHAT IS DELIBERATELY NOT HERE. How either LOOKS is the owner's, on the Test page.
 * BOTH WERE SIGNED OFF 2026-09-10 and `primitives-status.test.js` now holds the two
 * `@design approved` lines. That changes nothing below: this file never asserted taste,
 * only the things that must stay true whatever the owner decided — the wrapper stays a
 * wrapper, the hand-written part keeps its argument, and nothing here claims the panel
 * has been migrated. A lock is when those matter MORE, not less.
 */

const at = (p) => fileURLToPath(new URL(p, import.meta.url));
const cmd = readFileSync(at('../frontend/src/components/primitives/command.jsx'), 'utf8');
const chip = readFileSync(at('../frontend/src/components/primitives/filter-chip.jsx'), 'utf8');
const generated = readFileSync(at('../frontend/src/components/ui/command.jsx'), 'utf8');
const menu = readFileSync(at('../frontend/src/components/primitives/menu.jsx'), 'utf8');
const barrel = readFileSync(at('../frontend/src/components/primitives/index.js'), 'utf8');
const kit = readFileSync(at('../frontend/src/features/dev/KitFilterBar.jsx'), 'utf8');

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const cmdCode = strip(cmd);
const chipCode = strip(chip);

test('the cascade column is the registry component, wrapped', () => {
  assert.match(
    cmdCode, /from '@\/components\/ui\/command'/,
    'DESIGN-LANGUAGE §1 step 2: never hand-build a searchable list. If this import is gone '
      + 'the component has been forked and the argument must be in the file.',
  );
  assert.doesNotMatch(
    cmdCode, /['"`][^'"`\n]*\bfp-[a-z]/,
    'the kit renders a legacy `.fp-*` class. It REPLACES those rules; it does not reuse '
      + 'them (§1: delete legacy, never patch it).',
  );
});

test('CommandDialog is NOT wrapped — this product has no command palette', () => {
  /* §2: do not build a control the product cannot honour. The registry ships a ⌘K dialog
   * with the list, and wrapping it would put a palette one import from a product that has
   * never asked for one — and it would be the seventh overlay to keep in step. The list is
   * what Cycle 00 needs; the dialog is not. */
  assert.match(generated, /function CommandDialog/, 'the registry still ships one');
  assert.doesNotMatch(
    cmdCode, /CommandDialog/,
    'CommandDialog is now re-exported. There is no ⌘K in this product and none is '
      + 'proposed — if one is now wanted, that is a product decision and it needs a '
      + 'specimen on the Test page, not a quiet export.',
  );
  /* The barrel's own comment SAYS "CommandDialog is deliberately not wrapped", so the scan
   * has to read exports rather than prose — the first draft of this line failed on the
   * sentence explaining why it should pass. Same trap as `data-overlay-surface` in
   * kit-tooltip.test.js: a word in a comment is not a usage. */
  assert.doesNotMatch(
    strip(barrel), /CommandDialog/,
    'CommandDialog reached the barrel, which is the only door application code uses.',
  );
});

test('§4 — the panel declares itself, or every row hovers to a CARD\'s hover', () => {
  assert.match(
    cmdCode, /data-overlay-surface/,
    'the generated rows hover with `data-selected:bg-muted`, and --color-muted points at '
      + '--chrome-hover, which is CONTEXTUAL. Without this attribute a row inside the '
      + 'filter popover hovers to a card\'s value and is nearly invisible. Seventh '
      + 'instance of that fault; one attribute is the whole fix.',
  );
  assert.ok(
    /--color-muted:\s*var\(--chrome-hover\)/.test(bridgeCss),
    'the premise above is that `bg-muted` is contextual. The bridge no longer says so, so '
      + 're-read §4 before trusting this wrapper.',
  );
});

test('the command row and the menu row are the same object, on the same values', () => {
  /* THE FINDING OF THIS PIECE, AND IT IS A NON-EVENT ON PURPOSE. Every kit piece before
   * this one needed a real correction. A pickable line in a floating panel already had an
   * answer — `menu.jsx`, approved 09-07 — and the registry's command row arrives on it.
   * This asserts the two do not silently diverge: if someone "fixes" one row's radius,
   * the app gets two kinds of menu row and nobody notices until they are side by side. */
  assert.match(
    generated, /rounded-xl/,
    'the generated command row no longer asks for `rounded-xl`, so it may no longer agree '
      + 'with the menu row. Compare them before shipping.',
  );
  assert.match(
    menu, /const ITEM = 'text-\[14px\] rounded-xl'/,
    'menu.jsx\'s row recipe changed. The command row inherits the registry\'s, which was '
      + 'kept BECAUSE it matched this one — if the menu moved, the command row must be '
      + 'looked at rather than left.',
  );
  assert.doesNotMatch(
    cmdCode, /rounded-(?:sm|md|lg|xl|2xl|3xl)\b/,
    'the wrapper is overriding a ROW radius. It should not need to: the registry already '
      + 'lands on the menu\'s. Only the shell takes a corner here.',
  );
});

test('the wrapper adds ONE attribute and no classes at all', () => {
  /* THIS TEST USED TO ASSERT THE OPPOSITE OF ITS OWN NAME, and the reversal is the point.
   *
   * It required `rounded-card` on the shell, and the wrapper also cancelled the shell's
   * `p-1`. Both were corrections applied PRE-EMPTIVELY — matched against bugs found in
   * other files (the Card/Modal/Popover padding doubling; a registry radius pinned to a
   * literal) rather than against anything wrong on screen here. The padding one was a real
   * regression: the shell's `p-1` is what holds the list off the panel edge, so cancelling
   * it ran every row flush to the border. The owner spotted it immediately (2026-09-09).
   *
   * So what is pinned now is the ABSENCE. A wrapper that adds nothing cannot break the
   * component it wraps, and this one has exactly one job — see the surface test above. */
  /* SCOPED TO THE SHELL, because `CommandCount` legitimately sets a class and the first
   * draft of this line scanned the whole file and failed on it. Third over-broad scan in
   * this batch — a `doesNotMatch` across a whole source file catches the comment that
   * explains it, the component next door, or an attribute that merely contains the word.
   * Slice the function out first. */
  const shell = cmdCode.slice(cmdCode.indexOf('function Command(')).split('\n}')[0];
  assert.doesNotMatch(
    shell, /className/,
    'the Command wrapper is applying classes again. It must not: the registry\'s padding '
      + 'and corner are what the owner is looking at, and every class here was previously '
      + 'a correction nobody had asked for. If something is genuinely wrong, render it '
      + 'bare on /test first, show it, and fix ONE thing.',
  );
  assert.match(
    cmdCode, /function Command\(props\)/,
    'Command must be a pass-through carrying only data-overlay-surface.',
  );
  assert.match(
    generated, /rounded-3xl[\s\S]{0,80}p-1/,
    'the generated shell no longer carries its own `rounded-3xl ... p-1`. Those are what '
      + 'this wrapper deliberately leaves alone, so if the registry dropped them the shell '
      + 'now has no padding and no corner — look at it before shipping.',
  );
});

test('the count is the registry\'s shortcut slot, which is what hides the always-on tick', () => {
  /* NOT A STYLE CHOICE — A STRUCTURAL ONE. `CommandItem` always renders a CheckIcon with
   * `ml-auto`; a count added as a plain child lands to the LEFT of an invisible tick and
   * never reaches the edge. The registry's own escape hatch is CommandShortcut, whose mere
   * presence hides the check. So the count must BE one. */
  assert.match(
    generated, /group-has-data-\[slot=command-shortcut\]\/command-item:hidden/,
    'the registry no longer hides its check when a shortcut is present, so CommandCount is '
      + 'no longer the right base for a trailing count — the tick will show on every row.',
  );
  assert.match(
    cmdCode, /function CommandCount[\s\S]{0,400}UiCommandShortcut/,
    'CommandCount must render the registry\'s CommandShortcut. See above — a hand-rolled '
      + 'span would leave the always-on tick visible beside the number.',
  );
  assert.match(
    cmdCode, /tabular-nums/,
    'a column of counts is a column of figures and must line up (§12). The registry also '
      + 'spaces a shortcut with `tracking-widest`, which reads as separate keys — right '
      + 'for ⌘K, wrong for "142".',
  );
});

test('the search box\'s fix lives in the BRIDGE, not in this component', () => {
  /* THE BRIGHT STRIP (owner, 2026-09-09), and the reason this test is about ABSENCE.
   *
   * `@shadcn/command` puts the search field's fill on the wrapper (`InputGroup`) and leaves
   * the `<input>` bare. This app does not import Tailwind's Preflight — `tailwind.css` says
   * so and why — so the UA sheet's own control background stood, painted over the middle of
   * the pill, and the pill's translucent white showed above and below it as a bright band.
   *
   * IT WAS FIRST FIXED HERE, WITH `bg-transparent border-0` ON THIS COMPONENT, AND THAT WAS
   * THE WRONG SHAPE TWICE OVER. The border half was already covered by a global reset that
   * had been widened for exactly this reason the day before; and fixing one component
   * leaves the next one to be found by eye, which is the fifth time this project has paid
   * for a Preflight gap. The fix now lives in `bridge.css` @layer base, widened from
   * `button` to every generated form control, and `generated-resets.test.js` holds it.
   *
   * So what this asserts is that the local patch has NOT come back. A component-level
   * workaround sitting on top of a global fix is how a library ends up with two answers to
   * the same question and no way to tell which one is load-bearing. */
  assert.doesNotMatch(
    cmdCode, /bg-transparent|border-0/,
    'the command wrapper is patching browser defaults again. That belongs in bridge.css '
      + '@layer base, where it covers every generated component instead of this one — see '
      + 'test/generated-resets.test.js. If the global reset is not doing its job, widen it '
      + 'there rather than working around it here.',
  );
});

test('the chip is hand-written, and §1 requires the argument to be IN the file', () => {
  /* THE ONE PART OF CYCLE 00 NO REGISTRY SHIPS. §1's build order ends "hand-written last,
   * with an argument in the file", and this is that case. The argument is not decoration:
   * it is what stops the next person adding a second hand-written pill because they did
   * not know this one had already lost the search. */
  for (const [needle, why] of [
    ['@shadcn', 'the argument must name what the shadcn search returned'],
    ['@coss', 'and what the coss search returned — §1 step 3 is not optional'],
    ['Badge', 'and why composing from what we already ship was rejected'],
  ]) {
    assert.ok(
      chip.includes(needle),
      `filter-chip.jsx no longer explains itself: ${why}. A hand-written primitive without `
        + 'a written argument is exactly what the build order forbids.',
    );
  }
  assert.doesNotMatch(
    chipCode, /from '@\/components\/ui\//,
    'if the chip now wraps a generated component, it is no longer the hand-written case — '
      + 'rewrite the header rather than leaving an argument that describes a file that no '
      + 'longer exists.',
  );
});

test('the chip originates no colour of its own — every value is a token', () => {
  /* THE RISK OF HAND-WRITING. A wrapped component inherits the preset; a hand-written one
   * can quietly invent values. This asserts the chip spells nothing in hex or px. */
  assert.doesNotMatch(
    chipCode, /#[0-9a-fA-F]{3,8}\b/,
    'the chip has a hex colour in it. Every value must be a token or a utility resolving '
      + 'to one, or the one hand-written part becomes the one part that does not move when '
      + 'the palette does.',
  );
  assert.doesNotMatch(
    chipCode, /\[\d+px\]/,
    'the chip has a pixel literal in it. Use the scale — this is the file with no preset '
      + 'underneath it, so it is the file where a typed number survives longest.',
  );
});

test('the chip is TWO segments, and only the parts the product can honour are controls', () => {
  /* TWO SEGMENTS AFTER A ROUND TRIP (owner, 2026-09-09). The chip was `field: value ×`,
   * was rebuilt to Linear's three-part sentence with an operator in the middle, and came
   * back to two. The divider, the icon, the height and the edge all stayed — only the
   * middle word went, and the `operator` prop went with it rather than being left as a
   * conditional nobody would remember was there.
   *
   * WHAT THIS PINS IS THE §2 LINE, because that is the part most likely to be "improved"
   * later by someone matching the reference more literally. Linear's field is clickable —
   * you can swap Assignee for Creator in place. We have no such flow. So exactly two things
   * inside a chip are buttons: the value (opens the value column, which is what clicking a
   * chip already did) and the remove. Drawing the field as a control would be drawing a
   * lie. */
  assert.equal(
    (chipCode.match(/<button/g) || []).length, 3,
    'the chip file must render exactly three buttons: the VALUE and the REMOVE inside a '
      + 'chip, plus the standalone add (+) button. Fewer means something stopped being '
      + 'reachable by keyboard; more means the field or the operator became a control, and '
      + 'neither has anything behind it (§2 — never build a control the product cannot '
      + 'honour).',
  );
  assert.match(
    chipCode, /aria-expanded=\{editing\}/,
    'the value opens a panel, so it must say so. Without aria-expanded a screen-reader user '
      + 'cannot tell an open filter from a closed one.',
  );
  assert.match(
    chipCode, /aria-label=\{`Remove \$\{field\} filter`\}/,
    'the × is icon-only and must name WHICH filter it removes — four chips in a row all '
      + 'announcing "Remove" is four identical buttons.',
  );
  assert.match(
    chipCode, /aria-label="Add a filter"/,
    'the + is icon-only too, and it is the one affordance in the reference row that the '
      + 'product genuinely has (the panel already has an "Add filter" row).',
  );
});

test('the count never says "412 of 412"', () => {
  /* THE ONE RULE IN THE READOUT, and it is the kind that gets "simplified" away.
   *
   * "38 of 412 trades" is informative; "412 of 412 trades" makes a reader look for a
   * filter they have not set. So the "of" form is conditional on the filters having
   * actually narrowed something — `total` omitted OR equal to `shown` both render the
   * plain count, which is exactly what the Trade Log prints today.
   *
   * BOTH NUMBERS ARE REAL, which is why this readout is allowed to exist at all: App.jsx
   * computes filterTrades(normalizedTrades, ...), so the filtered and unfiltered lengths
   * are on adjacent lines. §15 forbids inventing a value to fill a state, and nothing here
   * is invented. */
  assert.match(
    chipCode, /total != null && total !== shown/,
    'FilterCount must decide the "of" form from whether the filters narrowed anything. '
      + 'Printing it unconditionally gives "412 of 412", which reads as a bug.',
  );
  assert.match(
    chipCode, /tabular-nums/,
    'the count is a figure in a place the eye returns to as filters change; proportional '
      + 'digits make the row twitch on every keystroke.',
  );
});

test('the chip does not grow the affordances the product lacks', () => {
  /* THE THREE THINGS FROM THE REFERENCE THAT ARE DELIBERATELY ABSENT. Each is cheap to add
   * by eye and expensive to discover is fake, so each is named here rather than left to a
   * comment. Saved views in particular have no endpoint and no route — a Save button would
   * be a control with nothing behind it at all. */
  assert.doesNotMatch(
    chipCode, /Save|saved view/i,
    'the chip row has grown a Save. Linear saves a filter set as a view; this product has '
      + 'no saved views, no endpoint and no route for them. If that feature is being built, '
      + 'it needs a plan entry before it needs a button.',
  );
  assert.doesNotMatch(
    chipCode, /onFieldChange|fieldOptions/,
    'the field has become changeable. There is no field-swap flow in this product — you '
      + 'remove a chip and add another. Adding one is a product change, not a chip change.',
  );
  /* THE OPERATOR IS GONE AND MUST STAY GONE AS AN OPTION. It can come back as a decision
   * — three segments were on screen and were rejected — but not as a prop someone finds
   * and switches on, which would let one component look like two. Same shape as the
   * tooltip's deleted `surface`. */
  assert.doesNotMatch(
    chipCode, /\boperator\b/,
    'the chip has an `operator` prop again. The owner looked at the three-segment version '
      + 'and chose two; a conditional middle segment means the chip can render as either, '
      + 'and nothing records which one was signed off. If three segments are wanted, make '
      + 'it the shape rather than an option.',
  );
});

test('nothing is migrated yet, and the legacy rules are still standing', () => {
  /* THE SEQUENCING, PINNED. These parts are unreviewed, so FilterPanel.jsx still ships on
   * its own CSS. When the panel migrates, the `.fp-*` rules and their names in
   * test/fixtures/legacy-classes.txt go in the SAME commit — that diff is the progress
   * record, and it is the step that gets skipped. */
  const panel = readFileSync(at('../frontend/src/features/filters/FilterPanel.jsx'), 'utf8');
  assert.match(
    panel, /fp-chip-main/,
    'the filter panel has been migrated. Check both parts are @design approved first, then '
      + 'delete the `.fp-*` rules from legacy/app.css and their names from the fixture in '
      + 'this same commit — and delete this test.',
  );
  assert.match(
    legacyCss, /\.fp-chip \{/,
    'the legacy chip rule is gone but the panel still renders it. Deleting a rule whose '
      + 'markup is still shipping is how a screen loses its styling silently.',
  );
});

test('both parts are exported from the barrel, because that is the only door', () => {
  for (const name of ['Command', 'CommandCount', 'CommandInput', 'FilterChip', 'FilterChips']) {
    assert.ok(
      new RegExp(`\\b${name}\\b`).test(barrel),
      `${name} is not exported from primitives/index.js — application code imports the `
        + 'barrel and only the barrel.',
    );
  }
});

test('the specimen shows the REAL filter registry, not a retyped sample', () => {
  /* Brief §5: never lorem. A cascade reviewed against six invented options is reviewed
   * against a shorter list than the one it has to hold — thirty filters in five groups is
   * the actual load, and it is the thing that decides whether the column needs search. */
  assert.match(
    kit, /from '\.\.\/filters\/filterDefs\.js'/,
    'the specimen must import the real FILTERS/FILTER_GROUPS. Retyping them makes the '
      + 'review a review of a sample, and the sample never grows.',
  );
});
