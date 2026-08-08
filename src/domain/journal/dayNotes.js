import { query } from '../../platform/db.js';

// Day notes — one reflection per trading day, per user. The table's own header
// (db/migrations/0022_day_notes.sql) says why the day is the owning unit rather
// than the trade or the account; this module is just the two operations.
//
// The two pure functions are exported for the same reason viewState's sanitizer
// is: they are the whole validation story for this route, and they are testable
// without a database.

// A day key is `YYYY-MM-DD` and must be a REAL date. The client's keys come from
// metrics.dayKey, so anything else is a malformed request rather than a value to
// coerce — `2026-02-31` parses in Postgres' eyes as an error and in JS's as
// March 3rd, and silently writing the note onto the wrong day is worse than a 400.
export function isDayKey(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

// Trim, and treat anything unstringy as empty. A non-string body (object, array,
// number) means "clear the note" rather than persisting junk — the same
// fail-closed posture as sanitizeState, for the same reason: the client hydrates
// straight into a textarea.
export function sanitizeNote(v) {
  return typeof v === 'string' ? v.trim() : '';
}

// `{ '2026-07-24': 'text', … }` — the whole set in one round trip, because the
// journal renders fourteen days at a time and fourteen requests for one text
// field each is the wrong shape. The keys are formatted in SQL rather than from a
// JS Date, so a note never lands on the previous day in a negative-offset zone.
export async function listDayNotes(userId) {
  const { rows } = await query(
    "SELECT to_char(day, 'YYYY-MM-DD') AS day, note FROM day_notes WHERE user_id = $1",
    [userId],
  );
  return Object.fromEntries(rows.map((r) => [r.day, r.note]));
}

// Upsert — except that an EMPTY note DELETES the row instead of storing ''.
// Absence is what "nothing written" means: the journal counts journalled days, and
// a row holding an empty string would make a day the user cleared read as
// reviewed forever.
export async function saveDayNote(userId, day, note) {
  const text = sanitizeNote(note);
  if (!text) {
    await query('DELETE FROM day_notes WHERE user_id = $1 AND day = $2', [userId, day]);
    return '';
  }
  const { rows } = await query(
    `INSERT INTO day_notes (user_id, day, note, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (user_id, day) DO UPDATE SET note = EXCLUDED.note, updated_at = now()
     RETURNING note`,
    [userId, day, text],
  );
  return rows[0].note;
}
