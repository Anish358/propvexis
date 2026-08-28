import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSrc, stripComments } from './helpers/src-files.js';
import { tokensCss } from './helpers/app-css.js';

/* THE NAVIGATION RAIL, pinned against the 2026-08-28 Figma frame (node 1:2).
 *
 * This repo cannot render a component in a test — no jsdom, no React Testing Library,
 * by decision — so what is asserted here is what a static read can actually establish:
 * the numbers the frame specifies, the rules that decide what the rail SHOWS, and the
 * architectural boundaries that stop the redesign leaking back into the places it was
 * moved out of. The visual check is a headless render, and it caught what these cannot
 * (a truncated label, a UA button border); these catch what a render would not notice
 * six months from now (a number quietly re-tuned, the nudge widened to every severity).
 */

const rail = readSrc('components/primitives/rail.jsx');
/* Comment-free copies for the checks that look for ABSENCE. Three tests in this suite
 * already had to learn this the hard way (utility-collisions, typography, and this one
 * on its first run): a test that forbids a name cannot be explained in prose that uses
 * the name, and the explanation is usually the most useful thing in the file. */
const railCode = stripComments(rail);
const sidebar = readSrc('app/Sidebar.jsx');

test('the rail carries the frame\'s geometry, to the pixel', () => {
  // Every one of these is measured off node 1:2 rather than chosen. They are written as
  // arbitrary values on purpose — the bridge repoints Tailwind's named scale at this
  // app's older one (text-sm is 13px here, not 14), so `text-sm` would land a pixel off
  // the frame and nothing would say so.
  const geometry = [
    ['rail width', /w-\[248px\]/],
    ['rail padding', /\bp-6\b/],
    ['row height (44px)', /h-11 w-full items-center/],
    ['row radius', /rounded-\[12px\]/],
    ['row label', /text-\[14px\] leading-5 font-medium/],
    ['wordmark', /text-\[18px\] leading-7 font-semibold tracking-\[-0\.45px\]/],
    ['soon badge', /text-\[10px\] leading-\[14px\]/],
    ['nudge radius', /rounded-\[16px\]/],
    ['avatar', /size-9 shrink-0 rounded-full/],
  ];
  for (const [what, re] of geometry) {
    assert.match(rail, re, `${what} has drifted from the Figma frame`);
  }
});

test('the rail states are the frame\'s two, and they are token-driven', () => {
  // Active is a surface behind the row plus full-strength text; inactive is muted with
  // no fill. The frame has no third state, and inventing one (a left border, a tinted
  // label) is how a nav starts disagreeing with itself page to page.
  assert.match(rail, /bg-\[var\(--surface-2\)\] text-\[var\(--text\)\]/);
  assert.match(rail, /text-\[var\(--muted\)\]/);
  // Not one hex in the component. The token layer is the only place a colour is
  // decided — including the nudge wash, which is a decision (amber at 5% reads as
  // encouragement; the same hue at any real opacity reads as the warning it must not
  // be confused with) and therefore belongs with the palette.
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(rail), 'a colour literal appeared in the rail');
  for (const t of ['--nudge-bg', '--brand-mark-bg', '--rail-avatar-bg']) {
    assert.match(tokensCss, new RegExp(`${t}\\s*:`), `${t} must be declared in the token layer`);
  }
});

test('the nudge shows good news only, and nothing when there is none', () => {
  /* THE RULE THIS PROTECTS IS A SAFETY ONE, not a stylistic one. The card reads
   * "Keep going" over a line of progress. The notification stream carries both halves
   * of the story: warning/critical mean a drawdown limit is closing in. Widening the
   * filter to "the newest notification" would eventually print reassurance over the one
   * alert a trader has to act on within the minute. */
  const fn = sidebar.slice(sidebar.indexOf('function firstGoodNews'));
  assert.match(fn, /severity === 'info'/, 'the nudge must read info-severity notifications only');
  assert.ok(!/severity === 'warning'|severity === 'critical'/.test(fn),
    'a drawdown warning must never be dressed up as encouragement');
  // Absent, not faked, when there is nothing to say.
  assert.match(fn, /\|\| null/);
  assert.match(sidebar, /\{nudge && <RailNudge/);
});

test('the rail owns its own responsive behaviour, because legacy CSS no longer can', () => {
  /* The off-canvas drawer used to live in a `@media (max-width: 900px) .sidebar` block.
   * legacy/app.css now sits in the lowest cascade layer, so `position: fixed` there
   * loses to the `sticky` utility here and the drawer would silently stop leaving the
   * flow — a 248px rail eating two thirds of a phone. Utilities can only be beaten by
   * utilities, so the breakpoint moved into the component. */
  assert.match(rail, /max-\[900px\]:fixed/);
  assert.match(rail, /max-\[900px\]:w-\[min\(280px,84vw\)\]/);
  assert.match(rail, /motion-safe:max-\[900px\]:data-\[drawer\]:animate-\[drawer-in/);
});

test('the rail is presentation only — routing and the IA stay in Sidebar', () => {
  // The primitive must not learn about routes, the nav config or which item is current.
  // A rail that reads `useLocation` is a rail that cannot be rendered in a preview, a
  // second surface, or a test — and the IA stops having one source.
  for (const leak of ['react-router', 'nav.js', 'useLocation', 'useMatch']) {
    assert.ok(!railCode.includes(leak), `rail.jsx must not know about ${leak}`);
  }
  // `NAV` as an identifier, not as a substring — `RailNav` and `data-slot="rail-nav"`
  // are the rail's own vocabulary and match a bare includes().
  assert.ok(!/\bNAV\b/.test(railCode), 'rail.jsx must not read the nav config');
  // And the composition runs the other way: the page-level file writes no utilities,
  // because a Tailwind class outside components/{ui,primitives} compiles to nothing at
  // all — silently. This is the one rule in this repo that fails with no error message.
  assert.ok(!/className="[^"]*\b(flex|grid|gap-|p-|px-|py-|text-\[|bg-\[|rounded-)/.test(sidebar),
    'Sidebar.jsx writes Tailwind utilities, which do not compile outside the component library');
});

test('the brand mark is the shared Logo, drawn once', () => {
  /* The rail, the wizard header and the auth screen all render components/Logo.jsx, and
   * its geometry is shared with the marketing site's own mark. An earlier draft of the
   * primitive shipped a `RailMark` tile that drew the same rounded square a second time;
   * it is deleted, and this is what stops it coming back. */
  assert.ok(!/export\s+(?:function|const)\s+RailMark\b/.test(railCode),
    'the rail must not draw a second brand tile');
  assert.match(sidebar, /import Logo from/);
  assert.match(sidebar, /<Logo size=\{32\} \/>/, "32px is the frame's tile");
});
