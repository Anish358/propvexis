-- Onboarding gate: first-time users are routed through a setup wizard once.
-- `onboarded_at` is NULL until the wizard is completed. Existing users are
-- backfilled as already-onboarded (their trades/accounts predate the wizard),
-- so only brand-new signups see it. New INSERTs (auth.findOrCreateUser) leave
-- the column NULL, which triggers the wizard on first login.
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;

UPDATE users
   SET onboarded_at = COALESCE(last_login_at, created_at, now())
 WHERE onboarded_at IS NULL;
