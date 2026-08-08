import { query } from '../../platform/db.js';
import { listStrategies } from '../trades/strategies.js';
import { evaluateAdherence } from '../trades/adherence.js';
import {
  BE_THRESHOLD, MONTHS, DOW, unitField,
  buildTradeWhere, statsQuery, yearlyQuery, adherenceQuery,
} from './statsSql.js';

// Dashboard analytics. The COUNT/SUM/GROUP BY work happens in Postgres
// (statsSql.js); everything derived from those counts — rounding, strike rate,
// averages, profit factor, expectancy, sort order — happens here, in the
// functions that were always here and are already tested.
//
// The functions marked REFERENCE below are the original all-in-JS
// implementations. They are the oracle test/stats-sql.test.js pins the SQL
// against (shapePerf(counts) must equal perf(list)), which is how the SQL path
// is verified without needing a database in CI. Do not "clean them up" — they
// are load-bearing for the tests, not dead code.

const round = (n, dp = 2) => (n == null || Number.isNaN(n) ? null : Math.round(n * 10 ** dp) / 10 ** dp);
const sum = (arr) => arr.reduce((a, b) => a + b, 0);
const num = (v) => Number(v ?? 0);

// Re-exported so existing importers (and test/scope.test.js) keep their path.
export { buildTradeWhere };

// REFERENCE. Mirrors the SQL value expression: with breakeven rounding on, a
// Fixed R within ±BE_THRESHOLD is treated as an exact 0R. Exported so the
// equivalence test can build the pre-SQL trade list the old code would have.
export function snapBeRounding(trades, beRound) {
  if (!beRound) return trades;
  return trades.map((t) =>
    t.fixed_r != null && Math.abs(Number(t.fixed_r)) <= BE_THRESHOLD
      ? { ...t, fixed_r: 0 }
      : t);
}

// Monday-anchored week label for a close Date, e.g. "30 Jun 2026". Still used to
// label the SQL `date_trunc('week', ...)` buckets.
function weekKey(d) {
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const monday = new Date(Date.UTC(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - (day === 0 ? 6 : day - 1)
  ));
  return `${monday.getUTCDate()} ${MONTHS[monday.getUTCMonth()]} ${monday.getUTCFullYear()}`;
}

// REFERENCE. Win/loss/breakeven for a trade under the display unit + precision
// setting — the JS twin of outcomeSql(). With breakeven rounding on, a trade
// whose Fixed R is within ±BE_THRESHOLD is breakeven in EVERY unit ($ too),
// though its real $ value is still summed into totals.
function outcomeOf(t, field, beRound) {
  const v = t[field];
  if (v == null) return null;
  if (beRound && t.fixed_r != null && Math.abs(Number(t.fixed_r)) <= BE_THRESHOLD) return 'be';
  const n = Number(v);
  return n > 0 ? 'win' : n < 0 ? 'loss' : 'be';
}

// REFERENCE. Performance of an arbitrary subset of trades. Still used live for
// the adherence split (which needs per-trade rule evaluation anyway).
export function perf(list, field = 'fixed_r', beRound = false) {
  const scored = list.filter((t) => t[field] != null);
  const wins = scored.filter((t) => outcomeOf(t, field, beRound) === 'win');
  const losses = scored.filter((t) => outcomeOf(t, field, beRound) === 'loss');
  const breakeven = scored.filter((t) => outcomeOf(t, field, beRound) === 'be');
  const r = sum(scored.map((t) => Number(t[field]))); // real value — BE $ preserved
  return {
    trades: scored.length,
    wins: wins.length,
    losses: losses.length,
    breakeven: breakeven.length,
    sr: scored.length ? round((100 * wins.length) / scored.length) : null, // wins / all trades
    r: round(r),
  };
}

// The SQL twin of perf(): the same output shape, built from the five aggregates
// Postgres returned instead of from a row list. Every derivation (sr, rounding)
// is the identical expression, which is what makes the two provably equal.
export function shapePerf(row = {}) {
  const trades = num(row.trades);
  const wins = num(row.wins);
  return {
    trades,
    wins,
    losses: num(row.losses),
    breakeven: num(row.breakeven),
    sr: trades ? round((100 * wins) / trades) : null,
    r: round(num(row.r_sum)),
  };
}

