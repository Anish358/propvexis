import React from 'react';
import { cn } from '@/lib/utils';

/* THE P&L CALENDAR's cells, on the 2026-08-28 Figma frame.
 *
 * The frame draws the grid with EMPTY cells — day numbers and nothing else — so the
 * shapes here are the frame's and the content is the app's existing one (the owner's
 * instruction: keep the contents, take the design). What the frame does specify is the
 * cell: 12 radius, --surface-2 at 40%, a 10% hairline, 12 padding.
 *
 * A DAY'S COLOUR IS ITS RESULT, and that is the whole reason this grid exists. Twelve
 * green cells and four red ones is a month a trader reads in half a second, before any
 * figure. So:
 *
 *   win     --profit at 12% behind a 30% border
 *   loss    --loss, same treatment
 *   flat    a traded day that closed at zero — the neutral cell, still bordered,
 *           because it IS a trading day and must not read as an empty one
 *   idle    no trades: the frame's plain cell, recessed and unbordered
 *
 * THE PERCENTAGES ARE LOWER THAN THE ALERT ROWS' (12/30 against the brief's 10/20 at a
 * much larger size) because these are 100px tiles tiled 42 to a card. At the alert
 * rows' strength a green month becomes a solid green rectangle and the individual days
 * stop being legible as days.
 *
 * IDLE IS NOT A THIRD OUTCOME. A day with no trades gets no border and no wash —
 * drawing it like a flat day would make a quiet week look like sixteen breakeven
 * sessions, which is a different and much worse story.
 */

const TONE = {
  win: 'var(--profit)',
  loss: 'var(--loss)',
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
      className={cn('flex min-h-0 flex-1 flex-col gap-4', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CalGrid({ columns = 8, className, children, ...rest }) {
  return (
    <div
      data-slot="cal-grid"
      className={cn('grid gap-1.5', className)}
      // 7 days plus the week-summary column. A CSS variable rather than a Tailwind
      // class because the caller owns whether the week column exists.
      style={{ gridTemplateColumns: `repeat(${columns - 1}, minmax(0, 1fr)) minmax(0, 1.1fr)` }}
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
      className={cn('pb-1 text-center text-[11px] leading-4 font-medium text-[var(--muted)]', className)}
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
export function CalCell({ tone = 'idle', clickable = false, className, children, ...rest }) {
  const hue = TONE[tone] || null;
  const idle = tone === 'idle';
  const Tag = clickable ? 'button' : 'div';
  return (
    <Tag
      type={clickable ? 'button' : undefined}
      data-slot="cal-cell"
      data-tone={tone}
      className={cn(
        'flex min-h-[4.5rem] flex-col items-stretch gap-1 rounded-[12px] border p-2 text-left',
        clickable && 'cursor-pointer transition-colors hover:border-[var(--line-strong)]',
        clickable && 'focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] focus-visible:outline-none',
        className,
      )}
      style={{
        background: hue
          ? `color-mix(in srgb, ${hue} 12%, transparent)`
          : idle ? 'transparent' : 'var(--brief-row-bg)',
        borderColor: hue
          ? `color-mix(in srgb, ${hue} 30%, transparent)`
          : idle ? 'transparent' : 'var(--line)',
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/* The day number. Muted on an idle cell and full-strength on a traded one, so the days
 * that have something to say are the ones the eye lands on. */
export function CalDayNum({ idle = false, className, children, ...rest }) {
  return (
    <div
      data-slot="cal-daynum"
      className={cn(
        'flex items-center justify-between text-[11px] leading-4 font-medium tabular-nums',
        idle ? 'text-[var(--text-3)]' : 'text-[var(--muted)]',
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
        className="truncate text-[13px] leading-5 font-semibold tabular-nums"
        style={{ color: hue || 'var(--text)' }}
      >
        {value}
      </span>
      {sub && <span className="truncate text-[10px] leading-4 text-[var(--muted)]">{sub}</span>}
    </div>
  );
}

/* The week-summary card at the end of each row. Recessed rather than raised — it is a
 * total OF the row beside it, not an eighth day, and giving it the days' own treatment
 * makes the grid read as eight columns of equal standing. */
export function CalWeek({ tone, label, value, sub, className, ...rest }) {
  const hue = TONE[tone] || null;
  return (
    <div
      data-slot="cal-week"
      className={cn('flex min-h-[4.5rem] flex-col justify-center gap-0.5 rounded-[12px] bg-[var(--bg)] p-2', className)}
      {...rest}
    >
      <span className="text-[10px] leading-4 font-medium text-[var(--muted)]">{label}</span>
      <span
        className="truncate text-[13px] leading-5 font-semibold tabular-nums"
        style={{ color: hue || 'var(--text)' }}
      >
        {value}
      </span>
      {sub && <span className="text-[10px] leading-4 text-[var(--text-3)]">{sub}</span>}
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
        'flex size-8 shrink-0 items-center justify-center rounded-[6px] text-[var(--muted)]',
        'transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]',
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
