import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bridgeCss, legacyCss, tokensCss } from './helpers/app-css.js';

/* THE KIT'S DETAIL DRAWER — Cycle 00, piece 4.
 *
 * `primitives/sheet.jsx` on `@shadcn/sheet`, which had been on disk since `sidebar`
 * pulled it in and which nothing outside `ui/` could reach. The SECOND piece of this
 * cycle to arrive that way; the tooltip was the first, and both came in the same box.
 *
 * WHAT IS DELIBERATELY NOT HERE. How it LOOKS is the owner's, on the Test page. Both open
 * questions were ANSWERED 2026-09-10 — the card colour, and an ✕ in the actions row — and
 * `primitives-status.test.js` now holds the `@design approved` line. The surface ruling
 * is pinned below, because it is the one a future reader is most likely to "correct".
 *
 * WHAT IS HERE is everything that must stay true whichever way those go. Three of the
 * assertions below exist because of a specific fault this codebase has already paid for
 * once, and each names it.
 */

const at = (p) => fileURLToPath(new URL(p, import.meta.url));
const read = (p) => readFileSync(at(p), 'utf8');

const sheet = read('../frontend/src/components/primitives/sheet.jsx');
const generated = read('../frontend/src/components/ui/sheet.jsx');
const modal = read('../frontend/src/components/primitives/modal.jsx');
const barrel = read('../frontend/src/components/primitives/index.js');
const kit = read('../frontend/src/features/dev/KitDrawer.jsx');
const shipped = read('../frontend/src/features/trades/TradePreview.jsx');

/* Comments carry the ARGUMENTS here, at length, and several of them quote the very class
 * names being asserted absent. A scan across a whole source file catches the paragraph
 * explaining why something is not there — the third over-broad-scan trap of this cycle,
 * and kit-filter-bar.test.js hit it twice. Strip first, always. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const code = strip(sheet);

test('the drawer is the registry component, wrapped — and ui/ is not edited in place', () => {
  assert.match(
    code, /from '@\/components\/ui\/sheet'/,
    'DESIGN-LANGUAGE §1 step 2: the drawer is a SKIN on the generated Sheet. If this '
      + 'import is gone the component has been forked, and §1 requires the argument to be '
      + 'in the file.',
  );
  assert.doesNotMatch(
    code, /['"`][^'"`\n]*\btp-[a-z]/,
    'the wrapper renders a legacy `.tp-*` class. It REPLACES those rules; it does not '
      + 'reuse them (standing rule: delete legacy, never patch it).',
  );
});

test('§1 step 3 was run for real, and the answer is recorded rather than assumed', () => {
  /* THE BRIEF ALREADY SAID "a skin on Sheet, not a new component" — and that line is an
   * audit note from 2026-09-06. Nine reasons in the primitive review turned out to have
   * EXPIRED between being written and being relied on, so an audit note is a thing to
   * re-check, not a thing to cite. coss ships 14 drawer particles and 3 sheet ones; the
   * reason we take neither has to survive in the file, or the next person re-litigates it. */
  assert.match(
    sheet, /@coss/,
    'the file no longer records the @coss step. §1 step 3 is not optional and "we checked" '
      + 'has to be checkable — see feedback_check_coss_before_building.',
  );
  assert.match(
    sheet, /drag bars?, snap points/,
    'the reason coss\'s drawer was not taken has gone. It is a MOBILE GESTURE OBJECT, '
      + 'which is a different component from a detail panel — not merely "we already have '
      + 'one".',
  );
});

