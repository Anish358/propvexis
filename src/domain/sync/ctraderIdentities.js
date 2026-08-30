import { query } from '../../platform/db.js';
import { config } from '../../platform/config.js';
import { seal, open, secretboxEnabled } from '../../platform/secretbox.js';

// The cTrader OAuth identity: how a token pair is stored, rotated and revoked.
//
// Shaped exactly like domain/sync/credentials.js -- pure builders returning
// { text, values }, thin wrappers below -- so every query is assertable in CI
// without a database. Only this module and platform/secretbox.js ever see the
// key; anything that carries tokens around treats them as opaque ciphertext.
//
// GRAIN. One row per cTID, not per account. The OAuth grant covers every trading
// account under the identity, and the refresh token is CONSUMED on use, so a
// per-account copy of the same pair would break on its second refresh.

/**
 * The AAD every token pair is sealed under.
 *
 * A DIFFERENT PREFIX from the MT5 farm's `mt5-cred:<account_id>`, deliberately.
 * Both use SYNC_CRED_KEY, so without distinct AADs a ciphertext moved between the
 * two tables would open cleanly and point one platform's login path at another
 * platform's secret.
 */
export const identityAad = (identityId) => `ctrader-token:${Number(identityId)}`;

/** True when tokens can be stored at all — SYNC_CRED_KEY must be set. */
export const identitiesEnabled = (cfg = config) => secretboxEnabled(cfg.syncCredKey);

/** Seal a token pair for an identity. Separate from the insert so it is testable without a DB. */
export function sealTokens(identityId, { accessToken, refreshToken }, cfg = config) {
  if (!accessToken) throw new Error('accessToken required');
  if (!refreshToken) throw new Error('refreshToken required');
  const aad = identityAad(identityId);
  return {
    access_token_ct: seal(accessToken, cfg.syncCredKey, aad),
    refresh_token_ct: seal(refreshToken, cfg.syncCredKey, aad),
  };
}

/**
 * Decrypt what a read returned. Throws on a tampered value, a wrong key, or a
 * row bound to a different identity — every one of those means "unusable", so
 * none of them may return a token.
 */
export function openTokens(row, cfg = config) {
  const aad = identityAad(row.id);
  return {
    accessToken: open(row.access_token_ct, cfg.syncCredKey, aad),
    refreshToken: open(row.refresh_token_ct, cfg.syncCredKey, aad),
  };
}

// ---------------------------------------------------------------------------
// Query builders (pure)
// ---------------------------------------------------------------------------

/**
 * Create an identity with placeholder ciphertext, so the generated id exists
 * before the tokens are sealed against it.
 *
 * The AAD binds to the identity id, which the database assigns -- so the row must
 * exist first and the tokens are written by rotateTokensQuery immediately after,
 * inside the same transaction. Sealing against a guessed id would produce a row
 * that can never be opened.
 */
export function createIdentityQuery(userId, scope, expiresAt) {
  return {
    text: `INSERT INTO ctrader_identities (user_id, scope, expires_at, access_token_ct, refresh_token_ct)
           VALUES ($1, $2, $3, '', '')
        RETURNING id, user_id, scope, expires_at, created_at;`,
    values: [userId, scope, expiresAt],
  };
}

/**
 * Write both tokens in ONE statement.
 *
 * The refresh token is consumed by the refresh that produced these values, so the
 * pair below is the only one that still works. Writing access and refresh in two
 * statements means a crash between them strands the identity with a dead refresh
 * token and forces the user to re-authorize from scratch.
 */
export function rotateTokensQuery(identityId, accessCt, refreshCt, expiresAt) {
  return {
    text: `UPDATE ctrader_identities
              SET access_token_ct = $2,
                  refresh_token_ct = $3,
                  expires_at = $4,
                  last_error = NULL,
                  updated_at = now()
            WHERE id = $1 AND revoked_at IS NULL
        RETURNING id, expires_at;`,
    values: [identityId, accessCt, refreshCt, expiresAt],
  };
}

/** Record which cTID a grant turned out to belong to, once the account list says. */
export function setCtidQuery(identityId, ctid) {
  return {
    text: `UPDATE ctrader_identities SET ctid = $2, updated_at = now()
            WHERE id = $1 RETURNING id, ctid;`,
    values: [identityId, ctid],
  };
}

/**
 * One of the caller's own identities, ciphertext included — this is the read a
 * worker payload is built from. Always filtered by user_id: an identity lookup
 * that trusted only the id would be a cross-tenant read of another user's tokens.
 */
