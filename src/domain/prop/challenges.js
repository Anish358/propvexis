import { pool, query } from '../../platform/db.js';

// Data access for the Prop Engine (src/domain/prop/prop.js). Challenges are keyed by the
// mt5_accounts PK; everything the engine consumes (trades / payouts / equity
// snapshots) is keyed by MT5 login (== trades.account_id). These helpers fetch in
// BULK for a set of logins so the god-view portfolio is a few queries, not N.

const num = (v) => (v == null ? null : Number(v));

// Shape a challenge row for the engine + API (coerce pg numerics/strings).
function shapeChallenge(r) {
  return {
    id: Number(r.id),
    mt5_account_id: Number(r.mt5_account_id),
    mt5_login: num(r.mt5_login),
    label: r.label ?? null,
    currency: r.currency ?? null,
    phase: r.phase,
    status: r.status,
    dd_type: r.dd_type,
    start_balance: num(r.start_balance),
    daily_dd_pct: num(r.daily_dd_pct),
    max_dd_pct: num(r.max_dd_pct),
    profit_target_pct: num(r.profit_target_pct),
    min_trading_days: r.min_trading_days ?? 0,
    /* The consistency cap this phase was run under, or null for the accounts that
     * have no such rule (migration 0032). `num` and not `?? 0`, unlike the line
     * above: 0 days is a real rule ("no minimum") while a 0% consistency cap is
     * unsatisfiable by any profitable account, so absence must stay absent. */
    consistency_pct: num(r.consistency_pct),
    min_days_reset_on_payout: r.min_days_reset_on_payout,
    start_date: r.start_date,
    /* Is this the account's FIRST challenge row? The engine needs it to know whether
     * `start_date` is a real phase boundary or just the moment the account was added
     * to PropVexis — see tradingDaysState in prop.js, which under-counted trading
     * days for every account added with history behind it. Absent from a hand-built
     * row (tests, fixtures) reads as undefined, which is neither true nor false, and
     * tradingDaysState only bounds on an explicit `false`. */
    first_on_account: r.first_on_account ?? null,
    passed_at: r.passed_at ?? null,
    breached_at: r.breached_at ?? null,
    breach_reason: r.breach_reason ?? null,
    firm_id: r.firm_id ?? null,
    firm_name: r.firm_name ?? null,
  };
}

/* An account's challenges are ordered by (start_date, id) everywhere in this file, so
 * "first" is the row with nothing before it under that same order. NOT EXISTS rather
 * than a window function because this rides on queries that already filter to a handful
 * of accounts, and it keeps the shape of every one of them unchanged. */
const FIRST_ON_ACCOUNT = `
  NOT EXISTS (
    SELECT 1 FROM challenges c0
     WHERE c0.mt5_account_id = c.mt5_account_id
       AND (c0.start_date, c0.id) < (c.start_date, c.id)
  ) AS first_on_account`;

const CH_SELECT = `
  SELECT c.*, a.mt5_login, a.label, a.currency, a.firm_id, a.firm_name,
         ${FIRST_ON_ACCOUNT}
    FROM challenges c
    JOIN mt5_accounts a ON a.id = c.mt5_account_id`;

// The ACTIVE challenges for a set of logins (one per account, by the partial
// unique index). Returns a Map keyed by mt5_login.
export async function activeChallengesByLogin(logins) {
  if (!logins?.length) return new Map();
  const { rows } = await query(
    `${CH_SELECT} WHERE c.status = 'active' AND a.mt5_login = ANY($1::bigint[])`,
    [logins]
  );
  return new Map(rows.map((r) => [Number(r.mt5_login), shapeChallenge(r)]));
}