test('the width override matches the registry\'s modifiers, or twMerge keeps both', () => {
  /* THE MOST BREAKABLE THING IN THIS FILE, AND IT FAILS SILENTLY.
   *
   * `twMerge` drops a conflicting class only when the MODIFIER SET MATCHES. The top bar's
   * pill hover died of exactly this on 09-07: an override written at different modifiers
   * does not replace anything, both classes ship, and the winner is whichever the
   * stylesheet emits last — which is stable until a build order changes.
   *
   * So a plain `w-[480px]` here would look right and be wrong. The override has to carry
   * `data-[side=right]:` and `sm:` because the registry's does.
   *
   * WHY THIS ASSERTS STRINGS RATHER THAN RUNNING THE MERGE. Calling `twMerge` on the two
   * class lists would prove the thing directly, and it was done by hand on 2026-09-10 —
   * all four of the registry's conflicting classes (`w-3/4`, `sm:max-w-sm`,
   * `duration-200`, `ease-in-out`) are correctly dropped. It cannot be a TEST: this suite
   * runs `npm ci` for the BACKEND only, so `frontend/node_modules` does not exist in CI,
   * and importing tailwind-merge here would pass locally and fail there with "Cannot find
   * module" — the exact trap `router-surface.test.js` records. Every test in this repo
   * reads frontend source as TEXT for that reason.
   *
   * So what is pinned is the PREMISE on both sides — the registry's classes, and that
   * ours are shaped to match them. If either moves, the merge silently stops happening,
   * and this is what fails instead. */
  assert.match(
    generated, /data-\[side=right\]:sm:max-w-sm/,
    'the registry no longer caps the sheet at `data-[side=right]:sm:max-w-sm`. The override '
      + 'below is shaped to beat THAT class; re-read the generated file before trusting it.',
  );
  assert.match(
    generated, /data-\[side=right\]:w-3\/4/,
    'the registry no longer sets `data-[side=right]:w-3/4`. Same as above — the override is '
      + 'shaped against it.',
  );
  for (const cls of [
    'data-[side=right]:w-[var(--sheet-w)]',
    'data-[side=right]:sm:max-w-[var(--sheet-w)]',
  ]) {
    assert.ok(
      code.includes(cls),
      `the width override lost \`${cls}\`. Without the registry's own modifiers twMerge `
        + 'keeps its class too, both ship, and the drawer is 384px or 480px depending on '
        + 'stylesheet order. No error either way.',
    );
  }
});

test('the width is a variable, because a caller\'s dimension cannot be a class', () => {
  /* Tailwind's `@source` covers `components/{ui,primitives}` only, so a utility written
   * in a PAGE emits nothing — silently. That has cost real debugging time five times and
   * §1 lists them. A drawer whose width a screen can set therefore cannot take that width
   * as a className; it takes a prop, and the prop reaches CSS as a variable. */
  assert.match(
    code, /'--sheet-w':/,
    'the width no longer travels as a CSS variable. If a caller is now expected to pass a '
      + '`w-[...]` class, that class compiles to NOTHING outside components/ and the drawer '
      + 'silently keeps its default.',
  );
  assert.match(
    code, /width = 480/,
    'the default width changed. 480px is not a new value — it is what `.tp-panel` ships '
      + 'and it was sized against the twenty-field grid that is still twenty fields (§2). '
      + 'Changing it is a design decision and needs the owner.',
  );
  assert.match(
    code, /92vw/,
    'the narrow-window cap is gone. `.tp-panel` has always been `max-width: 92vw` so the '
      + 'drawer never covers the whole screen.',
  );
});

test('§10 — the motion does NOT go through overlay-motion, which would do nothing', () => {
  /* THE SILENT NO-OP THIS PIECE ALMOST SHIPPED, and it is the fourth distinct one in the
   * cycle. Every other overlay uses the `overlay-motion` utility. It sets
   * `--tw-animation-duration`, which is read only by the `animate-in`/`animate-out`
   * KEYFRAME classes. The registry built the sheet on CSS TRANSITIONS instead
   * (`data-starting-style` / `data-ending-style`), so `overlay-motion` here would be
   * accepted by JSX, emit a custom property nothing reads, and change nothing.
   *
   * Same shape as the tooltip's delay written on a Root that takes no delay (09-09). */
  assert.match(
    generated, /data-starting-style:/,
    'the registry sheet no longer uses transition-based enter/exit. If it moved to '
      + 'keyframes, `overlay-motion` becomes the right answer and this test is stale.',
  );
  assert.doesNotMatch(
    code, /overlay-motion/,
    'the drawer now asks for `overlay-motion`. That utility only reaches `animate-in`/'
      + '`animate-out`; this component transitions. It would be a no-op with no error.',
  );
  assert.match(
    code, /ease-\[var\(--ease\)\]/,
    'the drawer is back on the browser\'s `ease-in-out`. §10: one easing, and it is ours.',
  );
  assert.match(
    code, /data-ending-style:duration-\[var\(--dur-fast\)\]/,
    '§10: leaving is faster than arriving. The registry uses one duration both ways; once '
      + 'a user has dismissed something they have moved on.',
  );
});

