import React from 'react';
import { cn } from '@/lib/utils';

/* ACCOUNT HEALTH — the card that says whether this account is about to die.
 * Base Rhea, 2026-08-29.
 *
 * Presentation only. Nothing here reads a challenge, computes a drawdown or decides a
 * threshold — AccountDetails.jsx and domain/prop/prop.js do that and hand down strings
 * and a tone.
 *
 * THE MOST IMPORTANT COMPONENT ON THE PAGE, and the tone maps are why. A prop trader is
 * one bad hour from losing an account and the fee they paid for it; these three meters
 * are the only thing on the dashboard that can say so before it happens.
 *
 * WHAT RHEA CHANGED, and the big one is the bar:
 *
 *   THE DRAWDOWN BAR IS A STRETCHED RISK RAMP, not a flat fill. It used to paint the
 *   whole bar in the tone's single colour — amber at 70%, red at 90% — which means a
 *   meter at 69% and one at 71% look like two different states rather than one
 *   continuum, and the trader learns the thresholds rather than the trajectory. Rhea
 *   fills it with ONE gradient (yellow -> orange -> red) stretched so the visible slice
 *   shows how far up that ramp this account has climbed. A meter at 30% is yellow, at
 *   70% orange, at 95% deep red, and it gets there smoothly.
 *
 *   THERE IS NO GREEN ON IT AT ANY FILL. Used drawdown is never good news, only less
 *   bad, and a green drawdown bar is the app congratulating a trader for surviving. It
 *   is also §4: green and red are trade outcomes, never status.
 *
 *   THE TARGET METER INVERTS. A profit target is the one meter here where filling up is
 *   progress rather than consumption, so it gets a flat --profit-fill and no ramp. That
 *   is the `target`/`payout` tone and it is deliberately a different entry from `good`.
 *
 *   A 90% MARKER LINE sits on every risk meter. It is where "you have room" becomes
 *   "one trade could end this", and drawing it means the trader sees the wall coming
 *   rather than being told they hit it.
 *
 * ESCALATION IS NOT COLOUR ALONE (§14, and WCAG): every toned meter also gets an icon
 * from the caller, the figure changes colour, and the percentage is written out — so a
 * trader who cannot separate amber from red still reads the state three other ways.
 */

// tone -> the CSS colour a meter reads in. `good` and `na` are deliberately null: a
// quiet meter should be quiet, and a missing rule is an unknown rather than a safe one.
const TONE = {
  good: null,
  warn: 'var(--warning)',
  bad: 'var(--loss)',
  target: 'var(--profit)',
  payout: 'var(--payout)',
  na: null,
};

const toneColor = (tone) => TONE[tone] ?? null;

// Which tones FILL UP as good news rather than as consumption. See the header.
const INVERTED = new Set(['target', 'payout']);

/* The card. `critical` reddens its own edge — the one place a container border carries
 * meaning in this app, and it earns it: when an account is inside its stop-trading zone
 * the whole card is the message, not one meter inside it. */
export function AccountCardShell({ critical = false, className, children, ...rest }) {
  return (
    <section
      data-slot="account-card"
      className={cn(
        'flex flex-col overflow-hidden rounded-[14px] border bg-[var(--surface)]',
        critical ? 'border-[var(--loss-deep)]' : 'border-[var(--line)]',
        className,
      )}
      {...rest}
    >
      {children}
    </section>
  );
}

/* The account switcher row. Scrolls rather than wrapping — Rhea's own call, and the
 * right one here: these chips are 200px+ each, so wrapping four of them puts a second
 * row above the meters and pushes the numbers that matter below the fold. A scrolled
 * strip keeps the card one height whatever the account count. */
