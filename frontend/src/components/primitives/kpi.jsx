import React from 'react';
import { cn } from '@/lib/utils';

/* THE KPI ROW — the dashboard's headline stats, on Base Rhea (2026-08-29).
 *
 * Presentation only, same contract as rail.jsx and brief.jsx. Nothing here computes a
 * metric or knows what R means; KpiCards.jsx does the arithmetic and hands down strings.
 *
 * WHAT RHEA CHANGED, and the through-line is that a KPI card now SHOWS ITS SHAPE:
 *
 *   the hero's signed wash is GONE. The old card washed itself 10% in its own outcome
 *   colour, so "am I up or down" was legible from across a desk. Rhea says it with the
 *   FIGURE instead — 25px of mono, coloured by sign — and gives the card a plain raised
 *   surface. The wash was solving a problem the old 20px figure had; at 25px mono the
 *   number wins on its own, and a full-width green card behind a green number was the
 *   same fact told twice at the cost of the row reading as one thing.
 *
 *   the split bar and the footer line are replaced by A GAUGE AND CHIPS. This is the
 *   real change. `58.33%` over `75W / 53L` is two facts stacked; an arc filled to 58%
 *   with a green `75` and a red `53` beside it is the SAME two facts arranged so the
 *   first is answerable without reading. The gauge is the value's shape, the chips are
 *   its parts, and the number is still there for anyone who wants the digits.
 *
 *   profit factor gets a RING rather than an arc, because it is the one metric here
 *   that is not a percentage of a whole. The ring divides gross profit against gross
 *   loss — the two quantities the ratio is made of — so a 0.78 reads as "more red than
 *   green" rather than as a gauge pointing at 39% of nothing in particular.
 *
 * ESCALATION IS NEVER COLOUR ALONE. A gauge's fill is also its ANGLE, and the chips
 * carry their own figures, so every state survives a greyscale screen.
 */

// tone -> the CSS colour a figure reads in. `flat` is deliberately null: a breakeven is
// a result, not a nothing, and painting it green would inflate a losing week.
const TONE = {
  pos: 'var(--profit)',
  neg: 'var(--loss)',
  flat: null,
};

const toneColor = (tone) => TONE[tone] ?? null;

/* The row. Flex rather than a fixed five-column grid, because the row is
 * user-configurable: any of the five cards can be hidden (dashLayout), and a grid with
 * five declared tracks would leave a hole where a hidden one used to be.
 *
 * THE 12.5rem FLOOR IS THE RESPONSIVE BEHAVIOUR, and it is chosen rather than guessed.
 * The content column is about (viewport - 300) once the rail and page padding are out:
 *
 *   1920 -> ~1620 content   five across, 308 each
 *   1440 -> ~1140 content   five across, 212 each
 *   1080 -> ~780 content    wraps to three + two rather than five 140px slivers
 *
 * flex-wrap does that from the floor alone, with no breakpoint at all — the row reflows
 * continuously across the whole 1080-1920 range instead of snapping at one width. Which
 * is also why the floor is a rem and not a px: it tracks the type. */
