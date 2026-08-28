import React from 'react';
import { cn } from '@/lib/utils';

/* TODAY'S BRIEF — the dashboard's top card, on the 2026-08-28 Figma frame (node 1:2).
 *
 * Presentation only, same contract as rail.jsx: nothing here fetches, filters by
 * timezone, or knows what a trading account is. Dashboard.jsx keeps all of that and
 * hands down finished rows.
 *
 * THE FRAME, in numbers:
 *   card      1378 wide at 1440, --surface, 24 radius, 28 padding, 24 between blocks
 *   header    a 44 amber-washed tile, the title at 18/28, then date and clock at 14/20
 *   columns   two equal halves, 32 apart, each a caps label over its list
 *   event     46 tall, 16 radius, --surface-2 at 60%, 12 padding, 12 gaps
 *   alert     54 tall, 16 radius, its severity at 10% behind a 20% border
 *
 * TWO COLOUR SYSTEMS, AND THEY ARE NOT THE SAME ONE. An event's dot and badge encode
 * IMPACT — how hard the market is likely to move — and an alert's wash encodes
 * SEVERITY — how close this account is to dying. They collide on amber and read as one
 * scale at a glance, which is why they are separate maps below rather than one shared
 * `tone`: a medium-impact CPI print and an account 1.2% from breaching are not the same
 * amber, and the day someone tunes one they must not silently tune the other.
 *
 * The alert wash is built with color-mix from the SAME token the text uses, so a
 * severity has exactly one hue and the 10/20% relationship survives a palette change.
 */

export function BriefCard({ className, children, ...rest }) {
  return (
    <section
      data-slot="brief"
      className={cn(
        'flex flex-col gap-6 rounded-[24px] bg-[var(--surface)] p-7',
        className,
      )}
      {...rest}
    >
      {children}
    </section>
  );
}

/* The header. `action` is the settings control; `aside` is the frame's second,
 * unlabelled 36px button — a slot rather than a fixed child, because what it does is a
 * product decision and this file does not get to invent one. */
export function BriefHeader({ icon, title, date, clock, action, aside, className, ...rest }) {
  return (
    <div
      data-slot="brief-header"
      className={cn('flex items-start justify-between gap-4', className)}
      {...rest}
    >
      <div className="flex min-w-0 items-start gap-4">
        {/* The tile is amber because the brief is the morning read, not because
            anything is wrong — 10% is a wash, well below the 15% the impact badges
            use and the 10% the alert rows use for actual warnings. */}
        <span className="flex size-11 shrink-0 items-center justify-center rounded-[16px] bg-[var(--brief-tile-bg)] text-[var(--warning)] [&_svg]:size-5">
          {icon}
        </span>
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-baseline gap-4">
            <h3 className="text-[18px] leading-7 font-semibold text-[var(--text)]">{title}</h3>
            <span className="text-[14px] leading-5 font-normal text-[var(--muted)]">{date}</span>
            {clock}
          </div>
          {action}
        </div>
      </div>
      {aside}
    </div>
  );
}

/* The clock. Its own component because the icon-plus-time pair has a 4px gap where
 * everything else in the header row uses 16 — they are one reading, not two items. */
