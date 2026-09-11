// GET /trade/config, once per worker process, never per job.
//
// TradeLocker publishes the field names for every positional-array response as
// data, precisely because the column order is theirs to change (design spec
// §7). Fetching it once and caching it in memory is what makes the rest of the
// connector "resolve by name" rather than "trust an index" -- and validating it
// HERE, at fetch time, is what turns a schema change into a loud failure on the
// job that first notices it, rather than a corrupted trade three fields deep in
// a backfill.
//
// WHY THIS CANNOT TRULY RUN "AT PROCESS START", DESPITE THE NAME. /trade/config
// itself needs a bearer token and an accNum header (confirmed against
// TradeLocker's own API reference), and neither exists before some account's
// job has authenticated and (on its first run) discovered one. So "once per
// worker process start" means: fetched lazily, the first time any job needs it,
// and reused for the rest of the process's life -- never refetched per job,
// which is the guarantee that actually matters here.

import { buildResolver, assertFields, ORDERS_HISTORY_FIELDS } from '../../src/domain/sync/connectors/tradelocker/columns.js';
import { tlRequest } from './http.js';

/**
 * What reconcile.js needs out of accountDetailsConfig. Named here, next to
 * ORDERS_HISTORY_FIELDS's own list, for the same reason columns.js gives that
 * one a name: a config missing either must fail loudly at the point it is
 * first read, not deep inside a job that assumed the field was there.
 */
export const ACCOUNT_DETAILS_FIELDS = Object.freeze(['balance', 'openNetPnL']);

// host -> validated config. Module-level, so it survives for the worker
// process's life and is shared by every job regardless of which account's
// token happened to fetch it first.
const cache = new Map();

/** Test-only: clear the process-lifetime cache between cases. */
export function _resetConfigCache() { cache.clear(); }

/**
 * Fetch-once, validate-once, cache-forever (per host, per process).
 *
 * THROWS rather than returning a config missing a required field -- assertFields
 * already enforces this for a resolver built from it, but validating here means
 * the job whose token happened to trigger the very first fetch fails loudly and
 * immediately, instead of the failure surfacing three windows into that job's
 * own backfill.
 */
export async function getConfig({ host, token, accNum, fetchImpl = fetch }) {
  if (cache.has(host)) return cache.get(host);
  const config = await tlRequest(host, 'trade/config', { token, accNum, fetchImpl });
  assertFields(buildResolver(config, 'ordersHistory'), ORDERS_HISTORY_FIELDS);
  assertFields(buildResolver(config, 'accountDetails'), ACCOUNT_DETAILS_FIELDS);
  cache.set(host, config);
  return config;
}
