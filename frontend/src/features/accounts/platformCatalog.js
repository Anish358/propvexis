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
// A blurb is OPTIONAL as of 2026-08-25, and every card now ships without one — the
// owner's "remove all the explanation text" applies to a sentence under a card name as
// much as to one under a title. The rule it replaces said a blurb was mandatory because
// "a greyed-out name with no sentence beside it reads as a bug rather than as a platform
// we have not finished", and that concern is real: a disabled card still has to say why.
//
// WHAT CARRIES IT NOW IS `status`. The UI renders `soon` as a Soon badge INSIDE the
// card's button, so the badge is part of the control's accessible name — a keyboard user
// lands on "MetaTrader 4, Soon" rather than on a dead name, which is the same fact the
// sentence carried and the reason ChoiceCard keeps a disabled card focusable. The field
// stays in the shape so a card can explain itself where the badge is not enough.
//
// JSX-free (no React import, no logo components) so the backend's node:test can
// import it — CI installs backend dependencies only.

export const PLATFORM_CARDS = [
  {
    id: 'mt5',
    name: 'MetaTrader 5',
    status: 'live',
    blurb: '',
    importMethods: ['auto_sync', 'ea', 'file', 'manual'],
  },
  {
    id: 'mt4',
    name: 'MetaTrader 4',
    status: 'soon',
    blurb: '',
    importMethods: ['file', 'manual'],
  },
  {
    id: 'ctrader',
    name: 'cTrader',
    status: 'soon',
    blurb: '',
    importMethods: ['file', 'manual'],
  },
  {
    id: 'tradelocker',
    name: 'TradeLocker',
    status: 'soon',
    blurb: '',
    importMethods: ['file', 'manual'],
  },
  {
    id: 'other',
    name: 'Other / not listed',
    status: 'live',
    blurb: '',
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
  // A copy, not the live reference: every non-empty query already returns a
  // fresh filtered array, and a caller doing `searchPlatforms(q).sort(...)` on
  // an empty query would otherwise reorder PLATFORM_CARDS for the whole session.
  if (!q) return [...PLATFORM_CARDS];
  return PLATFORM_CARDS.filter(
    (c) => c.name.toLowerCase().includes(q) || c.id.includes(q),
  );
}
