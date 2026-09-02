// Prop Engine — the computation core of Module B ("how are my prop accounts
// performing against the firm's rules?"). Pure functions over a challenge's rule
// snapshot + the account's trades / payouts / equity, mirroring derive.js: NO DB
// access here (server.js fetches and calls in), so every rule is deterministic and
// unit-testable. All money is in account currency ($) — per-account, per our
// convention (god-view R lives in aggregations.js).
//
// RULES ARE DATA, NEVER CODE: the engine reads dd_type / *_pct / min_trading_days
// off the challenge and has zero firm-specific branches. Supporting a new prop firm
// is always a data change.

const num = (v) => (v == null ? null : Number(v));
const round2 = (n) => (n == null || Number.isNaN(n) ? null : Math.round(n * 100) / 100);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// A "day" for daily-drawdown / trading-day purposes. Prop firms reset daily at
// their broker-server midnight, not UTC — `offsetMin` shifts the clock so this can
// track server time later; default 0 = UTC. Returns 'YYYY-MM-DD'.
export function dayKey(date, offsetMin = 0) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const shifted = new Date(d.getTime() + offsetMin * 60_000);
  return shifted.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Equity series — the spine the drawdown math runs on. Two sources:
//   • EA-fed equity_snapshots  -> true FLOATING equity (accurate to how firms
//     actually enforce drawdown).
//   • synthesized from closed trades -> REALIZED equity, a step function that
//     only moves at trade close (works today + for manual/CSV accounts).
// Both yield an ascending [{ ts:Date, equity:Number }] array starting at the
// challenge baseline. Payouts (withdrawals) are intentionally NOT applied here —
// drawdown is measured on trading performance from the baseline; withdrawals are
// tracked separately (payouts table) and would otherwise false-trigger a breach.
// ---------------------------------------------------------------------------

export function synthesizeEquity(startBalance, trades, startDate) {
  const base = num(startBalance);
  if (base == null) return [];
  const sorted = [...trades]
    .filter((t) => t.close_time != null && t.pnl_money != null)
    .sort((a, b) => new Date(a.close_time) - new Date(b.close_time));

  /* THE BASELINE MUST SIT AT OR BEFORE THE FIRST TRADE, and it did not.
   *
   * `challenges.start_date` DEFAULTS TO now() at insert (migration 0016) and is never
   * written explicitly, so it records when the account was ADDED TO PROPVEXIS. Stamping
   * the baseline point with it put the opening equity AFTER every backdated trade, and
   * the series this function promises to return ascending came back out of order.
   *
   * WHAT THAT BROKE, and it is the worst possible thing to get wrong: dailyDrawdown()
   * walks this series in ARRAY order and opens a day's bucket at the first point it
   * sees for that day. A baseline stamped today therefore opened TODAY'S bucket at the
   * full starting balance, and the last trade's equity — the bottom of the account's
   * whole history — became today's low. A trader who lost $200 today on an account
   * $2,100 down overall was shown $2,100 of daily drawdown, 100% of a $1,250 limit, and
   * a breach banner for a limit they had not touched. The engine then settles the
   * challenge on that flag.
   *
   * `maxDrawdown` was misread the same way for a TRAILING account, where the peak is
   * tracked by walking the series forward; a series that jumps backwards in time tracks
   * a peak that never existed.
   *
   * So the anchor is the EARLIER of the recorded start and the first trade. Same root
   * defect as the trading-day count (see tradingDaysState) and the same shape of fix:
   * the recorded start is trusted only where it cannot contradict the account's own
   * history. */
  const firstClose = sorted.length ? new Date(sorted[0].close_time) : null;
  const recorded = startDate ? new Date(startDate) : null;
  const valid = (d) => d && !Number.isNaN(d.getTime());
  const anchor = valid(recorded)
    ? (valid(firstClose) && firstClose < recorded ? firstClose : recorded)
    : (valid(firstClose) ? firstClose : new Date());

  const series = [{ ts: anchor, equity: base }];
  let eq = base;
  for (const t of sorted) {
    eq += Number(t.pnl_money);
    series.push({ ts: new Date(t.close_time), equity: round2(eq) });
  }
  return series;
}

