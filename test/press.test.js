import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSrc, readCode } from './helpers/src-files.js';

/* THE PRESS TREATMENT, LIBRARY-WIDE — DESIGN-LANGUAGE §10.
 *
 * Owner, 2026-09-11: "why these tabs don't have click animation? add it like shadcn",
 * then "extend the treatment". The account tabs came first; this file pins the rule the
 * extension is built on.
 *
 * ⚠ "LIKE SHADCN" IS NOT ONE THING, which is why the rule needed writing down instead of
 * copying. Four generated components in this app press four different ways —
 *
 *     ui/button.jsx    active:not-aria-[haspopup]:translate-y-px   a 1px nudge
 *     ui/sidebar.jsx   active:bg-* / active:text-* / active:font-medium
 *     ui/tabs.jsx      active:bg-* / active:border-* / active:after:opacity-100
 *     ui/toggle.jsx    active:...before:shadow-[...]               an inset flip
 *
 * The nudge is the one that generalises, because it does not consume a colour channel —
 * several of our surfaces already spend hover on the background.
 *
 * WHAT THESE TESTS ARE REALLY FOR IS THE EXCLUSIONS. Which controls press is easy to see
 * in the app; which ones DELIBERATELY do not is invisible, and reads as an oversight to
 * the next person, who "fixes" it. Every exclusion below is asserted with its reason.
 */

const P = 'components/primitives/';
const code = (f) => readCode(`${P}${f}`);
const raw = (f) => readSrc(`${P}${f}`);

const shared = code('motion.js');
const dash = readCode('features/dashboard/Dashboard.jsx');

/* A component's own class list: from its declaration to the next top-level one. */
const block = (file, name) => {
  const src = code(file);
  const at = src.search(new RegExp(`export (?:function|const) ${name}\\b`));
  assert.notEqual(at, -1, `${name} is gone from ${file}`);
  const rest = src.slice(at + 1);
  const next = rest.search(/\nexport (?:function|const) /);
  return rest.slice(0, next === -1 ? undefined : next);
};

const constant = (name) => (shared.match(new RegExp(`export const ${name} = '([^']+)'`)) || [])[1];

// ---------------------------------------------------------------------------
// The definition
// ---------------------------------------------------------------------------

test('the press is defined once, in the shared module', () => {
  assert.equal(constant('PRESS'), 'active:translate-y-px',
    'the press is the Base Rhea button idiom — 1px down, nothing else');
  /* It is applied in five files. Copied rather than shared, it would disagree with
   * itself within a month; this is the whole reason motion.js exists. */
  for (const f of ['account.jsx', 'calendar.jsx', 'panel.jsx', 'rail.jsx']) {
    assert.match(code(f), /import \{[^}]*PRESS[^}]*\} from '\.\/motion\.js'/,
      `${f} must take the press from the shared module, never redeclare it`);
  }
  for (const f of ['account.jsx', 'calendar.jsx', 'panel.jsx', 'rail.jsx']) {
    assert.ok(!/const PRESS(_MOTION)? = '/.test(code(f)),
      `${f} redeclares the press instead of importing it`);
  }
});

test('the nudge animates, because its transition names `translate` and not `transform`', () => {
  /* THE FAILURE THIS CATCHES IS SILENT, AND IT ALREADY HAPPENED ONCE.
   *
   * Tailwind v4 compiles `translate-y-px` to the individual `translate:` property, never
   * to a `transform:` matrix. A transition list naming `transform` therefore matches
   * nothing the utility sets: the control still moves, it just SNAPS with no easing,
   * reading as a rendering glitch rather than a press. Nothing errors either way.
   *
   * Tailwind's own `transition-transform` compiles to
   * `transition-property:transform,translate,scale,rotate` — four names precisely
   * because any one of them may be the one in use. That is the proof, not the claim. */
  const m = constant('PRESS_MOTION');
  assert.ok(m, 'PRESS_MOTION is gone');
  assert.match(m, /transition-\[[^\]]*\btranslate\b[^\]]*\]/,
    'PRESS_MOTION must transition `translate` — `transform` does NOT match what '
    + 'translate-y-px sets in Tailwind v4, and the nudge silently snaps');
  for (const prop of ['color', 'background-color', 'border-color']) {
    assert.match(m, new RegExp(`[\\[,]${prop}[,\\]]`),
      `PRESS_MOTION dropped ${prop} — it REPLACES transition-colors on these elements`);
  }
  assert.match(m, /duration-\[var\(--dur-fast\)\]/,
    'a press acknowledges a pointer, it does not report a change (§10)');
  assert.match(m, /ease-\[var\(--ease\)\]/, '§10: one easing');
});

