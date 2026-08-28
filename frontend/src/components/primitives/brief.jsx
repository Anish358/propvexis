import React from 'react';
import { cn } from '@/lib/utils';

/* TODAY'S BRIEF — the dashboard's top card, on the 2026-08-28 Figma frame (node 1:2).
 *
 * Presentation only, same contract as rail.jsx: nothing here fetches, filters by
 * timezone, or knows what a trading account is. Dashboard.jsx keeps all of that and
 * hands down finished rows.
 *
 * THE FRAME, in numbers:
 *   card      --surface, 20 radius, 20 padding, 16 between blocks
 *   header    a 36 amber-washed tile, the title at 16/24, date and clock at 13/20
 *   columns   two equal halves, 24 apart, each a caps label over its list
 *   event     36 tall, 12 radius, --surface-2 at 60%, 12/8 padding, 12 gaps
 *   alert     12 radius, its severity at 10% behind a 20% border
 *
 * SCALED DOWN ~20% FROM THE FRAME, on the owner's call after seeing it in the real
 * shell (2026-08-28). The frame is drawn at one card filling the viewport; in situ this
 * sits above a KPI row, a full-width account card and a calendar, and at the frame's
 * own 28/24/46/54 it took a third of the fold to say four things. Every step is a step
 * DOWN the same scale rather than an arbitrary shrink -- 28->20, 24->16, 18->16, 14->13
 * -- so the card's internal proportions are the frame's, one size smaller.
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
        'flex flex-col gap-3 rounded-[16px] bg-[var(--surface)] p-4',
        className,
      )}
      {...rest}
    >
      {children}
    </section>
  );
}

/* The header — ONE ROW as of 2026-08-28, on the owner's call.
 *
 * `action` used to sit on a second line under the title, which is how the frame draws
 * it: a 12px "Brief settings" text button below "Today's Brief". In the real shell that
 * second line pushed the card taller for a control nobody opens twice a week, and its
 * text label repeated a word already three pixels above it. It is an icon button in the
 * title row now — which is also what the rest of this app's chrome does with settings.
 *
 * `aside` is the frame's second, unlabelled 36px button — a slot rather than a fixed
 * child, because what it does is a product decision this file does not get to invent. */
export function BriefHeader({ icon, title, date, clock, action, aside, className, ...rest }) {
  return (
    <div
      data-slot="brief-header"
      className={cn('flex items-center justify-between gap-4', className)}
      {...rest}
    >
      <div className="flex min-w-0 items-center gap-3">
        {/* The tile is amber because the brief is the morning read, not because
            anything is wrong — 10% is a wash, well below the 15% the impact badges
            use and the 10% the alert rows use for actual warnings. */}
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-[var(--brief-tile-bg)] text-[var(--warning)] [&_svg]:size-4">
          {icon}
        </span>
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
          <h3 className="text-[16px] leading-6 font-semibold text-[var(--text)]">{title}</h3>
          <span className="text-[13px] leading-5 font-normal text-[var(--muted)]">{date}</span>
          {clock}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {action}
        {aside}
      </div>
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
        'flex items-center gap-1 text-[13px] leading-5 font-normal text-[var(--muted)] [&_svg]:size-3.5',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </span>
  );
}

/* The settings trigger — a quiet square icon button, matching the rail's collapse
 * control (32px, 6 radius, muted until hovered) so the app's chrome buttons are one
 * thing rather than several.
 *
 * ICON-ONLY, WHICH MEANS `aria-label` IS NOT OPTIONAL. The caller supplies it; there is
 * no visible text left to fall back on, and this swap — a labelled text button becoming
 * a bare glyph — is exactly where a control loses its name. dash-brief.test.js asserts
 * one is passed. */
export const BriefAction = React.forwardRef(function BriefAction({ className, children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      data-slot="brief-action"
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
});

/* Two equal halves, stacked below BP_STACK (1200) — NOT at the rail's own 900.
 *
 * The two are different questions and were briefly conflated here. The rail leaves the
 * flow at 900 because a 248px rail on a phone is unusable; these columns stop working
 * at 1200 because that is where each half drops under ~380px, and an event row has to
 * hold a currency chip, a title, a time and an impact badge on ONE line. Below 1200 the
 * title truncates to nothing while the badges keep their width — the list stops being
 * readable well before the rail stops fitting. */
export function BriefColumns({ className, children, ...rest }) {
  return (
    <div
      data-slot="brief-columns"
      className={cn(
        'grid grid-cols-2 gap-5 max-[1200px]:grid-cols-1 max-[1200px]:gap-4',
        /* A LONE COLUMN TAKES THE WHOLE WIDTH. `hideEmpty` can switch either section
         * off, and a single half-width list beside an empty half reads as a column that
         * failed to load rather than one the user turned off. `:only-child` says it in
         * CSS, so neither this component nor Dashboard has to count its own children. */
        '[&>*:only-child]:col-span-2',
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
      <span className="text-[11px] leading-4 font-medium tracking-[0.6px] text-[var(--muted)] uppercase">
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
        'flex items-center gap-3 rounded-[12px] bg-[var(--brief-row-bg)] px-3 py-2',
        className,
      )}
      {...rest}
    >
      <span className="size-2 shrink-0 rounded-full" style={{ background: hue }} aria-hidden="true" />
      <span className="shrink-0 rounded-full border border-[var(--brief-chip-border)] px-1.5 py-0.5 text-[11px] leading-4 font-medium text-[var(--text)]">
        {currency}
      </span>
      {/* truncate, not wrap: every row in this column is one line tall, and a wrapping
          title would push the four rows out of the card's fixed height. */}
      <span className="min-w-0 flex-1 truncate text-[13px] leading-5 font-medium text-[var(--text)]" title={title}>
        {title}
      </span>
      <span className="shrink-0 text-[11px] leading-4 font-normal text-[var(--muted)]">{time}</span>
      {impactLabel && (
        <span
          className="shrink-0 rounded-full border border-[var(--brief-chip-border)] px-1.5 py-0.5 text-[11px] leading-4 font-medium"
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
      className={cn('flex items-center gap-3 rounded-[12px] border px-3 py-2.5', className)}
      style={{
        background: `color-mix(in srgb, ${hue} 10%, transparent)`,
        borderColor: `color-mix(in srgb, ${hue} 20%, transparent)`,
      }}
      {...rest}
    >
      <span className="shrink-0 [&_svg]:size-4" style={{ color: hue }} aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0 text-[13px] leading-5 font-normal text-[var(--text)]">
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
        'm-0 rounded-[12px] bg-[var(--brief-row-bg)] px-3 py-2 text-[12px] leading-5 text-[var(--muted)]',
        className,
      )}
      {...rest}
    >
      {children}
    </p>
  );
}
