import { query } from './db.js';

// Account scoping helpers for the multi-tenant layer. An "account" is an MT5
// login (== trades.account_id); ownership lives in mt5_accounts.user_id.
// MT5 logins and user ids are BIGINT — pg returns them as strings, so we
// coerce to Number (both are well within Number.MAX_SAFE_INTEGER).

// MT5 logins owned by a user.
export async function ownedLogins(userId) {
  const { rows } = await query('SELECT mt5_login FROM mt5_accounts WHERE user_id = $1', [userId]);
  return rows.map((r) => Number(r.mt5_login));
}

// Resolve a requested account selection to the concrete list of logins to
// filter on. `requested` is a specific login, or null/''/'all' for the god view
// (every account the user owns). Returns { logins, god } or null when the
// requested account isn't owned by this user (caller should 403/404).
export async function resolveScope(userId, requested) {
  const owned = await ownedLogins(userId);
  if (requested == null || requested === '' || requested === 'all') {
    return { logins: owned, god: true };
  }
  const want = Number(requested);
  if (Number.isNaN(want) || !owned.includes(want)) return null;
  return { logins: [want], god: false };
}

// The user's accounts with their latest live balance (LEFT JOIN so accounts
// that have never reported a balance still appear). Feeds the switcher + box.
export async function listAccounts(userId) {
  const { rows } = await query(
    `SELECT a.id, a.mt5_login, a.label, a.broker, a.currency, a.start_balance,
            a.is_active, a.created_at,
            acc.balance, acc.equity, acc.updated_at AS balance_updated_at
       FROM mt5_accounts a
       LEFT JOIN accounts acc ON acc.account_id = a.mt5_login
      WHERE a.user_id = $1
      ORDER BY a.created_at ASC, a.id ASC;`,
    [userId]
  );
  return rows.map((r) => ({ ...r, mt5_login: Number(r.mt5_login) }));
}

// The user id that owns a given trade (via its account_id -> mt5_accounts),
// or null if the trade doesn't exist or its account is unclaimed.
export async function tradeOwnerUserId(tradeId) {
  const { rows } = await query(
    `SELECT m.user_id
       FROM trades t
       JOIN mt5_accounts m ON m.mt5_login = t.account_id
      WHERE t.id = $1;`,
    [tradeId]
  );
  return rows.length ? Number(rows[0].user_id) : null;
}
