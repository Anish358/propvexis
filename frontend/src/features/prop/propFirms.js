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

export const PRODUCT_IDS = ['1step', '2step', 'instant'];

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
];

export const findFirm = (firmId) => PROP_FIRMS.find((f) => f.id === firmId) || null;

/** A firm's product, or null for an unknown firm OR an unknown product. */
export const findProduct = (firmId, productId) =>
  findFirm(firmId)?.products.find((p) => p.id === productId) || null;

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
  const phase = product.phases.find((p) => p.id === phaseId);
  if (!phase) return null;
  const funded = phase.accountType === 'funded';
  return {
    firm_id: firm.id,
    firm_name: firm.name,
    product_id: product.id,
    account_type: phase.accountType,
    start_balance: Number(size) || null,
    daily_dd_pct: phase.dailyDdPct,
    max_dd_pct: phase.maxDdPct,
    profit_target_pct: funded ? null : phase.profitTargetPct,
    payout_split_pct: funded ? firm.defaultSplitPct : null,
    dd_type: firm.ddType,
    min_trading_days: phase.minTradingDays,
  };
}
