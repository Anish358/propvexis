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
      { to: '/journal', label: 'Overview', end: true, soon: true },
      { to: '/journal/trades', label: 'Trade Log' },
      { to: '/journal/day', label: 'Day View', soon: true },
      { to: '/journal/progress', label: 'Progress Tracker', soon: true },
      { to: '/journal/calendar', label: 'Calendar' },
      { to: '/journal/analytics', label: 'Analytics' },
      { to: '/journal/strategies', label: 'Strategies' },
      { to: '/journal/psychology', label: 'Psychology', soon: true },
      { to: '/journal/backtesting', label: 'Backtesting', soon: true },
    ],
  },
  {
    label: 'Prop OS', icon: 'prop', base: '/prop',
    children: [
      { to: '/prop', label: 'Overview', end: true },
      { to: '/prop/accounts', label: 'Accounts', soon: true },
      { to: '/prop/challenges', label: 'Challenges', soon: true },
      { to: '/prop/analytics', label: 'Analytics', soon: true },
      { to: '/prop/alerts', label: 'Alerts' },
    ],
  },
  // Top-level Analytics redirects to Journal › Analytics for now; later it
  // becomes the cross-account comparison view (decided 2026-07-14).
  { to: '/analytics', label: 'Analytics', icon: 'analytics' },
  { to: '/reports', label: 'Reports', icon: 'reports' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
  { to: '/account', label: 'Account', icon: 'account' },
];

// Old flat routes → new module routes (bookmarks/muscle-memory keep working).
// /analytics also carries the "top-level Analytics → Journal analytics" decision.
export const LEGACY_REDIRECTS = {
  '/trades': '/journal/trades',
  '/analytics': '/journal/analytics',
  '/strategies': '/journal/strategies',
  '/calendar': '/journal/calendar',
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
