import React from 'react';
import { AlertCircle, AlertTriangle, Coins, Target } from 'lucide-react';
import { Meter, MeterRow } from '@/components/primitives';
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

/* A single "$used / $limit" row with a fill bar.
 *
 * USED/LIMIT FRAMING, and the bar fills UP as risk grows. A room-remaining bar empties
 * toward danger, so the most alarming state would be the one with the least ink on
 * screen — backwards for the one number that ends accounts. Unchanged by the redesign.
 *
 * THE SKIN MOVED, THE API DID NOT (2026-08-28). The `.dash-usage` / `.prop-meter-*`
 * markup is replaced by the `Meter` primitive, so this component's five props and all
 * of its callers are untouched. `tone` is still roomStatus()'s vocabulary — the
 * primitive speaks the same words plus `target`/`payout`, which this file already
 * passed.
 *
 * THE ICON IS DERIVED FROM THE TONE HERE rather than being a sixth prop, because the
 * mapping is a fact about the tone and not about the meter: a warn meter is a triangle
 * and a bad one is a filled circle, everywhere, or the shapes stop meaning anything.
 * Colour alone is never the escalation (DESIGN-LANGUAGE §a11y). */
const TONE_ICON = {
  warn: AlertTriangle,
  bad: AlertCircle,
  target: Target,
  payout: Coins,
};

export function UsageMeter({
  label, used, limit, pct, tone, sub, meta,
}) {
  const Icon = TONE_ICON[tone] || null;
  return (
    <Meter
      label={label}
      icon={Icon ? <Icon aria-hidden="true" /> : null}
      value={money(used)}
      limit={limit == null ? null : `/ ${money(limit)}`}
      pct={pct}
      tone={tone}
      sub={sub}
      meta={meta}
    />
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
    <MeterRow>
      <UsageMeter
        label="Daily drawdown"
        used={data.dailyDd?.usedToday}
        limit={data.dailyDd?.limit}
        pct={dayPct}
        tone={daySt}
        /* `sub` NO LONGER LEADS WITH THE PERCENTAGE (2026-08-29, Rhea). The meter
           renders its own fill percentage in the footer's left slot, so "49.6% used ·
           $1,260 remaining" printed it twice, four pixels apart, in two type styles.
           The word is the unit for the figure the meter already shows; the room left
           moves to `meta`, on the right, where the eye goes for "so what". */
        sub="used"
        meta={`${money(data.dailyDd?.roomLeft)} left`}
      />
      <UsageMeter
        label="Max drawdown"
        used={maxUsed}
        limit={data.maxDd?.limit}
        pct={maxPct}
        tone={maxSt}
        sub="used"
        meta={`${money(data.maxDd?.roomLeft)} left`}
      />
      {data.profitTarget ? (
        <UsageMeter
          label={data.phase === 'funded' ? 'Payout target' : 'Profit target'}
          used={data.profitTarget.current}
          limit={data.profitTarget.target}
          pct={data.profitTarget.pctToTarget}
          tone={data.phase === 'funded' ? 'payout' : 'target'}
          sub={data.profitTarget.reached ? 'target reached' : 'of target'}
          meta={(
            <>
              {!data.profitTarget.reached
                && `${money(data.profitTarget.target - data.profitTarget.current)} to go`}
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
        /* A funded account with no target. `na` rather than a tone: there is no rule
           to be near, and drawing this green would claim a target had been met. */
        <Meter
          label="Payout"
          value={money(fundedProfit)}
          pct={0}
          tone="na"
          sub={(
            <>
              No payout target set for this funded account.{' '}
              {onSetTarget && (
                <button type="button" className="dash-usage-settarget" onClick={onSetTarget}>Set payout target</button>
              )}
            </>
          )}
        />
      ) : null}
    </MeterRow>
  );
}
