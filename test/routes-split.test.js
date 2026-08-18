import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { appJs, routeFiles, routeSources, httpLayer } from './helpers/backend-src.js';
import { eaSourceFile, repoRoot } from '../src/platform/paths.js';

// app.js held ~50 route handlers in 1,648 lines. They now live in src/routes/,
// grouped by domain. This file pins the three things that split could break
// silently — and one of them DID break during the split, which is why the
// filesystem assertion below exists.

// The full route surface as it stood before the split. Kept as a literal on
// purpose: a regression that deletes a route should fail here, and it cannot if
// the expectation is derived from the same source the assertion reads.
const ROUTES = [
  ['get', '/health'], ['get', '/metrics'],
  ['post', '/api/trades/ingest'], ['get', '/api/trades'], ['post', '/api/trades'],
  ['post', '/api/trades/import'], ['patch', '/api/trades/:id'], ['delete', '/api/trades/:id'],
  ['post', '/api/equity/ingest'], ['post', '/api/candles/ingest'],
  ['get', '/api/candles/requests'], ['get', '/api/trades/:id/replay'],
  ['get', '/api/ea/download'],
  ['get', '/api/accounts'], ['post', '/api/accounts'],
  ['post', '/api/sync/lease'], ['post', '/api/sync/jobs/:id/result'],
  ['post', '/api/sync/heartbeat'],
  ['get', '/api/accounts/:id/sync'], ['post', '/api/accounts/:id/sync'],
  ['put', '/api/accounts/:id/credentials'], ['delete', '/api/accounts/:id/credentials'],
  ['patch', '/api/accounts/:id'], ['delete', '/api/accounts/:id'], ['get', '/api/account'],
  ['get', '/api/strategies'], ['post', '/api/strategies'],
  ['patch', '/api/strategies/:id'], ['delete', '/api/strategies/:id'],
  ['get', '/api/payouts'], ['post', '/api/payouts'], ['delete', '/api/payouts/:id'],
  ['get', '/api/fees'], ['post', '/api/fees'], ['delete', '/api/fees/:id'],
  ['post', '/api/payouts/ingest'],
  ['get', '/api/prop'], ['get', '/api/prop/finance'], ['get', '/api/prop/overview'],
  ['get', '/api/prop/insights'], ['get', '/api/prop/history'], ['post', '/api/prop/advance'],
  ['get', '/api/notifications'], ['post', '/api/notifications/read'],
  ['get', '/api/calendar'],
  ['get', '/api/view-state'], ['put', '/api/view-state'],
  ['get', '/api/day-notes'], ['put', '/api/day-notes/:day'],
  ['get', '/api/stats'], ['get', '/api/yearly'],
  ['get', '/api/report'], ['get', '/api/report/export.csv'],
  ['get', '/api/billing/config'], ['get', '/api/billing/subscription'],
  ['post', '/api/billing/subscribe'], ['post', '/api/billing/cancel'],
  ['post', '/api/billing/webhook'],
];

