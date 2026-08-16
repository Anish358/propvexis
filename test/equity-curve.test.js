import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { shapeEquityCurve } from '../src/domain/analytics/aggregations.js';

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const sql = read('../src/domain/analytics/statsSql.js');
const metrics = read('../frontend/src/lib/metrics.js');

// The equity curve was 99.6% of the /api/stats payload — 1175 KB at 20k trades,
// and the same again held in statsCache on a 1GB box. It is now a bare array of
// running totals. Nothing rendered changes: both charts read the trade's
// position for X and the cumulative value for Y, and the position is the index.

test('the curve is a bare array of numbers, not objects', () => {
  const out = shapeEquityCurve([1.5, 3.25, 2]);
  assert.deepEqual(out, [1.5, 3.25, 2]);
  for (const v of out) assert.equal(typeof v, 'number');
  // Postgres hands numerics back as strings in some paths; they must not reach
  // the client that way, or Recharts plots a flat line.
  assert.deepEqual(shapeEquityCurve(['1.5', '-0.25']), [1.5, -0.25]);
});

test('an empty or absent curve is an empty array, never null', () => {
  // Both charts pass this straight to Recharts, which must get an array.
  assert.deepEqual(shapeEquityCurve([]), []);
  assert.deepEqual(shapeEquityCurve(undefined), []);
  assert.deepEqual(shapeEquityCurve(null), []);
});

test('rounding stays in JS, including on the negatives an equity curve produces', () => {
  // The divergence, concretely: Math.round is half-UP, so -0.125 rounds toward
  // zero to -0.12. Postgres round(-0.125, 2) is half-away-from-zero and gives
  // -0.13. An equity curve spends plenty of time negative, so moving this into
  // the query would have shifted real values while looking like a pure
  // optimisation — which is why the CTE must not round.
  assert.deepEqual(shapeEquityCurve([-0.125, -1.005, 2.675]), [-0.12, -1, 2.68]);
  assert.ok(!/round\(/i.test(sql.slice(sql.indexOf('equity AS ('), sql.indexOf('seq AS ('))),
    'the equity CTE must not round in SQL');
});

test('the SQL sends only what is drawn', () => {
  const cte = sql.slice(sql.indexOf('equity AS ('), sql.indexOf('seq AS ('));
  assert.match(cte, /json_agg\(cum ORDER BY rn\)/);
  // The date was ~40 of the ~60 bytes per point and was rendered nowhere.
  assert.ok(!cte.includes("'date'"), 'no date is sent');
  assert.ok(!cte.includes('to_char'), 'no date is even formatted');
  assert.ok(!cte.includes("'i'"), 'the index is the position, not a field');
  // The ordering still has to be deterministic, and must match the tiebreak the
  // streak CTEs use, or the curve and the streaks would disagree about order.
  assert.match(cte, /row_number\(\) OVER \(ORDER BY close_time, id\)/);
  assert.match(cte, /SUM\(val\) OVER \(ORDER BY close_time, id ROWS UNBOUNDED PRECEDING\)/);
  assert.match(cte, /COALESCE\(json_agg[\s\S]*?'\[\]'::json\)/);   // no rows -> []
});

test('the frontend expands the array to exactly what the charts read', () => {
  // Reimplemented here (the suite cannot import frontend modules — CI installs
  // backend deps only), so this asserts the CONTRACT: index+1 as X, value as Y.
  const equityPoints = new Function(`${metrics.slice(
    metrics.indexOf('export function equityPoints'), metrics.indexOf('export function fmtR')
  ).replace('export function', 'function')}; return equityPoints;`)();

  assert.deepEqual(equityPoints([1.5, -0.5, 2]), [
    { i: 1, cumR: 1.5 }, { i: 2, cumR: -0.5 }, { i: 3, cumR: 2 },
  ]);
  assert.deepEqual(equityPoints([]), []);
  assert.deepEqual(equityPoints(null), [], 'a missing curve must not throw');

  // A client can outlive a deploy, or hold a cached response from the old
  // backend. The old object form still has to draw.
  assert.deepEqual(
    equityPoints([{ i: 1, date: '2026-01-01T00:00:00.000Z', cumR: 1.5 }]),
    [{ i: 1, cumR: 1.5 }]
  );
});

test('both charts read the memoized expansion, not the raw array', () => {
  for (const [file, source] of [
    ['Analytics', read('../frontend/src/features/analytics/Analytics.jsx')],
    ['Reports', read('../frontend/src/features/reports/Reports.jsx')],
  ]) {
    assert.match(source, /useMemo\(\(\) => equityPoints\(/, `${file} must memoize the expansion`);
    assert.match(source, /<LineChart data=\{equity\}/, `${file} must chart the expansion`);
    // dataKey="i" / "cumR" are what equityPoints produces — if either side
    // changes alone, the chart silently goes blank.
    assert.match(source, /dataKey="i"/);
    assert.match(source, /dataKey="cumR"/);
  }
});
