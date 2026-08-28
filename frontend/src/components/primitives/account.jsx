import React from 'react';
import { cn } from '@/lib/utils';

/* ACCOUNT HEALTH — the full-width card that says whether this account is about to die.
 * On the 2026-08-28 Figma frame (node 1:2), scaled one step down like the rest of the
 * page: 28->20 padding, 24->20 card radius, 24->22 meter figure, 20->16 gaps.
 *
 * Presentation only. Nothing here reads a challenge, computes a drawdown or decides a
 * threshold — AccountDetails.jsx and prop.js do that and hand down strings and a tone.
 *
 * THE MOST IMPORTANT COMPONENT ON THE PAGE, and the tone map is why. A prop trader is
 * one bad hour from losing an account and the fee they paid for it; these three meters
 * are the only thing on the dashboard that can say so before it happens. So:
 *
 *   good     no wash. A quiet meter should be quiet — if a healthy account draws
 *            colour, colour stops meaning anything and the warning states lose their
 *            only advantage.
 *   warn     amber at 5% behind a 20% border. Visible from across a desk.
 *   bad      red, same treatment. Reserved for breached or under 25% room.
 *   na       neutral. A missing rule is not a safe rule; it is an unknown, and drawing
 *            it green would be a lie.
 *
 * The frame draws the target meter green, which is the one case where a wash is
 * ENCOURAGEMENT rather than alarm — a target is progress, not consumption. That is the
 * `target`/`payout` tone, and it is deliberately a different entry from `good`.
 *
 * ESCALATION IS NOT COLOUR ALONE (DESIGN-LANGUAGE, and WCAG): every toned meter also
 * gets an icon from the caller, and the figure itself changes colour, so a trader who
 * cannot separate amber from green still reads the state three other ways.
 */

// tone -> the CSS colour a meter washes and fills itself with. `good` and `na` are
// deliberately null: see the header.
const TONE = {
  good: null,
  warn: 'var(--warning)',
  bad: 'var(--loss)',
  target: 'var(--profit)',
  payout: 'var(--payout)',
  na: null,
};

const toneColor = (tone) => TONE[tone] ?? null;

export function AccountCardShell({ className, children, ...rest }) {
  return (
    <section
      data-slot="account-card"
      className={cn(
        'flex flex-col gap-5 rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5',
        className,
      )}
      {...rest}
    >
      {children}
    </section>
  );
}

/* The card's title row. `icon` is a slot (the frame uses a shield) and `sub` is the
 * optional line under it.
 *
 * THE FRAME PRINTS THE TRADING-DAY COUNT TWICE — once here as the header's sub and
 * again in the footer. That is a slip rather than a decision: the same seven words in
 * two places within one card teaches the reader that neither is worth reading. It is
 * rendered once, in the footer, where the existing app already put it and where it sits
 * beside the link it relates to. `sub` stays for a caller with something else to say. */
export function AccountCardHead({ icon, sub, className, children, ...rest }) {
  return (
    <div data-slot="account-head" className={cn('flex flex-col gap-1.5', className)} {...rest}>
      <div className="flex items-center gap-3">
        {icon && <span className="shrink-0 text-[var(--text-2)] [&_svg]:size-5">{icon}</span>}
        <h3 className="text-[16px] leading-6 font-semibold text-[var(--text)]">{children}</h3>
      </div>
      {sub && <p className="m-0 text-[13px] leading-5 text-[var(--muted)]">{sub}</p>}
    </div>
  );
}

/* The account switcher row. Wraps rather than scrolls: at 1080 four tabs plus an
 * overflow control do not fit on one line, and a horizontally scrolling strip of
 * accounts hides the very account a trader is looking for. */
export function AccountTabs({ className, children, ...rest }) {
  return (
    <div data-slot="account-tabs" className={cn('flex flex-wrap items-center gap-3', className)} {...rest}>
      {children}
    </div>
  );
}

/* One account tab — a dot, a label, and an optional alert glyph. Selected gets the
 * page background (a well, not a raise) plus a full-strength border, which is the
 * frame's own treatment: these sit ON a surface, so "selected" reads as recessed. */
export function AccountTab({
  tone = 'good', selected = false, alert, className, children, ...rest
}) {
  const hue = toneColor(tone);
  return (
    <button
      type="button"
      data-slot="account-tab"
      aria-pressed={selected}
      className={cn(
        'flex h-9 shrink-0 items-center gap-2 rounded-[6px] border px-3',
        'text-[13px] leading-5 font-medium transition-colors',
        'focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] focus-visible:outline-none',
        selected
          ? 'border-[var(--line-strong)] bg-[var(--bg)] text-[var(--text)]'
          : 'border-[var(--line)] bg-transparent text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--text)]',
        '[&_svg]:size-3.5',
        className,
      )}
      {...rest}
    >
      {/* The dot is the health, and it is never the only carrier of it — `alert` adds a
          shape for warn/bad, so severity survives both a greyscale screen and a reader
          who cannot separate the hues. */}
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ background: hue || 'var(--profit)' }}
        aria-hidden="true"
      />
      <span className="truncate">{children}</span>
      {alert}
    </button>
  );
}

