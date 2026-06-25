-- Amey Journal — core schema (step 1)
-- One row per closed trade. EA-populated mechanical fields + user-tagged
-- discretionary fields. The Summary/Yearly dashboards are aggregations over
-- this single table (added in a later step).

CREATE TABLE IF NOT EXISTS trades (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- Idempotency: the MT5 position/deal ticket. Re-sending the same trade
    -- (EA retry, reconnect) updates the row instead of duplicating it.
    -- Nullable because spreadsheet imports have no ticket.
    mt5_ticket      BIGINT,
    account_id      BIGINT NOT NULL,
    source          TEXT   NOT NULL DEFAULT 'ea',         -- 'ea' (live) | 'import' (spreadsheet)

    -- Mechanical fields (filled by the EA on close; null for imports)
    symbol          TEXT   NOT NULL,                      -- raw broker symbol (e.g. EURUSD.r)
    symbol_base     TEXT,                                  -- normalized base (e.g. EURUSD) for pips + grouping
    direction       TEXT   CHECK (direction IN ('buy','sell')),
    open_time       TIMESTAMPTZ NOT NULL,
    close_time      TIMESTAMPTZ NOT NULL,
    session         TEXT   CHECK (session IN ('ASIA','LDN','NY')),  -- derived from open_time

    entry_price     DOUBLE PRECISION,
    sl_price        DOUBLE PRECISION,
    tp_price        DOUBLE PRECISION,
    exit_price      DOUBLE PRECISION,

    volume          DOUBLE PRECISION,
    commission      DOUBLE PRECISION DEFAULT 0,
    pnl_money       DOUBLE PRECISION,                     -- realized P&L in account currency

    -- Risk / excursion metrics
    sl_size_pips    DOUBLE PRECISION,                     -- |entry - sl| in pips  (SL Size)
    mfe_pips        DOUBLE PRECISION,                     -- max favorable excursion in pips (MFE)
    max_r           DOUBLE PRECISION,                     -- mfe_pips / sl_size_pips (MAX R)
    fixed_r         DOUBLE PRECISION,                     -- realized result in R (FIXED R TARGET)

    -- Discretionary fields (tagged by the user in-app)
    setup           TEXT,                                 -- SMC / Continue / Liq-run / Fractal
    probability     TEXT CHECK (probability IS NULL OR probability IN ('HIGH','MED','LOW')),
    mtf_phase       TEXT,                                 -- A / B / C / A2
    m15_url         TEXT,
    h1_url          TEXT,
    h4_url          TEXT,
    comments        TEXT,
    tagged          BOOLEAN NOT NULL DEFAULT FALSE,       -- has the user filled discretionary fields?

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- A ticket is unique per account
    UNIQUE (account_id, mt5_ticket)
);

CREATE INDEX IF NOT EXISTS idx_trades_close_time  ON trades (close_time DESC);
CREATE INDEX IF NOT EXISTS idx_trades_symbol_base ON trades (symbol_base);
CREATE INDEX IF NOT EXISTS idx_trades_source      ON trades (source);
CREATE INDEX IF NOT EXISTS idx_trades_setup      ON trades (setup);
CREATE INDEX IF NOT EXISTS idx_trades_tagged     ON trades (tagged);

-- keep updated_at fresh on any change
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trades_updated_at ON trades;
CREATE TRIGGER trg_trades_updated_at
    BEFORE UPDATE ON trades
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
