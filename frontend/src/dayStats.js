// Per-DAY aggregation for the Daily Journal.
//
// Plain JS with no React in it, so the numbers on that page are unit-testable
// rather than only inspectable by eye — every figure a day card shows comes from
// here. Values follow the display unit (R or $) like the rest of the app, via
// valueField, and win/loss/breakeven uses the same precision-aware tradeOutcome
// the trade log and the KPI cards use, so a day can't disagree with them.
import { dayKey, valueField, tradeOutcome } from './metrics.js';

const round2 = (n) => Math.round(n * 100) / 100;

// Minutes held. Null when either timestamp is missing or unparseable, so it's
// excluded from the average rather than counted as a zero-length trade.
export function holdMinutes(t) {
  const open = Date.parse(t?.open_time);
  const close = Date.parse(t?.close_time);
  if (!Number.isFinite(open) || !Number.isFinite(close)) return null;
  const mins = (close - open) / 60000;
  return mins >= 0 ? mins : null;
}

// "0m" / "45m" / "2h 15m" — the same shape as the trade log's duration column.
export function fmtMins(mins) {
  if (mins == null || !Number.isFinite(mins)) return '—';
  const m = Math.round(mins);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60), rem = m % 60;
  if (h < 24) return rem ? `${h}h ${rem}m` : `${h}h`;
  const d = Math.floor(h / 24), rh = h % 24;
  return rh ? `${d}d ${rh}h` : `${d}d`;
}

// Everything one day card renders, for one day's trades (already filtered to that
// day and sorted by close time).
export function summarizeDay(list = [], unit = 'R', beRounding = false) {
  const field = valueField(unit);
  const scored = list.filter((t) => t[field] != null);
  const vals = scored.map((t) => Number(t[field]));

  const outcomes = scored.map((t) => tradeOutcome(t, unit, beRounding));
  const winners = outcomes.filter((o) => o === 'win').length;
  const losers = outcomes.filter((o) => o === 'loss').length;
  const breakeven = outcomes.filter((o) => o === 'be').length;
  // Win rate over DECIDED trades — breakeven is neither a win nor a loss, and
  // counting it in the denominator would quietly drag the rate down. Matches
  // computeMetrics' definition so the day agrees with the dashboard.
  const decided = winners + losers;

  const durations = list.map(holdMinutes).filter((m) => m != null);
  const lots = list.reduce((a, t) => a + (Number(t.volume) || 0), 0);

  // Cumulative P&L through the day, one point per trade plus a zero start, which
  // is what makes the chart read as a curve from flat rather than from the first
  // trade's result.
  let running = 0;
  const curve = [{ at: null, cum: 0 }, ...scored.map((t) => {
    running += Number(t[field]);
    return { at: t.close_time, cum: round2(running) };
  })];

  return {
    trades: list.length,
    scored: scored.length,
    net: round2(vals.reduce((a, b) => a + b, 0)),
    winners,
    losers,
    breakeven,
    winRate: decided ? round2((100 * winners) / decided) : null,
    lots: round2(lots),
    avgDuration: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
    best: vals.length ? Math.max(...vals) : null,
    worst: vals.length ? Math.min(...vals) : null,
    notes: list.filter((t) => (t.comments || '').trim()).length,
    curve,
  };
}

// The days to render, most recent first — a journal reads newest-first, and the
// day you want to review is almost always the one that just finished.
// Days with no scorable trade are left out: a card of dashes isn't a day's review.
export function groupByDay(trades = [], unit = 'R', beRounding = false) {
  const field = valueField(unit);
  const byDay = new Map();
  for (const t of trades) {
    if (t[field] == null || !t.close_time) continue;
    const key = dayKey(new Date(t.close_time));
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(t);
  }
  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, list]) => {
      const sorted = [...list].sort((a, b) => new Date(a.close_time) - new Date(b.close_time));
      return { key, trades: sorted, stats: summarizeDay(sorted, unit, beRounding) };
    });
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "Friday, 24 Jul 2026" — the card's own title, since a journal entry is a date.
export function dayTitle(key) {
  const d = new Date(`${key}T00:00:00`);
  if (Number.isNaN(d.getTime())) return key || '';
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// "Today" / "Yesterday" for the two days that have a name, else null. Shown beside
// the date so the newest card is identifiable at a glance.
export function dayRelative(key, now = new Date()) {
  const today = dayKey(now);
  if (key === today) return 'Today';
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  return key === dayKey(y) ? 'Yesterday' : null;
}

// Overall totals across every day on the page — the "Summary" strip. Derived from
// the same per-day summaries so the strip can't disagree with the cards under it.
export function summarizeAll(days = []) {
  const net = days.reduce((a, d) => a + d.stats.net, 0);
  const winners = days.reduce((a, d) => a + d.stats.winners, 0);
  const losers = days.reduce((a, d) => a + d.stats.losers, 0);
  const decided = winners + losers;
  const green = days.filter((d) => d.stats.net > 0).length;
  return {
    days: days.length,
    trades: days.reduce((a, d) => a + d.stats.trades, 0),
    net: round2(net),
    winners,
    losers,
    winRate: decided ? round2((100 * winners) / decided) : null,
    greenDays: green,
    // Share of days that closed positive — the day-level twin of win rate.
    dayWinRate: days.length ? round2((100 * green) / days.length) : null,
    journaled: days.reduce((a, d) => a + d.stats.notes, 0),
  };
}
