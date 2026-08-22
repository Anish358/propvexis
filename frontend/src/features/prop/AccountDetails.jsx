import React from 'react';
import { fmtMoney } from '../../lib/metrics.js';
import { roomStatus } from './PropOS.jsx';

// ---------------------------------------------------------------------------
// Account Details — the three rule meters (Daily drawdown, Max drawdown, Profit
// target) that judge one account against its challenge.
//
// LIFTED OUT OF Dashboard.jsx VERBATIM, not re-drawn. It was the Dashboard's
// account card and is now also the Accounts › Details section, and those two
// surfaces have to be the same component or they become the same component with a
// slowly diverging appearance — the exact drift the KPI cards were consolidated to
// avoid (KpiCards.jsx says the same thing about Net P&L). Every class name,
// every string and the meter order are unchanged, so the Dashboard renders
// byte-identical output to what it did before the move.
//
// `data` is one entry from GET /api/prop (src/domain/prop/prop.js's challengeState):
// { phase, startBalance, currentEquity, maxDd, dailyDd, profitTarget, tradingDays,
//   breach, health }. Nothing is decided here — the thresholds live in
// `roomStatus`, and every dollar figure is server-computed.
//
// `onSetTarget` is OPTIONAL and is what makes the component portable. A funded
// account carries no profit target by default, and the Dashboard offers to set one
// inline (it owns SetTargetModal). A surface that does not own that flow passes
// nothing and gets the same meter without the link, rather than a second variant of
// the section. Accounts › Details is that surface: setting a target is account
// EDITING, which is outside its locked scope.
// ---------------------------------------------------------------------------

const money = (n) => (n == null ? '—' : fmtMoney(n));
const pct1 = (f) => `${((f || 0) * 100).toFixed(1)}%`;

// A single "$used / $limit" row with a fill bar — used/limit framing (bar fills
// UP as risk grows) rather than a room-remaining framing, so a nearly-full bar
// reads as a warning at a glance.
export function UsageMeter({
  label, used, limit, pct, tone, sub,
}) {
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

export default function AccountDetails({ data, onSetTarget = null }) {
  const maxSt = roomStatus(data.maxDd?.fracRemaining, data.maxDd?.breached);
  const daySt = roomStatus(data.dailyDd?.fracRemaining, data.dailyDd?.breached);

  const maxUsed = data.maxDd ? data.maxDd.limit - data.maxDd.roomLeft : null;
  const maxPct = data.maxDd?.limit ? maxUsed / data.maxDd.limit : 0;
  const dayPct = data.dailyDd?.limit ? data.dailyDd.usedToday / data.dailyDd.limit : 0;
  const fundedProfit = data.currentEquity != null && data.startBalance != null
    ? data.currentEquity - data.startBalance
    : null;

  return (
    <div className="dash-acct-usages dash-acct-usages-grid">
      <UsageMeter
        label="Daily drawdown"
        used={data.dailyDd?.usedToday}
        limit={data.dailyDd?.limit}
        pct={dayPct}
        tone={daySt}
        sub={`${pct1(dayPct)} used · ${money(data.dailyDd?.roomLeft)} remaining`}
      />
      <UsageMeter
        label="Max drawdown"
        used={maxUsed}
        limit={data.maxDd?.limit}
        pct={maxPct}
        tone={maxSt}
        sub={`${pct1(maxPct)} used · ${money(data.maxDd?.roomLeft)} remaining`}
      />
      {data.profitTarget ? (
        <UsageMeter
          label={data.phase === 'funded' ? 'Payout target' : 'Profit target'}
          used={data.profitTarget.current}
          limit={data.profitTarget.target}
          pct={data.profitTarget.pctToTarget}
          tone={data.phase === 'funded' ? 'payout' : 'target'}
          sub={(
            <>
              <span>
                {data.profitTarget.reached
                  ? 'Target reached'
                  : `${pct1(data.profitTarget.pctToTarget)} of target · ${money(data.profitTarget.target - data.profitTarget.current)} to go`}
              </span>
              {data.phase === 'funded' && onSetTarget && (
                <button
                  type="button"
                  className="dash-usage-settarget dash-usage-settarget--edit"
                  onClick={onSetTarget}
                >
                  Edit payout target
                </button>
              )}
            </>
          )}
        />
      ) : data.phase === 'funded' ? (
        <div className="dash-usage prop-na">
          <div className="dash-usage-head">
            <span className="dash-usage-label">Payout</span>
            <span className="dash-usage-val">{money(fundedProfit)}</span>
          </div>
          <div className="prop-meter-track"><div className="prop-meter-fill" style={{ width: '0%' }} /></div>
          <div className="dash-usage-sub">
            No payout target set for this funded account.{' '}
            {onSetTarget && (
              <button type="button" className="dash-usage-settarget" onClick={onSetTarget}>Set payout target</button>
            )}
          </div>
        </div>
      ) : <div className="dash-usage dash-usage-empty" />}
    </div>
  );
}
