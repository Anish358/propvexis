import React from 'react';
import { cn } from '@/lib/utils';

/* THE P&L CALENDAR's cells, on the 2026-08-28 Figma frame.
 *
 * The frame draws the grid with EMPTY cells — day numbers and nothing else — so the
 * shapes here are the frame's and the content is the app's existing one (the owner's
 * instruction: keep the contents, take the design). What the frame does specify is the
 * cell: 12 radius, --surface-2 at 40%, a 10% hairline, 12 padding.
 *
 * THE CELL IS ONE BLOCK, AND THE RESULT IS IN THE TEXT (revised 2026-08-28 to match
 * the frame, on the owner's call).
 *
 * The first build washed the whole tile in its outcome colour at 12% behind a 30%
 * border, on the reasoning that a month of green and red tiles is readable in half a
 * second. The frame does not do that: every day is the same recessed block —
 * --surface-2 at 40% behind a 10% hairline — and it was visibly a different calendar
 * from the one designed.
 *
 * What the block treatment buys, beyond matching: forty-two tinted tiles is a lot of
 * colour on a page whose OTHER uses of red and amber mean "this account is about to be
 * closed". A quiet grid leaves the account meters as the only alarming thing on screen,
 * which is where alarm belongs. The result is still legible per day — the P&L figure
 * carries its outcome colour, and it is the thing you actually read.
 *
 * IDLE IS STILL NOT AN OUTCOME. A day with no trades gets the same block at half
 * strength and a muted number: present, clearly part of the month, and clearly empty.
 * Giving it the traded treatment would make a quiet week look like sixteen breakeven
 * sessions — a different and much worse story.
 */

/* The FIGURE's colour. --profit-bright / --loss-bright, not the structural pair: these
 * are drawn ON a tint of their own hue, where the structural colours do not carry. */
const TONE = {
  win: 'var(--profit-bright)',
  loss: 'var(--loss-bright)',
};

/* THE CELL's OWN WASH AND EDGE, MATCHED TO THE PROTOTYPE BY MEASUREMENT (2026-08-30).
 *
 * The prototype writes these as literals — `rgba(20,83,45,.22)` and `rgba(76,17,17,.22)`
 * for the two washes, `#183a26` / `#3a1b1b` / `#141417` for the three edges — and
 * COLOUR-INVENTORY §6 rules that they "stay color-mix of the above rather than
 * literals" and "become no new tokens". So each is a mix of a token we already have,
 * and the PERCENTAGES are derived rather than guessed: each candidate was composited
 * over --surface in a browser and compared against the prototype's own literal, and
 * every one below lands within 4/255 on every channel (idle is exact).
 *
 * What was here before was visibly a different calendar: 34% of --profit-deep against
 * the design's 22% of a darker green, and translucent --profit for the edge where the
 * design uses an opaque one. The washed cells came out a third brighter and greener,
 * which is what made the grid read as decorated rather than as data. */
const CELL = {
  win: [
    'color-mix(in srgb, var(--profit-deep) 19%, transparent)',
    'color-mix(in srgb, var(--profit) 24%, var(--surface))',
  ],
  loss: [
    'color-mix(in srgb, var(--loss-deep) 12%, transparent)',
    'color-mix(in srgb, var(--loss) 19%, var(--surface))',
  ],
  // An idle cell's edge is a fifth of the way from the card to a normal hairline — it
  // has to hold the grid's shape without drawing forty-two boxes.
  flat: ['var(--surface-sunken)', 'color-mix(in srgb, var(--line) 40%, var(--surface))'],
};

/* The calendar's own column. It exists because the spacing between the head and the
 * grid used to come from `.cal-head`'s bottom padding, margin and border — all three of
 * which went with the rebuilt header. Without it the weekday row crowds the subtitle
 * (caught in a headless render: "Daily performance" and "Sun" read as one line), and
 * the PanelCard's own gap cannot help, because the whole calendar is ONE child of it.
 *
 * `min-h-0` and `flex-1` are carried over from the legacy `.cal` rule verbatim: the
 * grid has to be allowed to shrink inside a fixed-height card rather than pushing it. */
