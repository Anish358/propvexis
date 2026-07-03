// DB-aware layer over the pure entitlements in plans.js. Keeps the plan lookup
// (a users.plan read) out of plans.js so that stays unit-testable, and gives the
// route handlers a single place to resolve "what may this user do".
import { query } from './db.js';
import { DEFAULT_PLAN } from './plans.js';

// The plan slug for a user id. Fail-closed to DEFAULT_PLAN (free) when the user
// is missing or unknown — a lookup miss must never grant a paid capability.
export async function planForUser(userId) {
  if (userId == null) return DEFAULT_PLAN;
  const { rows } = await query('SELECT plan FROM users WHERE id = $1', [userId]);
  return rows.length ? rows[0].plan : DEFAULT_PLAN;
}

// Count a user's active (non-archived) sync-linked MT5 accounts, for the
// per-plan account cap enforced on account creation.
export async function syncedAccountCount(userId) {
  const { rows } = await query(
    'SELECT COUNT(*)::int AS n FROM mt5_accounts WHERE user_id = $1 AND is_active = TRUE',
    [userId]
  );
  return rows[0].n;
}
