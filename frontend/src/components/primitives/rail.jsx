import React from 'react';
import { cn } from '@/lib/utils';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  useSidebar,
} from '@/components/ui/sidebar';

/* THE NAVIGATION RAIL — Base Rhea, on @shadcn/sidebar.
 *
 * THIS FILE USED TO ARGUE THE OPPOSITE, at length, and the argument is worth keeping
 * because it was not wrong — it was answering a different question. It said: the
 * registry sidebar is a 25-export system with its own provider, cookie persistence, a
 * keyboard shortcut and a Sheet-based drawer, all of which Layout.jsx already did and
 * design-b-a11y.test.js already pinned, so adopting it meant rewriting Layout around
 * someone else's state machine for a skin we were writing ourselves anyway.
 *
 * WHAT CHANGED (owner, 2026-08-29): shadcn is the default component system for this
 * codebase, and Rhea wants a collapse mode the old rail did not have. Our `collapsed`
 * meant "rail unmounted entirely"; Rhea's means a 70px ICON RAIL. Building that by
 * hand is a width transition, an icon-only mode, a tooltip per item and a drawer — the
 * four things `collapsible="icon"` already is. So the registry now wins on its own
 * merits rather than on policy, and everything below is SKIN over its behaviour.
 *
 * WHAT WE OVERRIDE, AND ONLY THIS:
 *
 *   width       16rem / 3rem  ->  248px / 70px, via --sidebar-width* on the provider
 *   breakpoint  md = 768      ->  900 (bridge.css + use-mobile.js), our rail number
 *   row         h-8 rounded-md -> h-11 rounded-[10px], Rhea's 44px nav row
 *   colours     already correct — bridge.css maps every sidebar-* slot at tokens
 *
 * NOTHING ABOUT THE INFORMATION ARCHITECTURE MOVES. Same NAV config, same accordion,
 * same `subnavInPage` exception, same drawer semantics. Sidebar.jsx still owns all of
 * it; this file holds presentation and re-exports the provider so app code has one
 * import path (DESIGN-LANGUAGE §1: primitives are the entry point).
 *
 * ARBITRARY VALUES ON PURPOSE. `text-[14.5px]` rather than `text-sm`: the bridge
 * repoints Tailwind's ladder at our older scale, so named steps land a pixel or two
 * off Rhea and the drift would be invisible in review. Colour always goes through
 * tokens — a hex in a component is what the token layer exists to prevent.
 */

/* THE LIST RESET, AND WHY IT IS NOT OPTIONAL HERE.
 *
 * SidebarMenu and SidebarMenuSub render real <ul>/<li>, which is correct semantics and
 * is exactly what shadcn intends — it just assumes Tailwind's PREFLIGHT is loaded, and
 * ours deliberately is not (tailwind.css: preflight would restyle every legacy page).
 * So the UA's own `ul { list-style: disc; padding-inline-start: 40px }` applies and the
 * rail renders bulleted, indented 40px, with every label truncated by the width the
 * markers stole. It looks like a spacing bug and is a missing reset.
 *
 * Fixed here rather than by importing preflight (which would restyle the 800 live
 * legacy classes) or by editing the generated file (which the build order forbids). */
const LIST_RESET = 'm-0 list-none p-0';

/* Rhea's two widths. The provider takes them as inline custom properties, which is the
 * seam the generated component offers for exactly this — no fork required. */
const RAIL_STYLE = {
  '--sidebar-width': '248px',
  '--sidebar-width-icon': '70px',
};

export function RailProvider({ style, children, ...rest }) {
  return (
    <SidebarProvider style={{ ...RAIL_STYLE, ...style }} {...rest}>
      {children}
    </SidebarProvider>
  );
}

export { useSidebar as useRail };

/* The rail itself. `collapsible="icon"` is the whole Rhea interaction: 248 -> 70 on
 * desktop, and a Sheet drawer under 900 where a 248px rail would leave a phone 140px
 * for a data table.
 *
 * `p-0` and our own padding, because the generated inner div pads nothing and Rhea's
 * rail is 18px top/bottom against 14px left/right — a taller-than-wide inset that
 * keeps a 44px row from touching the edge while the icons still centre at 70px. */
export function Rail({ className, children, ...rest }) {
  return (
    <Sidebar
      collapsible="icon"
      data-slot="rail"
      className={cn(
        'border-r border-[var(--line)]',
        '[&_[data-slot=sidebar-inner]]:gap-1.5 [&_[data-slot=sidebar-inner]]:px-3.5 [&_[data-slot=sidebar-inner]]:py-4',
        className,
      )}
      {...rest}
    >
      {children}
    </Sidebar>
  );
}

/* Brand row: the mark and wordmark on the left, the collapse control on the right.
 * 20px of air beneath it, which is Rhea's — the brand is a header, not a nav item, and
 * the gap is what says so once the rows below are only 6 apart. */
