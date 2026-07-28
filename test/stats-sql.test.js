import { test } from 'node:test';
import assert from 'node:assert/strict';
import { perf, shapePerf, groupPerf, streaks, snapBeRounding } from '../src/aggregations.js';
import { buildTradeWhere, outcomeSql, valueSql, statsQuery, yearlyQuery, adherenceQuery, BE_THRESHOLD } from '../src/statsSql.js';

// The SQL aggregation path replaced `SELECT * FROM trades` + all-in-JS maths.
// SQL now produces only counts and sums; every derived number still comes from
// the original JS. These tests pin that contract WITHOUT a database:
//
//   1. shapePerf(countsFromSql) === perf(theSameTrades)  — the equivalence proof
//   2. the JS twins of the SQL expressions (outcome, BE snapping) agree
//   3. ordering is preserved
//   4. user input stays parameterized in the new query builders
//
// A SQL error therefore surfaces as a count mismatch, never as a quietly
// different formula.

const SCOPE = { god: true, userId: 7, logins: [100], filterCol: 'user_id' };

// Emulate exactly what Postgres computes for a set of trades: the five
// aggregates in PERF_AGG, using the JS twins of the SQL CASE expressions.
function sqlCountsFor(list, unit, beRound) {
  const field = unit === 'USD' ? 'pnl_money' : 'fixed_r';
  const snapped = snapBeRounding(list, beRound);
  const outcome = (t) => {
    const raw = t[field];
    if (raw == null) return null;
    if (beRound && t.fixed_r != null && Math.abs(Number(t.fixed_r)) <= BE_THRESHOLD) return 'be';
    return Number(raw) > 0 ? 'win' : Number(raw) < 0 ? 'loss' : 'be';
  };
  return {
    trades: snapped.filter((t) => t[field] != null).length,
    wins: snapped.filter((t) => outcome(t) === 'win').length,
    losses: snapped.filter((t) => outcome(t) === 'loss').length,
    breakeven: snapped.filter((t) => outcome(t) === 'be').length,
    r_sum: snapped.filter((t) => t[field] != null).reduce((a, t) => a + Number(t[field]), 0),
  };
}

const TRADES = [
  { id: 1, fixed_r: 2.5, pnl_money: 250, setup: 'SMC' },
  { id: 2, fixed_r: -1, pnl_money: -100, setup: 'SMC' },
  { id: 3, fixed_r: 0.05, pnl_money: 12, setup: 'Continue' }, // near-zero R
  { id: 4, fixed_r: -0.08, pnl_money: -9, setup: 'Continue' }, // near-zero R
  { id: 5, fixed_r: 0, pnl_money: 0, setup: 'SMC' },
  { id: 6, fixed_r: 1.2, pnl_money: 120, setup: null },
  { id: 7, fixed_r: null, pnl_money: null, setup: 'SMC' }, // unscored
  { id: 8, fixed_r: 3.4, pnl_money: null, setup: 'Continue' }, // R only
];

test('shapePerf(SQL counts) === perf(trades) across units and rounding', () => {
  for (const unit of ['R', 'USD']) {
    for (const beRound of [false, true]) {
      const field = unit === 'USD' ? 'pnl_money' : 'fixed_r';
      const expected = perf(snapBeRounding(TRADES, beRound), field, beRound);
      const actual = shapePerf(sqlCountsFor(TRADES, unit, beRound));
      assert.deepEqual(actual, expected, `unit=${unit} beRound=${beRound}`);
    }
  }
});

test('shapePerf matches perf on the empty set (a group with only unscored trades)', () => {
  assert.deepEqual(shapePerf({}), perf([], 'fixed_r', false));
  assert.deepEqual(shapePerf(sqlCountsFor([], 'R', false)), perf([], 'fixed_r', false));
  // trades:0 must give sr:null and r:0 — not null r, which would break charts.
  assert.equal(shapePerf({}).r, 0);
  assert.equal(shapePerf({}).sr, null);
});

test('shapePerf coerces node-pg bigint strings (counts arrive as text)', () => {
  // count(*) is bigint; outside json_build_object node-pg hands back strings.
  const asText = { trades: '4', wins: '2', losses: '1', breakeven: '1', r_sum: '1.5' };
  assert.deepEqual(shapePerf(asText), { trades: 4, wins: 2, losses: 1, breakeven: 1, sr: 50, r: 1.5 });
});

test('breakeven rounding: near-zero R is breakeven in BOTH units, but $ still sums', () => {
  const near = [{ fixed_r: 0.05, pnl_money: 12 }, { fixed_r: -0.08, pnl_money: -9 }];
  const usd = shapePerf(sqlCountsFor(near, 'USD', true));
  assert.equal(usd.breakeven, 2, 'near-zero R trades are breakeven in $ too');
  assert.equal(usd.wins, 0);
  assert.equal(usd.losses, 0);
  assert.equal(usd.r, 3, 'their real $ (12 - 9) is still in the total');
  // In R the snapped value is exactly 0.
  assert.equal(shapePerf(sqlCountsFor(near, 'R', true)).r, 0);
});

test('outcomeSql / valueSql inline only the code constant, never user input', () => {
  for (const unit of ['R', 'USD']) {
    for (const beRound of [false, true]) {
      const sql = outcomeSql(unit, beRound) + valueSql(unit, beRound);
      assert.ok(!sql.includes('$'), 'no placeholders belong in these expressions');
      assert.match(outcomeSql(unit, beRound), /^CASE WHEN/);
      if (beRound) assert.ok(sql.includes(String(BE_THRESHOLD)));
    }
  }
  // R snaps near-zero to 0; money never snaps.
  assert.match(valueSql('R', true), /CASE WHEN fixed_r/);
  assert.equal(valueSql('R', false), 'fixed_r');
  assert.equal(valueSql('USD', true), 'pnl_money');
});

