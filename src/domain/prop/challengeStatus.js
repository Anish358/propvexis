// WHEN A PHASE IS OVER, decided in one place and as a pure function.
//
// WHAT THIS CHANGES ABOUT THE PRODUCT. Until now `challenges.status` moved only when
// a human pressed something: POST /api/prop/advance closed the active row and opened
// the next. The engine has always KNOWN better than that — challengeState() computes
// `breach.breached`, `profitTarget.reached` and `tradingDays.met` on every read — but
// nothing wrote it down, so an account that had hit its target still sat in the
// Evaluation bucket and a breached one still counted as running. Owner spec
// 2026-08-27: the status follows the trading, automatically.
//
// PURE, AND SEPARATE FROM THE WRITE, for the same reason every other decision in this
// domain is: there is no test database, so the only place the RULE can be pinned is a
// function that takes state and returns a verdict. The write lives in challenges.js
// (applyChallengeOutcome) and does no thinking of its own.
//
// IT DOES NOT DECIDE THE LADDER. Which phase comes after this one — p1 -> p2 for a
// 2-Step, p1 -> funded for a 1-Step — is catalog knowledge, and the catalog is
// frontend/src/features/prop/propFirms.js, which the backend deliberately cannot
// import (deploy rsyncs `src db scripts ea` plus `frontend/dist`; see the same note
// on validateProvision). So the API reports what each phase DID, and `phasesFor` on
// the client decides what may be added next. A copy of the taxonomy here would be a
// second answer to "how many phases does a 3-Step have".

/** The three values `challenges.status` holds. 'active' is the row still running. */
export const CHALLENGE_STATUSES = ['active', 'passed', 'breached'];

/** The three values `challenge_groups.status` holds (migration 0027). */
export const GROUP_STATUSES = ['active', 'passed', 'failed'];

/**
 * What has this phase's challenge become, given the engine's live reading of it?
 *
 * Returns `{ status, reason }`, where status is one of CHALLENGE_STATUSES and reason
 * is the breach reason or null. `active` means nothing has happened yet — the caller
 * writes nothing at all in that case.
 *
 * BREACH IS CHECKED FIRST AND IS TERMINAL, which mirrors deriveAlerts (breach
 * supersedes every other alert) and accountsBreakdown (a breached evaluation account
 * is breached, not an evaluation account with a problem). An account CAN cross its
 * target and then blow the daily limit on the same day; the firm keeps the account
 * either way, so the breach is what happened.
 *
 * A PASS NEEDS THE TARGET **AND** THE TRADING DAYS (owner decision 2026-08-27).
 * Hitting 8% on day two of a three-day minimum is not a pass at any firm, and marking
 * it passed would tell the trader to go and add a Phase 2 account the firm has not
 * given them — a phantom phase, in the one place in the app where being wrong costs
 * real money. `tradingDays.met` is already true when nothing is required (0 >= 0), so
 * a firm with no day requirement passes on the target alone with no special case.
 *
 * A FUNDED PHASE NEVER AUTO-PASSES, and that falls out rather than being written:
 * profitTargetState() returns null when the challenge carries no profit target, and
 * migration 0016 stores NULL there for every funded row. A funded account's journey
 * ends in payouts, not in a pass.
 */
export function resolveChallengeOutcome({ challenge, state } = {}) {
  const none = { status: 'active', reason: null, day: null };
  if (!challenge || challenge.status !== 'active' || !state) return none;

  // No drawdown rules at all means nothing to be judged against — the same reading
  // deriveAlerts takes of `state.maxDd` being absent.
  if (!state.maxDd) return none;

  if (state.breach?.breached) {
    const reason = state.breach.reason ?? null;
    // THE DAY, and only for the one outcome that HAS one. See recursOnItsOwn below:
    // a daily-loss breach belongs to a trading day, a max-drawdown breach does not.
    return { status: 'breached', reason, day: reason === 'daily_dd' ? state.dailyDd?.day ?? null : null };
  }
  if (state.profitTarget?.reached === true && state.tradingDays?.met === true) {
    return { status: 'passed', reason: null, day: null };
  }
  return none;
}

/**
 * Has the trader already rejected THIS outcome? (migration 0033)
 *
 * WHY THIS EXISTS AT ALL. `reopenChallenge` puts a settled phase back to running, and
 * it is the undo an automatic system has to have. But the engine that settled the row
 * is still running: the next ingest reads the same equity against the same rules,
 * reaches the same verdict, and settles it again. Without a memory of what the trader
 * rejected, "Not passed yet" is a button that works for exactly one tick and then the
 * strip returns, forever.
 *
 * SUPPRESSION IS STICKY BY DEFAULT, AND ONE OUTCOME OPTS OUT. The tempting rule — "a
 * new day is a new event, so speak again" — is right for exactly one of the three
 * verdicts this engine reaches, and wrong in a way that recreates the loop for the
 * other two:
 *
 *   'passed'            — the target does not stop being reached. The trader is up, and
 *                         tomorrow they are still up. Day-keyed, the strip would come
 *                         back every single morning.
 *   'breached/max_dd'   — the same. Equity below the overall floor stays below it; the
 *                         account is gone and no new day changes that.
 *   'breached/daily_dd' — the one that genuinely recurs. A daily-loss breach IS a
 *                         trading day, so a breach on the 7th is a different event from
 *                         the one on the 6th and deserves to be reported.
 *
 * So a suppressed outcome carries `day` only for a daily-loss breach, and a NULL day
 * means "stay quiet until something else clears this". What clears it is the rules
 * being edited (challenges.suppressed_outcome is dropped on a rules edit) — which is
 * the right escape hatch, because when a trader says a pass is wrong the engine has
 * usually not miscounted: the rules it was given are wrong.
 *
 * A DIFFERENT VERDICT ALWAYS SPEAKS. Rejecting a pass does not silence a later breach,
 * and silencing one breach reason does not silence the other. Only the exact outcome
 * the trader rejected stays quiet.
 */
export function isOutcomeSuppressed(suppressed, outcome) {
  if (!suppressed || !outcome) return false;
  if (suppressed.status !== outcome.status) return false;
  if ((suppressed.reason ?? null) !== (outcome.reason ?? null)) return false;
  // A stored day means "only this day"; no stored day means "until something clears it".
  if (suppressed.day == null) return true;
  return String(suppressed.day) === String(outcome.day ?? '');
}

/**
 * Does this outcome come back on its own if we let it? Exported for the caller that
 * writes the suppression, so the shape stored is decided by the same file that decides
 * how it is read.
 */
export const recursOnItsOwn = (outcome) => outcome?.status === 'breached' && outcome?.reason === 'daily_dd';

/**
 * Does this outcome end the whole challenge?
 *
 * Owner spec: a breach on ANY phase account fails the challenge it belongs to — the
 * firm does not hand back a Phase 2 login because Phase 1 went well. A pass does the
 * opposite: it is the challenge PROGRESSING, and the group stays active so the next
 * phase's account can be added to it.
 *
 * 'passed' for a GROUP is deliberately not returned by anything yet. The journey's
 * last stage is funded, a funded phase has no target to cross, and inventing a
 * completion event for it would put a challenge in a terminal state while the trader
 * is still being paid from it.
 */
export const groupOutcomeFor = (outcome) => (outcome?.status === 'breached' ? 'failed' : null);
