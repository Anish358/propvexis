import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { appCss } from './helpers/app-css.js';
import {
  summarizeDay, groupByDay, summarizeAll, holdMinutes, fmtMins, dayTitle, dayRelative,
} from '../frontend/src/dayStats.js';

// The Daily Journal: a feed of day cards. The numbers come from dayStats.js, which
// is plain JS and asserted directly here; the components are JSX (node can't import
// those) so their structure is read from source.
const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const page = read('../frontend/src/DayView.jsx');
const card = read('../frontend/src/DayCard.jsx');
const modal = read('../frontend/src/DayJournalModal.jsx');
const css = appCss;

// Two days. Day 1 nets +1R over three trades (one breakeven); day 2 nets -1R.
const T = (over) => ({
  open_time: '2026-07-24T10:00:00Z', close_time: '2026-07-24T10:30:00Z',
  volume: 0.5, ...over,
});
const DAY1 = [
  T({ id: 1, fixed_r: 2, pnl_money: 200, close_time: '2026-07-24T09:30:00Z', open_time: '2026-07-24T09:00:00Z', comments: 'clean' }),
  T({ id: 2, fixed_r: -1, pnl_money: -100, close_time: '2026-07-24T11:00:00Z', open_time: '2026-07-24T10:00:00Z' }),
  T({ id: 3, fixed_r: 0, pnl_money: 0, close_time: '2026-07-24T14:00:00Z', open_time: '2026-07-24T13:00:00Z' }),
];
const DAY2 = [
  T({ id: 4, fixed_r: -1, pnl_money: -50, open_time: '2026-07-23T08:00:00Z', close_time: '2026-07-23T08:15:00Z' }),
];

// ---- per-day numbers --------------------------------------------------------

test('a day summarises its own session', () => {
  const s = summarizeDay(DAY1, 'R');
  assert.equal(s.trades, 3);
  assert.equal(s.net, 1);
  assert.equal(s.winners, 1);
  assert.equal(s.losers, 1);
  assert.equal(s.breakeven, 1);
  // Win rate is over DECIDED trades — a breakeven is neither, and counting it in
  // the denominator would quietly drag the rate down. Matches computeMetrics.
  assert.equal(s.winRate, 50);
  assert.equal(s.best, 2);
  assert.equal(s.worst, -1);
  assert.equal(s.lots, 1.5);
  assert.equal(s.notes, 1);
});

test('values follow the display unit', () => {
  assert.equal(summarizeDay(DAY1, 'R').net, 1);
  assert.equal(summarizeDay(DAY1, 'USD').net, 100);
  assert.equal(summarizeDay(DAY1, 'USD').best, 200);
});

test('the curve starts at zero and ends at the day net', () => {
  const { curve, net } = summarizeDay(DAY1, 'R');
  // A zero start is what makes the chart read as a curve from flat rather than
  // from the first trade's result.
  assert.equal(curve[0].cum, 0);
  assert.equal(curve.length, DAY1.length + 1);
  assert.equal(curve[curve.length - 1].cum, net);
  assert.deepEqual(curve.map((p) => p.cum), [0, 2, 1, 1]);
});

test('an unmeasurable hold is excluded from the average, not counted as zero', () => {
  assert.equal(holdMinutes({ open_time: '2026-07-24T10:00:00Z', close_time: '2026-07-24T10:45:00Z' }), 45);
  assert.equal(holdMinutes({ close_time: '2026-07-24T10:45:00Z' }), null);
  assert.equal(holdMinutes({}), null);
  // 30 + 60 + 60 = 150 / 3
  assert.equal(summarizeDay(DAY1, 'R').avgDuration, 50);
  // With one hold unmeasurable, the average is over the other two — not dragged
  // toward zero by a trade whose length we don't know.
  const mixed = [DAY1[0], { ...DAY1[1], open_time: null }];
  assert.equal(summarizeDay(mixed, 'R').avgDuration, 30);
  // No measurable holds at all reads as "unknown", not "0m".
  assert.equal(summarizeDay([{ fixed_r: 1 }], 'R').avgDuration, null);
});

test('an empty day is all nulls rather than misleading zeros', () => {
  const s = summarizeDay([], 'R');
  assert.equal(s.trades, 0);
  assert.equal(s.net, 0);
  assert.equal(s.winRate, null, 'no trades is not a 0% win rate');
  assert.equal(s.best, null);
  assert.equal(s.worst, null);
  assert.equal(s.avgDuration, null);
});

test('durations format at the scale they are', () => {
  assert.equal(fmtMins(0), '0m');
  assert.equal(fmtMins(45), '45m');
  assert.equal(fmtMins(60), '1h');
  assert.equal(fmtMins(135), '2h 15m');
  assert.equal(fmtMins(1500), '1d 1h');
  assert.equal(fmtMins(null), '—');
});

// ---- the feed ---------------------------------------------------------------

test('days are grouped newest first, each with its trades in time order', () => {
  const days = groupByDay([...DAY2, ...DAY1], 'R');
  assert.deepEqual(days.map((d) => d.key), ['2026-07-24', '2026-07-23']);
  assert.deepEqual(days[0].trades.map((t) => t.id), [1, 2, 3], 'trades ascend through the day');
  assert.equal(days[0].stats.net, 1);
  assert.equal(days[1].stats.net, -1);
});

test('a day with nothing scorable in the active unit is not a card', () => {
  // A card of dashes isn't a day's review. R-only trades vanish from a $ view and
  // vice versa, matching every other page's unit handling.
  const rOnly = [{ id: 9, fixed_r: 1, close_time: '2026-07-24T10:00:00Z' }];
  assert.equal(groupByDay(rOnly, 'R').length, 1);
  assert.equal(groupByDay(rOnly, 'USD').length, 0);
  assert.equal(groupByDay([{ id: 8, fixed_r: 1 }], 'R').length, 0, 'no close_time = no day');
});

