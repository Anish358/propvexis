import React, { createContext, useContext, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/* MOTION — DESIGN-LANGUAGE §10's three durations and one easing, named once.
 *
 * THE SPLIT IS THE SAME ONE THE ACCOUNT CARD MAKES, one rung faster. `--dur-fast`
 * (120ms) for anything ACKNOWLEDGING a click or a pointer — the range pill sliding, a
 * hover, the Clear button appearing. `--dur` (200ms) for CONTENT arriving or leaving:
 * the calendar swapping window, an alert row being dismissed.
 *
 * NOTHING HERE USES `--dur-slow`. §10 reserves 400ms for a VALUE travelling along a
 * path, and this card has none — the range pill travels, but it is a selection
 * indicator, not a quantity. A 400ms toggle reads as an unresponsive app.
 *
 * THE CLOCK IS NOT IN THIS LIST AND MUST NEVER BE. BriefClock reprints the time every
 * second; animating a figure that changes that often is a permanent distraction at the
 * top of the page, and it is the one thing here a trader reads rather than glances at.
 *
 * Reduced motion is handled globally — see the account.jsx header for why there is no
 * media query in this file either. */
const HOVER_MOTION = 'transition-colors duration-[var(--dur-fast)] ease-[var(--ease)]';
const FADE_MOTION = 'transition-opacity duration-[var(--dur-fast)] ease-[var(--ease)]';

/* The range pill travelling between Today and Week. `width` rides with `transform`
 * because the two labels are different widths — see BriefRange's header. */
const SLIDE_MOTION = 'transition-[transform,width] duration-[var(--dur-fast)] ease-[var(--ease)]';

/* Content arriving: the empty or loading NOTE that replaces a listing. A crossfade,
 * because a note is one block and has nowhere to ladder from. */
const SWAP_MOTION = 'animate-[pv-content-in_var(--dur)_var(--ease)_backwards]';

/* THE ROWS LADDER WHEN THE LISTING IS REPLACED — 45ms apart. Owner decision, 2026-09-03,
 * replacing a crossfade of the whole column.
 *
 * WHY IT IS BETTER THAN THE FADE IT REPLACES: a crossfade says "this column changed". A
 * ladder says "these rows are new, and here is how many of them there are" — which is
 * the actual question a trader has after tapping Week.
 *
 * THE CONTAINER DOES NOT ANIMATE, ONLY THE ROWS. The card's header, its divider and its
 * scroll position stay visually anchored while the contents re-ladder; animating the box
 * as well would move the frame the rows are arriving into.
 *
 * IT NEEDS THE REMOUNT, AND THE REMOUNT NEEDS THE KEY. A CSS animation fires once per
 * element, and Today and Week render the SAME row component from a different array — so
 * with rows keyed by event id React reuses the DOM nodes, the ladder does not run at all,
 * and the list snaps to the new data with no motion and no error to explain it. The
 * `key={swapKey}` on the box below is the mechanism: the whole list tears down and the
 * ladder replays from i=0. Key the CONTAINER, never the rows.
 *
 * CAPPED, so a long feed cannot drag the sweep out past about half a second.
 *
 * `--dur`, NOT `--dur-slow`, and bridge.css states the rule: an entrance's duration is
 * set by the size of what moves, and a 33px row is not a page section. This card must
 * never reach for 400ms — see the header above. */
const ROW_STEP = 0.045;
const ROW_SWEEP_CAP = 0.45;

/* Has THIS section's listing just been replaced? Provided by BriefSection, read by the
 * rows inside it. A prop would have to be threaded through every caller's `.map`, and
 * the answer is a property of the section rather than of any row. */
const SwappedContext = createContext(false);

/* The props a replaced row wears. `undefined` when nothing was replaced, so it spreads to
 * nothing on first paint — there is no previous list then, and a ladder there would just
 * be this column arriving a beat after the card around it. */
function useRowEntrance(index) {
  const swapped = useContext(SwappedContext);
  if (!swapped) return undefined;
  const delay = Math.min(index * ROW_STEP, ROW_SWEEP_CAP);
  return { 'data-entrance': 'row', style: { animationDelay: `${delay.toFixed(3)}s` } };
}

/* An alert row leaving. `grid-template-rows` is what animates the HEIGHT here without
 * anyone having to know it — see BriefAlert. */
const EXIT_MOTION = 'transition-[grid-template-rows,opacity] duration-[var(--dur)] ease-[var(--ease)]';

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
        HOVER_MOTION,
        'hover:bg-[var(--surface-hover)] hover:text-[var(--text)]',
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
export function BriefSection({
  label, note, action, scroll = true, swapKey, className, children, ...rest
}) {
  /* HAS THE CONTENT BEEN REPLACED YET? Only then does the list fade.
   *
   * `swapKey` is whatever the caller says identifies this listing — for the economic
   * calendar it is the window plus whether the feed has landed, so ONE mechanism covers
   * both the Today/Week switch and the fetch resolving. When it changes the scroll box
   * remounts (fresh scroll position, which is right: it is a different list) and fades
   * in.
   *
   * NOT ON FIRST PAINT. There is no previous list then, so nothing was replaced — a
   * fade there is just this column arriving a beat after the card around it.
   * Derive-during-render rather than a ref, which is what breaks under StrictMode; and
   * it has to live HERE rather than in the box below, because that box is exactly what
   * remounts. */
  const [seen, setSeen] = useState(swapKey);
  const [swapped, setSwapped] = useState(false);
  const [scrollable, setScrollable] = useState(false);
  if (seen !== swapKey) {
    setSeen(swapKey);
    setSwapped(true);
    // No scrollbar while the new list ladders in — see the effect below.
    setScrollable(false);
  }

  /* THE COLUMN SCROLLS ONLY WHEN IT ACTUALLY OVERFLOWS, measured rather than assumed.
   *
   * TWO BUGS, ONE CAUSE: this box is drawn to hold four-and-a-bit event rows at 153px,
   * and four rows come to EXACTLY 153 (4x33 + 3x7). At that boundary two things go wrong.
   *
   *   1. A row entering from `translateY(8px)` contributes its TRANSFORMED box to the
   *      scrollable overflow, so mid-ladder the content is 8px taller than the box. The
   *      scrollbar appeared, rode the animation and vanished, on every Today/Week toggle.
   *   2. At rest, any sub-pixel rounding tips 153 over 153 and renders a thumb that fills
   *      its whole track and cannot move — which scrollbars.css already calls "worse than
   *      no thumb at all" in the comment above its `min-height`.
   *
   * MEASURING IS WHAT FIXES BOTH, and a `+ 1` absorbs the rounding. An earlier attempt
   * toggled a Tailwind `overflow-hidden` instead and was COMPLETELY INERT: scrollbars.css
   * owns `overflow-y` from an UNLAYERED file, and unlayered beats `layer(utilities)`
   * whatever the specificity (§1, and the same trap tokens.css relies on deliberately).
   * The property has one owner, so the only honest switch is the attribute that rule
   * selects on.
   *
   * WAIT FOR THE ANIMATIONS, NOT A TIMEOUT. The sweep is a delay (45ms x index, capped)
   * plus a duration that lives in a CSS token; re-deriving that sum here would be a third
   * place to keep one number in step. `Animation.finished` is the browser reporting the
   * real end and cannot drift. Infinite ones are excluded or a skeleton pulse inside a
   * swapped section would defer the measurement for ever.
   *
   * NO DEPENDENCY ARRAY. The list changes without the box resizing — an alert dismissed,
   * a feed landing — and a ResizeObserver watches the BOX, not its content. Re-measuring
   * after every render is one layout read, and `setScrollable` bails out when the answer
   * has not changed, so it cannot loop. */
  const boxRef = useRef(null);
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!scroll || !box) return undefined;
    let live = true;

    /* EVERY PATH TO A MEASUREMENT GOES THROUGH THE SAME GUARD, and it has to.
     *
     * The first version guarded only the manual call and handed `measure` straight to the
     * ResizeObserver — which FIRES ONCE THE MOMENT YOU OBSERVE. That initial callback
     * landed mid-ladder, read content 8px taller than the box, and switched the scrollbar
     * on for the length of the animation: the exact bug the guard existed to prevent,
     * routed around by the observer that was supposed to be the safety net. */
    const running = () => (box.getAnimations?.({ subtree: true }) || []).filter(
      (a) => a.playState !== 'finished' && a.effect?.getTiming?.().iterations !== Infinity,
    );
    const apply = () => { if (live) setScrollable(box.scrollHeight > box.clientHeight + 1); };
    const measure = () => {
      const pending = running();
      if (!pending.length) { apply(); return; }
      Promise.allSettled(pending.map((a) => a.finished)).then(apply);
    };

    measure();
    // The box can change height with no React render at all — crossing 1200px releases
    // the cap — so the observer is not redundant with the dependency list below.
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => { live = false; ro.disconnect(); };
    /* THE CHILD COUNT IS A DEPENDENCY because the content can change while the BOX does
     * not: an alert dismissed, a feed landing. A ResizeObserver watches the box, so it
     * would never fire for either. Counting is what makes this cheap — the alternative is
     * no dependency array at all, and this card re-renders every second (the clock), which
     * would rebuild the observer sixty times a minute for nothing. */
  }, [scroll, swapKey, React.Children.count(children)]);

  return (
    <SwappedContext.Provider value={swapped}>
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
        key={swapKey}
        ref={boxRef}
        /* THE ATTRIBUTE IS THE SWITCH, because scrollbars.css owns `overflow-y` from an
           unlayered file and no utility written here can outrank it. Absent, the
           `overflow-hidden` below clips as normal; present, that rule takes over and
           draws the styled bar. */
        data-scroll={scroll && scrollable ? 'y' : undefined}
        className={cn(
          'flex min-h-0 flex-1 flex-col gap-[7px]',
          // 153px is Rhea's: four-and-a-bit event rows, two-and-a-bit alert rows —
          // enough to say "there is more" without the card eating a third of the fold.
          // Released below 1200, where the columns stack and vertical space is the thing
          // there is most of. `overflow-hidden` is the RESTING state and clips a list
          // that does not overflow enough to earn a bar; data-scroll above turns it into
          // `auto` when one is measured.
          scroll && 'max-h-[153px] overflow-hidden max-[1200px]:max-h-none',
        )}
      >
        {children}
      </div>
    </div>
    </SwappedContext.Provider>
  );
}

