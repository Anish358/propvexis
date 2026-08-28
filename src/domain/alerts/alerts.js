// Alert derivation (Phase 9). PURE: turns one account's engine state (challengeState
// from prop.js) into the set of alerts currently "crossed", each carrying a
// dedup_key that scopes it to the right cycle so it fires once, not on every tick:
//   • breach / max-DD / target  -> per challenge  (keyed by challengeId)
//   • daily-DD proximity         -> per day        (keyed by the day)
//   • trading-days met           -> per cycle       (keyed by the cycle start)
// The caller (server ingest paths) inserts these ON CONFLICT (user_id, dedup_key)
// DO NOTHING and emits only genuinely-new rows. No DB access here — fully testable.

// The phase names a user reads. A LOCAL COPY on purpose: the backend cannot import
// frontend/src (deploy rsyncs `src db scripts ea` plus `frontend/dist`), which is the
// same reason PHASES is mirrored in domain/accounts/provision.js. `?? toPhase` so a
// phase this map has not learned about degrades to its id instead of "undefined".
const PHASE_LABEL = { p1: 'Phase 1', p2: 'Phase 2', p3: 'Phase 3', funded: 'Funded' };

const money = (n) => `$${Number(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

// Proximity warning bands, highest first: warn at 80% of a limit used, critical at
// 95%. Fixed defaults for v1 (per-user thresholds are a later follow-up).
const BANDS = [
  { pct: 95, severity: 'critical' },
  { pct: 80, severity: 'warning' },
];

// The highest band crossed for a headroom meter (fracRemaining = fraction of the
// allowance still intact). Returns null if not yet in warning range.
function bandFor(fracRemaining) {
  if (fracRemaining == null) return null;
  const usedPct = Math.round((1 - fracRemaining) * 100);
  const hit = BANDS.find((b) => usedPct >= b.pct);
  return hit ? { ...hit, usedPct } : null;
}

function proximityAlert({ accountId, acct, rule, label, meter, cycle }) {
  const band = bandFor(meter.fracRemaining);
  if (!band) return null;
  return {
    type: `${rule}_warning`,
    severity: band.severity,
    title: `${acct}: approaching ${label}`,
    body: `${band.usedPct}% of your ${label} used — ${money(meter.roomLeft)} left.`,
    dedupKey: `${accountId}:${rule}_${band.pct}:${cycle}`,
    data: { account_id: accountId, rule, usedPct: band.usedPct, roomLeft: meter.roomLeft },
  };
}

// Derive the active alerts for one account. `state` is the challengeState object;
// `challengeId` scopes per-challenge alerts; `label` names the account in copy.
export function deriveAlerts({ accountId, challengeId, label, state }) {
  const out = [];
  if (!state || !state.maxDd) return out; // no drawdown rules (e.g. manual account)
  const acct = label || `Account ${accountId}`;

  // Breach is terminal and supersedes every proximity warning — emit it alone.
  if (state.breach?.breached) {
    out.push({
      type: 'breach',
      severity: 'critical',
      title: `${acct}: challenge breached`,
      body: state.breach.reason === 'max_dd'
        ? 'Max drawdown limit hit — this challenge has failed.'
        : 'Daily drawdown limit hit — this challenge has failed.',
      dedupKey: `${accountId}:breach:${challengeId}`,
      data: { account_id: accountId, reason: state.breach.reason },
    });
    return out;
  }

  // Risk proximity — max DD (per challenge) + daily DD (per day).
  const maxWarn = proximityAlert({ accountId, acct, rule: 'max_dd', label: 'max drawdown', meter: state.maxDd, cycle: challengeId });
  if (maxWarn) out.push(maxWarn);
  const dayWarn = proximityAlert({ accountId, acct, rule: 'daily_dd', label: 'daily loss limit', meter: state.dailyDd, cycle: state.dailyDd.day });
  if (dayWarn) out.push(dayWarn);

  // Milestones — the positive half of the story.
  if (state.tradingDays?.met) {
    out.push({
      type: 'trading_days_met',
      severity: 'info',
      title: `${acct}: minimum trading days met`,
      body: `${state.tradingDays.completed} of ${state.tradingDays.required} trading days complete${state.phase === 'funded' ? ' — payout eligible.' : '.'}`,
      dedupKey: `${accountId}:trading_days_met:${state.tradingDays.cycleStart}`,
      data: { account_id: accountId },
    });
  }
  // REACHED BUT NOT YET A PASS — that is the whole condition this alert now covers.
  // The phase settles itself the moment the target AND the minimum trading days are
  // both in (resolveChallengeOutcome), and the pass milestone announces that; firing
  // this one too would tell the trader the same thing twice in the same tick, once in
  // copy that is no longer true ("you can pass this phase" — it already has). What is
  // left is the genuinely useful case: the number is hit and the days are what is
  // holding the phase open.
  if (state.profitTarget?.reached && !state.tradingDays?.met) {
    const left = Math.max(0, (state.tradingDays?.required ?? 0) - (state.tradingDays?.completed ?? 0));
    out.push({
      type: 'target_reached',
      severity: 'info',
      title: `${acct}: profit target reached`,
      body: `Profit target of ${money(state.profitTarget.target)} reached — ${left} more trading day${left === 1 ? '' : 's'} required to pass.`,
      dedupKey: `${accountId}:target_reached:${challengeId}`,
      data: { account_id: accountId },
    });
  }
  return out;
}

/**
 * The phase settled itself — passed on its own numbers, or breached.
 *
 * EMITTED BY THE STATUS APPLIER, not by deriveAlerts, and the difference is not
 * cosmetic: deriveAlerts is pure and says what the engine SEES, while this says what
 * was WRITTEN. The applier only calls it when a row actually changed (its UPDATE is
 * guarded on `status = 'active'`), so the "fires once" property comes from the
 * database rather than from a threshold that could be re-crossed.
 *
 * THE DEDUP KEY IS SHARED WITH phasePassedAlert BY DESIGN — `phase_passed:<challengeId>`
 * — so a phase that settles automatically and is then also advanced by hand through
 * /api/prop/advance (kept as an override, owner decision 2026-08-27) announces itself
 * once, not twice. The manual route and the automatic one are two ways of recording the
 * same event about the same challenge row.
 *
 * The pass copy names the NEXT step rather than the achievement, because there is one:
 * the trader now has to add the account their firm just issued them. It does not name
 * WHICH phase comes next — that is the catalog's answer (phasesFor), and the backend
 * cannot read the catalog.
 */
export function phaseOutcomeAlert({ accountId, label, phase, status, reason, challengeId }) {
  const acct = label || `Account ${accountId}`;
  const name = PHASE_LABEL[phase] ?? phase;
  if (status === 'breached') {
    return {
      type: 'breach',
      severity: 'critical',
      title: `${acct}: ${name} breached`,
      body: reason === 'daily_dd'
        ? 'Daily drawdown limit hit — this challenge has failed.'
        : 'Max drawdown limit hit — this challenge has failed.',
      // The SAME key deriveAlerts uses for its breach alert, so the engine's warning
      // and this settlement are one notification about one challenge.
      dedupKey: `${accountId}:breach:${challengeId}`,
      data: { account_id: accountId, reason: reason ?? null, phase },
    };
  }
  return {
    type: 'phase_passed',
    severity: 'info',
    title: `${acct}: ${name} passed`,
    body: 'Target and trading days both met — add the next phase account to this challenge.',
    dedupKey: `${accountId}:phase_passed:${challengeId}`,
    data: { account_id: accountId, phase },
  };
}

// Explicit milestone for a manual phase advance (emitted by the advance route, not
// on ingest — passing a phase is an action, not a state threshold).
export function phasePassedAlert({ accountId, label, fromPhase, toPhase, challengeId }) {
  const acct = label || `Account ${accountId}`;
  return {
    type: 'phase_passed',
    severity: 'info',
    title: `${acct}: ${fromPhase === 'funded' ? 'challenge reset' : 'phase passed'}`,
    body: `Advanced to ${PHASE_LABEL[toPhase] ?? toPhase}.`,
    dedupKey: `${accountId}:phase_passed:${challengeId}`,
    data: { account_id: accountId, fromPhase, toPhase },
  };
}
