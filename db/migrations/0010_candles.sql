-- Trade replay: M1 price bars around each trade, sourced from the EA (the MT5
-- terminal has the broker's own history, so replay shows the exact feed the
-- trade executed on — no third-party data API).
--
-- Flow: trade ingest enqueues a candle_request for the trade's replay window
-- (padding before entry / after exit). The EA polls GET /api/candles/requests,
-- CopyRates the window once it is fully in the past, and POSTs the bars to
-- /api/candles/ingest; the final chunk marks the request done. /replay also
-- enqueues on demand for older EA trades that lack coverage (backfill).

-- One row per M1 bar. Keyed by the normalized symbol (EURUSD, not EURUSD.r):
-- market data is per-instrument, not per-account. Upserts are idempotent, so
-- EA retries and overlapping trade windows are harmless.
CREATE TABLE IF NOT EXISTS candles (
    symbol_base TEXT NOT NULL,
    ts          TIMESTAMPTZ NOT NULL,       -- bar open time (UTC)
    open        DOUBLE PRECISION NOT NULL,
    high        DOUBLE PRECISION NOT NULL,
    low         DOUBLE PRECISION NOT NULL,
    close       DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (symbol_base, ts)
);

CREATE TABLE IF NOT EXISTS candle_requests (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id  BIGINT NOT NULL,            -- MT5 login whose EA serves this
    symbol      TEXT NOT NULL,              -- raw broker symbol (what CopyRates needs)
    symbol_base TEXT NOT NULL,
    from_time   TIMESTAMPTZ NOT NULL,
    to_time     TIMESTAMPTZ NOT NULL,       -- only handed out once now() >= to_time
    status      TEXT NOT NULL DEFAULT 'pending',  -- pending | done | failed
    attempts    INT  NOT NULL DEFAULT 0,    -- EA polls served; failed past a cap
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- The window is derived deterministically from the trade's times, so the
    -- immediate close send and the later MFE-finalize resend (and any /replay
    -- re-request) all collapse into one row.
    UNIQUE (account_id, symbol_base, from_time, to_time)
);

CREATE INDEX IF NOT EXISTS candle_requests_pending_idx
    ON candle_requests (account_id, to_time) WHERE status = 'pending';
