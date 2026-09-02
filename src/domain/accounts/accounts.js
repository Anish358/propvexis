import crypto from 'node:crypto';
import { query, withTransaction } from '../../platform/db.js';
import { postChallengeFee } from '../finance/fees.js';
import { cascadeDeleteStatements } from './cascade.js';
import { reconcileGroup } from '../prop/challengeGroups.js';

const genToken = () => crypto.randomBytes(24).toString('hex'); // 48 hex chars
// mt5_login is BIGINT (pg returns string) and nullable until bound — keep null
// as null (Number(null) is 0, which would collide with the imported-history id).
const loginNum = (v) => (v == null ? null : Number(v));

// Account scoping helpers for the multi-tenant layer. An "account" is an MT5
// login (== trades.account_id); ownership lives in mt5_accounts.user_id.
// MT5 logins and user ids are BIGINT — pg returns them as strings, so we
// coerce to Number (both are well within Number.MAX_SAFE_INTEGER).

// MT5 logins owned by a user — ACTIVE ONES ONLY.
//
// `is_active = false` is the soft archive Settings › Accounts writes. It used to
// remove the account from the switcher and nothing else, so an archived account's
// trades, payouts and drawdown went on counting in every aggregate the trader
// looked at — the account was hidden, its influence was not. Excluding it here is
// the whole archive mechanism: one predicate, no rows written, and unarchiving
// restores every figure exactly because nothing was destroyed to hide it.
//
// A pending account (mt5_login IS NULL — an EA account that has never bound) is
// excluded too. It has no login to filter trades by, and Number(null) is 0, which
// would put a literal `0` in the ANY() list and scope onto nothing.
export async function ownedLogins(userId) {
  const { rows } = await query(
    'SELECT mt5_login FROM mt5_accounts WHERE user_id = $1 AND is_active AND mt5_login IS NOT NULL',
    [userId],
  );
  return rows.map((r) => Number(r.mt5_login));
}

/**
 * Resolve a requested account selection to the concrete list of logins to filter on.
 *
 * ONE MODE, NOT TWO. This used to answer 'all' with a user_id filter — the "god
 * view" — which was the only scope that could see a trade belonging to no account,
 * and therefore the only reason account-less trades could exist. Migration 0028
 * removed them and made trades.account_id NOT NULL, so the two modes now select
 * exactly the same rows and the second one is gone: every scope is a list of
 * logins, filtered by account_id.
 *
 * `requested` is null/''/'all' for every ACTIVE account the user owns, a single
 * login, or a comma-separated list of logins (multi-select). Returns
 * `{ userId, logins, multi }`, or null when NONE of the requested logins are owned
 * and active (caller should 403/404).
 *
 * `multi` replaces the old `god` flag and answers ONE question — aggregate shape or
 * single-account shape? A single account reports its own currency and returns its
 * snapshot directly; two or more aggregate. It is derived, never requested.
 *
 * AN 'all' THAT RESOLVES TO NOTHING IS NOT AN ERROR, and this is the one asymmetry
 * worth knowing: a user with no accounts (or every account archived) asking for
 * 'all' gets an empty login list rather than null, because "show me everything" is
 * satisfiable by showing nothing and the empty states downstream are built for it.
 * Naming specific logins that are not yours still gets null, which is a 403.
 */
export async function resolveScope(userId, requested) {
  const owned = await ownedLogins(userId);
  if (requested == null || requested === '' || requested === 'all') {
    return { userId, logins: owned, multi: owned.length > 1 };
  }
  // A single login or a comma-separated list; keep only the ones this user owns.
  const wanted = [...new Set(
    String(requested).split(',').map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n))
  )];
  const logins = wanted.filter((n) => owned.includes(n));
  if (!logins.length) return null;
  return { userId, logins, multi: logins.length > 1 };
}