export function BriefClock({ icon, className, children, ...rest }) {
  return (
    <span
      data-slot="brief-clock"
      className={cn(
        'flex items-center gap-1 text-[14px] leading-5 font-normal text-[var(--muted)] [&_svg]:size-4',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </span>
  );
}

/* A quiet text button — the settings trigger. Deliberately not the generated Button:
 * at 12px with no fill and no border it is a link that happens to open a popover, and
 * every Button variant we have is heavier than the frame draws this. */
export const BriefAction = React.forwardRef(function BriefAction({ className, children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      data-slot="brief-action"
      className={cn(
        'flex w-fit items-center gap-2 rounded-[6px] text-[12px] leading-4 font-medium text-[var(--muted)]',
        'transition-colors hover:text-[var(--text)]',
        'focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] focus-visible:outline-none',
        '[&_svg]:size-3',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

/* Two equal halves at desktop, stacked below 900px — the same breakpoint the rail
 * uses, so the shell reorganises in one step rather than twice. Two 645px columns do
 * not survive a phone, and neither does a half-width event row that has to hold a
 * currency, a title, a time and a badge on one line. */
export function BriefColumns({ className, children, ...rest }) {
  return (
    <div
      data-slot="brief-columns"
      className={cn(
        'grid grid-cols-2 gap-8 max-[900px]:grid-cols-1 max-[900px]:gap-6',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/* A titled column. `gap` differs by list on purpose and comes from the frame: events
 * sit 8 apart, alerts 12, because an alert row carries a border and needs the extra
 * space to stop three of them reading as one striped block. */
export function BriefSection({ label, gap = 'events', className, children, ...rest }) {
  return (
    <div
      data-slot="brief-section"
      className={cn('flex flex-col gap-3', className)}
      {...rest}
    >
      {/* CAPS, which this codebase otherwise forbids — see typography.test.js, where
          this is the second and last exception. It is not shouting: at 12px in the
          muted colour these are eyebrows naming a column, the one place small caps
          reads as structure rather than emphasis, and the frame draws them that way. */}
      <span className="text-[12px] leading-4 font-medium tracking-[0.6px] text-[var(--muted)] uppercase">
        {label}
      </span>
      <div className={cn('flex flex-col', gap === 'alerts' ? 'gap-3' : 'gap-2')}>
        {children}
      </div>
    </div>
  );
}

// impact -> the dot and badge hue. How hard the market may move.
const IMPACT = {
  high: 'var(--loss)',
  medium: 'var(--warning)',
  low: 'var(--muted)',
  // The feed's fourth value (normalizeImpact in platform/calendar.js). A bank holiday
  // is not a low-impact print — it is a different KIND of row, and the day it renders
  // in the same grey as a minor release is the day a trader misses a closed session.
  holiday: 'var(--payout)',
};

/* One economic event. The dot and the badge carry the same hue deliberately: the dot
 * is scannable down the column at a glance, the badge is the readable version for
 * anyone who cannot separate the hues. Impact is never colour-only. */
export function BriefEvent({ currency, title, time, impact = 'low', impactLabel, className, ...rest }) {
  const hue = IMPACT[impact] || IMPACT.low;
  return (
    <div
      data-slot="brief-event"
      className={cn(
        'flex items-center gap-3 rounded-[16px] bg-[var(--brief-row-bg)] p-3',
        className,
      )}
      {...rest}
    >
      <span className="size-2 shrink-0 rounded-full" style={{ background: hue }} aria-hidden="true" />
      <span className="shrink-0 rounded-full border border-[var(--brief-chip-border)] px-2 py-0.5 text-[12px] leading-4 font-medium text-[var(--text)]">
        {currency}
      </span>
      {/* truncate, not wrap: every row in this column is one line tall, and a wrapping
          title would push the four rows out of the card's fixed height. */}
      <span className="min-w-0 flex-1 truncate text-[14px] leading-5 font-medium text-[var(--text)]" title={title}>
        {title}
      </span>
      <span className="shrink-0 text-[12px] leading-4 font-normal text-[var(--muted)]">{time}</span>
      {impactLabel && (
        <span
          className="shrink-0 rounded-full border border-[var(--brief-chip-border)] px-2 py-0.5 text-[12px] leading-4 font-medium"
          style={{ background: `color-mix(in srgb, ${hue} 15%, transparent)`, color: hue }}
        >
          {impactLabel}
        </span>
      )}
    </div>
  );
}

// severity -> the wash, the border and the icon. How close this account is to dying.
// Distinct from IMPACT above even where the hue coincides: see the file header.
const SEVERITY = {
  critical: 'var(--loss)',
  warning: 'var(--warning)',
  info: 'var(--profit)',
};

export function BriefAlert({ severity = 'info', icon, className, children, ...rest }) {
  const hue = SEVERITY[severity] || SEVERITY.info;
  return (
    <div
      data-slot="brief-alert"
      className={cn('flex items-center gap-3 rounded-[16px] border p-4', className)}
      style={{
        background: `color-mix(in srgb, ${hue} 10%, transparent)`,
        borderColor: `color-mix(in srgb, ${hue} 20%, transparent)`,
      }}
      {...rest}
    >
      <span className="shrink-0 [&_svg]:size-4" style={{ color: hue }} aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0 text-[14px] leading-5 font-normal text-[var(--text)]">
        {children}
      </span>
    </div>
  );
}

/* An empty column, or a loading one. A sentence in the row's own measure rather than a
 * full EmptyState block: the column still has its label above it, so this is a note
 * about why the list is short, not a state the whole card is in. */
export function BriefNote({ className, children, ...rest }) {
  return (
    <p
      data-slot="brief-note"
      className={cn(
        'm-0 rounded-[16px] bg-[var(--brief-row-bg)] p-3 text-[13px] leading-5 text-[var(--muted)]',
        className,
      )}
      {...rest}
    >
      {children}
    </p>
  );
}
