-- Day notes — the session-level half of the Daily Journal.
--
-- Per-trade reflection already has a home: `trades.comments`, which the trade log,
-- the preview panel and the journal all read. What had no home is the OTHER thought
-- a trader writes at the end of a session — "I overtraded after the first loss" —
-- which belongs to the day rather than to any one trade. Spreading it across the
-- day's trades would duplicate it and make it unreadable in the trade log.
--
-- SCOPED TO THE USER, NOT TO AN ACCOUNT, deliberately. A trader has one trading day
-- even when they traded three logins inside it, so "how did today go" is a fact
-- about the person. Account-specific detail belongs on the trade note, which is
-- already scoped that way through the trade row's account_id.
--
-- One row per (user, day), created on first write. A day with nothing written has
-- no row at all rather than a row holding '' — see src/domain/journal/dayNotes.js for why absence
-- is the honest representation and what counts over this table would otherwise
-- report.
CREATE TABLE IF NOT EXISTS day_notes (
    user_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day        DATE        NOT NULL,
    note       TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, day)
);
