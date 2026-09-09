// The platform registry — the AUTHORITY on which trading platforms exist, which
// of them PropVexis can Auto Sync, and what a credential for each one looks like.
//
// TWO FIELDS THAT ARE EASY TO CONFLATE:
//   enabled    may this platform be CHOSEN in the Add Account flow at all
//   connector  non-null means Auto Sync is available for it
// 'other' is enabled with no connector, because a trader whose platform is absent
// from this list must still have a way through the flow. mt4 is the reverse of
// neither: listed, not yet selectable, badged "Soon" in the UI.
//
// A THIRD STATE EXISTED AND TRADELOCKER WAS IN IT, until Task 8 (2026-09-09):
// credential fields and a note but `connector: null`. The connector module was
// built and registered while the PLATFORM stayed the switch, off until a live
// account proved the derived P&L reconciles -- spec §13.2's biggest technical
// risk, since TradeLocker gives no realized-P&L field and every money figure is
// ours to derive. Task 7's live demo-account run (auth, discovery, backfill,
// reconcile) proved it, so the switch is now flipped: `connector: 'tradelocker'`,
// `enabled: true`. `enabled` and `connector` are still the only two things any
// caller reads, so nothing downstream had to know about the distinction while it
// existed.
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
    connector: 'ctrader',
    enabled: true,
    importMethods: ['auto_sync', 'file', 'manual'],
    assetTypes: ['forex', 'cfd'],
    // EMPTY ON PURPOSE, AND LOAD-BEARING. cTrader collects no credential at all:
    // the trader authorizes on Spotware's own consent screen and we hold a scoped
    // OAuth token. validateProvision reads this list to decide whether Auto Sync
    // needs a credential, so emptying it is what lets a cTrader account provision
    // without one -- and MT5's non-empty list is what keeps its requirement.
    credentialFields: [],
    // The read-only story here is STRONGER than MT5's and different in kind.
    // MT5 asks for an investor password and deletes it if the terminal reports it
    // can trade -- a check we perform. Here Spotware refuses trading operations on
    // our behalf: the grant is scope `accounts`, and the worker re-checks
    // permissionScope against the server's own answer on every discovery.
    credentialNote:
      'You authorize PropVexis on cTrader\'s own site. We never see your password, and the '
      + 'access we ask for is view-only — placing trades is refused by cTrader, not just by us.',
    // No gate: there is no trade-capable secret to consent to holding.
    credentialConsent: null,
  },
  {
    id: 'tradelocker',
    label: 'TradeLocker',
    // Task 8 (2026-09-09): FLIPPED LIVE. The connector MODULE was built
    // (domain/sync/connectors/tradelocker/) and registered well before this, with
    // `connector: null` holding the platform off until a real account had synced
    // AND its computed P&L reconciled against /trade/accounts/{id}/state --
    // TradeLocker gives us no realized-P&L field, so every money figure is derived
    // by us, which spec §13.2 names as the connector's largest technical risk.
    // Task 7's live demo-account run proved it: auth, discovery, backfill and
    // reconcile all checked out, including two bugs the live account surfaced
    // (a broker with no commission field, and a rate limit mid-backfill) that are
    // now fixed. That is what gates this flip -- see the spec before reverting it.
    connector: 'tradelocker',
    enabled: true,
    importMethods: ['auto_sync', 'file', 'manual'],
    assetTypes: ['forex', 'cfd'],
    // The fields the wizard's ConnectStep renders from, and the shape the
    // credential validation and the consent copy are written against.
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
