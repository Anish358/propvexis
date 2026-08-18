import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

import { repoRoot, eaSourceFile } from '../src/platform/paths.js';

// There are now TWO producers of the ingest contract: the MQL5 EA on a trader's
// PC, and the Python agent on our Windows box. They must send the same field
// names or the same trade looks different depending on where it came from — and
// that difference would surface as subtly wrong analytics, not as an error.
//
// The expected sets below are literals on purpose: deriving them from one source
// and checking the other would pass happily if BOTH drifted the same way.

const ea = readFileSync(eaSourceFile, 'utf8');
const agentFile = (name) => `${repoRoot}/agent/${name}`;
const agent = () => readFileSync(agentFile('history.py'), 'utf8');

const TRADE_FIELDS = [
  'mt5_ticket', 'account_id', 'symbol', 'direction', 'open_time', 'close_time',
  'entry_price', 'sl_price', 'tp_price', 'exit_price', 'volume', 'commission',
  'pnl_money', 'account_balance', 'account_equity', 'account_currency', 'mfe_price',
];

const PAYOUT_FIELDS = ['account_id', 'deal_ticket', 'time', 'amount', 'comment'];

test('the agent exists where the runbook says it does', () => {
  for (const f of ['history.py', 'sync_agent.py', 'mt5_session.py', 'api.py', 'requirements.txt']) {
    assert.ok(existsSync(agentFile(f)), `agent/${f} is missing`);
  }
});

test('the EA and the Python agent send the same trade fields', () => {
  const src = agent();
  const missingFromAgent = TRADE_FIELDS.filter((f) => !src.includes(`'${f}'`));
  const missingFromEa = TRADE_FIELDS.filter((f) => !ea.includes(`\\"${f}\\"`));
  assert.deepEqual(missingFromAgent, [], `agent/history.py omits: ${missingFromAgent}`);
  assert.deepEqual(missingFromEa, [], `the EA omits: ${missingFromEa}`);
});

test('the EA and the Python agent send the same payout fields', () => {
  const src = agent();
  const missingFromAgent = PAYOUT_FIELDS.filter((f) => !src.includes(`'${f}'`));
  assert.deepEqual(missingFromAgent, [], `agent/history.py omits: ${missingFromAgent}`);
  for (const f of PAYOUT_FIELDS) assert.ok(ea.includes(`\\"${f}\\"`), `the EA omits ${f}`);
});

test('the agent reproduces the EA money conventions rather than improving them', () => {
  const src = agent();
  // The EA sends commission+swap as `commission`, and profit+swap+commission as
  // `pnl_money`. Both are load-bearing downstream (fixed_r comes off pnl_money),
  // so a "tidier" split here would silently change every R.
  assert.match(src, /'commission': round\(commission \+ swap, 2\)/);
  assert.match(src, /'pnl_money': round\(profit \+ swap \+ commission, 2\)/);
  // MFE stays a raw price distance; the backend converts it to pips.
  assert.match(src, /best - entry if is_buy else entry - best/);
});

test('a payout is a NEGATIVE balance operation only', () => {
  // A deposit is not a payout. Treating one as a payout would inflate the
  // trader's payout history and their prop-firm ROI.
  assert.match(agent(), /if amount >= 0:\s*\n\s*continue/);
});

test('the agent refuses to invent a timestamp when the server clock is unknown', () => {
  // MT5 reports broker-local time dressed as a Unix timestamp. Guessing the
  // offset would mislabel every trade's session and bucket trades into the wrong
  // day for daily-drawdown maths, with no error anywhere.
  assert.match(agent(), /refusing to guess a timestamp/);
  const session = readFileSync(agentFile('mt5_session.py'), 'utf8');
  assert.match(session, /return cached/);
  const main = readFileSync(agentFile('sync_agent.py'), 'utf8');
  assert.match(main, /if offset is None:[\s\S]{0,300}raise Mt5Error/);
});

test('the investor-only rule is enforced by the agent, not just documented', () => {
  const main = readFileSync(agentFile('sync_agent.py'), 'utf8');
  assert.match(main, /trade_allowed\(\)/);
  assert.match(main, /read_only=False/);
});

test('the agent never logs a job payload', () => {
  // A lease response contains a plaintext investor password; one debug line is
  // all it takes to write it to disk.
  for (const f of ['sync_agent.py', 'api.py', 'mt5_session.py']) {
    const src = readFileSync(agentFile(f), 'utf8');
    assert.ok(!/log\.\w+\([^)]*\bjob\)/.test(src), `${f} logs a whole job`);
    assert.ok(!/log\.\w+\([^)]*password/.test(src), `${f} mentions password in a log call`);
    assert.ok(!/log\.\w+\([^)]*\bbody\b/.test(src), `${f} logs a request body`);
  }
});
