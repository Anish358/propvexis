import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { appCss } from './helpers/app-css.js';

// Design B: the a11y + responsive gaps MASTER.md lists under "Known gaps"
// (empty states, skeletons, the mobile story for the sidebar and dense tables).
// The suite cannot import frontend modules — CI installs backend deps only — so
// components are read as text and pure helpers are extracted from their source.
const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const layout = read('../frontend/src/app/Layout.jsx');
const sidebar = read('../frontend/src/app/Sidebar.jsx');
const rail = read('../frontend/src/components/primitives/rail.jsx');
const announcer = read('../frontend/src/components/Announcer.jsx');
const mediaQuery = read('../frontend/src/lib/useMediaQuery.js');
const tradeLog = read('../frontend/src/features/trades/TradeLog.jsx');

// Lift the two pure announcement builders out of the .jsx (node:test cannot
// parse JSX) so their wording is asserted, not just their presence.
const announce = (() => {
  const src = announcer.slice(announcer.indexOf('export function tradeFeedAnnouncement'));
  return new Function(`${src.replace(/export function/g, 'function')}
    return { tradeFeedAnnouncement, connectionAnnouncement };`)();
})();

test('a skip link is the first focusable thing, and it has a target', () => {
  // The rail is ~20 tab stops. Without this, reaching page content by keyboard
  // means traversing the whole nav on every single navigation.
  const skipAt = layout.indexOf('className="skip-link"');
  const sidebarAt = layout.indexOf('<Sidebar');
  assert.ok(skipAt !== -1, 'the shell must render a skip link');
  assert.ok(skipAt < sidebarAt, 'the skip link must precede the nav in DOM order');
  assert.match(layout, /href="#main-content"/);
  assert.match(layout, /id="main-content"/);
  // Focusable by script but not a tab stop of its own.
  assert.match(layout, /<main[\s\S]{0,120}tabIndex=\{-1\}/);

  assert.match(appCss, /\.skip-link \{[\s\S]*?transform: translateY\(-200%\)/);
  assert.match(appCss, /\.skip-link:focus \{ transform: translateY\(0\); \}/);
});

test('the live region stays in the accessibility tree', () => {
  // Scoped to the rendered element, not the file: both "assertive" and
  // role="alert" legitimately appear in the comments explaining why they are
  // NOT used here, and a whole-file match would fail on the documentation.
  const jsx = announcer.slice(announcer.indexOf('return ('), announcer.indexOf('</div>'));
  assert.match(jsx, /aria-live="polite"/);
  assert.match(jsx, /aria-atomic="true"/);
  assert.match(jsx, /role="status"/);
  // Assertive would interrupt whatever the user is reading; a trade arriving
  // mid-sentence is not an emergency.
  assert.ok(!/assertive/.test(jsx), 'ambient updates must be polite');
  assert.ok(!/role="alert"/.test(jsx), 'alert is an implicit assertive region');

  // display:none / visibility:hidden would remove the node from the a11y tree,
  // so the region would never announce anything at all. Clip-rect is the point.
  assert.match(appCss, /\.sr-only \{[\s\S]*?clip: rect\(0 0 0 0\)/);
  const srOnly = appCss.slice(appCss.indexOf('.sr-only {'), appCss.indexOf('.sr-only {') + 260);
  assert.ok(!/display:\s*none/.test(srOnly) && !/visibility:\s*hidden/.test(srOnly));
});

test('sr-only is real CSS, not a Tailwind class that compiles to nothing', () => {
  // Utilities generate for components/{ui,primitives} ONLY. Announcer.jsx lives
  // in components/, where a Tailwind class silently emits no CSS — no build
  // error, no failing test, just an invisible-to-everyone live region.
  assert.match(announcer, /className="sr-only"/);
  assert.match(appCss, /\.sr-only \{/, 'sr-only must be declared in the app stylesheet');
});

test('announcements describe the change, not the state', () => {
  const { tradeFeedAnnouncement, connectionAnnouncement } = announce;
  // Nothing to say on first paint — that would talk over the page the user
  // just navigated to.
  assert.equal(tradeFeedAnnouncement(null, 12), null);
  assert.equal(tradeFeedAnnouncement(12, 12), null);

  assert.equal(tradeFeedAnnouncement(12, 13), '1 trade added. 13 shown.');
  assert.equal(tradeFeedAnnouncement(12, 15), '3 trades added. 15 shown.');
  assert.equal(tradeFeedAnnouncement(15, 12), '3 trades removed. 12 shown.');
  assert.equal(tradeFeedAnnouncement(1, 0), '1 trade removed. 0 shown.');

  // A dropped socket means every number on screen is quietly going stale.
  assert.equal(connectionAnnouncement(null, true), null);
  assert.equal(connectionAnnouncement(true, true), null);
  assert.match(connectionAnnouncement(true, false), /Disconnected/);
  assert.match(connectionAnnouncement(false, true), /Reconnected/);
});

/* THE DRAWER'S BEHAVIOUR WAS GIVEN AWAY ON 2026-08-29, AND THAT IS THE POINT.
 *
 * These three tests used to pin ~40 lines of hand-rolled drawer mechanics in Layout.jsx
 * and Sidebar.jsx: an Escape listener, a body-scroll lock that saved and restored the
 * previous overflow, a `document.contains` guard before returning focus, a scrim with
 * aria-hidden, a `role="dialog"` applied only while the rail WAS a drawer, and focusing
 * the close button on open. Every one of those was a real requirement, correctly
 * implemented, and correctly tested.
 *
 * The rail is @shadcn/sidebar now (owner: shadcn is the default component system), and
 * below 900px it renders a Base UI Sheet — so all of it is the library's, plus a focus
 * TRAP the hand-rolled version never had. Re-asserting someone else's implementation
 * detail here would mean a red suite on every dependency bump, teaching nothing.
 *
 * SO THESE ASSERT THE REQUIREMENTS THAT ARE STILL OURS, and there are exactly three:
 * that the drawer is what we render below 900, that navigating closes it (the library
 * has no idea the app routed), and that the nav landmark survived the swap.
 */
test('below 900px the rail is a real modal drawer, from the library', () => {
  // `collapsible="icon"` is the whole contract: 248 <-> 70 on desktop, a Sheet below the
  // breakpoint. Anything else ("offcanvas", "none") silently changes what a phone gets.
  assert.match(rail, /collapsible="icon"/, 'the rail must collapse to icons, not off-canvas');
  const ui = read('../frontend/src/components/ui/sidebar.jsx');
  assert.match(ui, /<Sheet open=\{openMobile\}/, 'the mobile branch must be a real Sheet');
  // The Sheet is a Dialog — that is where Escape, the scrim, the scroll lock and the
  // focus trap come from. If this import goes, so do all four, silently.
  assert.match(ui, /from "@\/components\/ui\/sheet"/);
});

test('the rail no longer hand-rolls dialog semantics on the desktop rail', () => {
  // A static rail announcing itself as a dialog is a lie every desktop screen-reader
  // user hears on every page. It used to be avoided by branching on `inDrawer`; now the
  // desktop rail is simply not a Sheet, so the branch — and the prop — are gone.
  /* Comment-stripped, because the file explains this removal in prose that necessarily
   * uses the name — the fourth test in this repo to learn that a test forbidding a name
   * cannot read the paragraph justifying it. */
  const sidebarCode = sidebar.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!sidebarCode.includes('inDrawer'), 'the inDrawer branch went with the hand-rolled drawer');
  assert.ok(!/role: 'dialog'/.test(sidebarCode), 'dialog semantics belong to the Sheet now');
  // The <nav> landmark and its label survived the swap. This is the half a component
  // change most easily drops, and it is the half a screen reader needs.
  assert.match(sidebar, /<RailNav aria-label="Main">/);
});

test('the drawer closes on navigation — the one thing the library cannot know', () => {
  /* Navigating is the point of the drawer; leaving it open hides the page the user just
   * asked for. The Sheet has no idea the router moved, so this stays ours.
   *
   * MOBILE ONLY, deliberately: collapsing the desktop rail on every navigation would
   * undo a choice the user made on purpose. */
  assert.match(layout, /if \(isMobile\) setOpenMobile\(false\);/);
  assert.match(layout, /\}, \[pathname, isMobile, setOpenMobile\]\)/);
});

