/**
 * "CAN THIS ACCOUNT ACTUALLY SYNC?" — asked once, here, as SQL fragments.
 *
 * WHY THIS FILE EXISTS. The question was written out four times — dueAccountsQuery
 * (the 3-hour scheduler), syncableAccountsQuery (the Sync Trades button),
 * ctraderLeasedPayloadQuery (the worker's payload) and the per-account Sync now route
 * — and the copies did not agree. The route asked only whether an account HAD a
 * cTrader identity; the other three additionally required that identity to be LIVE.
 *
 * WHAT THAT COST, on prod 2026-09-08: both of the owner's cTrader accounts pointed at
 * REVOKED identities (see repointAccountsToIdentityQuery for how they got there), so
 * the scheduler skipped them and "Sync Trades" answered *"no accounts are connected
 * for Auto Sync"* — while Settings › Accounts showed both as **Auto sync · Synced**,
 * because that column read `import_method` and the last job's status, which are
 * historical facts. Two days of silence with the UI insisting everything was fine.
 * The per-account "Sync now" was worse: it happily queued a job the payload query
 * could never serve, which is the lease-expire-reclaim spin forever.
 *
 * SO THE ANSWER IS ONE STRING AND EVERY CALLER INTERPOLATES IT. These fragments carry
 * NO user values — they are column references only — so interpolating them is not a
 * parameterisation hole, and it is the only way two hand-written queries can be held
 * identical without a query builder. `test/sync-eligibility-shared.test.js` asserts
 * every consumer uses them rather than a fourth copy.
 *
 * The alias contract is fixed and deliberately terse, because it appears inside other
 * people's queries: `a` = mt5_accounts, `c` = mt5_credentials, `ci` =
 * ctrader_identities. A caller that aliases differently gets a loud SQL error rather
 * than a quietly wrong row.
 */

/**
 * The joins the predicate needs.
 *
 * LEFT, NEVER INNER, AND THIS HAS BITTEN THREE TIMES. A cTrader account has no
 * mt5_credentials row at all — its credential is an OAuth token pair on
 * ctrader_identities at cTID grain — so an inner join matched nothing for it: no
 * error, no failed job, no row ever considered, and the account simply never synced.
 *
 * The identity join carries `revoked_at IS NULL` so a dead grant cannot satisfy the
 * predicate below. That is the whole point of it.
 */
export const SYNC_ELIGIBILITY_JOINS = `
             LEFT JOIN mt5_credentials c  ON c.account_id = a.id
             LEFT JOIN ctrader_identities ci
                    ON ci.id = a.ctrader_identity_id AND ci.revoked_at IS NULL`;

/**
 * Does this account have a usable way in? Asked PER PLATFORM, because "a credential
 * exists" means a different thing on each one.
 *
 * Loosening the join must not loosen the RULE: an MT5 account with no stored password
 * still cannot sync, and queueing it only produces a job the worker can fail.
 */
export const SYNC_CONNECTED_SQL = `CASE a.platform
                    WHEN 'ctrader' THEN ci.id IS NOT NULL
                    ELSE c.account_id IS NOT NULL
                  END`;

/**
 * The MT5-only master-password exclusion.
 *
 * `read_only = FALSE` MEANS DIFFERENT THINGS PER PLATFORM, so the rule is scoped to
 * the one it is about. On MT5 it is a master password awaiting deletion and must never
 * be retried. On TradeLocker EVERY credential is legitimately `read_only = FALSE`,
 * because the platform offers no read-only alternative at all — left unscoped, this
 * single line would silently queue no TradeLocker account ever, with no error anywhere.
 *
 * Separate from SYNC_CONNECTED_SQL because it answers a different question: that one is
 * "is there a way in", this one is "is the way in one we are willing to use". The
 * scheduler applies both; the accounts list reports only the first, because a master
 * password is a thing the trader must fix rather than a broken connection.
 */
export const SYNC_CREDENTIAL_USABLE_SQL = `(a.platform <> 'mt5' OR c.read_only IS NOT FALSE)`;