export function CalRoot({ className, children, ...rest }) {
  return (
    <div
      data-slot="cal-root"
      className={cn('flex min-h-0 flex-1 flex-col gap-3', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

/* THE WEEKDAY ROW IS ITS OWN GRID (2026-08-29), and it has to be.
 *
 * Both rows lived in ONE grid so the week-summary column lined up with the days under
 * it. That is still true — they share `columns` and the same template — but the day grid
 * now STRETCHES to fill a 2-unit card, and a `1fr` auto-row applies to every implicit
 * row including the header, which would give "SUN MON TUE" an equal share of the card's
 * height. Two grids, one template, declared here once.
 *
 * `grow` is the stretching half. */
export function CalGrid({ columns = 8, grow = false, className, children, ...rest }) {
  return (
    <div
      data-slot="cal-grid"
      className={cn('grid gap-[7px]', grow && 'min-h-0 flex-1', className)}
      style={{
        /* 7 equal day columns, plus a slightly wider week column when the caller asks
           for one. Inline rather than a Tailwind class because the CALLER owns whether
           that eighth column exists — see MonthCalendar's `weeks`. */
        gridTemplateColumns: columns > 7
          ? `repeat(${columns - 1}, minmax(0, 1fr)) minmax(0, 1.1fr)`
          : `repeat(${columns}, minmax(0, 1fr))`,
        /* `minmax(<floor>, 1fr)` ON THE ROW, not a min-height on the cell. A cell's own
           min-height cannot make a row GROW — it only stops it shrinking — so a
           five-week month left ~250px of dead card under the last row of a 2-unit
           calendar. The floor is a token because the cell reads it too, and the two
           must agree. */
        ...(grow ? { gridAutoRows: 'minmax(var(--cal-cell-h, 82px), 1fr)' } : null),
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CalDow({ className, children, ...rest }) {
  return (
    <div
      data-slot="cal-dow"
      className={cn(
        'pb-1 text-center text-[11px] leading-4 font-semibold tracking-[0.07em] text-[var(--text-5)] uppercase',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * One day.
 *
 * @param {string}  tone      win | loss | flat | idle
 * @param {boolean} clickable whether the day opens its trades
 */
export function CalCell({
  tone = 'idle', clickable = false, today = false, weekend = false, className, children, ...rest
}) {
  const idle = tone === 'idle';
  const [background, borderColor] = CELL[tone] || CELL.flat;
  const Tag = clickable ? 'button' : 'div';
  return (
    <Tag
      type={clickable ? 'button' : undefined}
      data-slot="cal-cell"
      data-tone={tone}
      className={cn(
        // The floor is the same token the grid's `minmax()` reads — see CalGrid. Two
        // places, one value, or a row and its cell disagree about how short is too short.
        'flex min-h-[var(--cal-cell-h,82px)] flex-col items-stretch gap-1 rounded-[10px] border px-2.5 py-[9px] text-left',
        clickable && 'cursor-pointer transition-colors hover:border-[var(--line-hover)]',
        clickable && 'focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] focus-visible:outline-none',
        // A quiet weekday is dim; a quiet WEEKEND is dimmer, because a Saturday with no
        // trades is not the same absence as a Tuesday with none.
        idle && (weekend ? 'opacity-55' : 'opacity-80'),
        className,
      )}
      style={{
        background: idle && weekend ? 'var(--rail-bg)' : background,
        // TODAY IS AN EDGE, NEVER A FILL. A filled "today" competes with the outcome
        // tints for the same channel, and on a losing day it would argue with them.
        borderColor: today ? 'var(--text-dim)' : borderColor,
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/* The day number. Muted on an idle cell and full-strength on a traded one, so the days
 * that have something to say are the ones the eye lands on. */
export function CalDayNum({ idle = false, weekend = false, className, children, ...rest }) {
  return (
    <div
      data-slot="cal-daynum"
      className={cn(
        'flex items-center justify-between font-mono text-[12.5px] leading-4 font-semibold tabular-nums',
        // Three steps, which is the prototype's: a traded day is --muted, a quiet
        // weekday --text-dim, and a quiet WEEKEND one step below that again. A Saturday
        // with no trades is not the same absence as a Tuesday with none, and the cell's
        // own opacity was carrying that distinction alone.
        !idle ? 'text-[var(--muted)]' : (weekend ? 'text-[var(--line-hover)]' : 'text-[var(--text-dim)]'),
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/* A day's figures. The P&L is the only coloured thing in the cell — the trade count and
 * win rate are context and stay muted, or a cell with three coloured lines competes
 * with its own neighbours. */
export function CalCellBody({ tone, value, sub, className, ...rest }) {
  const hue = TONE[tone] || null;
  return (
    <div data-slot="cal-cell-body" className={cn('mt-auto flex flex-col', className)} {...rest}>
      <span
        className="truncate font-mono text-[15px] leading-5 font-semibold tracking-[-0.4px] tabular-nums"
        style={{ color: hue || 'var(--text)' }}
      >
        {value}
      </span>
      {sub && <span className="truncate text-[12px] leading-4 text-[var(--text-3)]">{sub}</span>}
    </div>
  );
}

/* THE WEEK SUMMARY at the end of each row — the app's own column, which the prototype
 * does not draw (DESIGN-LANGUAGE §2: a feature the design omits is not deleted, it
 * takes the design's vocabulary).
 *
 * REBUILT TO THE GRID'S RHYTHM (2026-08-30). It was a centred stack on a bare --bg
 * well with no edge, so it read as a hole punched in the card beside seven bordered
 * tiles — the one element on the calendar that belonged to no system.
 *
 * Now it is shaped like a day cell and coloured like a summary. Same radius, same
 * inset, same 82px floor, and — the part that does the work — the same INTERNAL
 * ARRANGEMENT: an eyebrow at the top where a day puts its number, the figure pushed to
 * the bottom where a day puts its P&L. The week's total therefore sits on the same
 * baseline as the seven figures it totals, which is the whole reason to draw it beside
 * them.
 *
 * STILL RECESSED, and still without the days' outcome wash. It is a total OF the row,
 * not an eighth day: tinting it win/loss would put an eighth coloured tile in a row of
 * seven and make the grid read as eight days of equal standing. The edge is
 * --line-inset — a divider INSIDE a card, the quietest line in the ramp — so the column
 * is bounded without competing with the cells it summarises. */
export function CalWeek({ tone, label, value, sub, className, ...rest }) {
  const hue = TONE[tone] || null;
  return (
    <div
      data-slot="cal-week"
      className={cn(
        'flex min-h-[var(--cal-cell-h,82px)] flex-col items-stretch gap-1 rounded-[10px]',
        'border border-[var(--line-inset)] bg-[var(--surface-sunken)] px-2.5 py-[9px]',
        className,
      )}
      {...rest}
    >
      <span className="text-[10px] leading-4 font-semibold tracking-[0.07em] text-[var(--text-5)] uppercase">
        {label}
      </span>
      <div className="mt-auto flex flex-col">
        <span
          className="truncate font-mono text-[15px] leading-5 font-semibold tracking-[-0.4px] tabular-nums"
          style={{ color: hue || 'var(--text)' }}
        >
          {value}
        </span>
        {sub && <span className="truncate text-[12px] leading-4 text-[var(--text-3)]">{sub}</span>}
      </div>
    </div>
  );
}

/* Month navigation. Square, quiet, and the same 32px chrome button the rail's collapse
 * and the brief's settings use — the app has one icon-button size and this is it. */
export function CalNavButton({ className, children, ...rest }) {
  return (
    <button
      type="button"
      data-slot="cal-nav"
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-full',
        'border border-[var(--line-control)] bg-[var(--control-bg)] text-[var(--muted)]',
        'transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]',
        'focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] focus-visible:outline-none',
        '[&_svg]:size-4',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
