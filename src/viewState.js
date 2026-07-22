import { query } from './db.js';

// Per-user view state (display unit + data filters + widget overrides + trade
// settings), moved off the browser's localStorage so it follows the USER across
// browsers/devices instead of sticking to one machine. The blob shape is owned
// by the client (frontend/src/App.jsx); the server stores it opaquely.

// Coerce arbitrary input to a plain JSON object. A non-object (null, array,
// string, number) becomes {} — fail-safe so we never persist junk that would
// break the client's merge-over-defaults on next load. Pure + exported for tests.
export function sanitizeState(state) {
  return state && typeof state === 'object' && !Array.isArray(state) ? state : {};
}

// The user's saved view state, or {} when they've never saved any.
export async function getViewState(userId) {
  const { rows } = await query('SELECT state FROM user_view_state WHERE user_id = $1', [userId]);
  return rows.length ? rows[0].state : {};
}

// Replace the user's view state with `state` (a plain JSON object). Upsert so the
// first save creates the row.
export async function saveViewState(userId, state) {
  const doc = sanitizeState(state);
  const { rows } = await query(
    `INSERT INTO user_view_state (user_id, state, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (user_id) DO UPDATE SET state = EXCLUDED.state, updated_at = now()
     RETURNING state`,
    [userId, JSON.stringify(doc)]
  );
  return rows[0].state;
}
