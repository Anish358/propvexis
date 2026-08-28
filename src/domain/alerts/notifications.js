import { query } from '../../platform/db.js';
import { activeChallengesByLogin, tradesForEngine, equitySnapshotsForEngine } from '../prop/challenges.js';
import { listPayouts } from '../finance/payouts.js';
import { challengeState } from '../prop/prop.js';
import { applyChallengeOutcome } from '../prop/challengeGroups.js';
import { resolveChallengeOutcome } from '../prop/challengeStatus.js';
import { deriveAlerts, phaseOutcomeAlert } from './alerts.js';

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

/**
 * Recompute one account's state, persist any newly-crossed alerts, AND settle the
 * phase's status. Returns the created notification rows (empty when nothing new / no
 * active challenge / no drawdown rules).
 *
 * THE STATUS TRANSITION LIVES HERE because this is the one place in the app that
 * already computes a single account's engine state on every ingest — and the owner's
 * spec (2026-08-27) is that Evaluation → Passed and Evaluation → Breached happen by
 * themselves, off the trading, with nobody pressing anything. Adding a second
 * evaluator for it would be a second reading of the same numbers, which is how the
 * badge on a card and the row in the table come to disagree.
 *
 * IT IS NOT DONE ON A READ. Writing status from GET /api/prop/portfolio was the other
 * candidate and is worse in a way that matters at our scale bar: the portfolio route
 * is polled by every open tab, so the write would run on page loads rather than on
 * events, and a read handler that mutates cannot be cached. Ingest is where the facts
 * change — EA trades, manual trades, CSV imports and the candles route all funnel
 * through runAlerts (src/app.js), so every path that can move an account past its
 * target or through its floor arrives here.
 *
 * ORDER MATTERS: the alerts are derived from the state BEFORE the row is closed. They
 * describe what the engine just saw (breach, target reached, days met), and
 * deriveAlerts needs the challenge to still be the active one it was computed against.
 * The outcome write follows, and adds its own one-line milestone.
 */
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

  // The verdict is a pure function of the state (challengeStatus.js); the write is
  // idempotent by its own `status = 'active'` guard, so this runs on every ingest and
  // does something exactly once. A null return means nothing changed — the ordinary
  // case, and the reason no notification is appended for it.
  const outcome = resolveChallengeOutcome({ challenge, state });
  if (outcome.status !== 'active') {
    const settled = await applyChallengeOutcome(challenge.mt5_account_id, outcome);
    if (settled) {
      alerts.push(phaseOutcomeAlert({
        accountId: Number(login),
        label: challenge.label,
        phase: settled.phase,
        status: settled.status,
        reason: outcome.reason,
        challengeId: settled.challengeId,
      }));
    }
  }

  return insertNotifications(userId, alerts);
}
