import React, { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import PageHeader from './PageHeader.jsx';
import PayoutsModal from './PayoutsModal.jsx';
import MonthCalendar from './MonthCalendar.jsx';
import DayTradesModal from './DayTradesModal.jsx';
import Explain from './Explain.jsx';
import { Card, Badge, Tabs, EmptyState } from './ui.jsx';
import { sevClass } from './Notifications.jsx';
import { GaugeArc, Ring, SplitBar } from './DashWidgets.jsx';
import { roomStatus, healthStatus } from './PropOS.jsx';
import { fetchProp } from './api.js';
import { token } from './theme.js';
import {
  computeMetrics, computeProp, fmtVal, fmtValShort, fmtMoney, valueField, tradeOutcome,
} from './metrics.js';

// Chart theming from design tokens (matches Analytics.jsx's equity curve).
const CHART_PROFIT = token('--profit');
const CHART_ACCENT = token('--accent');
const CHART_GRID = token('--line');
const CHART_AXIS = token('--text-3');
const chartTip = { background: token('--surface-2'), border: `1px solid ${token('--line')}`, borderRadius: 8, color: token('--text') };

// Dashboard V1 — the fixed morning-home layout (daily banner, headline stat
// cards, calendar + recent activity, account health cards). Replaces the old
// widget-toggle dashboard: this page has one layout, not a customizable one.

const signTone = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
const PHASE_ORDER = { funded: 0, p2: 1, p1: 2 };

// ---- Section 1: daily banner --------------------------------------------

function DailyBanner({ notifications = [] }) {
  const alerts = notifications.filter((n) => !n.read_at || n.severity !== 'info').slice(0, 3);
  return (
    <div className="dash-banner">
      <div className="dash-banner-news">
        <div className="dash-banner-label">High-impact events</div>
        <div className="dash-banner-empty muted">Economic calendar — coming soon.</div>
      </div>
      <div className="dash-banner-alerts">
        {alerts.length === 0 ? (
          <span className="muted">No account alerts right now.</span>
        ) : alerts.map((n) => (
          <span key={n.id} className={`dash-banner-alert ${sevClass(n.severity)}`}>{n.title}</span>
        ))}
      </div>
    </div>
  );
}

// ---- Section 2: stat cards ------------------------------------------------
// Net P&L, Trade Win %, Profit Factor, Day Win %, Avg Win/Loss — each paired
// with a small gauge/ring/split-bar so the row reads at a glance, not just as
// numbers (TradeZella-style headline cards).

function NetPnlCard({ m, unit }) {
  const winShare = m.grossProfit + m.grossLoss > 0 ? m.grossProfit / (m.grossProfit + m.grossLoss) : 1;
  return (
    <Card className="dash-stat">
      <div className="jo-kpi-label">Net P&L <span className="dash-stat-count">{m.tradeCount}T</span></div>
      <div className={`jo-kpi-value ${signTone(m.net)}`}>{fmtVal(m.net, unit)}</div>
      <SplitBar winShare={winShare} />
    </Card>
  );
}

function TradeWinCard({ m }) {
  return (
    <Card className="dash-stat">
      <div className="jo-kpi-label">Trade win %</div>
      <div className="dash-stat-gauge-row">
        <div>
          <div className="jo-kpi-value">{m.winRate.toFixed(2)}%</div>
          <div className="dash-stat-chips">
            <span className="chip win">{m.wins}</span>
            <span className="chip loss">{m.losses}</span>
          </div>
        </div>
        <GaugeArc value={m.winRate / 100} size={59.4} />
      </div>
    </Card>
  );
}

function ProfitFactorCard({ m }) {
  return (
    <Card className="dash-stat">
      <div className="jo-kpi-label">Profit factor</div>
      <div className="dash-stat-gauge-row">
        <div className="jo-kpi-value">{m.profitFactor === 999 ? '∞' : m.profitFactor.toFixed(2)}</div>
        <Ring value={Math.min(1, m.profitFactor / 3)} size={41.4} />
      </div>
    </Card>
  );
}

function DayWinCard({ days }) {
  return (
    <Card className="dash-stat">
      <div className="jo-kpi-label">Day win %</div>
      <div className="dash-stat-gauge-row">
        <div>
          <div className="jo-kpi-value">{days.rate.toFixed(2)}%</div>
          <div className="dash-stat-chips">
            <span className="chip win">{days.winDays}</span>
            <span className="chip loss">{days.lossDays}</span>
          </div>
        </div>
        <GaugeArc value={days.rate / 100} size={59.4} />
      </div>
    </Card>
  );
}

function AvgWinLossCard({ m, unit }) {
  const winShare = m.avgWin + m.avgLoss > 0 ? m.avgWin / (m.avgWin + m.avgLoss) : 1;
  return (
    <Card className="dash-stat">
      <div className="jo-kpi-label">Avg win/loss trade</div>
      <div className="jo-kpi-value">{m.avgWinLoss === Infinity ? '∞' : m.avgWinLoss.toFixed(2)}</div>
      <SplitBar winShare={winShare} />
      <div className="dash-stat-foot">
        <span className="win">{fmtValShort(m.avgWin, unit)}</span>
        <span className="loss">{fmtValShort(-m.avgLoss, unit)}</span>
      </div>
    </Card>
  );
}

// ---- Section 3 left: recent trades / open positions ----------------------

function RecentTrades({ trades, unit, beRounding }) {
  const field = valueField(unit);
  const recent = useMemo(
    () => trades
      .filter((t) => t[field] != null && t.close_time)
      .sort((a, b) => new Date(b.close_time) - new Date(a.close_time))
      .slice(0, 6),
    [trades, field],
  );
  if (!recent.length) {
    return <EmptyState title="No trades yet" description="Recent trades show up here once you have closed trades." />;
  }
  return (
    <div className="jo-recent">
      {recent.map((t) => {
        const out = tradeOutcome(t, unit, beRounding);
        const val = Number(t[field]);
        return (
          <div className="jo-trade" key={t.id}>
            <span className="jo-trade-sym">{t.symbol_base || t.symbol}</span>
            <Badge tone="neutral">{(t.direction || '').toUpperCase() || '—'}</Badge>
            <span className={`jo-trade-val ${out === 'win' ? 'pos' : out === 'loss' ? 'neg' : ''}`}>{fmtVal(val, unit)}</span>
            <span className="jo-trade-date">{fmtDate(t.close_time)}</span>
          </div>
        );
      })}
    </div>
  );
}

function OpenPositions() {
  return (
    <EmptyState
      title="No open positions data yet"
      description="The journal currently syncs closed trades only. Live open-position tracking will show up here once that's connected."
    />
  );
}

function ActivityCard({ trades, unit, beRounding }) {
  const [tab, setTab] = useState('recent');
  return (
    <Card className="dash-activity">
      <Tabs
        tabs={[{ value: 'recent', label: 'Recent Trades' }, { value: 'open', label: 'Open Positions' }]}
        value={tab}
        onChange={setTab}
      />
      <div className="dash-activity-body">
        {tab === 'recent' ? <RecentTrades trades={trades} unit={unit} beRounding={beRounding} /> : <OpenPositions />}
      </div>
    </Card>
  );
}

// Daily net cumulative P&L — running total of each day's closed P&L, so the
// line reads as an equity-style curve without needing a separate stats fetch
// (built straight off the same per-day rollup the calendar uses).
function CumulativePnlCard({ days, unit }) {
  const data = useMemo(() => {
    let cum = 0;
    return days.map((d) => {
      cum += d.pnl;
      return { label: fmtDate(d.date), cum: Math.round(cum * 100) / 100 };
    });
  }, [days]);

  return (
    <Card className="dash-equity">
      <div className="dash-equity-head">
        <h3>Daily net cumulative {unit === 'USD' ? 'P&L' : 'R'}</h3>
        <Explain>Running total of each day's closed P&amp;L, in order, across all trades.</Explain>
      </div>
      {data.length === 0 ? (
        <EmptyState title="No closed trades yet" description="Your cumulative P&L will chart here once you have closed trades." />
      ) : (
        <ResponsiveContainer width="100%" height={230}>
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <defs>
              <linearGradient id="dashEquityFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_PROFIT} stopOpacity={0.45} />
                <stop offset="100%" stopColor={CHART_PROFIT} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" stroke={CHART_AXIS} fontSize={11} minTickGap={40} />
            <YAxis stroke={CHART_AXIS} fontSize={11} tickFormatter={(v) => fmtValShort(v, unit)} width={52} />
            <Tooltip contentStyle={chartTip} formatter={(v) => fmtVal(v, unit)} labelStyle={{ color: token('--text-2') }} />
            <Area type="monotone" dataKey="cum" stroke={CHART_ACCENT} strokeWidth={2} fill="url(#dashEquityFill)" />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

// ---- Section 3 right: account health cards --------------------------------

const STATUS_LABEL = { good: 'Healthy', warn: 'Warning', bad: 'At risk', na: '—' };
const HEALTH_BADGE_TONE = { good: 'profit', warn: 'warn', bad: 'loss', na: 'neutral' };
const PHASE_LABEL = { funded: 'Funded', p2: 'Phase 2', p1: 'Phase 1' };

// A single "$used / $limit" row with a fill bar — used/limit framing (bar fills
// UP as risk grows) rather than a room-remaining framing, so a nearly-full bar
// reads as a warning at a glance.
function UsageMeter({ label, used, limit, pct, tone, sub }) {
  const money = (n) => (n == null ? '—' : fmtMoney(n));
  return (
    <div className={`dash-usage prop-${tone}`}>
      <div className="dash-usage-head">
        <span className="dash-usage-label">{label}</span>
        <span className="dash-usage-val">{money(used)} <span className="muted">/ {money(limit)}</span></span>
      </div>
      <div className="prop-meter-track"><div className="prop-meter-fill" style={{ width: `${Math.round((pct || 0) * 100)}%` }} /></div>
      {sub && <div className="dash-usage-sub">{sub}</div>}
    </div>
  );
}

function AccountCard({ data, onOpen }) {
  const st = healthStatus(data.health.score, data.breach.breached);
  const maxSt = roomStatus(data.maxDd?.fracRemaining, data.maxDd?.breached);
  const daySt = roomStatus(data.dailyDd?.fracRemaining, data.dailyDd?.breached);
  const money = (n) => (n == null ? '—' : fmtMoney(n));
  const pct1 = (f) => `${((f || 0) * 100).toFixed(1)}%`;

  const maxUsed = data.maxDd ? data.maxDd.limit - data.maxDd.roomLeft : null;
  const maxPct = data.maxDd?.limit ? maxUsed / data.maxDd.limit : 0;
  const dayPct = data.dailyDd?.limit ? data.dailyDd.usedToday / data.dailyDd.limit : 0;

  return (
    <Card className="dash-acct-card">
      <div className="dash-acct-head">
        <span className="dash-acct-name">{data.label || `Account ${data.account_id}`}</span>
        <Badge tone={HEALTH_BADGE_TONE[st]}>{STATUS_LABEL[st]}</Badge>
      </div>
      <div className="dash-acct-subrow">
        <span className={`dash-acct-phase ${data.phase === 'funded' ? 'good' : ''}`}>{PHASE_LABEL[data.phase] || data.phase}</span>
        <span className="dash-acct-balance">{money(data.currentEquity ?? data.startBalance)}</span>
      </div>

      <div className="dash-acct-usages">
        <UsageMeter
          label="Max drawdown"
          used={maxUsed}
          limit={data.maxDd?.limit}
          pct={maxPct}
          tone={maxSt}
          sub={`${pct1(maxPct)} used · ${money(data.maxDd?.roomLeft)} remaining`}
        />
        <UsageMeter
          label="Daily drawdown"
          used={data.dailyDd?.usedToday}
          limit={data.dailyDd?.limit}
          pct={dayPct}
          tone={daySt}
          sub={`${pct1(dayPct)} used · ${money(data.dailyDd?.roomLeft)} remaining`}
        />
        {data.profitTarget && (
          <UsageMeter
            label="Profit target"
            used={data.profitTarget.current}
            limit={data.profitTarget.target}
            pct={data.profitTarget.pctToTarget}
            tone="target"
            sub={data.profitTarget.reached
              ? 'Target reached'
              : `${pct1(data.profitTarget.pctToTarget)} of target · ${money(data.profitTarget.target - data.profitTarget.current)} to go`}
          />
        )}
      </div>

      <div className="dash-acct-days">{data.tradingDays.completed}/{data.tradingDays.required} days completed</div>

      <button type="button" className="dash-acct-view" onClick={onOpen}>View account →</button>
    </Card>
  );
}

// Lets the user choose which accounts pin to the (max 3) health-card stack,
// once there are more candidates than that. Persisted via setPinnedAccounts.
function PinAccounts({ candidates, pinned, onChange }) {
  const [open, setOpen] = useState(false);
  const toggle = (id) => {
    const key = String(id);
    const cur = pinned.length ? pinned.map(String) : candidates.slice(0, 3).map((a) => String(a.account_id));
    const next = cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key];
    onChange(next.slice(0, 3));
  };
  return (
    <div className="dash-pin">
      <button type="button" className="wcz-btn" onClick={() => setOpen((o) => !o)}>Pin accounts</button>
      {open && (
        <div className="wcz-menu">
          <div className="wcz-head">Show up to 3</div>
          {candidates.map((a) => {
            const key = String(a.account_id);
            const active = pinned.length ? pinned.map(String).includes(key) : candidates.slice(0, 3).some((x) => String(x.account_id) === key);
            return (
              <label key={key} className="wcz-opt">
                <input type="checkbox" checked={active} onChange={() => toggle(a.account_id)} />
                <span>{a.label || `Account ${a.account_id}`}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---- page ------------------------------------------------------------------

export default function Dashboard() {
  const {
    trades = [], account, accounts = [], payouts = [], reloadPayouts, accountId = 'all', setAccountId,
    unit = 'R', notifications = [], pinnedAccounts = [], setPinnedAccounts, tradeSettings = {},
  } = useOutletContext();

  const scope = accountId === 'all' ? 'god' : 'account';
  const beRounding = !!tradeSettings.beRounding;
  const m = useMemo(() => computeMetrics(trades, unit, beRounding), [trades, unit, beRounding]);
  const p = useMemo(() => computeProp(trades, account, payouts), [trades, account, payouts]);

  const [payoutsOpen, setPayoutsOpen] = useState(false);
  const fundedAccounts = useMemo(() => {
    const funded = accounts.filter((a) => a.account_type === 'funded');
    return accountId === 'all' ? funded : funded.filter((a) => String(a.mt5_login) === String(accountId));
  }, [accounts, accountId]);
  const showPayoutTracker = fundedAccounts.length > 0;
  const payoutTotal = p.payout?.trader ?? 0;

  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState(null);
  const dayMap = useMemo(() => {
    const map = new Map();
    for (const d of m.days) map.set(d.key, { pnl: d.pnl, trades: d.trades, wins: d.wins, losses: d.losses });
    return map;
  }, [m.days]);

  // Day win % — the share of trading days that closed net positive, distinct
  // from the trade-level win rate above.
  const dayStats = useMemo(() => {
    const winDays = m.days.filter((d) => d.pnl > 0).length;
    const lossDays = m.days.filter((d) => d.pnl < 0).length;
    const total = m.days.length;
    return { rate: total ? (100 * winDays) / total : 0, winDays, lossDays, total };
  }, [m.days]);

  // Prop OS challenge state for the account-health cards — same call PropOS
  // itself makes; god scope returns one item per account, single scope one item.
  const [propData, setPropData] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setPropData(null);
    fetchProp(accountId).then((d) => { if (!cancelled) setPropData(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, [accountId]);

  const candidates = useMemo(() => {
    const list = (propData?.god ? propData.accounts : propData ? [propData] : []).filter((a) => a.challengeId);
    return [...list].sort((a, b) => (PHASE_ORDER[a.phase] ?? 9) - (PHASE_ORDER[b.phase] ?? 9));
  }, [propData]);

  const shownAccounts = useMemo(() => {
    if (!pinnedAccounts.length) return candidates.slice(0, 3);
    const byId = new Map(candidates.map((a) => [String(a.account_id), a]));
    const picked = pinnedAccounts.map((id) => byId.get(String(id))).filter(Boolean).slice(0, 3);
    return picked.length ? picked : candidates.slice(0, 3);
  }, [candidates, pinnedAccounts]);

  return (
    <div className="page">
      <PageHeader
        right={showPayoutTracker && (
          <button className="ph-payout" onClick={() => setPayoutsOpen(true)} title="View & record payouts">
            <span className="ph-payout-label">Total payout</span>
            <span className="ph-payout-val">{fmtMoney(payoutTotal)}</span>
          </button>
        )}
      />

      {payoutsOpen && (
        <PayoutsModal
          payouts={payouts}
          fundedAccounts={fundedAccounts}
          defaultLogin={accountId === 'all' ? undefined : accountId}
          onClose={() => setPayoutsOpen(false)}
          onChanged={() => reloadPayouts?.()}
        />
      )}

      <DayTradesModal
        dayKeyStr={selectedDay}
        trades={trades}
        unit={unit}
        beRounding={beRounding}
        onClose={() => setSelectedDay(null)}
      />

      <div className="page-body dash-page-body">
        <DailyBanner notifications={notifications} />

        <div className="jo-kpis dash-stats">
          <NetPnlCard m={m} unit={unit} />
          <TradeWinCard m={m} />
          <ProfitFactorCard m={m} />
          <DayWinCard days={dayStats} />
          <AvgWinLossCard m={m} unit={unit} />
        </div>

        <div className="dash-main">
          <div className="dash-col-left">
            <div className="panel dash-cal-panel">
              <MonthCalendar
                year={calYear}
                month={calMonth}
                dayMap={dayMap}
                unit={unit}
                onPrev={() => { const d = new Date(calYear, calMonth - 1, 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); }}
                onNext={() => { const d = new Date(calYear, calMonth + 1, 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); }}
                onToday={() => { const n = new Date(); setCalYear(n.getFullYear()); setCalMonth(n.getMonth()); }}
                onSelectDay={(c) => setSelectedDay(c.key)}
              />
            </div>
            <div className="dash-split-row">
              <ActivityCard trades={trades} unit={unit} beRounding={beRounding} />
              <CumulativePnlCard days={m.days} unit={unit} />
            </div>
          </div>

          <div className="dash-col-right">
            <div className="panel dash-acct-panel">
              <div className="dash-acct-stack-head">
                <h3>Account Health</h3>
                {scope === 'god' && candidates.length > 3 && (
                  <PinAccounts candidates={candidates} pinned={pinnedAccounts} onChange={setPinnedAccounts} />
                )}
              </div>
              <div className="dash-acct-stack-body">
                {!candidates.length ? (
                  <EmptyState
                    title="No prop accounts yet"
                    description="Add a prop account with challenge rules to see drawdown and profit-target tracking here."
                  />
                ) : shownAccounts.map((a) => (
                  <AccountCard key={a.account_id} data={a} onOpen={() => setAccountId(String(a.account_id))} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
