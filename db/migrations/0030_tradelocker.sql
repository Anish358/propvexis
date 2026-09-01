-- TradeLocker: what mt5_credentials could not say, and the second identifier
-- every /trade request needs.
--
-- REUSING mt5_credentials IS DELIBERATE. TradeLocker's credential is a password
-- against a server -- the same shape MT5's is -- so a second credential table
-- would be the same five columns under a different name. cTrader got its own
-- table (0029) because an OAuth token pair at cTID grain genuinely is not this
-- shape: it belongs to an identity owning many accounts, and its refresh token is
-- consumed on use.
--
-- read_only WILL BE FALSE FOR EVERY TRADELOCKER ROW, and truthfully: the
-- credential can trade, because TradeLocker offers no read-only alternative --
-- no investor password, no OAuth, no scope. That changes what the column MEANS
-- per platform: on MT5 read_only = FALSE is a credential awaiting deletion, on
-- TradeLocker it is simply what the platform gives you. queue.js is narrowed
-- accordingly (`a.platform <> 'mt5' OR c.read_only IS NOT FALSE`); unscoped, no
-- TradeLocker account would EVER be queued -- no error, no failed job, no row
-- anywhere, the account simply never syncs.
ALTER TABLE mt5_credentials ADD COLUMN IF NOT EXISTS login_email TEXT;

-- accNum is NOT accountId. accountId is the multi-digit id in the URL path;
-- accNum is a small ordinal (usually one digit) sent as a HEADER saying which of
-- the login's accounts is meant. Sending the wrong accNum returns ANOTHER OF THE
-- SAME TRADER'S ACCOUNTS with a 200 and no error, so both are stored rather than
-- either being recomputed at call time. Both come from /auth/jwt/all-accounts.
--
-- mt5_login carries the BANDED value (5e12 + tl_account_id) because mt5_login is
-- UNIQUE across every tenant and a raw TradeLocker accountId can collide with a
-- stranger's MT5 login. platform_login and is_live_env from 0029 are reused
-- as-is. See domain/sync/logins.js.
ALTER TABLE mt5_accounts
    ADD COLUMN IF NOT EXISTS tl_account_id BIGINT,
    ADD COLUMN IF NOT EXISTS tl_acc_num    INTEGER;

-- One PropVexis account per TradeLocker accountId, for the same cross-tenant
-- reason 0029 indexes ctid_trader_account_id: without it the same broker account
-- can be connected twice and ingest the same trades under two logins.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mt5_accounts_tl_account
    ON mt5_accounts (tl_account_id) WHERE tl_account_id IS NOT NULL;
