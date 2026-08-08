import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NAV, LEGACY_REDIRECTS, navRoutes, navTitle, OFF_NAV_TITLES } from '../frontend/src/app/nav.js';

import { appCss } from './helpers/app-css.js';
// The IA config (frontend/src/app/nav.js) is deliberately JSX-free so we can guard
// its invariants here: the Sidebar and the route table both render from it, so
// a malformed entry breaks navigation app-wide.

test('nav: every item has a label and either a route or children', () => {
  for (const item of NAV) {
    assert.ok(item.label, 'label required');
    assert.ok(item.icon, `icon key required for ${item.label}`);
    if (item.children) {
      assert.ok(item.base?.startsWith('/'), `${item.label} needs a /base`);
      assert.ok(item.children.length > 0);
    } else {
      assert.ok(item.to?.startsWith('/'), `${item.label} needs a /to`);
    }
  }
});

test('nav: child routes live under their module base', () => {
  for (const item of NAV.filter((i) => i.children)) {
    for (const c of item.children) {
      assert.ok(
        c.to === item.base || c.to.startsWith(item.base + '/'),
        `${c.to} outside ${item.base}`
      );
      assert.ok(c.label, `child of ${item.label} missing label`);
    }
  }
});

test('nav: all routes are unique', () => {
  const all = [];
  for (const item of NAV) {
    if (item.children) all.push(...item.children.map((c) => c.to));
    else all.push(item.to);
  }
  assert.equal(new Set(all).size, all.length, `duplicate routes in ${all}`);
});

test('nav: module index routes are marked end (so Overview does not stay lit)', () => {
  for (const item of NAV.filter((i) => i.children)) {
    const index = item.children.find((c) => c.to === item.base);
    if (index) assert.equal(index.end, true, `${item.base} index child needs end:true`);
  }
});

test('legacy redirects point at real nav routes', () => {
  const real = new Set(navRoutes());
  for (const [from, to] of Object.entries(LEGACY_REDIRECTS)) {
    assert.ok(from.startsWith('/'), `bad redirect source ${from}`);
    assert.ok(real.has(to), `redirect target ${to} is not a nav route`);
    assert.notEqual(from, to, 'redirect to itself');
  }
});

test('navRoutes excludes redirect sources', () => {
  const routes = navRoutes();
  for (const from of Object.keys(LEGACY_REDIRECTS)) {
    assert.ok(!routes.includes(from), `${from} should be a redirect, not a route`);
  }
});

// ---- navTitle: the top bar's "you are here" label ---------------------------
// It reads from this same config, so the top bar and sidebar can never disagree
// about which page is open.

test('navTitle: top-level routes name themselves, with no module', () => {
  assert.deepEqual(navTitle('/'), { module: null, page: 'Dashboard' });
  assert.deepEqual(navTitle('/strategies'), { module: null, page: 'Strategies' });
  assert.deepEqual(navTitle('/alerts'), { module: null, page: 'Alerts' });
  assert.deepEqual(navTitle('/settings'), { module: null, page: 'Settings' });
});

test('navTitle: module routes carry the module name', () => {
  // The module is what disambiguates: Trade Journal and Prop OS BOTH have an
  // Analytics page, so a bare leaf label would be identical for two routes.
  assert.deepEqual(navTitle('/journal/analytics'), { module: 'Trade Journal', page: 'Analytics' });
  assert.deepEqual(navTitle('/prop/analytics'), { module: 'Prop OS', page: 'Analytics' });
  assert.deepEqual(navTitle('/journal/trades'), { module: 'Trade Journal', page: 'Trade Log' });
  assert.deepEqual(navTitle('/prop/finance'), { module: 'Prop OS', page: 'Finance' });
});

test('navTitle: `end` entries own only their exact path', () => {
  // '/' is end:true, so it must not swallow every route in the app.
  assert.deepEqual(navTitle('/journal'), { module: 'Trade Journal', page: 'Overview' });
  assert.deepEqual(navTitle('/prop'), { module: 'Prop OS', page: 'Overview' });
  assert.notDeepEqual(navTitle('/strategies'), { module: null, page: 'Dashboard' });
});

test('navTitle: normalizes trailing slashes and legacy paths', () => {
  assert.deepEqual(navTitle('/journal/trades/'), { module: 'Trade Journal', page: 'Trade Log' });
  assert.deepEqual(navTitle('/'), navTitle('/'));
  // A legacy path resolves rather than blanking for the frame before the
  // router's redirect lands.
  for (const [from, to] of Object.entries(LEGACY_REDIRECTS)) {
    assert.deepEqual(navTitle(from), navTitle(to), `${from} should title the same as ${to}`);
  }
});

test('navTitle: unknown paths return null instead of guessing', () => {
  for (const p of ['/nope', '/journal-ish', '/login', '']) {
    assert.equal(navTitle(p), null, `${p} should have no title`);
  }
  assert.deepEqual(navTitle(), { module: null, page: 'Dashboard' }, 'defaults to root');
});

test('navTitle: every real route in the app has a name', () => {
  // A route with no title renders a blank top-left corner, which reads as a bug.
  for (const to of navRoutes()) {
    assert.ok(navTitle(to), `no title for nav route ${to}`);
  }
  // Routes reached from a menu rather than the sidebar are covered too.
  for (const [path, label] of Object.entries(OFF_NAV_TITLES)) {
    assert.deepEqual(navTitle(path), { module: null, page: label });
  }
});

// ---- rail stays put ---------------------------------------------------------

test('the nav list scrolls inside the rail, not the rail with the page', () => {
  const css = appCss;
  const rail = css.slice(css.indexOf('.sidebar {'), css.indexOf('}', css.indexOf('.sidebar {')));
  // The rail is a fixed-height sticky column...
  assert.match(rail, /position: sticky; top: 0/);
  assert.match(rail, /height: 100vh/);
  // ...so the nav inside it MUST be bounded. Otherwise an expanded nav overflows
  // the 100vh box, that overflow becomes page height, and the sticky rail (whose
  // containing block is only 100vh when the main column is short) has no room to
  // travel and scrolls off the top with the page.
  const nav = css.slice(css.indexOf('.sb-nav {'), css.indexOf('}', css.indexOf('.sb-nav {')));
  assert.match(nav, /overflow-y: auto/);
  // min-height:0 is what actually lets it shrink — a flex item's default
  // min-height:auto refuses to go below its content and keeps the overflow.
  assert.match(nav, /min-height: 0/);
  assert.match(nav, /flex: 1 1 auto/);
  assert.match(nav, /overscroll-behavior: contain/);
});

test('a page with nothing to scroll to does not scroll', () => {
  const css = appCss;
  // The top bar is a SIBLING above .page inside .shell-main, so .page must fill
  // only what's left below it. A flat 100vh made the document one bar-height
  // taller than the viewport on every page — a short page still scrolled, and all
  // it revealed was the layout sliding under the bar.
  assert.match(css, /\.page \{ min-height: calc\(100vh - var\(--topbar-h, \d+px\)\); \}/);
  assert.ok(!/\.page \{ min-height: 100vh; \}/.test(css), 'a flat 100vh double-counts the top bar');
});
