import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useMatch } from 'react-router-dom';
import {
  Activity, Bell, BarChart3, ChevronDown, ChevronUp, FileText, LayoutGrid, Notebook,
  Menu, Plus, Settings as SettingsIcon, Shield, Target, Wrench,
} from 'lucide-react';
import Logo from '../components/Logo.jsx';
import { NAV } from './nav.js';
import { BRAND } from '../lib/theme.js';
import { useAuth } from './AuthContext.jsx';
import {
  Rail, RailAction, RailAvatar, RailBrand, RailCta, RailFooter, RailItem, RailNav,
  RailSoon, RailSub, RailSubItem, RailUser, useRail,
} from '@/components/primitives';

/* The navigation rail, rebuilt on the 2026-08-28 Figma redesign.
 *
 * NOTHING ABOUT THE INFORMATION ARCHITECTURE MOVED. Same NAV config, same accordion
 * that auto-expands to the route and can still be overridden by hand, same
 * `subnavInPage` exception for Settings, same drawer semantics under 900px. What
 * changed is entirely presentational, and all of it now lives in the `Rail*`
 * primitives — this file has no class strings left, which is the point: a utility
 * written here would compile to nothing at all (tailwind.css scopes @source to
 * components/{ui,primitives}).
 *
 * ICONS ARE LUCIDE NOW. The hand-drawn `ICONS` registry that used to sit at the top of
 * this file — twelve inline <svg> bodies at a hardcoded 19.08px, itself a note about
 * scaling 18 by 1.06 — is gone. components.json already declares lucide as the icon
 * library, the generated components size their own svg children, and the frame's icons
 * ARE lucide. Twelve bespoke paths that have to be re-tuned every time the label size
 * changes is exactly the hand-written layer the build order puts last.
 *
 * ONE THING THE DESIGN DOES NOT SHOW. It draws only the flat rail, so an expanded
 * module (Trade Journal's seven children) has no reference: `RailSub` applies the
 * rail's own vocabulary — its inset, its hairline, its muted label — rather than
 * inventing a treatment.
 *
 * NO `inDrawer` PROP ANY MORE (2026-08-29, Rhea). It existed so this file could set
 * role="dialog"/aria-modal and focus its own close button when Layout rendered it as
 * the mobile drawer. The generated Sidebar renders a real Sheet below 900px, so the
 * dialog semantics, the focus trap and the focus return are Base UI's — and getting
 * them from a tested library beats three lines here that only ever approximated them.
 */

// nav.js references icons by string key so the IA config stays JSX-free and testable
// from node. Add a key here when adding one there.
const ICONS = {
  dashboard: LayoutGrid,
  journal: Notebook,
  prop: Shield,
  strategies: Target,
  backtesting: Activity,
  alerts: Bell,
  reports: FileText,
  tools: Wrench,
  settings: SettingsIcon,
  analytics: BarChart3,
};

const iconFor = (key) => ICONS[key] || ICONS.dashboard;

/* NO NUDGE CARD IN THE FOOTER (removed 2026-08-28, owner call).
 *
 * The frame draws an amber "Keep going / Your Phase 1 target is almost complete" card
 * above the identity row, and it was built and wired to the real notification stream —
 * info-severity only, so it could never print reassurance over a drawdown warning.
 * It is gone because a permanent card in the rail costs vertical space on every screen
 * to repeat something the Alerts page and Today's Brief already say, and the rail is
 * navigation. `RailNudge` stays in the primitives: it is a working component and this
 * is a placement decision, not a verdict on the card.
 */

