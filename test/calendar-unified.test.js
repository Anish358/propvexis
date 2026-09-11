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
  assert.match(week, /rounded-2xl/);
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
  assert.match(decl, /text-xs leading-\[15px\]/);
});

test('a quiet weekend number is a step below a quiet weekday', () => {
  // Three steps, which is the prototype's: traded --muted, quiet weekday --text-dim,
  // quiet weekend one below that. The cell opacity was carrying this alone.
  /* The weekend number is PRE-DIMMED as of 2026-09-11: its cell used to carry
   * `opacity-55`, which dimmed this number for free, and the cell dropped that opacity so
   * its fill could reach the build's #0b0b0d. --line-hover at 55% over --rail-bg is the
   * value that blend was producing, so the STEP this test is about is unchanged — a quiet
   * weekend still reads one below a quiet weekday. */
  assert.match(cal, /text-\[color-mix\(in_srgb,var\(--line-hover\)_55%,var\(--rail-bg\)\)\]/);
  assert.match(cal, /text-\[color-mix\(in_srgb,var\(--text-dim\)_80%,var\(--surface-sunken\)\)\]/,
    'the quiet WEEKDAY number is pre-dimmed too, since the cell dropped its opacity');
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
  /* THE WEEKEND BRANCHES OFF HERE SINCE 2026-09-11. Its cell dropped `opacity-55` so the
   * fill could reach the build's #0b0b0d, so the edge that opacity used to dim is now
   * stated outright. The invariant this line guards — today's edge travels as a VARIABLE,
   * never an inline borderColor, so the hover class can still reach it — is unchanged. */
  assert.match(decl, /'--cal-cell-line': today \? 'var\(--text-dim\)'/);
  assert.match(decl, /weekend[\s\S]{0,120}?var\(--line\) 20%, var\(--surface\)[\s\S]{0,120}?var\(--line\) 32%, var\(--surface\)/,
    'each idle cell states its own edge now that neither carries an opacity');
  /* TWO STRINGS SINCE 2026-09-11. This pinned `border-[var(--cal-cell-line)]
   * transition-colors` as one literal; the bare `transition-colors` is now PRESS_MOTION,
   * which carries the same colours on the TOKEN duration and easing (§10 — the bare
   * utility ran Tailwind's own 150ms and its own curve) plus the `translate` a clickable
   * day needs for its press. What this test is about — the edge being driven by a
   * variable so the hover class can reach it — is unchanged. */
  assert.match(decl, /border-\[var\(--cal-cell-line\)\]/);
  assert.match(decl, /\bPRESS_MOTION\b/);

  // Un-gated by `clickable` — a quiet Tuesday lights up like a traded one.
  assert.match(decl, /!today && 'hover:border-\[var\(--line-hover\)\]'/);
  assert.ok(!/clickable && '[^']*hover:border/.test(decl),
    'the hover edge must not be conditional on the day having trades');
  /* THE INVARIANT IS THAT THE HOVER EDGE OUT-READS THE RESTING ONE, not that it is
   * spelled `var(--zinc-700)`. This pinned that spelling and failed when the ramp was
   * re-valued against the dashboard mockup (2026-09-07, #3e3e45 — one unit off zinc-700
   * and identical to the eye). A cell whose hover edge does not clearly beat its resting
   * edge is the bug; which grey delivers that is the palette's business. */
  const hex = (name) => {
    const m = appCss.match(new RegExp(`(?<![\\w-])--${name}\\s*:\\s*(#[0-9a-f]{6}|var\\(--[\\w-]+\\))`, 'i'));
    assert.ok(m, `--${name} must be declared`);
    const v = m[1].startsWith('var(')
      ? appCss.match(new RegExp(`(?<![\\w-])--${m[1].slice(6, -1)}\\s*:\\s*(#[0-9a-f]{6})`, 'i'))[1]
      : m[1];
    return parseInt(v.slice(1, 3), 16);
  };
  assert.ok(hex('line-hover') > hex('line') + 8,
    'the hover edge must clearly out-read a cell\'s resting edge, or nothing appears to happen');
});
