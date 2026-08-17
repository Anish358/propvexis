import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { appCss } from './helpers/app-css.js';
import {
  summarizeDay, groupByDay, summarizeAll, holdMinutes, fmtMins, dayTitle, dayRelative,
} from '../frontend/src/features/calendar/dayStats.js';

// The Daily Journal: a feed of day cards. The numbers come from dayStats.js, which
// is plain JS and asserted directly here; the components are JSX (node can't import
// those) so their structure is read from source.
const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const page = read('../frontend/src/features/calendar/DayView.jsx');
const card = read('../frontend/src/features/calendar/DayCard.jsx');
const work = read('../frontend/src/features/calendar/DayJournalWorkspace.jsx');
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
  // The old prev/next stepper is gone — the feed IS the stepping. (The workspace has
  // arrows of its own, which is a different job: moving the subject of an open review
  // rather than choosing which day to open. See the test further down.)
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

test('the action reads Journal, and opens the day in the workspace', () => {
  assert.match(card, /className="dc-journal"[\s\S]*?Journal/);
  assert.ok(!card.includes('Add Trades'), 'renamed from Add Trades');
  assert.match(card, /onJournal\(day\)/);
  assert.match(page, /<DayJournalWorkspace/);
  // The per-trade note still writes `trades.comments` — the same field the trade
  // log's Notes column and the preview panel read, through the existing partial
  // PATCH. The workspace widened WHAT can be edited, not where any of it is stored.
  assert.match(work, /'comments'/);
  assert.match(page, /onSaveTrade=\{saveTrade\}/);
  // The day note is the one thing that needed a store of its own, because it
  // belongs to the session rather than to any trade.
  assert.match(page, /onSaveDayNote=\{persistDayNote\}/);
  assert.match(page, /dayNote=\{dayNotes\[liveJournalDay\.key\] \|\| ''\}/);
});

test('the workspace is master-detail: the rail selects, the centre follows', () => {
  // The sketch's "the centre panel instantly updates" — selection is local state,
  // so there is no fetch and nothing to wait for.
  assert.match(work, /const \[selId, setSelId\] = useState/);
  assert.match(work, /<RailRow/);
  assert.match(work, /onSelect=\{setSelId\}/);
  // Selection is by CLICK, not by pointer hover: the centre panel holds editable
  // fields, and hover-selection would swap the form out from under half-typed input.
  assert.ok(!/onMouseEnter|onMouseOver/.test(work), 'hover must not change the subject');
  // Every region the layout calls for.
  for (const area of ['djw-rail', 'djw-detail', 'djw-shots', 'djw-acct', 'djw-notes']) {
    assert.ok(work.includes(area), `${area} must exist in the workspace`);
  }
  assert.match(css, /grid-template-areas:\s*\n?\s*"rail detail side"\s*\n?\s*"rail notes {2}notes"/);
});

test('the two notes are two different thoughts, and both are wired', () => {
  // Trade note on the left, session note on the right — see the component header.
  assert.match(work, /aria-label="Trade note"/);
  assert.match(work, /aria-label="Day review"/);
  assert.match(work, /onChange=\{set\('comments'\)\}/);
  assert.match(work, /setNoteTouched\(true\); setNoteDraft\(e\.target\.value\)/);
  // The day note keeps seeding from the prop until the user types, because DayView
  // fetches it asynchronously — seeded once, a late arrival would leave an empty box
  // that reads as a pending change and overwrites the stored note on Save.
  assert.match(work, /if \(!noteTouched\) setNoteDraft\(dayNote\)/);
  // §3 names the journal note field as prose: 1.6 leading and a 68ch measure.
  const rule = css.slice(css.indexOf('.djw-modal .djw-note {'), css.indexOf('}', css.indexOf('.djw-modal .djw-note {')));
  assert.match(rule, /line-height: 1\.6/);
  assert.match(rule, /max-width: 68ch/);
});

