import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { repoRoot } from '../src/platform/paths.js';

const sql = await readFile(path.join(repoRoot, 'db/migrations/0031_ctrader_discovery_marker.sql'), 'utf8');

test('0031 records that a grant has been looked at', () => {
  assert.match(sql, /ALTER TABLE ctrader_identities[\s\S]*discovered_at\s+TIMESTAMPTZ/);
});

test('0031 is nullable with no default, so every existing row reads "never looked"', () => {
  // The backfill is the ABSENCE of one: NULL is exactly the state every row is
  // already in, so the first pass after deploy stamps them and they stop.
  assert.doesNotMatch(sql, /discovered_at[^;]*NOT NULL/i);
  assert.doesNotMatch(sql, /discovered_at[^;]*DEFAULT/i);
});

test('0031 is re-runnable', () => {
  const statements = sql.replace(/--[^\n]*/g, '')
    .split(';').map((x) => x.trim()).filter(Boolean)
    .filter((x) => /^(CREATE|ALTER)/i.test(x));
  assert.ok(statements.length >= 1);
  for (const st of statements) assert.match(st, /IF NOT EXISTS/i, `not re-runnable: ${st.slice(0, 60)}`);
});