test('the duration is bound to --dur, not to the 200ms that happens to match it', () => {
  /* THE REGISTRY ALREADY LANDS ON OUR VALUE — `duration-200` is exactly `--dur` — and the
   * wrapper restates it ANYWAY. That is the opposite of the call the tooltip's corner got
   * on 09-09, so the distinction belongs in writing rather than being rediscovered later
   * as an inconsistency between two overlays.
   *
   * THE TOOLTIP'S INTENT WAS "LOOK LIKE THE REGISTRY". The owner chose the registry's
   * corner over ours, and the only way to keep choosing it is to NOT restate the value:
   * a restated 14px stops tracking the registry the moment the registry moves.
   *
   * THIS INTENT IS "BE ON OUR LADDER". §10 gives the app three durations, and the drawer
   * has to sit on the same one as every other overlay because they are seen in one
   * session. The registry's 200ms is a COINCIDENCE, not an agreement — a literal in a
   * file we do not own. If `--dur` moved to 180ms every overlay in the app would follow
   * except this one, silently, and no amount of reading either file would show it.
   *
   * THE RULE THAT FALLS OUT: bind to the token when the value expresses a RULE of ours;
   * restate nothing when the value expresses the registry's own look. The coincidence is
   * pinned too, so if the two ever stop matching someone re-reads the reasoning instead
   * of a diff. */
  assert.match(generated, /\bduration-200\b/, 'the registry sheet changed its duration');
  assert.match(tokensCss, /--dur:\s*200ms/, '--dur is no longer 200ms');
  assert.match(
    code, /duration-\[var\(--dur\)\]/,
    'the drawer is no longer bound to --dur. It would still render at the right speed, by '
      + 'coincidence, because the registry hardcodes 200ms — right up until \u00a710 '
      + 'duration changes, when every other overlay moves and this one does not.',
  );
});

test('the drawer is a CARD surface, and the overlay attribute came off with it', () => {
  /* RULED 2026-09-10, against the registry AND against the token's own description of
   * itself. `--surface-2` documents itself as "EVERY FLOATING PANEL — menu, popover,
   * select, combobox"; that turned out to describe the things that had needed it rather
   * than define what qualifies. Every previous holder is small and transient, and this
   * one is 480px wide, full height, and holds a card, twenty fields and a paragraph.
   *
   * THE SECOND ASSERTION IS THE ONE THAT WILL SAVE SOMEONE. These were never two
   * questions: the same attribute that sets the panel's colour makes every hover, edge
   * and separator INSIDE it resolve to overlay values. A card-coloured drawer that still
   * declared `data-overlay-surface` would produce the exact fault the attribute exists to
   * prevent, only inverted — and it would look almost right, which is worse. If someone
   * later restores the attribute "because a drawer is an overlay", they will be correct
   * about the stacking and wrong about the colour: the two are independent, and this
   * component is the one place in the library where they disagree. */
  assert.match(
    code, /bg-card/,
    'the drawer is no longer on the card colour. That was an owner ruling on 2026-09-10, '
      + 'taken against the registry — see sheet.jsx.',
  );
  assert.doesNotMatch(
    code, /bg-popover/,
    'the drawer is back on the registry\'s floating-panel colour, which the owner ruled '
      + 'against.',
  );
  assert.doesNotMatch(
    code, /data-overlay-surface/,
    'the drawer declares `data-overlay-surface` again. On a CARD-coloured surface that is '
      + 'backwards: every hover, edge and separator inside would resolve to overlay values '
      + 'on a card. The attribute is about COLOUR CONTEXT, not stacking — the drawer is '
      + 'still an overlay, and an overlay opened inside it still declares its own.',
  );
  /* The premise: `bg-card` has to actually reach the card colour, or the ruling was
   * applied in name only. --color-card -> --panel -> --surface, and --panel is a legacy
   * alias whose whole job is that indirection. */
  assert.match(
    bridgeCss, /--color-card:\s*var\(--panel\)/,
    '`bg-card` no longer resolves to --panel, so it may no longer be the card colour the '
      + 'owner picked. Re-check what it lands on before trusting this.',
  );
  assert.match(
    tokensCss, /--panel:\s*var\(--surface\)/,
    '--panel is no longer an alias for --surface. The drawer was ruled onto the CARD '
      + 'colour; check that `bg-card` still gets there.',
  );
});