/**
 * The challenge each account is standing on: its ACTIVE one, or — when there is none —
 * the last one it had. Returns a Map keyed by mt5_login.
 *
 * WHY A FALLBACK EXISTS AT ALL, and it is not a convenience. Since the status became
 * automatic (challengeStatus.js, 2026-08-27), passing or breaching a phase CLOSES its
 * challenge row, so an account that breached has no active challenge — and every prop
 * read path went through `activeChallengesByLogin`, which meant a breached account
 * produced `{ challenge: null }`, dropped out of `isLive`, and VANISHED from the
 * Portfolio's Breached tab, the Overview's breakdown and its own Details page. The
 * account the trader most needs to look at was the one the app stopped drawing.
 *
 * THE READERS GET THIS; THE ALERT EVALUATOR DOES NOT. evaluateAccountAlerts deliberately
 * keeps `activeChallengesByLogin`: it exists to judge a phase that is still running, and
 * handing it a closed row would have it re-deriving a verdict for a challenge that has
 * already been settled. resolveChallengeOutcome refuses a non-active row anyway, so this
 * is defence in depth rather than the only guard — but the intent belongs in the query
 * each side asks.
 *
 * `status` rides on the shaped row (it always has), so a caller can tell a running phase
 * from a settled one — which is exactly what the buckets now do rather than assuming that
 * "has a challenge" means "is trading it".
 *
 * ORDER BY IS THE WHOLE QUERY: active first (there is at most one, by the partial unique
 * index), then the newest by start date. DISTINCT ON takes the first row per account.
 */
export async function currentChallengesByLogin(logins) {
  if (!logins?.length) return new Map();
  const { rows } = await query(
    `SELECT DISTINCT ON (a.mt5_login) c.*, a.mt5_login, a.label, a.currency, a.firm_id, a.firm_name,
            ${FIRST_ON_ACCOUNT}
       FROM challenges c
       JOIN mt5_accounts a ON a.id = c.mt5_account_id
      WHERE a.mt5_login = ANY($1::bigint[])
      ORDER BY a.mt5_login, (c.status = 'active') DESC, c.start_date DESC, c.id DESC`,
    [logins],
  );
  return new Map(rows.map((r) => [Number(r.mt5_login), shapeChallenge(r)]));
}

// ALL challenges (every status: active/passed/breached) across a set of logins,
// for scope-wide aggregation (pass/breach insights). Closed rows are retained as
// history, so this is the full per-phase-attempt record. Newest first.
export async function challengesForScope(logins) {
  if (!logins?.length) return [];
  const { rows } = await query(
    `${CH_SELECT} WHERE a.mt5_login = ANY($1::bigint[]) ORDER BY c.start_date DESC, c.id DESC`,
    [logins]
  );
  return rows.map(shapeChallenge);
}

// Full challenge history for one owned account (newest first) — for the phase
// timeline in the UI. Ownership enforced via user_id.
export async function challengeHistory(userId, login) {
  const { rows } = await query(
    `${CH_SELECT} WHERE a.user_id = $1 AND a.mt5_login = $2 ORDER BY c.start_date DESC, c.id DESC`,
    [userId, login]
  );
  return rows.map(shapeChallenge);
}

// Minimal trade columns the engine needs, for a set of logins. Grouped by caller.
export async function tradesForEngine(logins) {
  if (!logins?.length) return [];
  const { rows } = await query(
    `SELECT account_id, open_time, close_time, pnl_money
       FROM trades
      WHERE account_id = ANY($1::bigint[]) AND pnl_money IS NOT NULL
      ORDER BY close_time ASC, id ASC`,
    [logins]
  );
  return rows.map((r) => ({ ...r, account_id: Number(r.account_id) }));
}

// Most recent close per login — one row per account, for the Overview Brief's
// "inactive accounts" check. A GROUP BY rather than reusing tradesForEngine's
// full history: the Brief needs one timestamp per account, and pulling every
// trade to take a max would scale with trade count instead of account count.
// Returns a Map(login -> ISO timestamp); accounts with no trades are absent.
export async function lastTradeByLogin(logins) {
  if (!logins?.length) return new Map();
  const { rows } = await query(
    `SELECT account_id, MAX(close_time) AS last_close
       FROM trades
      WHERE account_id = ANY($1::bigint[]) AND close_time IS NOT NULL
      GROUP BY account_id`,
    [logins]
  );
  return new Map(rows.map((r) => [Number(r.account_id), r.last_close]));
}