// Build the SQL scope predicate, parameterizing values via `add(val) -> '$n'`.
//
// Always account_id = ANY(logins). There is no user_id branch any more: with every
// trade linked to an account (migration 0028) the two predicates return identical
// rows, and keeping the user_id one would mean a scope that ignores the archive
// filter ownedLogins() applies — an archived account's trades would reappear in the
// all-accounts view, which is the bug this change exists to fix.
export function scopeCondition(scope, add) {
  return `account_id = ANY(${add(scope.logins)})`;
}

// The user's accounts with their latest live balance (LEFT JOIN so accounts
// that have never reported a balance still appear). Feeds the switcher + box.
export async function listAccounts(userId) {
  const { rows } = await query(
    `SELECT a.id, a.mt5_login, a.label, a.broker, a.currency, a.start_balance,
            a.account_type, a.daily_dd_pct, a.max_dd_pct, a.profit_target_pct, a.payout_split_pct,
            a.payout_cycle_days, a.payout_anchor_date, a.dd_type, a.min_trading_days,
            a.consistency_pct,
            a.firm_id, a.firm_name,
            a.product_id, a.capital_kind, a.platform, a.import_method,
            a.ingest_token, a.kind, a.is_active, a.created_at,
            -- The challenge this account is a phase of (migration 0027). It rides on
            -- the account list on purpose: every client already holds that list, so
            -- grouping accounts into challenges costs no second request.
            a.challenge_group_id,
            -- WHICH PHASE THIS ACCOUNT IS, for the same reason and by the same argument.
            --
            -- The top bar's account switcher has always been written to show it — the
            -- scope summary reads "P1 · P2 · Funded" and each menu row carries a phase
            -- badge — but phase was never on this payload, so a.phase was undefined
            -- everywhere and BOTH silently rendered nothing. The switcher said how many
            -- accounts were in scope without saying what kind, which is the one thing a
            -- multi-account trader checks before reading any figure on the page.
            --
            -- Sourced here rather than from /api/prop, which is the only other place it
            -- lives: the switcher is chrome and loads on every route, and a second
            -- request to fill in three characters of label is a request the top bar
            -- would be making on pages that need nothing else from the prop engine.
            ch.phase,
            acc.balance, acc.equity, acc.updated_at AS balance_updated_at
       FROM mt5_accounts a
       LEFT JOIN accounts acc ON acc.account_id = a.mt5_login
       -- THE LATEST challenge row, not the ACTIVE one, and the distinction is the same
       -- one challengeGroupsForUser draws: an account whose phase has passed has no
       -- active row at all, and "Phase 1, passed" is still the phase that account is.
       -- DISTINCT ON does it in one pass, so this stays a single query.
       LEFT JOIN LATERAL (
         SELECT c.phase
           FROM challenges c
          WHERE c.mt5_account_id = a.id
          ORDER BY c.start_date DESC, c.id DESC
          LIMIT 1
       ) ch ON TRUE
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
  'id, mt5_login, label, broker, currency, start_balance, account_type, daily_dd_pct, max_dd_pct, profit_target_pct, payout_split_pct, payout_cycle_days, payout_anchor_date, dd_type, min_trading_days, consistency_pct, firm_id, firm_name, product_id, capital_kind, platform, import_method, ingest_token, kind, is_active, created_at, challenge_group_id';
const ACCT_COLS = ACCOUNT_COLUMNS;

// Create an account. A 'synced' account is pending (no login yet) and carries a
// fresh ingest token — the EA binds its real MT5 login on the first trade. A
// 'manual' account carries NO token and is immediately given a synthetic negative
// login (-id) so its trades can be scoped by account_id without any live sync.
export async function createAccount(userId, { label, broker, currency, start_balance, account_type, daily_dd_pct, max_dd_pct, profit_target_pct, payout_split_pct, dd_type, min_trading_days, firm_id, firm_name, product_id, capital_kind, kind }) {
  const manual = kind === 'manual';
  const { rows } = await query(
    // The four percentage columns are NUMERIC and a caller may send a fractional
    // rule (e.g. daily_dd_pct: 4.5 — plenty of real prop firms use half-percent
    // drawdowns, and AccountForms.jsx's inputs are step="0.1"). Without the
    // `::numeric` cast, Postgres resolves an untyped COALESCE($n, <bare integer
    // literal>) to integer, and the insert 500s the moment a caller supplies a
    // fractional value — this default never even runs in that case, it's the
    // parameter's inferred TYPE that's wrong. Mirrors insertAccountQuery's own
    // comment in provisionQueries.js, where this was fixed first.
    `INSERT INTO mt5_accounts
       (user_id, label, broker, currency, start_balance, account_type, daily_dd_pct, max_dd_pct, profit_target_pct, payout_split_pct, dd_type, min_trading_days, firm_id, firm_name, product_id, capital_kind, ingest_token, kind, import_method)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'eval'), COALESCE($7, 5::numeric), COALESCE($8, 10::numeric), COALESCE($9, 8::numeric), COALESCE($10, 80::numeric), COALESCE($11, 'static'), COALESCE($12, 0), $13, $14, $15, COALESCE($16, 'prop'), $17, $18, $19)
     RETURNING ${ACCT_COLS};`,
    [userId, label || 'New account', broker || null, currency || 'USD', start_balance ?? null,
     account_type || null, daily_dd_pct ?? null, max_dd_pct ?? null, profit_target_pct ?? null, payout_split_pct ?? null,
     dd_type || null, min_trading_days ?? null, firm_id || null, firm_name || null, product_id || null, capital_kind || null,
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
  // product_id MUST stay in this list: TemplatePicker renders unconditionally on
  // the edit form too (AccountForms.jsx), so applying a template while editing
  // sends product_id alongside the rule percentages it pre-fills. Omitting it
  // here would save the new percentages while leaving product_id at its old
  // value (normally NULL) — the account then reads as hand-configured, which is
  // exactly the drift the products layer exists to prevent.
  const allowed = ['label', 'broker', 'currency', 'start_balance', 'account_type', 'daily_dd_pct', 'max_dd_pct', 'profit_target_pct', 'payout_split_pct', 'payout_cycle_days', 'payout_anchor_date', 'dd_type', 'min_trading_days', 'consistency_pct', 'firm_id', 'firm_name', 'product_id', 'is_active'];
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

/**
 * Delete the user's own account AND everything that was about it.
 *
 * WHAT THIS USED TO DO: one DELETE, one row. The trades, payouts, fees, equity
 * snapshots, live balance, candle requests and alerts keyed on the account's MT5
 * login all stayed — invisible, because nothing owned them any more, but still
 * counted by anything that filtered on user_id rather than on the account. That is
 * how the god view kept showing a deleted account's trades.
 *
 * ONE TRANSACTION. A half-deleted account is worse than either outcome: its trades
 * gone but its payouts still in the finance ledger is a P&L the trader cannot
 * reconcile against anything. Either all of it goes or none of it does.
 *
 * OWNERSHIP GATES THE WHOLE TRANSACTION even though the login-keyed deletes run
 * first. They are scoped by mt5_login, which is globally unique but says nothing
 * about who owns it — so the guard is the final statement's `user_id = $2`: zero
 * rows there means this is not the caller's account, and the throw rolls back every
 * delete that came before it. The order is deliberate and the rollback is the check.
 *
 * `connect` is injectable for the same reason withTransaction takes it: CI has no
 * Postgres, and the exact statement list is worth pinning.
 */
export async function deleteAccount(userId, id, connect) {
  const { rows: found } = await query(
    'SELECT id, mt5_login, challenge_group_id FROM mt5_accounts WHERE id = $1 AND user_id = $2',
    [id, userId],
  );
  if (!found.length) return false;
  const login = loginNum(found[0].mt5_login);
  const groupId = found[0].challenge_group_id == null ? null : Number(found[0].challenge_group_id);

  try {
    await withTransaction(async (client) => {
      const stmts = cascadeDeleteStatements({ id, login, userId });
      for (const [i, stmt] of stmts.entries()) {
        const res = await client.query(stmt.text, stmt.values);
        // The account row is the LAST statement, and the only one whose row count
        // means anything: it is the one carrying the ownership predicate. Identified
        // by position rather than by matching its text, because a builder that grew
        // another mt5_accounts statement would quietly break a substring check.
        if (i === stmts.length - 1 && res.rows.length === 0) throw new NotOwned();
      }
      // The challenge this account was a phase of may now have no phases left, or
      // only archived ones. Inside the transaction, so a challenge is never briefly
      // left pointing at accounts that are already gone.
      await reconcileGroup(groupId, userId, client);
    }, connect ?? undefined);
  } catch (err) {
    if (err instanceof NotOwned) return false;
    throw err;
  }
  return true;
}

// A private signal, not an error the caller sees: it exists to roll the transaction
// back from inside, which is the only way to abort once statements have run.
class NotOwned extends Error {}

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
//
// AND IT POSTS THE CHALLENGE COST, on the 'bound' branch only (0031). This is the
// one moment an EA account stops being pending, and therefore the first moment its
// cost can be recorded at all: account_fees is keyed by MT5 login, so until this
// UPDATE lands there is no key to file the fee under — and a pending account is
// excluded from every scope anyway (see ownedLogins), so a row keyed to null would
// be invisible as well as unattributable.
//
// FROM THE UPDATE'S OWN RETURNING, not from the `account` argument. Six call sites
// hand this function rows fetched by four different queries (accountByToken selects
// *, ownedAccountById a column list), so reading the cost off the argument would
// post the fee on some ingest paths and silently skip it on others. The statement
// that binds the login is the statement that reports what to charge.
//
// Idempotent by (account_id, ext_ref) — see challengeFeeQuery. A replayed first
// trade takes the 'ok' branch and posts nothing; a genuine double-bind cannot
// charge twice.
export async function bindOrCheckLogin(account, login) {
  if (account.mt5_login != null) {
    return Number(account.mt5_login) === Number(login) ? 'ok' : 'mismatch';
  }
  try {
    const { rows } = await query(
      `UPDATE mt5_accounts SET mt5_login = $2
        WHERE id = $1 AND mt5_login IS NULL
        RETURNING id, mt5_login, user_id, account_type, created_at, challenge_fee;`,
      [account.id, login]
    );
    if (rows.length) {
      /* THE FEE MUST NOT BE ABLE TO FAIL THE INGEST THAT TRIGGERED IT. This runs inside
         the EA's trade-upload path: the trades are what the account exists for, and the
         cost is bookkeeping the trader can still type into Prop OS > Finance by hand.
         Logged rather than swallowed, so a broken post is findable instead of merely
         absent. */
      try {
        await postChallengeFee(rows[0]);
      } catch (err) {
        console.error('[accounts] challenge fee post failed for account %s: %s', account.id, err.message);
      }
      return 'bound';
    }
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

/**
 * Only the accounts Prop OS is about.
 *
 * A live-capital account has no firm rules, no challenge row and no profit
 * target, so counting it in "active accounts", "total funding" or the accounts
 * ring reports a number about money the firm never staked. The prop aggregators
 * (domain/prop/propOverview.js) deliberately know nothing about this distinction —
 * they compute over whatever list they are handed — so the filter lives here and is
 * applied where accounts are fetched.
 *
 * A missing or null capital_kind counts as PROP: that is what every account
 * created before migration 0026 is, and treating it as live would empty a real
 * trader's Prop OS.
 */
export const propAccountsOnly = (accounts) =>
  (Array.isArray(accounts) ? accounts : []).filter((a) => (a?.capital_kind ?? 'prop') === 'prop');
