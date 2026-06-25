// Client-side dashboard metrics, computed in R from the raw trade list.
// Every P&L figure on the dashboard + calendar is in R multiples (fixed_r),
// not account currency — pnl_money is no longer used here.

export const ACCOUNT_START = 50000; // GoatFundedTrader prop account size (display only)

const sum = (arr) => arr.reduce((a, b) => a + b, 0);
const round = (n, dp = 2) => (n == null || Number.isNaN(n) ? 0 : Math.round(n * 10 ** dp) / 10 ** dp);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// local Y-M-D key for a trade's close time (calendar/day grouping)
export function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Monday-anchored week start for a date
export function weekStart(d) {
  const day = d.getDay(); // 0=Sun..6=Sat
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (day === 0 ? 6 : day - 1));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

// R sign classification of a trade (fixed_r is the realized result in R)
const rval = (t) => Number(t.fixed_r ?? 0);
const isWin = (t) => rval(t) > 0;
const isLoss = (t) => rval(t) < 0;

export function computeMetrics(trades) {
  // only trades with a realized R result participate in stats
  const ts = trades
    .filter((t) => t.fixed_r != null)
    .map((t) => ({ ...t, _pnl: rval(t), _close: new Date(t.close_time) }))
    .sort((a, b) => a._close - b._close);

  const wins = ts.filter(isWin);
  const losses = ts.filter(isLoss);
  const grossProfit = sum(wins.map((t) => t._pnl));
  const grossLoss = Math.abs(sum(losses.map((t) => t._pnl)));
  const net = sum(ts.map((t) => t._pnl));

  const decided = wins.length + losses.length;
  const winRate = decided ? (100 * wins.length) / decided : 0;
  const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? 999 : 0) : grossProfit / grossLoss;
  const avgWin = wins.length ? grossProfit / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const avgWinLoss = avgLoss === 0 ? (avgWin > 0 ? Infinity : 0) : avgWin / avgLoss;

  // streaks (current = trailing run; best = longest win run)
  let curWin = 0, curLoss = 0, bestWin = 0, bestLoss = 0;
  for (const t of ts) {
    if (isWin(t)) { curWin = curWin >= 0 ? curWin + 1 : 1; curLoss = 0; }
    else if (isLoss(t)) { curLoss = curLoss >= 0 ? curLoss + 1 : 1; curWin = 0; }
    else { curWin = 0; curLoss = 0; }
    bestWin = Math.max(bestWin, curWin);
    bestLoss = Math.max(bestLoss, curLoss);
  }
  const trailingWin = (() => {
    let n = 0;
    for (let i = ts.length - 1; i >= 0; i--) { if (isWin(ts[i])) n++; else break; }
    return n;
  })();
  const trailingLoss = (() => {
    let n = 0;
    for (let i = ts.length - 1; i >= 0; i--) { if (isLoss(ts[i])) n++; else break; }
    return n;
  })();

  // cumulative equity curve (one point per trade, in $)
  let cum = 0;
  const cumulative = ts.map((t, i) => {
    cum += t._pnl;
    return { i: i + 1, date: t._close, label: `${t._close.getDate()} ${MONTHS[t._close.getMonth()]}`, cum: round(cum) };
  });

  // max drawdown on the equity curve (for recovery factor)
  let peak = 0, maxDD = 0;
  for (const p of cumulative) { peak = Math.max(peak, p.cum); maxDD = Math.max(maxDD, peak - p.cum); }
  const recoveryFactor = maxDD === 0 ? (net > 0 ? 5 : 0) : net / maxDD;

  // per-day aggregation (calendar + daily bars)
  const byDay = new Map();
  for (const t of ts) {
    const k = dayKey(t._close);
    if (!byDay.has(k)) byDay.set(k, { key: k, date: t._close, pnl: 0, trades: 0 });
    const d = byDay.get(k);
    d.pnl += t._pnl;
    d.trades += 1;
  }
  const days = [...byDay.values()].sort((a, b) => a.date - b.date);
  const daily = days.map((d) => ({ label: `${d.date.getDate()} ${MONTHS[d.date.getMonth()]}`, pnl: round(d.pnl), date: d.date }));

  // average reward — mean Max R achieved (excursion captured)
  const withR = ts.filter((t) => t.max_r != null);
  const avgRR = withR.length ? sum(withR.map((t) => Number(t.max_r))) / withR.length : 0;

  // Thunder Score — 0..100 composite across six normalized axes
  const axes = thunderAxes({ winRate, profitFactor, avgWinLoss, ts, recoveryFactor, avgRR });
  const thunder = Math.round(sum(axes.map((a) => a.value)) / axes.length);

  return {
    net: round(net),                                   // total R
    expectancy: ts.length ? round(net / ts.length) : 0, // R per trade
    totalR: round(net),
    tradeCount: ts.length,
    wins: wins.length,
    losses: losses.length,
    winRate: round(winRate, 1),
    profitFactor: round(profitFactor),
    avgWin: round(avgWin),
    avgLoss: round(avgLoss),
    avgWinLoss,
    grossProfit: round(grossProfit),
    grossLoss: round(grossLoss),
    streak: { current: trailingWin > 0 ? trailingWin : -trailingLoss, bestWin, bestLoss },
    cumulative,
    daily,
    days,
    avgRR: round(avgRR),
    thunder,
    thunderAxes: axes,
  };
}