// ---------------------------------------------------------------------------
// What presses
// ---------------------------------------------------------------------------

test('every hand-written click-to-act control takes the press', () => {
  const PRESSES = [
    ['account.jsx', 'AccountTab', 'an account chip in the strip'],
    ['account.jsx', 'AccountBannerAction', "the banner's action button"],
    ['account.jsx', 'AccountCardLink', '"View account →"'],
    ['calendar.jsx', 'CalNavButton', 'the month prev/next control'],
    ['panel.jsx', 'PanelLink', "a panel's \"View all →\""],
    ['rail.jsx', 'RailAction', "the rail's collapse control"],
    ['rail.jsx', 'RailCta', "the rail's call to action"],
  ];
  for (const [file, name, what] of PRESSES) {
    const b = block(file, name);
    assert.match(b, /\bPRESS\b/, `${what} (${name}) lost its press nudge`);
    assert.match(b, /\bPRESS_MOTION\b/,
      `${what} (${name}) nudges without the transition that eases it — it will snap`);
  }
});

test('a day cell presses only when it is actually clickable', () => {
  /* `:active` fires on a plain div too, so an unconditional press would bob forty-two
   * boxes that do nothing when you click them. The cell is one class list serving both
   * cases, so the nudge has to be conditional where every other control's is not.
   *
   * ⚠ THE CELL TAKES THE PRESS AND NOTHING ELSE. A hover lift was added here on
   * 2026-09-11 and REMOVED the same day — the owner tried it in the app and it was
   * broken. The colour work that went with it was reverted too. If a future reader finds
   * §14's "hover intensifies, it does not move" and wonders whether the calendar is an
   * exception: it was, briefly, and it is not any more. */
  const b = block('calendar.jsx', 'CalCell');
  assert.match(b, /clickable && LIFT\b/,
    'CalCell must gate its movement on `clickable`, or forty-two idle days rise and bob');
  assert.match(b, /\bPRESS_MOTION\b/, 'the movement needs the transition that eases it');

  /* ⚠ LIFT REPLACES PRESS ON THIS SURFACE, IT DOES NOT JOIN IT. Both write
   * `--tw-translate-y`, so carrying both means the later one wins — and the first attempt
   * at this shipped exactly that: `hover:-translate-y-0.5` beside the standard
   * `active:translate-y-px`, which sent a click from -2px to +1px. Three pixels of travel,
   * ending past the cell's own resting position, which is what the owner rejected. */
  assert.ok(!/clickable && PRESS\b/.test(b),
    'CalCell must not carry PRESS as well as LIFT — the two fight over translate-y');
  const lift = (shared.match(/export const LIFT = '([^']+)'/) || [])[1];
  assert.ok(lift, 'LIFT is gone from motion.js');
  assert.match(lift, /hover:-translate-y-0\.5/, 'a lift rises 2px');
  /* ⚠ `transform-gpu` IS PART OF THE LIFT, NOT AN OPTIMISATION TO TIDY AWAY. Without it
   * the cell shimmers the instant the pointer lands: mid-transition it sits at fractional
   * pixel offsets and is re-rasterised at each one, so its edges gain antialiasing and
   * its text flips from subpixel to grayscale AA. Promoting the layer AT REST is what
   * stops that — and it must be unconditional, because promoting on `hover:` triggers
   * exactly the switch it is meant to prevent. */
  assert.match(lift, /(^|\s)transform-gpu(\s|$)/,
    'LIFT must promote the layer at rest, or the movement shimmers as it animates');
  assert.ok(!/hover:transform-gpu/.test(lift),
    'promoting on hover causes the rasterisation switch it is there to prevent');
  assert.match(lift, /active:translate-y-0\b/,
    'the press must return a lifted surface to REST, never push it below — that is the '
    + 'whole reason LIFT exists as a pair rather than as a hover class beside PRESS');
});

test('nothing that presses is left on a bare, untokened transition', () => {
  /* PRESS_MOTION replaced several bare `transition-colors` on the way through — those
   * were running Tailwind's own 150ms and its own curve, where §10 says one easing.
   * A pressable surface carrying both would also lose one to tailwind-merge. */
  for (const [file, name] of [
    ['calendar.jsx', 'CalCell'], ['calendar.jsx', 'CalNavButton'],
    ['panel.jsx', 'PanelLink'], ['rail.jsx', 'RailAction'], ['rail.jsx', 'RailCta'],
    ['account.jsx', 'AccountTab'],
  ]) {
    const b = block(file, name);
    assert.ok(!/'[^']*\btransition-colors\b/.test(b),
      `${name} still carries a bare transition-colors beside PRESS_MOTION — two `
      + 'transition-property utilities with the same modifier set merge to the last');
  }
});

