import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSrc, stripComments, allSrcFiles } from './helpers/src-files.js';
import { appCss } from './helpers/app-css.js';

/* ONE CALENDAR, EVERYWHERE, WITH ITS WEEK COLUMN.
 *
 * `weeks` let the Dashboard drop the 8th column while Prop OS and Accounts › Details
 * kept it — a defensible split when the Dashboard's calendar shared a 3-column grid, and
 * a fork waiting to happen once it did not. The owner's call is that the app has ONE
 * calendar and every surface gets the same one, so the prop is gone rather than
 * defaulted: a prop that only ever takes one value is the seam a second version grows
 * from.
 */

const cal = readSrc('components/primitives/calendar.jsx');
const month = readSrc('features/calendar/MonthCalendar.jsx');

test('the week column is not optional any more', () => {
  assert.ok(!/weeks/.test(stripComments(month).replace(/\bweeks\b(?=\s*it has)/g, '')),
    'MonthCalendar still branches on a `weeks` prop');
  // Eight columns, always: seven days and the summary.
  assert.match(month, /Array\.from\(\{ length: 8 \}/, 'a blank row must still span all eight');
  assert.match(cal, /columns > 7\s*\n\s*\? `repeat\(\$\{columns - 1\}, minmax\(0, 1fr\)\) minmax\(0, 1\.1fr\)`/);
});

test('every caller renders the same calendar, with no per-page overrides', () => {
  const callers = allSrcFiles()
    .filter((f) => f.endsWith('.jsx'))
    .filter((f) => readSrc(f).includes('<MonthCalendar'));
  assert.ok(callers.length >= 4, `expected every surface to use it, found ${callers.length}`);
  for (const f of callers) {
    const src = readSrc(f);
    assert.ok(!/<MonthCalendar[\s\S]{0,400}?weeks=/.test(src), `${f} still overrides the shape`);
  }
});

test('there is no second calendar left in the tree', () => {
  // A grid of day cells built anywhere but the primitive is a second version by
  // definition, whatever it is called.
  const others = allSrcFiles()
    .filter((f) => f.endsWith('.jsx') && !f.endsWith('MonthCalendar.jsx'))
    .filter((f) => !f.startsWith('components/primitives/'))
    .filter((f) => /<CalCell|<CalGrid|<CalWeek/.test(readSrc(f)));
  assert.deepEqual(others, [], 'a page is assembling calendar cells itself');
});

test('the dead legacy calendar CSS is gone', () => {
  /* Around 60 rules describing a calendar the app no longer draws. Every one was dead —
   * the rebuilt cells identify themselves with `data-slot`, not a class — while still
   * reading as the definition of a cell to anyone opening the file. That is the
   * expensive kind of dead code: a second answer to "what does a cell look like". They
   * also reached for the fenced-off --tint-* tokens. */
  for (const gone of [
    '.cal-cell', '.cal-pnl', '.cal-tcount', '.cal-winpct', '.cal-week-card',
    '.cal-week-label', '.cal-week-val', '.cal-week-days', '.cal-stats-pill',
    '.cal-grid-v2', '.cal-dow-cell', '.cal-head',
  ]) {
    assert.ok(!new RegExp(`^\\${gone}[\\s.,:{]`, 'm').test(appCss), `${gone} is still defined`);
  }
  // What survives is what the rebuilt calendar still wears as a real class.
  assert.match(appCss, /^\.cal-today-btn\s*\{/m);
  assert.match(appCss, /^\.cal-mark--payout\s*\{/m, 'the marker glyphs are addressed by template literal');
});

test('the week cell is shaped like a day and coloured like a summary', () => {
  // STRIPPED, because the source documents the `mt-auto` it removed and a raw scan
  // would match the explanation instead of the code.
  const calCode = stripComments(cal);
  const week = calCode.slice(calCode.indexOf('export function CalWeek'));
  // Same box as a day cell: the two sit in one grid row and must agree.
  assert.match(week, /min-h-\[var\(--cal-cell-h,82px\)\]/);
  assert.match(week, /rounded-\[10px\]/);
  assert.match(week, /px-2\.5 py-\[9px\]/);
  /* Same INTERNAL arrangement as a day cell, so the week's total lands on the same
   * baseline as the seven figures it totals. That arrangement CHANGED SIDES on
   * 2026-09-01: the day cells were pinned to the cell floor with `mt-auto` and moved to
   * the top inset to match the prototype, so this one moved with them. The invariant is
   * "the same edge as a day", not "the bottom" — holding this at the bottom would have
   * broken the very alignment the `mt-auto` was there to create. */
  assert.match(week, /<div className="flex flex-col gap-1">/);
  assert.ok(!/mt-auto/.test(week),
    'the week figure must sit where the day figures do, and they are top-aligned now');
  // But NOT the days' outcome wash: it is a total OF the row, not an eighth day.
  assert.ok(!/CELL\[/.test(week), 'the week cell must not take a day cell tint');
  assert.match(week, /bg-\[var\(--surface-sunken\)\]/);
  assert.match(week, /border-\[var\(--line-inset\)\]/, 'the quietest line in the ramp');
});

test('a day cell is ONE top-aligned stack, and the slack falls beneath it', () => {
  /* The prototype draws the cell as three SIBLING spans in a `column` box at `gap:4px`
   * (project/PropVexis Dashboard.dc.html, the `days` loop): the number, the figure and
   * the trade count read as one block against the top inset, and whatever height a
   * stretched row gains opens up below them.
   *
   * Ours nested the figure and the count in an `mt-auto` wrapper, which pinned the pair
   * to the cell FLOOR. On a 2-unit calendar that is ~40px of hole in the middle of every
   * traded cell — the thing that made our grid read as a different calendar from the
   * design even though every colour and radius already matched.
   *
   * The wrapper stays (the caller renders it conditionally on `c.data`), so `gap-1` has
   * to be declared TWICE — once on the cell between the number and this block, once
   * inside it between the figure and the count. Two nested flexes, one 4px rhythm. */
  assert.match(cal, /'flex min-h-\[var\(--cal-cell-h,82px\)\] flex-col items-stretch gap-1/,
    "the cell's own 4px gap");
  const code = stripComments(cal);
  const body = code.slice(code.indexOf('export function CalCellBody'));
  // Cut at the next export rather than a newline-brace: this file is read as raw
  // source and a literal escape in the needle is one more thing to get wrong.
  const decl = body.slice(0, body.indexOf('export function', 10));
  assert.match(decl, /data-slot="cal-cell-body" className=\{cn\('flex flex-col gap-1'/);
  assert.ok(!/mt-auto/.test(decl),
    'mt-auto pins the figures to the cell floor — the prototype top-aligns them');
  /* And the two line-heights are EXPLICIT. The prototype leaves them at `normal`, which
   * resolves off whatever font actually loads; a 2px drift per line is invisible once
   * and obvious across forty-two cells, so 15px/12px get their metrics written down. */
  assert.match(decl, /text-\[15px\] leading-\[18px\]/);
  assert.match(decl, /text-\[12px\] leading-\[15px\]/);
});

test('a quiet weekend number is a step below a quiet weekday', () => {
  // Three steps, which is the prototype's: traded --muted, quiet weekday --text-dim,
  // quiet weekend one below that. The cell opacity was carrying this alone.
  assert.match(cal, /weekend \? 'text-\[var\(--line-hover\)\]' : 'text-\[var\(--text-dim\)\]'/);
  assert.match(month, /<CalDayNum idle=\{t === 'idle'\} weekend=\{isWeekend\}>/);
});

test('every day answers the pointer, and the hover edge can actually reach the cell', () => {
  /* The prototype hangs `style-hover="border-color:#3f3f46"` on the day cell itself
   * (project/PropVexis Dashboard.dc.html, the `days` loop) with no condition on whether
   * that day traded. Ours gated the hover on `clickable`, so a month with one traded day
   * had forty-one cells that went silent under the cursor.
   *
   * And the gate was not even the reason nothing moved: `borderColor` was written onto
   * the element's own `style`, and an inline declaration beats every class — so the
   * hover utility sat in the stylesheet doing nothing on ALL forty-two. The resting edge
   * therefore travels as a custom property, which leaves both halves as classes. */
  const code = stripComments(cal);
  const cell = code.slice(code.indexOf('export function CalCell('));
  const decl = cell.slice(0, cell.indexOf('export function', 10));

  assert.ok(!/borderColor:/.test(decl),
    'an inline borderColor outranks the hover class and kills it silently');
  assert.match(decl, /'--cal-cell-line': today \? 'var\(--text-dim\)' : borderColor/);
  assert.match(decl, /border-\[var\(--cal-cell-line\)\] transition-colors/);

  // Un-gated by `clickable` — a quiet Tuesday lights up like a traded one.
  assert.match(decl, /!today && 'hover:border-\[var\(--line-hover\)\]'/);
  assert.ok(!/clickable && '[^']*hover:border/.test(decl),
    'the hover edge must not be conditional on the day having trades');
  // --line-hover IS the prototype's #3f3f46, so this is the design's value.
  assert.match(appCss, /--line-hover:\s*var\(--zinc-700\)/);
});
