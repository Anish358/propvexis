import { query } from '../../platform/db.js';

// Payout tracking for funded prop accounts. A payout is a withdrawal of profit
// from the trading account; the trader receives `gross_amount * split_pct/100`
// (the rest is the firm's cut). Payouts are keyed by MT5 login (account_id) so
// they align with trades/accounts scope and the equity curve.

const num = (v) => (v == null ? null : Number(v));

// Shape one row for the API: coerce numerics and derive the trader's net take.
function shape(r) {
  const gross = Number(r.gross_amount);
  const split = Number(r.split_pct);
  return {
    id: Number(r.id),
    account_id: num(r.account_id),
    payout_date: r.payout_date,
    gross_amount: gross,
    split_pct: split,
    trader_amount: Math.round(gross * (split / 100) * 100) / 100, // trader's net
    source: r.source,
    note: r.note ?? null,
    created_at: r.created_at,
  };
}

// Payouts across a set of MT5 logins (the resolved scope), newest first.
export async function listPayouts(logins) {
  if (!logins?.length) return [];
  const { rows } = await query(
    `SELECT * FROM payouts WHERE account_id = ANY($1::bigint[]) ORDER BY payout_date DESC, id DESC`,
    [logins]
  );
  return rows.map(shape);
}

// Record a manual payout. `split_pct` defaults to the account's configured split.
export async function createPayout(userId, { account_id, payout_date, gross_amount, split_pct, note }) {
  const { rows } = await query(
    `INSERT INTO payouts (account_id, user_id, payout_date, gross_amount, split_pct, source, note)
     VALUES ($1, $2, $3, $4, $5, 'manual', $6)
     RETURNING *;`,
    [account_id, userId, payout_date, gross_amount, split_pct, note || null]
  );
  return shape(rows[0]);
}

// Delete the user's own payout.
export async function deletePayout(userId, id) {
  const { rows } = await query(
    `DELETE FROM payouts WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId]
  );
  return rows.length > 0;
}

// EA ingest path: idempotently record a payout detected from an MT5 balance
// operation. Deduped by (account_id, ext_ref=deal ticket) so re-sends are no-ops.
// Returns the shaped row, or null if it already existed (conflict).
export async function recordEaPayout({ account_id, user_id, payout_date, gross_amount, split_pct, ext_ref, note }) {
  const { rows } = await query(
    `INSERT INTO payouts (account_id, user_id, payout_date, gross_amount, split_pct, source, ext_ref, note)
     VALUES ($1, $2, $3, $4, $5, 'ea', $6, $7)
     ON CONFLICT (account_id, ext_ref) WHERE ext_ref IS NOT NULL DO NOTHING
     RETURNING *;`,
    [account_id, user_id, payout_date, gross_amount, split_pct, String(ext_ref), note || null]
  );
  return rows.length ? shape(rows[0]) : null;
}
