// The SQL of account provisioning, as pure {text, values} builders.
//
// Separated from the transaction that runs them for one reason: this repo has no
// test database, so assertable SQL is the only way to pin what provisioning
// writes. Every value rides as a placeholder — none of these strings ever carries
// user input.
import { ACCOUNT_COLUMNS } from './accounts.js';

/** Has this exact provision already been performed? See provision_key in 0026. */
export function findByProvisionKeyQuery(userId, key) {
  return {
    text: `SELECT ${ACCOUNT_COLUMNS} FROM mt5_accounts WHERE user_id = $1 AND provision_key = $2;`,
    values: [userId, key],
  };
}

/**
 * Create the account row.
 *
 * `login` is the caller's decision, not this builder's: an Auto Sync account
 * already knows its MT5 login from the credential step, so it goes in HERE and the
 * unique index turns a collision into a pre-commit failure with nothing written.
 * An EA account passes null and binds on its first trade, exactly as before. A
 * manual account also passes null and is given its synthetic negative login
 * immediately afterwards, once the id exists.
 */
export function insertAccountQuery(userId, v, login) {
  return {
    text: `INSERT INTO mt5_accounts
             (user_id, label, broker, currency, start_balance, account_type,
              daily_dd_pct, max_dd_pct, profit_target_pct, payout_split_pct,
              dd_type, min_trading_days, firm_id, firm_name, product_id,
              capital_kind, platform, import_method, kind, mt5_login,
              ingest_token, provision_key)
           VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'eval'),
                   COALESCE($7, 5), COALESCE($8, 10), COALESCE($9, 8), COALESCE($10, 80),
                   COALESCE($11, 'static'), COALESCE($12, 0), $13, $14, $15,
                   $16, $17, $18, $19, $20,
                   $21, $22)
           RETURNING ${ACCOUNT_COLUMNS};`,
    values: [
      userId, v.label, v.broker, v.currency, v.start_balance, v.account_type,
      v.daily_dd_pct, v.max_dd_pct, v.profit_target_pct, v.payout_split_pct,
      v.dd_type, v.min_trading_days, v.firm_id, v.firm_name, v.product_id,
      v.capital_kind, v.platform, v.import_method, v.kind, login,
      v.ingest_token ?? null, v.provision_key,
    ],
  };
}

/**
 * Give a manual account its synthetic login. Real MT5 logins are positive, so the
 * negative space never collides while still satisfying UNIQUE(mt5_login) — the
 * arrangement migration 0015 introduced.
 */
export function assignSyntheticLoginQuery(id) {
  return {
    text: `UPDATE mt5_accounts SET mt5_login = -id WHERE id = $1 RETURNING ${ACCOUNT_COLUMNS};`,
    values: [id],
  };
}

/**
 * Snapshot the phase's rules as the account's first active challenge.
 *
 * NOT createChallengeForAccount(): that derives the phase from account_type and so
 * can only ever produce 'p1' or 'funded'. A trader who has already passed Phase 1
 * and is adding the Phase 2 account they are actually trading needs to say so, and
 * that is the wizard's phase step.
 *
 * A funded phase carries a NULL target: challenges.profit_target_pct is nullable
 * and NULL means "no target", while the account-level column is NOT NULL and keeps
 * its default. Copying that default across would show a funded account a target it
 * cannot pass.
 */
export function insertChallengeQuery(accountId, v) {
  const funded = v.phase === 'funded';
  return {
    text: `INSERT INTO challenges (mt5_account_id, phase, status, dd_type, start_balance,
                                   daily_dd_pct, max_dd_pct, profit_target_pct, min_trading_days)
           VALUES ($1, $2, 'active', COALESCE($3, 'static'), $4,
                   COALESCE($5, 4), COALESCE($6, 10), $7, COALESCE($8, 0))
           ON CONFLICT (mt5_account_id) WHERE status = 'active' DO NOTHING
           RETURNING id, mt5_account_id, phase, status;`,
    values: [
      accountId, v.phase, v.dd_type, v.start_balance,
      v.daily_dd_pct, v.max_dd_pct, funded ? null : v.profit_target_pct, v.min_trading_days,
    ],
  };
}
