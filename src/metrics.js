// Prometheus metrics — the "metrics" pillar alongside Sentry (errors) and the
// Route53 uptime check. Exposes a registry scraped at GET /metrics. Import is
// cheap and side-effect-light: it registers process/runtime collectors and a
// few app metrics, but records nothing until the server's onResponse hook calls
// recordHttp(). Kept framework-agnostic (no Fastify types) so it's unit-testable
// without booting the app or a DB.
import client from 'prom-client';
import { pool } from './db.js';

export const registry = new client.Registry();

// Static labels so multi-instance scrapes (e.g. blue/green) stay distinguishable.
registry.setDefaultLabels({ app: 'amey-backend' });

// Node/process runtime metrics: CPU, resident memory, event-loop lag, GC pauses,
// active handles. These answer "is the box healthy?" independent of app logic.
client.collectDefaultMetrics({ register: registry });

// ---- RED metrics for HTTP (Rate, Errors, Duration) ----
// One counter + one histogram, both labeled by method / route template / status.
// Using the route TEMPLATE (e.g. /api/trades/:id/replay) not the concrete path
// keeps label cardinality bounded — the golden rule for Prometheus labels.
const labelNames = ['method', 'route', 'status_code'];

export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests handled, by method, route template and status code',
  labelNames,
  registers: [registry],
});

export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames,
  // Buckets tuned for a small API: sub-ms DB hits up to slow multi-second reports.
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

// Record one finished request. Duration is in milliseconds (Fastify's
// reply.elapsedTime) and converted to seconds for the histogram convention.
export function recordHttp({ method, route, statusCode, durationMs }) {
  const labels = { method, route: route ?? 'unknown', status_code: String(statusCode) };
  httpRequestsTotal.inc(labels);
  if (typeof durationMs === 'number' && Number.isFinite(durationMs)) {
    httpRequestDuration.observe(labels, durationMs / 1000);
  }
}

// ---- pg connection-pool saturation ----
// Gauges sampled at scrape time via collect(): a rising `waiting` count is the
// canonical signal that the pool is the bottleneck under load.
new client.Gauge({
  name: 'pg_pool_total_connections',
  help: 'Total clients in the pg pool (idle + in-use)',
  registers: [registry],
  collect() { this.set(pool.totalCount); },
});
new client.Gauge({
  name: 'pg_pool_idle_connections',
  help: 'Idle clients in the pg pool',
  registers: [registry],
  collect() { this.set(pool.idleCount); },
});
new client.Gauge({
  name: 'pg_pool_waiting_requests',
  help: 'Requests queued waiting for a pg pool client',
  registers: [registry],
  collect() { this.set(pool.waitingCount); },
});