test('one close control, not two — the registry\'s is forced off', () => {
  /* Leaving `showCloseButton` at its default would put a floating × over whatever close
   * control the header draws, the moment a caller draws one. Two controls, one job.
   *
   * It is forced rather than exposed as a prop for the reason this library has now
   * applied three times: the chip's `operator` and the tooltip's `surface` were both
   * DELETED on the ruling that answered them, because a switch outliving its question is
   * how one component ends up able to look like two. */
  assert.match(generated, /showCloseButton = true/, 'the registry default changed');
  assert.match(
    code, /showCloseButton=\{false\}/,
    'the registry\'s floating close button is back on. The header owns the close control; '
      + 'having both is not a variant, it is a bug.',
  );
  assert.doesNotMatch(
    code, /closeButton|showClose[A-Za-z]*\s*[=,)]\s*(?!\{false\})/,
    'a close-button switch has appeared on the wrapper. Which control closes the drawer is '
      + 'ONE decision, not an option a caller finds.',
  );
});

test('the portal div is taken out of flow, because SheetContent is a flex column', () => {
  /* `modal.jsx` met this as a LATENT bug — its dialogs lay out as blocks, where Base UI's
   * injected `<div data-base-ui-portal>` is 0px and nobody noticed for months. It only
   * appeared when a dialog used grid or flex, and the owner found it by opening a menu
   * inside a modal and watching the modal get taller.
   *
   * There is no latent version here. The registry's own SheetContent IS `flex flex-col`,
   * so the first overlay anyone opens inside this drawer adds a track AND a gap. */
  assert.match(
    generated, /flex flex-col/,
    'SheetContent is no longer a flex column. If it became a block, the portal fix is '
      + 'merely prudent rather than required — but check before removing it.',
  );
  assert.match(
    code, /\[&>\[data-base-ui-portal\]\]:contents/,
    'the portal fix is gone. An overlay opened inside the drawer will add a flex track and '
      + 'a gap, and the panel will shift while it is used.',
  );
  assert.match(
    modal, /\[&>\[data-base-ui-portal\]\]:contents/,
    'modal.jsx no longer carries this, so the two overlays have diverged. Whatever '
      + 'replaced it there is what should be here.',
  );
});

test('an overlay opened inside the drawer renders inside it, not under the scrim', () => {
  /* The seam `overlay-container.js` exists for. Nothing puts a menu in the drawer today —
   * the actions row is two icon buttons — and it is wired anyway, because the alternative
   * is that whoever adds the first one gets a control that takes focus and paints under
   * the scrim. That is the exact bug the context was built for (the Journal workspace's
   * filter menu), and it is invisible rather than broken-looking. */
  assert.match(
    code, /OverlayContainerContext\.Provider/,
    'the drawer no longer publishes itself as the portal container. A Select or Menu '
      + 'opened inside it will lose the z-index comparison by nine orders of magnitude and '
      + 'be invisible while focused.',
  );
  assert.match(
    code, /useRef\(null\)/,
    'the container is no longer a ref. `overlay-container.js` explains why it must be: an '
      + 'element in state re-renders every drawer on open to hand a value to overlays that '
      + 'mostly do not exist.',
  );
});

