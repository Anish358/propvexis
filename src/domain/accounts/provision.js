// Everything about a provision request that can be decided WITHOUT the database.
//
// It is a separate module from accounts.js because this repo has no test database
// and no HTTP test harness: pure functions are the only place the endpoint's
// behaviour can actually be pinned, and a route handler that delegates to them is
// thin enough to read.
import { findPlatform, platformSupports, IMPORT_METHODS } from '../sync/platforms.js';
import { accountLimit, manualAccountLimit, canUseEA } from '../billing/plans.js';

/** The three values challenges.phase accepts (migration 0016). */
export const PHASES = ['p1', 'p2', 'funded'];

const LABEL_MAX = 120;
const KEY_MAX = 64;

// import_method -> kind. This IS the CHECK constraint from 0026, in JS: keeping
// the mapping in one function means the constraint can only be violated by
// bypassing this module.
const KIND_BY_METHOD = {
  auto_sync: 'synced',
  ea: 'synced',
  file: 'manual',
  manual: 'manual',
};

export const kindForImportMethod = (m) => KIND_BY_METHOD[m] ?? null;

// '' and null become null, never 0. For min_trading_days especially, 0 is a
// meaningful value ("no requirement") and must not be what a blank field means.
const numOrNull = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const strOrNull = (v) => {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
};

/**
 * Validate and normalize a provision payload.
 *
 * WHAT IS NOT VALIDATED, AND WHY: firm_id and product_id are checked for shape,
 * not membership. The firm catalog carries every firm's drawdown percentages and
 * lives in frontend/src, which the backend cannot import (deploy rsyncs
 * `src db scripts ea` plus `frontend/dist`), and duplicating those numbers into
 * src/ is a worse risk than not checking them — a stale copy silently mis-scores a
 * live challenge. The rule percentages arrive from the client exactly as they
 * already do through AccountForms.toPayload, so the trust level is unchanged: a
 * user can only distort their own analytics. `phase` IS validated, because its
 * three values are a schema fact rather than catalog data.
 *
 * The credential is deliberately NOT copied into `value`. The route hands it to
 * the connector separately, so the object that gets spread, logged or serialized
 * downstream cannot carry a broker password.
 */
export function validateProvision(body = {}) {
  const capital_kind = body.capital_kind === 'prop' || body.capital_kind === 'live'
    ? body.capital_kind
    : null;
  if (!capital_kind) return { ok: false, error: 'capital_kind must be "prop" or "live"' };

  const label = String(body.label ?? '').trim();
  if (!label) return { ok: false, error: 'A label is required' };
  if (label.length > LABEL_MAX) {
    return { ok: false, error: `The label must be ${LABEL_MAX} characters or fewer` };
  }

  const platform = findPlatform(body.platform);
  if (!platform) return { ok: false, error: 'Unknown platform' };
  if (!platform.enabled) {
    return { ok: false, error: `${platform.label} is not an available platform yet` };
  }

  const import_method = IMPORT_METHODS.includes(body.import_method) ? body.import_method : null;
  if (!import_method) return { ok: false, error: 'Unknown import method' };
  if (!platformSupports(platform.id, import_method)) {
    return { ok: false, error: `${platform.label} does not support that import method` };
  }

  // A credential belongs to exactly one method. A stray one on an EA account
  // would be stored by nothing and read by nothing — silently discarded input.
  const hasCredential = body.credential != null;
  if (import_method === 'auto_sync' && !hasCredential) {
    return { ok: false, error: 'Auto Sync needs a credential' };
  }
  if (import_method !== 'auto_sync' && hasCredential) {
    return { ok: false, error: 'Only Auto Sync stores a credential' };
  }

  let firm_id = null;
  let firm_name = null;
  let product_id = null;
  let phase = null;

  if (capital_kind === 'prop') {
    firm_id = strOrNull(body.firm_id);
    product_id = strOrNull(body.product_id);
    firm_name = strOrNull(body.firm_name);
    if (!firm_id) return { ok: false, error: 'A prop account needs a firm' };
    if (!product_id) return { ok: false, error: 'A prop account needs an account type' };
    if (!PHASES.includes(body.phase)) return { ok: false, error: 'A prop account needs a valid phase' };
    phase = body.phase;
  } else if (body.firm_id || body.product_id || body.phase) {
    // Not merely ignored: silently dropping these would make a live account that
    // the user believes is tracking firm rules, which is the bug capital_kind
    // exists to end.
    return { ok: false, error: 'A live account has no prop firm, account type or phase' };
  }

  const provision_key = strOrNull(body.provision_key);
  if (provision_key && provision_key.length > KEY_MAX) {
    return { ok: false, error: 'Invalid provision key' };
  }

  return {
    ok: true,
    value: {
      capital_kind,
      label,
      currency: strOrNull(body.currency) || 'USD',
      broker: strOrNull(body.broker),
      platform: platform.id,
      import_method,
      kind: kindForImportMethod(import_method),
      firm_id,
      firm_name,
      product_id,
      phase,
      start_balance: numOrNull(body.start_balance),
      account_type: body.account_type === 'funded' ? 'funded' : 'eval',
      daily_dd_pct: numOrNull(body.daily_dd_pct),
      max_dd_pct: numOrNull(body.max_dd_pct),
      profit_target_pct: numOrNull(body.profit_target_pct),
      payout_split_pct: numOrNull(body.payout_split_pct),
      dd_type: body.dd_type === 'trailing' ? 'trailing' : 'static',
      min_trading_days: numOrNull(body.min_trading_days),
      provision_key,
    },
  };
}

/**
 * The plan decision, separated from the DB reads that feed it so the policy is
 * testable. Called with counts the route has already fetched.
 *
 * The wizard gates Auto Sync at the import-method step, so a caller reaching a
 * 402 here has bypassed the UI — but the check is the real enforcement, and the
 * message names the cap because "upgrade" without a number tells the user nothing.
 */
export function provisionGate({ plan, kind, syncedCount = 0, manualCount = 0 }) {
  if (kind === 'synced') {
    if (!canUseEA(plan)) {
      return { ok: false, code: 402, error: 'Auto Sync requires the Pro plan' };
    }
    const limit = accountLimit(plan);
    if (syncedCount >= limit) {
      return {
        ok: false,
        code: 402,
        error: `Your plan allows up to ${limit} synced accounts — upgrade to add more`,
      };
    }
    return { ok: true };
  }

  const limit = manualAccountLimit(plan);
  if (manualCount >= limit) {
    return { ok: false, code: 402, error: `Your plan allows up to ${limit} manual accounts` };
  }
  return { ok: true };
}
