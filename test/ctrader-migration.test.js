import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../src/platform/paths.js';

const sql = await readFile(path.join(repoRoot, 'db/migrations/0029_ctrader.sql'), 'utf8');

test('0029 creates the identity and discovery tables', () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS ctrader_identities/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS ctrader_discovered_accounts/);
});

test('0029 stores tokens as ciphertext columns, never plaintext', () => {
  assert.match(sql, /access_token_ct\s+TEXT NOT NULL/);
  assert.match(sql, /refresh_token_ct\s+TEXT NOT NULL/);
  assert.doesNotMatch(sql, /\baccess_token\s+TEXT/);
  assert.doesNotMatch(sql, /\brefresh_token\s+TEXT/);
});

test('0029 lets a user re-authorize a cTID whose identity was revoked', () => {
  // Without the predicate a revoked row blocks the unique index forever, and
  // reconnecting after a lost refresh-token rotation is impossible.
  assert.match(sql, /uq_ctrader_identities_live[\s\S]{0,200}WHERE revoked_at IS NULL/);
});

test('0029 gives sync_jobs a resumable backfill cursor', () => {
  assert.match(sql, /ALTER TABLE sync_jobs ADD COLUMN IF NOT EXISTS cursor_at\s+TIMESTAMPTZ/);
});

test('0029 keeps the real login beside the banded one', () => {
  // mt5_login carries the banded value; a trader must still see their own number.
  assert.match(sql, /platform_login\s+BIGINT/);
  assert.match(sql, /is_live_env\s+BOOLEAN/);
});

test('0029 is re-runnable — every statement guards itself', () => {
  // The deploy runs migrations on every push; a statement without a guard turns
  // a redeploy into a failed deploy.
  const statements = sql.split(';').map((x) => x.trim()).filter(Boolean)
    .filter((x) => /^(CREATE|ALTER)/i.test(x));
  for (const st of statements) {
    assert.match(st, /IF NOT EXISTS/i, `not re-runnable: ${st.slice(0, 60)}`);
  }
});

test('NO migration names a column after a PostgreSQL system column', () => {
  /* THE BUG THIS CATCHES SHIPPED, and it reached the dev box rather than a laptop.
   * 0029 declared `ctid BIGINT` -- the natural name for a cTrader ID -- and every
   * PostgreSQL table already has a system column called ctid (the physical row
   * tuple identifier). The CREATE is rejected outright:
   *
   *     column name "ctid" conflicts with a system column name
   *
   * A migration's SQL is never executed by node:test, so nothing here could have
   * caught it by running it. This is a text check for exactly that reason, and it
   * covers EVERY migration rather than only the one that was wrong -- the next
   * person to reach for `oid` or `xmin` is making the same mistake, not a new one. */
  const reserved = ['tableoid', 'xmin', 'cmin', 'xmax', 'cmax', 'ctid', 'oid'];
  const dir = path.join(repoRoot, 'db/migrations');
  const offences = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
    const text = readFileSync(path.join(dir, file), 'utf8')
      .replace(/--[^\n]*/g, '')          // strip comments; this file names ctid in prose
      .replace(/\/\*[\s\S]*?\*\//g, '');
    for (const word of reserved) {
      // A column DECLARATION: the name at the start of a line, followed by a type.
      const decl = new RegExp(`^\\s*${word}\\s+(BIGINT|INTEGER|INT|TEXT|BOOLEAN|TIMESTAMPTZ|NUMERIC|JSONB|UUID)\\b`, 'im');
      if (decl.test(text)) offences.push(`${file}: ${word}`);
    }
  }
  assert.deepEqual(offences, [],
    `these declare a column named after a PostgreSQL system column: ${offences.join(', ')}`);
});