/* The Today / Week switcher. A miniature of the top bar’s unit toggle — same capsule,
 * same light-fill-for-active idea one step quieter, because this one changes what the
 * column LISTS rather than what the whole page means.
 *
 * `value`/`onChange` speak the app’s own window ids, so this control and the four-value
 * list in Brief settings are two surfaces on ONE setting rather than two settings that
 * disagree after a reload.
 *
 * THE FILL IS ONE PILL THAT SLIDES, not a background that jumps between two buttons.
 * A segmented control is the one place motion carries real information: the pill
 * travelling is what says these two options are a single setting with a position,
 * rather than two independent buttons that happen to sit together.
 *
 * IT IS MEASURED, NOT COMPUTED FROM A PERCENTAGE, and that is forced by the labels.
 * "Today" and "Week" are different widths, so `translateX(100%)` would land the pill
 * short or long. The alternative — equal-width segments — would resize the control,
 * and §2 makes structure an invariant for visual work: this pass changes how the
 * switch ANIMATES, not how wide it is. So a layout effect reads the active button’s
 * `offsetLeft`/`offsetWidth` and the pill animates both.
 *
 * A ResizeObserver re-measures, and it is not optional. Geist loads as a webfont: the
 * first measurement can happen in the fallback face, and when the real one arrives the
 * labels reflow and a pill measured against the old metrics sits visibly wrong. The
 * observer also covers the card narrowing at 1200.
 *
 * `ready` EXISTS SO THE PILL DOES NOT FLY IN ON PAGE LOAD. The first measurement is a
 * position arriving from nothing, not a selection moving, and animating it would drag
 * the pill in from the left edge every time the dashboard paints. The transition is
 * attached one frame later, so the first paint is instant and every real switch
 * animates. */
