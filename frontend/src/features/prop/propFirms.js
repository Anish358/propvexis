// Prop-firm rule-template catalog. A static catalog of firms -> products -> sizes
// -> phase rule sets that PRE-FILLS the account rule fields, instead of manual
// entry. Applied values stay fully editable: these are published defaults, not
// enforced values, so a firm changing its rules is always one manual tweak away.
//
// WHY A `products` LAYER. A firm does not sell "an account", it sells a 1-Step, a
// 2-Step or an Instant Funding account, and the rules differ per product, not just
// per phase. The pre-products catalog hardcoded every firm as 2-step, so a trader
// on a 1-step account was pre-filled with 2-step rules and had to correct them by
// hand — and nothing recorded which product it was, because firm_id + size +
// account_type cannot tell 1-step from 2-step. mt5_accounts.product_id (migration
// 0026) is where that now lands.
//
// `verified` IS PART OF THE DATA. The 2-step rules below are the ones this file
// shipped with and are pinned by test/propFirms.test.js so a restructure cannot
// silently change what a live challenge is judged against. The 1-step and instant
// rule sets are NOT confirmed against the firms — they are marked verified: false
// and MUST be checked before public launch. A wrong drawdown percentage here
// mis-scores a real account.
//
// JSX-free so test/propFirms.test.js (node:test) can validate the resolver.

export const PRODUCT_IDS = ['1step', '2step', 'instant', 'custom'];

// Short names for the account LABEL, not for a select option. The Phase A gap:
// "GoatFundedTrader 25K" was suggested for both the 1-Step and the 2-Step 25K
// account, so two accounts a trader has to tell apart got one name. The product's
// own `label` ("Challenge + Verification") is too long to sit inside an account
// name; this is the distinguishing fragment. Custom is blank on purpose — an
// unlisted firm has no product name to contribute.
export const SHORT_PRODUCT_LABEL = {
  '1step': '1-Step',
  '2step': '2-Step',
  instant: 'Instant',
  custom: '',
};

/** Human size label: 50000 -> "50K". Moved here from AccountForms.jsx — it
 *  formats catalog data and three surfaces now need it. */
export const sizeLabel = (n) => (Number(n) >= 1000 ? `${Number(n) / 1000}K` : String(n));

export const PROP_FIRMS = [
  {
    id: 'gft',
    name: 'GoatFundedTrader',
    platforms: ['mt5'],
    ddType: 'static',          // max DD is a balance/equity floor (90% of start)
    defaultSplitPct: 80,
    products: [
      {
        id: '2step',
        label: '2-Step Evaluation',
        verified: true,        // carried over unchanged from the pre-products catalog
        sizes: [25000, 50000, 100000],
        phases: [
          { id: 'p1',     label: 'Phase 1 (Evaluation)', accountType: 'eval',   dailyDdPct: 5, maxDdPct: 10, profitTargetPct: 8,    minTradingDays: 3 },
          { id: 'p2',     label: 'Phase 2 (Evaluation)', accountType: 'eval',   dailyDdPct: 5, maxDdPct: 10, profitTargetPct: 5,    minTradingDays: 3 },
          { id: 'funded', label: 'Funded',               accountType: 'funded', dailyDdPct: 5, maxDdPct: 10, profitTargetPct: null, minTradingDays: 0 },
        ],
      },
      {
        id: '1step',
        label: '1-Step Evaluation',
        verified: false,       // UNVERIFIED — confirm against goatfundedtrader.com before launch
        sizes: [25000, 50000, 100000],
        phases: [
          { id: 'p1',     label: 'Evaluation', accountType: 'eval',   dailyDdPct: 4, maxDdPct: 6, profitTargetPct: 10,   minTradingDays: 3 },
          { id: 'funded', label: 'Funded',     accountType: 'funded', dailyDdPct: 4, maxDdPct: 6, profitTargetPct: null, minTradingDays: 0 },
        ],
      },
      {
        id: 'instant',
        label: 'Instant Funding',
        verified: false,       // UNVERIFIED — confirm against goatfundedtrader.com before launch
        sizes: [25000, 50000],
        phases: [
          { id: 'funded', label: 'Funded', accountType: 'funded', dailyDdPct: 4, maxDdPct: 6, profitTargetPct: null, minTradingDays: 0 },
        ],
      },
    ],
  },
  {
    id: 'ftmo',
    name: 'FTMO',
    platforms: ['mt5', 'mt4', 'ctrader'],
    ddType: 'static',          // FTMO Max Loss is a static equity floor; daily resets 00:00 CET
    defaultSplitPct: 80,
    products: [
      {
        id: '2step',
        label: 'Challenge + Verification',
        verified: true,        // carried over unchanged from the pre-products catalog
        sizes: [10000, 25000, 50000, 100000, 200000],
        phases: [
          { id: 'p1',     label: 'Challenge (Phase 1)',    accountType: 'eval',   dailyDdPct: 5, maxDdPct: 10, profitTargetPct: 10,   minTradingDays: 4 },
          { id: 'p2',     label: 'Verification (Phase 2)', accountType: 'eval',   dailyDdPct: 5, maxDdPct: 10, profitTargetPct: 5,    minTradingDays: 4 },
          { id: 'funded', label: 'Funded',                 accountType: 'funded', dailyDdPct: 5, maxDdPct: 10, profitTargetPct: null, minTradingDays: 0 },
        ],
      },
    ],
  },
  {
    // THE ESCAPE HATCH, and the reason it exists: validateProvision requires
    // firm_id AND product_id for a prop account, and this catalog lists two
    // firms out of roughly a hundred. Without this entry a trader at FundedNext
    // or Alpha Capital cannot use the prop path at all — they would have to file
    // a firm-funded account as Live Capital, which is exactly the
    // misclassification capital_kind exists to end.
    //
    // It deliberately carries NO percentages. The wizard's product and phase
    // steps collect them by hand; inventing a "typical" drawdown here would put
    // a number in front of a trader that no firm published, which is the same
    // failure mode the verified: false flags are guarding against.
    id: 'other',
    name: 'Other / not listed',
    // Every platform: we cannot know which one an unlisted firm runs, and the
    // platform step filters its grid to the firm's platforms.
    platforms: ['mt5', 'mt4', 'ctrader', 'tradelocker', 'other'],
    // A default for an editable control, not a claim about any firm. Both listed
    // firms are static and it is much the commoner model; the phase step's DD-type
    // control starts here and the user changes it.
    ddType: 'static',
    // Likewise a starting value for an editable field. Unlike a drawdown, a wrong
    // split cannot mis-score a pass or a breach — it only affects payout maths the
    // user sees immediately and can correct.
    defaultSplitPct: 80,
    products: [
      {
        id: 'custom',
        label: 'My own rules',
        custom: true,
        verified: false,   // there is nothing to verify; the user is the source
        sizes: [],         // the user types the account size
        phases: [],        // the wizard offers p1 / p2 / funded generically
      },
    ],
  },
];

