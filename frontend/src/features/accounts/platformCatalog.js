// The PRESENTATION half of the platform catalog: what the Add Account flow calls
// each platform, how it is badged, and what it says about itself.
//
// The AUTHORITY is src/domain/sync/platforms.js. This file exists separately
// because the backend cannot import frontend/src — deploy rsyncs `src db scripts
// ea` plus `frontend/dist`, so such an import works locally and crashes on the
// box. test/platform-catalog.test.js asserts the two never drift, which is the
// same arrangement nav.test.js enforces between the route table and the nav.
//
// `status` is the badge, and it mirrors the authority's `enabled`:
//   live  selectable now
//   soon  listed so the catalog reads as the real roadmap, not selectable yet
//
// A blurb is mandatory on every card. A greyed-out name with no sentence beside
// it reads as a bug in our app rather than as a platform we have not finished.
//
// JSX-free (no React import, no logo components) so the backend's node:test can
// import it — CI installs backend dependencies only.

export const PLATFORM_CARDS = [
  {
    id: 'mt5',
    name: 'MetaTrader 5',
    status: 'live',
    blurb: 'We run the terminal for you, or attach the EA to your own MT5.',
    importMethods: ['auto_sync', 'ea', 'file', 'manual'],
  },
  {
    id: 'mt4',
    name: 'MetaTrader 4',
    status: 'soon',
    blurb: 'Import a statement today — Auto Sync is not available for MT4.',
    importMethods: ['file', 'manual'],
  },
  {
    id: 'ctrader',
    name: 'cTrader',
    status: 'soon',
    blurb: 'Auto Sync is in progress. Import a statement in the meantime.',
    importMethods: ['file', 'manual'],
  },
  {
    id: 'tradelocker',
    name: 'TradeLocker',
    status: 'soon',
    blurb: 'Auto Sync is in progress. Import a statement in the meantime.',
    importMethods: ['file', 'manual'],
  },
  {
    id: 'other',
    name: 'Other / not listed',
    status: 'live',
    blurb: 'Journal by hand or import a CSV from any platform.',
    importMethods: ['file', 'manual'],
  },
];

export const findPlatformCard = (id) => PLATFORM_CARDS.find((c) => c.id === id) || null;

/**
 * Filter the catalog by a typed query. Matches the id as well as the name, so
 * "mt5" finds MetaTrader 5 — that is what a trader types, and matching only the
 * display name would return nothing for the platform we actually support.
 * Empty/blank/absent query returns everything.
 */
export function searchPlatforms(query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return PLATFORM_CARDS;
  return PLATFORM_CARDS.filter(
    (c) => c.name.toLowerCase().includes(q) || c.id.includes(q),
  );
}
