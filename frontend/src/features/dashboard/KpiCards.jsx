import React from 'react';
import {
  KpiAside, KpiCard, KpiChip, KpiChips, KpiGauge, KpiLabel, KpiMain, KpiPill,
  KpiRing, KpiSpacer, KpiValue,
} from '@/components/primitives';
import Explain from '../../components/Explain.jsx';
import { fmtVal, fmtValShort } from '../../lib/metrics.js';

/* The headline KPI cards, shared by the Dashboard, the Trade Log and the prop Account
 * workspace. Rebuilt on Base Rhea (2026-08-29); every caller picks up the new look
 * without changing a line, because the props are unchanged.
 *
 * THESE LIVE HERE RATHER THAN IN THE PAGES because Net P&L is the hero card and the
 * other four match its geometry — two copies of that relationship would drift the first
 * time either page was tuned. The geometry itself is declared in
 * components/primitives/kpi.jsx, which is the only place a Tailwind utility compiles.
 *
 * `m` is computeMetrics(trades, unit, beRounding) over whatever trade set the page is
 * showing, so the cards always describe the rows underneath them — filters included.
 *
 * WHAT MOVED WITH RHEA: each card's footer sentence became a GAUGE and CHIPS. That is
 * not decoration — the sentences were carrying the value's shape in prose ("Winners run
 * a bit larger", "26 of 42 days green") and a filled arc with two figures beside it says
 * the same thing without being read. Two of those sentences were also VERDICTS, and
 * those are kept as tone on the figure rather than deleted; see ProfitFactorCard.
 */

// The one place sign becomes a colour. Breakeven is deliberately `flat` and not `pos`:
// a flat close is a result, and painting it green would inflate a losing week into a
// green row of cards.
const signTone = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : 'flat');

/* A gauge's fill has to mean the same thing on every card, so the rule is stated once:
 * the arc is GREEN above the metric's own break-even point and AMBER below it, and the
 * caller supplies that point because only the caller knows what it is. Amber, not red —
 * a win rate under 50% is not an error, and red here would collide with the outcome
 * colour the chips beneath are already using for real losses. */
const gaugeTone = (value, breakEven) => (value >= breakEven ? 'pos' : 'flat');

export function NetPnlCard({ m, unit }) {
  const tone = signTone(m.net);
  return (
    <KpiCard hero>
      <KpiLabel
        info={<Explain size={13} nudgeY={-1} openUp>Total realized P&amp;L across all closed trades in the current filter.</Explain>}
        trailing={<KpiPill>{m.tradeCount} trade{m.tradeCount === 1 ? '' : 's'}</KpiPill>}
      >
        Net P&amp;L
      </KpiLabel>
      <KpiSpacer />
      {/* THE FIGURE CARRIES THE SIGN, and since Rhea it carries it alone — the card's
          10% wash and the trend arrow beside the number are both gone. At 25px of mono
          the colour of the digits is not a detail anyone has to hunt for, and three
          encodings of one fact (wash, arrow, colour) crowded out the four cards beside
          it. `today` stays because it is a SECOND fact, not the same one again. */}
      <KpiValue tone={tone}>{fmtVal(m.net, unit)}</KpiValue>
    </KpiCard>
  );
}

export function TradeWinCard({ m }) {
  // Decided trades only — breakevens are excluded from the rate, so the chips have to
  // be drawn over the same denominator or the two disagree on the same card. The
  // breakeven count gets its own neutral chip rather than being hidden: a trade that
  // closed flat happened, and a row of chips that does not add up to the trade count is
  // a row a trader will try to reconcile.
  const be = Math.max(0, m.tradeCount - m.wins - m.losses);
  return (
    <KpiCard>
      <KpiMain>
        <KpiLabel info={<Explain size={13} nudgeY={-1} openUp>Share of decided trades (wins + losses, excluding breakeven) that closed as a win.</Explain>}>
          Trade win %
        </KpiLabel>
        <KpiValue>{m.winRate.toFixed(2)}%</KpiValue>
      </KpiMain>
      <KpiAside>
        <KpiGauge pct={m.winRate} tone={gaugeTone(m.winRate, 50)} empty={!m.tradeCount} />
        {/* THE CHIPS GO NEUTRAL WITH NO TRADES. A green 0 beside a red 0 spends two
            outcome colours on the absence of any outcome, on the one screen where a new
            user is deciding whether this app knows anything about them. */}
        <KpiChips>
          <KpiChip tone={m.tradeCount ? 'pos' : 'flat'}>{m.wins}</KpiChip>
          {be > 0 && <KpiChip>{be}</KpiChip>}
          <KpiChip tone={m.tradeCount ? 'neg' : 'flat'}>{m.losses}</KpiChip>
        </KpiChips>
      </KpiAside>
    </KpiCard>
  );
}

