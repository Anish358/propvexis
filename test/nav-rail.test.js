import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSrc, stripComments } from './helpers/src-files.js';
import { bridgeCss, tokensCss } from './helpers/app-css.js';

/* THE NAVIGATION RAIL, pinned against Base Rhea (2026-08-29).
 *
 * This repo cannot render a component in a test — no jsdom, no React Testing Library,
 * by decision — so what is asserted here is what a static read can actually establish:
 * the numbers the design specifies, the rules that decide what the rail SHOWS, and the
 * architectural boundaries that stop the redesign leaking back into the places it was
 * moved out of. The visual check is a headless render, and it caught what these cannot
 * (a truncated label, UA list bullets); these catch what a render would not notice six
 * months from now (a number quietly re-tuned, the toggle hidden at 70px).
 *
 * WHAT THIS SUITE USED TO PROTECT, and why most of it moved. The rail was hand-composed
 * against an intermediate Figma pass, and these tests pinned its 248px width, its own
 * `max-[900px]:fixed` drawer rules, its sticky/overflow arrangement and its 32px brand
 * tile. The rail is @shadcn/sidebar now (owner: shadcn is the default component system),
 * so the DRAWER and the STICKY COLUMN are the library's and no longer ours to assert —
 * pinning someone else's implementation detail is how a dependency bump turns into a red
 * suite that teaches nothing. What survives is what is still OURS: the Rhea numbers we
 * override, the states, the token discipline, and the boundary that keeps routing out of
 * the primitive.
 */

const rail = readSrc('components/primitives/rail.jsx');
/* Comment-free copies for the checks that look for ABSENCE. Three tests in this suite
 * already had to learn this the hard way (utility-collisions, typography, and this one
 * on its first run): a test that forbids a name cannot be explained in prose that uses
 * the name, and the explanation is usually the most useful thing in the file. */
const railCode = stripComments(rail);
const sidebar = readSrc('app/Sidebar.jsx');

test('the rail carries Rhea\'s geometry, to the pixel', () => {
  // Every one of these is measured off the Rhea prototype rather than chosen. They are
  // written as arbitrary values on purpose — the bridge repoints Tailwind's named scale
  // at this app's own one (text-sm is 13px here, not 14), so `text-sm` would land a
  // pixel off the design and nothing would say so.
  const geometry = [
    ['row height (44px)', /h-11 gap-3 rounded-\[10px\]/],
    ['row label', /text-\[14\.5px\] leading-5 font-medium/],
    ['wordmark', /text-\[16\.5px\] leading-6 font-\[650\] tracking-\[-0\.25px\]/],
    ['soon badge', /text-\[10px\] leading-\[14px\]/],
    ['sub row', /h-9 gap-2 rounded-\[8px\] px-2 text-\[13px\]/],
    ['avatar', /size-7 shrink-0 rounded-full/],
    ['identity row', /h-12 gap-2\.5 rounded-\[10px\]/],
  ];
  for (const [what, re] of geometry) {
    assert.match(rail, re, `${what} has drifted from the Rhea design`);
  }
});

test('the two rail widths are Rhea\'s, and they reach the library as properties', () => {
  /* 248 expanded, 70 collapsed. The generated Sidebar defaults to 16rem/3rem and takes
   * both as custom properties on the provider — which is the seam it offers for exactly
   * this, and the reason adopting it did not require a fork. Asserted as the pair
   * because a 70px icon rail with a 16rem gap beside it is the failure mode: the content
   * column would start 186px from where the rail ends. */
  assert.match(rail, /'--sidebar-width': *'248px'/);
  assert.match(rail, /'--sidebar-width-icon': *'70px'/);
});

test('the collapse control survives the collapse', () => {
  /* THE ONE WAY BACK TO 248px. Every other label in the rail is dropped at 70px, and
   * doing the same to the toggle would strand the user in an icon rail with no control
   * that reopens it. The 33px mark and the 32px button cannot share a 42px line, so the
   * header stacks instead of hiding either. */
  const brand = rail.slice(rail.indexOf('export function RailBrand'), rail.indexOf('export const RailAction'));
  assert.match(brand, /collapsed \? 'flex-col items-center'/, 'the brand row must stack at 70px');
  assert.ok(!/\{!collapsed && action\}|\{state === 'expanded' && action\}/.test(brand),
    'the collapse control must render at BOTH widths — it is the only way to expand again');
});

