import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NAV, LEGACY_REDIRECTS, navRoutes } from '../frontend/src/nav.js';

// The IA config (frontend/src/nav.js) is deliberately JSX-free so we can guard
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
