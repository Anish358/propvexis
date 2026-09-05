// The platform registry — the AUTHORITY on which trading platforms exist, which
// of them PropVexis can Auto Sync, and what a credential for each one looks like.
//
// TWO FIELDS THAT ARE EASY TO CONFLATE:
//   enabled    may this platform be CHOSEN in the Add Account flow at all
//   connector  non-null means Auto Sync is available for it
// 'other' is enabled with no connector, because a trader whose platform is absent
// from this list must still have a way through the flow. mt4/ctrader/tradelocker
// are the reverse of neither: listed, not yet selectable, badged "Soon" in the UI.
//
// A THIRD STATE EXISTS AND TRADELOCKER IS IN IT: credential fields and a note but
// `connector: null`. The connector module is built and registered; the PLATFORM
// is the switch, and it stays off until a live account proves the derived P&L
// reconciles. `enabled` and `connector` are still the only two things any caller
// reads, so nothing downstream has to know about the distinction.
//
// WHY THIS FILE IS NOT THE ONE THE UI READS. The backend cannot import
// frontend/src — deploy rsyncs `src db scripts ea` plus `frontend/dist`, so such
// an import works locally and crashes on the box. The UI therefore has its own
// presentation catalog (frontend/src/features/accounts/platformCatalog.js) and
// test/platform-catalog.test.js asserts the two never drift, the same trick
// nav.test.js uses for routes versus nav.
//
// JSX-free and dependency-free so node:test can import it directly.

/** The four values the 0026 CHECK constraint admits for mt5_accounts.import_method. */
export const IMPORT_METHODS = ['auto_sync', 'ea', 'file', 'manual'];

// Deep-frozen below (deepFreeze) once the array is built: four modules import
// this as THE authority, and a consumer pushing onto a nested credentialFields
// or importMethods array would corrupt it for every other importer in the
// process, silently and at a distance.
export const PLATFORMS = [
  {
    id: 'mt5',
    label: 'MetaTrader 5',
    connector: 'mt5',
    enabled: true,
    importMethods: ['auto_sync', 'ea', 'file', 'manual'],
    assetTypes: ['forex', 'cfd', 'crypto'],
    credentialFields: [
      { name: 'server', label: 'MT5 server', type: 'text', required: true, placeholder: 'GoatFunded-Server' },
      { name: 'login', label: 'MT5 login', type: 'number', required: true, placeholder: '314943467' },
      { name: 'password', label: 'Investor password', type: 'password', required: true, secret: true },
    ],
    // Stated here rather than in a page on purpose: the worker checks
    // account_info().trade_allowed on every login and deletes a credential that
    // can trade, so this is a checked fact. TradeLocker (P2) has no equivalent,
    // and a note living on the connector cannot be inherited by accident.
    credentialNote:
      'Use your investor (read-only) password. A password that can place trades is rejected and deleted on the first login.',
    // No gate: the credential we ask for here CANNOT trade, and the worker proves
    // it on every login. A tick-box would be ceremony over a checked fact.
    credentialConsent: null,
  },
  {
    // Listed deliberately though we cannot sync it: a lot of prop accounts are
    // MT4 and statement import works fine. The EA is a .mq5 file and the farm's
    // MetaTrader5 Python package is MT5-only, so neither sync route exists here.
    id: 'mt4',
    label: 'MetaTrader 4',
    connector: null,
    enabled: false,
    importMethods: ['file', 'manual'],
    assetTypes: ['forex', 'cfd'],
    credentialFields: [],
    credentialNote: null,
    credentialConsent: null,
  },
  {
    id: 'ctrader',
    label: 'cTrader',
    connector: null,        // P3 — OAuth 2.0 + Protobuf, gated on Spotware app registration
    enabled: false,
    importMethods: ['file', 'manual'],
    assetTypes: ['forex', 'cfd'],
    credentialFields: [],
    credentialNote: null,
    credentialConsent: null,
  },
  {
    id: 'tradelocker',
    label: 'TradeLocker',
    // The connector MODULE is built (domain/sync/connectors/tradelocker/) and
    // registered. This stays null — and the platform stays disabled — until a
    // real account has synced AND its computed P&L has reconciled against
    // /trade/accounts/{id}/state. TradeLocker gives us no realized-P&L field, so
    // every money figure is derived by us; spec §13.2 names that as the largest
    // technical risk in the connector, and it is only checkable against a live
    // account. Flipping this early would offer Auto Sync we cannot stand behind.
    connector: null,        // P2 — see the spec before flipping
    enabled: false,
    importMethods: ['file', 'manual'],
    assetTypes: ['forex', 'cfd'],
    // Collected now though Auto Sync is off: the fields are what the wizard's
    // ConnectStep renders from, and they are the shape the credential validation
    // and the consent copy are written against.
    credentialFields: [
      { name: 'email', label: 'TradeLocker email', type: 'email', required: true, placeholder: 'you@example.com' },
      { name: 'server', label: 'Broker server', type: 'text', required: true, placeholder: 'OSP-DEMO' },
      { name: 'password', label: 'TradeLocker password', type: 'password', required: true, secret: true },
    ],
    // THIS COPY IS NOT MT5'S, AND MUST NEVER BECOME IT. MT5 promises a
    // trade-capable password is rejected and deleted, because the worker checks
    // trade_allowed and that is a checked fact. TradeLocker offers no investor
    // password, no OAuth and no scope — the only credential it has can place
    // trades. Saying anything softer here would be a false security claim on a
    // funded account, which is why the note lives on the descriptor rather than
    // in a shared page where MT5's promise could be inherited by accident.
    credentialNote:
      'TradeLocker has no read-only password — this is the same password that can place trades on your account. '
      + 'We store it encrypted, and PropVexis only ever reads your trade history with it. '
      + 'You can disconnect the account at any time, which deletes the stored password.',
    // A REAL GATE, NOT A SENTENCE (spec §3). The note above explains; this is what
    // the trader has to actively affirm before the password field will submit.
    // The distinction is the whole point of the §3 decision: we are asking for a
    // credential that can move real money on a funded account, and a sentence
    // someone scrolled past is not consent to that.
    credentialConsent:
      'I understand this password can place trades on my account, and I authorise PropVexis to use it to read my trade history.',
  },
  {
    // The escape hatch. Without it, a trader on a platform we have never heard of
    // cannot finish the flow at all.
    id: 'other',
    label: 'Other / not listed',
    connector: null,
    enabled: true,
    importMethods: ['file', 'manual'],
    assetTypes: [],
    credentialFields: [],
    credentialNote: null,
    credentialConsent: null,
  },
];

// Recursively Object.freeze an object/array and everything it references, so
// neither the top-level array, a platform object, nor a nested
// credentialFields/importMethods/assetTypes array can be mutated by a consumer.
// Freeze is shallow by default — this closes that gap.
function deepFreeze(value) {
  if (value !== null && (typeof value === 'object' || typeof value === 'function') && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.getOwnPropertyNames(value)) deepFreeze(value[key]);
  }
  return value;
}
deepFreeze(PLATFORMS);

export const PLATFORM_IDS = PLATFORMS.map((p) => p.id);

/** A platform by id, or null. Never throws — callers turn null into a 400. */
export const findPlatform = (id) => PLATFORMS.find((p) => p.id === id) || null;

/** Does this platform offer that import method? False for anything unknown. */
export const platformSupports = (id, importMethod) =>
  Boolean(findPlatform(id)?.importMethods.includes(importMethod));

/** Platforms we can actually Auto Sync today — exactly those with a connector. */
export const autoSyncPlatforms = () => PLATFORMS.filter((p) => p.connector);
