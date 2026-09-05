/* WHICH ACCOUNTS A PAGE COUNTS (owner spec 2026-09-05).
 *
 * Three tiers exist — open (still being traded), closed (passed/breached and
 * acknowledged, or retired by hand), archived (hidden from everything). The switcher
 * shows the first two and the SERVER decides what "open" means; see resolveScope in
 * src/domain/accounts/accounts.js. This file answers the only part that is the
 * client's business: which of them a page starts on when the trader has not chosen.
 */

/** The two named scopes the server understands, beside an explicit list of logins. */
export const SCOPE_OPEN = 'open';
export const SCOPE_ALL = 'all';

/**
 * The default scope for a route.
 *
 * STATED AS A RULE, NOT A LIST OF PAGES, and that is deliberate: the Dashboard defaults
 * to open, every other analytic defaults to all. A list would have to be edited by
 * whoever builds the next surface that aggregates — and the failure mode of forgetting
 * is silent, a new page quietly showing a different set of accounts from its neighbours.
 * Written this way, a surface added next year inherits the answer.
 *
 * WHY THE DASHBOARD IS THE ODD ONE OUT. It answers "where do I stand right now, before I
 * trade?", and a trader with seven blown accounts does not want them in that answer.
 * Analytics, the Trade Log, Reports and the Calendar answer "how good a trader am I?",
 * and a record that quietly dropped the accounts they blew would flatter every user with
 * a track record they did not earn.
 */
export function defaultScopeFor(pathname = '/') {
  return isDashboardPath(pathname) ? SCOPE_OPEN : SCOPE_ALL;
}

/** The dashboard is the index route, so it is the empty path and nothing else. */
export const isDashboardPath = (pathname = '/') => pathname === '/' || pathname === '';

/**
 * The scope actually sent to the API.
 *
 * `chosen` is null/'' until the trader picks something — which is a THIRD state, not a
 * synonym for 'all', and keeping them apart is the whole reason the stored value had to
 * be migrated. An explicit pick, including an explicit "All accounts", is honoured on
 * every page; only the absence of one falls back to the page's default.
 */
export function effectiveScope(chosen, pathname) {
  return chosen == null || chosen === '' ? defaultScopeFor(pathname) : chosen;
}

/**
 * Is this account in the open tier? Mirrors the server's `closed_at IS NULL` so the
 * switcher groups the same way the scope resolves. Archived accounts never reach here —
 * they are filtered out before the switcher sees them.
 */
export const isOpenAccount = (a) => a?.closed_at == null;

/** Which closed group an account belongs to. Only meaningful when it is closed. */
export const closedGroupOf = (a) => (a?.closed_reason === 'breached' ? 'breached'
  : a?.closed_reason === 'passed' ? 'passed' : 'retired');
