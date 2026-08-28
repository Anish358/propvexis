import React from 'react';
import { cn } from '@/lib/utils';

/* THE KPI ROW — the dashboard's headline stats, on the 2026-08-28 Figma frame (node 1:2).
 *
 * Presentation only, same contract as rail.jsx and brief.jsx. Nothing here computes a
 * metric or knows what R means; KpiCards.jsx does the arithmetic and hands down strings.
 *
 * THE FRAME'S TWO CARD SHAPES, and the one that matters:
 *
 *   hero      no border, a 10% wash of its OWN OUTCOME COLOUR, a count pill, a trend
 *             glyph, and a "Today:" line under the number
 *   default   --surface behind a 10% white hairline, the number, one footer line
 *
 * THE HERO'S WASH IS SIGNED, and this is the whole reason it is a separate shape. The
 * frame draws it green because the account it draws is up. A losing account gets the
 * same card washed in --loss, and a flat one gets no wash at all -- so the single most
 * important fact on the page ("am I up or down") is legible from across a desk, before
 * any digit is read. Hardcoding the green would have made the card a lie exactly when
 * it matters most. `tone` is the prop; kpi.test.js pins all three branches.
 *
 * SCALED TWO STEPS DOWN from the frame (owner, 2026-08-28, after seeing one step in
 * the real shell): 24->16 padding and radius, 30->22 value, 16->10 gaps, 14->13 label,
 * 12->11 footer. The frame is drawn as five cards filling a viewport; in situ they are
 * one band of a page that also has to hold a brief, an account card and a calendar
 * above the fold. The card's PROPORTIONS are the frame's — it is the same card, smaller.
 *
 * The row's floor drops to 11rem with it, which is what keeps five across at 1280.
 */

// tone -> the CSS colour a card reads and washes itself with.
const TONE = {
  pos: 'var(--profit)',
  neg: 'var(--loss)',
  flat: null,      // no wash, default text — a breakeven is a result, not a nothing
};

const toneColor = (tone) => TONE[tone] ?? null;

/* The row. Flex rather than a fixed five-column grid, because the row is
 * user-configurable: any of the five cards can be hidden (dashLayout), and a grid with
 * five declared tracks would leave a hole where a hidden one used to be. The hero keeps
 * its extra width by flex ratio, so hiding a card re-splits the row and the frame's
 * 392-vs-231 proportion survives whatever is left.
 *
 * THE 12.5rem FLOOR IS THE RESPONSIVE BEHAVIOUR, and it is chosen rather than guessed.
 * The content column is about (viewport - 300) once the rail and page padding are out
 * (see breakpoints.js). A card holds a 26px figure over a 13px label, which stops being
 * legible under ~200px:
 *
 *   1920 -> ~1620 content   five across, 308 each
 *   1440 -> ~1140 content   five across, 212 each — the frame's own layout
 *   1280 -> ~980 content    five across, 180 each, at the floor
 *   1080 -> ~780 content    wraps to three + two rather than five 140px slivers
 *
 * flex-wrap does that on its own from the floor alone, with no breakpoint at all — the
 * row reflows continuously across the whole 1080-1920 range instead of snapping at one
 * width. Which is also why the floor is a rem and not a px: it tracks the type. */