test('labels are conditionally rendered, never `hidden`', () => {
  /* `hidden` sets display:none from a UA rule, which loses to ANY author display — and
   * every label here sits in a flex parent that sets one. So a hidden label is still
   * drawn, clipped, at 70px. This repo has paid for that once already; the rail must
   * not re-learn it. */
  // `overflow-*-hidden` is an overflow rule, and `aria-hidden` is the accessibility
  // tree — neither is the display utility this forbids. Matched as a standalone class
  // token so the two cannot be confused with it.
  const classNames = [...railCode.matchAll(/'([^']*)'/g)].map((m) => m[1]).join(' ');
  assert.ok(!/(^| )hidden( |$)/.test(classNames),
    'use a conditional render, not `hidden` — the UA rule loses to an author display');
  assert.match(railCode, /\{!collapsed &&/, 'labels drop by not being rendered');
});

test('the UA list reset is present, because preflight is not', () => {
  /* SidebarMenu renders a real <ul>. Tailwind's preflight would zero its marker and its
   * 40px inset; we deliberately do not import preflight (it would restyle 800 live
   * legacy classes), so the reset has to be here. Without it the rail renders bulleted
   * and indented, and every label truncates by the width the markers took — which is
   * exactly how it first rendered. */
  assert.match(railCode, /list-none/, 'the menu lists must reset the UA marker');
});

test('the rail states are Rhea\'s two, and they are token-driven', () => {
  // Active is a quiet fill behind the row plus full-strength text; inactive is muted
  // with no fill. There is no third state, and inventing one (a left border, a tinted
  // label) is how a nav starts disagreeing with itself page to page.
  //
  // WAS --surface-2. Rhea gives "selected" its own role: --sel-bg is a fill that reads
  // as RAISED on the rail's darker ground, where --sel-well reads as recessed on a
  // card. Same token name would have been the same value in two opposite directions.
  assert.match(rail, /bg-\[var\(--sel-bg\)\]/);
  assert.match(rail, /text-\[var\(--muted\)\]/);
  // Not one hex in the component. The token layer is the only place a colour is
  // decided — including the nudge wash, which is a decision (amber at 5% reads as
  // encouragement; the same hue at any real opacity reads as the warning it must not
  // be confused with) and therefore belongs with the palette.
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(rail), 'a colour literal appeared in the rail');
  for (const t of ['--nudge-bg', '--brand-mark-bg', '--rail-avatar-bg', '--sel-bg']) {
    assert.match(tokensCss, new RegExp(`${t}\\s*:`), `${t} must be declared in the token layer`);
  }
});

test('there is no nudge card in the rail footer', () => {
  /* REMOVED 2026-08-28, owner call, and this test is inverted rather than deleted.
   *
   * The frame draws an amber "Keep going" card above the identity row. It was built and
   * wired to the real notification stream, filtered to info severity so it could never
   * print reassurance over a drawdown warning — that filter was the whole point of the
   * test this replaces. It is gone because a permanent card in the rail spends vertical
   * space on every screen repeating what Alerts and Today's Brief already say, and the
   * rail is navigation.
   *
   * `RailNudge` stays exported: it works, and this was a placement decision. What must
   * not come back silently is the WIRING — if the card returns, the info-only filter has
   * to return with it, so this fails and sends the next reader to that reasoning. */
  assert.ok(!sidebar.includes('<RailNudge'), 'the rail footer must not render a nudge card');
  assert.ok(!sidebar.includes('firstGoodNews'), 'the notification wiring went with it');
  assert.ok(!sidebar.includes('notifications'), 'the rail no longer takes the alert stream');
});

test('the 900px rail breakpoint is set in both places, and they agree', () => {
  /* WHAT THIS USED TO PROTECT: the rail's own `max-[900px]:fixed` drawer rules, which
   * had been moved out of a legacy `@media` block because legacy CSS sits in the lowest
   * cascade layer and `position: fixed` there would lose to the `sticky` utility.
   *
   * The drawer is @shadcn/sidebar's Sheet now, so those rules are gone. THE RULE THAT
   * REPLACES THEM IS HARDER TO SEE AND EASIER TO BREAK: the library decides
   * drawer-vs-rail in JS (hooks/use-mobile.js) and paints the desktop rail in CSS
   * (`md:` variants), so 900 has to be written twice and the two have to agree. If they
   * drift, then between the two numbers the rail is a drawer that still reserves its
   * 248px gap, or a rail with no way to open it — silently, and only in that band.
   *
   * AND `--breakpoint-md` MUST BE IN A PLAIN `@theme`, not `@theme inline`: declared
   * inline it does not register as a screen, `md:block` is emitted by nothing, and the
   * rail keeps the `hidden` half of `hidden md:block` at every width. The entire
   * navigation disappears and no test that reads markup would notice. */
  const hook = readSrc('hooks/use-mobile.js');
  const js = hook.match(/const MOBILE_BREAKPOINT = (\d+)/);
  assert.ok(js, 'use-mobile.js must declare MOBILE_BREAKPOINT');
  assert.equal(js[1], '900', 'the JS breakpoint must be the rail number from DESIGN-LANGUAGE §22');

  const css = bridgeCss.match(/--breakpoint-md: *(\d+)px/);
  assert.ok(css, 'bridge.css must repoint Tailwind\'s `md` screen');
  assert.equal(css[1], js[1], 'the CSS and JS breakpoints must be the same number');

  // Comment-stripped, or the search finds the `@theme inline` in the prose right above
  // the declaration explaining why it must not be one. (It found it. That is why this
  // line says so.)
  const bridgeCode = bridgeCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const at = bridgeCode.indexOf('--breakpoint-md');
  const opener = bridgeCode.lastIndexOf('@theme', at);
  assert.ok(!/^@theme\s+inline/.test(bridgeCode.slice(opener, opener + 20)),
    '--breakpoint-md must be in a PLAIN @theme — `inline` does not register a screen');
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
  // WAS a flat `size={32}`. Rhea draws 33 in the expanded rail and the mark has to come
  // down at 70px to sit inside 42px of content width with the toggle stacked under it.
  assert.match(sidebar, /<Logo size=\{collapsed \? 28 : 33\} \/>/,
    'the mark sizes to the rail state');
});
