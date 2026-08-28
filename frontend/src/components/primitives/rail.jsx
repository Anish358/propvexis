import React from 'react';
import { cn } from '@/lib/utils';

/* THE NAVIGATION RAIL — the first surface built on the 2026-08-28 Figma redesign.
 *
 * WHY THIS IS HAND-COMPOSED AND NOT `@coss/sidebar`. The build order (CLAUDE.md:
 * primitives -> registry -> composition -> hand-written) says reach for the registry
 * before writing a component, so the registry item was fetched and read first. It is a
 * 22 KB, 25-export system: SidebarProvider + context, cookie-persisted open state, a
 * keyboard shortcut, its own Sheet-based mobile drawer, and nine further registry
 * dependencies (sheet, tooltip, scroll-area, use-media-query...).
 *
 * Every one of those behaviours already exists here and is TESTED. Layout owns the
 * collapse state and the under-900px drawer; Sidebar focuses the close control when the
 * drawer opens and marks itself role="dialog" only then; design-b-a11y.test.js pins that
 * arrangement. Adopting the provider would mean rewriting Layout around someone else's
 * state machine — and DESIGN-LANGUAGE is explicit that layout, interaction and
 * responsive behaviour are locked invariants for visual work. The registry's value here
 * is a skin, and a skin is the one thing it cannot give us: the design is ours.
 *
 * So this file is what the rule's fourth step is for, and it stays honest by holding
 * ONLY presentation. Not one of these components knows about routes, the nav config, or
 * which item is current — Sidebar.jsx passes that in. What lives here is the Figma:
 *
 *   rail        248 wide, --sidebar-bg, 24 padding
 *   brand row   64 tall; a 32 mark, 8 gap, the wordmark at 18/28 -0.45
 *   item        44 tall, 12 radius, 12 inset, a 16 icon, 12 gap, label at 14/20 500
 *   active      --surface-2 behind it and --text on it; inactive is --muted
 *   nudge       16 radius on a 5% wash of --warning
 *   user        52 tall, a 36 round avatar, name at 14/20 over plan at 12/16
 *
 * ARBITRARY VALUES ON PURPOSE. `text-[14px]` rather than `text-sm`, `rounded-[12px]`
 * rather than `rounded-xl`. The bridge repoints Tailwind's ladder at OUR older scale
 * (text-sm is 13px here, not 14px), and the radius steps are the preset's rem values,
 * so the named classes would each land a pixel or two off the frame and the drift would
 * be invisible in review. The Figma numbers are written as the Figma numbers. Colour is
 * the exception and goes through tokens, always: hex in a component is what the token
 * layer exists to prevent.
 */

/* The rail itself — including the off-canvas drawer it becomes under 900px. */
export function Rail({ className, children, ...rest }) {
  return (
    <aside
      data-slot="rail"
      className={cn(
        'flex w-[248px] shrink-0 flex-col gap-6 bg-[var(--sidebar-bg)] p-6',
        /* THE RAIL DOES NOT SCROLL — THE NAV INSIDE IT DOES. A fixed-height sticky
         * column with `overflow-hidden`, so the brand stays at the top and the footer
         * stays at the bottom however long the nav gets. Letting the whole aside scroll
         * instead is the obvious-looking version and it is wrong twice: the identity
         * row and the nudge scroll out of reach on a short viewport, and the overflow
         * becomes page height, which leaves a sticky element no room to travel — so the
         * rail scrolls off the top with the page. nav.test.js pins both halves. */
        'sticky top-0 h-dvh overflow-hidden',
        /* THE OFF-CANVAS DRAWER, MOVED HERE FROM legacy/app.css (2026-08-28).
         *
         * Below 900px the rail leaves the flow entirely rather than shrinking — a
         * 248px rail on a 390px phone leaves 140px for a data table, which is not a
         * layout you can fix by narrowing it. That behaviour is unchanged; what
         * changed is WHERE it can be expressed. The rules used to live in a
         * `@media (max-width: 900px) .sidebar` block, and legacy CSS now sits in the
         * lowest cascade layer, so `position: fixed` there would lose to `sticky`
         * here and the drawer would silently stop leaving the flow. Utilities can
         * only be beaten by utilities.
         *
         * overscroll-contain so momentum scrolling inside the drawer does not move
         * the page behind it; Layout also locks body scroll while it is open. */
        'max-[900px]:fixed max-[900px]:inset-y-0 max-[900px]:left-0 max-[900px]:z-[60]',
        'max-[900px]:w-[min(280px,84vw)] max-[900px]:shadow-[var(--sh-3)] max-[900px]:overscroll-contain',
        // The drawer slides in; users who ask for less motion just get it. The
        // keyframes are the existing `drawer-in` — @keyframes are global and layer-free,
        // so they survived the legacy block being retired.
        'motion-safe:max-[900px]:data-[drawer]:animate-[drawer-in_var(--dur)_var(--ease)_both]',
        className,
      )}
      {...rest}
    >
      {children}
    </aside>
  );
}

