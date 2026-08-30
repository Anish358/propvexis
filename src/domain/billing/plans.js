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
// journal per account (all-accounts vs per-account) without any live sync.
// `reports` = the exportable Journal+Prop report (V1). Paid differentiator: Pro+.
// ---------------------------------------------------------------------------
// PLAN GATING IS CURRENTLY OFF (owner decision, 2026-08-25).
//
// Which features belong to which tier is not decided yet, so every plan grants
// everything while the feature base is still being built. Segregation comes back
// as ONE EDIT to the literal below, once the base is stable: the shape, every
// consumer, the 402 paths and the drift test against the UI's mirror all stay in
// place, so restoring tiers is a change of values and not a rebuild.
//
// What the split was before it was lifted, kept here so the intent is not lost:
//   free:    ea false, metaapi false, reports false, synced 0,  manual 5
//   pro:     ea true,  metaapi false, reports true,  synced 3,  manual 20
//   premium: ea true,  metaapi true,  reports true,  synced 1,  manual 20
// Do not restore premium's `synced: 1` verbatim — it sat BELOW pro's 3 while
// every other premium entitlement was >= pro's, and it was almost certainly a
// typo. It would have rendered "1 of 1 synced accounts used" to a premium user.
//
// TWO CONSEQUENCES, both accepted deliberately rather than overlooked:
//  - entitlements() still falls back to `free`, but free is no longer a floor, so
//    an unknown/absent plan currently grants everything instead of failing closed.
//    Nothing is sold yet (Razorpay is blocked on KYC) and every existing user is
//    grandfathered to `pro`, so nothing is given away that was being charged for.
//  - `syncedAccounts: Infinity` removes the only per-account COGS cap we have: the
//    self-hosted MT5 farm is one Windows box per synced account's terminal. This is
//    the abuse vector to re-cap FIRST when tiers return.
//
// Infinity is deliberate over a large integer so no comparison is ever "nearly at
// the cap". It never reaches JSON: no route serialises these values today, and one
// that starts to must send a real number, because JSON.stringify(Infinity) is null.
// ---------------------------------------------------------------------------
const UNRESTRICTED = {
  ea: true, metaapi: true, csvImport: true, manual: true, reports: true,
  syncedAccounts: Infinity, manualAccounts: Infinity,
};

export const PLANS = {
  free:    { ...UNRESTRICTED },
  pro:     { ...UNRESTRICTED },
  premium: { ...UNRESTRICTED },
};

export const DEFAULT_PLAN = 'free';

export function isValidPlan(plan) {
  return typeof plan === 'string' && Object.prototype.hasOwnProperty.call(PLANS, plan);
}

// Entitlements for a plan slug. Unknown/missing/invalid → free, which is the
// mechanism that fails CLOSED once tiers return. While gating is off `free` grants
// everything, so this fallback currently restricts nothing — see the note above.
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

// Can this plan generate/export the Journal+Prop report? (Pro+.)
export function canUseReports(plan) {
  return entitlements(plan).reports;
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
