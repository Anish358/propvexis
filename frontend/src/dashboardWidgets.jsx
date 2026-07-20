import React, { useEffect, useRef, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
  BarChart, Bar, Cell, RadarChart, PolarGrid, PolarAngleAxis, Radar, AreaChart, Area,
} from 'recharts';
import MonthCalendar from './MonthCalendar.jsx';
import MonthSummary from './MonthSummary.jsx';
import { GaugeArc, Ring, SplitBar } from './DashWidgets.jsx';
import { fmtVal, fmtValShort, fmtAxis, fmtMoney } from './metrics.js';
import { token } from './theme.js';

const GREEN = token('--profit'); // trade profit — green, NOT the blue brand accent
const RED = token('--loss');
const PURPLE = token('--ai');
const PAYOUT = token('--payout'); // funded-account payout (profit withdrawal) highlight
// Chart theming — all pulled from design tokens so charts match the app palette.
const GRID = token('--line');
const AXIS = token('--text-3');
const AXIS_STRONG = token('--line-strong');
const TICK = token('--text-2');
const WARN = token('--warning');
const BG = token('--bg');
const SURF2 = token('--surface-2');
const tone = (n) => (n > 0 ? 'win' : n < 0 ? 'loss' : '');

// Dot on the balance chart marking a payout (profit withdrawal) point.
const PayoutDot = ({ cx, cy, payload }) =>
  (payload?.phase === 'payout' && cx != null && cy != null
    ? <circle cx={cx} cy={cy} r={3.5} fill={PAYOUT} stroke={BG} strokeWidth={1} />
    : null);
const pctStr = (n) => `${(Number(n) || 0).toFixed(1)}%`;

// Each widget receives a single `ctx` built once by Dashboard:
//   { trades, account, accountId, unit, scope, m, p, cal }
// m = computeMetrics(trades, unit); p = computeProp(trades, account); cal holds
// the shared month state. Widgets are pure presentational slices of that ctx.

function Card({ label, badge, children }) {
  return (
    <div className="kcard">
      <div className="kcard-top">
        <span className="kcard-label">{label}</span>
        {badge}
      </div>
      {children}
    </div>
  );
}

// Drawdown / profit-target tracker (used by the account trackers).
function Tracker({ label, used, limit, limitPct, start, good = false }) {
  const ratio = limit > 0 ? Math.min(1, used / limit) : 0;
  const usedPct = start > 0 ? (used / start) * 100 : 0;
  const color = good
    ? (ratio >= 1 ? GREEN : PURPLE)
    : (ratio >= 0.8 ? RED : ratio >= 0.5 ? WARN : GREEN);
  return (
    <div className="kcard tracker">
      <div className="kcard-top">
        <span className="kcard-label">{label}</span>
        <span className="trk-limit">{good ? 'target' : 'limit'} {pctStr(limitPct)} · {fmtMoney(limit)}</span>
      </div>
      <div className="kcard-split">
        <div>
          <div className={`kcard-big ${good ? tone(used) : (used > 0 ? 'loss' : '')}`}>{fmtMoney(used)}</div>
          <div className="trk-sub">
            <span>{pctStr(usedPct)} of balance</span>
            <span className="muted"> · {pctStr(ratio * 100)} of {good ? 'target' : 'limit'}</span>
          </div>
        </div>
        <Ring value={ratio} color={color} />
      </div>
      <div className="trk-bar"><div className="trk-bar-fill" style={{ width: `${ratio * 100}%`, background: color }} /></div>
    </div>
  );
}

const chartTooltip = { background: SURF2, border: `1px solid ${GRID}`, borderRadius: 8, color: token('--text') };

// ---- KPI band widgets ----------------------------------------------------

function WCurrentBalance({ ctx }) {
  const { p } = ctx;
  return (
    <Card label={`CURRENT BALANCE${p.live ? ' · LIVE' : ''}`}>
      <div className="kcard-big">{fmtMoney(p.currentBalance)}</div>
      <div className="kcard-foot"><span className="muted">start {fmtMoney(p.start)}</span></div>
    </Card>
  );
}

function WPnl({ ctx }) {
  const { m, unit } = ctx;
  const winShare = m.grossProfit + m.grossLoss > 0 ? m.grossProfit / (m.grossProfit + m.grossLoss) : 1;
  return (
    <Card label={`P&L · ${m.tradeCount}T`}>
      <div className={`kcard-big ${tone(m.net)}`}>{fmtVal(m.net, unit)}</div>
      <div className="kcard-foot">
        <span className="win">{fmtValShort(m.grossProfit, unit)}</span>
        <span className={tone(m.expectancy)}>{fmtVal(m.expectancy, unit)}/t</span>
        <span className="loss">{fmtValShort(-m.grossLoss, unit)}</span>
      </div>
      <SplitBar winShare={winShare} />
    </Card>
  );
}