/* Brand row: the mark and wordmark on the left, the collapse control on the right.
 * `mark` and `action` are slots rather than fixed children so Sidebar keeps owning what
 * the mark links to and what the button does. */
export function RailBrand({ mark, action, children, className, ...rest }) {
  return (
    <div
      data-slot="rail-brand"
      className={cn('flex h-8 shrink-0 items-center justify-between', className)}
      {...rest}
    >
      <span className="flex min-w-0 items-center gap-2">
        {mark}
        <span className="truncate text-[18px] leading-7 font-semibold tracking-[-0.45px] text-[var(--text)]">
          {children}
        </span>
      </span>
      {action}
    </div>
  );
}

/* NO `RailMark`. An earlier draft of this file had one — a 32px rounded tile for the
 * wordmark to sit beside — and it was deleted the moment it turned out to be a second
 * drawing of the brand. Logo.jsx already renders exactly that tile, is what the wizard
 * header and the auth screen render, and is shared by geometry with the marketing
 * site's own mark. A tile here would have been the same square maintained twice, and
 * the two would have disagreed the first time either was touched. Sidebar passes
 * <Logo size={32} /> into RailBrand's `mark` slot instead.
 */

/* The collapse / close control. 32 square, 6 radius — a smaller radius than the nav
 * items on purpose (it is chrome, not a destination). */
/* forwardRef rather than ref-as-prop: React 19 passes `ref` as an ordinary prop, but
 * this project is React 18.3 (primitives/index.js says so) where it does not, and a ref
 * silently dropped here would break drawer focus with no error and nothing to see. */
export const RailAction = React.forwardRef(function RailAction({ className, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      data-slot="rail-action"
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-[6px] text-[var(--muted)]',
        'transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]',
        'focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] focus-visible:outline-none',
        '[&_svg]:size-4',
        className,
      )}
      {...rest}
    />
  );
});

/* `flex-1` is what pins the footer to the bottom of a short rail without the footer
 * having to know it is last. */
export function RailNav({ className, children, ...rest }) {
  return (
    <nav
      data-slot="rail-nav"
      className={cn(
        // min-h-0 is what actually lets it shrink: a flex item's default min-height:auto
        // refuses to go below its content, which keeps the overflow instead of scrolling it.
        'flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain',
        className,
      )}
      {...rest}
    >
      {children}
    </nav>
  );
}

/* ONE ROW, THREE CALLERS. A link, an accordion header and a sub-item all share this
 * geometry, and `render` is how they stay one component: the caller hands in the
 * element to become (a <NavLink>, a <button>) and this supplies the skin. The
 * alternative — three near-identical class strings — is how the accordion header
 * drifted a pixel off its own links last time.
 */
/* `trailing` is wrapped rather than rendered bare, so the accordion chevron gets its
 * size and its dimming HERE. The caller used to pass
 * `className="size-4 shrink-0 opacity-60"` on the icon, which compiled to nothing at
 * all — Sidebar.jsx is not a scanned path — leaving a full-size, full-strength chevron
 * that happened to look close enough to be missed. Caught by
 * utility-collisions.test.js, which now watches for exactly this. */
export function RailItem({
  render, active = false, icon, badge, trailing, className, children, ...rest
}) {
  const classes = cn(
    'group flex h-11 w-full items-center gap-3 rounded-[12px] px-3 text-left',
    'text-[14px] leading-5 font-medium no-underline transition-colors',
    'focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] focus-visible:outline-none',
    active
      ? 'bg-[var(--surface-2)] text-[var(--text)]'
      : 'text-[var(--muted)] hover:bg-[var(--surface-2)]/60 hover:text-[var(--text)]',
    // The icon is 16 in the frame; the generated components size their own svg
    // children, so the rail does the same rather than every icon carrying width/height.
    '[&>svg]:size-4 [&>svg]:shrink-0',
    className,
  );

  const content = (
    <>
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {badge}
      {trailing && <span className="shrink-0 opacity-60 [&>svg]:size-4">{trailing}</span>}
    </>
  );

  // React.cloneElement rather than a `as` prop: NavLink computes its own className from
  // a render-prop, and cloning lets the caller keep that while we append ours.
  if (render) {
    return React.cloneElement(render, {
      className: cn(classes, render.props.className),
      'data-slot': 'rail-item',
      ...rest,
    }, content);
  }
  return (
    <button type="button" data-slot="rail-item" className={classes} {...rest}>
      {content}
    </button>
  );
}

