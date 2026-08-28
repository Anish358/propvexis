import React from 'react';
import { cn } from '@/lib/utils';

/* THE PANEL — the dashboard's generic content card, on the 2026-08-28 Figma frame.
 *
 * ONE SHELL, THREE CARDS. The frame draws the calendar, Recent Activity and the
 * cumulative-P&L chart as the same box: --surface behind a 10% hairline, 24 radius,
 * 28 padding, 20 between the head and the body, a semibold title with an optional
 * muted line under it and an optional figure on the right. They are the same card and
 * they are built as one — three hand-written shells is three places for the radius to
 * drift, which is exactly what happened to `.dash-cal-panel`, `.dash-activity` and
 * `.dash-equity` in the CSS this replaces.
 *
 * Scaled one step down like everything else on the page: 28->20 padding, 24->20 radius,
 * 20->16 gap, 18->16 title, 14->13 sub.
 *
 * NOT the generated `Card`. That one is shadcn's box with the preset's own geometry and
 * a `spacing` prop; this is the dashboard's panel, at the frame's numbers, and mapping
 * one onto the other would mean re-tuning the preset every time the frame moved.
 */

export function PanelCard({ className, children, ...rest }) {
  return (
    <section
      data-slot="panel"
      className={cn(
        'flex min-w-0 flex-col gap-4 rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5',
        className,
      )}
      {...rest}
    >
      {children}
    </section>
  );
}

/**
 * The panel's head.
 *
 * `meta` sits on the RIGHT and wraps under the title at narrow widths rather than
 * truncating: it is always a figure (a month total, a count), and a truncated number is
 * worse than no number — "+$4,1…" is not a smaller version of the truth.
 */
export function PanelHead({ sub, meta, action, className, children, ...rest }) {
  return (
    <div
      data-slot="panel-head"
      className={cn('flex flex-wrap items-start justify-between gap-x-4 gap-y-2', className)}
      {...rest}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="flex items-center gap-2 text-[16px] leading-6 font-semibold text-[var(--text)]">
          {children}
        </h3>
        {sub && <p className="m-0 text-[13px] leading-5 text-[var(--muted)]">{sub}</p>}
      </div>
      {(meta || action) && (
        <div className="flex shrink-0 items-center gap-3">
          {meta}
          {action}
        </div>
      )}
    </div>
  );
}

/* A figure in the head — the calendar's month total, tinted by sign. `tone` is the
 * app's outcome vocabulary rather than a colour, so the panel never decides what green
 * means. */
const TONE = { pos: 'var(--profit)', neg: 'var(--loss)' };

export function PanelMeta({ label, tone, className, children, ...rest }) {
  return (
    <span
      data-slot="panel-meta"
      className={cn('flex items-baseline gap-1.5 text-[13px] leading-5', className)}
      {...rest}
    >
      {label && <span className="text-[var(--muted)]">{label}</span>}
      <span className="font-medium tabular-nums" style={{ color: TONE[tone] || 'var(--text)' }}>
        {children}
      </span>
    </span>
  );
}

/* The panel's scrolling region. `min-h-0` is what actually lets a flex child shrink —
 * without it a long list pushes the card taller than its grid row instead of scrolling
 * inside it, and the dashboard's columns stop lining up. */