export const findFirm = (firmId) => PROP_FIRMS.find((f) => f.id === firmId) || null;

/** A firm's product, or null for an unknown firm OR an unknown product. */
export const findProduct = (firmId, productId) =>
  findFirm(firmId)?.products.find((p) => p.id === productId) || null;

/**
 * The firms the Add Account wizard offers, in catalog order.
 *
 * A firm with nothing selectable would be a card that leads to an empty page, so
 * a firm whose every product is unverified is dropped here rather than dead-ended
 * two steps later.
 */
export const wizardFirms = () => PROP_FIRMS.filter((f) => wizardProducts(f.id).length > 0);

/**
 * The products the wizard offers for a firm: VERIFIED rules, plus the custom
 * escape.
 *
 * `verified: false` products are hidden deliberately (owner decision,
 * 2026-08-23). GFT's 1-Step and Instant Funding rule sets have never been checked
 * against goatfundedtrader.com, and a wrong drawdown percentage does not fail
 * loudly — it silently mis-scores a real trader's account for the length of a
 * challenge. They stay in the catalog with their flags intact so that confirming
 * them is a one-line change; they just do not reach a user first.
 */
export const wizardProducts = (firmId) =>
  findFirm(firmId)?.products.filter((p) => p.verified === true || p.custom === true) || [];

/** Is this the hand-entered-rules product? False for anything unknown. */
export const isCustomProduct = (firmId, productId) =>
  findProduct(firmId, productId)?.custom === true;

/**
 * Resolve a (firm, product, size, phase) selection into the account form-field
 * shape PropFields/toPayload already consume. Returns null for anything unknown —
 * including a phase that exists in another product of the same firm, since an
 * Instant Funding account has no Phase 1.
 *
 * Eval phases carry a profit target and no split; funded carries a split and no
 * target, which is what the challenge engine expects.
 */
export function templateToFields(firmId, productId, size, phaseId) {
  const firm = findFirm(firmId);
  const product = findProduct(firmId, productId);
  if (!firm || !product) return null;
  if (product.custom) return null;   // nothing to resolve; the user typed the rules
  // Phase A accepted ANY size: the pre-wizard <select> could only emit a real one,
  // but the wizard's product step can carry a stale or typed value, and an
  // accepted 37000 writes a start_balance the firm never sold and then scores
  // every drawdown against it.
  const balance = Number(size);
  if (!product.sizes.includes(balance)) return null;
  const phase = product.phases.find((p) => p.id === phaseId);
  if (!phase) return null;
  const funded = phase.accountType === 'funded';
  return {
    firm_id: firm.id,
    firm_name: firm.name,
    product_id: product.id,
    account_type: phase.accountType,
    start_balance: balance,
    daily_dd_pct: phase.dailyDdPct,
    max_dd_pct: phase.maxDdPct,
    profit_target_pct: funded ? null : phase.profitTargetPct,
    payout_split_pct: funded ? firm.defaultSplitPct : null,
    dd_type: firm.ddType,
    min_trading_days: phase.minTradingDays,
  };
}