/* "soon" — 10px, and the only place in the rail that goes under 12. It is a state, not
 * a label, and at 12 it competed with the nav item it qualifies. */
export function RailSoon({ className, ...rest }) {
  return (
    <span
      data-slot="rail-soon"
      className={cn(
        'shrink-0 rounded-[6px] bg-[var(--surface-2)] px-1.5 py-0.5',
        'text-[10px] leading-[14px] font-medium text-[var(--text)]',
        className,
      )}
      {...rest}
    >
      soon
    </span>
  );
}

/* The expanded module's children. Indented under a hairline that shows what they
 * belong to — the frame has no expanded module, so this is the design's own vocabulary
 * (the rail's inset, its hairline, its muted label) applied to the case it omits. */
export function RailSub({ className, children, ...rest }) {
  return (
    <div
      data-slot="rail-sub"
      className={cn(
        /* The indent is 12+12, not 20+12. At 20 the longest child label in the IA
         * ("Progress Tracker", which also carries a soon badge) truncated to
         * "Progress Trac…" inside a 248px rail — caught in a headless render, not by
         * reading the numbers. The hairline still reads as an indent at 12. */
        'mt-1 ml-3 flex flex-col gap-0.5 border-l border-[var(--line)] pl-3',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function RailSubItem({ render, active = false, badge, className, children, ...rest }) {
  const classes = cn(
    'flex h-9 items-center gap-2 rounded-[8px] px-2 text-[13px] leading-5 no-underline transition-colors',
    'focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] focus-visible:outline-none',
    active
      ? 'bg-[var(--surface-2)] font-medium text-[var(--text)]'
      : 'font-normal text-[var(--muted)] hover:text-[var(--text)]',
    className,
  );
  const content = (
    <>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {badge}
    </>
  );
  if (render) {
    return React.cloneElement(render, {
      className: cn(classes, render.props.className),
      'data-slot': 'rail-sub-item',
      ...rest,
    }, content);
  }
  return <span className={classes} {...rest}>{content}</span>;
}

/* Footer — separated from the nav by a hairline rather than by distance, because the
 * nav above it scrolls and distance alone stops meaning anything once it does. */
export function RailFooter({ className, children, ...rest }) {
  return (
    <div
      data-slot="rail-footer"
      className={cn('mt-auto flex shrink-0 flex-col gap-4 border-t border-[var(--line)] pt-6', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

/* The encouragement card. Amber at 5% — a wash, not a fill: at any real opacity it
 * would read as the warning state, and this is the opposite message. */
export function RailNudge({ title, className, children, ...rest }) {
  return (
    <div
      data-slot="rail-nudge"
      className={cn('flex flex-col gap-2 rounded-[16px] bg-[var(--nudge-bg)] p-4', className)}
      {...rest}
    >
      <span className="text-[14px] leading-5 font-medium text-[var(--warning)]">{title}</span>
      <span className="text-[12px] leading-5 font-normal text-[var(--muted)]">{children}</span>
    </div>
  );
}

/* The identity row. A slot for the avatar so the caller decides between a photo and
 * initials, and `trailing` for the chevron that says it opens something. */
export function RailUser({ render, avatar, name, meta, trailing, className, ...rest }) {
  const classes = cn(
    'flex h-13 w-full items-center gap-3 rounded-[12px] px-2 text-left transition-colors',
    'hover:bg-[var(--surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] focus-visible:outline-none',
    className,
  );
  const content = (
    <>
      {avatar}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[14px] leading-5 font-medium text-[var(--text)]">{name}</span>
        <span className="truncate text-[12px] leading-4 font-medium text-[var(--muted)]">{meta}</span>
      </span>
      {trailing}
    </>
  );
  if (render) {
    return React.cloneElement(render, {
      className: cn(classes, render.props.className),
      'data-slot': 'rail-user',
      ...rest,
    }, content);
  }
  return <button type="button" data-slot="rail-user" className={classes} {...rest}>{content}</button>;
}

/* 36px, circular, on a 20% wash of the mark colour — the frame's own treatment for an
 * initials avatar, which is what every account without a Google photo gets. */
export function RailAvatar({ src, alt = '', className, children, ...rest }) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        data-slot="rail-avatar"
        className={cn('size-9 shrink-0 rounded-full object-cover', className)}
        {...rest}
      />
    );
  }
  return (
    <span
      data-slot="rail-avatar"
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-full',
        'bg-[var(--rail-avatar-bg)] text-[14px] leading-5 font-semibold text-[var(--brand-mark-bg)]',
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
