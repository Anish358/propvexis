import { resolveScope } from '../accounts.js';
import { planForUser } from '../entitlements.js';
import { canUseReports } from '../plans.js';
import { computeStats, computeYearly } from '../aggregations.js';
import { statsCache, cacheKey } from '../statsCache.js';
import { buildReport, reportCsvRows, toCsv } from '../reports.js';

/**
 * Everything computed over trades: dashboard stats, the yearly view, and the
 * composed report with its CSV export. Owns the query-string parsing those share —
 * the filter keys mirror the client's filterDefs.js.
 *
 * Registered by calling this function on the ROOT app instance rather than through
 * app.register(). A registered plugin gets its own encapsulated context, and a
 * route defined there cannot see decorators or hooks added to the parent
 * afterwards — app.requireAuth would be undefined and the global rate-limit hook
 * would not apply. A plain call keeps every route on the same instance, in the
 * same order, with the same guards it had when these handlers lived in app.js.
 */
export default function analyticsRoutes(app) {
  // ---------------------------------------------------------------------------
  // Dashboard analytics — scoped to the selected account (or all owned = god).
  // ---------------------------------------------------------------------------
  // god / all-accounts view reports R; a single account reports its currency ($).
  // Display unit + global data filters are chosen by the client (per scope), not
  // derived from the account. Unit is normalized to R/USD; filter values are
  // parameterized in buildTradeWhere.
  const parseUnit = (q) => (q.unit === 'USD' ? 'USD' : 'R');
  // Precision control (Trade Settings): snap near-zero Fixed R to breakeven.
  const parseBeRound = (q) => q.beRound === '1' || q.beRound === 'true';
  const csv = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : []);
  // A range filter travels as one param, `min..max`, either side omittable — so a
  // new numeric filter costs one query key instead of two. Anything unparseable on a
  // side means "no bound there" rather than a 400: filters are a view preference,
  // and a junk value should widen the view, never break the request.
  const qnum = (v) => (v === '' || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
  const range = (v) => {
    const [a, b] = String(v ?? '').split('..');
    const min = qnum(a); const max = qnum(b);
    // Reversed bounds would match nothing at all; read them in the order meant.
    return (min != null && max != null && min > max) ? { min: max, max: min } : { min, max };
  };
  const oneOf = (v, allowed) => (allowed.includes(v) ? v : null);
  // Keys here mirror frontend/src/filterDefs.js — each live def's `query` name.
  const parseFilters = (q) => ({
    setups: csv(q.setups),
    symbols: csv(q.symbols),
    sessions: csv(q.sessions),
    probability: csv(q.probability),
    mtf: csv(q.mtf),
    dows: csv(q.dows),
    outcome: csv(q.outcome),
    direction: oneOf(q.direction, ['buy', 'sell']),
    journaled: oneOf(q.journaled, ['yes', 'no']),
    pnl: range(q.pnl),
    r: range(q.r),
    maxR: range(q.maxR),
    risk: range(q.risk),
    vol: range(q.vol),
    dur: range(q.dur),
    from: q.from || null,
    to: q.to || null,
  });

  // Both aggregate endpoints are cached per (scope, unit, filters, rounding) and
  // invalidated on any write to that user's trades — see src/statsCache.js. The
  // numbers are a pure function of the trade set, so a hit is always as correct as
  // a recompute.
  app.get('/api/stats', { preHandler: app.requireAuth }, async (req, reply) => {
    const scope = await resolveScope(req.user.uid, req.query.account_id);
    if (!scope) return reply.code(403).send({ error: 'account not found' });
    const [unit, filters, beRound] = [parseUnit(req.query), parseFilters(req.query), parseBeRound(req.query)];
    return statsCache.wrap(
      cacheKey('stats', scope, unit, filters, beRound),
      scope,
      () => computeStats(scope, unit, filters, beRound)
    );
  });

  app.get('/api/yearly', { preHandler: app.requireAuth }, async (req, reply) => {
    const scope = await resolveScope(req.user.uid, req.query.account_id);
    if (!scope) return reply.code(403).send({ error: 'account not found' });
    const year = Number(req.query.year) || new Date().getUTCFullYear();
    const [unit, filters, beRound] = [parseUnit(req.query), parseFilters(req.query), parseBeRound(req.query)];
    return statsCache.wrap(
      cacheKey('yearly', scope, unit, filters, beRound, year),
      scope,
      () => computeYearly(year, scope, unit, filters, beRound)
    );
  });

  // ---------------------------------------------------------------------------
  // Reports (V1) — one exportable payload composing Journal analytics + Prop OS
  // state + payouts for the selected scope. Pro+ (paid differentiator); Free is
  // gated with 402, matching the EA-sync capability gate. JSON for the on-screen
  // report; export.csv for the raw-numbers download.
  // ---------------------------------------------------------------------------
  const reportOpts = (q) => ({
    unit: parseUnit(q), filters: parseFilters(q), beRound: parseBeRound(q),
    year: Number(q.year) || new Date().getUTCFullYear(),
  });

  app.get('/api/report', { preHandler: app.requireAuth }, async (req, reply) => {
    const scope = await resolveScope(req.user.uid, req.query.account_id);
    if (!scope) return reply.code(403).send({ error: 'account not found' });
    if (!canUseReports(await planForUser(req.user.uid))) {
      return reply.code(402).send({ error: 'Reports require the Pro plan' });
    }
    const report = await buildReport(scope, reportOpts(req.query));
    return { ...report, meta: { ...report.meta, generatedAt: new Date().toISOString() } };
  });

  app.get('/api/report/export.csv', { preHandler: app.requireAuth }, async (req, reply) => {
    const scope = await resolveScope(req.user.uid, req.query.account_id);
    if (!scope) return reply.code(403).send({ error: 'account not found' });
    if (!canUseReports(await planForUser(req.user.uid))) {
      return reply.code(402).send({ error: 'Reports require the Pro plan' });
    }
    const report = await buildReport(scope, reportOpts(req.query));
    const fname = `report-${scope.god ? 'all' : scope.logins[0]}-${new Date().toISOString().slice(0, 10)}.csv`;
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${fname}"`);
    return toCsv(reportCsvRows(report));
  });
}
