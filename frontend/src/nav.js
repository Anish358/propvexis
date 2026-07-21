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
      { to: '/prop/accounts', label: 'Accounts', soon: true },
      { to: '/prop/challenges', label: 'Challenges', soon: true },
      { to: '/prop/analytics', label: 'Analytics', soon: true },
    ],
  },
  { to: '/strategies', label: 'Strategies', icon: 'strategies' },
  { to: '/backtesting', label: 'Backtesting', icon: 'backtesting', soon: true },
  { to: '/alerts', label: 'Alerts', icon: 'alerts' },
  { to: '/reports', label: 'Reports', icon: 'reports' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
  { to: '/account', label: 'Account', icon: 'account' },
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