export function BriefRange({ value, onChange = () => {}, options = [], className, ...rest }) {
  const wrapRef = useRef(null);
  const [pill, setPill] = useState(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;
    const measure = () => {
      const el = wrap.querySelector('[data-range-on="true"]');
      const next = el ? { left: el.offsetLeft, width: el.offsetWidth } : null;
      /* BAIL OUT IF NOTHING MOVED. A ResizeObserver fires once the moment it observes,
         so a fresh object here would re-render on every mount and on every parent render
         that re-runs this effect — and if the caller also rebuilds `options` each render,
         those two feed each other into a loop. Comparing the two numbers ends it: React
         skips the update when the state is identity-equal. */
      setPill((prev) => {
        if (prev === next) return prev;
        if (prev && next && prev.left === next.left && prev.width === next.width) return prev;
        return next;
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    for (const el of wrap.querySelectorAll('[data-range-id]')) ro.observe(el);
    return () => ro.disconnect();
  }, [value, options]);

  useLayoutEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      ref={wrapRef}
      data-slot="brief-range"
      role="group"
      className={cn(
        'relative flex shrink-0 items-center gap-0.5 rounded-full border border-[var(--line-control)] bg-[var(--control-bg)] p-0.5',
        className,
      )}
      {...rest}
    >
      {/* THE PILL, and it is `aria-hidden` because it says nothing a reader needs: each
          button already carries `aria-pressed`, which is the selection as far as
          assistive tech is concerned. It renders only once measured — a layout effect
          runs before paint, so there is no frame where the control has no fill. */}
      {pill && (
        <span
          aria-hidden="true"
          className={cn('absolute top-0.5 bottom-0.5 left-0 rounded-full bg-[var(--sel-bg-strong)]', ready && SLIDE_MOTION)}
          style={{ transform: `translateX(${pill.left}px)`, width: `${pill.width}px` }}
        />
      )}
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            data-range-id={o.id}
            data-range-on={on ? 'true' : undefined}
            aria-pressed={on}
            onClick={() => onChange(o.id)}
            className={cn(
              'relative rounded-full px-2.5 py-[3px] text-[11.5px] leading-4 font-semibold whitespace-nowrap',
              HOVER_MOTION,
              'focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] focus-visible:outline-none',
              /* NO BACKGROUND ON THE ACTIVE BUTTON ANY MORE — the pill behind it is the
                 fill. Leaving the old `bg-[var(--sel-bg-strong)]` here would paint a
                 second capsule that jumps while the first one slides. */
              on ? 'text-[var(--text)]' : 'text-[var(--text-4)] hover:text-[var(--text-body)]',
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
export function BriefEvent({
  currency, title, time, impact = 'low', impactLabel, index = 0, className, ...rest
}) {
  const hue = IMPACT[impact] || IMPACT.low;
  const loud = impact === 'high';
  /* THE ROW'S PLACE IN THE LADDER. `index`, not a key: the key tells React which row this
     is, this tells the row when to arrive, and conflating them is what makes a re-keyed
     list stop animating. Does nothing until the section's listing is replaced. */
  const entrance = useRowEntrance(index);
  return (
    <div
      {...entrance}
      data-slot="brief-event"
      className={cn(
        'grid h-[33px] shrink-0 grid-cols-[64px_max-content_auto_66px] items-center gap-4',
        'rounded-[10px] bg-[var(--row-bg)] px-2.5 hover:bg-[var(--surface-hover)]',
        HOVER_MOTION,
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
  severity = 'info', icon, title, onClear, clearLabel = 'Clear', exiting = false,
  className, children, ...rest
}) {
  const hue = SEVERITY[severity] || SEVERITY.info;
  return (
    /* THE COLLAPSING WRAPPER, and `grid-template-rows` is doing the work nobody should
       have to do by hand. Animating a row out means animating its HEIGHT to zero, and
       CSS cannot transition to `height: auto` — the usual fix is measuring the row in
       JS, which puts a layout read on every dismissal. A grid whose single row goes
       `1fr -> 0fr` collapses to exactly the content height without anyone measuring
       anything.

       THE INNER BOX NEEDS BOTH `overflow-hidden` AND `min-h-0`. It is the grid ITEM, and
       a grid item floors at its min-content height by default — the row below carries
       `min-h-[73px]`, so without `min-h-0` the track would refuse to go under 73px and
       the collapse would simply not happen.

       The 7px flex gap this row contributes survives until unmount, so the last frame
       closes a 7px space rather than easing it. Left alone deliberately: fixing it
       means animating margin too, for a gap nobody can see moving at this duration. */
    <div
      className={cn(
        'grid shrink-0',
        EXIT_MOTION,
        exiting ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100',
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <div
          data-slot="brief-alert"
          className={cn(
            'group flex min-h-[73px] items-center gap-2.5 rounded-[10px] bg-[var(--row-bg)]',
            'px-2.5 py-2 hover:bg-[var(--surface-hover)] focus-within:bg-[var(--surface-hover)]',
            HOVER_MOTION,
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
                'opacity-0 hover:bg-[var(--sel-bg-strong)] hover:text-[var(--text)]',
                FADE_MOTION,
                'group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100',
                'focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] focus-visible:outline-none',
                '[&_svg]:size-3',
              )}
            >
              {clearLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* An empty column, or a loading one. A dashed box in the row's own measure rather than
 * a full EmptyState block: the column still has its label above it, so this is a note
 * about why the list is short, not a state the whole card is in. */
export function BriefNote({ className, children, ...rest }) {
  /* A NOTE STANDING IN FOR A LISTING CROSSFADES rather than laddering — "no high-impact
     events this week" is one block, and there is nothing for a stagger to count. Inert
     outside a section that has swapped, which includes every use of this outside the two
     columns. */
  const swapped = useContext(SwappedContext);
  return (
    <p
      data-slot="brief-note"
      className={cn(
        'm-0 rounded-[10px] border border-dashed border-[var(--line-strong)] p-3.5',
        'text-[12.5px] leading-5 text-pretty text-[var(--text-4)]',
        swapped && SWAP_MOTION,
        className,
      )}
      {...rest}
    >
      {children}
    </p>
  );
}