export function RailBrand({ mark, action, children, className, ...rest }) {
  const { state, isMobile } = useSidebar();
  const collapsed = state === 'collapsed' && !isMobile;
  return (
    <SidebarHeader
      data-slot="rail-brand"
      className={cn(
        'gap-2.5 p-0 pb-4',
        /* THE TOGGLE STACKS UNDER THE MARK AT 70px, AND IT IS NOT OPTIONAL THAT IT
         * SURVIVES. The prototype draws the brand row only in the expanded rail, where
         * the 33px mark and the 32px control sit side by side. At 70px, minus 14px of
         * padding a side, there are 42px of content width — the two cannot share a
         * line, and the obvious fix (hide the control, like the wordmark) is a trap:
         * the control is the ONLY way back to 248px, so hiding it strands the user in
         * an icon rail permanently. Stacking keeps both, centred, inside 42px. */
        collapsed ? 'flex-col items-center' : 'flex-row items-center justify-between',
        className,
      )}
      {...rest}
    >
      <span className={cn('flex min-w-0 items-center gap-2.5', collapsed && 'justify-center')}>
        {mark}
        {/* CONDITIONALLY RENDERED, NOT `hidden`. The UA's [hidden] rule loses to any
            author `display`, and this span's parent sets one — so `hidden` would do
            nothing at all and the wordmark would still be there, clipped, at 70px.
            That is a real bug this repo has already paid for once. */}
        {!collapsed && (
          <span className="truncate text-[16.5px] leading-6 font-[650] tracking-[-0.25px] text-[var(--text)]">
            {children}
          </span>
        )}
      </span>
      {action}
    </SidebarHeader>
  );
}

/* The collapse / close control. Round, 32px, muted until hovered — chrome, not a
 * destination, which is why it is a circle where the nav rows are 10px rectangles. */
export const RailAction = React.forwardRef(function RailAction({ className, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      data-slot="rail-action"
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--text-4)]',
        'transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-body)]',
        'focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] focus-visible:outline-none',
        '[&_svg]:size-4',
        className,
      )}
      {...rest}
    />
  );
});

export function RailNav({ className, children, ...rest }) {
  return (
    <SidebarContent
      data-slot="rail-nav"
      // overflow-x-hidden: at 70px a label mid-transition would otherwise scroll the
      // rail sideways for the duration of the animation.
      className={cn('gap-0 overflow-x-hidden', className)}
      {...rest}
    >
      <SidebarMenu className={cn(LIST_RESET, 'gap-[5px]')}>{children}</SidebarMenu>
    </SidebarContent>
  );
}

/* ONE ROW, THREE CALLERS — a link, an accordion header and a sub-item all share this
 * geometry. `render` is how they stay one component: the caller hands in the element
 * to become (a <Link>, a <button>) and this supplies the skin. Three near-identical
 * class strings is how the accordion header drifted a pixel off its own links before.
 *
 * The generated SidebarMenuButton already does `render` (Base UI's useRender), the
 * icon-mode collapse, and the tooltip that replaces the label at 70px. What we change
 * is the box: 44 tall at 10 radius against its 32 at 6.
 */