// Group ordering, shared by the reference groupPerf and the SQL path so both
// sort identically. With an explicit `order` list, unknown keys land first
// (indexOf -1) — preserved deliberately; the sort is stable, so ties keep the
// incoming order (first appearance in close_time order).
function orderGroups(rows, order) {
  const out = [...rows];
  if (order) out.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  else out.sort((a, b) => (b.r ?? 0) - (a.r ?? 0));
  return out;
}

// REFERENCE. group trades by a key function -> [{ key, ...perf }]
export function groupPerf(list, keyFn, order, field = 'fixed_r', beRound = false) {
  const m = new Map();
  for (const t of list) {
    const k = keyFn(t);
    if (k == null || k === '') continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(t);
  }
  return orderGroups([...m.entries()].map(([key, ts]) => ({ key, ...perf(ts, field, beRound) })), order);
}

// SQL rows -> the same [{ key, ...perf }] shape. `label` maps a row to its
// display key (the DB returns raw parts: a weekday number, a year+month pair).
const shapeGroups = (rows = [], order = null, label = (r) => r.key) =>
  orderGroups(rows.map((r) => ({ key: label(r), ...shapePerf(r) })), order);

// Objective rule adherence: for every trade whose strategy defines rules, decide
// whether it FOLLOWED or BROKE them (see adherence.js), then contrast the two
// sets' performance. Stays in JS: the rule engine evaluates JSONB predicates
// per trade, which SQL cannot express. Only rule-bearing trades are ever
// fetched, so the row cost is zero for users with no rules.
function computeAdherence(list, rulesByName, field = 'fixed_r', beRound = false) {
  const groups = new Map(); // name -> { followed:[], broken:[], unassessed:0 }
  const allFollowed = [], allBroken = [];
  for (const t of list) {
    const rules = t.setup ? rulesByName.get(t.setup) : null;
    if (!Array.isArray(rules) || rules.length === 0) continue; // only rule-bearing strategies
    if (!groups.has(t.setup)) groups.set(t.setup, { followed: [], broken: [], unassessed: 0 });
    const g = groups.get(t.setup);
    const { status } = evaluateAdherence(t, rules);
    if (status === 'followed') { g.followed.push(t); allFollowed.push(t); }
    else if (status === 'broken') { g.broken.push(t); allBroken.push(t); }
    else g.unassessed += 1; // 'unassessed' (missing fields) — counted but out of the ratio
  }

  const byStrategy = [...groups.entries()].map(([key, g]) => {
    const f = perf(g.followed, field, beRound);
    const b = perf(g.broken, field, beRound);
    const assessed = g.followed.length + g.broken.length;
    return {
      key,
      total: assessed + g.unassessed,
      assessed,
      unassessed: g.unassessed,
      followed: g.followed.length,
      broken: g.broken.length,
      adherence: assessed ? round((100 * g.followed.length) / assessed) : null,
      rFollowed: f.r, srFollowed: f.sr, expFollowed: f.trades ? round(f.r / f.trades) : null,
      rBroken: b.r, srBroken: b.sr, expBroken: b.trades ? round(b.r / b.trades) : null,
    };
  }).sort((a, b) => b.total - a.total);

  const f = perf(allFollowed, field, beRound);
  const b = perf(allBroken, field, beRound);
  const assessed = allFollowed.length + allBroken.length;
  const overall = {
    assessed,
    followed: allFollowed.length,
    broken: allBroken.length,
    adherence: assessed ? round((100 * allFollowed.length) / assessed) : null,
    rFollowed: f.r, srFollowed: f.sr, expFollowed: f.trades ? round(f.r / f.trades) : null,
    rBroken: b.r, srBroken: b.sr, expBroken: b.trades ? round(b.r / b.trades) : null,
  };
  return { overall, byStrategy };
}