test('group ordering: SQL path sorts identically to the reference groupPerf', () => {
  const scored = TRADES.filter((t) => t.fixed_r != null);
  const reference = groupPerf(scored, (t) => t.setup, null, 'fixed_r', false);
  // Same groups fed through the SQL shape, arriving in first-appearance order.
  const rows = ['SMC', 'Continue'].map((key) => ({
    key,
    ...sqlCountsFor(scored.filter((t) => t.setup === key), 'R', false),
  }));
  const viaSql = rows.map((r) => ({ key: r.key, ...shapePerf(r) }))
    .sort((a, b) => (b.r ?? 0) - (a.r ?? 0));
  assert.deepEqual(viaSql, reference);
  // Null/empty setups are dropped by both paths.
  assert.ok(!reference.some((g) => g.key == null));
});

test('streaks reference: breakeven resets both runs (pins the gap-and-islands CTE)', () => {
  const seq = (outs) => outs.map((o, i) => ({ id: i, fixed_r: o === 'w' ? 1 : o === 'l' ? -1 : 0 }));
  assert.deepEqual(streaks(seq(['w', 'w', 'w', 'l']), 'fixed_r', false), { winStreak: 3, lossStreak: 1 });
  // A breakeven in the middle must break the run, not extend it.
  assert.deepEqual(streaks(seq(['w', 'w', 'b', 'w']), 'fixed_r', false), { winStreak: 2, lossStreak: 0 });
  assert.deepEqual(streaks(seq(['l', 'l', 'b', 'l', 'l', 'l']), 'fixed_r', false), { winStreak: 0, lossStreak: 3 });
  assert.deepEqual(streaks([], 'fixed_r', false), { winStreak: 0, lossStreak: 0 });
});

test('statsQuery: every user value parameterized, timestamps forced to UTC', () => {
  const { sql, params } = statsQuery(
    SCOPE, 'R',
    { setups: ["'; DROP TABLE trades; --"], symbols: ['EURUSD'], from: '2026-01-01', outcome: ['win'] },
    true
  );
  assert.deepEqual(params[0], 7);
  assert.ok(params.some((p) => Array.isArray(p) && p[0].includes('DROP TABLE')), 'injection attempt is a bound param');
  assert.ok(!sql.includes('DROP TABLE'), 'and never reaches the SQL text');
  // The JS original used getUTC* everywhere; without these the result would
  // depend on the DB session TimeZone.
  for (const part of ['EXTRACT(DOW', 'EXTRACT(YEAR', 'EXTRACT(MONTH', "date_trunc('week'"]) {
    assert.ok(sql.includes(part), `${part} missing`);
  }
  assert.equal((sql.match(/AT TIME ZONE 'UTC'/g) ?? []).length >= 5, true, 'UTC coercion on every extraction');
  assert.ok(sql.includes('GROUP BY'), 'aggregation happens in SQL');
  assert.ok(!/SELECT \* FROM trades/.test(sql), 'the full-table projection must be gone');
});

test('yearlyQuery: single GROUP BY (month, setup), year bound as a param', () => {
  const { sql, params } = yearlyQuery(2026, SCOPE, 'R', {}, false);
  assert.equal(params[0], 2026);
  assert.ok(sql.includes('GROUP BY mon, setup'));
  assert.ok(!/SELECT \* FROM trades/.test(sql));
});

test('adherenceQuery: narrow projection, restricted to rule-bearing setups', () => {
  const { sql, params } = adherenceQuery(SCOPE, 'R', {}, false, ['SMC']);
  assert.deepEqual(params[params.length - 1], ['SMC'], 'setups bound, not interpolated');
  assert.match(sql, /setup = ANY\(\$\d+\)/);
  // Only the mechanical fields the rule engine can evaluate.
  for (const col of ['session', 'direction', 'sl_size_pips', 'symbol_base', 'open_time']) {
    assert.ok(sql.includes(col), `${col} needed by RULE_TYPES`);
  }
  for (const col of ['comments', 'm15_url', 'h1_url', 'h4_url']) {
    assert.ok(!sql.includes(col), `${col} must not be fetched`);
  }
});

test('buildTradeWhere still parameterizes scope + filters (unchanged contract)', () => {
  const { where, params } = buildTradeWhere(SCOPE, 'R', { setups: ['SMC'] });
  assert.match(where, /user_id = \$1/);
  assert.match(where, /setup = ANY\(\$2\)/);
  assert.deepEqual(params, [7, ['SMC']]);
});

test('buildTradeWhere: outcome filter reuses the one outcome definition', () => {
  const { where, params } = buildTradeWhere(SCOPE, 'R', { outcome: ['win', 'be'] }, null, true);
  // Same CASE as the aggregates — a filter can never disagree with a count.
  assert.ok(where.includes(outcomeSql('R', true)));
  assert.deepEqual(params[params.length - 1], ['win', 'be']);
  // Unknown outcome values are dropped rather than passed through.
  const { params: p2 } = buildTradeWhere(SCOPE, 'R', { outcome: ['bogus'] });
  assert.equal(p2.length, 1, 'only the scope param remains');
});
