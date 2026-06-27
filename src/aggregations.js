import { query } from './db.js';

// All dashboard analytics are computed in JS over the full trade set — simplest
// and most flexible for a personal journal, and lets us match the sheet exactly.

const round = (n, dp = 2) => (n == null || Number.isNaN(n) ? null : Math.round(n * 10 ** dp) / 10 ** dp);
const sum = (arr) => arr.reduce((a, b) => a + b, 0);
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

// performance of an arbitrary subset of trades (trades / strike rate / P&L).
// `field` selects the P&L unit: 'fixed_r' (R) or 'pnl_money' (account currency).
function perf(list, field = 'fixed_r') {
  const scored = list.filter((t) => t[field] != null);
  const wins = scored.filter((t) => t[field] > 0);
  const losses = scored.filter((t) => t[field] < 0);
  const r = sum(scored.map((t) => Number(t[field])));
  return {
    trades: scored.length,
    wins: wins.length,
    losses: losses.length,
    breakeven: scored.filter((t) => Number(t[field]) === 0).length,
    sr: scored.length ? round((100 * wins.length) / scored.length) : null, // wins / all trades
    r: round(r),
  };
}

// group trades by a key function -> [{ key, ...perf }] sorted by descending P&L
function groupPerf(list, keyFn, order, field = 'fixed_r') {
  const m = new Map();
  for (const t of list) {
    const k = keyFn(t);
    if (k == null || k === '') continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(t);
  }
  let out = [...m.entries()].map(([key, ts]) => ({ key, ...perf(ts, field) }));
  if (order) out.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  else out.sort((a, b) => (b.r ?? 0) - (a.r ?? 0));
  return out;
}

// longest run of consecutive wins / losses (breakeven resets both)
function streaks(scoredOrdered) {
  let win = 0, loss = 0, maxWin = 0, maxLoss = 0;
  for (const t of scoredOrdered) {
    if (t.fixed_r > 0) { win++; loss = 0; }
    else if (t.fixed_r < 0) { loss++; win = 0; }
    else { win = 0; loss = 0; }
    maxWin = Math.max(maxWin, win);
    maxLoss = Math.max(maxLoss, loss);
  }
  return { winStreak: maxWin, lossStreak: maxLoss };
}

// `accountIds` scopes the stats to one user's accounts (array of MT5 logins).
// An empty array => no trades (a user with no accounts); undefined => unscoped.
export async function computeStats(accountIds, unit = 'R') {
  const field = unit === 'USD' ? 'pnl_money' : 'fixed_r';
  const where = accountIds ? 'WHERE account_id = ANY($1)' : '';
  const params = accountIds ? [accountIds] : [];
  const { rows } = await query(`SELECT * FROM trades ${where} ORDER BY close_time ASC, id ASC`, params);
  const trades = rows.map((r) => ({ ...r, close: new Date(r.close_time) }));
  // P&L-based stats use the selected unit; R-distribution + MFE always use R.
  const scored = trades.filter((t) => t[field] != null);
  const rScored = trades.filter((t) => t.fixed_r != null);

  const base = perf(trades, field);
  const winsR = sum(scored.filter((t) => t[field] > 0).map((t) => Number(t[field])));
  const lossR = sum(scored.filter((t) => t[field] < 0).map((t) => Number(t[field])));
  const avgWin = base.wins ? round(winsR / base.wins) : null;
  const avgLoss = base.losses ? round(lossR / base.losses) : null;
  const pf = lossR !== 0 ? round(winsR / Math.abs(lossR)) : null;
  const { winStreak, lossStreak } = streaks(scored.map((t) => ({ fixed_r: Number(t[field]) })));

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
    bySetup: groupPerf(trades, (t) => t.setup, ['Continue', 'Liq-run', 'Fractal', 'SMC'], field),
    byInstrument: groupPerf(trades, (t) => t.symbol_base || t.symbol, null, field),
    byProbability: groupPerf(trades, (t) => t.probability, ['HIGH', 'MED', 'LOW'], field),
    bySession: groupPerf(trades, (t) => t.session, ['LDN', 'NY', 'ASIA'], field),
    byDay: groupPerf(trades, (t) => DOW[t.close.getUTCDay()], ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], field),
    byMonth: groupPerf(trades, (t) => `${MONTHS[t.close.getUTCMonth()]} ${t.close.getUTCFullYear()}`, null, field),
    byWeek: groupPerf(trades, (t) => weekKey(t.close), null, field),
    equityCurve,
    rDistribution,
    mfeEfficiency,
  };
}

// Yearly view: monthly performance (overall + per setup) for one year.
export async function computeYearly(year, accountIds, unit = 'R') {
  const field = unit === 'USD' ? 'pnl_money' : 'fixed_r';
  const params = [year];
  let extra = '';
  if (accountIds) {
    params.push(accountIds);
    extra = `AND account_id = ANY($${params.length})`;
  }
  const { rows } = await query(
    `SELECT * FROM trades WHERE EXTRACT(YEAR FROM close_time) = $1 ${extra} ORDER BY close_time ASC, id ASC`,
    params
  );
  const trades = rows.map((r) => ({ ...r, close: new Date(r.close_time) }));
  const setups = ['Continue', 'Liq-run', 'Fractal', 'SMC'];

  const months = MONTHS.map((name, mi) => {
    const inMonth = trades.filter((t) => t.close.getUTCMonth() === mi);
    const row = { month: name, overall: perf(inMonth, field) };
    for (const s of setups) row[s] = perf(inMonth.filter((t) => t.setup === s), field);
    return row;
  });

  const total = { month: 'TOTAL', overall: perf(trades, field) };
  for (const s of setups) total[s] = perf(trades.filter((t) => t.setup === s), field);

  return { year, setups, unit, months, total };
}
