import { listStrategies, createStrategy, updateStrategy, deleteStrategy } from '../domain/trades/strategies.js';

/**
 * Named strategies and their rule sets. Renames cascade to the user's trades,
 * which is why every write here invalidates their cached analytics.
 *
 * Registered by calling this function on the ROOT app instance rather than through
 * app.register(). A registered plugin gets its own encapsulated context, and a
 * route defined there cannot see decorators or hooks added to the parent
 * afterwards — app.requireAuth would be undefined and the global rate-limit hook
 * would not apply. A plain call keeps every route on the same instance, in the
 * same order, with the same guards it had when these handlers lived in app.js.
 */
export default function strategyRoutes(app, ctx) {
  const { invalidateStats } = ctx;

  // ---------------------------------------------------------------------------
  // Strategies — the user's managed strategy catalog (named setups). A trade is
  // linked to its strategy by name (trades.setup). All routes are scoped to the
  // requesting user; renames cascade to their trades (see strategies.js).
  // ---------------------------------------------------------------------------
  app.get('/api/strategies', { preHandler: app.requireAuth }, async (req) =>
    listStrategies(req.user.uid)
  );

  app.post('/api/strategies', { preHandler: app.requireAuth }, async (req, reply) => {
    try {
      const s = await createStrategy(req.user.uid, req.body ?? {});
      return reply.code(201).send(s);
    } catch (err) {
      if (err.code === 'INVALID') return reply.code(400).send({ error: err.message });
      if (err.code === 'DUP') return reply.code(409).send({ error: err.message });
      throw err;
    }
  });

  app.patch('/api/strategies/:id', { preHandler: app.requireAuth }, async (req, reply) => {
    try {
      const s = await updateStrategy(req.user.uid, Number(req.params.id), req.body ?? {});
      if (!s) return reply.code(404).send({ error: 'strategy not found' });
      // A rename cascades onto trades.setup (regrouping bySetup) and a rules edit
      // changes the adherence split — both are cached aggregates.
      invalidateStats(req.user.uid);
      return s;
    } catch (err) {
      if (err.code === 'INVALID') return reply.code(400).send({ error: err.message });
      if (err.code === 'DUP') return reply.code(409).send({ error: err.message });
      throw err;
    }
  });

  app.delete('/api/strategies/:id', { preHandler: app.requireAuth }, async (req, reply) => {
    const ok = await deleteStrategy(req.user.uid, Number(req.params.id));
    if (!ok) return reply.code(404).send({ error: 'strategy not found' });
    invalidateStats(req.user.uid);
    return { id: Number(req.params.id), deleted: true };
  });
}
