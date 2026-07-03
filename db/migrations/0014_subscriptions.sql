-- Razorpay recurring subscriptions. Maps a Razorpay subscription to our user so
-- webhooks can resolve the owner and drive users.plan. users.plan stays the
-- effective plan (updated by verified webhooks); this table is the audit/state.

CREATE TABLE IF NOT EXISTS subscriptions (
    id                       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id                  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    razorpay_subscription_id TEXT   NOT NULL UNIQUE,
    plan                     TEXT   NOT NULL,                 -- our slug (e.g. 'pro')
    status                   TEXT   NOT NULL DEFAULT 'created',
    current_end              TIMESTAMPTZ,                     -- paid-through, from Razorpay current_end
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions (user_id);

-- keep updated_at fresh (function defined in schema.sql; re-declared idempotently
-- so this migration is safe to apply standalone)
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
