// Information Architecture — the single source of truth for navigation.
// The Sidebar renders THIS (rail items + per-module children), and App.jsx
// derives legacy redirects from LEGACY_REDIRECTS. Changing the IA (rebrand,
// re-ordering, new module pages) is a data edit here, not a component rewrite.
//
// Deliberately JSX-free (icons are string keys resolved in Sidebar.jsx) so the
// backend test runner (node:test) can import and validate this config.
//
// `soon: true` marks a route whose page is a ComingSoon stub — rendered in the
// nav with a "soon" pill so the IA is visible before every screen is built.

export const NAV = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
  {
    label: 'Trade Journal', icon: 'journal', base: '/journal',
    children: [
      { to: '/journal', label: 'Overview', end: true },
      { to: '/journal/trades', label: 'Trade Log' },
      { to: '/journal/day', label: 'Day View' },
      { to: '/journal/progress', label: 'Progress Tracker', soon: true },
      { to: '/journal/calendar', label: 'Calendar' },
      { to: '/journal/analytics', label: 'Analytics' },
      { to: '/journal/psychology', label: 'Psychology', soon: true },
    ],
  },
  {
    label: 'Prop OS', icon: 'prop', base: '/prop',
    children: [
      { to: '/prop', label: 'Overview', end: true },
      { to: '/prop/finance', label: 'Finance' },
      { to: '/prop/accounts', label: 'Accounts' },
      { to: '/prop/challenges', label: 'Challenges' },
      { to: '/prop/analytics', label: 'Analytics', soon: true },
    ],
  },
  { to: '/strategies', label: 'Strategies', icon: 'strategies' },
  { to: '/backtesting', label: 'Backtesting', icon: 'backtesting', soon: true },
  { to: '/alerts', label: 'Alerts', icon: 'alerts' },
  { to: '/reports', label: 'Reports', icon: 'reports' },
  {
    label: 'Tools', icon: 'tools', base: '/tools',
    children: [
      { to: '/tools/lot-calculator', label: 'Lot Calculator', soon: true },
      { to: '/tools/news-calendar', label: 'News Calendar', soon: true },
    ],
  },
  { to: '/account', label: 'Account', icon: 'account' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

// Old flat routes → new module routes (bookmarks/muscle-memory keep working).
// /analytics also carries the "top-level Analytics → Journal analytics" decision.
export const LEGACY_REDIRECTS = {
  '/trades': '/journal/trades',
  '/analytics': '/journal/analytics',
  '/calendar': '/journal/calendar',
  '/prop/alerts': '/alerts',
  // Strategies + Backtesting graduated out of the Journal module to top-level.
  '/journal/strategies': '/strategies',
  '/journal/backtesting': '/backtesting',
};

// Routes on which the top bar's universal account switcher is SINGLE-SELECT.
//
// The switcher is multi-select everywhere else on purpose: picking two or three
// accounts gives an aggregate (R-based) view across them, which is what god view
// is for. Prop OS > Accounts > Details is a single-account workspace — its
// drawdown meters, profit target and equity curve all belong to one account's
// challenge, and there is no such thing as the aggregate max drawdown of three
// accounts at two firms. So on this route the switcher offers one account at a
// time rather than a page having to explain why a valid selection shows nothing.
//
// Prop OS > Challenges > Details is the same kind of screen for the same reason: a
// challenge IS one account plus the phase rows it has accumulated, so its lifecycle,
// its stage tiles and its current-phase rules all belong to exactly one account, and
// there is no aggregate Phase 1 of three accounts at two firms.
//
// Declared HERE, with the rest of the IA, rather than as a check inside the top
// bar: which page behaves how is an information-architecture fact, and the bar
// and the page both read it from one place. Kept as an exact-path list (no
// subtree matching) because the behaviour is a property of a specific screen.
export const SINGLE_ACCOUNT_ROUTES = ['/prop/accounts', '/prop/challenges'];

export function isSingleAccountRoute(pathname = '/') {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return SINGLE_ACCOUNT_ROUTES.includes(path);
}

// Routes that exist in the router but deliberately aren't in the sidebar (reached
// from a menu instead), so the top bar can still name them.
export const OFF_NAV_TITLES = {
  '/billing': 'Manage plan',
};

// Which nav entry is the given pathname currently on? Returns
// `{ module, page }` — `module` is only set for a route inside a module, so the
// top bar can read "Trade Journal › Trade Log" rather than a bare "Trade Log"
// that could belong to either module's Analytics page. null for an unknown path,
// which the caller renders as nothing rather than guessing.
//
// Pure and JSX-free like the rest of this file, so it's unit testable and the
// sidebar and top bar can never disagree about what page you're on.
export function navTitle(pathname = '/') {
  // Trailing slash, and legacy paths in case one is hit before the redirect
  // lands (the title would otherwise blank for a frame).
  let path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (path in LEGACY_REDIRECTS) path = LEGACY_REDIRECTS[path];

  // `end` entries (Dashboard, each module's Overview) own only their exact path;
  // everything else also owns its subtree.
  const owns = (to, end) => (end ? path === to : path === to || path.startsWith(`${to}/`));

  for (const item of NAV) {
    if (item.children) {
      if (!owns(item.base, false)) continue;
      const child = item.children.find((c) => owns(c.to, c.end));
      // A module path with no matching child (e.g. a page not yet in the IA)
      // still names the module rather than falling through to null.
      return { module: item.label, page: child ? child.label : item.label };
    }
    if (owns(item.to, item.end)) return { module: null, page: item.label };
  }

  if (path in OFF_NAV_TITLES) return { module: null, page: OFF_NAV_TITLES[path] };
  return null;
}

// Flat list of every real (non-redirect) route the NAV points at — used by tests
// to assert the route table and the nav config never drift apart.
export function navRoutes() {
  const out = [];
  for (const item of NAV) {
    if (item.children) out.push(...item.children.map((c) => c.to));
    else out.push(item.to);
  }
  return out.filter((to) => !(to in LEGACY_REDIRECTS));
}
