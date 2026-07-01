// Client-side dashboard metrics. The P&L unit is selectable:
//   'R'   (god / all-accounts view)  -> uses fixed_r   (risk multiples)
//   'USD' (single-account view)      -> uses pnl_money (account currency)
// Win/loss classification follows the chosen value's sign. Reward (Avg RR / Max
// R) is always a ratio in R regardless of unit.

export const ACCOUNT_START = 50000; // GoatFundedTrader prop account size (display only)

// the trade P&L field for a given display unit
export const valueField = (unit) => (unit === 'USD' ? 'pnl_money' : 'fixed_r');

// Precision control (Trade Settings): when breakeven rounding is on, any trade
// whose Fixed R sits within ±BE_THRESHOLD of zero is treated as an exact
// breakeven (0R). We snap the source fixed_r so EVERY downstream analysis —
// win/loss classification, R sums, streaks, distributions, the calendar — agrees.
// Only fixed_r is touched (pnl_money and Max R are left as-is). The server mirrors
// this in aggregations.js for the Analytics/Yearly stats.
export const BE_THRESHOLD = 0.1;
export function applyBeRounding(trades, on = false) {
  if (!on) return trades;
  return trades.map((t) =>
    t.fixed_r != null && Math.abs(Number(t.fixed_r)) <= BE_THRESHOLD
      ? { ...t, fixed_r: 0 }
      : t);
}

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

export function computeMetrics(trades, unit = 'R') {
  // P&L comes from fixed_r (R) or pnl_money (USD) depending on the view.
  const field = valueField(unit);
  const isWin = (t) => t._pnl > 0;
  const isLoss = (t) => t._pnl < 0;

  // only trades with a realized result in the chosen unit participate
  const ts = trades
    .filter((t) => t[field] != null)
    .map((t) => ({ ...t, _pnl: Number(t[field]), _close: new Date(t.close_time) }))
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

// Prop-firm account metrics in account currency ($), derived from realized
// pnl_money + the account's starting balance. Used by the single-account
// dashboard (drawdown / profit-target trackers + a balance-based equity curve).
export function computeProp(trades, account) {
  const start = Number(account?.start_balance) || ACCOUNT_START;
  const dailyPct = Number(account?.daily_dd_pct) || 0;
  const maxPct = Number(account?.max_dd_pct) || 0;
  const targetPct = Number(account?.profit_target_pct) || 0;

  const ts = trades
    .filter((t) => t.pnl_money != null)
    .map((t) => ({ pnl: Number(t.pnl_money), close: new Date(t.close_time) }))
    .sort((a, b) => a.close - b.close);

  const todayKey = dayKey(new Date());
  let equity = start, peak = start, maxDD = 0;
  let dayStart = null, dailyLow = Infinity; // for today's drawdown
  const curve = [{ label: 'Start', equity: round(start), date: ts[0]?.close ?? new Date() }];
  for (const t of ts) {
    if (dayKey(t.close) === todayKey && dayStart == null) dayStart = equity;
    equity += t.pnl;
    peak = Math.max(peak, equity);
    maxDD = Math.max(maxDD, peak - equity);
    if (dayKey(t.close) === todayKey) dailyLow = Math.min(dailyLow, equity);
    curve.push({ label: `${t.close.getDate()} ${MONTHS[t.close.getMonth()]}`, equity: round(equity), date: t.close });
  }
  const netPnl = equity - start;
  const dailyDD = dayStart == null ? 0 : Math.max(0, dayStart - dailyLow);
  const live = account?.balance != null;
  const currentBalance = live ? Number(account.balance) : equity;
  // The balance the current trading day opened at (drives the daily-loss floor).
  const dayStartBalance = dayStart != null ? dayStart : currentBalance;

  // Limits in $ (derived from the % rules + start balance).
  const dailyLimit = (dailyPct / 100) * start;
  const maxLimit = (maxPct / 100) * start;
  const target = (targetPct / 100) * start;

  // Equity floors for the chart: breaching either = a blown account. Max loss is
  // an absolute floor off the start balance; daily loss resets to today's open.
  const maxLossFloor = start - maxLimit;
  const dailyLossFloor = dayStartBalance - dailyLimit;

  return {
    start,
    live,
    currentBalance: round(currentBalance),
    netPnl: round(netPnl),
    curve,
    isEval: (account?.account_type || 'eval') === 'eval',
    daily: { used: round(dailyDD), limit: round(dailyLimit), pct: dailyPct, floor: round(dailyLossFloor) },
    max: { used: round(maxDD), limit: round(maxLimit), pct: maxPct, floor: round(maxLossFloor) },
    target: { reached: round(Math.max(0, netPnl)), goal: round(target), pct: targetPct },
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

// $ formatter. `sign` adds +/- (for P&L); without it, plain currency (balance).
export function fmtMoney(n, { sign = false } = {}) {
  const v = Number(n || 0);
  const s = `$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  if (v < 0) return `-${s}`;
  return sign && v > 0 ? `+${s}` : s;
}

// compact signed money for tight cells (e.g. +$120, -$1.2k)
export function fmtMoneyShort(n) {
  const v = Number(n || 0);
  const a = Math.abs(v);
  const s = a >= 1000 ? `$${(a / 1000).toFixed(a % 1000 === 0 ? 0 : 1)}k` : `$${a.toFixed(0)}`;
  if (v < 0) return `-${s}`;
  return v > 0 ? `+${s}` : s;
}

// Unit-aware dispatchers: pick R or $ formatting based on the active view.
export function fmtVal(n, unit, opts) {
  return unit === 'USD' ? fmtMoney(n, { sign: true, ...opts }) : fmtR(n, opts);
}
export function fmtValShort(n, unit) {
  return unit === 'USD' ? fmtMoneyShort(n) : fmtRShort(n);
}
// chart axis tick label
export function fmtAxis(v, unit) {
  return unit === 'USD' ? `$${v}` : `${v}R`;
}
