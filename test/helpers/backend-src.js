import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// The HTTP layer used to be one file, so tests that assert "the server does X"
// read src/app.js as text. It is now app.js (wiring) plus src/routes/*.js (the
// handlers), and which module a given route sits in is an organisational choice
// that no test should be pinned to.
//
// So `httpLayer` is the whole layer as one string: app.js followed by every route
// module. An assertion about a route keeps working when the route moves between
// route files, and still fails if the route is deleted.
export const srcDir = fileURLToPath(new URL('../../src', import.meta.url));

const read = (rel) => readFileSync(path.join(srcDir, rel), 'utf8');

export const routeFiles = existsSync(path.join(srcDir, 'routes'))
  ? readdirSync(path.join(srcDir, 'routes')).filter((f) => f.endsWith('.js')).sort()
  : [];

export const appJs = read('app.js');
export const routeSources = routeFiles.map((f) => ({ file: f, text: read(`routes/${f}`) }));
export const httpLayer = [appJs, ...routeSources.map((r) => r.text)].join('\n');

/** The route module that registers `method path`, or undefined. */
export function moduleFor(method, routePath) {
  const needle = new RegExp(`app\\.${method.toLowerCase()}\\('${routePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`);
  const hit = routeSources.find((r) => needle.test(r.text));
  return hit?.file;
}

/** Source text of whichever module registers `method path`. */
export function sourceOf(method, routePath) {
  const f = moduleFor(method, routePath);
  if (!f) throw new Error(`no route module registers ${method} ${routePath}`);
  return routeSources.find((r) => r.file === f).text;
}

/** Read any backend module by path relative to src/. */
export const readBackend = (rel) => read(rel);
