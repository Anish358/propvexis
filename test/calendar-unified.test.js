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
  const week = cal.slice(cal.indexOf('export function CalWeek'));
  // Same box as a day cell: the two sit in one grid row and must agree.
  assert.match(week, /min-h-\[var\(--cal-cell-h,82px\)\]/);
  assert.match(week, /rounded-\[10px\]/);
  assert.match(week, /px-2\.5 py-\[9px\]/);
  // Same INTERNAL arrangement — eyebrow at the top, figure pushed to the bottom — so
  // the week's total lands on the same baseline as the seven figures it totals.
  assert.match(week, /mt-auto flex flex-col/);
  // But NOT the days' outcome wash: it is a total OF the row, not an eighth day.
  assert.ok(!/CELL\[/.test(week), 'the week cell must not take a day cell tint');
  assert.match(week, /bg-\[var\(--surface-sunken\)\]/);
  assert.match(week, /border-\[var\(--line-inset\)\]/, 'the quietest line in the ramp');
});

test('a quiet weekend number is a step below a quiet weekday', () => {
  // Three steps, which is the prototype's: traded --muted, quiet weekday --text-dim,
  // quiet weekend one below that. The cell opacity was carrying this alone.
  assert.match(cal, /weekend \? 'text-\[var\(--line-hover\)\]' : 'text-\[var\(--text-dim\)\]'/);
  assert.match(month, /<CalDayNum idle=\{t === 'idle'\} weekend=\{isWeekend\}>/);
});
