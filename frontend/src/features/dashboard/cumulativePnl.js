/* The Cumulative P&L card's arithmetic, kept out of the JSX so it can be tested.
 *
 * The card used to paint the WHOLE curve in one colour, chosen from where the curve
 * ENDED — so a month that went $4,000 up and then gave $5,000 back drew its entire
 * profitable half in red, and a month that recovered drew its entire drawdown in green.
 * The sign of a cumulative P&L is not a property of the series; it is a property of
 * every point in it, and the curve now says so: green above zero, red below, on the
 * same line.
 *
 * Doing that needs three things a Recharts <Area> will not work out on its own — where
 * zero sits inside the plotted band, an axis whose domain does not move that answer,
 * and a baseline at zero rather than at the bottom of the card. All three are here.
 */

/** Round `n` to cents — cumulative sums drift otherwise. */
const cents = (n) => Math.round(n * 100) / 100;

/**
 * The running total, one point per day, STARTING AT ZERO.
 *
 * The leading point is not decoration. Without it the curve begins at the first day's
 * result, so a first day of +$800 draws a flat line at $800 and the $800 is invisible —
 * the reader sees a chart that starts wherever it starts and cannot tell profit from
 * baseline. Every equity curve in this app starts at its baseline; this one is a P&L,
 * so its baseline is zero.
 *
 * It is labelled rather than dated because there is no such trading day: the day before
 * the first one is not a fact about the account.
 *
 * @param {Array<{date: string, pnl: number}>} days   per-day rollup, ascending
 * @param {(d: string) => string} fmtDate             the card's date formatter
 */
export function cumulativeSeries(days = [], fmtDate = String) {
  let cum = 0;
  return [
    { label: 'Start', cum: 0 },
    ...days.map((d) => {
      cum += d.pnl;
      return { label: fmtDate(d.date), cum: cents(cum) };
    }),
  ];
}

/* A 1 / 2 / 5 ladder — the step sizes an axis is allowed to use, so the labels read
 * $500 / $1,000 / $1,500 rather than $437 / $874. */
function niceStep(span, target = 4) {
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const mult = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return mult * mag;
}

/**
 * The y-axis band, its ticks, and where zero falls inside the drawn shape.
 *
 * THE DOMAIN IS EXPLICIT so the axis reads in round numbers, and ZERO IS ALWAYS INSIDE
 * IT even for an account that has only ever been up: the zero line is the thing the
 * colours are about, and a chart that crops it out has no baseline to read the fill
 * against. Both bounds are rounded outward onto the tick step, which — because the step
 * ladder counts from zero — puts zero exactly on a tick.
 *
 * ── `zeroOffset` IS MEASURED AGAINST THE DATA, NOT AGAINST THAT AXIS. ───────────────
 * This is the subtle one, and getting it wrong drew a rising, entirely-profitable curve
 * half in red. An SVG <linearGradient> defaults to `gradientUnits="objectBoundingBox"`,
 * so its 0..1 runs down the BOUNDING BOX OF THE PATH IT PAINTS — not down the plotting
 * area, and not down the axis. The padding that makes the axis land on round numbers
 * (a $2,550 peak drawn on a $3,000 axis) is exactly the amount by which an
 * axis-derived offset would miss.
 *
 * Both painted paths share one bounding box, which is what lets one offset serve both:
 *   • the fill is drawn with baseValue={0}, so it spans the curve and the zero line;
 *   • the stroke spans the curve, and the curve ALWAYS TOUCHES ZERO because
 *     cumulativeSeries() begins there.
 * So each box is [dataMin, dataMax] with dataMin ≤ 0 ≤ dataMax, and the fraction of it
 * above zero is dataMax / (dataMax − dataMin).
 *
 * `type="monotone"` is what makes that safe: a monotone spline cannot overshoot its
 * data points, so the path stays inside the box its numbers describe. A plain cubic
 * would bulge past it and drag the split off zero again.
 *
 * @param {Array<{cum: number}>} data  the series from cumulativeSeries()
 * @returns {{domain: [number, number], ticks: number[], zeroOffset: number}}
 *   `zeroOffset` is the fraction from the TOP, the direction a linearGradient runs
 *   (y1=0 is the top) — 1 means everything drawn is profit, 0 means it is all loss.
 */
export function pnlAxis(data = []) {
  const vals = data.map((d) => d.cum).filter((n) => Number.isFinite(n));
  const lo = Math.min(0, ...vals, 0);
  const hi = Math.max(0, ...vals, 0);
  const zeroOffset = hi === lo ? 0.5 : hi / (hi - lo);

  // A flat-zero account has no span to divide; give it a symmetric $1 band so the
  // axis still draws and the offset is defined.
  if (hi === lo) return { domain: [-1, 1], ticks: [-1, 0, 1], zeroOffset };

  const step = niceStep(hi - lo);
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  // Both bounds sit on the step ladder, so the accumulation below is exact enough for
  // a tick list; the rounding keeps floating-point dust out of the labels.
  const ticks = [];
  for (let t = min; t <= max + step / 2; t += step) ticks.push(cents(t));

  return { domain: [min, max], ticks, zeroOffset };
}
