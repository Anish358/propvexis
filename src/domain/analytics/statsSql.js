// SQL aggregation layer for the dashboard / analytics stats.
//
// WHY: computeStats used to run `SELECT * FROM trades` and compute everything in
// Node — every column of every trade crossed the wire and was held in memory per
// request. That is the #2 scaling constraint (see memory `scale-1000-users`).
//
// THE SPLIT (deliberate, and the reason this is safe):
//   * SQL does only COUNT / SUM / GROUP BY. Nothing derived.
//   * every derived number — rounding, strike rate, averages, profit factor,
//     expectancy, group sort order — stays in the JS that already existed and is
//     already tested.
// So `shapePerf(countsFromSql)` must equal `perf(theSameTradesInJs)`, which
// test/stats-sql.test.js asserts directly against the original implementation.
// That keeps the app's most important numbers pinned without needing a database
// in CI, and it means a SQL mistake shows up as a count mismatch, never as a
// silently different formula.
//
// NOT moved to SQL, on purpose:
//   * adherence — evaluateAdherence is a JS rule engine over JSONB rules; it is
//     fetched separately and ONLY for trades whose strategy actually has rules
//     (usually none, so usually zero extra rows).
//
// All timestamp extraction is forced to UTC (`AT TIME ZONE 'UTC'`) because the
// JS original used getUTC* exclusively. Without this the results would silently
// depend on the database session's TimeZone setting.
import { scopeCondition } from '../accounts/accounts.js';

// Any trade whose Fixed R is within ±this of zero counts as an exact breakeven
// when the user has breakeven-rounding on. A code constant, never user input,
// so it is safe to inline into SQL.
export const BE_THRESHOLD = 0.1;

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const unitField = (unit) => (unit === 'USD' ? 'pnl_money' : 'fixed_r');

// The value SUMmed for a unit. Mirrors snapBeRounding: with rounding on, a
// near-zero Fixed R is summed as exactly 0. Money is never snapped — a
// breakeven trade's real $ still belongs in the total.
export function valueSql(unit, beRound) {
  const field = unitField(unit);
  if (field !== 'fixed_r' || !beRound) return field;
  return `CASE WHEN fixed_r IS NOT NULL AND abs(fixed_r) <= ${BE_THRESHOLD} THEN 0 ELSE fixed_r END`;
}

// win / loss / be / NULL for one row — the SQL twin of outcomeOf(). The
// breakeven-rounding branch is tested on fixed_r in BOTH units, exactly as the
// JS does: with rounding on, a near-zero-R trade is breakeven even in $.
export function outcomeSql(unit, beRound) {
  const field = unitField(unit);
  const be = beRound ? `WHEN fixed_r IS NOT NULL AND abs(fixed_r) <= ${BE_THRESHOLD} THEN 'be' ` : '';
  return (
    `CASE WHEN ${field} IS NULL THEN NULL ` +
    be +
    `WHEN ${field} > 0 THEN 'win' WHEN ${field} < 0 THEN 'loss' ELSE 'be' END`
  );
}

// The five numbers perf() needs, as aggregate expressions over a row set.
// `trades` counts rows scorable in this unit — perf() filters the same way.
const PERF_AGG = `
    count(*) FILTER (WHERE raw IS NOT NULL)   AS trades,
    count(*) FILTER (WHERE outcome = 'win')   AS wins,
    count(*) FILTER (WHERE outcome = 'loss')  AS losses,
    count(*) FILTER (WHERE outcome = 'be')    AS breakeven,
    COALESCE(SUM(val), 0)                     AS r_sum`;

