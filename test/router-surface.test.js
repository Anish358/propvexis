import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { appFiles } from './helpers/src-files.js';

// react-router-dom went 6 -> 7 to clear three moderate advisories. The app uses
// only the DECLARATIVE api, so almost none of v7's breaking surface applies —
// but "almost none" is a judgement, and these assertions are what keep it true.
//
// EVERYTHING HERE IS STATIC, on purpose. This suite runs `npm ci` for the BACKEND
// only (ci.yml, deploy-env.yml), so `frontend/node_modules` does not exist in CI.
// Every other test in this repo reads frontend source as TEXT for exactly that
// reason. A first version of this file imported react-router-dom to enumerate its
// real exports; it passed locally and failed CI with "Cannot find module". The
// export surface is enforced instead by the build — see the last test.

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const srcDir = fileURLToPath(new URL('../frontend/src', import.meta.url));
const readSrc = (rel) => readFileSync(`${srcDir}/${rel}`, 'utf8');

test('react-router stays at or above the version that fixed the advisories', () => {
  // GHSA-wrjc-x8rr-h8h6 (open redirect via backslash in <Link>/useNavigate),
  // GHSA-337j-9hxr-rhxg (constructor injection via deserializeErrors) and
  // GHSA-jjmj-jmhj-qwj2 (open redirect -> XSS) are all fixed in 7.18.0. A
  // downgrade would silently reintroduce all three, and `npm audit` only runs in
  // the Security workflow — which is deliberately allowed to go red on a NEW
  // advisory without blocking a feature PR. So the floor is pinned here too.
  const pkg = JSON.parse(read('../frontend/package.json'));
  const range = pkg.dependencies['react-router-dom'];
  const [major, minor] = range.replace(/^[^0-9]*/, '').split('.').map(Number);
  assert.ok(major > 7 || (major === 7 && minor >= 18),
    `react-router-dom is ${range} — 7.18.0+ carries the fixes for three advisories`);
});

test('the app stays on the declarative router, not the data router', () => {
  // THIS IS THE ASSUMPTION THE UPGRADE RESTED ON. v7's breaking changes are
  // concentrated in the DATA router: loaders, actions, the removed json()/defer()
  // helpers, fetcher and hydration behaviour, and the former v7_* future flags
  // becoming defaults. None of it reaches a <BrowserRouter> + <Routes> app. If
  // someone adopts createBrowserRouter, that reasoning stops holding and the next
  // major needs evaluating from scratch rather than by analogy with this one.
  const DATA_ROUTER = /createBrowserRouter|createHashRouter|RouterProvider|useLoaderData\b|useActionData|useFetcher|useRevalidator|\bdefer\(/;
  const offenders = appFiles().filter((f) => DATA_ROUTER.test(readSrc(f)));
  assert.deepEqual(offenders, [],
    'these files use the data router — re-check the v7 migration notes before trusting this upgrade');
});

test('no relative link resolution, so relativeSplatPath cannot bite', () => {
  // v7 makes the old v7_relativeSplatPath flag the default: relative paths inside
  // a splat (`*`) route resolve differently. The app has one splat route and it
  // navigates to an absolute path, and every `to=` in the app is absolute — which
  // is what makes that default a no-op here.
  for (const f of appFiles().filter((x) => /path="[^"]*\*/.test(readSrc(x)))) {
    for (const m of readSrc(f).matchAll(/<Navigate\s+to=\{?["']([^"']+)/g)) {
      assert.ok(m[1].startsWith('/'), `${f}: <Navigate to="${m[1]}"> inside a splat route must be absolute`);
    }
  }
  const relative = [];
  for (const f of appFiles()) {
    for (const m of readSrc(f).matchAll(/\bto="([^"]+)"/g)) {
      if (!m[1].startsWith('/')) relative.push(`${f}: to="${m[1]}"`);
    }
  }
  assert.deepEqual(relative, [],
    'a relative `to=` appeared — re-check v7 relative-path resolution inside splat routes');
});

test('the build still fails on a missing named export', () => {
  // THE ONE THAT MATTERS, and the reason it is asserted rather than trusted.
  //
  // Importing a name a dependency does not export is a Rollup WARNING: it prints
  // one line, exits 0, and ships the binding as `undefined`. Rendering
  // `<undefined>` blanks the page behind the error boundary. That is exactly how a
  // component-library major breaks an app, and it is invisible to this suite —
  // which never imports frontend packages — and to a green build.
  //
  // vite.config.js promotes MISSING_EXPORT to a build failure, which is what
  // actually checks the export surface in CI (the frontend build runs in the
  // deploy job). Deleting that hook would remove the protection silently, so its
  // presence is pinned here. Verified by importing a non-existent react-router
  // export: without the hook, "✓ built" and exit 0; with it, exit 1.
  const cfg = read('../frontend/vite.config.js');
  assert.match(cfg, /onwarn\s*\(/, 'vite.config.js lost its onwarn hook');
  assert.match(cfg, /MISSING_EXPORT/, 'onwarn no longer promotes MISSING_EXPORT');
  const hook = cfg.slice(cfg.indexOf('onwarn'), cfg.indexOf('output:', cfg.indexOf('onwarn')));
  assert.match(hook, /throw new Error/, 'MISSING_EXPORT must THROW, not just log — a warning exits 0');
});

test('the wizard is declarative routing like everything else', () => {
  // The v7 upgrade rested on this app using only the declarative router. Eleven new
  // routes are the largest addition since, so the assumption is re-checked where it
  // can be named rather than only in the app-wide sweep above.
  const shell = read('../frontend/src/features/accounts/NewAccountFlow.jsx');
  assert.equal(/createBrowserRouter|RouterProvider|useLoaderData|useFetcher/.test(shell), false,
    'the wizard must not adopt the data router — the v7 migration reasoning stops holding');
  // It navigates by <Navigate> and useNavigate, and every target is absolute, which the
  // app-wide relative-`to` test already enforces.
  assert.match(shell, /useNavigate|<Navigate/);
});
