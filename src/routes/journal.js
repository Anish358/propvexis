import { getViewState, saveViewState } from '../domain/journal/viewState.js';
import { isDayKey, listDayNotes, saveDayNote } from '../domain/journal/dayNotes.js';

/**
 * Per-user state the client owns the shape of: the view-state blob (filters and
 * display prefs, server-synced so environments cannot diverge) and day notes.
 *
 * Registered by calling this function on the ROOT app instance rather than through
 * app.register(). A registered plugin gets its own encapsulated context, and a
 * route defined there cannot see decorators or hooks added to the parent
 * afterwards — app.requireAuth would be undefined and the global rate-limit hook
 * would not apply. A plain call keeps every route on the same instance, in the
 * same order, with the same guards it had when these handlers lived in app.js.
 */
export default function journalRoutes(app) {
  // ---------------------------------------------------------------------------
  // View state — per-user display unit + data filters + widget overrides + trade
  // settings, synced across the user's browsers/devices (was browser localStorage).
  // The blob shape is owned by the client; the server stores it opaquely.
  // ---------------------------------------------------------------------------
  app.get('/api/view-state', { preHandler: app.requireAuth }, async (req) =>
    ({ state: await getViewState(req.user.uid) })
  );

  app.put('/api/view-state', { preHandler: app.requireAuth }, async (req) => {
    const state = await saveViewState(req.user.uid, req.body?.state);
    return { state };
  });

  // ---------------------------------------------------------------------------
  // Day notes — the session-level half of the Daily Journal, alongside the
  // per-trade notes on `trades.comments`. Per user, not per account: see
  // src/domain/journal/dayNotes.js. GET returns the whole map in one trip; the journal renders a
  // fortnight of days at once.
  // ---------------------------------------------------------------------------
  app.get('/api/day-notes', { preHandler: app.requireAuth }, async (req) =>
    ({ notes: await listDayNotes(req.user.uid) })
  );

  app.put('/api/day-notes/:day', { preHandler: app.requireAuth }, async (req, reply) => {
    const { day } = req.params;
    // A bad day key is a 400, not a coercion — a note silently written onto the
    // wrong date is worse than a rejected request.
    if (!isDayKey(day)) return reply.code(400).send({ error: 'day must be a real YYYY-MM-DD date' });
    return { day, note: await saveDayNote(req.user.uid, day, req.body?.note) };
  });
}