export function AccountTabs({ className, children, ...rest }) {
  return (
    <div
      data-slot="account-tabs"
      className={cn('flex items-stretch gap-2.5 overflow-x-auto px-[18px] pt-4 pb-1', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

/* One account chip — a health ring, a name, a phase.
 *
 * THE RING IS A RING AND NOT A DOT, and that is what lets it carry two facts at once:
 * the OUTER ring says which account is selected (light when it is, dim when not) and
 * the INNER dot says how healthy that account is. A single dot would have had to mean
 * both, and selection would have started reading as a health state. */
export function AccountTab({
  tone = 'good', selected = false, phase, alert, className, children, ...rest
}) {
  const hue = toneColor(tone) || 'var(--profit)';
  return (
    <button
      type="button"
      data-slot="account-tab"
      aria-pressed={selected}
      className={cn(
        'flex shrink-0 items-center gap-3 rounded-[12px] border py-3 pr-6 pl-[18px] text-left whitespace-nowrap',
        'transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] focus-visible:outline-none',
        selected
          ? 'border-[var(--line-selected)] bg-[var(--sel-well)]'
          : 'border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--sel-well)]',
        className,
      )}
      {...rest}
    >
      <span
        className={cn(
          'grid size-[15px] shrink-0 place-items-center rounded-full border-2',
          selected ? 'border-[var(--action-2)]' : 'border-[var(--line-chip)]',
        )}
      >
        <span className="size-1.5 rounded-full" style={{ background: hue }} aria-hidden="true" />
      </span>
      <span className="flex flex-col gap-[3px]">
        <span
          className={cn(
            'flex items-center gap-2.5 text-[14.5px] leading-5 font-semibold tracking-[-0.1px]',
            selected ? 'text-[var(--text)]' : 'text-[var(--text-2)]',
          )}
        >
          {children}
          {/* The glyph is the shape half of the encoding — a healthy account gets
              NOTHING, which is the point: zero emphasis on the quiet ones is what makes
              the two states that need attention visible. */}
          {alert && <span className="flex [&_svg]:size-3.5" style={{ color: hue }}>{alert}</span>}
        </span>
        <span className={cn('text-[12px] leading-4 font-[450]', selected ? 'text-[var(--muted)]' : 'text-[var(--text-4)]')}>
          {phase}
        </span>
      </span>
    </button>
  );
}

/* The overflow control — "+2 Accounts". Dashed and unfilled on purpose: it is not one
 * more account, it is a way to see the rest, and looking like a chip would make it read
 * as a selectable account that never selects. */
export function AccountTabMore({ className, children, ...rest }) {
  return (
    <button
      type="button"
      data-slot="account-tab-more"
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-[12px] border border-dashed border-[var(--line-strong)] px-4 py-3',
        'text-[12.5px] leading-4 font-[550] whitespace-nowrap text-[var(--text-3)] transition-colors',
        'hover:border-[var(--line-hover)] hover:text-[var(--text)]',
        'focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] focus-visible:outline-none',
        '[&_svg]:size-3.5',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* THE STOP-TRADING BANNER. Full-bleed across the card above the meters, because by the
 * time this shows the individual meters are detail — the message is "stop".
 *
 * IT BREATHES, AND THAT IS THE ONE ANIMATION IN THIS APP THAT LOOPS. Everything else
 * animates on a state change and settles. This does not settle because the condition
 * does not: an account 88% through its daily loss limit is still 88% through it a
 * minute later, and a static red bar is something the eye stops seeing. `motion-safe`
 * gates it — a reduced-motion user gets the banner without the pulse, which is §10's
 * rule that the state change still happens.
 *
 * The Rhea prototype puts a "Lock account" button here. It is NOT built (owner): there
 * is no lock-account action in this app, and a button that does nothing on the one
 * banner a trader most needs to trust is worse than no button. */
export function AccountBanner({ icon, label, className, children, ...rest }) {
  return (
    <div
      data-slot="account-banner"
      role="status"
      className={cn(
        'flex items-center gap-2.5 border-b border-[var(--loss-deep)] px-6 py-3.5',
        'bg-[color-mix(in_srgb,var(--loss-deep)_30%,transparent)]',
        'motion-safe:animate-[pv-breathe_2.4s_ease-in-out_infinite]',
        className,
      )}
      {...rest}
    >
      <span className="flex shrink-0 text-[var(--loss-bright)] [&_svg]:size-4" aria-hidden="true">
        {icon}
      </span>
      <span className="text-[12.5px] leading-4 font-[650] tracking-[0.02em] text-[var(--loss-fg)] uppercase">
        {label}
      </span>
      <span className="text-[12.5px] leading-4 text-[var(--loss-fg-2)]">{children}</span>
    </div>
  );
}

/* The three meters. Equal thirds down to 1200, then one column — a meter has to hold a
 * 24px figure, its limit, a bar and a footer line, and under ~300px the figure and the
 * limit collide. */
export function MeterRow({ className, children, ...rest }) {
  return (
    <div
      data-slot="meter-row"
      className={cn('grid grid-cols-3 gap-4 px-[18px] pt-3 pb-5 max-[1200px]:grid-cols-1', className)}
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
 * accounts. Inherited from the pre-redesign meter and not a visual choice to revisit.
 *
 * @param {string} label   what rule this is
 * @param {node}   icon    the tone's glyph — required for warn/bad, see the header
 * @param {node}   value   the figure, already formatted
 * @param {node}   limit   the "/ $2,500" half, already formatted
 * @param {number} pct     0..1 fill
 * @param {string} tone    good | warn | bad | target | payout | na
 * @param {node}   sub     the footer line
 * @param {node}   meta    the right-hand footer note ("Resets in 6h 12m")
 */
export function Meter({
  label, icon, value, limit, pct = 0, tone = 'good', sub, meta, className, ...rest
}) {
  const hue = toneColor(tone);
  const inverted = INVERTED.has(tone);
  const fill = Math.max(0, Math.min(100, (pct || 0) * 100));
  const critical = tone === 'bad';

  /* STRETCHING THE RAMP is the whole trick, and it is one line. `background-size` set to
   * (100 / fill) × 100% makes the gradient that many times wider than the bar, so the
   * visible portion is exactly the first `fill`% of it. At 30% you see the yellow end,
   * at 95% you see nearly all of it including the red. A plain gradient without this
   * would show the FULL ramp compressed into whatever width the bar has — every meter
   * ending in red regardless of how much room is left, which is the opposite of
   * informative. */
  const barSize = fill > 0 ? `${(10000 / fill).toFixed(0)}% 100%` : '100% 100%';

  return (
    <div
      data-slot="meter"
      className={cn('flex min-w-0 flex-col gap-3.5 rounded-[12px] px-[22px] pt-5 pb-[21px]', className)}
      style={{
        // A critical meter washes; every other state sits on the sunken surface. See
        // the header on why a quiet meter stays quiet.
        background: critical
          ? 'color-mix(in srgb, var(--loss-deep) 30%, transparent)'
          : 'var(--surface-sunken)',
      }}
      {...rest}
    >
      <div className="flex items-center gap-[7px]">
        <span
          className="text-[11px] leading-4 font-semibold tracking-[0.09em] uppercase"
          style={{ color: critical ? 'var(--loss-fg-2)' : 'var(--text-4)' }}
        >
          {label}
        </span>
        {icon && <span className="flex items-center [&_svg]:size-3" style={{ color: hue }}>{icon}</span>}
      </div>

      {/* Baseline-aligned, so the big figure and its limit read as one quantity rather
          than two stacked values. Mono for the same reason the KPI figures are: these
          tick on every ingested trade. */}
      <p className="m-0 flex min-w-0 flex-wrap items-baseline gap-[7px] font-mono tabular-nums">
        <span
          className="text-[24px] leading-none font-semibold tracking-[-0.8px]"
          style={{ color: critical ? 'var(--loss-fg)' : 'var(--text)' }}
        >
          {value}
        </span>
        {limit && <span className="text-[13.5px] leading-5 text-[var(--text-5)]">/ {limit}</span>}
      </p>

      {/* The track is a real surface, not a tint of the fill: a track washed in the
          fill's own hue makes an 8%-used meter look half full from a distance. */}
      <div className="relative h-[5px] overflow-hidden rounded-full bg-[var(--surface-hover)]">
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${fill}%`,
            background: inverted ? 'var(--profit-fill)' : 'var(--risk-ramp)',
            backgroundSize: inverted ? 'auto' : barSize,
          }}
        />
        {/* THE 90% WALL. Only on a risk meter — on a target, 90% is nearly there rather
            than nearly dead, and a warning line would invert the message. */}
        {!inverted && (
          <span
            className="absolute inset-y-0 left-[90%] w-px"
            style={{ background: critical ? 'var(--loss-fg-2)' : 'var(--line-hover)' }}
            aria-hidden="true"
          />
        )}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12px] leading-4">
        <span className="font-mono font-semibold" style={{ color: hue || 'var(--risk-2)' }}>
          {(fill).toFixed(1)}%
        </span>
        {sub && <span className="text-[var(--text-4)]">{sub}</span>}
        <div className="flex-1" />
        {meta && <span className="text-[var(--text-5)]">{meta}</span>}
      </div>
    </div>
  );
}

/* The card's footer — a fact on the left, a way out on the right, on the sunken surface
 * so it reads as the card's floor rather than as a fourth meter. */
export function AccountCardFoot({ action, className, children, ...rest }) {
  return (
    <div
      data-slot="account-foot"
      className={cn(
        'flex flex-wrap items-center gap-4 border-t border-[var(--line-inset)] bg-[var(--surface-sunken)] px-6 py-[17px]',
        className,
      )}
      {...rest}
    >
      <span className="flex items-center gap-2 text-[13px] leading-5 text-[var(--muted)] [&_svg]:size-4 [&_svg]:text-[var(--text-4)]">
        {children}
      </span>
      <div className="flex-1" />
      {action}
    </div>
  );
}

/* A figure inside the footer sentence. It exists because a page CANNOT write
 * `font-mono` — utilities compile only under components/{ui,primitives}, so the class
 * would emit nothing at all and the count would silently render as body text beside
 * every other mono figure on the card. That is the one failure in this repo with no
 * error message. Rhea sets the count in mono so a glance lands on "7/10" rather than on
 * the sentence around it. */
export function AccountFootFigure({ className, children, ...rest }) {
  return (
    <span
      data-slot="account-foot-figure"
      className={cn('font-mono font-semibold tabular-nums text-[var(--text-body)]', className)}
      {...rest}
    >
      {children}
    </span>
  );
}

/* A vertical hairline between two facts in the footer. */
export function AccountFootRule() {
  return <span aria-hidden="true" className="h-3.5 w-px shrink-0 bg-[var(--line-strong)]" />;
}

/* "View account →". A quiet link, not a filled button: leaving the dashboard is not the
 * action this card wants you to take — reading the meters is. */
export function AccountCardLink({ render, className, children, ...rest }) {
  const classes = cn(
    'flex shrink-0 items-center gap-2 rounded-[6px] text-[13px] leading-5 font-[550] no-underline',
    'text-[var(--text-link)] transition-colors hover:text-[var(--text)]',
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

/* The card's title row. Kept as a slot for callers that want one; Rhea's own card opens
 * straight on the account chips, because the chips ARE the title — they say which
 * account these meters describe, which is the only thing a heading here could add. */
export function AccountCardHead({ icon, sub, className, children, ...rest }) {
  return (
    <div data-slot="account-head" className={cn('flex flex-col gap-1.5 px-[18px] pt-4', className)} {...rest}>
      <div className="flex items-center gap-3">
        {icon && <span className="shrink-0 text-[var(--text-2)] [&_svg]:size-5">{icon}</span>}
        <h3 className="text-[15px] leading-6 font-[650] text-[var(--text)]">{children}</h3>
      </div>
      {sub && <p className="m-0 text-[13px] leading-5 text-[var(--muted)]">{sub}</p>}
    </div>
  );
}