export function identityForUserQuery(userId, identityId) {
  return {
    text: `SELECT id, user_id, ctid, access_token_ct, refresh_token_ct, expires_at,
                  scope, revoked_at, last_error, updated_at
             FROM ctrader_identities
            WHERE id = $2 AND user_id = $1 AND revoked_at IS NULL;`,
    values: [userId, identityId],
  };
}

/** The caller's live identities, WITHOUT ciphertext — what a settings page renders. */
export function listIdentitiesQuery(userId) {
  return {
    text: `SELECT id, ctid, scope, expires_at, last_error, created_at, updated_at
             FROM ctrader_identities
            WHERE user_id = $1 AND revoked_at IS NULL
            ORDER BY id;`,
    values: [userId],
  };
}

/**
 * Revoke. Clears the ciphertext rather than only stamping revoked_at: a revoked
 * grant's tokens are useless to us and keeping them is a liability with no upside.
 */
export function revokeIdentityQuery(userId, identityId) {
  return {
    text: `UPDATE ctrader_identities
              SET revoked_at = now(), access_token_ct = '', refresh_token_ct = '',
                  updated_at = now()
            WHERE id = $2 AND user_id = $1 AND revoked_at IS NULL
        RETURNING id;`,
    values: [userId, identityId],
  };
}

export function markIdentityErrorQuery(identityId, error) {
  return {
    text: `UPDATE ctrader_identities SET last_error = $2, updated_at = now()
            WHERE id = $1 RETURNING id, last_error;`,
    values: [identityId, String(error ?? '').slice(0, 500)],
  };
}

/** Replace what the worker discovered for an identity. */
export function upsertDiscoveredQuery(identityId, a) {
  return {
    text: `INSERT INTO ctrader_discovered_accounts
             (identity_id, ctid_trader_account_id, trader_login, is_live,
              broker_name, deposit_currency, registered_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (identity_id, ctid_trader_account_id) DO UPDATE
              SET trader_login = EXCLUDED.trader_login,
                  is_live = EXCLUDED.is_live,
                  broker_name = EXCLUDED.broker_name,
                  deposit_currency = EXCLUDED.deposit_currency,
                  registered_at = EXCLUDED.registered_at,
                  discovered_at = now()
        RETURNING identity_id, ctid_trader_account_id;`,
    values: [identityId, a.ctidTraderAccountId, a.traderLogin ?? null, Boolean(a.isLive),
      a.brokerName ?? null, a.depositCurrency ?? null, a.registeredAt ?? null],
  };
}

/**
 * What the account picker renders: everything discovered for the identity, each
 * row saying whether some account already claims it.
 *
 * The claimed flag is computed HERE rather than in the route, because the check is
 * a uniqueness fact about mt5_accounts and doing it in JS would need a second
 * query and a race between them.
 */
export function discoveredForIdentityQuery(userId, identityId) {
  return {
    text: `SELECT d.ctid_trader_account_id, d.trader_login, d.is_live, d.broker_name,
                  d.deposit_currency, d.registered_at, d.discovered_at,
                  (a.id IS NOT NULL) AS claimed
             FROM ctrader_discovered_accounts d
             JOIN ctrader_identities i ON i.id = d.identity_id
             LEFT JOIN mt5_accounts a
                    ON a.ctid_trader_account_id = d.ctid_trader_account_id
            WHERE d.identity_id = $2 AND i.user_id = $1 AND i.revoked_at IS NULL
            ORDER BY d.is_live DESC, d.ctid_trader_account_id;`,
    values: [userId, identityId],
  };
}

// ---------------------------------------------------------------------------
// Thin DB wrappers
// ---------------------------------------------------------------------------

const run = async (q) => (await query(q.text, q.values)).rows;

export const createIdentity = async (userId, scope, expiresAt) =>
  (await run(createIdentityQuery(userId, scope, expiresAt)))[0] ?? null;
export const rotateTokens = async (identityId, accessCt, refreshCt, expiresAt) =>
  (await run(rotateTokensQuery(identityId, accessCt, refreshCt, expiresAt)))[0] ?? null;
export const setCtid = (identityId, ctid) => run(setCtidQuery(identityId, ctid));
export const identityForUser = async (userId, identityId) =>
  (await run(identityForUserQuery(userId, identityId)))[0] ?? null;
export const listIdentities = (userId) => run(listIdentitiesQuery(userId));
export const revokeIdentity = async (userId, identityId) =>
  (await run(revokeIdentityQuery(userId, identityId)))[0] ?? null;
export const markIdentityError = (identityId, error) => run(markIdentityErrorQuery(identityId, error));
export const upsertDiscovered = (identityId, a) => run(upsertDiscoveredQuery(identityId, a));
export const discoveredForIdentity = (userId, identityId) =>
  run(discoveredForIdentityQuery(userId, identityId));
