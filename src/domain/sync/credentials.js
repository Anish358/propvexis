import { query } from '../../platform/db.js';
import { config } from '../../platform/config.js';
import { seal, open, secretboxEnabled } from '../../platform/secretbox.js';

// The MT5 investor credential for a synced account: how it is stored, how it is
// handed to a worker, and what happens when it turns out not to be read-only.
//
// Only this module and platform/secretbox.js ever see the key. queue.js carries
// `password_ct` around as opaque text on purpose, so a query log or a stack trace
// from the queue cannot leak a credential.

/**
 * The AAD every credential is sealed under. Binding the ciphertext to its account
 * means a row copied or swapped between accounts fails to open instead of
 * pointing one trader's sync at another trader's password.
 */
export const credAad = (accountId) => `mt5-cred:${Number(accountId)}`;

/** True when credentials can be stored at all — SYNC_CRED_KEY must be set. */
export const credentialsEnabled = (cfg = config) => secretboxEnabled(cfg.syncCredKey);

/**
 * Encrypt a password for an account. Separate from the insert so the crypto is
 * testable without a database.
 */
export function sealPassword(accountId, password, cfg = config) {
  const pw = String(password ?? '');
  if (!pw) throw new Error('password required');
  return seal(pw, cfg.syncCredKey, credAad(accountId));
}

/**
 * Decrypt what a lease read out of the table. Throws when the value is tampered,
 * bound to a different account, or sealed under a retired key — all of which mean
 * "unusable", so none of them may return a string.
 */
export function openPassword(row, cfg = config) {
  return open(row.password_ct, cfg.syncCredKey, credAad(row.account_id));
}

// ---------------------------------------------------------------------------
// Query builders
// ---------------------------------------------------------------------------

/**
 * Upsert. Re-saving resets `read_only` and `verified_at` to NULL: a new password
 * has not been proven read-only yet, and carrying the old verdict forward would
 * let a master password inherit an investor password's clean record.
 */
export function saveCredentialQuery({ accountId, server, firmKey, passwordCt, loginEmail = null }) {
  // `login_email` is NULL for MT5, whose credential is identified by a login
  // number, and set for TradeLocker, whose /auth/jwt/token takes an email. It is
  // in the DO UPDATE set for the same reason `server` is: reconnecting an account
  // after fixing a typo must replace the identifier, not authenticate forever
  // against the stale one and fail hours later in an unattended job.
  return {
    text: `INSERT INTO mt5_credentials (account_id, server, firm_key, password_ct, login_email)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (account_id) DO UPDATE
              SET server = EXCLUDED.server,
                  firm_key = EXCLUDED.firm_key,
                  password_ct = EXCLUDED.password_ct,
                  login_email = EXCLUDED.login_email,
                  read_only = NULL,
                  verified_at = NULL,
                  last_error = NULL,
                  updated_at = now()
          RETURNING account_id, server, firm_key, read_only, verified_at;`,
    values: [accountId, server, firmKey ?? null, passwordCt, loginEmail ?? null],
  };
}

/**
 * Read the credential's METADATA for a user's own account. Deliberately never
 * selects password_ct: an endpoint that cannot fetch the ciphertext cannot leak
 * it, whatever a later refactor does to the response shape.
 */
export function credentialStatusQuery(userId, accountId) {
  return {
    text: `SELECT c.account_id, c.server, c.firm_key, c.read_only, c.verified_at,
                  c.last_error, c.updated_at
             FROM mt5_credentials c
             JOIN mt5_accounts a ON a.id = c.account_id
            WHERE c.account_id = $2 AND a.user_id = $1;`,
    values: [userId, accountId],
  };
}

export function deleteCredentialQuery(userId, accountId) {
  return {
    text: `DELETE FROM mt5_credentials c
            USING mt5_accounts a
            WHERE c.account_id = a.id AND c.account_id = $2 AND a.user_id = $1
          RETURNING c.account_id;`,
    values: [userId, accountId],
  };
}

/**
 * Close any open job for an account whose credential just went away.
 *
 * Without this the job spins in silence: leasedPayloadQuery JOINs mt5_credentials,
 * so a job with no credential returns NO payload row — the agent is handed nothing,
 * therefore reports nothing, therefore the lease expires, therefore reclaimExpired
 * puts it back, forever. No error anywhere, and the account looks permanently
 * "Syncing now" in the UI.
 *
 * `failed`, not deleted: the job history is the audit trail for "where is my
 * trade", and a job that was cancelled for a real reason should say so.
 */
export function cancelOpenJobsQuery(accountId, reason = 'credential removed') {
  return {
    text: `UPDATE sync_jobs
              SET status = 'failed', error = $2, finished_at = now(),
                  leased_by = NULL, lease_expires_at = NULL
            WHERE account_id = $1 AND status IN ('queued', 'leased')
          RETURNING id, status;`,
    values: [accountId, reason],
  };
}

/** Record a successful, verified-read-only login. */
export function markVerifiedQuery(accountId) {
  return {
    text: `UPDATE mt5_credentials
              SET read_only = TRUE, verified_at = now(), last_error = NULL, updated_at = now()
            WHERE account_id = $1
          RETURNING account_id, verified_at;`,
    values: [accountId],
  };
}

export function markErrorQuery(accountId, error) {
  return {
    text: `UPDATE mt5_credentials
              SET last_error = $2, updated_at = now()
            WHERE account_id = $1
          RETURNING account_id, last_error;`,
    values: [accountId, String(error ?? '').slice(0, 500)],
  };
}

/**
 * A master password was detected (the terminal reported trade_allowed). Delete
 * it — do not merely flag it.
 *
 * Holding a trade-capable credential for someone else's funded account is a
 * different liability from holding a read-only one, and we promised not to. The
 * failed sync_jobs row carries the reason, which is why that table is the audit
 * trail rather than a flag on this one.
 */
export function rejectMasterPasswordQuery(accountId) {
  return {
    text: `DELETE FROM mt5_credentials WHERE account_id = $1 RETURNING account_id;`,
    values: [accountId],
  };
}

// ---------------------------------------------------------------------------
// Thin DB wrappers
// ---------------------------------------------------------------------------

const run = async (q) => (await query(q.text, q.values)).rows;

export async function saveCredential({ accountId, server, firmKey, password }, cfg = config) {
  const passwordCt = sealPassword(accountId, password, cfg);
  return (await run(saveCredentialQuery({ accountId, server, firmKey, passwordCt })))[0] ?? null;
}

export const credentialStatus = async (userId, accountId) =>
  (await run(credentialStatusQuery(userId, accountId)))[0] ?? null;
export async function deleteCredential(userId, accountId) {
  const gone = (await run(deleteCredentialQuery(userId, accountId)))[0] ?? null;
  // Only after a confirmed delete — cancelling jobs for an account the caller does
  // not own would be a cross-tenant write.
  if (gone) await run(cancelOpenJobsQuery(accountId));
  return gone;
}
export const markVerified = (accountId) => run(markVerifiedQuery(accountId));
export const markError = (accountId, error) => run(markErrorQuery(accountId, error));
export const rejectMasterPassword = (accountId) => run(rejectMasterPasswordQuery(accountId));
