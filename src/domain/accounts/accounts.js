import crypto from 'node:crypto';
import { query } from '../../platform/db.js';

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
// filter on. `requested` is null/''/'all' for the god view (every account the
// user owns), a single login, or a comma-separated list of logins (multi-select).
// Returns { god, userId, logins, filterCol } or null when NONE of the requested
// logins are owned by this user (caller should 403/404).
export async function resolveScope(userId, requested) {
  const owned = await ownedLogins(userId);
  if (requested == null || requested === '' || requested === 'all') {
    // God / strategy view = EVERY trade the user owns (account-linked OR not).
    // Filter by user_id so account-less trades (imports + manual) are included.
    return { god: true, userId, logins: owned, filterCol: 'user_id' };
  }
  // A single login or a comma-separated list; keep only the ones this user owns.
  const wanted = [...new Set(
    String(requested).split(',').map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n))
  )];
  const logins = wanted.filter((n) => owned.includes(n));
  if (!logins.length) return null;
  // A single account keeps its $-based single view; selecting multiple accounts
  // aggregates like the god view (R-based) but restricted to the chosen ones.
  // Either way, account_id filtering excludes account-less (import/manual) trades.
  return { god: logins.length > 1, userId, logins, filterCol: 'account_id' };
}

// Build the SQL scope predicate, parameterizing values via `add(val) -> '$n'`.
// God (all accounts) filters by user_id so account-less trades are included; an
// explicit selection (one or many) filters by account_id = ANY(logins).
// `filterCol` is code-controlled, never user input — safe to branch on.
export function scopeCondition(scope, add) {
  return scope.filterCol === 'user_id'
    ? `user_id = ${add(scope.userId)}`
    : `account_id = ANY(${add(scope.logins)})`;
}