function WWinRate({ ctx }) {
  const { m } = ctx;
  return (
    <Card label="Win Rate">
      <div className="kcard-split">
        <div>
          <div className={`kcard-big ${tone(1)}`}>{m.winRate.toFixed(1)}%</div>
          <div className="winloss-chips">
            <span className="chip win">{m.wins}</span>
            <span className="chip loss">{m.losses}</span>
          </div>
        </div>
        <GaugeArc value={m.winRate / 100} />
      </div>
    </Card>
  );
}

function WProfitFactor({ ctx }) {
  const { m } = ctx;
  return (
    <Card label="Profit Factor">
      <div className="kcard-split">
        <div className={`kcard-big ${tone(m.profitFactor - 1)}`}>{m.profitFactor.toFixed(2)}</div>
        <Ring value={Math.min(1, m.profitFactor / 3)} color={GREEN} />
      </div>
    </Card>
  );
}

function WWinStreak({ ctx }) {
  const { m } = ctx;
  return (
    <Card label="Win Streak" badge={<span className="streak-best">⚡ Best: <b>{m.streak.bestWin}W</b><br /><span className="muted">Win streak</span></span>}>
      <div className="kcard-split">
        <div className={`kcard-big ${tone(m.streak.current)}`}>{m.streak.current >= 0 ? '+' : ''}{m.streak.current}</div>
        <Ring value={Math.min(1, Math.abs(m.streak.current) / 5)} color={m.streak.current >= 0 ? GREEN : RED} />
      </div>
    </Card>
  );
}

function WAvgWinLoss({ ctx }) {
  const { m, unit } = ctx;
  return (
    <Card label="Avg Win/Loss">
      <div className={`kcard-big ${tone(1)}`}>{m.avgWinLoss === Infinity ? '∞' : m.avgWinLoss.toFixed(2)}</div>
      <div className="kcard-foot">
        <span className="win">{fmtValShort(m.avgWin, unit)}</span>
        <span className="loss">{fmtValShort(-m.avgLoss, unit)}</span>
      </div>
      <SplitBar winShare={m.avgWin + m.avgLoss > 0 ? m.avgWin / (m.avgWin + m.avgLoss) : 1} />
    </Card>
  );
}

// ---- chart band widgets --------------------------------------------------

function WThunder({ ctx }) {
  const { m } = ctx;
  return (
    <div className="panel thunder">
      <div className="panel-title">⚡ THUNDER SCORE</div>
      <ResponsiveContainer width="100%" height={230}>
        <RadarChart data={m.thunderAxes} outerRadius="72%">
          <PolarGrid stroke={GRID} />
          <PolarAngleAxis dataKey="key" tick={{ fill: TICK, fontSize: 11 }} />
          <Radar dataKey="value" stroke={PURPLE} fill={PURPLE} fillOpacity={0.45} />
        </RadarChart>
      </ResponsiveContainer>
      <div className="rr-slider">
        <div className="rr-label">Avg RR</div>
        <div className="rr-track">
          <div className="rr-knob" style={{ left: `${Math.min(100, (m.avgRR / 3) * 100)}%` }} />
        </div>
      </div>
      <div className="thunder-score">{m.thunder}</div>
      <div className="thunder-cap">THUNDER SCORE</div>
    </div>
  );
}

