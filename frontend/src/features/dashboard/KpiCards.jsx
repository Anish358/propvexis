import React from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import {
  KpiCard, KpiFoot, KpiLabel, KpiPill, KpiSpacer, KpiSplitBar, KpiValue,
} from '@/components/primitives';
import Explain from '../../components/Explain.jsx';
import { dayKey, fmtVal } from '../../lib/metrics.js';

/* The headline KPI cards, shared by the Dashboard, the Trade Log and the prop Account
 * workspace. Rebuilt on the 2026-08-28 Figma frame; every caller picks up the new look
 * without changing a line, because the props are unchanged.
 *
 * THESE LIVE HERE RATHER THAN IN THE PAGES because Net P&L is the hero card and the
 * other four match its geometry — two copies of that relationship would drift the first
 * time either page was tuned. What moved is where the geometry is DECLARED: it used to
 * be the "KPI CARD TREATMENT" block in legacy/app.css plus `--kpi-count` on the row;
 * it is now components/primitives/kpi.jsx, which is the only place a Tailwind utility
 * compiles at all.
 *
 * `m` is computeMetrics(trades, unit, beRounding) over whatever trade set the page is
 * showing, so the cards always describe the rows underneath them — filters included.
 */

// The one place sign becomes a colour. Breakeven is deliberately `flat` and not `pos`:
// a flat close is a result, and painting it green would inflate a losing week into a
// green row of cards.
const signTone = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : 'flat');

export function NetPnlCard({ m, unit }) {
  const today = m.days.find((d) => d.key === dayKey(new Date()));
  const todayPnl = today ? today.pnl : 0;
  const tone = signTone(m.net);
  const Trend = m.net < 0 ? TrendingDown : TrendingUp;
  return (
    <KpiCard hero tone={tone}>
      <KpiLabel
        info={<Explain size={13} nudgeY={-1} openUp>Total realized P&amp;L across all closed trades in the current filter.</Explain>}
        trailing={<KpiPill tone={tone}>{m.tradeCount} Trade{m.tradeCount === 1 ? '' : 's'}</KpiPill>}
      >
        Net P&amp;L
      </KpiLabel>
      <KpiSpacer />
      {/* The trend glyph points the way the number does. A fixed up-arrow beside a
          negative figure is the kind of detail that quietly destroys trust in a
          number, so it is derived from the sign rather than decorative. */}
      <KpiValue tone={tone} trailing={m.net !== 0 ? <Trend aria-hidden="true" /> : null}>
        {fmtVal(m.net, unit)}
      </KpiValue>
      <KpiFoot>Today: {fmtVal(todayPnl, unit)}</KpiFoot>
    </KpiCard>
  );
}

export function TradeWinCard({ m }) {
  // Decided trades only — breakevens are excluded from the rate, so the bar has to be
  // drawn over the same denominator or the two disagree on the same card.
  const decided = m.wins + m.losses;
  return (
    <KpiCard>
      <KpiLabel info={<Explain size={13} nudgeY={-1} openUp>Share of decided trades (wins + losses, excluding breakeven) that closed as a win.</Explain>}>
        Trade win %
      </KpiLabel>
      <KpiValue>{m.winRate.toFixed(2)}%</KpiValue>
      <KpiSpacer />
      <KpiSplitBar share={decided ? m.wins / decided : 0} />
      <KpiFoot>{m.wins}W / {m.losses}L</KpiFoot>
    </KpiCard>
  );
}

export function ProfitFactorCard({ m }) {
  const pf = m.profitFactor;
  const infinite = pf === 999;
  /* THE VERDICT LINE, and the reason this card colours its number while Day Win % does
   * not. Profit factor has an absolute threshold that means something: above 1.0 the
   * account makes money, below it does not, however good the win rate looks. A win rate
   * of 61% has no such line — 61% is excellent with a 3:1 payoff and ruinous with 1:3 —
   * so colouring it would assert a judgement the number cannot support. */
  const tone = infinite || pf > 1 ? 'pos' : pf === 1 || pf === 0 ? 'flat' : 'neg';
  const verdict = infinite ? 'No losing trades yet'
    : pf > 1 ? 'Healthy · above 1.0'
      : pf === 1 ? 'Breakeven · exactly 1.0'
        : 'Losing · below 1.0';
  return (
    <KpiCard>
      <KpiLabel info={<Explain size={13} nudgeY={-1} openUp>Gross profit divided by gross loss. Above 1 means the account is net profitable.</Explain>}>
        Profit factor
      </KpiLabel>
      <KpiValue tone={tone}>{infinite ? '∞' : pf.toFixed(2)}</KpiValue>
      <KpiSpacer />
      <KpiFoot tone={tone}>{verdict}</KpiFoot>
    </KpiCard>
  );
}

export function DayWinCard({ days }) {
  return (
    <KpiCard>
      <KpiLabel info={<Explain size={13} nudgeY={-1} openUp>Share of trading days that closed net positive.</Explain>}>
        Day win %
      </KpiLabel>
      <KpiValue>{days.rate.toFixed(2)}%</KpiValue>
      <KpiSpacer />
      <KpiFoot>{days.winDays} of {days.total} day{days.total === 1 ? '' : 's'} green</KpiFoot>
    </KpiCard>
  );
}

export function AvgWinLossCard({ m }) {
  const r = m.avgWinLoss;
  const infinite = r === Infinity;
  // Describes the ratio rather than judging it — see ProfitFactorCard on why this one
  // gets no tone. A 0.6 ratio is fine at a 70% win rate.
  const shape = infinite ? 'No losing trades yet'
    : r >= 1.5 ? 'Winners run much larger'
      : r >= 1 ? 'Winners run a bit larger'
        : 'Losers run larger';
  return (
    <KpiCard>
      <KpiLabel info={<Explain size={13} nudgeY={-1} openUp>Average size of a winning trade divided by the average size of a losing trade.</Explain>}>
        Avg win/loss trade
      </KpiLabel>
      <KpiValue>{infinite ? '∞' : r.toFixed(2)}</KpiValue>
      <KpiSpacer />
      <KpiFoot>{shape}</KpiFoot>
    </KpiCard>
  );
}
