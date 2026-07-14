import crypto from 'node:crypto';
import { query } from './db.js';

const genToken = () => crypto.randomBytes(24).toString('hex'); // 48 hex chars
// mt5_login is BIGINT (pg returns string) and nullable until bound — keep null
// as null (Number(null) is 0, which would collide with the imported-history id).
const loginNum = (v) => (v == null ? null : Number(v));

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
    // God / strategy view = EVERY trade the user owns (account-linked OR not).
    // Filter by user_id so account-less trades (imports + manual) are included.
    return { god: true, userId, logins: owned, filterCol: 'user_id', filterVal: userId };
  }
  const want = Number(requested);
  if (Number.isNaN(want) || !owned.includes(want)) return null;
  // Single account = only that account's trades (account-less ones excluded).
  return { god: false, userId, logins: [want], filterCol: 'account_id', filterVal: want };
}

// The user's accounts with their latest live balance (LEFT JOIN so accounts
// that have never reported a balance still appear). Feeds the switcher + box.
export async function listAccounts(userId) {
  const { rows } = await query(
    `SELECT a.id, a.mt5_login, a.label, a.broker, a.currency, a.start_balance,
            a.account_type, a.daily_dd_pct, a.max_dd_pct, a.profit_target_pct, a.payout_split_pct,
            a.ingest_token, a.kind, a.is_active, a.created_at,
            acc.balance, acc.equity, acc.updated_at AS balance_updated_at
       FROM mt5_accounts a
       LEFT JOIN accounts acc ON acc.account_id = a.mt5_login
      WHERE a.user_id = $1
      ORDER BY a.created_at ASC, a.id ASC;`,
    [userId]
  );
  // `pending` = no first trade yet (login not bound). Tokens are the user's own
  // secret, returned behind auth so the EA setup screen can display them.
  return rows.map((r) => ({ ...r, mt5_login: loginNum(r.mt5_login), pending: r.mt5_login == null }));
}

// Columns selected/returned for an account (kept in sync across queries).
const ACCT_COLS =
  'id, mt5_login, label, broker, currency, start_balance, account_type, daily_dd_pct, max_dd_pct, profit_target_pct, payout_split_pct, dd_type, min_trading_days, ingest_token, kind, is_active, created_at';

// Create an account. A 'synced' account is pending (no login yet) and carries a
// fresh ingest token — the EA binds its real MT5 login on the first trade. A
// 'manual' account carries NO token and is immediately given a synthetic negative
// login (-id) so its trades can be scoped by account_id without any live sync.
export async function createAccount(userId, { label, broker, currency, start_balance, account_type, daily_dd_pct, max_dd_pct, profit_target_pct, payout_split_pct, dd_type, min_trading_days, kind }) {
  const manual = kind === 'manual';
  const { rows } = await query(
    `INSERT INTO mt5_accounts
       (user_id, label, broker, currency, start_balance, account_type, daily_dd_pct, max_dd_pct, profit_target_pct, payout_split_pct, dd_type, min_trading_days, ingest_token, kind)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'eval'), COALESCE($7, 5), COALESCE($8, 10), COALESCE($9, 8), COALESCE($10, 80), COALESCE($11, 'static'), COALESCE($12, 0), $13, $14)
     RETURNING ${ACCT_COLS};`,
    [userId, label || 'New account', broker || null, currency || 'USD', start_balance ?? null,
     account_type || null, daily_dd_pct ?? null, max_dd_pct ?? null, profit_target_pct ?? null, payout_split_pct ?? null,
     dd_type || null, min_trading_days ?? null,
     manual ? null : genToken(), manual ? 'manual' : 'synced']
  );
  let acct = rows[0];
  if (manual) {
    // Assign the synthetic login now that we know the id (negative space = no
    // collision with real, positive MT5 logins; still UNIQUE per account).
    const { rows: u } = await query(
      `UPDATE mt5_accounts SET mt5_login = -id WHERE id = $1 RETURNING ${ACCT_COLS};`,
      [acct.id]
    );
    acct = u[0];
  }
  return { ...acct, mt5_login: loginNum(acct.mt5_login), pending: acct.mt5_login == null };
}

// Update editable metadata on the user's own account.
export async function updateAccount(userId, id, fields) {
  const allowed = ['label', 'broker', 'currency', 'start_balance', 'account_type', 'daily_dd_pct', 'max_dd_pct', 'profit_target_pct', 'payout_split_pct', 'dd_type', 'min_trading_days', 'is_active'];
  const sets = [];
  const params = [];
  for (const f of allowed) {
    if (f in fields) { params.push(fields[f]); sets.push(`${f} = $${params.length}`); }
  }
  if (!sets.length) return null;
  params.push(id, userId);
  const { rows } = await query(
    `UPDATE mt5_accounts SET ${sets.join(', ')}
      WHERE id = $${params.length - 1} AND user_id = $${params.length}
      RETURNING ${ACCT_COLS};`,
    params
  );
  if (!rows.length) return null;
  return { ...rows[0], mt5_login: loginNum(rows[0].mt5_login), pending: rows[0].mt5_login == null };
}

// Delete the user's own account (trades keep their account_id; just unowned).
export async function deleteAccount(userId, id) {
  const { rows } = await query(
    'DELETE FROM mt5_accounts WHERE id = $1 AND user_id = $2 RETURNING id',
    [id, userId]
  );
  return rows.length > 0;
}

// Look up one of the user's own accounts by its MT5 login (== trades.account_id).
// Used to validate/attach a payout to a real, owned account. Null if not owned.
export async function ownedAccountByLogin(userId, login) {
  const { rows } = await query(
    `SELECT ${ACCT_COLS} FROM mt5_accounts WHERE user_id = $1 AND mt5_login = $2`,
    [userId, login]
  );
  if (!rows.length) return null;
  return { ...rows[0], mt5_login: loginNum(rows[0].mt5_login) };
}

// Look up an account by its ingest token (for the EA ingest path).
export async function accountByToken(token) {
  const { rows } = await query('SELECT * FROM mt5_accounts WHERE ingest_token = $1', [token]);
  return rows[0] ?? null;
}

// Bind a pending account to the MT5 login from its first trade. Returns:
//  'bound'    – just bound to this login
//  'ok'       – already bound to this login
//  'mismatch' – bound to a different login (reject)
//  'conflict' – that login already belongs to another account (reject)
export async function bindOrCheckLogin(account, login) {
  if (account.mt5_login != null) {
    return Number(account.mt5_login) === Number(login) ? 'ok' : 'mismatch';
  }
  try {
    const { rows } = await query(
      `UPDATE mt5_accounts SET mt5_login = $2
        WHERE id = $1 AND mt5_login IS NULL
        RETURNING mt5_login;`,
      [account.id, login]
    );
    if (rows.length) return 'bound';
    // Lost a race — re-read and compare.
    const { rows: cur } = await query('SELECT mt5_login FROM mt5_accounts WHERE id = $1', [account.id]);
    return cur.length && Number(cur[0].mt5_login) === Number(login) ? 'ok' : 'mismatch';
  } catch (err) {
    if (err.code === '23505') return 'conflict'; // unique_violation on mt5_login
    throw err;
  }
}

// The user id that owns a given trade (direct user_id; covers account-less
// strategy/manual trades). Null if the trade doesn't exist or is unowned.
export async function tradeOwnerUserId(tradeId) {
  const { rows } = await query('SELECT user_id FROM trades WHERE id = $1', [tradeId]);
  return rows.length && rows[0].user_id != null ? Number(rows[0].user_id) : null;
}
