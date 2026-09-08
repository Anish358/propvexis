-- Reunite cTrader accounts with the live grant for their own cTrader login.
--
-- THE DAMAGE THIS REPAIRS. The OAuth callback creates a new identity row on every
-- consent, and discovery then revokes the older row for the same cTID (it must —
-- uq_ctrader_identities_live would raise otherwise). Nothing repointed the accounts
-- that referenced the retired row, so mt5_accounts.ctrader_identity_id was left naming
-- a REVOKED grant. Every query that decides whether an account can sync joins
-- ctrader_identities ... AND revoked_at IS NULL, so the account fell out of all of
-- them at once: no scheduled syncs, "no accounts are connected for Auto Sync" from the
-- button, and a per-account Sync now that queued a job the worker could never be
-- served. Settings › Accounts went on reporting "Auto sync · Synced" throughout,
-- because that column reads import_method and the last job.
--
-- On prod at the time of writing: identity 4 held account 32, identity 6 held account
-- 34, both superseded — and identity 7, the live one, owned nothing. Account 32 had
-- been silently dead for two days.
--
-- The code fix (adoptCtid, in domain/sync/ctraderIdentities.js) stops it happening
-- again. This statement fixes the rows that already happened.
--
-- SAFE TO RUN, AND SAFE TO RUN TWICE. It only ever moves an account from a revoked
-- grant to a live one belonging to the SAME (user_id, ctid_user_id) — the same cTrader
-- login, same owner, freshly authorized, which is strictly more able to serve that
-- account than the row being left behind. An account whose grant was revoked and NOT
-- replaced (a deliberate disconnect) has no live row to match and is left exactly as it
-- is: still disconnected, which is the truth.
--
-- The join cannot multiply rows: uq_ctrader_identities_live is UNIQUE (user_id,
-- ctid_user_id) WHERE revoked_at IS NULL, so there is at most one `live` per pair.
UPDATE mt5_accounts a
   SET ctrader_identity_id = live.id
  FROM ctrader_identities dead
  JOIN ctrader_identities live
    ON live.user_id      = dead.user_id
   AND live.ctid_user_id = dead.ctid_user_id
   AND live.revoked_at IS NULL
 WHERE a.ctrader_identity_id = dead.id
   AND dead.revoked_at IS NOT NULL
   -- Belt and braces on the tenant boundary: ctid_user_id is a cTrader-side id and
   -- nothing stops two PropVexis users authorizing the same cTrader login.
   AND a.user_id = live.user_id
   AND dead.ctid_user_id IS NOT NULL;
