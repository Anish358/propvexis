-- Email verification + password reset.
--
-- Migration 0021 added email+password login but had no way to prove an address
-- belongs to the person typing it, and no way back in for someone who forgot
-- their password (or whose password was revoked by the Google-link rule in
-- src/platform/auth/auth.js). Both flows need the same thing: a single-use
-- secret mailed to the address, so they share one table.

-- NULL = address never proven. Deliberately nullable rather than a boolean with
-- a default: "when" is what makes a stale verification auditable, and it means
-- existing rows don't silently claim to be verified.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- Backfill the accounts whose address Google already proved. auth.js only
-- accepts a Google login when the ID token carries email_verified, so these are
-- verified by a stronger check than our own mail round-trip. Anything with only
-- a password stays NULL — that is precisely the population this migration
-- exists to distinguish.
UPDATE users
   SET email_verified_at = created_at
 WHERE email_verified_at IS NULL
   AND google_sub IS NOT NULL;

-- Session generation. Sessions are stateless JWTs, so changing a password
-- cannot by itself evict the sessions an attacker already holds — the whole
-- point of a reset. Bumping this invalidates every token minted before it; the
-- claim is checked in requireAuth (see auth.js sessionEpochOf).
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_epoch INTEGER NOT NULL DEFAULT 0;

-- One row per emailed secret. `token_hash` is SHA-256 of the token, never the
-- token itself: this table is in every backup (db:backup -> S3), and a leaked
-- backup must not hand over live password-reset links. SHA-256 rather than
-- scrypt because the token is 32 random bytes — there is no low-entropy input
-- for an attacker to grind, so a slow KDF would only cost us latency.
CREATE TABLE IF NOT EXISTS auth_tokens (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind       TEXT        NOT NULL CHECK (kind IN ('verify', 'reset')),
    token_hash TEXT        NOT NULL UNIQUE,   -- also the lookup index
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,                   -- single use: set on redemption
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Supports "invalidate this user's outstanding tokens of this kind", which runs
-- on every issue (so the newest link is the only live one) and on redemption.
CREATE INDEX IF NOT EXISTS idx_auth_tokens_live
    ON auth_tokens (user_id, kind) WHERE used_at IS NULL;
