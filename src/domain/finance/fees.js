import { query } from '../../platform/db.js';

// Fee tracking for prop accounts — money OUT (evaluation / reset / activation
// fees), the mirror of payouts (money in). Keyed by MT5 login (account_id) so it
// lines up with trades/accounts scope. Manual entry only for now.

const num = (v) => (v == null ? null : Number(v));

export const FEE_TYPES = ['evaluation', 'reset', 'activation', 'other'];

// Shape one row for the API (coerce numerics).
function shape(r) {
  return {
    id: Number(r.id),
    account_id: num(r.account_id),
    fee_date: r.fee_date,
    amount: Number(r.amount),
    fee_type: r.fee_type,
    source: r.source,
    note: r.note ?? null,
    created_at: r.created_at,
  };
}

// Fees across a set of MT5 logins (the resolved scope), newest first.
export async function listFees(logins) {
  if (!logins?.length) return [];
  const { rows } = await query(
    `SELECT * FROM account_fees WHERE account_id = ANY($1::bigint[]) ORDER BY fee_date DESC, id DESC`,
    [logins]
  );
  return rows.map(shape);
}

// Record a manual fee.
export async function createFee(userId, { account_id, fee_date, amount, fee_type, note }) {
  const { rows } = await query(
    `INSERT INTO account_fees (account_id, user_id, fee_date, amount, fee_type, source, note)
     VALUES ($1, $2, $3, $4, $5, 'manual', $6)
     RETURNING *;`,
    [account_id, userId, fee_date, amount, fee_type, note || null]
  );
  return shape(rows[0]);
}

/* ── THE CHALLENGE COST, as a fee row (owner spec 2026-09-02) ─────────────────
 *
 * The Add Account wizard asks what the challenge cost on its New-challenge branch,
 * and that amount is spend like any other — so it becomes an ordinary account_fees
 * row rather than a parallel concept. Nothing downstream learns a new word:
 * financeSummary, roiProgression, recentTransactions, businessKpis and the ledger
 * all read this table already, and the trader can see and delete the row in
 * Prop OS > Finance the same as one they typed there.
 *
 * A BUILDER, NOT A QUERY, and it is the only one in this module — because it is the
 * one fee written from inside a TRANSACTION (provisionAccount's, alongside the
 * account it belongs to) as well as from outside it (at EA bind time, when the
 * account finally has a login to key by). A `{ text, values }` pair runs on either,
 * and it is also the only way SQL gets pinned in this repo: there is no test
 * database.
 *
 * `source` IS 'manual'. The trader typed the number; the wizard is not an automatic
 * feed. That matters beyond bookkeeping — financeData.js derives the ledger's
 * Reviewed / Needs-review status from `source` alone, so calling this 'ea' would
 * flag a figure the trader entered by hand as unconfirmed.
 *
 * THE DATE IS THE ACCOUNT'S created_at, not now(). It has to be a value both write
 * sites compute identically, and "when the account was added" is when the trader
 * told us they paid — a bind-time now() would date a challenge bought in March to
 * the day the terminal first reported.
 *
 * ext_ref IS THE IDEMPOTENCY. 0018 put a unique index on (account_id, ext_ref)
 * WHERE ext_ref IS NOT NULL for exactly this — a non-manual source that must not
 * double-post. Keyed by the ACCOUNT's id (not the login) because the login is the
 * thing that may not exist yet, and one account buys one challenge.
 *
 * `ON CONFLICT DO NOTHING` with no conflict target, deliberately: inferring the
 * partial index means restating its predicate, and with no test database the
 * least-clever statement is the right one. The only unique index this INSERT can
 * hit is that one — the primary key is GENERATED ALWAYS AS IDENTITY.
 */
export const CHALLENGE_FEE_NOTE = 'Challenge cost';

/* eval -> 'evaluation', funded -> 'activation'. ONE derivation from ONE column, read
 * off the account row at both call sites, because account_type is itself derived
 * from the phase (patchDraft) — deriving from the phase in one place and the type in
 * the other is how the same purchase comes to be filed under two categories. An
 * Instant-funding account really does pay an activation fee rather than an
 * evaluation one, and FEE_TYPES has had both words since 0018. */
export const challengeFeeType = (accountType) => (accountType === 'funded' ? 'activation' : 'evaluation');

/**
 * The INSERT for one account's challenge cost.
 *
 * @param account the account ROW — needs id, user_id, mt5_login, account_type,
 *                created_at. Read from the row rather than taken as loose
 *                arguments so the two call sites cannot disagree about which
 *                account they are charging.
 * @param amount  the cost, already validated as a non-negative number.
 */
export function challengeFeeQuery(account, amount) {
  return {
    text: `INSERT INTO account_fees
             (account_id, user_id, fee_date, amount, fee_type, source, ext_ref, note)
           VALUES ($1, $2, $3, $4, $5, 'manual', $6, $7)
           ON CONFLICT DO NOTHING
           RETURNING id;`,
    values: [
      account.mt5_login, account.user_id, account.created_at, amount,
      challengeFeeType(account.account_type), `provision:${account.id}`, CHALLENGE_FEE_NOTE,
    ],
  };
}

/* Is there a challenge cost to post for this account, and can it be posted yet?
 *
 * Both halves in one predicate because both write sites ask the same question and a
 * missing half is silent either way: without the amount check a null column posts a
 * NULL-amount fee (the column is NOT NULL, so a 500 at the end of the wizard), and
 * without the login check the row is keyed to `null` and belongs to no account at
 * all — invisible in every scope, and impossible to attribute later.
 *
 * A ZERO cost posts nothing. The trader answered, and the answer was that no money
 * moved; a $0 row on the ledger is noise, and POST /api/fees refuses one too. */
export function hasChallengeFee(account, amount) {
  const n = Number(amount);
  return Number.isFinite(n) && n > 0 && account?.mt5_login != null;
}

/** The deferred half: post the cost of an account that has JUST been given its
 *  login. Called from bindOrCheckLogin, which is the only place a pending account
 *  stops being pending. Idempotent, so a re-bind or a replayed first trade cannot
 *  charge the trader twice. */
export async function postChallengeFee(account) {
  if (!hasChallengeFee(account, account?.challenge_fee)) return false;
  const q = challengeFeeQuery(account, Number(account.challenge_fee));
  const { rows } = await query(q.text, q.values);
  return rows.length > 0;
}

// Delete the user's own fee.
export async function deleteFee(userId, id) {
  const { rows } = await query(
    `DELETE FROM account_fees WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId]
  );
  return rows.length > 0;
}
