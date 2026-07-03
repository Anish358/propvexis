-- Strategies: promote the hardcoded, single-tenant `trades.setup` enum
-- (Continue/Liq-run/Fractal/SMC — one trader's SMC style) into a first-class,
-- user-owned, managed catalog for the multi-tenant SaaS.
--
-- Phase 1 keys a trade to its strategy by NAME (trades.setup == strategies.name),
-- reusing the existing string-keyed analytics/filter pipeline unchanged. The
-- name is the natural key (UNIQUE per user); renames cascade to trades.setup.
-- `rules`/`checklist` are reserved now (nullable) so Phase 2 (auto-adherence)
-- and Phase 3 (checklists) need no further migration.

CREATE TABLE IF NOT EXISTS strategies (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT   NOT NULL,
    color       TEXT,                                 -- hex swatch for the UI (nullable; UI falls back)
    description TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0,           -- user-controlled display order
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,        -- archive (soft) without deleting history
    rules       JSONB,                                -- reserved: Phase 2 objective auto-adherence
    checklist   JSONB,                                -- reserved: Phase 3 pre-trade checklist
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_strategies_user ON strategies (user_id);

-- keep updated_at fresh (function defined in schema.sql; re-declared idempotently
-- so this migration is safe to apply standalone)
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_strategies_updated_at ON strategies;
CREATE TRIGGER trg_strategies_updated_at
    BEFORE UPDATE ON strategies
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Backfill: promote each user's distinct existing `setup` values into managed
-- strategies. Preserves the original SMC ordering for the seed user; anything
-- else sorts after. Owner-less legacy trades (user_id NULL) are skipped — they
-- aren't in any user's scope. Idempotent via ON CONFLICT.
INSERT INTO strategies (user_id, name, sort_order)
SELECT d.user_id,
       d.setup,
       COALESCE(array_position(ARRAY['Continue', 'Liq-run', 'Fractal', 'SMC'], d.setup), 99)
FROM (
    SELECT DISTINCT user_id, setup
    FROM trades
    WHERE setup IS NOT NULL AND setup <> '' AND user_id IS NOT NULL
) d
ON CONFLICT (user_id, name) DO NOTHING;
