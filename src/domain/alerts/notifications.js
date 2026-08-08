import { query } from '../../platform/db.js';
import { activeChallengesByLogin, tradesForEngine, equitySnapshotsForEngine } from '../prop/challenges.js';
import { listPayouts } from '../finance/payouts.js';
import { challengeState } from '../prop/prop.js';
import { deriveAlerts } from './alerts.js';

// Notifications data layer + the alert evaluator. The evaluator recomputes ONE
// account's engine state on a live ingest, derives crossed-threshold alerts
// (src/domain/alerts/alerts.js), and inserts them deduped — so the same alert can't re-fire on
// every tick. Server ingest paths call evaluateAccountAlerts and emit the newly-
// created rows over the user's socket room.

const num = (v) => (v == null ? null : Number(v));

function shape(r) {
  return {
    id: Number(r.id),
    account_id: num(r.account_id),
    type: r.type,
    severity: r.severity,
    title: r.title,
    body: r.body ?? null,
    data: r.data ?? null,
    read_at: r.read_at ?? null,
    created_at: r.created_at,
  };
}

// Insert a batch of derived alerts, deduped by (user_id, dedup_key). Returns only
// the rows that were genuinely new (so callers emit exactly those).
export async function insertNotifications(userId, alerts) {
  const created = [];
  for (const a of alerts) {
    const { rows } = await query(
      `INSERT INTO notifications (user_id, account_id, type, severity, title, body, data, dedup_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, dedup_key) DO NOTHING
       RETURNING *`,
      [userId, a.data?.account_id ?? null, a.type, a.severity, a.title, a.body ?? null,
       a.data ? JSON.stringify(a.data) : null, a.dedupKey]
    );
    if (rows.length) created.push(shape(rows[0]));
  }
  return created;
}

// The panel feed (newest first) + the unread badge count, in one call.
export async function listNotifications(userId, limit = 50) {
  const { rows } = await query(
    `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
    [userId, limit]
  );
  const { rows: u } = await query(
    `SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
    [userId]
  );
  return { notifications: rows.map(shape), unread: u[0].n };
}

// Mark specific ids (or all) read for this user. Returns the new unread count.
export async function markRead(userId, { ids, all } = {}) {
  if (all) {
    await query(`UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`, [userId]);
  } else if (Array.isArray(ids) && ids.length) {
    await query(
      `UPDATE notifications SET read_at = now() WHERE user_id = $1 AND id = ANY($2::bigint[]) AND read_at IS NULL`,
      [userId, ids]
    );
  }
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
    [userId]
  );
  return rows[0].n;
}

// Recompute one account's state and persist any newly-crossed alerts. Returns the
// created rows (empty when nothing new / no active challenge / no drawdown rules).
export async function evaluateAccountAlerts(userId, login) {
  const challenge = (await activeChallengesByLogin([login])).get(Number(login));
  if (!challenge) return [];
  const [trades, snaps, payouts, acct] = await Promise.all([
    tradesForEngine([login]),
    equitySnapshotsForEngine([login]),
    listPayouts([login]),
    query('SELECT balance, equity FROM accounts WHERE account_id = $1', [login]),
  ]);
  const live = acct.rows[0]?.equity ?? acct.rows[0]?.balance ?? null;
  const state = challengeState({ challenge, trades, payouts, snapshots: snaps, live, asOf: new Date() });
  const alerts = deriveAlerts({
    accountId: Number(login),
    challengeId: challenge.id,
    label: challenge.label,
    state,
  });
  return insertNotifications(userId, alerts);
}
