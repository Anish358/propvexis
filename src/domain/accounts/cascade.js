// WHAT LEAVES WITH AN ACCOUNT.
//
// Deleting an account used to delete one mt5_accounts row and nothing else, so a
// trader who removed a failed challenge kept its trades in every aggregate, its
// payouts in the finance ledger and its equity snapshots in the drawdown maths —
// all of it unowned, none of it reachable from any surface that could remove it.
// Archiving had the mirror problem: the account left the switcher while its rows
// went on counting.
//
// The two answers are different in kind, which is why they live in one file:
//   DELETE  — the rows are destroyed here, in one transaction with the account.
//   ARCHIVE — nothing is written. `is_active` on the account is the whole
//             mechanism; ownedLogins() stops returning it and the data simply
//             falls out of scope, restorable by unarchiving.
//
// PURE QUERY BUILDERS, no pool of their own: the caller owns the transaction, and
// CI (which has no Postgres) can assert the exact statements this issues.

/**
 * Tables keyed on the MT5 LOGIN rather than on mt5_accounts.id.
 *
 * Everything keyed on the id already cascades through a foreign key —
 * `challenges` and `mt5_credentials` and `sync_jobs` from their own migrations,
 * and `trades` from migration 0028 — so it is absent here on purpose. These
 * tables predate the accounts table being the join target and address an account
 * by the login number instead, which no foreign key can express while
 * mt5_accounts.mt5_login stays nullable (a pending EA account has none).
 *
 * `notifications` is included but keyed loosely: its account_id is NULLABLE
 * because a user-level alert belongs to no account, so the predicate must match
 * the login rather than "not null", or archiving one account would delete another
 * account's alerts along with the user's own.
 *
 * `candles` is deliberately NOT here. It is keyed by (symbol_base, ts) — shared
 * market data that every account's replay reads, not this account's rows. Deleting
 * it with an account would blind the replay of every other account that traded
 * the same instrument.
 */
export const LOGIN_KEYED_TABLES = Object.freeze([
  'payouts',
  'account_fees',
  'equity_snapshots',
  'accounts',
  'candle_requests',
  'notifications',
]);

/**
 * Every statement that removes an account and its data, in the order they must
 * run inside one transaction.
 *
 * The login-keyed deletes come FIRST and the account row LAST. Order matters for
 * a reason beyond tidiness: `trades` is removed by the ON DELETE CASCADE on the
 * final statement, so the account row has to still exist while the explicit
 * deletes run — and an account with a NULL login (a pending EA account that never
 * bound) has no login-keyed rows at all, which is why `login` may be null and the
 * builder simply omits those statements rather than passing null into `= $1`
 * (which matches nothing, silently).
 *
 * Ownership is enforced on the LAST statement, not the first: `user_id = $2` on
 * the mt5_accounts delete is what makes the whole transaction a no-op for another
 * tenant's id — the caller checks its row count and rolls back if it is zero, so
 * the login-keyed deletes never commit against an account the caller does not own.
 */
export function cascadeDeleteStatements({ id, login, userId }) {
  const statements = [];
  if (login != null) {
    for (const table of LOGIN_KEYED_TABLES) {
      statements.push({ text: `DELETE FROM ${table} WHERE account_id = $1;`, values: [login] });
    }
  }
  statements.push({
    text: 'DELETE FROM mt5_accounts WHERE id = $1 AND user_id = $2 RETURNING id, challenge_group_id;',
    values: [id, userId],
  });
  return statements;
}
