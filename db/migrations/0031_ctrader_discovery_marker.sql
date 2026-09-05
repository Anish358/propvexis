-- "Has this grant been looked at" is not the same question as "did it find
-- anything", and conflating them made the worker poll forever.
--
-- identitiesAwaitingDiscoveryQuery asked for identities with NO rows in
-- ctrader_discovered_accounts. An identity that legitimately owns ZERO trading
-- accounts never gets a row -- so it qualified again on the very next tick, and
-- the next, opening a socket and making two requests against a rate-limited API
-- every time. Seen in the prod log as the same two identities reporting
-- "discovery done ... found:0" on every pass.
--
-- Nullable with no default: NULL means "never looked", which is exactly the state
-- every existing row is in, so the backfill is the absence of one.
ALTER TABLE ctrader_identities
    ADD COLUMN IF NOT EXISTS discovered_at TIMESTAMPTZ;
