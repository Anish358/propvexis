// Pure subscription-plan entitlements. Kept side-effect-free (no DB, no config)
// so gating decisions can be unit-tested like access.js/derive.js. The DB only
// stores the plan slug on users.plan; everything a plan *means* lives here.
//
// Tiers (see memory `saas-broker-integration`):
//   free    – manual add + CSV import only ($0 COGS)
//   pro     – + EA attach sync (user hosts the EA; $0 COGS). The volume tier.
//   premium – + MetaApi cloud sync (real COGS). Deferred; flag defined now.
//
// `syncedAccounts` = EA/live-bound accounts (the Pro gate). `manualAccounts` =
// user-made buckets for manual/CSV trades, so even Free users can SEGREGATE their
// journal per account (god view vs per-account) without any live sync.
export const PLANS = {
  free:    { ea: false, metaapi: false, csvImport: true, manual: true, syncedAccounts: 0, manualAccounts: 5 },
  pro:     { ea: true,  metaapi: false, csvImport: true, manual: true, syncedAccounts: 3, manualAccounts: 20 },
  premium: { ea: true,  metaapi: true,  csvImport: true, manual: true, syncedAccounts: 1, manualAccounts: 20 },
};

export const DEFAULT_PLAN = 'free';

export function isValidPlan(plan) {
  return typeof plan === 'string' && Object.prototype.hasOwnProperty.call(PLANS, plan);
}

// Entitlements for a plan slug. Unknown/missing/invalid → free (fail-closed):
// a bad or absent plan must never unlock a paid capability.
export function entitlements(plan) {
  return isValidPlan(plan) ? PLANS[plan] : PLANS[DEFAULT_PLAN];
}

// Can this plan sync trades via the EA ingest path?
export function canUseEA(plan) {
  return entitlements(plan).ea;
}

// Can this plan sync via MetaApi? (Premium; not wired yet.)
export function canUseMetaApi(plan) {
  return entitlements(plan).metaapi;
}

// Max number of sync-linked MT5 accounts a plan may own. Free is 0 — free users
// journal via manual entry / CSV import (account_id-less trades), not synced accounts.
export function accountLimit(plan) {
  return entitlements(plan).syncedAccounts;
}

// Max number of manual (non-synced) accounts a plan may own. Available on every
// plan so any user can segregate manual/CSV trades into per-account views.
export function manualAccountLimit(plan) {
  return entitlements(plan).manualAccounts;
}
