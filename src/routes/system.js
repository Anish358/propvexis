import { readFile } from 'node:fs/promises';
import { config } from '../config.js';
import { query } from '../db.js';
import { registry as metricsRegistry } from '../metrics.js';
import { getCalendarEvents } from '../calendar.js';
import { eaSourceFile } from '../paths.js';

/**
 * Operational and public endpoints: the health probe, the Prometheus scrape
 * target, the EA download, and the economic-calendar passthrough. Grouped by who
 * calls them rather than by domain — none is part of the journal's data model, and
 * /health and /metrics deliberately opt out of the rate limiter.
 *
 * Registered by calling this function on the ROOT app instance rather than through
 * app.register(). A registered plugin gets its own encapsulated context, and a
 * route defined there cannot see decorators or hooks added to the parent
 * afterwards — app.requireAuth would be undefined and the global rate-limit hook
 * would not apply. A plain call keeps every route on the same instance, in the
 * same order, with the same guards it had when these handlers lived in app.js.
 */
export default function systemRoutes(app) {
  // ---------------------------------------------------------------------------
  // Health
  // ---------------------------------------------------------------------------
  app.get('/health', { config: { rateLimit: false } }, async () => {
    await query('SELECT 1');
    return { ok: true };
  });

  app.get('/metrics', { config: { rateLimit: false } }, async (req, reply) => {
    // Optional bearer-token guard (see config.metricsToken). Off by default; when
    // set, an unauthenticated scrape gets 401 instead of the metrics payload.
    if (config.metricsToken) {
      const auth = req.headers.authorization ?? '';
      if (auth !== `Bearer ${config.metricsToken}`) {
        return reply.code(401).send({ error: 'unauthorized' });
      }
    }
    reply.header('Content-Type', metricsRegistry.contentType);
    return metricsRegistry.metrics();
  });

  // ---------------------------------------------------------------------------
  // EA download — serves the MQL5 source so users can grab the EA straight from
  // the setup card. No secret in the file (the ingest token is entered per
  // account in MT5), so this is public. `ea/` is deployed alongside the backend.
  //
  // The path comes from paths.js, which finds the repo root rather than counting
  // `..` from this file — see the comment there. The `catch` below turns any read
  // failure into a 404, so a wrong path here looks exactly like a missing file.
  // ---------------------------------------------------------------------------
  app.get('/api/ea/download', async (req, reply) => {
    try {
      const src = await readFile(eaSourceFile, 'utf8');
      reply.header('Content-Type', 'text/plain; charset=utf-8');
      reply.header('Content-Disposition', 'attachment; filename="PropVexis.mq5"');
      return src;
    } catch {
      return reply.code(404).send({ error: 'EA file not available' });
    }
  });

  // ---------------------------------------------------------------------------
  // Economic calendar — the upcoming macro events for Today's Brief, each with a
  // normalized `impact` label. Global (not user-scoped): the free ForexFactory
  // weekly feed is the same for everyone, cached in-process (src/calendar.js).
  // Returns the whole upcoming window unfiltered; importance/currency/time-window
  // filtering is a per-user Today's Brief preference applied client-side. Never
  // fails the page — on a feed error it returns [] and the banner shows its
  // fallback.
  // ---------------------------------------------------------------------------
  app.get('/api/calendar', { preHandler: app.requireAuth }, async () =>
    ({ events: await getCalendarEvents() })
  );
}
