-- Manual accounts: a Free-tier way to SEGREGATE journal trades per account
-- without an EA. An account is now either:
--   'synced' – bound to a real MT5 login by the EA (Pro+; the existing kind)
--   'manual' – a user-made bucket for manual/CSV trades (all plans)
-- A manual account still lives in mt5_accounts and reuses trades.account_id for
-- scoping, so it needs a login-shaped id. It gets a SYNTHETIC NEGATIVE mt5_login
-- (-id) — real MT5 logins are positive, so the two spaces never collide, and the
-- UNIQUE(mt5_login) constraint holds. Manual accounts carry no ingest_token (no
-- live sync). Existing rows are all 'synced' (the default).
ALTER TABLE mt5_accounts ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'synced';
