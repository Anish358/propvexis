import React from 'react';
import { cn } from '@/lib/utils';

/* THE TOP BAR, on the 2026-08-28 Figma frame (node 1:2).
 *
 * WHAT THIS COMMIT REBUILDS AND WHAT IT DOES NOT. The bar's SHELL is here — its height,
 * its padding, its hairline, and the title block that grew a greeting line. The four
 * controls inside it (the unit toggle, Filters, the account switcher, the notification
 * bell and the avatar menu) keep their current skin this pass, on purpose:
 *
 *   - Each is a shared primitive with a popover or menu attached, used on surfaces this
 *     redesign has not reached yet (the wizard, Settings, Prop OS). Restyling them here
 *     restyles those too, unreviewed.
 *   - The frame's delta on them is mostly SHAPE (pill instead of rounded-rect). That is
 *     a one-line change per control once the surfaces around them are done, and a
 *     visibly worse trade to make now in exchange for a half-redesigned bar.
 *
 * So the bar reads as the frame's bar; its controls are the ones that already work.
 * Recorded here rather than in a commit message because the next person to open this
 * file will wonder.
 *
 * Scaled one step down like the rest of the page: 88 -> 72 tall, 40 -> 24 padding (which
 * also lines the bar's inner edge up with the page's own gutter — the frame's 40 was
 * measured against a 1440 canvas and would sit proud of every card at 1920), 24 -> 20
 * title.
 */

/* forwardRef: FilterBar measures this element with a ResizeObserver and publishes its
 * height as --topbar-h, which the trade log's sticky column header reads so it lands
 * exactly under the bar. A dropped ref there is a header that slides under the bar or
 * floats below it — silently, and only on one page. */
export const TopBar = React.forwardRef(function TopBar({ className, children, ...rest }, ref) {
  return (
    <header
      ref={ref}
      data-slot="topbar"
      className={cn(
        /* 64px, NOT 72. Rhea's bar is one line of chrome above the page, and the
           previous height came from a two-line title block (a name over a greeting)
           that no longer needs the room — the greeting wraps beside the name now.
           `min-h` rather than `h`, because per-page actions portal into the middle of
           this bar and a long set of them must be allowed to wrap rather than
           overflow. */
        'flex min-h-16 flex-wrap items-center gap-3.5 border-b border-[var(--line)] px-6 py-2',
        /* STICKY, AND TRANSLUCENT OVER A BLUR. Rhea scrolls the page UNDER the bar:
           the account scope, the unit and the filters decide what every figure below
           means, so they must not scroll away from the figures they govern. The bar
           was sticky in legacy CSS and silently stopped being so when the primitive
           replaced `.topbar` with a class the stylesheet does not select — restored
           here, where utilities can actually win. --topbar-bg is 92% opaque rather
           than solid so the page reads as passing beneath it. */
        'sticky top-0 z-[var(--z-nav)] bg-[var(--topbar-bg)] backdrop-blur-[8px]',
        className,
      )}
      {...rest}
    >
      {children}
    </header>
  );
});

/**
 * The page's name, and — on the dashboard — a line of greeting under it.
 *
 * THE GREETING IS THE FRAME'S, AND IT IS OPTIONAL BY DESIGN. "Good morning, Alex —
 * here's where you stand today." belongs on the one screen you open first and nowhere
 * else: the same sentence over the Trade Log would be noise, and over Settings it would
 * be strange. So `sub` is a prop the dashboard supplies and every other route omits,
 * rather than something this component computes.
 *
 * `module` is the breadcrumb half ("Trade Journal ›"), unchanged — it exists because
 * two modules both have an Analytics page and a bare "Analytics" could be either.
 */
export function TopBarTitle({ module, sub, className, children, ...rest }) {
  return (
    <div data-slot="topbar-title" className={cn('flex min-w-0 flex-col gap-0.5', className)} {...rest}>
      <h1 className="flex min-w-0 items-baseline gap-2 text-[20px] leading-7 font-[650] tracking-[-0.4px] text-[var(--text)]">
        {module && (
          <span className="shrink-0 text-[13px] leading-5 font-normal text-[var(--muted)]">
            {module}
            <span aria-hidden="true"> ›</span>
          </span>
        )}
        <span className="truncate">{children}</span>
      </h1>
      {sub && <p className="m-0 truncate text-[13px] leading-5 text-[var(--muted)]">{sub}</p>}
    </div>
  );
}

/* The right-hand control cluster. `ml-auto` rather than `justify-between` on the bar,
 * because the bar's middle holds a portal for per-page actions (PageHeader) that is
 * frequently empty — with `justify-between` an empty portal would let the controls
 * drift into the middle of the bar. */
export function TopBarActions({ className, children, ...rest }) {
  return (
    <div
      data-slot="topbar-actions"
      className={cn('ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2', className)}
      {...rest}
    >
      {children}
    </div>
  );
}