test('the summary strip agrees with the cards under it', () => {
  const days = groupByDay([...DAY1, ...DAY2], 'R');
  const all = summarizeAll(days);
  assert.equal(all.days, 2);
  assert.equal(all.trades, 4);
  assert.equal(all.net, 0, '+1 and -1');
  assert.equal(all.winners, 1);
  assert.equal(all.losers, 2);
  assert.equal(all.journaled, 1);
  // Green days is a DAY-level rate, distinct from trade win rate.
  assert.equal(all.greenDays, 1);
  assert.equal(all.dayWinRate, 50);
  assert.equal(summarizeAll([]).dayWinRate, null);
});

test('a day is titled by its date, with Today/Yesterday named', () => {
  assert.equal(dayTitle('2026-07-24'), 'Friday, 24 Jul 2026');
  const now = new Date('2026-07-24T12:00:00');
  assert.equal(dayRelative('2026-07-24', now), 'Today');
  assert.equal(dayRelative('2026-07-23', now), 'Yesterday');
  assert.equal(dayRelative('2026-07-22', now), null);
});

// ---- page + card structure --------------------------------------------------

test('the page is a feed of days, not one day behind arrows', () => {
  assert.match(page, /<DayCard/);
  assert.match(page, /days\.slice\(0, shown\)/);
  // The old prev/next stepper is gone — the feed IS the stepping.
  assert.ok(!page.includes('Previous trading day'), 'the day stepper should be gone');
  assert.ok(!page.includes('dv-nav'), 'the old nav row should be gone');
  // Several days can be open at once; reviewing two side by side is the point.
  assert.match(page, /new Set\(\)/);
  assert.match(page, /next\.has\(key\) \? next\.delete\(key\)|if \(next\.has\(key\)\) next\.delete\(key\)/);
});

test('the Summary strip and its one control match the layout', () => {
  assert.match(page, /className="dv-bar-label">Summary</);
  assert.match(page, /className=\{`dv-expand/);
  assert.match(page, /aria-pressed=\{allOpen\}/);
  assert.match(css, /\.dv-expand \{[\s\S]*?border-radius: var\(--r-full\)/);
  assert.match(css, /\.dv-bar \{/);
});

test('the card header carries the date, result and actions — and no stepper', () => {
  // The date IS the title (item 3), and the date stepper next to it is gone (item 4)
  // because the page is a feed.
  assert.match(card, /<h3 className="dc-title">\{dayTitle\(key\)\}<\/h3>/);
  assert.ok(!card.includes('Trade Details'));
  assert.ok(!/dir="prev"|dir="next"/.test(card), 'no date stepper on the card');
  assert.match(card, /className=\{`dc-net \$\{netTone\}`\}/);
  assert.match(card, /\{stats\.trades\} trade/);
});

test('the action reads Journal, and opens the day for writing', () => {
  assert.match(card, /className="dc-journal"[\s\S]*?Journal/);
  assert.ok(!card.includes('Add Trades'), 'renamed from Add Trades');
  assert.match(card, /onJournal\(day\)/);
  assert.match(page, /<DayJournalModal/);
  // It writes the same field the trade log's Notes column reads, through the
  // existing partial PATCH — not a parallel store that would need a migration.
  assert.match(modal, /comments: draft\[t\.id\]\.trim\(\) \|\| null/);
  assert.match(page, /onSave=\{saveTrade\}/);
});

test('only changed notes are sent', () => {
  // Saving every note would mark untouched trades tagged and bump updated_at.
  assert.match(modal, /const changed = trades\.filter\(\(t\) => \(draft\[t\.id\] \?\? ''\) !== \(t\.comments \|\| ''\)\)/);
  assert.match(modal, /changed\.map\(\(t\) => onSave/);
  // Same partial-failure discipline as the trade log's bulk actions.
  assert.match(modal, /Promise\.allSettled/);
  assert.match(modal, /didn't save/);
  assert.match(modal, /disabled=\{saving \|\| changed\.length === 0\}/);
});

test('trades sit behind a disclosure, collapsed by default', () => {
  // Every card starting expanded would bury the second day below the fold.
  assert.match(card, /\{open && \(/);
  assert.match(card, /className="dc-disclose"/);
  assert.match(card, /aria-expanded=\{open\}/);
  assert.match(page, /open=\{openDays\.has\(day\.key\)\}/);
  assert.match(page, /const \[openDays, setOpenDays\] = useState\(\(\) => new Set\(\)\)/);
});

test('the review — curve plus the eight figures — is always visible', () => {
  // The summary is the point of the card; it must not be hidden behind the same
  // disclosure as the row detail.
  const body = card.slice(card.indexOf('<div className="dc-body">'), card.indexOf('{open && ('));
  for (const label of ['Gross P&L', 'Winners', 'Losers', 'Win rate', 'Total lots', 'Avg duration', 'Best trade', 'Worst trade']) {
    assert.ok(body.includes(label), `${label} should be in the always-visible body`);
  }
  assert.match(body, /<DayCurve/);
  assert.match(css, /\.dc-tiles \{[^}]*repeat\(4, minmax\(0, 1fr\)\)/);
});

test('the curve is inline SVG, and survives a flat or single-trade day', () => {
  // No chart library for something that repeats once per day.
  assert.match(card, /export function DayCurve/);
  assert.ok(!card.includes('recharts'));
  // A flat day would divide by zero; a one-point day has no line to draw.
  assert.match(card, /const span = max - min \|\| 1;/);
  assert.match(card, /if \(pts\.length < 2\) return/);
  // Breakeven reference line, so "ended up" is visibly above flat.
  assert.match(card, /dc-curve-zero/);
});