export function snapshotEquity(snapshots) {
  return [...snapshots]
    .filter((s) => s.ts != null && s.equity != null)
    .sort((a, b) => new Date(a.ts) - new Date(b.ts))
    .map((s) => ({ ts: new Date(s.ts), equity: Number(s.equity) }));
}

// Prefer real floating equity when the EA has fed enough snapshots; otherwise fall
// back to the realized series. Returns { series, mode } where mode is 'live' |
// 'realized' so the UI can label the accuracy.
export function buildEquitySeries({ startBalance, trades = [], snapshots = [], startDate }) {
  const snap = snapshotEquity(snapshots);
  if (snap.length >= 2) return { series: snap, mode: 'live' };
  return { series: synthesizeEquity(startBalance, trades, startDate), mode: 'realized' };
}

// Latest equity we know about: an explicit live figure wins, else the series tail,
// else the baseline.
function currentEquityOf(series, startBalance, live) {
  if (live != null && !Number.isNaN(Number(live))) return Number(live);
  if (series.length) return series[series.length - 1].equity;
  return num(startBalance);
}

// ---------------------------------------------------------------------------
// Max (overall) drawdown.
//   static  : floor is FIXED at startBalance − maxDd$.  Breach if equity ever ≤ floor.
//   trailing: floor TRAILS the running peak by maxDd$ (fixed-$ trail, the common
//             model).  Breach if equity ever < that moving floor.
// Reports the CURRENT floor + room (from current equity) and whether the series
// EVER breached (from its low / trailing violation).
// ---------------------------------------------------------------------------
export function maxDrawdown(challenge, series, currentEquity) {
  const base = num(challenge.start_balance);
  const pct = num(challenge.max_dd_pct);
  if (base == null || pct == null) return null;
  const ddAmount = round2((base * pct) / 100);
  const trailing = challenge.dd_type === 'trailing';

  let floor;
  let breached = false;
  if (trailing) {
    // Peak-following floor; a violation at any point is a permanent breach.
    let peak = series.length ? series[0].equity : base;
    peak = Math.max(peak, base);
    for (const p of series) {
      peak = Math.max(peak, p.equity);
      if (p.equity < round2(peak - ddAmount)) breached = true;
    }
    floor = round2(peak - ddAmount);
  } else {
    floor = round2(base - ddAmount);
    for (const p of series) if (p.equity <= floor) breached = true;
  }

  const roomLeft = round2(currentEquity - floor);
  // Fraction of the drawdown band still intact (1 at baseline/peak, 0 at floor).
  const fracRemaining = clamp01(roomLeft / ddAmount);
  return { type: trailing ? 'trailing' : 'static', limit: ddAmount, floor, roomLeft, fracRemaining, breached };
}

// ---------------------------------------------------------------------------
// Daily drawdown — you can't lose more than dailyDd$ (a % of the baseline, the
// firm's standard) measured from the day's OPENING equity. For the current day we
// report room from the day's low so far; we also scan every day for a historical
// breach. Day boundaries via dayKey(offsetMin).
// ---------------------------------------------------------------------------
export function dailyDrawdown(challenge, series, asOf, offsetMin = 0) {
  const base = num(challenge.start_balance);
  const pct = num(challenge.daily_dd_pct);
  if (base == null || pct == null) return null;
  const limit = round2((base * pct) / 100);
  const today = dayKey(asOf, offsetMin);

  // Opening equity of a day = equity carried in from the prior point. Walk the
  // series tracking each day's open + intraday low.
  const days = new Map(); // key -> { open, low }
  let prevEquity = series.length ? series[0].equity : base;
  for (const p of series) {
    const k = dayKey(p.ts, offsetMin);
    if (!days.has(k)) days.set(k, { open: prevEquity, low: p.equity });
    const d = days.get(k);
    d.low = Math.min(d.low, p.equity);
    prevEquity = p.equity;
  }

  let breached = false;
  for (const { open, low } of days.values()) {
    if (round2(open - low) > limit) breached = true;
  }

  const td = days.get(today);
  const usedToday = td ? Math.max(0, round2(td.open - td.low)) : 0;
  const roomLeft = round2(limit - usedToday);
  const fracRemaining = clamp01(roomLeft / limit);
  return { limit, usedToday, roomLeft, fracRemaining, breached, day: today };
}

