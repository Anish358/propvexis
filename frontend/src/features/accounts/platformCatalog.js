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
// WHAT `credentialFields`, `credentialNote` AND `credentialConsent` ARE DOING HERE.
// ConnectStep renders the credential form from THIS file, because the frontend
// cannot import src/domain. They are a mirror of the authority's own fields, and
// test/platform-catalog.test.js asserts they never drift — a form that collects
// different things from what validateCredential expects refuses the user with a
// 400 they cannot act on.
//
// The note and the gate are a PER-PLATFORM SECURITY CLAIM and that is exactly why
// they are data rather than copy in the page. MT5 promises a trade-capable
// password is rejected, because its worker checks trade_allowed and deletes one.
// TradeLocker offers no read-only credential at all, so it says so and makes the
// trader affirm it. Printing either sentence above the other platform's password
// field would be a false security claim, and a page holding one string cannot
// tell the difference.
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
    credentialFields: [
      { name: 'server', label: 'MT5 server', type: 'text', required: true, placeholder: 'GoatFunded-Server' },
      { name: 'login', label: 'MT5 login', type: 'number', required: true, placeholder: '314943467' },
      { name: 'password', label: 'Investor password', type: 'password', required: true, secret: true },
    ],
    credentialNote:
      'Use your investor (read-only) password. A password that can place trades is rejected and deleted on the first login.',
    credentialConsent: null,
  },
  {
    id: 'mt4',
    name: 'MetaTrader 4',
    status: 'soon',
    blurb: '',
    importMethods: ['file', 'manual'],
    credentialFields: [],
    credentialNote: null,
    credentialConsent: null,
  },
  {
    id: 'ctrader',
    name: 'cTrader',
    status: 'live',
    blurb: '',
    importMethods: ['auto_sync', 'file', 'manual'],
    // No fields: cTrader authorizes on Spotware's site rather than collecting a
    // credential. ConnectStep renders its OAuth branch off exactly this emptiness.
    credentialFields: [],
    credentialNote:
      'You authorize PropVexis on cTrader\'s own site. We never see your password, and the '
      + 'access we ask for is view-only — placing trades is refused by cTrader, not just by us.',
    credentialConsent: null,
  },
  {
    id: 'tradelocker',
    name: 'TradeLocker',
    status: 'soon',
    blurb: '',
    importMethods: ['file', 'manual'],
    // Collected and mirrored while the card is still Soon: this is the form the
    // connect step will render, and the copy the consent gate will show, the
    // moment the platform is switched on. Building it behind the badge is what
    // lets the switch be one line in two files rather than a feature.
    credentialFields: [
      { name: 'email', label: 'TradeLocker email', type: 'email', required: true, placeholder: 'you@example.com' },
      { name: 'server', label: 'Broker server', type: 'text', required: true, placeholder: 'OSP-DEMO' },
      { name: 'password', label: 'TradeLocker password', type: 'password', required: true, secret: true },
    ],
    credentialNote:
      'TradeLocker has no read-only password — this is the same password that can place trades on your account. '
      + 'We store it encrypted, and PropVexis only ever reads your trade history with it. '
      + 'You can disconnect the account at any time, which deletes the stored password.',
    credentialConsent:
      'I understand this password can place trades on my account, and I authorise PropVexis to use it to read my trade history.',
  },
  {
    id: 'other',
    name: 'Other / not listed',
    status: 'live',
    blurb: '',
    importMethods: ['file', 'manual'],
    credentialFields: [],
    credentialNote: null,
    credentialConsent: null,
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
