import React from 'react';
import { cn } from '@/lib/utils';

/* TODAY'S BRIEF — the dashboard's top card, on Base Rhea (2026-08-29).
 *
 * Presentation only, same contract as rail.jsx: nothing here fetches, filters by
 * timezone, or knows what a trading account is. Dashboard.jsx keeps all of that and
 * hands down finished rows.
 *
 * WHAT RHEA CHANGED FROM THE FIGMA PASS THIS REPLACES, and each is a decision rather
 * than a nudge:
 *
 *   the amber tile is GONE. The card used to open with a 36px amber-washed sun. Rhea
 *   opens on the title itself, with the date and a live clock beside it — the brief is
 *   the morning read, and an icon saying so is the app explaining its own furniture.
 *
 *   ROWS ARE NEUTRAL; SEVERITY IS THE GLYPH AND THE WORD. Alert rows used to carry a
 *   10% wash of their severity behind a 20% border. Rhea draws every row on the same
 *   --row-bg and puts the severity in a coloured icon plus an uppercase label. Three
 *   washed rows in a 153px column read as one striped block and the eye stops
 *   separating them; a coloured glyph against a neutral row does not. This also keeps
 *   §14's escalation rule satisfied the strong way — the WORD "CRITICAL" is not a
 *   colour, so the encoding survives a greyscale screen.
 *
 *   THE COLUMNS SCROLL rather than truncating to four events. 153px is the design's,
 *   and it is two-and-a-bit alert rows or four-and-a-bit event rows — enough to say
 *   "there is more" without the card taking a third of the fold.
 *
 * TWO COLOUR SYSTEMS, AND THEY ARE NOT THE SAME ONE. An event's dot encodes IMPACT —
 * how hard the market is likely to move — and an alert's glyph encodes SEVERITY — how
 * close this account is to dying. They collide on amber and read as one scale at a
 * glance, which is why they are separate maps below rather than one shared `tone`: a
 * medium-impact CPI print and an account 1.2% from breaching are not the same amber,
 * and the day someone tunes one they must not silently tune the other.
 */

export function BriefCard({ className, children, ...rest }) {
  return (
    <section
      data-slot="brief"
      className={cn(
        'flex flex-col overflow-hidden rounded-[14px] border border-[var(--line)] bg-[var(--surface)]',
        className,
      )}
      {...rest}
    >
      {children}
    </section>
  );
}

/* The header — one row: title, date, clock, then the settings control.
 *
 * The separators are `·` at --line-hover, which is Rhea's way of saying "these three
 * are one sentence". A pipe would read as a table; a gap alone lets the date float
 * away from the title it qualifies. */
export function BriefHeader({ title, date, clock, action, className, ...rest }) {
  return (
    <div
      data-slot="brief-header"
      className={cn('flex flex-wrap items-center gap-2.5 px-[26px] pt-[22px] pb-3.5', className)}
      {...rest}
    >
      <h2 className="m-0 text-[18.5px] leading-7 font-[650] tracking-[-0.25px] text-[var(--text)]">
        {title}
      </h2>
      {date && (
        <>
          <span className="text-[var(--line-hover)]" aria-hidden="true">·</span>
          <span className="text-[13px] leading-5 font-[450] text-[var(--muted)]">{date}</span>
        </>
      )}
      {clock && (
        <>
          <span className="text-[var(--line-hover)]" aria-hidden="true">·</span>
          {clock}
        </>
      )}
      <div className="flex-1" />
      {action}
    </div>
  );
}

/* The clock. Mono, because it ticks every second and a proportional face makes the
 * whole header jitter as the digits change width. */