// ---------------------------------------------------------------------------
// Trading days. Distinct days that have ≥1 trade within the current CYCLE. For
// funded accounts with min_days_reset_on_payout, the cycle restarts at the last
// payout, so the counter resets after every withdrawal.
//
// THE CYCLE IS BOUNDED IN DAYS, AND ONLY BY A REAL BOUNDARY. Two bugs lived in the
// instant-precise `start_date` bound this replaces, and both silently under-counted
// the one figure a firm uses to decide whether a trader may be paid.
//
//   1. `challenges.start_date` DEFAULTS TO now() AT INSERT (migration 0016) and is
//      never written explicitly — so it records when the account was ADDED TO
//      PROPVEXIS, not when the phase began at the firm. A trader who has been
//      trading for a week before signing up had that whole week dropped. Worse, a
//      trade closed EARLIER ON THE SAME DAY the account was added was dropped too,
//      so the count could read 0 on a day the trader had visibly traded.
//
//      So the recorded start bounds the cycle only when it is the account's SECOND
//      or later challenge (`first_on_account === false`) — i.e. a genuine phase
//      boundary written by /api/prop/advance. For the account's first challenge
//      there is nothing before it to separate from, and the whole of that account's
//      history is the cycle. That also puts this in step with the drawdown math,
//      which has always counted EVERY trade on the account: a trade that can breach
//      the account but cannot count as a trading day is the engine contradicting
//      itself about which trades belong to this challenge.
//
//   2. A boundary is compared BY DAY, through the same dayKey() clock the count
//      itself uses. A cycle measured in days cannot be opened halfway through one:
//      the day a phase starts, or a payout lands, is a trading day if it was traded.
//
// `cycleStart` still reports the cycle's anchor for consumers that schedule from it
// (upcomingPayouts anchors a funded payout cycle on it); `countFrom` is the bound
// actually applied here, and is null when the whole history counts.
// ---------------------------------------------------------------------------
// WHERE THIS CHALLENGE'S CYCLE STARTS — the one answer, shared. Two rules are
// measured over it (trading days below, the consistency rule further down), and an
// engine that computed the window twice would eventually be asked why a trader's
// best day counts toward consistency on a day that does not count as a trading day.
// Returns null when the whole of the account's history is the cycle.
//
// THE PAYOUT RESET APPLIES TO BOTH, off the same `min_days_reset_on_payout` flag
// despite its name. What that flag actually records is that the FIRM'S CYCLE closes
// at a payout, and a withdrawal is exactly what makes the profit before it no longer
// the profit being gated: consistency asks what share of the money now waiting to be
// paid out came from one day. Honouring the reset for the day count and ignoring it
// for the profit window would give one engine two definitions of "this cycle".
export function cycleBound(challenge, payouts, asOf) {
  const start = challenge.first_on_account === false && challenge.start_date
    ? new Date(challenge.start_date)
    : null;

  let countFrom = start && !Number.isNaN(start.getTime()) ? start : null;
  if (challenge.min_days_reset_on_payout && payouts?.length) {
    const last = payouts
      .map((p) => new Date(p.payout_date))
      .filter((d) => !Number.isNaN(d.getTime()) && d <= new Date(asOf))
      .sort((a, b) => b - a)[0];
    if (last && (!countFrom || last > countFrom)) countFrom = last;
  }
  return countFrom;
}

export function tradingDaysState(challenge, trades, payouts, asOf, offsetMin = 0) {
  const required = challenge.min_trading_days ?? 0;
  const countFrom = cycleBound(challenge, payouts, asOf);
  const fromDay = countFrom ? dayKey(countFrom, offsetMin) : null;
  const asOfDay = dayKey(asOf, offsetMin);

  const seen = new Set();
  for (const t of trades) {
    if (t.close_time == null) continue;
    const day = dayKey(t.close_time, offsetMin);
    if (day == null) continue;
    if (fromDay && day < fromDay) continue;
    if (asOfDay && day > asOfDay) continue;
    seen.add(day);
  }
  const completed = seen.size;
  const anchor = countFrom ?? (challenge.start_date ? new Date(challenge.start_date) : null);
  return {
    required,
    completed,
    remaining: Math.max(0, required - completed),
    met: completed >= required,
    countFrom: countFrom ? countFrom.toISOString() : null,
    cycleStart: anchor && !Number.isNaN(anchor.getTime()) ? anchor.toISOString() : null,
  };
}