export function KpiRow({ className, children, ...rest }) {
  return (
    <div
      data-slot="kpi-row"
      className={cn(
        'flex flex-wrap gap-4 [&>*]:min-w-[12.5rem] [&>*]:flex-1',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/* One card. `hero` is the Net P&L card: a step brighter and behind a stronger hairline,
 * because it is the one figure the whole page is about. That is the ONLY thing left
 * marking it out — see the header on why the signed wash went. */
export function KpiCard({ hero = false, className, children, ...rest }) {
  return (
    <div
      data-slot="kpi-card"
      data-kpi={hero ? 'hero' : undefined}
      className={cn(
        /* ONE BOX, TWO ARRANGEMENTS, AND THE INSETS ARE NOT SYMMETRIC — that asymmetry
           is the alignment.
           
           The hero stacks (label row over figure); the rest run label+figure against a
           gauge, which forces `items-start` and therefore a different top inset. The
           design reconciles the two by arithmetic: the hero pads 28px from the top, and
           the non-hero pads 22px with its inner stack adding 6 (see KpiMain). 22 + 6 =
           28, so the two label rows sit on the same line and the two figures under them
           do too — across cards whose internal layout is not the same.
           
           This shipped as 118px tall with a flat 18px inset on both, plus
           `justify-center` on the non-hero stack and a spacer shoving the hero's figure
           to the floor. Those three together are why the Net P&L card's label sat above
           its neighbours' and its number below theirs. Every value here is the
           prototype's; none of them is a nudge. */
        'flex min-h-[128px] min-w-0 rounded-[14px] border px-[17px] pb-[24px]',
        hero
          ? 'flex-col gap-[13px] pt-[28px] border-[var(--line-control)] bg-[var(--surface-raised)]'
          : 'items-start justify-between gap-3 pt-[22px] border-[var(--line)] bg-[var(--surface)]',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/* The left-hand stack: the label row over the figure. Its own component because the
 * non-hero cards put a gauge beside it, and "the words and the number" is the unit that
 * has to stay together when they do. */
export function KpiMain({ className, children, ...rest }) {
  return (
    <div
      data-slot="kpi-main"
      /* THE 6px TOP PAD IS THE OTHER HALF OF THE HERO ALIGNMENT — see KpiCard. The card
         pads 22 and this adds 6 to reach the hero's 28, which is the only reason a card
         laid out as a row lines up with one laid out as a column.
         
         It was `justify-center` before, which centred this stack against the gauge
         beside it and therefore against nothing in particular — the hero has no gauge,
         so the two cards centred different content and drifted apart. The gauge is
         centred to the card instead (KpiAside self-stretches), which is what lets this
         one be positioned from the top. */
      className={cn('flex min-w-0 flex-col gap-[13px] pt-[6px]', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

/* The label row: the metric's name, its explain affordance, and — on the hero — the
 * trade-count chip. `info` and `trailing` are slots so this file never imports the
 * app's Explain tooltip. */
export function KpiLabel({ info, trailing, className, children, ...rest }) {
  return (
    <div
      data-slot="kpi-label"
      className={cn('flex items-center gap-1.5', className)}
      {...rest}
    >
      <span className="text-[13.5px] leading-5 font-[550] whitespace-nowrap text-[var(--muted)]">
        {children}
      </span>
      {info}
      {trailing && <span className="ml-auto shrink-0">{trailing}</span>}
    </div>
  );
}

/* The count chip — "128 trades". Neutral, always: it is a magnitude, not a verdict, and
 * the old version tinted it with the hero's outcome colour, which made "you took 128
 * trades" look like part of the good or bad news. */
export function KpiPill({ className, children, ...rest }) {
  return (
    <span
      data-slot="kpi-pill"
      className={cn(
        'shrink-0 rounded-[6px] border border-[var(--line-chip)] bg-[var(--sel-bg)] px-[7px] py-0.5',
        'text-[11px] leading-4 font-[550] whitespace-nowrap text-[var(--muted)]',
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

/* The number. 25px mono, and the mono is doing real work: five cards in a row whose
 * digits are proportionally spaced jitter horizontally as the values tick, and a KPI row
 * that shifts under a live feed cannot be read. It is also the largest type on the page
 * and the only place this app goes above 20, which is what makes the row scannable in
 * one pass. */
export function KpiValue({ tone = 'flat', className, children, ...rest }) {
  const hue = toneColor(tone);
  return (
    <div
      data-slot="kpi-value"
      className={cn(
        'font-mono text-[25px] leading-[1.1] font-semibold tracking-[-0.6px] tabular-nums',
        className,
      )}
      style={{ color: hue || 'var(--text)' }}
      {...rest}
    >
      {children}
    </div>
  );
}

/* The right-hand column: a gauge or a ring, with its chips beneath. */
export function KpiAside({ className, children, ...rest }) {
  return (
    <div
      /* `self-stretch` + `justify-center`: the gauge centres against the CARD's full
         height rather than against the label stack, so it stays put when a figure wraps
         and it does not drag the label stack off the hero's line. */
      data-slot="kpi-aside"
      className={cn('flex shrink-0 flex-col items-center justify-center gap-[6px] self-stretch', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

/* THE ARC GAUGE — a half-circle filled to `pct`.
 *
 * The path is drawn once and stroked twice: a track at --chart-grid and the value over
 * it, clipped by `stroke-dasharray`. 131.9 is the arc's own length at r=42, so the dash
 * is a straight percentage of it rather than a number that has to be re-derived if the
 * radius moves.
 *
 * `tone` is the CALLER's verdict, not a threshold this file invents — a win rate has no
 * absolute good/bad line (61% is excellent at 3:1 and ruinous at 1:3), so the component
 * must not decide one. What it does guarantee is that the fill LENGTH always tracks the
 * value, which is the encoding that survives without colour.
 *
 * `aria-hidden`, because the figure beside it says the same thing in digits. */
const ARC_LENGTH = 131.9;

export function KpiGauge({ pct = 0, tone = 'flat', empty = false, className, ...rest }) {
  const v = empty ? 0 : Math.max(0, Math.min(100, pct));
  const hue = toneColor(tone) || 'var(--warning)';
  return (
    <svg
      data-slot="kpi-gauge"
      aria-hidden="true"
      width="74"
      height="42"
      viewBox="0 0 100 56"
      className={cn('block', className)}
      {...rest}
    >
      <path d="M8 50 A42 42 0 0 1 92 50" fill="none" stroke="var(--chart-grid)" strokeWidth="8" strokeLinecap="round" />
      {/* A ZERO-LENGTH DASH WITH A ROUND CAP DRAWS A DOT, not nothing — so a brand-new
          account showed a stray amber pip floating at the left end of every empty
          gauge, which reads as a value rather than as the absence of one. Caught by
          rendering the zero state; the fix is to draw no value path at all. */}
      {v > 0 && (
        <path
          d="M8 50 A42 42 0 0 1 92 50"
          fill="none"
          stroke={hue}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${((v / 100) * ARC_LENGTH).toFixed(1)} ${ARC_LENGTH}`}
        />
      )}
    </svg>
  );
}

/* THE RING — profit factor's own shape, and the reason it is not a gauge.
 *
 * Profit factor is the only metric in this row that is not a percentage of a whole, so a
 * gauge pointing at "39%" would be pointing at nothing. The ring draws the two
 * quantities the ratio is MADE of: gross loss all the way round in --loss, gross profit
 * over it in --profit. A 0.78 then reads as "more red than green" — which is what a
 * profit factor under 1 actually means — and a 1.84 as the reverse.
 *
 * `share` is profit / (profit + loss), so the ring is full green at "no losing trades"
 * and full red at "no winners". 251.3 is the circumference at r=40. */
const RING_LENGTH = 251.3;

export function KpiRing({ share = 0, empty = false, className, ...rest }) {
  const v = Math.max(0, Math.min(1, share));
  return (
    <svg
      data-slot="kpi-ring"
      aria-hidden="true"
      width="66"
      height="66"
      viewBox="0 0 100 100"
      className={cn('block', className)}
      {...rest}
    >
      {/* `empty` IS NOT `share = 0`, AND CONFLATING THEM SHIPPED A LIE. The base ring is
          --loss, so a zero share paints it entirely red — correct for "every trade lost"
          and catastrophically wrong for "no trades yet". A brand-new account's dashboard
          drew a full red ring on its profit-factor card. Caught by rendering the zero
          state, which is exactly what that state is for.

          With no data the ring is the neutral track: clearly a ring, clearly saying
          nothing. */}
      <circle
        cx="50"
        cy="50"
        r="40"
        fill="none"
        stroke={empty ? 'var(--chart-grid)' : 'var(--loss)'}
        strokeWidth="10"
      />
      {!empty && (
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke="var(--profit)"
          strokeWidth="10"
          strokeDasharray={`${(v * RING_LENGTH).toFixed(1)} ${RING_LENGTH}`}
          transform="rotate(-90 50 50)"
        />
      )}
    </svg>
  );
}

/* The chips under a gauge — the value's PARTS. "75" green and "53" red beside a 58%
 * arc, or "$122" and "$86" beside a 1.42 ratio.
 *
 * TONE IS THE OUTCOME VOCABULARY, so the chips are the one place in this row where green
 * and red appear as fills rather than as a figure's colour — and they are still trade
 * outcomes, which is what §4 reserves them for. `flat` is the neutral case (breakevens),
 * which has no outcome and must not borrow one. */
const CHIP = {
  pos: ['var(--profit-bright)', 'color-mix(in srgb, var(--profit) 22%, transparent)'],
  neg: ['var(--loss-bright)', 'color-mix(in srgb, var(--loss) 22%, transparent)'],
  flat: ['var(--muted)', 'var(--sel-bg)'],
};

export function KpiChips({ className, children, ...rest }) {
  return (
    <div data-slot="kpi-chips" className={cn('flex gap-1', className)} {...rest}>
      {children}
    </div>
  );
}

export function KpiChip({ tone = 'flat', className, children, ...rest }) {
  const [color, background] = CHIP[tone] || CHIP.flat;
  return (
    <span
      data-slot="kpi-chip"
      className={cn(
        'rounded-[6px] px-[5px] py-px font-mono text-[10px] leading-4 font-semibold tracking-[-0.2px] whitespace-nowrap',
        className,
      )}
      style={{ color, background }}
      {...rest}
    >
      {children}
    </span>
  );
}

/* KpiSpacer is GONE (2026-08-30). It pushed the hero's figure to the bottom of the
 * card, which is the opposite of what the design does: the hero's figure sits one
 * 13px gap under its label, exactly like every other card's, and the card's own
 * min-height provides the room. Pinning the number to the floor is what put it below
 * the four figures beside it. Its callers dropped it in the same commit. */
