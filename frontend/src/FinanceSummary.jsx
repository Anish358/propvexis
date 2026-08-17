import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  ReferenceLine, Legend, PieChart, Pie, Cell,
} from 'recharts';
import {
  Card, Tabs, EmptyState, ToggleGroupExclusive, ToggleGroupItem,
} from '@/components/primitives';
import { fmtMoney, fmtMoneyShort } from './metrics.js';
import { chartPalette } from './theme.js';
import { BREAKDOWN_DIMS, RANGES, clipSeries, financeBreakdown } from './financeData.js';

// Prop OS › Finance › Summary — the two analytical cards under the KPI row.
//
// Both read the SAME ledger the KPI row and the transaction table read (see
// financeData.js), so nothing here decides a number; these components choose a
// projection and draw it.
//
// Colour comes from chartPalette() called DURING RENDER, never captured into a
// module const — a capture pins every chart to whichever theme was active on first
// load, which is the bug the palette cache exists to avoid.

const signTone = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
const roiText = (r) => (r == null ? '—' : `${r}%`);
// Axis labels are dates, and the year is the same for every tick in a window that
// matters — so the tick is MM-DD and the tooltip carries the full day.
const tick = (d) => String(d).slice(5);
// fmtMoneyShort signs its output because it was written for P&L cells, where the
// sign IS the reading. An axis tick is a position on a scale, not a figure, and
// "+$6k" reads as a gain of six thousand rather than as the six-thousand line.
const axisTick = (v) => fmtMoneyShort(v).replace(/^\+/, '');

/* MOUNT ANIMATION IS OFF, and this is the one place the module departs from the
 * other charts in the app (Analytics and Reports take Recharts' defaults).
 *
 * The reason is that this chart is not on a page you arrive at — it is behind a tab
 * AND behind a four-way range control, so Recharts' 1.5s grow-in replays on every
 * switch back to Summary and again on every 1W/1M/1Y/All click. Motion that reads as
 * a polished entrance once becomes a stutter between two figures you are trying to
 * compare, and a finance chart's job is to be readable the instant it is on screen.
 * The interaction that matters here is the tooltip, which is unaffected. */
const NO_GROW_IN = false;

// ---------------------------------------------------------------------------
// ROI Progression — the running balance of the business.
//
// NET IS AN AREA AND THE OTHER TWO ARE LINES, which is the one piece of visual
// hierarchy this chart needs: net is the answer (and the series that crosses zero,
// so it needs a baseline to cross), while earned and spent are the two inputs you
// read to explain it. Three equal lines would make the reader work out which one
// matters. The gradient is split at the zero line rather than applied to the whole
// area, so time spent below breakeven is legible as such instead of as a lighter
// green.
// ---------------------------------------------------------------------------

function RoiTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="fin-tip">
      <div className="fin-tip-day">{label}</div>
      <div className="fin-tip-row"><span>Earned</span><b>{fmtMoney(p.earned)}</b></div>
      <div className="fin-tip-row"><span>Spent</span><b>{fmtMoney(p.spent)}</b></div>
      <div className="fin-tip-row"><span>Net</span><b className={signTone(p.net)}>{fmtMoney(p.net, { sign: true })}</b></div>
      <div className="fin-tip-row"><span>ROI</span><b>{roiText(p.roiPct)}</b></div>
    </div>
  );
}