// ---------------------------------------------------------------------------
// THE CONSISTENCY RULE — how much of the trader's total profit came from their
// single best day, against the cap the firm allows. Null when the account carries
// no such rule, which is the majority of accounts (challenge.consistency_pct is
// NULL by default; see migration 0032).
//
// THE FORMULA IS THE INDUSTRY'S, and there is only one: best day / total profit
// <= cap. A 30% rule with $3,000 accumulated means no day may hold more than $900
// of it. Caps run 15%-50% in the wild.
//
// IT GATES A PAYOUT, IT DOES NOT BREACH AN ACCOUNT. That is why this returns a
// state and never touches `breach` or healthScore: every firm we surveyed treats
// an oversized day as a DELAY — the payout waits while further trading dilutes that
// day's share, and nothing is lost. A trader whose best day is 60% of profit is
// early, not out, and an engine that scored them as failing would be lying about
// the one number they can still fix by trading normally.
//
// WHY IT CANNOT BE ANSWERED BY DIVIDING TWO NUMBERS THE CARD ALREADY HAS: the
// equity series is a running total, and this rule needs profit BUCKETED BY DAY
// through the same dayKey() clock the daily drawdown and the trading-day count use.
// One clock, or a trader's best day lands in a different day here than it does in
// the meter above it.
//
// REALIZED P&L, from closed trades — not the equity series. The series can be
// floating (EA snapshots), and a firm computes this off closed daily P&L; an
// unrealized spike on a still-open position is not a day's profit to anyone.
//
// A LOSING OR FLAT ACCOUNT HAS NO RATIO, and gets `pct: null` with
// `withinCap: true` rather than a 0% or a division by zero. There is no profit to
// distribute and therefore no payout to gate — the same reasoning tradingDaysRead
// applies to an account with no minimum: nothing to be met is not a failure.
// Deliberately also true when total profit is positive but every DAY is a loss on
// net (possible with payouts excluded and a single winning trade split across
// days) — with no positive day there is no "best day" to be oversized.
// ---------------------------------------------------------------------------
export function consistencyState(challenge, trades, payouts, asOf, offsetMin = 0) {
  const cap = num(challenge.consistency_pct);
  if (cap == null || !(cap > 0)) return null;

  const countFrom = cycleBound(challenge, payouts, asOf);
  const fromDay = countFrom ? dayKey(countFrom, offsetMin) : null;
  const asOfDay = dayKey(asOf, offsetMin);

  const byDay = new Map();
  for (const t of trades) {
    if (t.close_time == null || t.pnl_money == null) continue;
    const day = dayKey(t.close_time, offsetMin);
    if (day == null) continue;
    if (fromDay && day < fromDay) continue;
    if (asOfDay && day > asOfDay) continue;
    byDay.set(day, (byDay.get(day) ?? 0) + Number(t.pnl_money));
  }

  let total = 0;
  let best = null;
  let bestOn = null;
  for (const [day, pnl] of byDay) {
    total += pnl;
    // Ties keep the EARLIER day, because Map iterates in insertion order and this
    // only replaces on a strict >. Which day is named matters to a trader reading
    // "your best day was the 14th", and the first one to reach the figure is the
    // one that has been sitting on the account longest.
    if (pnl > 0 && (best == null || pnl > best)) { best = pnl; bestOn = day; }
  }
  const totalProfit = round2(total);
  const bestDay = round2(best);

  const gated = totalProfit > 0 && bestDay != null;
  const frac = gated ? bestDay / totalProfit : null;
  const withinCap = !gated || frac <= cap / 100;
  return {
    cap,
    bestDay,
    bestDayOn: bestOn,
    totalProfit,
    days: byDay.size,
    // The share of profit sitting in the best day, as a percentage — the figure the
    // rule is written in, so it is the figure the card shows.
    pct: frac == null ? null : round2(frac * 100),
    // The most that day is ALLOWED to hold at today's total. Under the cap this is
    // headroom; over it, the amount the day would have to shrink to.
    limit: gated ? round2((totalProfit * cap) / 100) : null,
    withinCap,
    // How much MORE total profit makes the current best day comply, which is the
    // only action available to a trader who is over: total >= bestDay / cap.
    profitNeeded: withinCap ? null : round2((bestDay * 100) / cap - totalProfit),
  };
}

