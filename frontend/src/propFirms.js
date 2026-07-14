// Prop-firm rule-template catalog (Plan.md Phase 6 polish). A static catalog of
// firms + account sizes + phase rule sets that PRE-FILLS the account rule fields
// when adding/editing an account, instead of manual entry. All applied values
// stay fully editable — these are published defaults, not enforced values, so a
// firm changing its rules (or a promo variant) is always a manual tweak away.
//
// JSX-free so test/propFirms.test.js (node:test) can validate the resolver.
// Rule %s current as of 2026-07; verify against the firm before relying on them.

export const PROP_FIRMS = [
  {
    id: 'gft',
    name: 'GoatFundedTrader',
    sizes: [25000, 50000, 100000],
    ddType: 'static',        // max DD is balance/equity floor (90% of start) → static
    defaultSplitPct: 80,
    phases: [
      { id: 'p1',     label: 'Phase 1 (Evaluation)', accountType: 'eval',   dailyDdPct: 5, maxDdPct: 10, profitTargetPct: 8, minTradingDays: 3 },
      { id: 'p2',     label: 'Phase 2 (Evaluation)', accountType: 'eval',   dailyDdPct: 5, maxDdPct: 10, profitTargetPct: 5, minTradingDays: 3 },
      { id: 'funded', label: 'Funded',               accountType: 'funded', dailyDdPct: 5, maxDdPct: 10, profitTargetPct: null, minTradingDays: 0 },
    ],
  },
  {
    id: 'ftmo',
    name: 'FTMO',
    sizes: [10000, 25000, 50000, 100000, 200000],
    ddType: 'static',        // FTMO Max Loss is a static equity floor; daily resets 00:00 CET
    defaultSplitPct: 80,
    phases: [
      { id: 'p1',     label: 'Challenge (Phase 1)',    accountType: 'eval',   dailyDdPct: 5, maxDdPct: 10, profitTargetPct: 10, minTradingDays: 4 },
      { id: 'p2',     label: 'Verification (Phase 2)', accountType: 'eval',   dailyDdPct: 5, maxDdPct: 10, profitTargetPct: 5,  minTradingDays: 4 },
      { id: 'funded', label: 'Funded',                 accountType: 'funded', dailyDdPct: 5, maxDdPct: 10, profitTargetPct: null, minTradingDays: 0 },
    ],
  },
];

export const findFirm = (firmId) => PROP_FIRMS.find((f) => f.id === firmId) || null;

// Resolve a (firm, size, phase) selection into the account form-field shape that
// PropFields/toPayload already consume — see AccountsModal.jsx. Returns null for
// an unknown firm/phase. Eval phases carry a profit target and no split; funded
// carries a split and no target (matches the challenge engine's expectations).
export function templateToFields(firmId, size, phaseId) {
  const firm = findFirm(firmId);
  if (!firm) return null;
  const phase = firm.phases.find((p) => p.id === phaseId);
  if (!phase) return null;
  const funded = phase.accountType === 'funded';
  return {
    firm_id: firm.id,
    firm_name: firm.name,
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
