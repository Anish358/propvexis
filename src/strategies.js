import { pool, query } from './db.js';

// User-owned strategy catalog. A trade is linked to its strategy by NAME
// (trades.setup == strategies.name); the name is the natural key, unique per
// user. Renames cascade to trades.setup so the string-keyed analytics/filter
// pipeline stays consistent. Everything here is scoped by user_id — a user can
// only ever see or mutate their own strategies (same isolation as accounts.js).

const MAX_NAME = 60;

// Pure: trim + collapse whitespace, enforce a length cap. Returns the cleaned
// name, or null when empty. Exported for unit testing (no DB).
export function normalizeStrategyName(raw) {
  if (raw == null) return null;
  const clean = String(raw).replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  return clean.slice(0, MAX_NAME);
}

const COLS = 'id, name, color, description, sort_order, is_active, created_at, updated_at';

// All of a user's strategies: active first, then by their chosen order, then name.
export async function listStrategies(userId) {
  const { rows } = await query(
    `SELECT ${COLS} FROM strategies WHERE user_id = $1
      ORDER BY is_active DESC, sort_order ASC, lower(name) ASC`,
    [userId]
  );
  return rows;
}

// Create a strategy. Throws { code: 'DUP' } if the user already has one by that
// name, or { code: 'INVALID' } if the name is empty.
export async function createStrategy(userId, { name, color, description } = {}) {
  const clean = normalizeStrategyName(name);
  if (!clean) throw Object.assign(new Error('name is required'), { code: 'INVALID' });
  // New strategies sort after existing ones by default.
  try {
    const { rows } = await query(
      `INSERT INTO strategies (user_id, name, color, description, sort_order)
       VALUES ($1, $2, $3, $4,
               COALESCE((SELECT max(sort_order) + 1 FROM strategies WHERE user_id = $1), 0))
       RETURNING ${COLS};`,
      [userId, clean, color || null, description || null]
    );
    return rows[0];
  } catch (err) {
    if (err.code === '23505') throw Object.assign(new Error('strategy name already exists'), { code: 'DUP' });
    throw err;
  }
}

// Update editable fields on the user's own strategy. Renaming cascades to
// trades.setup (in a transaction) so grouped analytics/filters stay consistent.
// Returns the updated row, or null if not found / not owned. Throws { code:'DUP' }
// on a name collision, { code:'INVALID' } on an empty name.
export async function updateStrategy(userId, id, fields = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: cur } = await client.query(
      'SELECT name FROM strategies WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [id, userId]
    );
    if (!cur.length) { await client.query('ROLLBACK'); return null; }
    const oldName = cur[0].name;

    const sets = [];
    const params = [];
    const add = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };

    let newName = null;
    if ('name' in fields) {
      newName = normalizeStrategyName(fields.name);
      if (!newName) { await client.query('ROLLBACK'); throw Object.assign(new Error('name cannot be empty'), { code: 'INVALID' }); }
      add('name', newName);
    }
    if ('color' in fields) add('color', fields.color || null);
    if ('description' in fields) add('description', fields.description || null);
    if ('sort_order' in fields && fields.sort_order != null) add('sort_order', Number(fields.sort_order));
    if ('is_active' in fields) add('is_active', !!fields.is_active);

    if (!sets.length) { await client.query('ROLLBACK'); return null; }

    params.push(id, userId);
    let updated;
    try {
      const { rows } = await client.query(
        `UPDATE strategies SET ${sets.join(', ')}
          WHERE id = $${params.length - 1} AND user_id = $${params.length}
          RETURNING ${COLS};`,
        params
      );
      updated = rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') throw Object.assign(new Error('strategy name already exists'), { code: 'DUP' });
      throw err;
    }

    // Cascade a rename onto the user's trades so grouped stats keep matching.
    if (newName && newName !== oldName) {
      await client.query(
        'UPDATE trades SET setup = $1 WHERE setup = $2 AND user_id = $3',
        [newName, oldName, userId]
      );
    }

    await client.query('COMMIT');
    return updated;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* already rolled back */ }
    throw err;
  } finally {
    client.release();
  }
}

// Delete a strategy from the catalog. Trades keep their `setup` text (they just
// become unmanaged) — history is never destroyed. Prefer archiving (is_active)
// for a strategy that has been traded. Returns true if a row was deleted.
export async function deleteStrategy(userId, id) {
  const { rows } = await query(
    'DELETE FROM strategies WHERE id = $1 AND user_id = $2 RETURNING id',
    [id, userId]
  );
  return rows.length > 0;
}