// ---------------------------------------------------------------------------
// Profit target — eval phases only. Funded challenges carry a null target and this
// returns null (not applicable).
// ---------------------------------------------------------------------------
export function profitTargetState(challenge, currentEquity) {
  const base = num(challenge.start_balance);
  const pct = num(challenge.profit_target_pct);
  if (base == null || pct == null) return null;
  const target = round2((base * pct) / 100);
  const current = round2(currentEquity - base);
  return {
    target,
    current,
    pctToTarget: target > 0 ? clamp01(current / target) : null,
    reached: current >= target,
  };
}

// ---------------------------------------------------------------------------
// Health score — a single 0–100 read, but ALWAYS with a breakdown so it's
// explainable (never a black box). A breach floors it to 0. Weights: overall-DD
// headroom dominates (you're out if you hit it), daily-DD next, progress a nudge.
// ---------------------------------------------------------------------------
export function healthScore({ maxDdFrac, dailyDdFrac, progressFrac, breached }) {
  if (breached) return { score: 0, components: [{ key: 'breached', weight: 1, value: 0 }] };
  const parts = [
    { key: 'maxDd', weight: 0.5, value: clamp01(maxDdFrac ?? 1) },
    { key: 'dailyDd', weight: 0.3, value: clamp01(dailyDdFrac ?? 1) },
    { key: 'progress', weight: 0.2, value: clamp01(progressFrac ?? 1) },
  ];
  const score = Math.round(100 * parts.reduce((s, p) => s + p.weight * p.value, 0));
  return { score, components: parts.map((p) => ({ ...p, value: round2(p.value) })) };
}

// ---------------------------------------------------------------------------
// Top-level assembler. Everything server.js needs for one account's Prop OS card.
// `live` = the account's current equity (from the accounts table) if known.
// `asOf` = the "now" reference (default new Date()); passed in so tests are stable.
// ---------------------------------------------------------------------------
export function challengeState({ challenge, trades = [], payouts = [], snapshots = [], live = null, asOf = new Date(), offsetMin = 0 }) {
  const { series, mode } = buildEquitySeries({
    startBalance: challenge.start_balance,
    trades,
    snapshots,
    startDate: challenge.start_date,
  });
  const currentEquity = currentEquityOf(series, challenge.start_balance, live);

  const maxDd = maxDrawdown(challenge, series, currentEquity);
  const dailyDd = dailyDrawdown(challenge, series, asOf, offsetMin);
  const profitTarget = profitTargetState(challenge, currentEquity);
  const tradingDays = tradingDaysState(challenge, trades, payouts, asOf, offsetMin);
  const consistency = consistencyState(challenge, trades, payouts, asOf, offsetMin);

  const breached = Boolean(maxDd?.breached || dailyDd?.breached);
  const breachReason = maxDd?.breached ? 'max_dd' : dailyDd?.breached ? 'daily_dd' : null;

  const health = healthScore({
    maxDdFrac: maxDd?.fracRemaining,
    dailyDdFrac: dailyDd?.fracRemaining,
    // Progress nudge: eval -> toward target; funded -> profit buffer vs the max-DD
    // band (a healthy funded account sits comfortably above baseline).
    progressFrac: profitTarget
      ? profitTarget.pctToTarget
      : maxDd
        ? clamp01((currentEquity - num(challenge.start_balance)) / maxDd.limit)
        : 1,
    breached,
  });

  return {
    phase: challenge.phase,
    status: challenge.status,
    ddType: challenge.dd_type,
    startBalance: num(challenge.start_balance),
    currentEquity: round2(currentEquity),
    mode, // 'live' (EA snapshots) | 'realized' (synthesized from closed trades)
    maxDd,
    dailyDd,
    profitTarget, // null for funded
    tradingDays,
    /* null when the account has no consistency rule, which is most of them.
       DELIBERATELY ABSENT from `breach` and from healthScore below — it is a payout
       gate, not a failure; see consistencyState. */
    consistency,
    breach: { breached, reason: breachReason },
    health,
  };
}