// Distinct setups present in a trade set, ordered by the user's strategy catalog
// first (their chosen order), then any unmanaged setups alphabetically. Pure +
// multi-tenant: replaces the old hardcoded ['Continue','Liq-run','Fractal','SMC']
// so every user's Yearly columns reflect THEIR strategies. Exported for testing.
export function orderSetups(present = [], catalogOrder = []) {
  const seen = new Set();
  for (const s of present) if (s != null && s !== '') seen.add(s);
  const catalogSet = new Set(catalogOrder);
  const inCatalog = catalogOrder.filter((n) => seen.has(n));
  const extras = [...seen].filter((s) => !catalogSet.has(s)).sort((a, b) => String(a).localeCompare(String(b)));
  return [...inCatalog, ...extras];
}

// REFERENCE. longest run of consecutive wins / losses (breakeven resets both) —
// the JS twin of the gap-and-islands CTE.
export function streaks(orderedTrades, field, beRound) {
  let win = 0, loss = 0, maxWin = 0, maxLoss = 0;
  for (const t of orderedTrades) {
    const o = outcomeOf(t, field, beRound);
    if (o === 'win') { win++; loss = 0; }
    else if (o === 'loss') { loss++; win = 0; }
    else { win = 0; loss = 0; }
    maxWin = Math.max(maxWin, win);
    maxLoss = Math.max(maxLoss, loss);
  }
  return { winStreak: maxWin, lossStreak: maxLoss };
}

const R_BUCKETS = ['≤ -1R', '-1–0R', 'BE', '0–1R', '1–2R', '2–3R', '> 3R'];
const R_BUCKET_COLS = ['b_le_m1', 'b_m1_0', 'b_be', 'b_0_1', 'b_1_2', 'b_2_3', 'b_gt3'];

// Fetch the user's rule-bearing strategies and, only if there are any, the
// narrow set of trades they cover. Returns the adherence block. With no rules
// this issues no query at all and returns the same zeroed shape as before.
async function loadAdherence(scope, unit, filters, beRound) {
  const field = unitField(unit);
  const ruleBearing = (await listStrategies(scope.userId))
    .filter((s) => Array.isArray(s.rules) && s.rules.length > 0);
  if (!ruleBearing.length) return computeAdherence([], new Map(), field, beRound);

  const rulesByName = new Map(ruleBearing.map((s) => [s.name, s.rules]));
  const { sql, params } = adherenceQuery(scope, unit, filters, beRound, ruleBearing.map((s) => s.name));
  const { rows } = await query(sql, params);
  // Present the rows the way perf()/outcomeOf() expect: the unit's value under
  // its own column name, and fixed_r already breakeven-snapped by SQL.
  const list = rows.map((r) => ({ ...r, [field]: r.val, fixed_r: r.r_val }));
  return computeAdherence(list, rulesByName, field, beRound);
}