function WCumulative({ ctx }) {
  const { m, unit } = ctx;
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">Cumulative P&L</div>
        <div className="panel-meta">
          <span className={`pct-pill ${tone(m.expectancy)}`}>{fmtVal(m.expectancy, unit)}/trade</span>
          <span className={tone(m.net)}>{fmtVal(m.net, unit)}</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={m.cumulative} margin={{ top: 10, right: 16, bottom: 4, left: -10 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" stroke={AXIS} fontSize={11} tickLine={false} />
          <YAxis stroke={AXIS} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => fmtAxis(v, unit)} />
          <Tooltip contentStyle={chartTooltip} formatter={(v) => fmtVal(v, unit)} />
          <ReferenceLine y={0} stroke={AXIS_STRONG} />
          <Line type="monotone" dataKey="cum" stroke={GREEN} strokeWidth={2} dot={{ r: 3, fill: GREEN }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const DAILY_BARS_WINDOW_DAYS = 30; // Daily P&L chart shows a rolling last-month window

function WDailyBars({ ctx }) {
  const { m, unit } = ctx;
  // Last 30 days (rolling), so the chart stays a readable "past month" view
  // rather than every trading day on record.
  const cutoff = Date.now() - DAILY_BARS_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const data = m.daily.filter((d) => new Date(d.date).getTime() >= cutoff);
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">Daily P&L</div>
        <div className="panel-meta muted">Last {DAILY_BARS_WINDOW_DAYS} days</div>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 10, right: 16, bottom: 4, left: -10 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" stroke={AXIS} fontSize={11} tickLine={false} />
          <YAxis stroke={AXIS} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => fmtAxis(v, unit)} />
          <Tooltip contentStyle={chartTooltip} cursor={{ fill: '#ffffff08' }} formatter={(v) => fmtVal(v, unit)} />
          <ReferenceLine y={0} stroke={AXIS_STRONG} />
          <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
            {data.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? GREEN : RED} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {data.length === 0 && <div className="dash-empty" style={{ padding: '8px 0 0' }}>No trades in the last {DAILY_BARS_WINDOW_DAYS} days.</div>}
    </div>
  );
}

// Tooltip for the balance chart. On the pre-tracking (purple) segment it explains
// what the straight line means instead of just showing a number.
function BalanceTip({ active, payload, pre }) {
  if (!active || !payload?.length) return null;
  const pt = payload[0]?.payload || {};
  if (pt.phase === 'added' && pre) {
    const delta = pre.added - pre.start;
    return (
      <div className="chart-tip pre">
        <div className="chart-tip-title" style={{ color: PURPLE }}>Before journal tracking</div>
        <div className="chart-tip-body">
          Added at <b>{fmtMoney(pre.added)}</b> with a start balance of <b>{fmtMoney(pre.start)}</b>.
          This {fmtMoney(Math.abs(delta))} {delta < 0 ? 'drawdown' : 'gain'} happened before any trade
          was recorded here, so it’s drawn as a straight line — not from tracked trades.
        </div>
      </div>
    );
  }
  if (pt.phase === 'payout' && pt.payoutInfo) {
    const { gross, trader, split, note } = pt.payoutInfo;
    return (
      <div className="chart-tip payout">
        <div className="chart-tip-title" style={{ color: PAYOUT }}>Payout withdrawn</div>
        <div className="chart-tip-body">
          Withdrew <b>{fmtMoney(gross)}</b> from the account. At a {split}% split your share is <b>{fmtMoney(trader)}</b>.
          The balance steps down by the gross withdrawal — this is profit taken, not a trading loss.
          {note ? <> · {note}</> : null}
        </div>
      </div>
    );
  }
  const v = pt.equity ?? pt.pre;
  return <div className="chart-tip"><b>{fmtMoney(v)}</b></div>;
}

function WEquity({ ctx }) {
  const { p } = ctx;
  const pre = p.preTracking;
  const hasPayouts = p.payout?.count > 0;
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">Account Balance</div>
        <div className="panel-meta"><span className={tone(p.netPnl)}>{fmtMoney(p.currentBalance)}</span></div>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={p.curve} margin={{ top: 10, right: 16, bottom: 4, left: 4 }}>
          <defs>
            <linearGradient id="balFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={GREEN} stopOpacity={0.35} />
              <stop offset="100%" stopColor={GREEN} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="preFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PURPLE} stopOpacity={0.3} />
              <stop offset="100%" stopColor={PURPLE} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="payoutFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PAYOUT} stopOpacity={0.28} />
              <stop offset="100%" stopColor={PAYOUT} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" stroke={AXIS} fontSize={11} tickLine={false} />
          <YAxis stroke={AXIS} fontSize={11} tickLine={false} axisLine={false} domain={[Math.floor(p.max.floor - p.start * 0.01), 'auto']} tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`} />
          <Tooltip content={<BalanceTip pre={pre} />} />
          <ReferenceLine y={p.start} stroke={AXIS_STRONG} strokeDasharray="4 4" label={{ value: 'start', fill: AXIS, fontSize: 10, position: 'insideTopLeft' }} />
          <ReferenceLine y={p.daily.floor} stroke={WARN} strokeDasharray="6 4" label={{ value: `Daily max loss · ${fmtMoney(p.daily.floor)}`, fill: WARN, fontSize: 10, position: 'insideBottomRight' }} />
          <ReferenceLine y={p.max.floor} stroke={RED} strokeDasharray="6 4" label={{ value: `Max allowed loss · ${fmtMoney(p.max.floor)}`, fill: RED, fontSize: 10, position: 'insideBottomRight' }} />
          {/* Pre-tracking (account added mid-drawdown) drawn as a straight purple drop. */}
          {pre && <Area type="linear" dataKey="pre" stroke={PURPLE} strokeWidth={2} strokeDasharray="5 3" fill="url(#preFill)" dot={false} connectNulls={false} isAnimationActive={false} />}
          <Area type="monotone" dataKey="equity" stroke={GREEN} strokeWidth={2} fill="url(#balFill)" dot={false} connectNulls={false} />
          {/* Payout (profit withdrawal): the balance step-down, highlighted. */}
          {hasPayouts && <Area type="linear" dataKey="payout" stroke={PAYOUT} strokeWidth={2.5} fill="url(#payoutFill)" dot={<PayoutDot />} activeDot={false} connectNulls={false} isAnimationActive={false} />}
        </AreaChart>
      </ResponsiveContainer>
      {(pre || hasPayouts) && (
        <div className="equity-legend">
          {pre && (
            <span className="equity-legend-item">
              <span className="dot" style={{ background: PURPLE }} />
              Pre-tracking: account added at {fmtMoney(pre.added)} (start {fmtMoney(pre.start)})
            </span>
          )}
          {hasPayouts && (
            <span className="equity-legend-item">
              <span className="dot" style={{ background: PAYOUT }} />
              Payouts: {p.payout.count} withdrawal{p.payout.count > 1 ? 's' : ''} · {fmtMoney(p.payout.gross)} gross → {fmtMoney(p.payout.trader)} to trader
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ---- tracker band widgets ------------------------------------------------

function WDailyDD({ ctx }) {
  const { p } = ctx;
  return <Tracker label="DAILY DRAWDOWN" used={p.daily.used} limit={p.daily.limit} limitPct={p.daily.pct} start={p.start} />;
}
function WMaxDD({ ctx }) {
  const { p } = ctx;
  return <Tracker label="MAX DRAWDOWN" used={p.max.used} limit={p.max.limit} limitPct={p.max.pct} start={p.start} />;
}
function WProfitTarget({ ctx }) {
  const { p } = ctx;
  return <Tracker label="PROFIT TARGET" used={p.target.reached} limit={p.target.goal} limitPct={p.target.pct} start={p.start} good />;
}

// ---- calendar band -------------------------------------------------------

function WCalendar({ ctx }) {
  const { trades, unit, cal } = ctx;
  return (
    <>
      <div className="panel">
        <MonthCalendar year={cal.year} month={cal.month} dayMap={cal.dayMap} unit={unit} onPrev={cal.onPrev} onNext={cal.onNext} />
      </div>
      <MonthSummary trades={trades} year={cal.year} month={cal.month} unit={unit} />
    </>
  );
}

// Layout bands, rendered in this order. Each maps to a CSS container. `maxPerRow`
// caps columns; the actual count is balanced to the number of visible widgets so
// rows stay even (no orphans). `fixed` bands keep their own CSS columns.
export const BANDS = [
  { key: 'kpi', className: 'kpi-cards', maxPerRow: 5 },
  { key: 'chart', className: 'dash-charts', maxPerRow: 3 },
  { key: 'tracker', className: 'kpi-cards trackers', maxPerRow: 3 },
  { key: 'calendar', className: 'dash-bottom', fixed: true },
];

// Columns that spread `n` widgets across the fewest rows while keeping rows even:
// 6 items (max 5) -> 2 rows -> 3 cols (3+3), not 5+1; 5 -> 5; 4 charts (max 3) -> 2+2.
export const balancedCols = (n, max) => {
  if (n <= 1) return 1;
  const rows = Math.ceil(n / max);
  return Math.ceil(n / rows);
};

// One global registry. A widget declares the DATA it needs, not the view it
// belongs to:
//   requires: 'trades'  -> works in any scope (just needs a trade set + unit)
//   requires: 'account' -> needs one concrete account's prop state (start
//                          balance + drawdown/target rules) — undefined in the
//                          god aggregate, so it's offered but disabled there.
// `defaultOn(scope)` = whether it shows by default in a scope (the user's
// explicit choices override this — see the overrides model in App/filters).
// `available(ctx)` is a further data gate (profit target only for eval).
// Order here = render order within a band. scope is 'god' | 'account'.
const onlyGod = (scope) => scope === 'god';
const onlyAccount = (scope) => scope === 'account';

export const DASH_WIDGETS = [
  { id: 'currentbalance', label: 'Current Balance', band: 'kpi', requires: 'account', defaultOn: onlyAccount, Component: WCurrentBalance },
  { id: 'pnl', label: 'P&L', band: 'kpi', requires: 'trades', defaultOn: () => true, Component: WPnl },
  { id: 'winrate', label: 'Win Rate', band: 'kpi', requires: 'trades', defaultOn: () => true, Component: WWinRate },
  { id: 'profitfactor', label: 'Profit Factor', band: 'kpi', requires: 'trades', defaultOn: () => true, Component: WProfitFactor },
  { id: 'winstreak', label: 'Win Streak', band: 'kpi', requires: 'trades', defaultOn: onlyGod, Component: WWinStreak },
  { id: 'avgwinloss', label: 'Avg Win / Loss', band: 'kpi', requires: 'trades', defaultOn: () => true, Component: WAvgWinLoss },
  { id: 'thunder', label: 'Thunder Score', band: 'chart', requires: 'trades', defaultOn: onlyGod, Component: WThunder },
  { id: 'cumulative', label: 'Cumulative P&L', band: 'chart', requires: 'trades', defaultOn: onlyGod, Component: WCumulative },
  { id: 'dailybars', label: 'Daily P&L', band: 'chart', requires: 'trades', defaultOn: onlyGod, Component: WDailyBars },
  { id: 'equity', label: 'Account Balance Curve', band: 'chart', requires: 'account', defaultOn: onlyAccount, Component: WEquity },
  { id: 'dailydd', label: 'Daily Drawdown', band: 'tracker', requires: 'account', defaultOn: onlyAccount, Component: WDailyDD },
  { id: 'maxdd', label: 'Max Drawdown', band: 'tracker', requires: 'account', defaultOn: onlyAccount, Component: WMaxDD },
  { id: 'profittarget', label: 'Profit Target (eval)', band: 'tracker', requires: 'account', defaultOn: onlyAccount, available: (ctx) => ctx.p?.isEval, Component: WProfitTarget },
  { id: 'calendar', label: 'Calendar', band: 'calendar', requires: 'trades', defaultOn: () => true, Component: WCalendar },
];

// What a scope can provide. god is an aggregate of many accounts, so it has no
// single account's prop state.
export const scopeCapabilities = (scope) => (scope === 'account' ? ['trades', 'account'] : ['trades']);

// Reasons a widget can be unselectable in the current scope (shown in the panel).
export const widgetBlockReason = (w, scope, ctx) => {
  if (!scopeCapabilities(scope).includes(w.requires)) return 'Needs a single account';
  if (w.available && !w.available(ctx)) return 'Only for evaluation accounts';
  return null;
};

// Customize control: shows the ONE global widget list. Widgets the current
// scope can't satisfy (e.g. Drawdown in god view) are greyed out with the
// reason and can't be toggled. Eligible widgets are checkboxes (checked =
// shown). Closes on outside click. Mirrors the FilterBar dropdowns.
export function WidgetCustomizer({ scope, ctx, isVisible, onToggle, onReset }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const rows = DASH_WIDGETS.map((w) => ({ w, reason: widgetBlockReason(w, scope, ctx) }));
  const hiddenCount = rows.filter(({ w, reason }) => !reason && !isVisible(w.id)).length;

  return (
    <div className="wcz" ref={ref}>
      <button type="button" className="wcz-btn" onClick={() => setOpen((o) => !o)}>
        ⚙ Customize{hiddenCount ? ` (${hiddenCount} hidden)` : ''}
      </button>
      {open && (
        <div className="wcz-menu">
          <div className="wcz-head">Show widgets</div>
          {rows.map(({ w, reason }) => (
            <label key={w.id} className={`wcz-opt ${reason ? 'blocked' : ''}`} title={reason || ''}>
              <input
                type="checkbox"
                disabled={!!reason}
                checked={!reason && isVisible(w.id)}
                onChange={() => onToggle(w.id)}
              />
              <span>{w.label}</span>
              {reason && <span className="wcz-reason">{reason}</span>}
            </label>
          ))}
          <button type="button" className="wcz-reset" onClick={onReset}>Reset to default</button>
        </div>
      )}
    </div>
  );
}
