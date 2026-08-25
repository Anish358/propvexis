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
 *  formats catalog data, so it belongs with the catalog; AccountForms.jsx
 *  imports it back, and test/propFirms.test.js exercises it directly. */
export const sizeLabel = (n) => (Number(n) >= 1000 ? `${Number(n) / 1000}K` : String(n));

/**
 * The escape hatch's firm id. Named because it is the one firm whose NAME the user
 * types: everywhere else firm_name is derived from this catalog, and code that has
 * to ask "is this the unlisted one?" should not be matching a bare string that also
 * happens to be a platform id.
 */
export const UNLISTED_FIRM_ID = 'other';

/**
 * THE ACCOUNT TYPES, and the phases each one HAS. Owner decision 2026-08-25: a fixed
 * list of four, offered for every firm.
 *
 * WHAT THIS REPLACED, because it is a real loss of information and not just a different
 * control. The wizard used to take the type from the CATALOG below —
 * `wizardProducts(firm_id)` — so GoatFundedTrader offered its verified 2-Step and
 * nothing else, and an unlisted firm offered one `custom` product. The catalog knows
 * which products a firm actually sells; this list does not, so the wizard now offers a
 * 3-Step account for a firm that sells no such thing. That follows from the presets
 * being dropped: with no rules resolved from the catalog, `product_id` no longer selects
 * anything — it records what the trader says they bought.
 *
 * THE PHASE LIST IS THE POINT OF THE TABLE. A 2-Step account has two evaluations and a
 * funded stage; an Instant account is funded from the start and has no evaluation at
 * all. Offering "Phase 2" for an Instant account would let a trader file a challenge
 * that cannot exist — and the phase decides which number the account is scored against
 * (a target for an evaluation, a split for a funded account). So the phase dropdown is
 * DERIVED from this, never a second list to keep in step.
 *
 * `custom` is not here on purpose: accounts created before this change carry it, and
 * `isCustomProduct` still reads it, but it is not something to offer any more.
 */
export const ACCOUNT_TYPES = [
  { id: '1step', label: '1 Step', phases: ['p1', 'funded'] },
  { id: '2step', label: '2 Step', phases: ['p1', 'p2', 'funded'] },
  { id: '3step', label: '3 Step', phases: ['p1', 'p2', 'p3', 'funded'] },
  { id: 'instant', label: 'Instant', phases: ['funded'] },
];

/** The phases this account type has — `[]` for an id the table does not name, so an
 *  unrecognised type offers no phase rather than all of them. */
export const phasesFor = (productId) => ACCOUNT_TYPES.find((t) => t.id === productId)?.phases ?? [];

/**
 * The account sizes the picker offers. The owner's list.
 *
 * A CHOICE **AND** A FREE FIELD, which the old catalog-driven size row could not be:
 * these eight cover what firms sell, and the free field exists because they also sell
 * 8K, 12.5K and 1M. It is not a fallback for an empty list — it is the answer to "more
 * or custom", so it stays reachable even when one of the eight is right.
 */
export const ACCOUNT_SIZES = [5000, 10000, 15000, 25000, 50000, 100000, 200000, 300000];
/**
 * Initials for a firm's mark — the two-letter monogram the wizard's firm rows draw in
 * place of a logo, because we carry no logo assets and inventing artwork for a real
 * firm is not a thing to do in a component.
 *
 * The capitals of the name, capped at two, because that is what fits legibly in a 40px
 * square at label size: "GoatFundedTrader" -> GF, "FTMO" -> FT. A name with fewer than
 * two capitals falls back to its first two characters, so a lower-cased firm still gets
 * a mark rather than an empty tile.
 *
 * HERE RATHER THAN IN THE STEP because it is a rule about the catalog's data with three
 * branches, and this module is JSX-free — so node:test can reach it. A copy of it inside
 * FirmStep.jsx could only ever be pinned by grepping the source.
 */
export function firmInitials(name) {
  const text = String(name ?? '').trim();
  if (!text) return '';
  const capitals = text.match(/[A-Z]/g);
  const letters = capitals && capitals.length >= 2 ? capitals : text.toUpperCase().split('');
  return letters.slice(0, 2).join('');
}


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
    id: UNLISTED_FIRM_ID,
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