// The SQL half of the client's filter registry (frontend/src/filterDefs.js): each
// filter key maps to the EXPRESSION it constrains. Tables rather than a wall of
// ifs is what makes the two halves checkable against each other —
// test/filter-panel.test.js asserts every live client def has an entry here, so a
// filter can't ship that narrows the trade log while the dashboard KPIs ignore it.
//
// Keys are code-controlled (they name columns); the VALUES are always parameterized.
const MULTI_COLS = {
  setups: 'setup',
  symbols: 'COALESCE(symbol_base, symbol)',
  sessions: 'session',
  probability: 'probability',
  mtf: 'mtf_phase',
  // Compared as text so the array parameter stays text[] like every other multi.
  // ISO weekday (Mon=1…Sun=7), forced to UTC like every other timestamp part in
  // this file — the client's weekdayOf() reads getUTCDay() to match.
  dows: `EXTRACT(ISODOW FROM (close_time AT TIME ZONE 'UTC'))::text`,
};
const RANGE_COLS = {
  pnl: 'pnl_money',
  r: 'fixed_r',
  maxR: 'max_r',
  risk: 'sl_size_pips',
  vol: 'volume',
  dur: '(EXTRACT(EPOCH FROM (close_time - open_time)) / 60)',
};

// Build the WHERE clause for a trade query from the scope + global data filters
// (+ an optional year). `scope.filterCol` and the field used for outcome are
// code-controlled; every user-supplied value is parameterized. Returns
// { where, params } with params positioned for the returned placeholders.
export function buildTradeWhere(scope, unit = 'R', filters = {}, year = null, beRound = false) {
  const conds = [];
  const params = [];
  const add = (val) => { params.push(val); return `$${params.length}`; };

  if (year != null) conds.push(`EXTRACT(YEAR FROM close_time AT TIME ZONE 'UTC') = ${add(year)}`);
  if (scope) conds.push(scopeCondition(scope, add));
  for (const [key, col] of Object.entries(MULTI_COLS)) {
    if (filters[key]?.length) conds.push(`${col} = ANY(${add(filters[key].map(String))})`);
  }
  for (const [key, col] of Object.entries(RANGE_COLS)) {
    const { min, max } = filters[key] || {};
    // A NULL column can't satisfy a bound — matching the client, where an unset
    // measurement is excluded from a range rather than treated as zero.
    if (min != null) conds.push(`${col} >= ${add(min)}`);
    if (max != null) conds.push(`${col} <= ${add(max)}`);
  }
  if (filters.direction) conds.push(`direction = ${add(filters.direction)}`);
  if (filters.journaled) conds.push(`tagged = ${add(filters.journaled === 'yes')}`);
  if (filters.from) conds.push(`close_time >= ${add(filters.from)}`);
  if (filters.to) conds.push(`close_time <= ${add(`${filters.to} 23:59:59`)}`);
  if (filters.outcome?.length) {
    // Reuse the single outcome definition rather than restating it, so a filter
    // can never disagree with an aggregate about what counts as a win.
    const parts = filters.outcome.filter((o) => ['win', 'loss', 'be'].includes(o));
    if (parts.length) {
      // ::text[] because the CASE yields text and the array parameter would
      // otherwise be inferred as unknown[].
      conds.push(`(${outcomeSql(unit, beRound)}) = ANY(${add(parts)}::text[])`);
    }
  }
  return { where: conds.length ? `WHERE ${conds.join(' AND ')}` : '', params };
}

// Append an extra condition to a (possibly empty) WHERE clause.
const andWhere = (where, cond) => (where ? `${where} AND ${cond}` : `WHERE ${cond}`);

// The projection every aggregate CTE reads from. Note `raw` is the unsnapped
// column (used for the "is this scorable" test) while `val` is what gets summed.
function baseCte(unit, beRound, where) {
  const utc = `(close_time AT TIME ZONE 'UTC')`;
  return `
  base AS (
    SELECT
      id,
      close_time,
      ${unitField(unit)}    AS raw,
      ${valueSql(unit, beRound)} AS val,
      ${valueSql('R', beRound)}  AS r_val,
      fixed_r,
      max_r,
      setup,
      COALESCE(symbol_base, symbol) AS instrument,
      probability,
      session,
      ${outcomeSql(unit, beRound)} AS outcome,
      EXTRACT(DOW   FROM ${utc})::int AS dow,
      EXTRACT(YEAR  FROM ${utc})::int AS yr,
      EXTRACT(MONTH FROM ${utc})::int AS mon,
      date_trunc('week', ${utc})::date AS wk
    FROM trades
    ${where}
  )`;
}

