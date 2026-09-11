/* calendar.jsx
 *
 * @design approved 2026-09-06 — visible on the locked dashboard (the month calendar).
 *   The owner signed that page off and DESIGN-LANGUAGE was written from it.
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { LIFT, PRESS, PRESS_MOTION } from './motion.js';


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
        'flex min-h-[var(--cal-cell-h,82px)] flex-col items-stretch gap-1 rounded-2xl border px-2.5 py-[9px] text-left',
        // THE EDGE IS READ FROM A VARIABLE, NOT SET INLINE (2026-09-02) — see the
        // `style` block below for why. The two halves have to live in the same layer,
        // or the hover half never lands.
        /* PRESS_MOTION REPLACES A BARE `transition-colors`, which had been running
           Tailwind's own 150ms and its own easing curve rather than ours — §10 says one
           easing. It carries the cell's colours either way; the `translate` half only
           does anything on a cell that can be clicked. */
        'border-[var(--cal-cell-line)]', PRESS_MOTION,
        /* A DAY CELL RISES ONLY WHEN IT OPENS SOMETHING, and the same gate carries its
           press. An idle cell is not a control — `:active` and `:hover` both fire on a
           plain div — so ungated, forty-two boxes would bob and rise for a click that
           does nothing. A quiet day still answers the pointer with its EDGE, two lines
           above; what it does not do is offer to be opened.

           LIFT, not PRESS: on a surface that rises, the press returns it to rest rather
           than pushing below, or a click travels the 2px down plus another 1px past its
           own resting position. See motion.js — that pairing is the whole reason the
           first attempt at this was rejected. */
        clickable && LIFT,
        // EVERY DAY LIGHTS UP, NOT ONLY THE ONES THAT OPEN. The prototype hangs
        // `border-color:#3f3f46` on the day cell itself, with no condition on whether
        // that day traded — the grid answers the pointer everywhere, and a quiet
        // Tuesday going silent under the cursor is what made ours feel dead. --line-hover
        // IS #3f3f46, so this is the design's value and not a near miss.
        //
        // TODAY IS THE ONE EXCEPTION. Its edge is already --text-dim, a step BRIGHTER
        // than the hover edge, so taking the prototype literally here would dim the
        // cell you are pointing at — against DESIGN-LANGUAGE §14, where hover
        // intensifies what is already there. Today holds its edge instead.
        !today && 'hover:border-[var(--line-hover)]',
        clickable && 'cursor-pointer',
        clickable && 'focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] focus-visible:outline-none',
        /* A quiet weekday is dim; a quiet WEEKEND is dimmer, because a Saturday with no
           trades is not the same absence as a Tuesday with none.

           ⚠ THE WEEKEND NO LONGER DIMS WITH `opacity` (owner, 2026-09-11, measured with a
           colour picker against the Zinc build). Opacity does not darken a cell — it
           BLENDS it with whatever is behind, and the card behind is --surface #111114, so
           the weekend cell rendered #0e0e10 where the build renders #0b0b0d. No fill could
           fix that: reaching #0b0b0d through a .55 blend needs a #060607 fill, darker than
           --bg, the darkest token we have. So the weekend states its three colours
           OUTRIGHT instead — see the `style` block and CalDayNum — and each one is the
           value the old blend produced, except the fill, which is now the build's.

           The WEEKDAY followed on the same day, for the flicker rather than the colour —
           see the note on the opacity below. Its colour comparison is still open. */
        /* ⚠ NO `opacity` ON A DAY CELL AT ALL, AS OF 2026-09-11, and the reason is the
           flicker rather than the colour. An element with `opacity` is composited as its
           own group, so it is RE-BLENDED whenever the layer tree changes — and a cell
           lifting on hover changes it. The owner saw exactly that: hovering a traded cell
           made the OTHER cells flash, and the cells that flashed were precisely the ones
           still carrying an opacity. Traded cells have none and did not flash.

           So the dim is stated outright instead. Each value below is what the blend was
           already producing, so nothing changes on screen — `--surface-sunken` at 80%
           over `--surface` is the exact colour `opacity-80` was compositing to. */
        className,
      )}
      style={{
        /* --rail-bg IS #0b0b0d, and with the opacity gone it now renders as itself —
           which is exactly the build's weekend cell. */
        background: idle
          ? (weekend
            ? 'var(--rail-bg)'
            /* --surface-sunken IS #0e0e11, the build's no-trade weekday, and with the
               opacity gone it finally renders as itself. It spent this whole exercise
               being the right token behind the wrong blend: at `opacity-80` over the
               card it composited to #0f0f12, one unit bright, which is what the owner
               kept seeing. Nothing here is derived or compensated — it is the token. */
            : 'var(--surface-sunken)')
          : background,
        // TODAY IS AN EDGE, NEVER A FILL. A filled "today" competes with the outcome
        // tints for the same channel, and on a losing day it would argue with them.
        //
        // THE COLOUR TRAVELS AS A CUSTOM PROPERTY, and it must. `borderColor` was
        // written straight onto this element's `style`, and an inline declaration beats
        // every class — so `hover:border-[…]` sat in the stylesheet doing NOTHING on all
        // forty-two cells. Feeding the variable instead leaves both the resting edge and
        // the hover edge as classes, which resolve in Tailwind's own order.
        /* AND THE WEEKEND EDGE IS PRE-DIMMED, so dropping the opacity changes the FILL
           and nothing else. Under the old blend this edge rendered
           0.55 x #151518 + 0.45 x #111114 = #131316; `--line` at 20% over `--surface` is
           (19,19,22) = #131316, the same value stated rather than composited. */
        '--cal-cell-line': today ? 'var(--text-dim)'
          : (idle
            ? (weekend
              ? 'color-mix(in srgb, var(--line) 20%, var(--surface))'
              : 'color-mix(in srgb, var(--line) 32%, var(--surface))')
            : borderColor),
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
        'flex items-center justify-between font-mono text-xs leading-4 font-semibold tabular-nums',
        // Three steps, which is the prototype's: a traded day is --muted, a quiet
        // weekday --text-dim, and a quiet WEEKEND one step below that again. A Saturday
        // with no trades is not the same absence as a Tuesday with none, and the cell's
        // own opacity was carrying that distinction alone.
        /* ⚠ THE WEEKEND NUMBER IS PRE-DIMMED TOO (2026-09-11). Its cell used to carry
           `opacity-55`, which dimmed this number along with the fill; the cell dropped
           that opacity so its fill could reach the build's #0b0b0d, so the dimming this
           number was getting for free now has to be stated. --line-hover at 55% over the
           cell's own --rail-bg is (39,39,44) — the value the blend was producing. Read it
           as "one step below a quiet weekday", which is what it has always meant. */
        !idle ? 'text-[var(--muted)]'
          : (weekend
            ? 'text-[color-mix(in_srgb,var(--line-hover)_55%,var(--rail-bg))]'
            : 'text-[color-mix(in_srgb,var(--text-dim)_80%,var(--surface-sunken))]'),
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
 * with its own neighbours.
 *
 * THE STACK RUNS FROM THE TOP, AND THE SLACK FALLS AT THE BOTTOM (2026-09-01).
 *
 * This was `mt-auto`, which pinned the pair to the cell floor and left a growing hole
 * under the day number as the row stretched. The prototype does not do that: its cell is
 * three SIBLING spans in one `column` box at `gap:4px`, so the number, the figure and
 * the count read as a single block against the top inset and whatever height the row
 * gains opens up beneath them. On a 2-unit calendar the difference is ~40px of gap in
 * the middle of every traded cell, which is what made ours look like a different
 * calendar from the design.
 *
 * `gap-1` here is the SAME 4px the cell itself uses between the number and this block —
 * two nested flexes, one rhythm, because the prototype's three spans are siblings and
 * ours are not. Keeping the wrapper (rather than flattening to `display:contents`) is
 * what lets the caller render the pair conditionally on `c.data`. */
export function CalCellBody({ tone, value, sub, className, ...rest }) {
  const hue = TONE[tone] || null;
  return (
    <div data-slot="cal-cell-body" className={cn('flex flex-col gap-1', className)} {...rest}>
      <span
        /* leading-[18px] / leading-[15px] below are the prototype's `normal` line-heights
           at 15px and 12px made explicit. Left implicit they drift with the font that
           actually loads, and a 2px drift per line is visible when it happens in
           forty-two cells at once. */
        className="truncate font-mono text-[15px] leading-[18px] font-semibold tracking-[-0.4px] tabular-nums"
        style={{ color: hue || 'var(--text)' }}
      >
        {value}
      </span>
      {sub && <span className="truncate text-xs leading-[15px] text-[var(--text-3)]">{sub}</span>}
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
        'flex min-h-[var(--cal-cell-h,82px)] flex-col items-stretch gap-1 rounded-2xl',
        'border border-[var(--line-inset)] bg-[var(--surface-sunken)] px-2.5 py-[9px]',
        className,
      )}
      {...rest}
    >
      <span className="text-[10px] leading-4 font-semibold tracking-[0.07em] text-[var(--text-5)] uppercase">
        {label}
      </span>
      {/* TOP-ALIGNED, BECAUSE THE DAY CELLS NOW ARE (2026-09-01). This block was
          `mt-auto` for a stated reason — the week's total had to sit on the same
          baseline as the seven figures it totals, which were themselves pinned to the
          cell floor. Those moved to the top inset to match the prototype, so holding
          this one at the bottom would BREAK the alignment the `mt-auto` existed to
          create. Same invariant, opposite edge. */}
      <div className="flex flex-col gap-1">
        <span
          className="truncate font-mono text-[15px] leading-[18px] font-semibold tracking-[-0.4px] tabular-nums"
          style={{ color: hue || 'var(--text)' }}
        >
          {value}
        </span>
        {sub && <span className="truncate text-xs leading-[15px] text-[var(--text-3)]">{sub}</span>}
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
        PRESS_MOTION, PRESS, 'hover:bg-[var(--surface-hover)] hover:text-[var(--text)]',
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
