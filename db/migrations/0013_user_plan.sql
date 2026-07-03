-- Subscription plans for the public SaaS. A per-user plan slug gates features:
--   free    – manual add + CSV import only
--   pro     – + EA attach sync (user hosts the EA)
--   premium – + MetaApi cloud sync (deferred; slug reserved)
-- Entitlements themselves live in src/plans.js (pure, testable); the DB only
-- stores the slug. Read per-request (GET /api/auth/me), never baked into the JWT
-- (the session cookie lives ~30d and would go stale).

ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';

-- Guard against typos writing an unknown slug (which src/plans.js would fail-close
-- to free anyway, but a bad row shouldn't exist).
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_plan_chk;
ALTER TABLE users ADD CONSTRAINT users_plan_chk CHECK (plan IN ('free', 'pro', 'premium'));

-- Grandfather every EXISTING user to 'pro'. Critical: these users are already
-- ingesting trades via the EA; defaulting them to 'free' would silently break
-- their live sync the moment gating ships. New signups get the 'free' default.
UPDATE users SET plan = 'pro' WHERE plan = 'free';
