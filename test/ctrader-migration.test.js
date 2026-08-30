import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