test('§6 — the drawer restates no radius, which is how it stays the registry\'s', () => {
  /* The tooltip's corner ruling on 09-09 settled the general form of this: the only way
   * to stay identical to the registry is not to restate the value. Here the registry
   * draws no corner at all, and §6 agrees for a reason of its own — this surface touches
   * three viewport edges, and a corner on the two outer ones rounds against nothing. */
  assert.doesNotMatch(
    code, /rounded-/,
    'the drawer is declaring a radius. §6 assigns radius by SURFACE and this one meets the '
      + 'viewport on three sides; if an inset drawer is now wanted, that is a design '
      + 'decision with the owner, not a class.',
  );
});

test('the drawer is exported from the barrel, because that is the only door', () => {
  for (const name of ['Sheet', 'SheetHeader', 'SheetTitle', 'SheetFooter', 'SheetClose']) {
    assert.ok(
      new RegExp(`\\b${name}\\b`).test(barrel),
      `${name} is not exported from primitives/index.js. Application code imports the `
        + 'barrel and nothing else — an unexported primitive is one a screen has to '
        + 'hand-build around.',
    );
  }
});

test('nothing is migrated yet, and the legacy rules are still standing', () => {
  /* THE SEQUENCING, PINNED — the same guard piece 3 carries. Signing off how a part LOOKS
   * is not the same as having put it in the app, and the two get conflated the moment the
   * `@design approved` line lands. `TradePreview` ships in the Trade Log AND the Day view;
   * moving it is Cycle 01's job, with the Trade Log around it. */
  assert.match(
    shipped, /tp-panel/,
    'TradePreview has been migrated. If that is deliberate, this test moves — and the '
      + '`.tp-*` rules plus their names in test/fixtures/legacy-classes.txt must be deleted '
      + 'in the SAME commit (see feedback_legacy_css_frozen).',
  );
  assert.match(
    legacyCss, /\.tp-panel\s*\{/,
    'the `.tp-*` legacy rules are gone but TradePreview still renders them, or the two have '
      + 'drifted apart. They are deleted together or not at all.',
  );
});

test('the specimen holds the REAL trade, not a retyped one', () => {
  /* Brief §5: realistic data. The record comes from the table's own fixture rather than a
   * second copy, because two copies of one trade is how a price gets fixed in one of them
   * and the two specimens quietly stop showing the same thing. */
  assert.match(
    kit, /import \{ TRADES \} from '\.\/KitDataTable\.jsx'/,
    'the drawer specimen has started authoring its own trade. Import the table\'s fixture — '
      + 'the two pieces are meant to be showing the same record.',
  );
  assert.doesNotMatch(
    strip(kit), /lorem|Lorem|foo|bar\b/,
    'placeholder content reached the specimen. Brief §5: the review is of real data, '
      + 'because the wrapping and the column widths are half of what is being judged.',
  );
});

test('the registry is on the page bare, which is piece 3\'s lesson made permanent', () => {
  /* Piece 3's wrapper was written before anyone rendered the registry component
   * untouched, so two corrections went in matched against faults found in OTHER files and
   * one of them ran every row flush to the panel edge. §25 cuts both ways: a correction
   * applied pre-emptively is as unreviewed as a preview. The bare pane is what makes the
   * difference between "ours" and "theirs" a thing you can see rather than a claim. */
  assert.match(
    kit, /from '@\/components\/ui\/sheet'/,
    'the bare registry pane is gone. Every correction in sheet.jsx is then a claim about a '
      + 'component nobody on this page can look at.',
  );
});
