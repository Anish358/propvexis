import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { repoRoot } from '../src/platform/paths.js';

const sql = await readFile(path.join(repoRoot, 'db/migrations/0030_tradelocker.sql'), 'utf8');

test('0030 adds the login email and the two TradeLocker account identifiers', () => {
  assert.match(sql, /ALTER TABLE mt5_credentials[\s\S]*login_email\s+TEXT/);
  assert.match(sql, /tl_account_id\s+BIGINT/);
  assert.match(sql, /tl_acc_num\s+INTEGER/);
});

test('0030 stores accNum rather than leaving it to be recomputed', () => {
  // accNum is NOT accountId: a small ordinal sent as a HEADER saying which of the
  // login's accounts is meant. Send the wrong one and TradeLocker returns ANOTHER
  // OF THE SAME TRADER'S ACCOUNTS with a 200 — the trades land, in the wrong
  // journal, with nothing anywhere reading as an error.
  assert.match(sql, /tl_acc_num/);
  assert.match(sql, /accNum/i, 'the column needs the comment that says what it is not');
});

test('0030 is re-runnable — every statement guards itself', () => {
  // The deploy runs migrations on every push; a statement without a guard turns
  // a redeploy into a failed deploy.
  // Comments are stripped FIRST. 0029's version of this test split the raw text,
  // so every statement preceded by a comment block began with `--` and was
  // filtered out of its own check — it asserted re-runnability on a subset and
  // said nothing about the rest.
  const statements = sql.replace(/--[^\n]*/g, '')
    .split(';').map((x) => x.trim()).filter(Boolean)
    .filter((x) => /^(CREATE|ALTER)/i.test(x));
  assert.ok(statements.length >= 2, 'the migration must actually contain statements');
  for (const st of statements) {
    assert.match(st, /IF NOT EXISTS/i, `not re-runnable: ${st.slice(0, 60)}`);
  }
});