// `scope` from resolveScope: god -> user_id = me, an explicit account selection
// -> account_id = ANY(logins). The predicate is built by scopeCondition (safe).
// `filters` are the global data filters — the SQL half of the client's filter
// registry, built by buildTradeWhere in statsSql.js — applied app-wide.
export async function computeStats(scope, unit = 'R', filters = {}, beRound = false) {
  const { sql, params } = statsQuery(scope, unit, filters, beRound);
  const [{ rows }, adherence] = await Promise.all([
    query(sql, params),
    loadAdherence(scope, unit, filters, beRound),
  ]);
  const d = rows[0]?.data ?? {};
  const h = d.headline ?? {};

  const base = shapePerf(h);
  // Win/loss sums exclude breakeven trades (their $ stays in totalReturn, not here).
  const winsR = num(h.win_sum);
  const lossR = num(h.loss_sum);

  const headline = {
    unit,
    totalReturn: base.r,
    strikeRate: base.sr,
    trades: base.trades,
    wins: base.wins,
    losses: base.losses,
    breakeven: base.breakeven,
    avgWin: base.wins ? round(winsR / base.wins) : null,
    avgLoss: base.losses ? round(lossR / base.losses) : null,
    profitFactor: lossR !== 0 ? round(winsR / Math.abs(lossR)) : null,
    // NOTE: standard expectancy = total / trades. The sheet shows 0.54 via a
    // different range; swap this line once the exact cell formula is confirmed.
    expectancy: base.trades ? round(base.r / base.trades) : null,
    winStreak: num(d.streaks?.win_streak),
    lossStreak: num(d.streaks?.loss_streak),
  };

  // MFE efficiency — how far trades ran (Max R) vs what was captured. Always in
  // R: Max R is a ratio, and capture only makes sense as realized-R ÷ available-R.
  const m = d.mfe ?? {};
  const rCount = num(m.r_count);
  const rPerTrade = rCount ? num(m.r_net) / rCount : null;
  const maxRCount = num(m.max_r_count);
  const avgMaxR = maxRCount ? round(num(m.max_r_sum) / maxRCount) : null;

  return {
    headline,
    // By strategy — data-driven, sorted best-first (by P&L). No hardcoded list,
    // so each user sees their own strategies.
    bySetup: shapeGroups(d.bySetup),
    byInstrument: shapeGroups(d.byInstrument),
    byProbability: shapeGroups(d.byProbability, ['HIGH', 'MED', 'LOW']),
    bySession: shapeGroups(d.bySession, ['LDN', 'NY', 'ASIA']),
    byDay: shapeGroups(d.byDay, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], (r) => DOW[Number(r.key)]),
    byMonth: shapeGroups(d.byMonth, null, (r) => `${MONTHS[Number(r.mon) - 1]} ${Number(r.yr)}`),
    byWeek: shapeGroups(d.byWeek, null, (r) => weekKey(new Date(`${r.key}T00:00:00Z`))),
    equityCurve: (d.equity ?? []).map((p) => ({ i: Number(p.i), date: p.date, cumR: round(Number(p.cum)) })),
    // R-distribution is intrinsically in R, so it is always computed from fixed_r.
    rDistribution: R_BUCKETS.map((label, i) => ({ label, count: num((d.rDist ?? {})[R_BUCKET_COLS[i]]) })),
    mfeEfficiency: {
      avgMaxR,
      avgRealized: rPerTrade != null ? round(rPerTrade) : null,
      capture: avgMaxR ? round(rPerTrade / avgMaxR) : null, // realized ÷ available (R)
    },
    adherence,
  };
}

// Sum the additive aggregate columns of several group rows. Valid because
// trades/wins/losses/breakeven/r_sum are all plain sums — so a month's "overall"
// is the sum of its per-setup cells, and rounding still happens once, at the end.
const addCells = (rows) => rows.reduce(
  (acc, r) => ({
    trades: acc.trades + num(r.trades),
    wins: acc.wins + num(r.wins),
    losses: acc.losses + num(r.losses),
    breakeven: acc.breakeven + num(r.breakeven),
    r_sum: acc.r_sum + num(r.r_sum),
  }),
  { trades: 0, wins: 0, losses: 0, breakeven: 0, r_sum: 0 }
);

// Yearly view: monthly performance (overall + per setup) for one year, from a
// single GROUP BY (month, setup) instead of the year's full row set.
export async function computeYearly(year, scope, unit = 'R', filters = {}, beRound = false) {
  const { sql, params } = yearlyQuery(year, scope, unit, filters, beRound);
  const [{ rows }, catalog] = await Promise.all([
    query(sql, params),
    listStrategies(scope.userId).then((ss) => ss.map((s) => s.name)),
  ]);
  const cells = rows[0]?.data?.cells ?? [];

  // Strategy columns come from the user's own catalog (ordered), plus any
  // unmanaged setups actually traded — never a hardcoded, single-tenant list.
  const setups = orderSetups(cells.map((c) => c.setup), catalog);

  const at = new Map(); // `${mon}|${setup}` -> cell
  for (const c of cells) at.set(`${Number(c.mon)}|${c.setup ?? ''}`, c);
  const inMonth = (mi) => cells.filter((c) => Number(c.mon) - 1 === mi);

  const months = MONTHS.map((name, mi) => {
    const row = { month: name, overall: shapePerf(addCells(inMonth(mi))) };
    for (const s of setups) row[s] = shapePerf(at.get(`${mi + 1}|${s}`) ?? {});
    return row;
  });

  const total = { month: 'TOTAL', overall: shapePerf(addCells(cells)) };
  for (const s of setups) {
    total[s] = shapePerf(addCells(cells.filter((c) => c.setup === s)));
  }

  return { year, setups, unit, months, total };
}
