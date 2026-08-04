import React from 'react';
// PHASE 4b — on the generated component library. The card SURFACE is now shadcn's
// Card (Base UI, preset geometry, coloured through the token bridge).
//
// `spacing="none"` tells the Card not to impose any internal rhythm of its own.
// These five tiles are one locked geometry — Net P&L is the master and the other
// four match its dimensions — and that geometry is described in one place, the
// "KPI CARD TREATMENT" block in legacy/app.css. Two sources for the same padding and
// gap is how the row drifted last time.
import { Card } from '@/components/primitives';
import Explain from './Explain.jsx';
import { StatContext } from './DashWidgets.jsx';
import { dayKey, fmtVal } from './metrics.js';

// The headline KPI cards, shared by the Dashboard and the Trade Log.
//
// These live here rather than inside Dashboard.jsx because Net P&L is the LOCKED
// master card: every other KPI card matches its dimensions and typography, and the
// content adapts to fit the container rather than the container growing to fit the
// content. Two copies of that geometry would drift the first time either page was
// tuned — so both pages render these exact components, and a page chooses only
// WHICH cards to show and how many columns to split the row into (--kpi-count).
//
// `m` is computeMetrics(trades, unit, beRounding) over whatever trade set the page
// is showing, so the cards always describe the rows underneath them — filters
// included.

const signTone = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');

export function NetPnlCard({ m, unit }) {
  const today = m.days.find((d) => d.key === dayKey(new Date()));
  const todayPnl = today ? today.pnl : 0;
  return (
    <Card spacing="none" className="dash-stat dash-stat--refined">
      <div className="jo-kpi-label">
        Net P&L
        <Explain size={13} nudgeY={-1} openUp>Total realized P&amp;L across all closed trades in the current filter.</Explain>
        <span className="dash-stat-count">{m.tradeCount} Trade{m.tradeCount === 1 ? '' : 's'}</span>
      </div>
      <div className={`jo-kpi-value ${signTone(m.net)}`}>{fmtVal(m.net, unit)}</div>
      <StatContext label="Today" value={fmtVal(todayPnl, unit)} tone={signTone(todayPnl)} />
    </Card>
  );
}

export function TradeWinCard({ m }) {
  return (
    <Card spacing="none" className="dash-stat dash-stat--typo-match">
      <div className="jo-kpi-label">
        Trade win %
        <Explain size={13} nudgeY={-1} openUp>Share of decided trades (wins + losses, excluding breakeven) that closed as a win.</Explain>
      </div>
      <div className="jo-kpi-value">{m.winRate.toFixed(2)}%</div>
    </Card>
  );
}

export function ProfitFactorCard({ m }) {
  return (
    <Card spacing="none" className="dash-stat dash-stat--typo-match">
      <div className="jo-kpi-label">
        Profit factor
        <Explain size={13} nudgeY={-1} openUp>Gross profit divided by gross loss. Above 1 means the account is net profitable.</Explain>
      </div>
      <div className="jo-kpi-value">{m.profitFactor === 999 ? '∞' : m.profitFactor.toFixed(2)}</div>
    </Card>
  );
}

export function DayWinCard({ days }) {
  return (
    <Card spacing="none" className="dash-stat dash-stat--typo-match">
      <div className="jo-kpi-label">
        Day win %
        <Explain size={13} nudgeY={-1} openUp>Share of trading days that closed net positive.</Explain>
      </div>
      <div className="jo-kpi-value">{days.rate.toFixed(2)}%</div>
    </Card>
  );
}

export function AvgWinLossCard({ m }) {
  return (
    <Card spacing="none" className="dash-stat dash-stat--typo-match">
      <div className="jo-kpi-label">
        Avg win/loss trade
        <Explain size={13} nudgeY={-1} openUp>Average size of a winning trade divided by the average size of a losing trade.</Explain>
      </div>
      <div className="jo-kpi-value">{m.avgWinLoss === Infinity ? '∞' : m.avgWinLoss.toFixed(2)}</div>
    </Card>
  );
}
