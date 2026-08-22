import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
import { Badge, Card, EmptyState } from '@/components/primitives';
import Explain from '../../components/Explain.jsx';
import MonthCalendar from '../calendar/MonthCalendar.jsx';
import RecentTrades from '../trades/RecentTrades.jsx';
import { NetPnlCard, TradeWinCard, ProfitFactorCard } from '../dashboard/KpiCards.jsx';
import { EquityCard, ProfitTargetCard, TradingDaysCard } from './AccountKpiCards.jsx';
import AccountDetails from './AccountDetails.jsx';
import { healthStatus } from './PropOS.jsx';
import { PHASE_LABEL, equitySeries } from './propAccounts.js';
import { chartPalette } from '../../lib/theme.js';
import { computeMetrics, fmtMoney, fmtMoneyShort } from '../../lib/metrics.js';

// ---------------------------------------------------------------------------
// Accounts › Details — the single-account workspace.
//
// LOCKED SECTION ORDER: Selected Account Header → KPI cards → Account Details →
// Equity Curve → Recent Trades + Calendar. Nothing else belongs here.
//
// THERE IS NO ACCOUNT SWITCHER ON THIS PAGE, AND THAT IS A DECISION, NOT AN
// OMISSION. The app already has a universal account switcher in the top bar, and
// it is the single source of truth for which account every surface is showing. A
// second selector here would be a second source: the two would agree until the
// moment they didn't, and a trader would have no way to tell which one the numbers
// below belonged to. Portfolio's Select buttons write to that same top-bar state
// (see PropAccounts.jsx), so selecting a card and switching in the bar are the
// same action reached two ways.
//
// EVERYTHING IN DOLLARS, regardless of the top bar's R/$ toggle. This is a single
// account, and every rule it is judged by — drawdown limits, profit target,
// starting balance — is a dollar amount set by the prop firm. An R-denominated Net
// P&L in a row next to a dollar equity would be two units in one sentence, and the
// numeric-treatment rule is that a figure never depends on context for its unit.
// ---------------------------------------------------------------------------

const money = (n) => (n == null ? '—' : fmtMoney(n));
const HEALTH_LABEL = { good: 'On Track', warn: 'At Risk', bad: 'Critical', na: 'No Data' };
const fmtDay = (d) => new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });

// ---- Selected Account Header ----------------------------------------------

function SelectedAccountHeader({ data, account }) {
  const breached = Boolean(data.breach?.breached);
  const health = healthStatus(data.health?.score ?? 0, breached);
  const size = account?.start_balance != null ? Number(account.start_balance) : data.startBalance;

  return (
    <Card className="pa-header">
      <div className="pa-header-id">
        <div className="pa-header-name-row">
          <h2 className="pa-header-name">{data.label || `Account ${data.account_id}`}</h2>
          <Badge tone={breached ? 'loss' : data.phase === 'funded' ? 'profit' : 'neutral'}>
            {PHASE_LABEL[data.phase] || data.phase}
          </Badge>
        </div>
        <div className="pa-header-sub">
          {account?.firm_name || 'Other'} · {money(size)}
          {account?.kind === 'manual' ? ' · Manual' : account?.mt5_login != null ? ` · ${account.mt5_login}` : ''}
        </div>
      </div>
      {/* Status is a word plus a dot, never a dot alone — the same rule the
          Dashboard's account tabs and the Overview's payout statuses follow. */}
      <div className="pa-header-health">
        <span className={`dash-acct-tab-dot dash-acct-tab-dot--${health}`} />
        <span className="pa-header-health-text">
          {HEALTH_LABEL[health]}
          {breached && data.breach?.reason && (
            <span className="pa-header-health-why">
              {data.breach.reason === 'max_dd' ? ' · Max drawdown' : ' · Daily drawdown'}
            </span>
          )}
        </span>
      </div>
    </Card>
  );
}

// ---- Equity Curve ----------------------------------------------------------

