/* THE FIGURE A RULE METER SHOWS NEVER GOES BELOW ZERO. 2026-09-03.
 *
 * `challengeState` (src/domain/prop/prop.js) reports two of the three rule figures as
 * SIGNED distances, because that is what the engine reasons in:
 *
 *   maxDd  — `roomLeft` is equity minus the floor, so on an account in profit it is
 *            LARGER than the drawdown band and `limit - roomLeft` comes out negative.
 *            The card printed "-$2,090 / $2,500 · 0.0% used": a trader $2,090 UP was
 *            shown a minus sign on the meter that ends accounts.
 *   target — `current` is equity minus the baseline, so an account in drawdown reads
 *            "-$500 / $1,200", i.e. negative progress toward a target.
 *
 * Neither is wrong as a distance; both are wrong as the left half of "used / limit".
 * A drawdown allowance you have not touched is $0 used, and progress you have not made
 * is $0 of the target — no rule is ever consumed by less than nothing.
 *
 * Kept as two named functions in a plain module rather than a `Math.max(0, …)` at each
 * meter, for the reason the app already has `roomStatus`: four surfaces draw these
 * meters (the dashboard's account card, Accounts › Details, the portfolio card and the
 * challenge cards), and the moment the clamp is a per-call-site decision one of them
 * will keep the minus sign. `daily_dd` needs no helper — the engine already clamps
 * `usedToday` at 0.
 *
 * DISPLAY ONLY. Nothing here feeds a threshold: the alert engine (accountAlert.js)
 * keeps reading the signed figures, where a negative and a zero fail every `>=` the
 * same way.
 */

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * The drawdown a max-DD meter should show as consumed. Floored at 0, so an account
 * trading above its baseline reads "$0 / $2,500" rather than a negative.
 *
 * @param {object|null} maxDd `challengeState().maxDd`
 * @returns {number|null} null when the account carries no max-DD rule
 */
export function maxDdUsed(maxDd) {
  if (!maxDd || maxDd.limit == null || maxDd.roomLeft == null) return null;
  return Math.max(0, round2(maxDd.limit - maxDd.roomLeft));
}

/**
 * The profit a target meter should show as made. Floored at 0, so an account in
 * drawdown reads "$0 / $1,200" rather than negative progress.
 *
 * @param {object|null} target `challengeState().profitTarget`
 * @returns {number|null} null when the account carries no target
 */
export function targetProgress(target) {
  if (!target || target.current == null) return null;
  return Math.max(0, round2(target.current));
}
