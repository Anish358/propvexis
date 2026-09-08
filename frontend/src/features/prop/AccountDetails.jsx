import React from 'react';
import { AlertCircle, AlertTriangle, Coins, Target } from 'lucide-react';
import { Meter, MeterRow } from '@/components/primitives';
import { fmtMoney } from '../../lib/metrics.js';
import { roomStatus } from './PropOS.jsx';
import { maxDdUsed, targetProgress } from './ruleFigures.js';

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
      /* THE SEPARATOR IS THE PRIMITIVE'S, so this passes the figure alone. It used to
         pass "/ $2,500" while Meter also printed its own "/", and the meters read
         "$0 / / $2,500". Presentation belongs to the component that owns the baseline
         alignment between the two numbers; the caller owns the number. */
      limit={limit == null ? null : money(limit)}
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

  // FLOORED AT 0 — see ruleFigures.js. `limit - roomLeft` goes negative on an account
  // in profit, and this is the meter that ends accounts.
  const maxUsed = maxDdUsed(data.maxDd);
  const maxPct = data.maxDd?.limit ? maxUsed / data.maxDd.limit : 0;
  const dayPct = data.dailyDd?.limit ? data.dailyDd.usedToday / data.dailyDd.limit : 0;
  const fundedProfit = data.currentEquity != null && data.startBalance != null
    ? data.currentEquity - data.startBalance
    : null;

  return (
    /* NOT KEYED ON THE ACCOUNT — THE BARS TWEEN ACROSS A SWITCH. Owner decision,
     * 2026-09-03, taken over the objection recorded here so it is not silently undone.
     *
     * Adding `key={data.account_id}` would remount this row, and the meters would then
     * paint the new account’s figures outright instead of travelling to them. That was
     * the original build, for a real reason: a transition asserts that the thing it
     * moves is the same thing it was a moment ago, and these bars measure ONE account’s
     * consumed drawdown. Sliding from the 15K’s 66.7% to the 25K’s 33.3% draws a
     * downward sweep — the most reassuring motion this card can make — on a click that
     * changed nothing about the trader’s risk.
     *
     * The owner weighed that against the alternatives (fade the row in; grow each bar
     * from zero) and chose the conventional tween, which is what every other dashboard
     * does and what reads as least surprising. Recorded rather than argued: if the
     * false-recovery reading ever shows up in real use, the fix is the key on this line
     * plus the fade — both are one line each, and test/motion.test.js pins the current
     * choice so a revert has to be deliberate. */
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
          used={targetProgress(data.profitTarget)}
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
