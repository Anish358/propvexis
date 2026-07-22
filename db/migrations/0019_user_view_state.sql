-- Server-side view state (per user). Previously the client kept its per-scope
-- view configs (display unit + data filters + widget overrides) and global trade
-- settings (breakeven rounding + trade-log column visibility) in the browser's
-- localStorage. That made the same user see DIFFERENT filters/settings on
-- different browsers/devices (and never sync), which surfaced as "the dashboard
-- looks different in local vs prod". Move it to the server so it follows the
-- USER, not the browser.
--
-- One JSONB blob per user (not one row per scope): the client already models this
-- as two nested objects, so a single document keeps the read/write a single
-- round-trip and avoids per-scope row churn. The blob shape is owned by the
-- client (frontend/src/App.jsx) — the server treats it as opaque state.
CREATE TABLE IF NOT EXISTS user_view_state (
    user_id    BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    state      JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