test('JS and CSS agree on one breakpoint', () => {
  // Eight ad-hoc widths is how "mobile" comes to mean something different in
  // every rule. The shell switches on exactly one, in both languages.
  assert.match(mediaQuery, /MOBILE_QUERY = '\(max-width: 900px\)'/);
  const block = appCss.slice(appCss.indexOf('Design B — responsive shell'));
  assert.match(block, /@media \(max-width: 900px\)/);
  assert.ok(!/@media \(max-width: (860|880|920)px\)/.test(block),
    'the shell must not introduce a second near-miss breakpoint');
});

test('the mobile table trade-off is made explicitly, not by accident', () => {
  const block = appCss.slice(appCss.indexOf('Design B — responsive shell'));
  // body has overflow-x: hidden on the argument that anything that wide is
  // blank overflow. That holds on desktop and is false on a phone, where every
  // column of the trade table is real data.
  assert.match(block, /\.log-panel \.grid-wrap \{ overflow-x: auto/);
  // A scroll box captures the sticky header, so the header must stop being
  // sticky at this width — otherwise it pins itself out of sight.
  assert.match(block, /\.log-panel \.log-grid thead th \{ position: static; \}/);
  assert.match(block, /table-layout: auto; min-width: 720px/);
  // The desktop rule it is overriding must still exist, or this is overriding
  // nothing and the sticky header is simply gone everywhere.
  assert.match(appCss, /\.log-panel \.grid-wrap \{ overflow: visible; \}/);
});

test('touch targets on the drawer meet the 44px floor', () => {
  const block = appCss.slice(appCss.indexOf('Design B — responsive shell'));
  /* THE 44px TARGET MOVED FROM A MEDIA QUERY INTO THE ROW ITSELF (2026-08-28). It used
   * to be a mobile-only floor bolted onto the legacy rail; `RailItem` is now h-11 = 44px
   * at every width, which is the same guarantee made unconditionally. Asserted at the
   * primitive because that is where the height now lives — and because legacy CSS sits
   * in the lowest cascade layer, so a rule there could no longer enforce it anyway. */
  /* 44px WHERE TOUCH HAPPENS, 40px WHERE IT DOES NOT (2026-08-29). The floor used to be
   * unconditional, on the reasoning that one height is simpler than two. It is — but the
   * reason for 44 is a FINGER, and below 900px is the only place this rail is touched:
   * above it the rail is a pointer-driven desktop column, and Rhea's 40px row is what
   * puts the nav items 45px apart instead of 50.
   *
   * So the guarantee is unchanged where it means something, and the test says which
   * width it applies at rather than asserting a number that had stopped having a
   * reason. */
  assert.match(rail, /'h-10 max-\[900px\]:h-11 gap-3 rounded-\[10px\]/,
    'rail rows must be 44px tall wherever they are touched');
  assert.match(block, /\.sb-collapse \{ min-width: 44px; min-height: 44px; \}/);
  // dvh, not vh: vh ignores mobile browser chrome, so the drawer's last item
  // sits under the address bar.
  assert.match(block, /height: 100dvh/);
});

test('the drawer animation respects a reduced-motion preference', () => {
  assert.match(appCss, /@media \(max-width: 900px\) and \(prefers-reduced-motion: no-preference\)/);
  // Opt-IN phrasing: the animation only exists when motion is welcome, rather
  // than being defined and then disabled.
  const anim = appCss.slice(appCss.indexOf('prefers-reduced-motion: no-preference'));
  assert.match(anim, /animation: drawer-in/);
});

test('the trade log distinguishes "no trades" from "no matches"', () => {
  // Identical on screen, opposite fixes: one wants an import, the other wants
  // the filters widened.
  assert.match(tradeLog, /const filtersActive = activeFilterCount\(filters\) > 0/);
  assert.match(tradeLog, /trades\.length === 0 \? \(\s*\n\s*<EmptyState/);
  assert.match(tradeLog, /filtersActive \? 'No trades match these filters' : 'No trades yet'/);
  // Each branch offers the action that actually resolves it.
  assert.match(tradeLog, /onClick=\{clearFilters\}>Clear filters</);
  assert.match(tradeLog, /onClick=\{\(\) => setImporting\(true\)\}>Import CSV</);
  /* clearFilters has to reach the page, or the button is decorative.
   *
   * WAS a match on the literal string `unit, filters, clearFilters, connected` — one
   * line of Layout's outlet-context object. That pinned the ORDER of an object literal,
   * so re-wrapping it (which the 2026-08-29 rail rewrite did, moving the context into a
   * named prop) failed a test about the trade log's empty state. It asserts the key is
   * in the context now, which is the actual requirement. */
  const context = layout.slice(layout.indexOf('outletContext={{'), layout.indexOf('}}\n      />'));
  assert.ok(context.includes('clearFilters'), 'clearFilters must reach the page through the outlet context');
  assert.ok(context.includes('filters'), 'the filters themselves too');
});