export function PanelBody({ scroll = false, className, children, ...rest }) {
  return (
    <div
      data-slot="panel-body"
      className={cn('flex min-h-0 flex-1 flex-col', scroll && 'overflow-y-auto overscroll-contain', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

/* A row in a panel list — Recent Activity's trades. A hairline BETWEEN rows, not under
 * every one: a border on the last row reads as a cut-off list that continues below the
 * card, which is the one thing a "recent" list must not imply. */
export function PanelRow({ className, children, ...rest }) {
  return (
    <div
      data-slot="panel-row"
      className={cn(
        'flex items-center gap-3 border-b border-[var(--line)] py-2.5 text-[13px] leading-5 last:border-b-0',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/* The column headers above a panel list. Muted, small, and NOT uppercase — the brief's
 * eyebrows are the one exception in this app (typography.test.js), and a three-column
 * table header does not need shouting to read as a header. */
export function PanelRowHead({ className, children, ...rest }) {
  return (
    <div
      data-slot="panel-row-head"
      className={cn(
        'flex items-center gap-3 border-b border-[var(--line)] pb-2 text-[11px] leading-4 font-medium text-[var(--muted)]',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/* A value cell that carries an outcome. Tabular by default for the same reason the KPI
 * figures are: a column of P&L that jitters as it updates cannot be scanned. */
export function PanelValue({ tone, className, children, ...rest }) {
  return (
    <span
      data-slot="panel-value"
      className={cn('font-medium tabular-nums', className)}
      style={{ color: TONE[tone] || 'var(--text)' }}
      {...rest}
    >
      {children}
    </span>
  );
}

/* A cell in a panel row.
 *
 * IT EXISTS BECAUSE A PAGE CANNOT WRITE `w-16`. Utilities compile only under
 * components/{ui,primitives} (tailwind.css `@source`), so the three column widths this
 * list needs had to be named here or they would have emitted nothing at all — silently,
 * with the row collapsing to whatever the content happened to measure. That is the one
 * failure mode in this repo with no error message, and this component is what keeps
 * RecentTrades.jsx free of it.
 *
 * `width`: fixed  a column that must not move (a date — the whole point of the column
 *                 is that the dates line up)
 *          grow   the one that absorbs the slack and truncates (a symbol)
 *          auto   sized to content, pinned right (a value)
 */
const CELL_WIDTH = {
  fixed: 'w-16 shrink-0',
  grow: 'min-w-0 flex-1 truncate',
  auto: 'shrink-0',
};

export function PanelCell({ width = 'auto', muted = false, className, children, ...rest }) {
  return (
    <span
      data-slot="panel-cell"
      className={cn(
        CELL_WIDTH[width] || CELL_WIDTH.auto,
        muted && 'text-[var(--muted)] tabular-nums',
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

/* THE DASHBOARD'S ACTION STRIP — deliberately chrome-free. No panel, border, background
 * or divider: the frame reads it as two controls floating in whitespace between the
 * brief and the KPI row, not as a third section competing with them. That is why it
 * lives here as its own component rather than as a PanelCard with the box turned off —
 * a card that has to be told not to look like a card invites someone to turn it back on.
 *
 * `status` sits beside the primary action rather than under it, so the strip stays one
 * line high at every width in the range and the KPI row does not move when a sync
 * finishes. It wraps at the narrow end instead of truncating a timestamp. */
export function ActionStrip({ action, status, children, className, ...rest }) {
  return (
    <div
      data-slot="action-strip"
      className={cn('flex flex-wrap items-center justify-between gap-3 px-1', className)}
      {...rest}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        {action}
        {status}
      </div>
      {children}
    </div>
  );
}

/* The strip's quiet right-hand control ("Customize layout"). Not the generated Button's
 * ghost variant: that one carries the preset's own padding and a hover fill, and the
 * frame draws this as a label with an icon — the same weight as the status text it sits
 * across from. */
export function ActionLink({ className, children, ...rest }) {
  return (
    <button
      type="button"
      data-slot="action-link"
      className={cn(
        'flex shrink-0 items-center gap-2 rounded-[6px] px-2 py-1.5',
        'text-[13px] leading-5 font-medium text-[var(--muted)] transition-colors',
        'hover:text-[var(--text)] focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] focus-visible:outline-none',
        '[&_svg]:size-4',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* A sync status line. `tone="pos"` gets the profit colour for the success tick, which is
 * the frame's own choice and the one place a non-outcome uses it — a completed sync is
 * the only "good news" the chrome ever reports. */
export function ActionStatus({ icon, tone, className, children, ...rest }) {
  return (
    <span
      data-slot="action-status"
      className={cn('flex items-center gap-2 text-[13px] leading-5 text-[var(--muted)]', className)}
      {...rest}
    >
      {icon && <span className="shrink-0 [&_svg]:size-4" style={{ color: TONE[tone] || 'var(--muted)' }}>{icon}</span>}
      {children}
    </span>
  );
}

/* ---- LOADING ----------------------------------------------------------------
 * The skeleton vocabulary, on the 2026-08-28 "loading" frame (node 44:2).
 *
 * The frame fills every placeholder with --surface-2 and rounds text lines fully, which
 * is the whole trick: a pill-shaped bar reads as "a line of writing that has not
 * arrived", where a sharp rectangle reads as a component that failed to style. Blocks
 * that stand in for a real box keep that box's radius instead.
 *
 * FIDELITY IS THE POINT, NOT DECORATION. DESIGN-LANGUAGE §16 leaves skeleton fidelity
 * undecided; the frame decides it — every placeholder sits exactly where its content
 * will, inside the real card, so the page does not visibly rearrange when the data
 * lands. A generic spinner over the whole dashboard would be less work and would make
 * every load feel like a page change.
 *
 * `aria-hidden` comes from the Skeleton primitive these compose. The COUNTERPART is on
 * the region: whoever owns it sets `aria-busy` so a screen reader is told something is
 * coming rather than that nothing exists. SkeletonRegion below is that.
 */

/* A line of text that has not arrived. `w` is a fraction of the container, because real
 * lines are ragged: a column of identical-length bars reads as a table, not as prose. */
export function SkeletonLine({ w = '100%', h = '0.75rem', className, ...rest }) {
  return (
    <div
      data-slot="skeleton-line"
      aria-hidden="true"
      className={cn('rounded-full bg-[var(--surface-2)]', className)}
      // Both dimensions are props for the same reason SkeletonBlock's width is: a
      // caller in a page cannot write `h-7`. It compiles to nothing and the line
      // silently keeps the default height, which is the sort of wrong that looks
      // deliberate.
      style={{ width: w, height: h }}
      {...rest}
    />
  );
}

/* A box that has not arrived — a chart, a meter, a calendar cell. Takes the radius of
 * whatever it stands in for.
 *
 * `w` IS A PROP AND NOT A CLASS, and that is the interesting part of this component.
 * The first version took the width via `className="w-40"` from the page, which is the
 * repo's one silent failure: utilities compile only under components/{ui,primitives},
 * so the class emitted nothing, twMerge had already dropped the `w-full` it replaced,
 * and the block rendered 36px tall and ZERO wide inside a flex row — reserving the
 * space its content would occupy while painting nothing at all. Caught by dumping the
 * DOM, not by reading the markup, which looked entirely correct.
 *
 * Taking it as an inline style means a caller in any file gets the width it asked for. */
export function SkeletonBlock({ h = '4rem', w, radius = 12, className, ...rest }) {
  return (
    <div
      data-slot="skeleton-block"
      aria-hidden="true"
      className={cn('bg-[var(--surface-2)]', !w && 'w-full', className)}
      style={{ height: h, width: w, borderRadius: radius, flex: w ? '0 0 auto' : undefined }}
      {...rest}
    />
  );
}

/* Wraps a loading region. `aria-busy` is the half the Skeleton primitive deliberately
 * does not set, and `label` is what a screen reader is told instead of the grey boxes —
 * "Loading brief", not nothing. */
export function SkeletonRegion({ label, className, children, ...rest }) {
  return (
    <div data-slot="skeleton-region" aria-busy="true" aria-label={label} className={cn(className)} {...rest}>
      {children}
    </div>
  );
}

/* The status line the frame pairs with its skeletons — "Loading brief…", "Syncing…".
 * A spinner ALONE is what this replaces: it says something is happening but not what,
 * and on a page with five independent loads that is the difference between "the app is
 * working" and "the app is stuck". */
export function LoadingNote({ className, children, ...rest }) {
  return (
    <span
      data-slot="loading-note"
      className={cn('flex items-center gap-2 text-[12px] leading-4 text-[var(--muted)] [&_svg]:size-3.5', className)}
      {...rest}
    >
      {children}
    </span>
  );
}