export function BriefClock({ className, children, ...rest }) {
  return (
    <span
      data-slot="brief-clock"
      className={cn(
        'font-mono text-[13px] leading-5 tabular-nums text-[var(--text-link)]',
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

/* The settings trigger — a 28px round icon button, one step smaller than the top bar's
 * 36px chrome because it belongs to this card rather than to the app.
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
        'flex size-7 shrink-0 items-center justify-center rounded-full',
        'border border-[var(--line-control)] bg-[var(--control-bg)] text-[var(--text-3)]',
        'transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]',
        'focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] focus-visible:outline-none',
        '[&_svg]:size-3.5',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

/* Two columns, the left one wider — Rhea's 1.25fr : 1fr. Events carry five fields on
 * one line and alerts carry two stacked, so equal halves waste width on the right and
 * truncate the left.
 *
 * STACKED BELOW 1200, not at the rail's 900. The two are different questions: the rail
 * leaves the flow at 900 because a 248px rail on a phone is unusable; these columns
 * stop working at 1200 because that is where the left half drops under ~380px and an
 * event row can no longer hold a flag, a name, a time and an impact badge on one line.
 * The title truncates to nothing while the badges keep their width — the list stops
 * being readable well before the rail stops fitting. */
export function BriefColumns({ className, children, ...rest }) {
  return (
    <div
      data-slot="brief-columns"
      className={cn(
        'grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-11 px-[26px] pt-1.5 pb-[26px]',
        'max-[1200px]:grid-cols-1 max-[1200px]:gap-6',
        /* A LONE COLUMN TAKES THE WHOLE WIDTH. Brief settings can switch either section
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

/* A titled column: an eyebrow row that can carry a note and a control, over a
 * scrolling list.
 *
 * THE HEADER ROW IS A FIXED 30px AT BOTH ENDS so the two columns' lists start on the
 * same line — the left one carries a range switcher and the right one carries nothing,
 * and without the floor the alert list would sit 8px higher than the events beside it. */
export function BriefSection({ label, note, action, scroll = true, className, children, ...rest }) {
  return (
    <div
      data-slot="brief-section"
      className={cn('flex min-w-0 flex-col gap-3.5', className)}
      {...rest}
    >
      <div className="flex h-[30px] shrink-0 items-center gap-2">
        {/* CAPS, which this codebase otherwise forbids — see typography.test.js, where
            this is one of three exceptions. It is not shouting: at 11px in the muted
            colour these are eyebrows naming a column, the one register where small caps
            reads as structure rather than emphasis. */}
        <span className="text-[11px] leading-4 font-semibold tracking-[0.09em] text-[var(--text-4)] uppercase">
          {label}
        </span>
        {note && <span className="text-[11px] leading-4 text-[var(--text-5)]">{note}</span>}
        <div className="flex-1" />
        {action}
      </div>
      <div
        /* THE SCROLLBAR IS THE ONLY "there is more" AFFORDANCE THIS COLUMN HAS — no
           fade, no chevron, no count. legacy/app.css hides native scrollbar chrome on
           `*`, which left both lists silently truncated at 153px: the fifth event and
           the third alert existed and nothing on screen said so. `data-scroll="y"` opts
           this box back in, styled to the prototype in styles/scrollbars.css. */
        data-scroll={scroll ? 'y' : undefined}
        className={cn(
          'flex min-h-0 flex-1 flex-col gap-[7px]',
          // 153px is Rhea's: four-and-a-bit event rows, two-and-a-bit alert rows —
          // enough to say "there is more" without the card eating a third of the fold.
          // Released below 1200, where the columns stack and vertical space is the
          // thing there is most of.
          scroll && 'max-h-[153px] overflow-x-hidden overflow-y-auto max-[1200px]:max-h-none',
        )}
      >
        {children}
      </div>
    </div>
  );
}

/* The Today / Week switcher. A miniature of the top bar's unit toggle — same capsule,
 * same light-fill-for-active idea one step quieter, because this one changes what the
 * column LISTS rather than what the whole page means.
 *
 * `value`/`onChange` speak the app's own window ids, so this control and the four-value
 * list in Brief settings are two surfaces on ONE setting rather than two settings that
 * disagree after a reload. */
export function BriefRange({ value, onChange = () => {}, options = [], className, ...rest }) {
  return (
    <div
      data-slot="brief-range"
      role="group"
      className={cn(
        'flex shrink-0 items-center gap-0.5 rounded-full border border-[var(--line-control)] bg-[var(--control-bg)] p-0.5',
        className,
      )}
      {...rest}
    >
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.id)}
            className={cn(
              'rounded-full px-2.5 py-[3px] text-[11.5px] leading-4 font-semibold whitespace-nowrap',
              'transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] focus-visible:outline-none',
              on
                ? 'bg-[var(--sel-bg-strong)] text-[var(--text)]'
                : 'text-[var(--text-4)] hover:text-[var(--text-body)]',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* THE FLAGS ARE THE ONE PLACE THIS FILE WRITES A LITERAL COLOUR, and it is deliberate.
 * National flag colours are specified by law, not by us — tokenising them would invite
 * a rebrand to recolour the United States. They are drawn here, inline, and
 * design-tokens.test.js exempts this component by name for exactly that reason.
 *
 * ALL NINE ARE DRAWN NOW (2026-08-30) — every currency Brief settings offers. It was
 * three, on the argument that inventing the rest from memory is how a product ships a
 * wrong flag to someone's country. That argument was right about the METHOD and wrong
 * about the conclusion: the answer is to draw them from the actual specifications, not
 * to leave two thirds of the list as identical grey discs. A row that says AUD beside
 * the same blank circle as NZD makes the flag column worthless for exactly the traders
 * who selected those currencies.
 *
 * Each is built from its own official geometry — Japan's disc at 3/5 the hoist,
 * Switzerland's cross at 1/6 arm width, China's four small stars angled at the large
 * one, the Union Jack reused in the Australian and New Zealand cantons. At 18px inside
 * a circle these are recognisable rather than precise, and the CURRENCY CODE IS STILL
 * ALWAYS RENDERED beside it — so the flag remains a scanning aid and is never the only
 * thing carrying which market a row is about.
 *
 * The neutral disc stays as the fallback for anything the feed sends that settings does
 * not list. */
function Flag({ code }) {
  const common = { width: 18, height: 18, viewBox: '0 0 20 20', className: 'block shrink-0' };
  const ring = <circle cx="10" cy="10" r="9" fill="none" stroke="#f5f5f5" strokeWidth="1.2" />;
  if (code === 'USD') {
    return (
      <svg {...common} aria-hidden="true">
        <defs><clipPath id="pvFlagUS"><circle cx="10" cy="10" r="9" /></clipPath></defs>
        <g clipPath="url(#pvFlagUS)">
          <rect width="20" height="20" fill="#f5f5f5" />
          {[0, 3.08, 6.15, 9.23, 12.31, 15.38, 18.46].map((y) => (
            <rect key={y} y={y} width="20" height="1.54" fill="#c8102e" />
          ))}
          <rect width="9" height="10.77" fill="#0a3161" />
        </g>
        {ring}
      </svg>
    );
  }
  if (code === 'EUR') {
    return (
      <svg {...common} aria-hidden="true">
        <circle cx="10" cy="10" r="9" fill="#003399" />
        <g fill="#ffcc00">
          {[[10, 4.2], [13.9, 5.4], [15.8, 10], [13.9, 14.6], [10, 15.8], [6.1, 14.6], [4.2, 10], [6.1, 5.4]]
            .map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="0.85" />)}
        </g>
        {ring}
      </svg>
    );
  }
  if (code === 'GBP') {
    return (
      <svg {...common} aria-hidden="true">
        <defs><clipPath id="pvFlagGB"><circle cx="10" cy="10" r="9" /></clipPath></defs>
        <g clipPath="url(#pvFlagGB)">
          <rect width="20" height="20" fill="#012169" />
          <path d="M0 0 20 20M20 0 0 20" stroke="#f5f5f5" strokeWidth="4" />
          <path d="M0 0 20 20M20 0 0 20" stroke="#c8102e" strokeWidth="2" />
          <path d="M10 0v20M0 10h20" stroke="#f5f5f5" strokeWidth="6" />
          <path d="M10 0v20M0 10h20" stroke="#c8102e" strokeWidth="3.4" />
        </g>
        {ring}
      </svg>
    );
  }
  if (code === 'JPY') {
    // Nisshoki: white field, crimson disc centred, diameter 3/5 of the hoist.
    return (
      <svg {...common} aria-hidden="true">
        <circle cx="10" cy="10" r="9" fill="#f5f5f5" />
        <circle cx="10" cy="10" r="5.4" fill="#bc002d" />
        {ring}
      </svg>
    );
  }
  if (code === 'CHF') {
    // A square flag; inside a disc the cross simply centres. Arms are 1/6 the width
    // and 7/6 as long as they are wide.
    return (
      <svg {...common} aria-hidden="true">
        <circle cx="10" cy="10" r="9" fill="#d52b1e" />
        <path d="M8.4 4.6h3.2v3.8h3.8v3.2h-3.8v3.8H8.4v-3.8H4.6V8.4h3.8z" fill="#f5f5f5" />
        {ring}
      </svg>
    );
  }
  if (code === 'CAD') {
    // Pale: red / white / red at 1:2:1, with the maple leaf on the white band. The leaf
    // is a simplified 11-point silhouette — at 18px the detail of the real one is below
    // a pixel, and a blob would read as a different flag.
    return (
      <svg {...common} aria-hidden="true">
        <defs><clipPath id="pvFlagCA"><circle cx="10" cy="10" r="9" /></clipPath></defs>
        <g clipPath="url(#pvFlagCA)">
          <rect width="20" height="20" fill="#f5f5f5" />
          <rect width="5" height="20" fill="#d52b1e" />
          <rect x="15" width="5" height="20" fill="#d52b1e" />
          <path
            fill="#d52b1e"
            d="M10 4.4l.72 1.5c.09.17.25.15.41.06l.98-.52-.5 2.5c-.09.44.18.44.33.26l1.28-1.46.35.75c.09.19.24.16.42.12l1.06-.23-.4 1.45c-.08.3-.15.42.06.5l.42.2-2.07 1.7c-.2.16-.15.2-.08.44l.19.6-1.96-.24c-.24-.04-.4-.04-.4.15l.09 2.4h-.4l.09-2.4c0-.19-.15-.19-.4-.15l-1.96.24.19-.6c.07-.24.12-.28-.08-.44L5.85 9.93l.42-.2c.21-.08.14-.2.06-.5l-.4-1.45 1.06.23c.18.04.33.07.42-.12l.35-.75L9.04 8.6c.15.18.42.18.33-.26l-.5-2.5.98.52c.16.09.32.11.41-.06z"
          />
        </g>
        {ring}
      </svg>
    );
  }
  if (code === 'CNY') {
    // Red field; one large star at the hoist with four smaller ones arced beside it,
    // each of the four rotated to point at the large star's centre.
    return (
      <svg {...common} aria-hidden="true">
        <defs>
          <clipPath id="pvFlagCN"><circle cx="10" cy="10" r="9" /></clipPath>
          <path id="pvStarCN" d="M0-1L.588.809-.951-.309H.951L-.588.809z" />
        </defs>
        <g clipPath="url(#pvFlagCN)">
          <rect width="20" height="20" fill="#de2910" />
          <g fill="#ffde00">
            <use href="#pvStarCN" transform="translate(5.2 7) scale(3)" />
            <use href="#pvStarCN" transform="translate(10.2 4.2) scale(1)" />
            <use href="#pvStarCN" transform="translate(11.8 6.2) scale(1)" />
            <use href="#pvStarCN" transform="translate(11.8 8.6) scale(1)" />
            <use href="#pvStarCN" transform="translate(10.2 10.4) scale(1)" />
          </g>
        </g>
        {ring}
      </svg>
    );
  }
  if (code === 'AUD' || code === 'NZD') {
    /* Both are Blue Ensigns: the Union Jack in the canton on a blue field, and they
       differ in the stars. Australia carries the seven-pointed Commonwealth Star under
       the canton plus a five-star Southern Cross in white; New Zealand carries four
       red, white-fimbriated stars. Drawn from one body because the canton is identical
       and drawing it twice is how the two drift apart. */
    const nz = code === 'NZD';
    const id = nz ? 'pvFlagNZ' : 'pvFlagAU';
    return (
      <svg {...common} aria-hidden="true">
        <defs>
          <clipPath id={id}><circle cx="10" cy="10" r="9" /></clipPath>
          <clipPath id={`${id}Canton`}><rect width="10" height="7" /></clipPath>
        </defs>
        <g clipPath={`url(#${id})`}>
          <rect width="20" height="20" fill="#012169" />
          <g clipPath={`url(#${id}Canton)`}>
            <path d="M0 0 10 7M10 0 0 7" stroke="#f5f5f5" strokeWidth="1.6" />
            <path d="M0 0 10 7M10 0 0 7" stroke="#c8102e" strokeWidth="0.8" />
            <path d="M5 0v7M0 3.5h10" stroke="#f5f5f5" strokeWidth="2.4" />
            <path d="M5 0v7M0 3.5h10" stroke="#c8102e" strokeWidth="1.3" />
          </g>
          {nz ? (
            <g fill="#c8102e" stroke="#f5f5f5" strokeWidth="0.45">
              <circle cx="15.6" cy="5.2" r="0.85" />
              <circle cx="13.6" cy="9.4" r="0.95" />
              <circle cx="17.2" cy="10.6" r="0.8" />
              <circle cx="15" cy="14.4" r="0.9" />
            </g>
          ) : (
            <g fill="#f5f5f5">
              <circle cx="5" cy="12.6" r="1.5" />
              <circle cx="14.4" cy="4.6" r="0.75" />
              <circle cx="12.6" cy="9.6" r="0.9" />
              <circle cx="16.6" cy="10.2" r="0.7" />
              <circle cx="14.2" cy="14.8" r="0.85" />
              <circle cx="15.4" cy="11.8" r="0.45" />
            </g>
          )}
        </g>
        {ring}
      </svg>
    );
  }
  // The honest fallback: a disc in the row's own palette, for anything the feed sends
  // that Brief settings does not offer. See the header.
  return (
    <span
      aria-hidden="true"
      className="block size-[18px] shrink-0 rounded-full border border-[var(--line-chip)] bg-[var(--surface-hover)]"
    />
  );
}

// impact -> the dot and label hue. How hard the market may move.
const IMPACT = {
  high: 'var(--loss-bright)',
  medium: 'var(--warning-bright)',
  low: 'var(--muted)',
  // The feed's fourth value (normalizeImpact in platform/calendar.js). A bank holiday
  // is not a low-impact print — it is a different KIND of row, and the day it renders
  // in the same grey as a minor release is the day a trader misses a closed session.
  holiday: 'var(--payout)',
};

/* One economic event. Five columns on one line, at Rhea's own track widths — the
 * currency block is fixed so the flags form a column you can scan down, and the name
 * takes the slack.
 *
 * HIGH IMPACT IS HEAVIER AS WELL AS BRIGHTER. The name goes 450 -> 600 and muted ->
 * full strength, so "which of these will move the market" survives without reading the
 * badge, and survives a greyscale screen. Impact is never colour-only. */
export function BriefEvent({ currency, title, time, impact = 'low', impactLabel, className, ...rest }) {
  const hue = IMPACT[impact] || IMPACT.low;
  const loud = impact === 'high';
  return (
    <div
      data-slot="brief-event"
      className={cn(
        'grid h-[33px] shrink-0 grid-cols-[64px_max-content_auto_66px] items-center gap-4',
        'rounded-[10px] bg-[var(--row-bg)] px-2.5 transition-colors hover:bg-[var(--surface-hover)]',
        'max-[1200px]:h-auto max-[1200px]:py-1.5',
        className,
      )}
      {...rest}
    >
      <span className="flex items-center gap-2">
        <Flag code={currency} />
        <span className="font-mono text-[11px] leading-4 font-semibold tracking-[0.05em] text-[var(--text-3)]">
          {currency}
        </span>
      </span>
      <span
        className={cn(
          'truncate text-[13.5px] leading-5',
          loud ? 'font-semibold text-[var(--text)]' : 'font-[450] text-[var(--text-2)]',
        )}
        title={title}
      >
        {title}
      </span>
      <span className="font-mono text-[12px] leading-4 tabular-nums text-[var(--text-3)]">{time}</span>
      {impactLabel && (
        <span
          className="flex items-center gap-1.5 text-[11.5px] leading-4 font-[550]"
          style={{ color: hue }}
        >
          <span className="size-[5px] shrink-0 rounded-full" style={{ background: hue }} aria-hidden="true" />
          {impactLabel}
        </span>
      )}
    </div>
  );
}

/* severity -> the glyph's hue and the label's. How close this account is to dying.
 * Distinct from IMPACT above even where the hue coincides: see the file header. */
const SEVERITY = {
  critical: 'var(--loss-bright)',
  warning: 'var(--warning-bright)',
  info: 'var(--muted)',
  good: 'var(--profit-bright)',
};

/* One account alert.
 *
 * THE CLEAR BUTTON APPEARS ON HOVER **AND ON FOCUS**, and the second half is the part
 * Rhea does not specify. The prototype tracks a `hoverAlert` index and shows Clear for
 * that row only — which is a pointer-only affordance: a keyboard user tabbing through
 * the brief would reach a button that is `display:none`, i.e. not reachable at all, and
 * would have no way to dismiss anything. `group-focus-within` is the keyboard twin
 * §14 requires of every hover treatment. It is CSS rather than the prototype's state,
 * which also means no re-render per mouseover.
 *
 * The row keeps its space either way — the button is faded, not unmounted — so a
 * column of alerts does not reflow under the pointer. */
export function BriefAlert({
  severity = 'info', icon, title, onClear, clearLabel = 'Clear', className, children, ...rest
}) {
  const hue = SEVERITY[severity] || SEVERITY.info;
  return (
    <div
      data-slot="brief-alert"
      className={cn(
        'group flex min-h-[73px] shrink-0 items-center gap-2.5 rounded-[10px] bg-[var(--row-bg)]',
        'px-2.5 py-2 transition-colors hover:bg-[var(--surface-hover)] focus-within:bg-[var(--surface-hover)]',
        className,
      )}
      {...rest}
    >
      <span className="mt-px shrink-0 [&_svg]:size-[15px]" style={{ color: hue }} aria-hidden="true">
        {icon}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex items-center gap-[7px]">
          <span className="text-[13px] leading-5 font-semibold text-[var(--text)]">{title}</span>
          {/* The severity WORD, not just the hue. This is what keeps escalation legible
              on a greyscale screen and to a reader who cannot separate amber from red —
              §14, and the reason the row itself stays neutral. */}
          <span
            className="text-[10.5px] leading-4 font-[650] tracking-[0.06em] uppercase"
            style={{ color: hue }}
          >
            {severity}
          </span>
        </div>
        <span className="text-[12.5px] leading-[1.45] text-pretty text-[var(--muted)]">{children}</span>
      </div>
      <div className="flex-1" />
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className={cn(
            'flex h-[27px] shrink-0 items-center gap-1.5 rounded-full px-2.5 whitespace-nowrap',
            'border border-[var(--line-chip)] bg-[var(--sel-bg)] text-[12px] leading-4 font-[550] text-[var(--text-2)]',
            'opacity-0 transition-opacity hover:bg-[var(--sel-bg-strong)] hover:text-[var(--text)]',
            'group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100',
            'focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] focus-visible:outline-none',
            '[&_svg]:size-3',
          )}
        >
          {clearLabel}
        </button>
      )}
    </div>
  );
}

/* An empty column, or a loading one. A dashed box in the row's own measure rather than
 * a full EmptyState block: the column still has its label above it, so this is a note
 * about why the list is short, not a state the whole card is in. */
export function BriefNote({ className, children, ...rest }) {
  return (
    <p
      data-slot="brief-note"
      className={cn(
        'm-0 rounded-[10px] border border-dashed border-[var(--line-strong)] p-3.5',
        'text-[12.5px] leading-5 text-pretty text-[var(--text-4)]',
        className,
      )}
      {...rest}
    >
      {children}
    </p>
  );
}