// Each axis maps a raw metric onto 0..100. Empty/early datasets land high so a
// clean, winning record reads as a strong score (matches the reference 93).
function thunderAxes({ winRate, profitFactor, avgWinLoss, ts, recoveryFactor, avgRR }) {
  const ratio = avgWinLoss === Infinity ? 3 : avgWinLoss; // cap ∞ at the top of the band
  // consistency: lower spread of per-trade $ results scores higher
  const pnls = ts.map((t) => t._pnl);
  const mean = pnls.length ? sum(pnls) / pnls.length : 0;
  const variance = pnls.length ? sum(pnls.map((p) => (p - mean) ** 2)) / pnls.length : 0;
  const cv = mean !== 0 ? Math.sqrt(variance) / Math.abs(mean) : 0;
  const consistency = pnls.length <= 1 ? 90 : clamp(100 - cv * 50, 0, 100);

  return [
    { key: 'Win %', value: clamp(winRate, 0, 100) },
    { key: 'PF', value: clamp((profitFactor / 3) * 100, 0, 100) },
    { key: 'AVG W/L', value: clamp((ratio / 3) * 100, 0, 100) },
    { key: 'Avg RR', value: clamp((avgRR / 3) * 100, 0, 100) },
    { key: 'Consist.', value: round(consistency) },
    { key: 'Recovery', value: clamp((recoveryFactor / 5) * 100, 0, 100) },
  ];
}

// R formatters — the dashboard/calendar P&L unit is R, not currency.
export function fmtR(n, { sign = true } = {}) {
  if (n === Infinity) return '∞';
  const v = Number(n || 0);
  const s = `${Math.abs(v).toFixed(2)}R`;
  if (v < 0) return `-${s}`;
  return sign && v > 0 ? `+${s}` : s;
}

// compact R (one decimal, dropped when whole) for tight cells like the calendar
export function fmtRShort(n) {
  if (n === Infinity) return '∞';
  const v = Number(n || 0);
  const abs = Math.abs(v);
  const s = `${(abs % 1 === 0 ? abs.toFixed(0) : abs.toFixed(1))}R`;
  if (v < 0) return `-${s}`;
  return v > 0 ? `+${s}` : s;
}

// $ formatter retained only for the static prop-account size in the sidebar.
export function fmtMoney(n) {
  const v = Number(n || 0);
  return `$${v.toLocaleString('en-US')}`;
}
