import React, { useMemo } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import PageHeader from './PageHeader.jsx';
import { computeMetrics, valueField, tradeOutcome, fmtVal } from './metrics.js';
import { Card, Badge, Button, EmptyState } from '@/components/primitives';
import Explain from './Explain.jsx';
import { titleCase } from './constants.js';

// Trade Journal module front door: headline performance + recent activity +
// quick links across the module. Read-only — composed entirely from the trades
// already in context (respects the global FilterBar) via computeMetrics.

const signClass = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });

// The built sub-pages this overview links out to (the `soon` ones are omitted
// until they exist, so the hub never points at a dead stub).
const MODULES = [
  { to: '/journal/trades', name: 'Trade Log', desc: 'Every trade, filterable and taggable', icon: <><path d="M4 6h16M4 12h16M4 18h10" /></> },
  { to: '/journal/calendar', name: 'Calendar', desc: 'Daily & weekly P&L at a glance', icon: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></> },
  { to: '/journal/analytics', name: 'Analytics', desc: 'Distributions, edges and deep stats', icon: <><path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 5-6" /></> },
  { to: '/journal/strategies', name: 'Strategies', desc: 'Playbooks and rule adherence', icon: <><path d="M12 2 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6z" /><path d="M9 12l2 2 4-4" /></> },
];

const Kpi = ({ label, value, cls, sub, explain }) => (
  <Card>
    <div className="jo-kpi-label">
      {label}
      {explain && <Explain nudgeY={-1}>{explain}</Explain>}
    </div>
    <div className={`jo-kpi-value ${cls || ''}`}>{value}</div>
    {sub && <div className="jo-kpi-sub">{sub}</div>}
  </Card>
);

const Icon = ({ children }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);

export default function JournalOverview() {
  const { trades = [], unit = 'R', connected, toggleSidebar, tradeSettings = {} } = useOutletContext();
  const beRounding = !!tradeSettings.beRounding;
  const m = useMemo(() => computeMetrics(trades, unit, beRounding), [trades, unit, beRounding]);

  const field = valueField(unit);
  const recent = useMemo(
    () => trades
      .filter((t) => t[field] != null && t.close_time)
      .sort((a, b) => new Date(b.close_time) - new Date(a.close_time))
      .slice(0, 6),
    [trades, field],
  );

  const head = <PageHeader title="Journal Overview" connected={connected} onMenu={toggleSidebar} />;

  if (!m.tradeCount) {
    return (
      <div className="page">
        {head}
        <EmptyState
          icon={<Icon><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></Icon>}
          title="No trades yet"
          description="Once trades sync from your EA or an import, your journal headline stats and recent activity show up here."
          actions={<Button variant="primary" as={Link} to="/journal/trades">Go to Trade Log</Button>}
        />
      </div>
    );
  }

  return (
    <div className="page">
      {head}
      <div className="page-body">
        <div className="jo-kpis">
          <Kpi label="Net" value={fmtVal(m.net, unit)} cls={signClass(m.net)} sub={`${m.tradeCount} trades`} />
          <Kpi label="Win rate" value={`${m.winRate}%`} sub={`${m.wins}W · ${m.losses}L`} />
          <Kpi label="Profit factor" value={m.profitFactor === 999 ? '∞' : m.profitFactor.toFixed(2)} />
          <Kpi
            label="Expectancy"
            value={fmtVal(m.expectancy, unit)}
            cls={signClass(m.expectancy)}
            sub="per trade"
            explain={
              <>
                What one average trade is worth: <b>total ÷ number of trades</b>, over
                the trades currently filtered in. Equivalently
                (win rate × avg win) + (loss rate × avg loss) — the two are the same number.
                <br /><br />
                Breakeven trades <b>are</b> counted in the denominator (they contribute 0),
                so a spreadsheet that averages over a fixed cell range including blank
                rows will show a lower figure than this.
              </>
            }
          />
          <Kpi label="Avg reward" value={`${m.avgRR.toFixed(2)}R`} sub="mean Max R" />
        </div>

        <div className="jo-cols">
          <Card>
            <h3 className="jo-section-title">
              Recent trades
              <Button variant="ghost" size="sm" as={Link} to="/journal/trades">View all →</Button>
            </h3>
            <div className="jo-recent">
              {recent.map((t) => {
                const out = tradeOutcome(t, unit, beRounding);
                const val = Number(t[field]);
                return (
                  <div className="jo-trade" key={t.id}>
                    <span className="jo-trade-sym">{t.symbol_base || t.symbol}</span>
                    <Badge tone="neutral">{titleCase(t.direction) || '—'}</Badge>
                    <span className={`jo-trade-val ${out === 'win' ? 'pos' : out === 'loss' ? 'neg' : ''}`}>
                      {fmtVal(val, unit)}
                    </span>
                    <span className="jo-trade-date">{fmtDate(t.close_time)}</span>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card>
            <h3 className="jo-section-title">Explore the journal</h3>
            <div className="jo-modules">
              {MODULES.map((mod) => (
                <Link className="jo-mod" to={mod.to} key={mod.to}>
                  <span className="jo-mod-icon"><Icon>{mod.icon}</Icon></span>
                  <span className="jo-mod-body">
                    <span className="jo-mod-name">{mod.name}</span>
                    <span className="jo-mod-desc">{mod.desc}</span>
                  </span>
                  <span className="jo-mod-arrow"><Icon><path d="m9 18 6-6-6-6" /></Icon></span>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