/* THE RAIL'S ENTRANCE — a leftward sweep, laddering down the rows.
 *
 * OWNER DECISION, 2026-09-03: the chrome enters on a reload, having previously painted
 * instantly. page-entrance.jsx carries the reversal and what survived it.
 *
 * NO JS GATE, AND NONE IS NEEDED. `<Layout>` is a pathless layout route, so this file
 * mounts once per document and persists across every client-side navigation — a CSS
 * animation fires once per element, which makes "once per browser load" fall out of the
 * DOM for free. The routed page needs a gate because it remounts; this does not.
 *
 * EXCEPT ON MOBILE, WHICH IS WHY `isMobile` GATES IT. Under 900px the rail is a Sheet
 * drawer that mounts and unmounts on every open, so an ungated ladder would replay each
 * time the menu is tapped — on top of the Sheet's own slide-in, which is already saying
 * the same thing. The rail SHELL is excluded in CSS instead (bridge.css selects
 * `sidebar-inner`, which the generated component renders on desktop only).
 *
 * 30ms, HALF THE PAGE'S 60ms STEP. These are nine rows of one list; the page's sections
 * are six different cards. The same step would make the rail take longer to assemble
 * than the whole page beside it. Starting at 60ms lets the shell get moving first, so
 * the rows ride in with it rather than ahead of it.
 *
 * The delays are inline styles because they are per-index VALUES — bridge.css owns the
 * animation itself. A Tailwind delay utility written in this file would compile to
 * nothing at all, silently (tailwind.css scopes @source to components/{ui,primitives}). */
const NAV_STEP = 0.03;
const NAV_BASE = 0.06;
const CTA_DELAY = 0.04;
// After the last row, so the footer closes the sweep instead of racing it. Derived from
// NAV.length rather than written down, so adding a module does not silently overlap it.
const FOOT_DELAY = NAV_BASE + NAV.length * NAV_STEP;

const sweep = (delay, on) => (on
  ? { 'data-entrance': 'left', style: { animationDelay: `${delay.toFixed(3)}s` } }
  : undefined);

/* One flat rail row.
 *
 * `useMatch` RATHER THAN NavLink's isActive, and the reason is structural. NavLink's
 * render-prop form makes the anchor the PARENT of whatever it returns, so a RailItem
 * inside it would put the 44px row — its padding, its hover, its rounded background —
 * on a <span> nested in a bare <a>. The click target and the thing that looks
 * clickable would be two different boxes. Passing `render={<Link/>}` makes the anchor
 * the row itself, and then active state has to come from somewhere else: `useMatch`
 * with the same `end` semantics NavLink uses, which is exactly what NavLink calls. */
function RailLink({ to, label, icon, end, soon, entrance }) {
  const Icon = iconFor(icon);
  const active = !!useMatch({ path: to, end: !!end });
  return (
    <RailItem
      {...entrance}
      render={<Link to={to} />}
      active={active}
      icon={<Icon aria-hidden="true" />}
      badge={soon ? <RailSoon /> : null}
      aria-current={active ? 'page' : undefined}
    >
      {label}
    </RailItem>
  );
}

// Same reasoning as RailLink, one level down.
function RailSubLink({ to, label, end, soon }) {
  const active = !!useMatch({ path: to, end: !!end });
  return (
    <RailSubItem
      render={<Link to={to} />}
      active={active}
      badge={soon ? <RailSoon /> : null}
      aria-current={active ? 'page' : undefined}
    >
      {label}
    </RailSubItem>
  );
}

/* A module group: the header toggles an inline sub-nav. Auto-expands while the route is
 * inside the module; the user can still collapse or expand it by hand, and that
 * override outranks the route until they navigate away. */
function RailGroup({ item, entrance }) {
  const { pathname } = useLocation();
  const { state, isMobile } = useRail();
  const inModule = pathname === item.base || pathname.startsWith(`${item.base}/`);
  const [override, setOverride] = useState(null); // null = follow the route
  /* AN ICON RAIL HAS NO EXPANDED MODULE. At 70px the children would be a column of
     unlabelled hairlines, so the header collapses shut and its tooltip is the
     affordance — which is also why `active` below must then include the in-module
     case: with the children hidden, the header is the only thing left to say you are
     inside it. */
  const expanded = state === 'collapsed' && !isMobile ? false : (override ?? inModule);
  const Icon = iconFor(item.icon);
  const Chevron = expanded ? ChevronUp : ChevronDown;

  return (
    <div>
      <RailItem
        {...entrance}
        // A collapsed module whose route you are on still reads as current — the
        // children are hidden, so the header is the only thing left to say so.
        active={inModule && !expanded}
        icon={<Icon aria-hidden="true" />}
        trailing={<Chevron aria-hidden="true" />}
        aria-expanded={expanded}
        onClick={() => setOverride(!expanded)}
      >
        {item.label}
      </RailItem>
      {expanded && (
        <RailSub>
          {item.children.map((c) => <RailSubLink key={c.to} {...c} />)}
        </RailSub>
      )}
    </div>
  );
}

