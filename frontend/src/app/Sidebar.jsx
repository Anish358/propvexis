import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useMatch } from 'react-router-dom';
import {
  Activity, Bell, BarChart3, ChevronDown, ChevronUp, FileText, LayoutGrid, Notebook,
  PanelLeftClose, Settings as SettingsIcon, Shield, Target, Wrench,
} from 'lucide-react';
import Logo from '../components/Logo.jsx';
import { NAV } from './nav.js';
import { BRAND } from '../lib/theme.js';
import { useAuth } from './AuthContext.jsx';
import {
  Rail, RailAction, RailAvatar, RailBrand, RailFooter, RailItem, RailNav,
  RailSoon, RailSub, RailSubItem, RailUser,
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
 * ONE THING THE FRAME DOES NOT SHOW. It draws only the collapsed rail, so an expanded
 * module (Trade Journal's seven children) has no reference: `RailSub` applies the
 * rail's own vocabulary — its inset, its hairline, its muted label — rather than
 * inventing a treatment.
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

/* One flat rail row.
 *
 * `useMatch` RATHER THAN NavLink's isActive, and the reason is structural. NavLink's
 * render-prop form makes the anchor the PARENT of whatever it returns, so a RailItem
 * inside it would put the 44px row — its padding, its hover, its rounded background —
 * on a <span> nested in a bare <a>. The click target and the thing that looks
 * clickable would be two different boxes. Passing `render={<Link/>}` makes the anchor
 * the row itself, and then active state has to come from somewhere else: `useMatch`
 * with the same `end` semantics NavLink uses, which is exactly what NavLink calls. */
function RailLink({ to, label, icon, end, soon }) {
  const Icon = iconFor(icon);
  const active = !!useMatch({ path: to, end: !!end });
  return (
    <RailItem
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
function RailGroup({ item }) {
  const { pathname } = useLocation();
  const inModule = pathname === item.base || pathname.startsWith(`${item.base}/`);
  const [override, setOverride] = useState(null); // null = follow the route
  const expanded = override ?? inModule;
  const Icon = iconFor(item.icon);
  const Chevron = expanded ? ChevronUp : ChevronDown;

  return (
    <div>
      <RailItem
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

/**
 * @param {object}   props
 * @param {Function} props.onToggle  hide the rail / close the drawer
 * @param {boolean}  props.inDrawer  true when rendered as the mobile off-canvas
 *   drawer. Only the semantics change — the nav itself is identical, because a
 *   second copy of the tree for mobile is how the two silently drift apart.
 */
export default function Sidebar({ onToggle = () => {}, inDrawer = false }) {
  const closeRef = useRef(null);
  const { user } = useAuth();

  // Opening a drawer must move focus into it, or a keyboard user "opens" a menu
  // and their next Tab continues from the button behind the scrim. Layout owns
  // the return trip when it closes.
  useEffect(() => {
    if (inDrawer) closeRef.current?.focus();
  }, [inDrawer]);

  return (
    <Rail
      data-drawer={inDrawer ? '' : undefined}
      // As a drawer it is a modal surface over the page, so it says so; as a
      // static rail it is just a landmark and must NOT claim to be a dialog.
      {...(inDrawer ? { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Main navigation' } : {})}
    >
      <RailBrand
        mark={(
          /* THE SHARED Logo, not a mark drawn here. It is the same component the wizard
             header and the auth screen render, and it draws the frame's 32px tile
             itself — a second one in this file would be the brand maintained twice.
             Router Link, not an href, so the mark stays inside whichever origin the app
             is served from (localhost in dev, the deployed host in prod). */
          <Link to="/" aria-label={`${BRAND} home`}>
            <Logo size={32} />
          </Link>
        )}
        action={(
          <RailAction
            ref={closeRef}
            onClick={onToggle}
            title={inDrawer ? 'Close menu' : 'Hide sidebar'}
            aria-label={inDrawer ? 'Close menu' : 'Hide sidebar'}
          >
            <PanelLeftClose aria-hidden="true" />
          </RailAction>
        )}
      >
        {BRAND}
      </RailBrand>

      {/* A module with `subnavInPage` gets ONE rail row, not an accordion: its page
          draws its own section rail (Settings), so listing the same six children here
          would be two sub-navs for one module. `to` falls back to `base` because such
          an entry is a destination as well as a module — nav.js says why. */}
      <RailNav aria-label="Main">
        {NAV.map((item) => (
          item.children && !item.subnavInPage
            ? <RailGroup key={item.base} item={item} />
            : <RailLink key={item.to || item.base} {...item} to={item.to || item.base} />
        ))}
      </RailNav>

      <RailFooter>
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
