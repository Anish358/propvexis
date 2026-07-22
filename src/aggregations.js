import { query } from './db.js';
import { scopeCondition } from './accounts.js';
import { listStrategies } from './strategies.js';
import { evaluateAdherence } from './adherence.js';

// All dashboard analytics are computed in JS over the full trade set — simplest
// and most flexible for a personal journal, and lets us match the sheet exactly.

const round = (n, dp = 2) => (n == null || Number.isNaN(n) ? null : Math.round(n * 10 ** dp) / 10 ** dp);
const sum = (arr) => arr.reduce((a, b) => a + b, 0);

// Precision control: mirror the client's breakeven rounding (metrics.js). When
// on, any trade whose Fixed R is within ±BE_THRESHOLD of zero is snapped to an
// exact 0R, so server aggregates classify it as breakeven like the rest of the app.
const BE_THRESHOLD = 0.1;
function snapBeRounding(trades, beRound) {
  if (!beRound) return trades;
  return trades.map((t) =>
    t.fixed_r != null && Math.abs(Number(t.fixed_r)) <= BE_THRESHOLD
      ? { ...t, fixed_r: 0 }
      : t);
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Monday-anchored week label for a close Date, e.g. "30 Jun 2026".
function weekKey(d) {
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const monday = new Date(Date.UTC(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - (day === 0 ? 6 : day - 1)
  ));
  return `${monday.getUTCDate()} ${MONTHS[monday.getUTCMonth()]} ${monday.getUTCFullYear()}`;
}

// Win/loss/breakeven for a trade under the display unit + precision setting —
// mirrors the client's tradeOutcome (metrics.js). With breakeven rounding on, a
// trade whose Fixed R is within ±BE_THRESHOLD is breakeven in EVERY unit ($ too),
// though its real $ value is still summed into totals. `field` is the unit's value
// column. Returns 'win' | 'loss' | 'be' | null.
function outcomeOf(t, field, beRound) {
  const v = t[field];
  if (v == null) return null;
  if (beRound && t.fixed_r != null && Math.abs(Number(t.fixed_r)) <= BE_THRESHOLD) return 'be';
  const n = Number(v);
  return n > 0 ? 'win' : n < 0 ? 'loss' : 'be';
}

// performance of an arbitrary subset of trades (trades / strike rate / P&L).
// `field` selects the P&L unit: 'fixed_r' (R) or 'pnl_money' (account currency).
function perf(list, field = 'fixed_r', beRound = false) {
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

// Objective rule adherence: for every trade whose strategy defines rules, decide
// whether it FOLLOWED or BROKE them (see adherence.js), then contrast the two
// sets' performance. `rulesByName` maps strategy name -> its rules array. Returns
// per-strategy rows + an overall followed-vs-broken split, so the app can answer
// "how do I do when I follow my rules vs when I don't?" — the Phase 2 headline.
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

// group trades by a key function -> [{ key, ...perf }] sorted by descending P&L
function groupPerf(list, keyFn, order, field = 'fixed_r', beRound = false) {
  const m = new Map();
  for (const t of list) {
    const k = keyFn(t);
    if (k == null || k === '') continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(t);
  }
  let out = [...m.entries()].map(([key, ts]) => ({ key, ...perf(ts, field, beRound) }));
  if (order) out.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  else out.sort((a, b) => (b.r ?? 0) - (a.r ?? 0));
  return out;
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

// longest run of consecutive wins / losses (breakeven resets both)
function streaks(orderedTrades, field, beRound) {
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

// Build the WHERE clause for a trade query from the scope + global data filters
// (+ an optional year). `scope.filterCol` and the field used for outcome are
// code-controlled; every user-supplied value is parameterized. Returns
// { where, params } with params positioned for the returned placeholders.
export function buildTradeWhere(scope, unit = 'R', filters = {}, year = null, beRound = false) {
  const field = unit === 'USD' ? 'pnl_money' : 'fixed_r';
  const conds = [];
  const params = [];
  const add = (val) => { params.push(val); return `$${params.length}`; };

  if (year != null) conds.push(`EXTRACT(YEAR FROM close_time) = ${add(year)}`);
  if (scope) conds.push(scopeCondition(scope, add));
  if (filters.setups?.length) conds.push(`setup = ANY(${add(filters.setups)})`);
  if (filters.symbols?.length) conds.push(`COALESCE(symbol_base, symbol) = ANY(${add(filters.symbols)})`);
  if (filters.sessions?.length) conds.push(`session = ANY(${add(filters.sessions)})`);
  if (filters.probability?.length) conds.push(`probability = ANY(${add(filters.probability)})`);
  if (filters.from) conds.push(`close_time >= ${add(filters.from)}`);
  if (filters.to) conds.push(`close_time <= ${add(`${filters.to} 23:59:59`)}`);
  if (filters.outcome?.length) {
    // Match the client's tradeOutcome. With breakeven rounding on, a trade whose
    // Fixed R is within ±BE_THRESHOLD is breakeven in EITHER unit ($ too); wins and
    // losses are then the sign of the unit's value AMONG non-rounded trades.
    // (BE_THRESHOLD is a code constant, so it's safe to inline in SQL.)
    const beByR = 'fixed_r IS NOT NULL AND abs(fixed_r) <= ' + BE_THRESHOLD;
    const notBeByR = '(fixed_r IS NULL OR abs(fixed_r) > ' + BE_THRESHOLD + ')';
    const parts = [];
    if (filters.outcome.includes('win')) parts.push(beRound ? `(${field} > 0 AND ${notBeByR})` : `${field} > 0`);
    if (filters.outcome.includes('loss')) parts.push(beRound ? `(${field} < 0 AND ${notBeByR})` : `${field} < 0`);
    if (filters.outcome.includes('be')) parts.push(beRound ? `(${field} IS NOT NULL AND ((${beByR}) OR ${field} = 0))` : `${field} = 0`);
    if (parts.length) conds.push(`(${parts.join(' OR ')})`);
  }
  return { where: conds.length ? `WHERE ${conds.join(' AND ')}` : '', params };
}

// `scope` from resolveScope: god -> user_id = me, an explicit account selection
// -> account_id = ANY(logins). The predicate is built by scopeCondition (safe).
// `filters` are the global data filters (setups/symbols/sessions/probability/
// outcome/date range) applied app-wide.
export async function computeStats(scope, unit = 'R', filters = {}, beRound = false) {
  const field = unit === 'USD' ? 'pnl_money' : 'fixed_r';
  const { where, params } = buildTradeWhere(scope, unit, filters, null, beRound);
  const { rows } = await query(`SELECT * FROM trades ${where} ORDER BY close_time ASC, id ASC`, params);
  const trades = snapBeRounding(rows.map((r) => ({ ...r, close: new Date(r.close_time) })), beRound);
  // Rule adherence uses the user's strategy catalog (rules keyed by name == setup).
  const rulesByName = new Map((await listStrategies(scope.userId)).map((s) => [s.name, s.rules]));
  // P&L-based stats use the selected unit; R-distribution + MFE always use R.
  const scored = trades.filter((t) => t[field] != null);
  const rScored = trades.filter((t) => t.fixed_r != null);

  const base = perf(trades, field, beRound);
  // Win/loss sums exclude breakeven trades (their $ stays in totalReturn, not here).
  const winsR = sum(scored.filter((t) => outcomeOf(t, field, beRound) === 'win').map((t) => Number(t[field])));
  const lossR = sum(scored.filter((t) => outcomeOf(t, field, beRound) === 'loss').map((t) => Number(t[field])));
  const avgWin = base.wins ? round(winsR / base.wins) : null;
  const avgLoss = base.losses ? round(lossR / base.losses) : null;
  const pf = lossR !== 0 ? round(winsR / Math.abs(lossR)) : null;
  const { winStreak, lossStreak } = streaks(scored, field, beRound);

  const headline = {
    unit,
    totalReturn: base.r,
    strikeRate: base.sr,
    trades: base.trades,
    wins: base.wins,
    losses: base.losses,
    breakeven: base.breakeven,
    avgWin,
    avgLoss,
    profitFactor: pf,
    // NOTE: standard expectancy = total / trades. The sheet shows 0.54 via a
    // different range; swap this line once the exact cell formula is confirmed.
    expectancy: base.trades ? round(base.r / base.trades) : null,
    winStreak,
    lossStreak,
  };

  // equity curve (cumulative P&L in the selected unit) over time
  let cum = 0;
  const equityCurve = scored.map((t, i) => {
    cum += Number(t[field]);
    return { i: i + 1, date: t.close_time, cumR: round(cum) };
  });

  // distribution of realized R outcomes
  const buckets = [
    { label: '≤ -1R', test: (r) => r <= -1 },
    { label: '-1–0R', test: (r) => r > -1 && r < 0 },
    { label: 'BE', test: (r) => r === 0 },
    { label: '0–1R', test: (r) => r > 0 && r <= 1 },
    { label: '1–2R', test: (r) => r > 1 && r <= 2 },
    { label: '2–3R', test: (r) => r > 2 && r <= 3 },
    { label: '> 3R', test: (r) => r > 3 },
  ];
  // R-distribution is intrinsically in R, so always compute it from fixed_r.
  const rDistribution = buckets.map((b) => ({
    label: b.label,
    count: rScored.filter((t) => b.test(t.fixed_r)).length,
  }));

  // MFE efficiency — how far trades ran (Max R) vs what was captured. Always in
  // R: Max R is a ratio, and capture only makes sense as realized-R ÷ available-R.
  const rNet = sum(rScored.map((t) => Number(t.fixed_r)));
  const rPerTrade = rScored.length ? rNet / rScored.length : null;
  const withMfe = rScored.filter((t) => t.max_r != null);
  const avgMaxR = withMfe.length ? round(sum(withMfe.map((t) => Number(t.max_r))) / withMfe.length) : null;
  const mfeEfficiency = {
    avgMaxR,
    avgRealized: rPerTrade != null ? round(rPerTrade) : null,
    capture: avgMaxR ? round(rPerTrade / avgMaxR) : null, // realized ÷ available (R)
  };

  return {
    headline,
    // By strategy — data-driven, sorted best-first (by P&L). No hardcoded list,
    // so each user sees their own strategies.
    bySetup: groupPerf(trades, (t) => t.setup, null, field, beRound),
    byInstrument: groupPerf(trades, (t) => t.symbol_base || t.symbol, null, field, beRound),
    byProbability: groupPerf(trades, (t) => t.probability, ['HIGH', 'MED', 'LOW'], field, beRound),
    bySession: groupPerf(trades, (t) => t.session, ['LDN', 'NY', 'ASIA'], field, beRound),
    byDay: groupPerf(trades, (t) => DOW[t.close.getUTCDay()], ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], field, beRound),
    byMonth: groupPerf(trades, (t) => `${MONTHS[t.close.getUTCMonth()]} ${t.close.getUTCFullYear()}`, null, field, beRound),
    byWeek: groupPerf(trades, (t) => weekKey(t.close), null, field, beRound),
    equityCurve,
    rDistribution,
    mfeEfficiency,
    adherence: computeAdherence(trades, rulesByName, field, beRound),
  };
}

// Yearly view: monthly performance (overall + per setup) for one year.
export async function computeYearly(year, scope, unit = 'R', filters = {}, beRound = false) {
  const field = unit === 'USD' ? 'pnl_money' : 'fixed_r';
  const { where, params } = buildTradeWhere(scope, unit, filters, year, beRound);
  const { rows } = await query(
    `SELECT * FROM trades ${where} ORDER BY close_time ASC, id ASC`,
    params
  );
  const trades = snapBeRounding(rows.map((r) => ({ ...r, close: new Date(r.close_time) })), beRound);
  // Strategy columns come from the user's own catalog (ordered), plus any
  // unmanaged setups actually traded — never a hardcoded, single-tenant list.
  const catalog = (await listStrategies(scope.userId)).map((s) => s.name);
  const setups = orderSetups(trades.map((t) => t.setup), catalog);

  const months = MONTHS.map((name, mi) => {
    const inMonth = trades.filter((t) => t.close.getUTCMonth() === mi);
    const row = { month: name, overall: perf(inMonth, field, beRound) };
    for (const s of setups) row[s] = perf(inMonth.filter((t) => t.setup === s), field, beRound);
    return row;
  });

  const total = { month: 'TOTAL', overall: perf(trades, field, beRound) };
  for (const s of setups) total[s] = perf(trades.filter((t) => t.setup === s), field, beRound);

  return { year, setups, unit, months, total };
}
