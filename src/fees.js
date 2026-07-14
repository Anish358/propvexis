import { query } from './db.js';

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

// Delete the user's own fee.
export async function deleteFee(userId, id) {
  const { rows } = await query(
    `DELETE FROM account_fees WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId]
  );
  return rows.length > 0;
}