test('only what changed is sent, and a partial failure keeps what landed', () => {
  // Saving every field of every trade would mark untouched trades tagged and bump
  // their updated_at. Sending an unchanged SL would also re-derive Max R and Fixed R
  // for what was only a note edit.
  assert.match(work, /const changedOn = \(t\) => EDITABLE\.filter\(\(k\) => \(draft\[t\.id\]\?\.\[k\] \?\? ''\) !== str\(t\[k\]\)\)/);
  assert.match(work, /for \(const k of changedOn\(t\)\)/);
  // Same partial-failure discipline as the trade log's bulk actions.
  assert.match(work, /Promise\.allSettled/);
  assert.match(work, /didn't save/);
  assert.match(work, /disabled=\{saving \|\| pending === 0\}/);
  // The day note counts as one pending change alongside the dirty trades.
  assert.match(work, /const pending = dirtyTrades\.length \+ \(noteDirty \? 1 : 0\)/);
});

test('the workspace steps to the day either side of the one open', () => {
  assert.match(work, /function DayStep/);
  assert.match(work, /dir === 'prev' \? 'Previous day' : 'Next day'/);
  assert.match(work, /<ChevronLeft/);
  assert.match(work, /<ChevronRight/);
  // The feed is newest-first, so the OLDER day — "previous" — is the next index up,
  // and the arrows can only reach days the page itself would show (filters included).
  assert.match(page, /prevDay=\{days\[journalIdx \+ 1\] \|\| null\}/);
  assert.match(page, /nextDay=\{journalIdx > 0 \? days\[journalIdx - 1\] : null\}/);
  // Stepping past the paging window extends it, so closing lands on that day's card.
  assert.match(page, /setShown\(\(n\) => Math\.max\(n, i \+ 1\)\)/);
  assert.match(css, /\.djw-nav \{/);
  // The date moved inside the nav, so the narrow layout has to place the nav — a rule
  // still targeting `.djw-date` there would leave the arrows in the header's top row.
  assert.match(css, /\.djw-nav \{ grid-row: 2; grid-column: 1 \/ -1; \}/);
});

test('a step with unsaved changes arms rather than discarding them', () => {
  // Drafts are keyed on the day, so walking to Tuesday would silently drop what is
  // typed on Wednesday. Two presses, no second dialog over the dialog.
  assert.match(work, /if \(pending > 0 && armed !== target\.key\) \{ setArmed\(target\.key\); return; \}/);
  assert.match(work, /press again to leave this day/);
  // Per-target, so arming one direction and pressing the other asks again.
  assert.match(work, /armed !== target\.key/);
  // Typing disarms: an arm from before a paragraph was written must not authorise
  // discarding the paragraph.
  assert.match(work, /useEffect\(\(\) => \{ setArmed\(null\); \}, \[draft, noteDraft\]\)/);
  // Disabled is only about a day existing (or a save in flight) — Chrome fires no
  // pointer events on a disabled control, so a disabled arrow could take neither the
  // second press nor show its tooltip.
  assert.match(work, /disabled=\{disabled \|\| !target\}/);
  assert.match(css, /\.djw-status\.is-warn \{ color: var\(--warning\); \}/);
});

test('the day filter narrows the rail without moving the trade being journalled', () => {
  // Additive facets, so none checked means all — which is why these are checkboxes and
  // not radios.
  assert.match(work, /const OUTCOMES = \[\['win', 'Winners'\], \['loss', 'Losers'\], \['be', 'Breakeven'\]\]/);
  assert.match(work, /<MenuCheckboxItem/);
  assert.match(work, /if \(wanted\.size && !wanted\.has\(tradeOutcome\(t, unit, beRounding\)\)\) return false;/);
  assert.match(work, /if \(facets\.has\('unwritten'\) && \(draft\[t\.id\]\?\.comments \|\| ''\)\.trim\(\)\) return false;/);
  // The rail says what is hidden, or a filtered view reads as lost trades.
  assert.match(work, /\{rows\.length\} of \{trades\.length\}/);
  assert.match(work, /No trades match the filter\./);
  // `selId` is deliberately NOT reconciled against `rows`: a filter narrows what you can
  // REACH, and yanking the centre panel away would discard edits in progress.
  assert.ok(!/setSelId\(rows/.test(work), 'a filter must not re-select — see the comment on `rows`');
  // Where the menu itself renders is the shell's business now, and it has to be: on the
  // dropdown tier it opened UNDER the modal's own scrim and could not be seen at all.
  // modal-shell.test.js owns that chain.
  assert.match(work, /<MenuContent className="djw-filter-menu">/);
  assert.match(css, /\.djw-filter-menu \{ width: 180px; \}/);
});

test('the workspace originates no colour of its own', () => {
  // A page may not invent visual values, and green/red are reserved for outcomes.
  // Both are why the tone classes below are the only colour decision in the JSX.
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(work), 'no raw colour literal in the workspace');
  assert.ok(!/rgba?\(/.test(work), 'no raw colour function in the workspace');
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