// Per-day trading totals across a set of logins — the Overview calendar's
// trading / profit / loss days. Aggregated in SQL rather than by shipping every
// trade to the client: the calendar needs one row per DAY, and the Overview is
// portfolio-wide, so the trade-level payload would grow without bound.
//
// Keyed by account_id (not user_id) like every other figure on that page, so
// account-less imported/manual trades are excluded — they aren't part of any
// prop account's business.
export async function dailyTotalsForLogins(logins) {
  if (!logins?.length) return [];
  const { rows } = await query(
    `SELECT to_char(close_time AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
            SUM(pnl_money)                             AS pnl,
            COUNT(*)                                   AS trades,
            COUNT(*) FILTER (WHERE pnl_money > 0)      AS wins,
            COUNT(*) FILTER (WHERE pnl_money < 0)      AS losses
       FROM trades
      WHERE account_id = ANY($1::bigint[])
        AND close_time IS NOT NULL AND pnl_money IS NOT NULL
      GROUP BY 1
      ORDER BY 1`,
    [logins]
  );
  return rows.map((r) => ({
    day: r.day,
    pnl: Math.round(Number(r.pnl) * 100) / 100,
    trades: Number(r.trades),
    wins: Number(r.wins),
    losses: Number(r.losses),
  }));
}

// EA-fed floating equity samples for a set of logins.
export async function equitySnapshotsForEngine(logins) {
  if (!logins?.length) return [];
  const { rows } = await query(
    `SELECT account_id, ts, balance, equity
       FROM equity_snapshots
      WHERE account_id = ANY($1::bigint[])
      ORDER BY ts ASC, id ASC`,
    [logins]
  );
  return rows.map((r) => ({ ...r, account_id: Number(r.account_id) }));
}

// Create the initial ACTIVE challenge for a freshly-created account, seeded from
// its rule template (phase from account_type; funded carries no profit target).
// No-op if the account already has an active challenge. Returns the row or null.
export async function createChallengeForAccount(accountId) {
  const { rows: a } = await query(
    `SELECT id, account_type, dd_type, start_balance, daily_dd_pct, max_dd_pct,
            profit_target_pct, min_trading_days, consistency_pct
       FROM mt5_accounts WHERE id = $1`,
    [accountId]
  );
  if (!a.length) return null;
  const t = a[0];
  const funded = t.account_type === 'funded';
  const { rows } = await query(
    `INSERT INTO challenges (mt5_account_id, phase, status, dd_type, start_balance,
                             daily_dd_pct, max_dd_pct, profit_target_pct, min_trading_days,
                             consistency_pct)
     VALUES ($1, $2, 'active', $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (mt5_account_id) WHERE status = 'active' DO NOTHING
     RETURNING *`,
    // The consistency cap copies across on EVERY phase, funded included — unlike the
    // profit target, which a funded account cannot have. Firms apply this rule on
    // either side and often on both (Apex funded only, Take Profit Trader evaluation
    // only, Alpha Futures both at different caps), so there is no phase this engine
    // may decide the rule does not exist on. The trader corrects the number if the
    // firm's differs for the phase they just reached.
    [t.id, funded ? 'funded' : 'p1', t.dd_type, t.start_balance, t.daily_dd_pct,
     t.max_dd_pct, funded ? null : t.profit_target_pct, t.min_trading_days,
     t.consistency_pct]
  );
  return rows.length ? shapeChallenge({ ...rows[0], mt5_login: null }) : null;
}

