import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isDayKey, sanitizeNote } from '../src/dayNotes.js';

// Day notes — one reflection per trading day, per user. The route's whole
// validation story is these two pure functions plus the delete-on-empty rule, so
// that is what this pins.
const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const mod = read('../src/dayNotes.js');
const app = read('../src/app.js');
const migration = read('../db/migrations/0022_day_notes.sql');

test('isDayKey accepts the keys the client actually sends', () => {
  // metrics.dayKey produces exactly this shape.
  for (const ok of ['2026-07-24', '2026-01-01', '2024-02-29', '1999-12-31']) {
    assert.equal(isDayKey(ok), true, `${ok} should be a valid day key`);
  }
});

test('isDayKey rejects malformed keys AND dates that do not exist', () => {
  // The second half is the one that matters: `2026-02-31` matches the pattern and
  // JS rolls it forward to March 3rd, so a pattern-only check would write the note
  // onto a day the user never traded.
  for (const bad of ['2026-02-31', '2025-02-29', '2026-13-01', '2026-00-10', '2026-07-32']) {
    assert.equal(isDayKey(bad), false, `${bad} is not a real date`);
  }
  for (const bad of ['2026-7-24', '24-07-2026', '2026/07/24', '2026-07-24T00:00:00Z', '', 'today']) {
    assert.equal(isDayKey(bad), false, `${bad} is not the expected shape`);
  }
  for (const bad of [null, undefined, 20260724, {}, ['2026-07-24']]) {
    assert.equal(isDayKey(bad), false, `${JSON.stringify(bad)} is not a string`);
  }
});

test('sanitizeNote trims, and fails closed on anything unstringy', () => {
  assert.equal(sanitizeNote('  overtraded after the first loss  '), 'overtraded after the first loss');
  assert.equal(sanitizeNote('two\nlines'), 'two\nlines', 'newlines inside a note are content');
  // Whitespace-only is nothing written, not a note made of spaces.
  assert.equal(sanitizeNote('   \n\t '), '');
  for (const junk of [null, undefined, 42, true, {}, ['a']]) {
    assert.equal(sanitizeNote(junk), '', `${JSON.stringify(junk)} should coerce to ''`);
  }
});

test('an emptied note deletes the row rather than storing an empty string', () => {
  // The journal counts journalled days. A row holding '' would make a day the user
  // cleared read as reviewed forever, so absence is the representation.
  const fn = mod.slice(mod.indexOf('export async function saveDayNote'));
  assert.match(fn, /if \(!text\) \{\s*\n\s*await query\('DELETE FROM day_notes/);
  assert.match(fn, /ON CONFLICT \(user_id, day\) DO UPDATE SET note = EXCLUDED\.note/);
});

test('the day key comes back formatted in SQL, not from a JS Date', () => {
  // A DATE round-tripped through a JS Date lands on the previous day in any
  // negative-offset zone, which would silently misfile every note for US users.
  assert.match(mod, /to_char\(day, 'YYYY-MM-DD'\) AS day/);
});

test('the routes are authenticated, user-scoped, and 400 on a bad day', () => {
  const get = app.slice(app.indexOf("app.get('/api/day-notes'"));
  assert.match(get.slice(0, 200), /preHandler: app\.requireAuth/);
  assert.match(get.slice(0, 200), /listDayNotes\(req\.user\.uid\)/);

  const put = app.slice(app.indexOf("app.put('/api/day-notes/:day'"), app.indexOf("app.put('/api/day-notes/:day'") + 700);
  assert.match(put, /preHandler: app\.requireAuth/);
  assert.match(put, /if \(!isDayKey\(day\)\) return reply\.code\(400\)/);
  // The user id comes from the session, never from the request body — a note is not
  // addressable across users.
  assert.match(put, /saveDayNote\(req\.user\.uid, day, req\.body\?\.note\)/);
});

test('the table is keyed on (user, day) and cascades with the user', () => {
  assert.match(migration, /PRIMARY KEY \(user_id, day\)/);
  assert.match(migration, /REFERENCES users\(id\) ON DELETE CASCADE/);
  // Per user, not per account: a trader has one trading day even across three
  // logins. Recorded in the migration so the choice survives the next reader.
  assert.match(migration, /SCOPED TO THE USER, NOT TO AN ACCOUNT/);
});
