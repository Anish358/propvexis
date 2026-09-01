import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cumulativeSeries, pnlAxis } from '../frontend/src/features/dashboard/cumulativePnl.js';

// The dashboard's Cumulative P&L card. It painted the whole curve one colour — first
// always green, then the colour of wherever the curve ENDED — so a series that crossed
// zero was drawn entirely in the sign it happened to finish on. These pin the two
// things that make a signed curve possible: a series that starts at zero, and an axis
// that agrees with the gradient about where zero sits.

const day = (date, pnl) => ({ date, pnl });

// --- the series -----------------------------------------------------------
test('cumulativeSeries: starts at zero, then runs the total', () => {
  const out = cumulativeSeries([day('2026-06-01', 800), day('2026-06-02', -300)]);
  assert.equal(out.length, 3, 'the leading baseline point plus one per day');
  assert.deepEqual(out[0], { label: 'Start', cum: 0 });
  assert.equal(out[1].cum, 800);
  assert.equal(out[2].cum, 500);
});

test('cumulativeSeries: an account with no days is still a baseline, not an empty chart', () => {
  // The card keys its empty state on `days`, not on this — but the series must stay
  // well-formed either way or pnlAxis has nothing to measure.
  assert.deepEqual(cumulativeSeries([]), [{ label: 'Start', cum: 0 }]);
});

test('cumulativeSeries: the running total is rounded to cents, not accumulated raw', () => {
  const out = cumulativeSeries([day('2026-06-01', 0.1), day('2026-06-02', 0.2)]);
  assert.equal(out[2].cum, 0.3, 'float dust must not reach the axis labels');
});

test('cumulativeSeries: labels come from the caller\'s formatter', () => {
  const out = cumulativeSeries([day('2026-06-01', 10)], () => '1 Jun');
  assert.equal(out[1].label, '1 Jun');
  assert.equal(out[0].label, 'Start', 'the baseline is not a date — there is no such trading day');
});

// --- the axis -------------------------------------------------------------
test('pnlAxis: zero is inside the band even when the account has only ever been up', () => {
  const { domain, zeroOffset } = pnlAxis(cumulativeSeries([day('2026-06-01', 4000)]));
  assert.equal(domain[0], 0, 'the floor is zero, not the lowest plotted value');
  assert.equal(zeroOffset, 1, 'everything plotted is profit, so the whole band is green');
});

test('pnlAxis: an account that has only ever been down is entirely below the line', () => {
  const { domain, zeroOffset } = pnlAxis(cumulativeSeries([day('2026-06-01', -2500)]));
  assert.equal(domain[1], 0);
  assert.equal(zeroOffset, 0, 'nothing plotted is profit, so the whole band is red');
});

test('pnlAxis: a curve that crosses zero splits proportionally, measured from the TOP', () => {
  // +$1,000 then down to -$1,000: zero sits exactly halfway down a symmetric band.
  const data = cumulativeSeries([day('2026-06-01', 1000), day('2026-06-02', -2000)]);
  const { domain, zeroOffset } = pnlAxis(data);
  assert.deepEqual(domain, [-1000, 1000]);
  assert.equal(zeroOffset, 0.5);
});

test('pnlAxis: zeroOffset is the fraction of the band ABOVE zero, matching an SVG gradient run', () => {
  // A linearGradient with y1=0,y2=1 runs top-to-bottom, so the offset the green/red
  // stops share has to be measured from the top or the colours land upside down.
  // Peak +$3,000, trough -$1,000 -> nice step 1000, band [-1000, 3000], 3/4 above zero.
  const data = cumulativeSeries([day('2026-06-01', 3000), day('2026-06-02', -4000)]);
  const { domain, zeroOffset } = pnlAxis(data);
  assert.deepEqual(domain, [-1000, 3000]);
  assert.equal(zeroOffset, 0.75);
});

test('pnlAxis: the offset follows the DATA, not the padded axis — the bug that drew a profitable curve half in red', () => {
  /* An SVG linearGradient defaults to gradientUnits="objectBoundingBox", so its 0..1
   * runs down the bounding box of the PATH, not down the axis. Deriving the offset from
   * the rounded axis domain missed by exactly the padding that makes the ticks round.
   * Peak +$2,550, trough -$400: the data box splits at 2550/2950, while the $1,000-step
   * axis [-1000, 3000] would have split at 0.75 — a visibly different height. */
  const data = cumulativeSeries([day('2026-06-01', 2550), day('2026-06-02', -2950)]);
  const { domain, zeroOffset } = pnlAxis(data);
  assert.deepEqual(domain, [-1000, 3000], 'the axis still rounds outward for legible ticks');
  assert.equal(Number(zeroOffset.toFixed(4)), Number((2550 / 2950).toFixed(4)));
  assert.notEqual(zeroOffset, 3000 / 4000, 'an axis-derived offset is the defect');
});

test('pnlAxis: the split lands exactly on zero for the shape the chart actually paints', () => {
  // Both painted paths share one box: the fill spans the curve and the zero baseline
  // (baseValue={0}), and the stroke spans the curve, which always touches zero because
  // cumulativeSeries() begins there. So one offset is correct for both.
  for (const pnls of [[900, -1500, 400], [3000, -500], [-700, 2200], [50, 50, 50]]) {
    const data = cumulativeSeries(pnls.map((p, i) => day(`2026-06-0${i + 1}`, p)));
    const vals = data.map((d) => d.cum);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    assert.ok(lo <= 0 && hi >= 0, 'the drawn box always contains zero');
    const { zeroOffset } = pnlAxis(data);
    // The height of zero inside the box, measured from the top, IS the offset.
    assert.equal(Number(zeroOffset.toFixed(6)), Number((hi / (hi - lo)).toFixed(6)));
  }
});

test('pnlAxis: every tick is a round number and zero is always one of them', () => {
  const data = cumulativeSeries([day('2026-06-01', 437), day('2026-06-02', -1310)]);
  const { ticks, domain } = pnlAxis(data);
  assert.ok(ticks.includes(0), 'the line the colours split on must be a labelled tick');
  assert.equal(ticks[0], domain[0]);
  assert.equal(ticks[ticks.length - 1], domain[1]);
  for (const t of ticks) assert.equal(t, Math.round(t), 'the 1/2/5 ladder must not emit cents');
});

test('pnlAxis: the domain contains every plotted point', () => {
  const data = cumulativeSeries([day('2026-06-01', 1234), day('2026-06-02', -5678), day('2026-06-03', 900)]);
  const { domain } = pnlAxis(data);
  for (const p of data) {
    assert.ok(p.cum >= domain[0] && p.cum <= domain[1], `${p.cum} outside [${domain}]`);
  }
});

test('pnlAxis: a flat-zero account gets a real band rather than a divide-by-zero', () => {
  const { domain, ticks, zeroOffset } = pnlAxis(cumulativeSeries([]));
  assert.ok(domain[1] > domain[0], 'a zero-height band would make the gradient offset NaN');
  assert.equal(zeroOffset, 0.5);
  assert.ok(ticks.includes(0));
});