export function RoiProgressionCard({ series = [], totals }) {
  const [range, setRange] = useState('ALL');
  const data = useMemo(() => clipSeries(series, range), [series, range]);
  const p = chartPalette();

  // Where zero sits in the net range, as a fraction from the top — the gradient's
  // colour stop. All-positive or all-negative data pins it to an edge, which
  // collapses the split to a single colour without a special case.
  const nets = data.map((d) => d.net);
  const hi = Math.max(0, ...nets);
  const lo = Math.min(0, ...nets);
  const zero = hi === lo ? 1 : hi / (hi - lo);

  return (
    <Card className="fin-card fin-roi-card">
      <div className="fin-card-head">
        <div className="fin-card-titles">
          <h3>ROI Progression</h3>
          <p className="fin-card-sub">
            Cumulative earnings, spend and net position through every day money moved.
          </p>
        </div>
        <ToggleGroupExclusive value={range} onValueChange={setRange} aria-label="Chart range">
          {RANGES.map((r) => (
            <ToggleGroupItem key={r.value} value={r.value} size="sm">{r.label}</ToggleGroupItem>
          ))}
        </ToggleGroupExclusive>
      </div>

      {data.length < 2 ? (
        <EmptyState
          title="Not enough history yet"
          description="Two days of recorded payouts or fees draw the first curve. Log one from the Transactions tab."
        />
      ) : (
        <>
          <div className="fin-roi-figures">
            <span className="fin-figure">
              <span className="fin-figure-cap">Net</span>
              <b className={`fin-figure-val ${signTone(totals.net)}`}>{fmtMoney(totals.net, { sign: true })}</b>
            </span>
            <span className="fin-figure">
              <span className="fin-figure-cap">ROI</span>
              <b className="fin-figure-val">{roiText(totals.roiPct)}</b>
            </span>
          </div>
          <div className="fin-chart">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                <defs>
                  <linearGradient id="finNetFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset={0} stopColor={p.accent} stopOpacity={0.26} />
                    <stop offset={zero} stopColor={p.accent} stopOpacity={0.02} />
                    <stop offset={zero} stopColor={p.loss} stopOpacity={0.02} />
                    <stop offset={1} stopColor={p.loss} stopOpacity={0.22} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={p.grid} vertical={false} />
                <XAxis dataKey="date" stroke={p.axis} fontSize={11} tickFormatter={tick} tickMargin={8} minTickGap={24} />
                <YAxis stroke={p.axis} fontSize={11} tickFormatter={axisTick} width={56} />
                <Tooltip content={<RoiTooltip />} cursor={{ stroke: p.gridStrong }} />
                <ReferenceLine y={0} stroke={p.gridStrong} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 4 }} iconType="plainline" iconSize={12} />
                {/* LINEAR, NOT `monotone`, and for this data that is a correctness
                    point rather than a taste one. These are running totals that change
                    only on the days money moved, so between two points the balance was
                    FLAT — a spline bows through the gap and draws the account rising
                    before a payout landed and dipping before a fee was charged. The
                    app's equity curves can afford monotone because they interpolate a
                    continuously-changing value; a ledger balance is a step function. */}
                <Area
                  type="linear" dataKey="net" name="Net" stroke={p.accent} strokeWidth={2}
                  fill="url(#finNetFill)" dot={false} activeDot={{ r: 3 }} isAnimationActive={NO_GROW_IN}
                />
                <Line type="linear" dataKey="earned" name="Earned" stroke={p.profit} strokeWidth={1.5} dot={false} isAnimationActive={NO_GROW_IN} />
                <Line type="linear" dataKey="spent" name="Spent" stroke={p.loss} strokeWidth={1.5} dot={false} strokeDasharray="4 3" isAnimationActive={NO_GROW_IN} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Finance Breakdown — where the money goes, four ways.
//
// The ring is a share of SPEND on every tab and the list always carries spent /
// earned / net; financeData.js's header explains why that pairing rather than a
// ring of net. The palette walks the app's existing chart colours instead of
// generating a hue per slice: a breakdown with eleven firms in it is a list first
// and a ring second, and eleven invented colours would be eleven meanings the
// reader has to hold.
// ---------------------------------------------------------------------------

function ringColours(p) {
  return [p.accent, p.profit, p.payout, p.ai, p.loss, p.axis];
}

function BreakdownRing({ slices, total }) {
  const p = chartPalette();
  const colours = ringColours(p);
  const data = slices.filter((s) => s.spent > 0);
  if (!data.length) return null;

  return (
    <div className="fin-ring">
      <ResponsiveContainer width="100%" height={148}>
        <PieChart>
          <Pie data={data} dataKey="spent" nameKey="label" innerRadius={44} outerRadius={62} paddingAngle={2} stroke="none" isAnimationActive={NO_GROW_IN}>
            {data.map((s, i) => <Cell key={s.key} fill={colours[i % colours.length]} />)}
          </Pie>
          <Tooltip
            contentStyle={p.tip}
            labelStyle={{ color: p.label }}
            formatter={(v, n) => [fmtMoney(v), n]}
          />
        </PieChart>
      </ResponsiveContainer>
      {/* The hole carries the headline so the ring reads without the legend. */}
      <div className="fin-ring-center">
        <div className="fin-ring-num">{fmtMoney(total)}</div>
        <div className="fin-ring-cap">total spent</div>
      </div>
    </div>
  );
}

export function FinanceBreakdownCard({ ledger = [] }) {
  const [dim, setDim] = useState('firm');
  const bd = useMemo(() => financeBreakdown(ledger, dim), [ledger, dim]);
  const colours = ringColours(chartPalette());
  const spendRows = bd.slices.filter((s) => s.spent > 0);

  return (
    <Card className="fin-card fin-breakdown-card">
      <div className="fin-card-head">
        <div className="fin-card-titles">
          <h3>Finance Breakdown</h3>
          <p className="fin-card-sub">Where spend and earnings sit across the operation.</p>
        </div>
      </div>

      <Tabs className="fin-breakdown-tabs" tabs={BREAKDOWN_DIMS} value={dim} onChange={setDim} />

      {bd.slices.length === 0 ? (
        <EmptyState
          title="Nothing to break down"
          description="Fees and payouts you record are attributed to their account's firm, type and size automatically."
        />
      ) : (
        <>
          <BreakdownRing slices={bd.slices} total={bd.spent} />
          <div className="fin-breakdown-list">
            {bd.slices.map((s) => {
              // Only ring slices get a colour key; a row with no spend is not in the
              // ring, so giving it a swatch would point at a wedge that isn't there.
              const idx = spendRows.findIndex((r) => r.key === s.key);
              return (
                <div className="fin-bd-row" key={s.key}>
                  <div className="fin-bd-head">
                    <span className="fin-bd-name">
                      <span
                        className="fin-bd-dot"
                        style={{ background: idx >= 0 ? colours[idx % colours.length] : 'var(--line-strong)' }}
                      />
                      {s.label}
                    </span>
                    <span className={`fin-bd-net ${signTone(s.net)}`}>{fmtMoney(s.net, { sign: true })}</span>
                  </div>
                  <div className="fin-bd-facts">
                    <span>Spent <b>{fmtMoney(s.spent)}</b></span>
                    <span>Earned <b>{fmtMoney(s.earned)}</b></span>
                    {s.share > 0 && <span className="fin-bd-share">{s.share}% of spend</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}