// A GROUP BY block. `cols` is what identifies the group in the output; groups
// whose key is NULL or '' are dropped, matching groupPerf's keyFn contract.
//
// first_at/first_id exist purely to make ordering deterministic: the JS original
// built groups in first-appearance order and then applied a STABLE sort, so
// equal-P&L groups came out in close_time order. Emitting these lets the JSON
// arrive in that same order, and the JS sort stays stable on top of it. They are
// dropped by the shaper and never reach the API.
function groupCte(name, cols, { skipNullKey = true, keyCol = null } = {}) {
  const guard = skipNullKey && keyCol ? `WHERE ${keyCol} IS NOT NULL AND ${keyCol} <> ''` : '';
  return `
  ${name} AS (
    SELECT ${cols}, ${PERF_AGG.trim()},
      MIN(close_time) AS first_at, MIN(id) AS first_id
    FROM base ${guard}
    GROUP BY ${cols.split(',').map((_, i) => i + 1).join(', ')}
  )`;
}

// json_agg in first-appearance order (see groupCte).
const aggGroup = (cte) =>
  `(SELECT COALESCE(json_agg(to_json(x) ORDER BY x.first_at, x.first_id), '[]'::json) FROM ${cte} x)`;

// One query for everything except adherence. Returns { sql, params }; the result
// is a single row with a single `data` JSON column — bigint counts come back as
// JSON numbers that way, instead of node-pg's strings.
export function statsQuery(scope, unit = 'R', filters = {}, beRound = false) {
  const { where, params } = buildTradeWhere(scope, unit, filters, null, beRound);

  const sql = `
WITH${baseCte(unit, beRound, where)},
  headline AS (
    SELECT ${PERF_AGG.trim()},
      COALESCE(SUM(val) FILTER (WHERE outcome = 'win'), 0)  AS win_sum,
      COALESCE(SUM(val) FILTER (WHERE outcome = 'loss'), 0) AS loss_sum
    FROM base
  ),
${groupCte('g_setup', 'setup AS key', { keyCol: 'setup' })},
${groupCte('g_instrument', 'instrument AS key', { keyCol: 'instrument' })},
${groupCte('g_probability', 'probability AS key', { keyCol: 'probability' })},
${groupCte('g_session', 'session AS key', { keyCol: 'session' })},
${groupCte('g_dow', 'dow AS key', { skipNullKey: false })},
${groupCte('g_month', 'yr, mon', { skipNullKey: false })},
${groupCte('g_week', 'wk AS key', { skipNullKey: false })},
  r_dist AS (
    SELECT
      count(*) FILTER (WHERE r_val <= -1)                 AS b_le_m1,
      count(*) FILTER (WHERE r_val > -1 AND r_val < 0)    AS b_m1_0,
      count(*) FILTER (WHERE r_val = 0)                   AS b_be,
      count(*) FILTER (WHERE r_val > 0 AND r_val <= 1)    AS b_0_1,
      count(*) FILTER (WHERE r_val > 1 AND r_val <= 2)    AS b_1_2,
      count(*) FILTER (WHERE r_val > 2 AND r_val <= 3)    AS b_2_3,
      count(*) FILTER (WHERE r_val > 3)                   AS b_gt3
    FROM base WHERE fixed_r IS NOT NULL
  ),
  mfe AS (
    SELECT
      COALESCE(SUM(r_val), 0)                          AS r_net,
      count(*)                                         AS r_count,
      COALESCE(SUM(max_r) FILTER (WHERE max_r IS NOT NULL), 0) AS max_r_sum,
      count(*) FILTER (WHERE max_r IS NOT NULL)         AS max_r_count
    FROM base WHERE fixed_r IS NOT NULL
  ),
  -- Equity curve: a BARE ARRAY of running totals, one per scored trade, in
  -- close order. Not objects.
  --
  -- It used to emit one object per point holding i, date and cum, and at 20k
  -- trades that was 1175 KB — 99.6% of the whole /api/stats payload, and the
  -- same again sitting in statsCache on a 1GB box. Two fields were being paid
  -- for and not used:
  --   * the date is rendered NOWHERE. Both charts (Analytics, Reports) plot the
  --     position on X and the cumulative value on Y; the ISO string was ~40 of
  --     the ~60 bytes per point and no consumer ever read it.
  --   * i is just the 1-based position, so the array index already is it.
  -- Same points, same values, same picture: 1175 KB -> 151 KB.
  --
  -- The row_number is still needed INSIDE the query — json_agg needs a
  -- deterministic order and (close_time, id) is the same tiebreak the streak
  -- CTEs use — it just does not need to be sent.
  --
  -- NOTE: this whole file is one JS template literal, so no backticks in here.
  equity AS (
    SELECT COALESCE(json_agg(cum ORDER BY rn), '[]'::json) AS points
    FROM (
      SELECT
        row_number() OVER (ORDER BY close_time, id) AS rn,
        SUM(val) OVER (ORDER BY close_time, id ROWS UNBOUNDED PRECEDING) AS cum
      FROM base WHERE raw IS NOT NULL
    ) q
  ),
  -- Longest win / loss run, as gap-and-islands. Row numbers are assigned over
  -- ALL scored trades first, so a breakeven in the middle breaks contiguity and
  -- therefore resets both streaks — exactly what the JS streaks() does.
  seq AS (
    SELECT outcome, row_number() OVER (ORDER BY close_time, id) AS rn
    FROM base WHERE raw IS NOT NULL
  ),
  islands AS (
    SELECT outcome, rn - row_number() OVER (PARTITION BY outcome ORDER BY rn) AS grp
    FROM seq WHERE outcome IN ('win', 'loss')
  ),
  runs AS (SELECT outcome, count(*) AS len FROM islands GROUP BY outcome, grp),
  streaks AS (
    SELECT
      COALESCE(max(len) FILTER (WHERE outcome = 'win'), 0)  AS win_streak,
      COALESCE(max(len) FILTER (WHERE outcome = 'loss'), 0) AS loss_streak
    FROM runs
  )
SELECT json_build_object(
  'headline',      (SELECT to_json(h) FROM headline h),
  'bySetup',       ${aggGroup('g_setup')},
  'byInstrument',  ${aggGroup('g_instrument')},
  'byProbability', ${aggGroup('g_probability')},
  'bySession',     ${aggGroup('g_session')},
  'byDay',         ${aggGroup('g_dow')},
  'byMonth',       ${aggGroup('g_month')},
  'byWeek',        ${aggGroup('g_week')},
  'rDist',         (SELECT to_json(d) FROM r_dist d),
  'mfe',           (SELECT to_json(m) FROM mfe m),
  'equity',        (SELECT points FROM equity),
  'streaks',       (SELECT to_json(s) FROM streaks s)
) AS data`;

  return { sql, params };
}

