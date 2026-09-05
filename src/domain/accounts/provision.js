// Everything about a provision request that can be decided WITHOUT the database.
//
// It is a separate module from accounts.js because this repo has no test database
// and no HTTP test harness: pure functions are the only place the endpoint's
// behaviour can actually be pinned, and a route handler that delegates to them is
// thin enough to read.
import { findPlatform, platformSupports, IMPORT_METHODS } from '../sync/platforms.js';
import { accountLimit, manualAccountLimit, canUseEA } from '../billing/plans.js';

/**
 * The values challenges.phase accepts.
 *
 * 'p3' ADDED 2026-08-25 for the 3-Step account type. There is no CHECK constraint to
 * widen — migration 0016 declares `phase TEXT NOT NULL DEFAULT 'p1'` and lists the
 * values in a COMMENT only — so this array and the /api/prop/advance whitelist ARE the
 * enforcement. Everything that partitions phases learned about it in the same change:
 * EVAL_PHASES in ../prop/propOverview.js (a phase in neither set is counted as neither
 * an evaluation nor funded), the phase label in ../alerts/alerts.js, and on the
 * frontend EVAL_PHASES in features/prop/propAccounts.js plus PHASES in
 * features/accounts/newAccountFlow.js, which mirrors this one.
 */
export const PHASES = ['p1', 'p2', 'p3', 'funded'];

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
  // A PLATFORM WITH NO CREDENTIAL FIELDS SUPPLIES NO CREDENTIAL, and that is a
  // registry fact rather than a special case for cTrader. cTrader's "credential"
  // is an OAuth grant that already exists as a ctrader_identity row by the time
  // the account is provisioned; there is nothing for the wizard to collect and
  // nothing to seal. Asking the registry keeps the next OAuth platform from
  // needing another branch here.
  const collectsCredential = platform.credentialFields.length > 0;
  const hasCredential = body.credential != null;
  if (import_method === 'auto_sync' && collectsCredential && !hasCredential) {
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
  } else if (body.firm_id || body.product_id || body.phase || body.challenge_group_id) {
    // Not merely ignored: silently dropping these would make a live account that
    // the user believes is tracking firm rules, which is the bug capital_kind
    // exists to end. `challenge_group_id` joins the list for the same reason — a
    // live account inside a prop challenge is the same category error, one level up.
    return { ok: false, error: 'A live account has no prop firm, account type, phase or challenge' };
  }

  /* WHICH CHALLENGE THIS ACCOUNT JOINS, or null to start a new one (migration 0027).
   *
   * SHAPE ONLY HERE, OWNERSHIP IN THE TRANSACTION. This is an id the client did not
   * create in this request — the whole point of the existing-challenge branch is that
   * it names a row that already exists — so the check that matters is `user_id`, and
   * that can only be done against the database. provisionAccount does it under FOR
   * UPDATE (lockJoinableGroup); this only rejects what cannot be an id at all, so a
   * malformed value fails before any work is done. */
  let challenge_group_id = null;
  if (capital_kind === 'prop' && body.challenge_group_id != null) {
    const n = Number(body.challenge_group_id);
    if (!Number.isInteger(n) || n <= 0) {
      return { ok: false, error: 'Invalid challenge' };
    }
    challenge_group_id = n;
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
      challenge_group_id,
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

import crypto from 'node:crypto';
import { withTransaction } from '../../platform/db.js';
import { sealPassword, saveCredentialQuery } from '../sync/credentials.js';

/**
 * The broker login to store on the account, or null when there is not one yet.
 *
 * NOT `credential.login`. That is MT5's shape. A TradeLocker credential has an
 * email and no login at all -- its accountId comes from /auth/jwt/all-accounts
 * once the credential has been proven, which is after this row exists. Reading
 * the property directly yields `undefined`, which pg will not accept as a value,
 * so the first TradeLocker connect would 500 rather than create a pending
 * account.
 *
 * Null is the truthful answer and the one the schema already models: mt5_login
 * NULL means `pending`, which is exactly what an account awaiting discovery is.
 */
export const loginFromCredential = (credential) =>
  credential?.login == null ? null : credential.login;
import { enqueueQuery } from '../sync/queue.js';
import {
  findByProvisionKeyQuery, insertAccountQuery, assignSyntheticLoginQuery, insertChallengeQuery,
} from './provisionQueries.js';
import { insertGroup, lockJoinableGroup } from '../prop/challengeGroups.js';

/** Typed conflicts, so the route can pick a status code without parsing pg text. */
export const PROVISION_CONFLICT = {
  LOGIN: 'login_taken',
  KEY: 'key_replayed',
  // The named challenge is not one this user can add a phase to: it does not exist,
  // it belongs to someone else, or it has already failed. ONE code for all three,
  // deliberately — telling a caller apart "not yours" from "does not exist" confirms
  // the existence of another tenant's row.
  GROUP: 'challenge_unavailable',
};

const genToken = () => crypto.randomBytes(24).toString('hex');
const shape = (row) => ({
  ...row,
  mt5_login: row.mt5_login == null ? null : Number(row.mt5_login),
  pending: row.mt5_login == null,
});

/**
 * Create an account and everything that must exist with it, in ONE transaction.
 *
 * The ordering is not incidental:
 *   1. THE CHALLENGE GROUP — the challenge this account is a phase of (migration
 *      0027). Resolved FIRST because the account row carries the link, and because
 *      joining an existing challenge is the one step that can be refused on grounds
 *      only the database knows (not yours / already failed): finding that out after
 *      writing the account would mean rolling back work that was never allowed.
 *   2. the account, because the credential is sealed under its id (credAad) and
 *      the challenge references it;
 *   3. the challenge — ONLY for a prop account. A live account getting one is the
 *      bug this whole change exists to fix;
 *   4. the credential, then the job. A job leased before its credential exists is
 *      handed no payload, so the agent reports nothing, the lease expires, and
 *      reclaimExpired re-queues it forever with no error anywhere.
 *
 * Every failure rolls back to nothing written, which is what makes retry safe with
 * no cleanup path. `connect`, `credential` and `seal` are injected so all of the
 * above is testable without a database (test/provision-tx.test.js).
 */
export async function provisionAccount(userId, v, opts = {}) {
  const {
    connect, credential = null, seal = sealPassword,
    // An explicit banded login, for a platform whose identifier does not come
    // from a credential. cTrader's arrives from the account picker (4e12 + ctid),
    // which is discovered over a socket long before any of this runs.
    login: loginOverride = null,
  } = opts;

  return withTransaction(async (client) => {
    // Idempotency first: a network drop after COMMIT is exactly when a user
    // presses the button again, and this is a nine-step flow to repeat.
    if (v.provision_key) {
      const found = findByProvisionKeyQuery(userId, v.provision_key);
      const { rows } = await client.query(found.text, found.values);
      if (rows.length) return { account: shape(rows[0]), replayed: true };
    }

    /* THE CHALLENGE THIS ACCOUNT BELONGS TO.
     *
     * JOINING: the id came in on the request, so the row is locked and re-checked
     * against this user and against `status = 'active'`. A null return is refused with
     * a typed conflict rather than by falling back to a new challenge — silently
     * starting a fresh challenge when the trader asked to continue one would split a
     * journey in two, and they would find out on the Challenges page days later.
     *
     * AND THE CHALLENGE'S IDENTITY WINS OVER THE PAYLOAD. firm, product and size are
     * properties of the CHALLENGE, not of this phase, so they are taken from the group
     * row and overwrite whatever the client sent. The wizard shows them read-only, so
     * this can only differ from the payload when a client is wrong — and the failure it
     * prevents is a Phase 2 account filed under a different firm or size than the Phase
     * 1 it continues, which mis-scores it for the length of the challenge. The RULES
     * (drawdowns, target, minimum days) are deliberately NOT taken from the group: they
     * are per phase, and a firm's Phase 2 terms are routinely not its Phase 1 terms.
     *
     * STARTING ONE: every prop account is a phase of something, so an account with no
     * group named creates its own — a challenge of one, which is what it is until its
     * next phase is added.
     */
    let group = null;
    if (v.capital_kind === 'prop') {
      if (v.challenge_group_id != null) {
        group = await lockJoinableGroup(client, v.challenge_group_id, userId);
        if (!group) {
          const err = new Error('That challenge is no longer available to add a phase to');
          err.conflict = PROVISION_CONFLICT.GROUP;
          throw err;
        }
      } else {
        group = await insertGroup(client, userId, v);
      }
    }

    const identity = group && v.challenge_group_id != null
      ? {
        firm_id: group.firm_id,
        firm_name: group.firm_name,
        product_id: group.product_id,
        start_balance: group.start_balance,
      }
      : {};

    const synced = v.kind === 'synced';
    const login = loginOverride
      ?? (v.import_method === 'auto_sync' ? loginFromCredential(credential) : null);
    const insert = insertAccountQuery(
      userId,
      {
        ...v,
        ...identity,
        challenge_group_id: group?.id ?? null,
        ingest_token: synced ? genToken() : null,
      },
      login,
    );

    let row;
    try {
      ({ rows: [row] } = await client.query(insert.text, insert.values));
    } catch (err) {
      if (err.code === '23505') {
        const conflict = /provision_key/.test(err.constraint ?? '')
          ? PROVISION_CONFLICT.KEY
          : PROVISION_CONFLICT.LOGIN;
        const wrapped = new Error(
          conflict === PROVISION_CONFLICT.LOGIN
            ? 'That MT5 login is already registered to an account'
            : 'This account was already created',
        );
        wrapped.conflict = conflict;
        throw wrapped;
      }
      throw err;
    }

    if (!synced) {
      const assign = assignSyntheticLoginQuery(row.id);
      ({ rows: [row] } = await client.query(assign.text, assign.values));
    }

    if (v.capital_kind === 'prop') {
      // Built from the account ROW the INSERT just returned, not from `v` — the
      // row is already coalesced to mt5_accounts' defaults and NOT NULL, so this
      // is the only way the challenge's rules cannot silently drift from what
      // Settings displays for the account. `phase` is layered on top because the
      // account row does not carry it (see insertChallengeQuery's doc comment).
      const challenge = insertChallengeQuery(row.id, { ...row, phase: v.phase });
      await client.query(challenge.text, challenge.values);
    }

    if (v.import_method === 'auto_sync') {
      // The JOB is enqueued for every Auto Sync account; the CREDENTIAL is stored
      // only when the platform has one. Gating the enqueue on the credential too
      // -- as this did -- means a cTrader account is provisioned and then never
      // syncs, with no job, no error and no way to tell from the UI.
      if (credential) {
      const cred = saveCredentialQuery({
        accountId: row.id,
        server: credential.server,
        firmKey: v.firm_id ?? null,
        passwordCt: seal(row.id, credential.password),
        // Present for TradeLocker, absent for MT5. Dropping it would leave a
        // credential that cannot authenticate, failing three hours later in an
        // unattended job rather than here.
        loginEmail: credential.email ?? null,
      });
      await client.query(cred.text, cred.values);
      }

      const job = enqueueQuery(row.id, 'first_sync');
      await client.query(job.text, job.values);
    }

    return { account: shape(row), replayed: false };
  }, connect);
}