// Initials for the avatar when the account carries no photo — the same two-capital
// rule the wizard's firm marks use, for the same reason: two letters is what fits
// legibly in a 36px circle at label size.
function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  // Upper-cased on the charAt lines themselves, not on the result. typography.test.js
  // forbids .toUpperCase() on display text and exempts the avatar-initial case by
  // recognising `charAt(0)` on the same line — a fair rule, since a bare
  // `x.toUpperCase()` two lines later is indistinguishable from shouting at a user.
  return parts.length === 1
    ? parts[0].charAt(0).toUpperCase() + parts[0].charAt(1).toUpperCase()
    : parts[0].charAt(0).toUpperCase() + parts[1].charAt(0).toUpperCase();
}

const titleCase = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);

export default function Sidebar() {
  const { user } = useAuth();
  const { state, isMobile, toggleSidebar } = useRail();
  const collapsed = state === 'collapsed' && !isMobile;
  // See the sweep block above: the drawer remounts on every open, so it is excluded.
  const entering = !isMobile;

  return (
    <Rail>
      <RailBrand
        mark={(
          /* THE SHARED Logo, not a mark drawn here. It is the same component the wizard
             header and the auth screen render, and it draws the 32px tile itself — a
             second one in this file would be the brand maintained twice. Router Link,
             not an href, so the mark stays inside whichever origin the app is served
             from (localhost in dev, the deployed host in prod). */
          <Link to="/" aria-label={`${BRAND} home`}>
            <Logo size={collapsed ? 28 : 33} />
          </Link>
        )}
        action={(
          <RailAction
            onClick={toggleSidebar}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
          >
            <Menu aria-hidden="true" />
          </RailAction>
        )}
      >
        {BRAND}
      </RailBrand>

      {/* THE ONE ACTION IN THE RAIL, and it sits above the nav rather than inside it
          because it is not a place — it starts the Add Account wizard and comes back.
          A Router Link, not a button with a navigate(): it is a destination, so it
          should middle-click, right-click and open in a new tab like every other
          navigation in this rail. */}
      <RailCta
        {...sweep(CTA_DELAY, entering)}
        render={<Link to="/accounts/new" />}
        icon={<Plus aria-hidden="true" />}
      >
        Add account
      </RailCta>

      {/* A module with `subnavInPage` gets ONE rail row, not an accordion: its page
          draws its own section rail (Settings), so listing the same six children here
          would be two sub-navs for one module. `to` falls back to `base` because such
          an entry is a destination as well as a module — nav.js says why. */}
      <RailNav aria-label="Main">
        {NAV.map((item, i) => (
          item.children && !item.subnavInPage
            ? <RailGroup key={item.base} item={item} entrance={sweep(NAV_BASE + i * NAV_STEP, entering)} />
            : (
              <RailLink
                key={item.to || item.base}
                {...item}
                to={item.to || item.base}
                entrance={sweep(NAV_BASE + i * NAV_STEP, entering)}
              />
            )
        ))}
      </RailNav>

      <RailFooter {...sweep(FOOT_DELAY, entering)}>
        {/* Sign-out and account switching stay in the top-bar avatar menu; this row is
            identity, and it goes to the profile it names. */}
        {user && (
          <RailUser
            render={<Link to="/settings" />}
            avatar={<RailAvatar src={user.picture} alt="">{initials(user.name)}</RailAvatar>}
            name={user.name || user.email}
            meta={`${titleCase(user.plan || 'free')} plan`}
          />
        )}
      </RailFooter>
    </Rail>
  );
}