// The ACCOUNT BALANCE over time — not a P&L total that starts at zero. It opens at
// the challenge's starting balance and the reference line marks it, so "is this
// account up or down on the firm's money" is answered by which side of one line
// the curve sits on, without reading a single figure.
function EquityCurveCard({ data, days }) {
  const series = useMemo(
    () => equitySeries(data.startBalance, days).map((p) => ({ ...p, label: fmtDay(p.date) })),
    [data.startBalance, days],
  );
  const p = chartPalette();

  return (
    <Card className="pa-equity card-md">
      <div className="prop-card-head">
        <h3>Equity Curve</h3>
        <Explain>
          This account&apos;s balance over time: its starting balance plus each day&apos;s closed
          P&amp;L. Like every in-memory view in the app it follows the active filters —
          the account&apos;s true current equity is the Equity card above.
        </Explain>
      </div>
      {series.length < 2 ? (
        <EmptyState
          title="No balance history yet"
          description="The curve charts here once this account has closed trades."
        />
      ) : (
        // Fixed-height wrapper + a 100%-height container, the same shape every
        // other chart in the app uses (`.fin-chart`). A ResponsiveContainer set
        // to 100% directly against the card's flex column has no definite box to
        // measure and collapses to nothing.
        <div className="pa-chart">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
              <defs>
                <linearGradient id="paEquityFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={p.accent} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={p.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={p.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" stroke={p.axis} fontSize={11} minTickGap={40} />
              <YAxis
                stroke={p.axis}
                fontSize={11}
                width={56}
                domain={['auto', 'auto']}
                tickFormatter={(v) => fmtMoneyShort(v)}
              />
              <Tooltip
                contentStyle={p.tip}
                labelStyle={{ color: p.label }}
                formatter={(v) => [fmtMoney(v), 'Balance']}
              />
              {/* Starting balance — the line the firm judges the account against. */}
              <ReferenceLine y={data.startBalance} stroke={p.gridStrong} strokeDasharray="4 4" />
              <Area type="monotone" dataKey="balance" stroke={p.accent} strokeWidth={2} fill="url(#paEquityFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

// ---- the workspace ---------------------------------------------------------

export default function AccountWorkspace({ data, account, trades, beRounding }) {
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());

  // USD, not the top bar's unit — see the header comment. computeMetrics is the
  // same rollup the Dashboard, the calendar and the trade log read, so the KPI
  // row, the curve and the calendar below can never disagree about a day.
  const m = useMemo(() => computeMetrics(trades, 'USD', beRounding), [trades, beRounding]);
  const dayMap = useMemo(() => {
    const map = new Map();
    for (const d of m.days) map.set(d.key, { pnl: d.pnl, trades: d.trades, wins: d.wins, losses: d.losses });
    return map;
  }, [m.days]);

  return (
    <>
      <SelectedAccountHeader data={data} account={account} />

      {/* Six tiles on the locked master geometry: three trading metrics reused
          from the Dashboard's KPI set, three account-state metrics from
          AccountKpiCards. --kpi-count splits the row, exactly as every other KPI
          row in the app does. */}
      <div className="jo-kpis dash-stats" style={{ '--kpi-count': 6 }}>
        <EquityCard data={data} />
        <NetPnlCard m={m} unit="USD" />
        <ProfitTargetCard data={data} />
        <TradingDaysCard data={data} />
        <TradeWinCard m={m} />
        <ProfitFactorCard m={m} />
      </div>

      {/* The Dashboard's Account Details section, the same component — not a
          second treatment of the same three rules. Target editing is not handed
          in: setting a payout target is account editing, which this view does not
          own. */}
      <Card className="pa-rules">
        <div className="prop-card-head"><h3>Account Details</h3></div>
        <AccountDetails data={data} />
      </Card>

      {/* Same 3-column dense grid the Dashboard and the Overview use, so the card
          heights (card-md / card-lg) line up without any coordinates: the curve
          spans two columns of the first row, Recent Trades runs two rows down the
          third, and the calendar takes the 2x2 block beneath the curve. */}
      <div className="dash-grid" style={{ '--dash-grid-cols': 3 }}>
        <div className="dash-grid-cell" style={{ gridColumn: 'span 2', gridRow: 'span 1' }}>
          <EquityCurveCard data={data} days={m.days} />
        </div>
        <div className="dash-grid-cell" style={{ gridColumn: 'span 1', gridRow: 'span 2' }}>
          <Card className="dash-activity card-lg">
            <div className="prop-card-head">
              <h3>Recent Trades</h3>
              <Link className="pa-viewall" to="/journal/trades">View all →</Link>
            </div>
            <div className="dash-activity-body">
              <RecentTrades trades={trades} unit="USD" beRounding={beRounding} limit={14} />
            </div>
          </Card>
        </div>
        <div className="dash-grid-cell" style={{ gridColumn: 'span 2', gridRow: 'span 2' }}>
          <div className="panel dash-cal-panel card-lg">
            <MonthCalendar
              year={calYear}
              month={calMonth}
              dayMap={dayMap}
              unit="USD"
              onPrev={() => { const d = new Date(calYear, calMonth - 1, 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); }}
              onNext={() => { const d = new Date(calYear, calMonth + 1, 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); }}
              onToday={() => { const n = new Date(); setCalYear(n.getFullYear()); setCalMonth(n.getMonth()); }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