// The user's accounts with their latest live balance (LEFT JOIN so accounts
// that have never reported a balance still appear). Feeds the switcher + box.
export async function listAccounts(userId) {
  const { rows } = await query(
    `SELECT a.id, a.mt5_login, a.label, a.broker, a.currency, a.start_balance,
            a.account_type, a.daily_dd_pct, a.max_dd_pct, a.profit_target_pct, a.payout_split_pct,
            a.payout_cycle_days, a.payout_anchor_date,
            a.firm_id, a.firm_name,
            a.product_id, a.capital_kind, a.platform, a.import_method,
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
// Exported so provisionQueries.js returns the same shape and test/provision-tx
// can assert the new columns are actually reachable through the API.
export const ACCOUNT_COLUMNS =
  'id, mt5_login, label, broker, currency, start_balance, account_type, daily_dd_pct, max_dd_pct, profit_target_pct, payout_split_pct, payout_cycle_days, payout_anchor_date, dd_type, min_trading_days, firm_id, firm_name, product_id, capital_kind, platform, import_method, ingest_token, kind, is_active, created_at';
const ACCT_COLS = ACCOUNT_COLUMNS;

// Create an account. A 'synced' account is pending (no login yet) and carries a
// fresh ingest token — the EA binds its real MT5 login on the first trade. A
// 'manual' account carries NO token and is immediately given a synthetic negative
// login (-id) so its trades can be scoped by account_id without any live sync.
export async function createAccount(userId, { label, broker, currency, start_balance, account_type, daily_dd_pct, max_dd_pct, profit_target_pct, payout_split_pct, dd_type, min_trading_days, firm_id, firm_name, kind }) {
  const manual = kind === 'manual';
  const { rows } = await query(
    `INSERT INTO mt5_accounts
       (user_id, label, broker, currency, start_balance, account_type, daily_dd_pct, max_dd_pct, profit_target_pct, payout_split_pct, dd_type, min_trading_days, firm_id, firm_name, ingest_token, kind, import_method)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'eval'), COALESCE($7, 5), COALESCE($8, 10), COALESCE($9, 8), COALESCE($10, 80), COALESCE($11, 'static'), COALESCE($12, 0), $13, $14, $15, $16, $17)
     RETURNING ${ACCT_COLS};`,
    [userId, label || 'New account', broker || null, currency || 'USD', start_balance ?? null,
     account_type || null, daily_dd_pct ?? null, max_dd_pct ?? null, profit_target_pct ?? null, payout_split_pct ?? null,
     dd_type || null, min_trading_days ?? null, firm_id || null, firm_name || null,
     manual ? null : genToken(), manual ? 'manual' : 'synced', manual ? 'manual' : 'ea']
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

// mt5_accounts.profit_target_pct is NOT NULL (the eval-template default, always
// some %); challenges.profit_target_pct is nullable (NULL = no target, e.g. a
// funded account's manual target being cleared). A caller sending
// `profit_target_pct: null` means "clear the active challenge's target", which
// must NOT be applied to this NOT NULL column — so strip it from the fields
// going into the account-row update (server.js still passes the null through
// to syncActiveChallengeRules unchanged).
export function stripNullProfitTarget(fields) {
  if (fields.profit_target_pct !== null) return fields;
  const { profit_target_pct, ...rest } = fields;
  return rest;
}

const shapeAcct = (r) => ({ ...r, mt5_login: loginNum(r.mt5_login), pending: r.mt5_login == null });

// Update editable metadata on the user's own account. `fields` can end up
// empty after stripNullProfitTarget removes its only key (clearing a funded
// account's target touches no mt5_accounts column) — that's not "not found",
// so it falls back to an ownership-checked read instead of skipping the query
// and returning null (which the caller would otherwise 404 on).
export async function updateAccount(userId, id, fields) {
  // payout_cycle_days / payout_anchor_date are edited from the Overview's
  // "Upcoming payouts" card (the small edit-cycle popup), not the accounts modal —
  // same PATCH route, so no second write path.
  const allowed = ['label', 'broker', 'currency', 'start_balance', 'account_type', 'daily_dd_pct', 'max_dd_pct', 'profit_target_pct', 'payout_split_pct', 'payout_cycle_days', 'payout_anchor_date', 'dd_type', 'min_trading_days', 'firm_id', 'firm_name', 'is_active'];
  const sets = [];
  const params = [];
  for (const f of allowed) {
    if (f in fields) { params.push(fields[f]); sets.push(`${f} = $${params.length}`); }
  }
  if (!sets.length) {
    const { rows } = await query(
      `SELECT ${ACCT_COLS} FROM mt5_accounts WHERE id = $1 AND user_id = $2;`,
      [id, userId]
    );
    return rows.length ? shapeAcct(rows[0]) : null;
  }
  params.push(id, userId);
  const { rows } = await query(
    `UPDATE mt5_accounts SET ${sets.join(', ')}
      WHERE id = $${params.length - 1} AND user_id = $${params.length}
      RETURNING ${ACCT_COLS};`,
    params
  );
  return rows.length ? shapeAcct(rows[0]) : null;
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

// Look up one of the user's own accounts by its primary key. The server-side
// sync path addresses accounts by id (a credential can exist before any trade has
// bound an mt5_login), so ownedAccountByLogin is not usable there.
export async function ownedAccountById(userId, id) {
  const { rows } = await query(
    `SELECT ${ACCT_COLS} FROM mt5_accounts WHERE user_id = $1 AND id = $2`,
    [userId, id]
  );
  if (!rows.length) return null;
  return { ...rows[0], mt5_login: loginNum(rows[0].mt5_login) };
}

// Mint the per-account ingest token if the account has none, and return it.
//
// Accounts created before migration 0005 introduced per-account tokens have
// ingest_token NULL — they authenticated with the legacy GLOBAL token instead.
// That is a legitimate historical state, not corruption, and server-side sync
// cannot work without a token because the worker posts trades exactly the way the
// EA does. Refusing such an account left the user at a dead end with no button
// anywhere that could mint one, so enabling live sync mints it instead.
//
// Idempotent, and never overwrites an existing token: the WHERE clause carries the
// IS NULL, so two concurrent callers cannot rotate a token the EA is already
// using (which would silently break that trader's EA sync).
export async function ensureIngestToken(userId, id) {
  const { rows } = await query(
    `UPDATE mt5_accounts SET ingest_token = $3
      WHERE id = $1 AND user_id = $2 AND ingest_token IS NULL
      RETURNING ingest_token;`,
    [id, userId, genToken()]
  );
  if (rows.length) return rows[0].ingest_token;
  // Either it already had one, or this is not the caller's account. Re-read under
  // the same ownership filter so the second case still returns null.
  const { rows: cur } = await query(
    'SELECT ingest_token FROM mt5_accounts WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  return cur.length ? cur[0].ingest_token : null;
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
