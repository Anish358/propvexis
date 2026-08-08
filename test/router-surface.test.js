import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

import { appFiles } from './helpers/src-files.js';

// react-router-dom went 6 -> 7 to clear three moderate advisories. The app uses
// only the DECLARATIVE api, so almost none of v7's breaking surface applies —
// but "almost none" is a judgement, and a router major that drops an export
// fails at RENDER time, not at build time: Vite happily bundles `undefined` as a
// component and the page goes blank behind the error boundary.
//
// So the import surface is pinned. The expected list is DERIVED from the app's
// own imports rather than hardcoded, so it cannot drift out of date, and it is
// checked against the installed package.

const srcDir = fileURLToPath(new URL('../frontend/src', import.meta.url));
const read = (rel) => readFileSync(`${srcDir}/${rel}`, 'utf8');

/** Every binding the app imports from react-router-dom, across all of src/. */
function importedFromRouter() {
  const names = new Set();
  for (const f of appFiles()) {
    for (const m of read(f).matchAll(/import\s+\{([^}]*)\}\s+from\s+'react-router-dom'/g)) {
      for (const part of m[1].split(',')) {
        const t = part.trim();
        if (t) names.add((t.split(/\s+as\s+/)[0] || t).trim());
      }
    }
  }
  return [...names].sort();
}

// react-router-dom is a FRONTEND dependency and this suite runs from the repo
// root, so a bare `import('react-router-dom')` resolves against the backend's
// node_modules and fails. Resolve it from frontend/'s own module scope instead.
const requireFromFrontend = createRequire(new URL('../frontend/package.json', import.meta.url));
const routerEntry = () => pathToFileURL(requireFromFrontend.resolve('react-router-dom')).href;

test('every react-router binding the app imports exists in the installed version', async () => {
  const used = importedFromRouter();
  assert.ok(used.length >= 8, `only found ${used.length} router imports — the scan is broken`);

  const rrd = await import(routerEntry());
  // The CJS build lands on `default` under an ESM import; check both shapes so
  // this keeps working whichever build Node picks.
  const exports = { ...(rrd.default ?? {}), ...rrd };
  const missing = used.filter((n) => typeof exports[n] === 'undefined');
  assert.deepEqual(missing, [], `react-router-dom no longer exports: ${missing.join(', ')}`);
});

test('the app stays on the declarative router, not the data router', async () => {
  // v7's breaking changes are concentrated in the DATA router: loaders, actions,
  // the removed json()/defer() helpers, fetcher and hydration behaviour, and the
  // former v7_* future flags. None of it reaches a <BrowserRouter> + <Routes>
  // app. If someone adopts createBrowserRouter, that reasoning stops holding and
  // the next upgrade needs re-doing from scratch — so the boundary is asserted.
  const DATA_ROUTER = /createBrowserRouter|createHashRouter|RouterProvider|useLoaderData|useActionData|useFetcher|useRevalidator|defer\(/;
  const offenders = appFiles().filter((f) => DATA_ROUTER.test(read(f)));
  assert.deepEqual(offenders, [],
    'these files use the data router — re-check the v7 migration notes before trusting this upgrade');
});

test('no relative link resolution, so relativeSplatPath cannot bite', () => {
  // v7 makes the old v7_relativeSplatPath flag the default: relative paths inside
  // a splat (`*`) route resolve differently. The app has one splat route and it
  // navigates to an absolute path, and every `to=` in the app is absolute — which
  // is what makes that default a no-op here.
  const splatFiles = appFiles().filter((f) => /path="[^"]*\*/.test(read(f)));
  for (const f of splatFiles) {
    for (const m of read(f).matchAll(/<Navigate\s+to=\{?["']([^"']+)/g)) {
      assert.ok(m[1].startsWith('/'), `${f}: <Navigate to="${m[1]}"> inside a splat route must be absolute`);
    }
  }
  const relative = [];
  for (const f of appFiles()) {
    for (const m of read(f).matchAll(/\bto="([^"]+)"/g)) {
      if (!m[1].startsWith('/')) relative.push(`${f}: to="${m[1]}"`);
    }
  }
  assert.deepEqual(relative, [],
    'a relative `to=` appeared — re-check v7 relative-path resolution inside splat routes');
});