export function KpiRow({ className, children, ...rest }) {
  return (
    <div
      data-slot="kpi-row"
      className={cn(
        'flex flex-wrap gap-3 [&>*]:min-w-[11rem] [&>*]:flex-1',
        // The hero is ~1.7x a default card in the frame (392 : 231). Dropped once the
        // row wraps: on a two-card line a 1.7 ratio makes the hero swallow the row.
        'min-[1080px]:[&>[data-kpi=hero]]:flex-[1.7]',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function KpiCard({ hero = false, tone = 'flat', className, children, ...rest }) {
  const hue = toneColor(tone);
  return (
    <div
      data-slot="kpi-card"
      data-kpi={hero ? 'hero' : undefined}
      className={cn(
        'flex flex-col gap-2.5 rounded-[16px] p-4',
        hero
          // The wash IS the border: a hero with both reads as two nested boxes.
          ? 'border-0'
          : 'border border-[var(--line)] bg-[var(--surface)]',
        className,
      )}
      style={hero
        ? { background: hue ? `color-mix(in srgb, ${hue} 10%, var(--surface))` : 'var(--surface)' }
        : undefined}
      {...rest}
    >
      {children}
    </div>
  );
}

/* The label row: the metric's name, its explain affordance, and — on the hero — the
 * trade-count pill. `info` and `trailing` are slots so this file never imports the
 * app's Explain tooltip. */
export function KpiLabel({ info, trailing, className, children, ...rest }) {
  return (
    <div
      data-slot="kpi-label"
      className={cn('flex items-center gap-2', className)}
      {...rest}
    >
      <span className="text-[13px] leading-5 font-normal text-[var(--muted)]">{children}</span>
      {info}
      {trailing && <span className="ml-auto shrink-0">{trailing}</span>}
    </div>
  );
}

/* The count pill — "128 Trades". Washed and coloured by the same tone as the hero it
 * sits in, so the card is one colour statement rather than two. */
export function KpiPill({ tone = 'flat', className, children, ...rest }) {
  const hue = toneColor(tone);
  return (
    <span
      data-slot="kpi-pill"
      className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] leading-4 font-normal', className)}
      style={hue
        ? { background: `color-mix(in srgb, ${hue} 15%, transparent)`, color: hue }
        : { background: 'var(--surface-2)', color: 'var(--muted)' }}
      {...rest}
    >
      {children}
    </span>
  );
}

/* The number. 26/32 semibold — the largest type on the page and the only place this app
 * goes above 18, which is what makes the row scannable in one pass.
 *
 * `tabular` is on by default and is not cosmetic: five cards in a row whose digits are
 * proportionally spaced jitter horizontally as the values tick, and a KPI row that
 * shifts under a live feed is unreadable. This is also why the redesign can drop the
 * monospace face entirely — tabular-nums is the property that was actually doing the
 * work. */
export function KpiValue({ tone = 'flat', trailing, className, children, ...rest }) {
  const hue = toneColor(tone);
  return (
    <div data-slot="kpi-value" className={cn('flex items-end justify-between gap-3', className)} {...rest}>
      <span
        className="text-[22px] leading-7 font-semibold tabular-nums"
        style={{ color: hue || 'var(--text)' }}
      >
        {children}
      </span>
      {trailing && <span className="shrink-0 [&_svg]:size-5" style={{ color: hue || 'var(--muted)' }}>{trailing}</span>}
    </div>
  );
}

/* The footer line — "Today: +8.4%", "26 of 42 days green", "Healthy · above 1.0".
 * `tone` colours it where the line is itself a verdict (the profit factor's), and is
 * left flat where it is merely context. */
export function KpiFoot({ tone = 'flat', className, children, ...rest }) {
  const hue = toneColor(tone);
  return (
    <p
      data-slot="kpi-foot"
      className={cn('m-0 text-[11px] leading-4 font-normal', className)}
      style={{ color: hue || 'var(--muted)' }}
      {...rest}
    >
      {children}
    </p>
  );
}

/* The win/loss split bar under Trade Win %. The TRACK is --loss and the FILL is
 * --profit, so the bar reads as a whole divided rather than as a value on a neutral
 * scale — 58% wins is also 42% losses, and both halves are information. The track sits
 * at 50% opacity so the two halves are distinguishable as figure and ground; at full
 * strength the bar reads as two competing bars.
 *
 * `aria-hidden`, because the "75W / 53L" line beneath it says the same thing in text —
 * the bar is a second encoding of one fact, not a fact of its own. */
export function KpiSplitBar({ share = 0, className, ...rest }) {
  const pct = Math.max(0, Math.min(100, share * 100));
  return (
    <div
      data-slot="kpi-split"
      aria-hidden="true"
      className={cn('h-2 w-full overflow-hidden rounded-full', className)}
      style={{ background: 'color-mix(in srgb, var(--loss) 50%, transparent)' }}
      {...rest}
    >
      <div className="h-full rounded-full bg-[var(--profit)]" style={{ width: `${pct}%` }} />
    </div>
  );
}

/* Pushes whatever follows it to the bottom of the card, so five cards with different
 * amounts of footer content still line their numbers up. The frame does this with three
 * different bottom paddings (38, 54, 24) — one per card — which is the same layout
 * expressed as three numbers that would each need re-tuning on any copy change. */
export function KpiSpacer() {
  return <div data-slot="kpi-spacer" className="flex-1" />;
}
