import React, { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import PageHeader from './PageHeader.jsx';
import { computeMetrics, computeProp } from './metrics.js';
import { DASH_WIDGETS, BANDS, WidgetCustomizer, widgetBlockReason, balancedCols } from './dashboardWidgets.jsx';

// The dashboard is fully widget-driven. The scope (god vs a single account)
// only decides which widgets are *available*; the user chooses which to show
// (persisted per scope in the ViewConfig). With nothing hidden, god renders the
// R strategy dashboard and an account renders the prop-firm dashboard — same as
// before, but now there's no hardcoded fork.
export default function Dashboard() {
  const {
    trades = [], account, accountId = 'all', connected, toggleSidebar, unit = 'R',
    widgetOverrides = {}, setWidgetVisible, resetWidgets,
  } = useOutletContext();

  const scope = accountId === 'all' ? 'god' : 'account';
  const m = useMemo(() => computeMetrics(trades, unit), [trades, unit]);
  const p = useMemo(() => computeProp(trades, account), [trades, account]);

  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const dayMap = useMemo(() => {
    const map = new Map();
    for (const d of m.days) map.set(d.key, { pnl: d.pnl, trades: d.trades });
    return map;
  }, [m.days]);

  const ctx = {
    trades, account, accountId, unit, scope, m, p,
    cal: {
      year: calYear, month: calMonth, dayMap,
      onPrev: () => { const d = new Date(calYear, calMonth - 1, 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); },
      onNext: () => { const d = new Date(calYear, calMonth + 1, 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); },
    },
  };

  // Effective visibility = the user's explicit choice if any, else the widget's
  // per-scope default. A widget renders only if the scope can satisfy its data
  // requirement (capability) AND it's visible.
  const isVisible = (id) => {
    const w = DASH_WIDGETS.find((x) => x.id === id);
    return w ? (widgetOverrides[id] ?? w.defaultOn(scope)) : false;
  };
  const onToggle = (id) => setWidgetVisible(id, !isVisible(id));
  const visible = DASH_WIDGETS.filter((w) => !widgetBlockReason(w, scope, ctx) && isVisible(w.id));

  return (
    <div className="page">
      <PageHeader title="Dashboard" connected={connected} onMenu={toggleSidebar} />

      <div className="page-body">
        <div className="dash-toolbar">
          <WidgetCustomizer scope={scope} ctx={ctx} isVisible={isVisible} onToggle={onToggle} onReset={resetWidgets} />
        </div>

        {visible.length === 0 && (
          <div className="dash-empty">All widgets hidden — use <b>Customize</b> to add some back.</div>
        )}

        {BANDS.map(({ key, className, maxPerRow, fixed }) => {
          const ws = visible.filter((w) => w.band === key);
          if (!ws.length) return null;
          // Balance columns to the visible count via a CSS var, so rows stay even
          // and the responsive media queries can still override on small screens.
          const style = fixed ? undefined : { '--cols': balancedCols(ws.length, maxPerRow) };
          return (
            <div key={key} className={className} style={style}>
              {ws.map((w) => <w.Component key={w.id} ctx={ctx} />)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
