-- Email + password auth alongside Google.
--
-- `google_sub` was NOT NULL because Google was the only way in. A password
-- account has no Google identity, so the column becomes nullable — Postgres
-- allows many NULLs under a UNIQUE constraint, so the uniqueness guarantee for
-- real subs is unchanged. Accounts can hold both: auth.findOrCreateUser already
-- reconciles by email, so a password user who later clicks "Continue with
-- Google" has their existing row linked to the Google sub rather than duplicated.
ALTER TABLE users ALTER COLUMN google_sub DROP NOT NULL;

-- scrypt hash in the self-describing `scrypt$N$r$p$salt$hash` format written by
-- src/platform/auth/credentials.js. NULL means "no password set" — a Google-only account.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- A row with neither identity could never log in; reject it at the DB level so
-- a future code path can't create one. Existing rows all have google_sub.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_has_auth_method;
ALTER TABLE users ADD CONSTRAINT users_has_auth_method
    CHECK (google_sub IS NOT NULL OR password_hash IS NOT NULL);