export function ProfitFactorCard({ m }) {
  const pf = m.profitFactor;
  const infinite = pf === 999;
  /* THE VERDICT SURVIVED THE FOOTER LINE'S DELETION, as tone on the figure. Profit
   * factor has an absolute threshold that means something: above 1.0 the account makes
   * money, below it does not, however good the win rate looks. A win rate has no such
   * line — 61% is excellent with a 3:1 payoff and ruinous with 1:3 — which is why this
   * is the only card here whose number is coloured by a threshold rather than by a
   * sign, and why the sentence "Healthy · above 1.0" was worth keeping as SOMETHING
   * rather than dropping with the rest. */
  const tone = infinite || pf > 1 ? 'pos' : pf === 1 || pf === 0 ? 'flat' : 'neg';
  /* The ring divides the two quantities the ratio is MADE of, so it needs gross profit
   * against gross loss rather than the ratio itself — see KpiRing. Infinite profit
   * factor (no losing trades) is a full green ring, which is exactly right. */
  const gross = m.grossProfit + m.grossLoss;
  const share = infinite ? 1 : (gross > 0 ? m.grossProfit / gross : 0);
  // NO DATA IS NOT A ZERO SHARE — see KpiRing. `infinite` (winners, no losers) is real
  // data and earns a full green ring; `gross === 0` is a brand-new account.
  const noData = !infinite && gross === 0;
  return (
    <KpiCard>
      <KpiMain>
        <KpiLabel info={<Explain size={13} nudgeY={-1} openUp>Gross profit divided by gross loss. Above 1 means the account is net profitable.</Explain>}>
          Profit factor
        </KpiLabel>
        <KpiValue tone={tone}>{infinite ? '∞' : pf.toFixed(2)}</KpiValue>
      </KpiMain>
      <KpiAside>
        <KpiRing share={share} empty={noData} />
      </KpiAside>
    </KpiCard>
  );
}

export function DayWinCard({ days }) {
  return (
    <KpiCard>
      <KpiMain>
        <KpiLabel info={<Explain size={13} nudgeY={-1} openUp>Share of trading days that closed net positive.</Explain>}>
          Day win %
        </KpiLabel>
        <KpiValue>{days.rate.toFixed(2)}%</KpiValue>
      </KpiMain>
      <KpiAside>
        <KpiGauge pct={days.rate} tone={gaugeTone(days.rate, 50)} empty={!days.total} />
        <KpiChips>
          <KpiChip tone={days.total ? 'pos' : 'flat'}>{days.winDays}</KpiChip>
          <KpiChip tone={days.total ? 'neg' : 'flat'}>{days.lossDays}</KpiChip>
        </KpiChips>
      </KpiAside>
    </KpiCard>
  );
}

export function AvgWinLossCard({ m, unit }) {
  const r = m.avgWinLoss;
  const infinite = r === Infinity;
  /* THE GAUGE IS THE RATIO ON A 0-2 SCALE, halved so 1.0 — the point where the average
   * winner and the average loser are the same size — lands at the middle of the arc.
   * A ratio has no natural ceiling, so some scale has to be chosen; 2 is the one Rhea
   * draws and it is the useful range (above 2 the exact figure matters more than the
   * shape, and the number is right there). */
  return (
    <KpiCard>
      <KpiMain>
        <KpiLabel info={<Explain size={13} nudgeY={-1} openUp>Average size of a winning trade divided by the average size of a losing trade.</Explain>}>
          Avg win/loss
        </KpiLabel>
        <KpiValue>{infinite ? '∞' : r.toFixed(2)}</KpiValue>
      </KpiMain>
      <KpiAside>
        <KpiGauge pct={infinite ? 100 : (r / 2) * 100} tone={gaugeTone(r, 1)} empty={!m.tradeCount} />
        <KpiChips>
          {/* fmtValShort, not fmtVal: a chip is 5px of padding around ten pixels of
              type, and "$1,240.50" in it wraps the card. The exact figure is one hover
              away in the Trade Log; what belongs here is the comparison. */}
          <KpiChip tone={m.tradeCount ? 'pos' : 'flat'}>{fmtValShort(m.avgWin, unit)}</KpiChip>
          <KpiChip tone={m.tradeCount ? 'neg' : 'flat'}>{fmtValShort(-Math.abs(m.avgLoss), unit)}</KpiChip>
        </KpiChips>
      </KpiAside>
    </KpiCard>
  );
}
