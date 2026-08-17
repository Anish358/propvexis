import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  registry,
  recordHttp,
  httpRequestsTotal,
} from '../src/platform/metrics.js';

test('registry exposes the RED + runtime + pg-pool metric families', async () => {
  const text = await registry.metrics();
  // RED: request counter + latency histogram.
  assert.match(text, /http_requests_total/);
  assert.match(text, /http_request_duration_seconds/);
  // pg-pool saturation gauges (sampled at scrape time).
  assert.match(text, /pg_pool_total_connections/);
  assert.match(text, /pg_pool_waiting_requests/);
  // Default process/runtime collectors.
  assert.match(text, /process_cpu_user_seconds_total/);
  // The static app label is applied to samples.
  assert.match(text, /app="amey-backend"/);
});

test('recordHttp increments the counter and observes latency by label', async () => {
  const labels = { method: 'GET', route: '/api/test-route', status_code: '200' };
  const findRoute = (m) =>
    m.values.find((v) => v.labels.method === 'GET' && v.labels.route === '/api/test-route');
  const before = findRoute(await httpRequestsTotal.get());
  const start = before ? before.value : 0;

  recordHttp({ method: 'GET', route: '/api/test-route', statusCode: 200, durationMs: 42 });
  recordHttp({ method: 'GET', route: '/api/test-route', statusCode: 200, durationMs: 8 });

  const after = findRoute(await httpRequestsTotal.get());
  assert.equal(after.value, start + 2);

  // The histogram recorded both observations under the same label set.
  const text = await registry.metrics();
  assert.match(text, /http_request_duration_seconds_count\{[^}]*route="\/api\/test-route"[^}]*\} 2/);
});

test('recordHttp tolerates a missing/non-finite duration without recording latency', () => {
  // A route that never reached the handler (e.g. rate-limited) may lack a
  // duration — the counter should still tick, and no throw.
  assert.doesNotThrow(() =>
    recordHttp({ method: 'GET', route: '/api/no-timing', statusCode: 429, durationMs: undefined })
  );
});