// Yearly matrix: one GROUP BY (month, setup) instead of pulling the year's rows.
export function yearlyQuery(year, scope, unit = 'R', filters = {}, beRound = false) {
  const { where, params } = buildTradeWhere(scope, unit, filters, year, beRound);
  const sql = `
WITH${baseCte(unit, beRound, where)},
  cells AS (
    SELECT mon, setup, ${PERF_AGG.trim()}
    FROM base GROUP BY mon, setup
  )
SELECT json_build_object(
  'cells', (SELECT COALESCE(json_agg(to_json(c)), '[]'::json) FROM cells c)
) AS data`;
  return { sql, params };
}

// Narrow projection for the JS adherence engine — ONLY the mechanical fields
// RULE_TYPES can evaluate, and only for trades whose strategy defines rules.
// With no rule-bearing strategies this query is never issued at all.
export function adherenceQuery(scope, unit, filters, beRound, setups) {
  const { where, params } = buildTradeWhere(scope, unit, filters, null, beRound);
  params.push(setups);
  const sql = `
    SELECT
      setup, session, direction, sl_size_pips, symbol_base, symbol, open_time,
      ${valueSql(unit, beRound)} AS val,
      ${valueSql('R', beRound)}  AS r_val
    FROM trades
    ${andWhere(where, `setup = ANY($${params.length})`)}
    ORDER BY close_time, id`;
  return { sql, params };
}
