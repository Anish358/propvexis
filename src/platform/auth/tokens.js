import { createHash, randomBytes } from 'node:crypto';
import { query } from '../db.js';

// Single-use secrets mailed to a user's address: email verification and
// password reset. Both are "prove you can read this inbox", so they share one
// table (db/migrations/0024) and this one module.
//
// Split like credentials.js: the crypto and the policy are pure and unit-tested
// without a database; only issue/consume touch Postgres.

export const VERIFY = 'verify';
export const RESET = 'reset';

// TTLs differ because the risk differs. A reset link is a live credential for
// the account, so it is short. A verification link grants nothing an attacker
// wants (it only confirms an address the user already controls), so it can
// survive a "I'll do it tonight" gap without forcing a resend.
export const TOKEN_TTL_MS = {
  [VERIFY]: 24 * 60 * 60 * 1000,
  [RESET]: 60 * 60 * 1000,
};

// 32 bytes = 256 bits. Well beyond guessing, and base64url keeps the emailed
// URL free of anything that mail clients or shells will escape.
const TOKEN_BYTES = 32;

/** A fresh secret. Returned once, in plaintext, and never stored in that form. */
export function mintToken() {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/**
 * SHA-256, hex. What actually goes in the table — see the migration for why a
 * fast hash is the right choice for a high-entropy secret.
 */
export function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

/** Absolute expiry for a kind, from a caller-supplied `now` so it's testable. */
export function tokenExpiry(kind, now = Date.now()) {
  const ttl = TOKEN_TTL_MS[kind];
  if (!ttl) throw new Error(`unknown token kind: ${kind}`);
  return new Date(now + ttl);
}

/**
 * Reject anything that can't be one of our tokens before it reaches the
 * database — a token arrives from a URL, so it is fully attacker-controlled.
 * Length is bounded so a huge query string can't be turned into hashing work.
 */
export function isTokenShaped(token) {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{40,64}$/.test(token);
}

/**
 * Issue a token, returning the plaintext to mail.
 *
 * Outstanding tokens of the same kind are burned first, so a user always has
 * exactly one live link per flow: clicking "resend" three times and then the
 * FIRST mail must not work — otherwise every resend widens the window instead
 * of refreshing it. Expired rows for that user are dropped in the same pass, so
 * the table stays small without a scheduled job.
 */
export async function issueToken({ userId, kind, now = Date.now() }) {
  if (!TOKEN_TTL_MS[kind]) throw new Error(`unknown token kind: ${kind}`);
  const token = mintToken();

  await query(
    `DELETE FROM auth_tokens
      WHERE user_id = $1 AND (kind = $2 OR expires_at < now());`,
    [userId, kind]
  );
  await query(
    `INSERT INTO auth_tokens (user_id, kind, token_hash, expires_at)
     VALUES ($1, $2, $3, $4);`,
    [userId, kind, hashToken(token), tokenExpiry(kind, now)]
  );
  return token;
}

/**
 * Redeem a token exactly once.
 *
 * @returns {Promise<number|null>} the owning user id, or null when the token is
 * unknown, of the wrong kind, expired or already used.
 *
 * The single-use guarantee is the UPDATE's own WHERE clause, not a read
 * followed by a write: two requests racing the same link both run the same
 * statement, and Postgres row locking means exactly one sees `used_at IS NULL`.
 * A check-then-update here would let a leaked link be redeemed twice.
 */
export async function consumeToken({ token, kind }) {
  if (!isTokenShaped(token) || !TOKEN_TTL_MS[kind]) return null;
  const { rows } = await query(
    `UPDATE auth_tokens
        SET used_at = now()
      WHERE token_hash = $1
        AND kind = $2
        AND used_at IS NULL
        AND expires_at > now()
      RETURNING user_id;`,
    [hashToken(token), kind]
  );
  return rows.length ? Number(rows[0].user_id) : null;
}