const registrations = (text) =>
  [...text.matchAll(/app\.(get|post|put|patch|delete)\('([^']+)'/g)].map((m) => `${m[1]} ${m[2]}`);

test('every route survived the split, exactly once', () => {
  const found = registrations(httpLayer);
  const expected = ROUTES.map(([m, p]) => `${m} ${p}`);

  const missing = expected.filter((r) => !found.includes(r));
  assert.deepEqual(missing, [], `routes lost in the split: ${missing.join(', ')}`);

  // Fastify throws on a duplicate path, so a double registration is a boot
  // failure rather than a subtle one — but it would only show up on the box.
  const dupes = found.filter((r, i) => found.indexOf(r) !== i);
  assert.deepEqual(dupes, [], `registered twice — the app will not boot: ${dupes.join(', ')}`);

  const extra = found.filter((r) => !expected.includes(r));
  assert.deepEqual(extra, [], `new routes must be added to ROUTES above: ${extra.join(', ')}`);
});

test('app.js registers no routes itself — it is wiring only', () => {
  assert.deepEqual(registrations(appJs), [],
    'a route crept back into app.js; it belongs in a src/routes/ module');
  // The wiring it DOES own must stay: these are what the route modules assume.
  for (const bit of ['registerAuth(app)', 'app.register(cors', 'app.register(rateLimit', "app.addHook('onResponse'"]) {
    assert.ok(appJs.includes(bit), `app.js must still set up ${bit}`);
  }
});

test('route modules are called, never registered as plugins', () => {
  // THE INVARIANT. app.register() creates an encapsulated child context: a route
  // defined inside it does not see decorators or hooks added to the parent
  // afterwards. `app.requireAuth` would be undefined at registration time and the
  // global rate-limit hook would not apply — every guarded route silently open or
  // silently broken. A plain call keeps every route on the root instance.
  for (const { file, text } of routeSources) {
    assert.match(text, /^export default function \w+\(app(?:, ctx)?\) \{$/m,
      `${file} must export a plain (app, ctx) function`);
  }
  const calls = [...appJs.matchAll(/^(\w+Routes)\(app(?:, ctx)?\);$/gm)].map((m) => m[1]);
  assert.equal(calls.length, routeFiles.length,
    `app.js calls ${calls.length} route modules but src/routes/ has ${routeFiles.length}`);
  assert.ok(!/app\.register\(\s*\w*Routes/.test(appJs),
    'route modules must be called, not app.register()-ed — see the note in app.js');
});

test('the guarded routes kept their guard', () => {
  // Everything except the EA/webhook callers and the two ops endpoints is
  // guarded. Losing `preHandler` in a copy-paste would expose a user's data with
  // no visible symptom, so it is asserted per route rather than spot-checked.
  //
  // There are two guards, not one: `app.requireAuth` is the session cookie, and
  // `requireWorker` is the sync farm's bearer token (the off-box Windows agent
  // has no session). A route must carry one of them — but WHICH one is also
  // pinned below, so a user route cannot be quietly downgraded to worker auth.
  const PUBLIC = new Set([
    'get /health', 'get /metrics', 'get /api/ea/download',
    'post /api/trades/ingest', 'post /api/equity/ingest', 'post /api/candles/ingest',
    'get /api/candles/requests', 'post /api/payouts/ingest',
    'get /api/billing/config', 'post /api/billing/webhook',
  ]);
  // The only routes the sync worker's token may open. Everything else is a session.
  const WORKER = new Set([
    'post /api/sync/lease', 'post /api/sync/jobs/:id/result', 'post /api/sync/heartbeat',
  ]);
  const unguarded = [];
  const wrongGuard = [];
  for (const { text } of routeSources) {
    for (const m of text.matchAll(/app\.(get|post|put|patch|delete)\('([^']+)',\s*(\{[^}]*\})?/g)) {
      const key = `${m[1]} ${m[2]}`;
      if (PUBLIC.has(key)) continue;
      const opts = m[3] ?? '';
      const session = /preHandler:\s*app\.requireAuth/.test(opts);
      const worker = /preHandler:\s*requireWorker/.test(opts);
      if (!session && !worker) unguarded.push(key);
      else if (worker !== WORKER.has(key)) wrongGuard.push(key);
    }
  }
  assert.deepEqual(unguarded, [], `these routes lost their guard: ${unguarded.join(', ')}`);
  assert.deepEqual(wrongGuard, [],
    `these routes use the wrong guard for their audience: ${wrongGuard.join(', ')}`);
});

test('the EA source file resolves from wherever the route lives', () => {
  // THIS IS THE REGRESSION THE SPLIT CAUSED. The path was built as `../ea/...`
  // relative to src/app.js; moving the route to src/routes/ made it src/ea/, and
  // the handler turns any read failure into a 404 — so the download just stopped
  // working, with no error and no failing test. paths.js finds the repo root
  // instead of counting `..`, and this asserts the result actually exists.
  assert.ok(existsSync(eaSourceFile), `EA source not found at ${eaSourceFile}`);
  assert.ok(existsSync(`${repoRoot}/package.json`), 'repoRoot is not the repo root');
  const sys = routeSources.find((r) => r.file === 'system.js').text;
  assert.match(sys, /from '.*paths\.js'/, 'system.js must take the EA path from paths.js');
  assert.ok(!/import\.meta\.url/.test(sys),
    'no path arithmetic from import.meta.url in a route module — it breaks when the file moves');
});
