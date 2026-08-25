// The CLIENT-SIDE half of the account-creation plan gate.
//
// WHY THE NUMBERS ARE HERE TWICE. src/domain/billing/plans.js is the enforcement
// and this is the gate the wizard renders — and no module under frontend/ imports
// from outside frontend/ (the deploy rsyncs `src db scripts ea` plus
// `frontend/dist`, so the two trees are shipped independently). This is the same
// arrangement platformCatalog.js has with src/domain/sync/platforms.js, and
// test/account-gating.test.js is what stops the two drifting — including the case
// where the server gains a plan this file has never heard of.
//
// Gating happens at the `import` STEP, never at submit (spec §7.5). A Free user
// sees both Auto Sync options disabled with the reason and an upgrade link, while
// Manual and File upload stay live; a Pro user at the cap sees the count. The 402
// from provisionGate is the real enforcement and should be unreachable through
// the UI.
//
// JSX-free and dependency-free so node:test can import it: CI installs backend
// dependencies only.

/** Mirrors src/domain/billing/plans.js PLANS. Values are drift-tested.
 *
 *  PLAN GATING IS CURRENTLY OFF (owner decision, 2026-08-25) — every plan grants
 *  everything while the feature base is still being built, so autoSyncGate below
 *  currently allows every plan. The gate itself is kept, not deleted: the reasons,
 *  the counting rule and the upgrade route are what tiers need when they return,
 *  and the drift test means the server cannot re-cap without this file following.
 *  plans.js holds the full note and the pre-decision numbers. */
const ENTITLEMENTS = {
  free:    { ea: true, syncedAccounts: Infinity, manualAccounts: Infinity },
  pro:     { ea: true, syncedAccounts: Infinity, manualAccounts: Infinity },
  premium: { ea: true, syncedAccounts: Infinity, manualAccounts: Infinity },
};

export const KNOWN_PLANS = Object.keys(ENTITLEMENTS);
const DEFAULT_PLAN = 'free';

// An unknown, absent or malformed plan gets the free entitlements, mirroring
// entitlements() on the server exactly. That is the mechanism that fails CLOSED
// once tiers return; while gating is off, free restricts nothing.
const of = (plan) =>
  (typeof plan === 'string' && Object.prototype.hasOwnProperty.call(ENTITLEMENTS, plan)
    ? ENTITLEMENTS[plan]
    : ENTITLEMENTS[DEFAULT_PLAN]);

export const eaAllowed = (plan) => of(plan).ea;
export const syncedAccountLimit = (plan) => of(plan).syncedAccounts;
export const manualAccountLimit = (plan) => of(plan).manualAccounts;

/**
 * How many of the user's accounts occupy a synced slot.
 *
 * EVERY synced account counts, archived included: is_active is a soft archive, so
 * the row, its ingest token and its MT5 login all still exist, and the server's
 * syncedAccountCount does not filter it either. Discounting archived accounts here
 * would offer a slot that provision then refuses with a 402.
 *
 * Exported so that rule stays under test while the caps are lifted — through the
 * gate alone it is only observable in a refusal that Infinity makes unreachable.
 */

/** May this user start an Auto Sync (or EA) account right now, and if not, why?
 *  Currently always yes: see the gating note on ENTITLEMENTS above. */
export const syncedUsage = (accounts) =>
  (Array.isArray(accounts) ? accounts : []).filter((a) => a?.kind === 'synced').length;

export function autoSyncGate({ plan, accounts } = {}) {
  const limit = syncedAccountLimit(plan);
  if (!eaAllowed(plan) || limit === 0) {
    return {
      allowed: false,
      reason: 'Auto Sync and the EA need the Pro plan.',
      upgrade: true,
    };
  }
  const used = syncedUsage(accounts);
  if (used >= limit) {
    return {
      allowed: false,
      reason: `${used} of ${limit} synced accounts used on your plan.`,
      upgrade: true,
    };
  }
  return { allowed: true, reason: null, upgrade: false };
}