// Sync editable rule fields onto the account's ACTIVE challenge, so correcting an
// account's rules takes effect on the live challenge immediately (past phases keep
// their own snapshots). Only the rule columns that exist on both are mirrored.
export async function syncActiveChallengeRules(accountId, fields) {
  const map = {
    start_balance: 'start_balance',
    daily_dd_pct: 'daily_dd_pct',
    max_dd_pct: 'max_dd_pct',
    profit_target_pct: 'profit_target_pct',
    dd_type: 'dd_type',
    min_trading_days: 'min_trading_days',
    // Editing the cap in Settings must reach the LIVE challenge, or the engine keeps
    // judging the old number while the form shows the new one — the drift this whole
    // mirror exists to prevent. Nullable on both sides, so switching the rule off
    // propagates as a null rather than being dropped.
    consistency_pct: 'consistency_pct',
  };
  const sets = [];
  const params = [];
  for (const [key, col] of Object.entries(map)) {
    if (key in fields) { params.push(fields[key]); sets.push(`${col} = $${params.length}`); }
  }
  if (!sets.length) return;
  params.push(accountId);
  await query(
    `UPDATE challenges SET ${sets.join(', ')}
      WHERE mt5_account_id = $${params.length} AND status = 'active'`,
    params
  );
}

// Advance an account's challenge: close the current ACTIVE one (passed|breached)
// and open a fresh ACTIVE challenge for `toPhase`, seeded from the account's rule
// template. Done in a transaction so the one-active-per-account invariant holds.
// Returns the new challenge, or null if the account isn't owned.
export async function advanceChallenge(userId, login, { toPhase, mark = 'passed', breachReason = null }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Ownership + template in one lock.
    const { rows: acctRows } = await client.query(
      `SELECT id, start_balance, account_type, dd_type, daily_dd_pct, max_dd_pct,
              profit_target_pct, min_trading_days, consistency_pct
         FROM mt5_accounts WHERE user_id = $1 AND mt5_login = $2 FOR UPDATE`,
      [userId, login]
    );
    if (!acctRows.length) { await client.query('ROLLBACK'); return null; }
    const a = acctRows[0];

    const stamp = mark === 'breached' ? 'breached_at' : 'passed_at';
    const { rows: closed } = await client.query(
      `UPDATE challenges SET status = $1, ${stamp} = now(), breach_reason = $2
        WHERE mt5_account_id = $3 AND status = 'active'
        RETURNING phase`,
      [mark, breachReason, a.id]
    );
    const previousPhase = closed[0]?.phase ?? null;

    const funded = toPhase === 'funded';
    const { rows } = await client.query(
      `INSERT INTO challenges (mt5_account_id, phase, status, dd_type, start_balance,
                               daily_dd_pct, max_dd_pct, profit_target_pct, min_trading_days,
                               consistency_pct)
       VALUES ($1, $2, 'active', $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [a.id, toPhase, a.dd_type, a.start_balance, a.daily_dd_pct, a.max_dd_pct,
       funded ? null : a.profit_target_pct, a.min_trading_days, a.consistency_pct]
    );
    await client.query('COMMIT');
    // Re-shape with the account's login for a consistent return shape; carry the
    // closed phase so the caller can tell a pass from a reset.
    return { ...shapeChallenge({ ...rows[0], mt5_login: login }), previousPhase };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Idempotent bulk insert of EA-fed equity snapshots (used by the ingest route in
// a later PR). Deduped by the (account_id, ts) unique index.
export async function insertEquitySnapshots(login, samples) {
  let inserted = 0;
  for (const s of samples) {
    const { rowCount } = await query(
      `INSERT INTO equity_snapshots (account_id, ts, balance, equity, source)
       VALUES ($1, $2, $3, $4, 'ea')
       ON CONFLICT (account_id, ts) DO NOTHING`,
      [login, new Date(s.ts).toISOString(), s.balance ?? null, s.equity ?? null]
    );
    inserted += rowCount;
  }
  return inserted;
}
