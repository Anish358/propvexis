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

test('the drawer is dismissible, restores focus, and locks the page behind it', () => {
  assert.match(layout, /e\.key === 'Escape'/, 'Escape must close the drawer');
  assert.match(layout, /onClick=\{\(\) => setCollapsed\(true\)\}[\s\S]{0,80}aria-hidden="true"/,
    'the scrim dismisses and is hidden from assistive tech');
  // Page behind a drawer must not scroll under the user's finger...
  assert.match(layout, /document\.body\.style\.overflow = 'hidden'/);
  // ...and the original value is restored, not hardcoded back to ''.
  assert.match(layout, /const previousOverflow = document\.body\.style\.overflow/);
  assert.match(layout, /document\.body\.style\.overflow = previousOverflow/);
  // Focus goes back where it came from, or the next Tab restarts at the top of
  // the document.
  assert.match(layout, /restoreFocusTo\.current = document\.activeElement/);
  assert.match(layout, /document\.contains\(target\)/, 'never focus a detached node');
  // Opening moves focus INTO the drawer.
  assert.match(sidebar, /if \(inDrawer\) closeRef\.current\?\.focus\(\)/);
});

test('the drawer claims modal semantics only while it IS a drawer', () => {
  // A static rail announcing itself as a dialog would be a lie every desktop
  // screen-reader user hears on every page.
  assert.match(sidebar, /\.\.\.\(inDrawer \? \{ role: 'dialog', 'aria-modal': 'true'/);
  assert.match(sidebar, /aria-label=\{inDrawer \? 'Close menu' : 'Hide sidebar'\}/);
  assert.match(sidebar, /<nav className="sb-nav" aria-label="Main">/);
});

test('the drawer closes on navigation and on crossing the breakpoint', () => {
  // Navigating is the point of the drawer; leaving it open hides the page the
  // user just asked for.
  assert.match(layout, /useEffect\(\(\) => \{\s*\n\s*if \(isMobile\) setCollapsed\(true\);\s*\n\s*\}, \[location\.pathname, isMobile\]\)/);
  // Rotating a phone with it open must not leave a rail eating the viewport.
  assert.match(layout, /useEffect\(\(\) => \{ setCollapsed\(isMobile\); \}, \[isMobile\]\)/);
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
  assert.match(block, /\.log-panel \.grid thead th \{ position: static; \}/);
  assert.match(block, /table-layout: auto; min-width: 720px/);
  // The desktop rule it is overriding must still exist, or this is overriding
  // nothing and the sticky header is simply gone everywhere.
  assert.match(appCss, /\.log-panel \.grid-wrap \{ overflow: visible; \}/);
});

test('touch targets on the drawer meet the 44px floor', () => {
  const block = appCss.slice(appCss.indexOf('Design B — responsive shell'));
  assert.match(block, /\.sidebar \.sb-item, \.sidebar \.sb-sub-item \{ min-height: 44px; \}/);
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
  // clearFilters has to reach the page, or the button is decorative.
  assert.match(layout, /unit, filters, clearFilters, connected/);
});