// ---------------------------------------------------------------------------
// What does NOT press, and why. This is the half that rots silently.
// ---------------------------------------------------------------------------

test('a trigger presses too — the registry exclusion is overridden in our wrapper', () => {
  /* REVERSED 2026-09-11 by the owner, after the exclusion turned out to switch off the
   * ENTIRE top bar: Filters and the bell are PopoverTriggers and the account switcher is
   * a MenuTrigger, so `not-aria-[haspopup]` left the whole surface dead on click.
   *
   * The override lives in OUR wrapper, never in `ui/button.jsx` (§25). It is additive —
   * a different modifier set means tailwind-merge keeps both the generated conditional
   * class and ours, so a plain button gets the same declaration twice and a trigger gets
   * only ours. */
  /* `Button` is `const Button = React.forwardRef(...)` and exported further down, so the
   * block helper (which keys off `export function|const`) cannot find it — scan the file
   * and anchor on the cva call the class list is built around instead. */
  const btn = code('button.jsx');
  assert.match(btn, /buttonVariants\(\{[\s\S]{0,400}?\n\s+PRESS,/,
    'the generated Button must carry the unconditional press, or every trigger goes dead');
  assert.match(readSrc('components/ui/button.jsx'), /active:not-aria-\[haspopup\]:translate-y-px/,
    'the claim that we are OVERRIDING something is only true while the registry excludes it');

  /* And the hand-written triggers agree with it, or the rule is only half applied. */
  assert.match(block('account.jsx', 'AccountTabMore'), /\bPRESS\b/,
    'the account overflow chip is a MenuTrigger and presses like the rest');
  assert.match(block('brief.jsx', 'BriefAction'), /\bPRESS\b/,
    'BriefAction opens the settings popover and presses like the rest');
  assert.match(code('filter-chip.jsx'), /\bPRESS\b/,
    "the filter chip's value and add controls open things, and press");
});

test('a segmented control presses, even though its indicator slides', () => {
  /* Also reversed 2026-09-11. Pressing the ALREADY-active option — most presses on a
   * segmented control — moves the label against a stationary fill. */
  assert.match(block('brief.jsx', 'BriefRange'), /\bPRESS\b/,
    'the Today/Week pills must answer a click');
  assert.match(code('brief.jsx'), /transform: `translateX/,
    'the indicator moves by INLINE transform, which is why its own transition correctly '
    + 'names `transform` where the utilities must name `translate`');
});

test('a control a generated component already presses is left alone', () => {
  /* The rail's rows press through `ui/sidebar.jsx` (a background and weight shift, not a
   * nudge). Adding ours on top would double the treatment and fight the registry. */
  for (const name of ['RailItem', 'RailUser', 'RailSubItem']) {
    assert.ok(!/\bPRESS\b/.test(block('rail.jsx', name)),
      `${name} is a SidebarMenuButton — ui/sidebar.jsx owns its press`);
  }
  assert.match(readSrc('components/ui/sidebar.jsx'), /active:bg-sidebar-accent/,
    'the claim above is only true while ui/sidebar.jsx actually presses');
});

test('the alert Clear button explains why it stays still', () => {
  /* Two reasons, and the second settles it: FADE_MOTION is `transition-opacity` and does
   * not carry `translate`, and clicking Clear collapses the row immediately — the
   * control animates itself out of existence in the same frame. */
  const brief = code('brief.jsx');
  const at = brief.indexOf('onClick={onClear}');
  assert.notEqual(at, -1, 'the Clear button is gone from brief.jsx');
  assert.ok(!/\bPRESS\b/.test(brief.slice(at, at + 700)),
    'the Clear button must not nudge — it collapses the row it sits in');
  assert.match(raw('brief.jsx'), /NO PRESS NUDGE, FOR TWO REASONS/,
    'the reasoning has to stay next to the code, or it reads as an oversight');
});

test('the rule, its two exclusions and the reversal are written down where applied', () => {
  const m = raw('motion.js');
  assert.match(m, /ANYTHING A GENERATED COMPONENT ALREADY PRESSES ITS OWN WAY/);
  assert.match(m, /ANYTHING FLUSH WITH ITS NEIGHBOURS/);
  /* The reversal has to be recorded, not just applied: the next reader meets a wrapper
   * override that contradicts the generated component and needs to know it was a
   * decision. */
  assert.match(m, /A TRIGGER USED TO BE EXCLUDED AND IS NOT ANY MORE/);
  /* motion.js is a `.js` inside the Tailwind @source DIRECTORY. If it ever moves out of
   * components/{ui,primitives}, every press in the app dies with no error. */
  assert.match(m, /@source/,
    'motion.js must keep the note about why its location is load-bearing');
});