export function RailItem({
  render, active = false, icon, badge, trailing, className, children, ...rest
}) {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={render}
        isActive={active}
        // The tooltip IS the label once the label is gone. Passing the string rather
        // than a node so the generated component can skip it while expanded.
        tooltip={collapsed && typeof children === 'string' ? children : undefined}
        data-slot="rail-item"
        className={cn(
          /* 40px, NOT 44 — and 44 below 900px, where the rail is a touch drawer.
             Rhea's row is 10px of padding around a 20px line, which puts the nav items
             45px apart instead of 50 and is the difference the design shows. The 44px
             floor exists for TOUCH targets, so it is kept exactly where touch happens
             rather than applied to a pointer-driven desktop rail. */
          'h-10 max-[900px]:h-11 gap-3 rounded-[10px] px-3 text-[14.5px] leading-5 font-medium',
          'transition-colors [&>svg]:size-[18px] [&>svg]:shrink-0',
          active
            ? 'bg-[var(--sel-bg)] font-[550] text-[var(--text)]'
            : 'text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-body)]',
          // At 70px the row is a centred glyph: kill the horizontal padding rather
          // than letting a 12px inset push an 18px icon off centre.
          collapsed && 'justify-center px-0',
          className,
        )}
        {...rest}
      >
        {icon}
        {!collapsed && <span className="min-w-0 flex-1 truncate">{children}</span>}
        {!collapsed && badge}
        {!collapsed && trailing && (
          <span className="shrink-0 opacity-60 [&>svg]:size-3.5">{trailing}</span>
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/* "Soon" — 10px, and the only place in the rail that goes under 12. It is a state, not
 * a label, and at 12 it competed with the nav item it qualifies. */
export function RailSoon({ className, ...rest }) {
  return (
    <span
      data-slot="rail-soon"
      className={cn(
        'shrink-0 rounded-[6px] border border-[var(--line-strong)] bg-[var(--zinc-900)] px-1.5 py-0.5',
        'text-[10px] leading-[14px] font-[550] tracking-[0.04em] text-[var(--text-3)] uppercase',
        className,
      )}
      {...rest}
    >
      Soon
    </span>
  );
}

/* An unread dot on a nav row. Rhea replaces the old count badge with a 6px dot: the
 * exact number of unread alerts is not a navigation decision, and a two-digit badge at
 * 70px has nowhere to go. */
export function RailDot({ className, ...rest }) {
  return (
    <span
      data-slot="rail-dot"
      aria-hidden="true"
      className={cn('size-1.5 shrink-0 rounded-full bg-[var(--muted)]', className)}
      {...rest}
    />
  );
}

/* The expanded module's children, indented under a hairline that shows what they
 * belong to. Rhea draws no expanded module, so this applies the rail's own vocabulary
 * — its inset, its hairline, its muted label — rather than inventing a treatment.
 *
 * NOTHING RENDERS AT 70px. An indented sub-list inside an icon rail is a column of
 * unlabelled hairlines; the module header's own tooltip is the affordance there. */
export function RailSub({ className, children, ...rest }) {
  const { state } = useSidebar();
  if (state === 'collapsed') return null;
  return (
    <SidebarMenuSub
      data-slot="rail-sub"
      /* The indent is 12+12, not 20+12. At 20 the longest child label in the IA
         ("Progress Tracker", which also carries a Soon badge) truncated to
         "Progress Trac…" inside a 248px rail — caught in a headless render, not by
         reading the numbers. The hairline still reads as an indent at 12. */
      className={cn(LIST_RESET, 'mx-3 mt-1 gap-0.5 border-l border-[var(--line)] py-0.5 pl-3', className)}
      {...rest}
    >
      {children}
    </SidebarMenuSub>
  );
}

export function RailSubItem({ render, active = false, badge, className, children, ...rest }) {
  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton
        render={render}
        isActive={active}
        data-slot="rail-sub-item"
        className={cn(
          'h-9 gap-2 rounded-[8px] px-2 text-[13px] leading-5 transition-colors',
          active
            ? 'bg-[var(--sel-bg)] font-medium text-[var(--text)]'
            : 'font-normal text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-body)]',
          className,
        )}
        {...rest}
      >
        <span className="min-w-0 flex-1 truncate">{children}</span>
        {badge}
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );
}

/* Footer — separated from the nav by a hairline rather than by distance, because the
 * nav above it scrolls and distance alone stops meaning anything once it does. */
export function RailFooter({ className, children, ...rest }) {
  return (
    <SidebarFooter
      data-slot="rail-footer"
      className={cn('mt-auto gap-3 border-t border-[var(--line)] p-0 pt-2', className)}
      {...rest}
    >
      {children}
    </SidebarFooter>
  );
}

/* The encouragement card. Amber at 5% — a wash, not a fill: at any real opacity it
 * would read as the warning state, and this is the opposite message. Hidden at 70px,
 * where it would be an unreadable amber square. */
export function RailNudge({ title, className, children, ...rest }) {
  const { state } = useSidebar();
  if (state === 'collapsed') return null;
  return (
    <div
      data-slot="rail-nudge"
      className={cn('flex flex-col gap-2 rounded-[12px] bg-[var(--nudge-bg)] p-4', className)}
      {...rest}
    >
      <span className="text-[14px] leading-5 font-medium text-[var(--warning)]">{title}</span>
      <span className="text-[12px] leading-5 font-normal text-[var(--muted)]">{children}</span>
    </div>
  );
}

/* The identity row. A slot for the avatar so the caller decides between a photo and
 * initials, and `trailing` for the chevron that says it opens something. At 70px it
 * keeps the avatar and drops everything else — an account is still worth showing when
 * the rail is a strip of glyphs; its name is not. */
export function RailUser({ render, avatar, name, meta, trailing, className, ...rest }) {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  return (
    <SidebarMenu className={LIST_RESET}>
      <SidebarMenuItem>
        <SidebarMenuButton
          render={render}
          data-slot="rail-user"
          size="lg"
          tooltip={collapsed && typeof name === 'string' ? name : undefined}
          className={cn(
            'h-12 gap-2.5 rounded-[10px] px-2 hover:bg-[var(--surface-hover)]',
            collapsed && 'justify-center px-0',
            className,
          )}
          {...rest}
        >
          {avatar}
          {!collapsed && (
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[14.5px] leading-5 font-[550] text-[var(--text-body)]">{name}</span>
              <span className="truncate text-[12px] leading-4 font-normal text-[var(--text-4)]">{meta}</span>
            </span>
          )}
          {!collapsed && trailing}
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

/* 28px, circular, on a flat disc — Rhea's own treatment for an initials avatar, which
 * is what every account without a Google photo gets. */
export function RailAvatar({ src, alt = '', className, children, ...rest }) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        data-slot="rail-avatar"
        className={cn('size-7 shrink-0 rounded-full object-cover', className)}
        {...rest}
      />
    );
  }
  return (
    <span
      data-slot="rail-avatar"
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-full',
        'bg-[var(--rail-avatar-bg)] text-[11.5px] leading-4 font-semibold tracking-[0.02em] text-[var(--rail-avatar-ink)]',
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