/* The overflow control — "+2 Accounts". Taller and rounder than a tab on purpose (the
 * frame draws 48 tall at 16 radius against the tabs' 36 at 6): it is not one more
 * account, it is a way to see the rest, and looking like a tab would make it read as a
 * selectable account that never selects. */
export function AccountTabMore({ className, children, ...rest }) {
  return (
    <button
      type="button"
      data-slot="account-tab-more"
      className={cn(
        'flex h-9 shrink-0 items-center gap-1.5 rounded-[12px] bg-[var(--bg)] px-3',
        'text-[13px] leading-5 font-medium text-[var(--muted)] transition-colors',
        'hover:text-[var(--text)] focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] focus-visible:outline-none',
        '[&_svg]:size-3.5',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* The three meters. Equal thirds down to 1200, then one column — a meter has to hold a
 * 22px figure, its limit, a bar and a footer line, and under ~300px the figure and the
 * limit collide. */
export function MeterRow({ className, children, ...rest }) {
  return (
    <div
      data-slot="meter-row"
      className={cn('grid grid-cols-3 gap-4 max-[1200px]:grid-cols-1', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * One rule meter.
 *
 * USED / LIMIT, NOT ROOM REMAINING, and the bar fills UP as risk grows. A
 * room-remaining bar empties toward danger, which means the most alarming state is the
 * one with the least ink on screen — precisely backwards for the one number that ends
 * accounts. This framing is inherited from the pre-redesign meter and is not a visual
 * choice to revisit.
 *
 * @param {string} label     what rule this is
 * @param {node}   icon      the tone's glyph — required for warn/bad, see the header
 * @param {node}   value     the figure, already formatted
 * @param {node}   limit     the "/ $2,500" half, already formatted
 * @param {number} pct       0..1 fill
 * @param {string} tone      good | warn | bad | target | payout | na
 * @param {node}   sub       the footer line
 */
export function Meter({
  label, icon, value, limit, pct = 0, tone = 'good', sub, className, ...rest
}) {
  const hue = toneColor(tone);
  const fill = Math.max(0, Math.min(100, (pct || 0) * 100));
  return (
    <div
      data-slot="meter"
      className={cn('flex flex-col gap-3 rounded-[16px] border p-4', className)}
      style={{
        // No wash and a plain hairline when the account is fine. See the header on why
        // a quiet meter stays quiet.
        background: hue ? `color-mix(in srgb, ${hue} 5%, transparent)` : 'transparent',
        borderColor: hue ? `color-mix(in srgb, ${hue} 20%, transparent)` : 'var(--line)',
      }}
      {...rest}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] leading-5 font-normal text-[var(--muted)]">{label}</span>
        {icon && <span className="shrink-0 [&_svg]:size-4" style={{ color: hue || 'var(--muted)' }}>{icon}</span>}
      </div>

      {/* Baseline-aligned, so the big figure and its limit read as one quantity rather
          than two stacked values. tabular-nums for the same reason the KPI row uses it:
          these tick on every ingested trade. */}
      <p className="m-0 flex flex-wrap items-baseline gap-1.5">
        <span
          className="text-[22px] leading-7 font-semibold tabular-nums"
          style={{ color: hue && tone !== 'warn' && tone !== 'bad' ? hue : 'var(--text)' }}
        >
          {value}
        </span>
        {limit && <span className="text-[13px] leading-5 font-normal text-[var(--muted)] tabular-nums">{limit}</span>}
      </p>

      {/* The track is a real surface, not a tint of the fill: a track washed in the
          fill's own hue makes an 8%-used meter look half full from a distance. */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${fill}%`, background: hue || 'var(--text-3)' }}
        />
      </div>

      {sub && <div className="text-[11px] leading-4 text-[var(--muted)]">{sub}</div>}
    </div>
  );
}

/* The card's footer — a fact on the left, a way out on the right, over a hairline.
 * Wraps at narrow widths so the link never overlaps the text it sits beside. */
export function AccountCardFoot({ action, className, children, ...rest }) {
  return (
    <div
      data-slot="account-foot"
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4',
        className,
      )}
      {...rest}
    >
      <span className="flex items-center gap-2 text-[13px] leading-5 text-[var(--muted)] [&_svg]:size-4">
        {children}
      </span>
      {action}
    </div>
  );
}

/* "View account →". A quiet link-shaped button, not a filled one: leaving the dashboard
 * is not the action this card wants you to take — reading the meters is. */
export function AccountCardLink({ render, className, children, ...rest }) {
  const classes = cn(
    'flex items-center gap-2 rounded-[6px] text-[13px] leading-5 font-medium text-[var(--muted)]',
    'transition-colors hover:text-[var(--text)] no-underline',
    'focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] focus-visible:outline-none',
    '[&_svg]:size-4',
    className,
  );
  if (render) {
    return React.cloneElement(render, {
      className: cn(classes, render.props.className),
      'data-slot': 'account-link',
      ...rest,
    }, children);
  }
  return (
    <button type="button" data-slot="account-link" className={classes} {...rest}>
      {children}
    </button>
  );
}
