// Alert derivation (Phase 9). PURE: turns one account's engine state (challengeState
// from prop.js) into the set of alerts currently "crossed", each carrying a
// dedup_key that scopes it to the right cycle so it fires once, not on every tick:
//   • breach / max-DD / target  -> per challenge  (keyed by challengeId)
//   • daily-DD proximity         -> per day        (keyed by the day)
//   • trading-days met           -> per cycle       (keyed by the cycle start)
// The caller (server ingest paths) inserts these ON CONFLICT (user_id, dedup_key)
// DO NOTHING and emits only genuinely-new rows. No DB access here — fully testable.

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
  if (state.profitTarget?.reached) {
    out.push({
      type: 'target_reached',
      severity: 'info',
      title: `${acct}: profit target reached`,
      body: `Profit target of ${money(state.profitTarget.target)} reached — you can pass this phase.`,
      dedupKey: `${accountId}:target_reached:${challengeId}`,
      data: { account_id: accountId },
    });
  }
  return out;
}

// Explicit milestone for a manual phase advance (emitted by the advance route, not
// on ingest — passing a phase is an action, not a state threshold).
export function phasePassedAlert({ accountId, label, fromPhase, toPhase, challengeId }) {
  const acct = label || `Account ${accountId}`;
  return {
    type: 'phase_passed',
    severity: 'info',
    title: `${acct}: ${fromPhase === 'funded' ? 'challenge reset' : 'phase passed'}`,
    body: `Advanced to ${toPhase === 'funded' ? 'Funded' : toPhase === 'p2' ? 'Phase 2' : 'Phase 1'}.`,
    dedupKey: `${accountId}:phase_passed:${challengeId}`,
    data: { account_id: accountId, fromPhase, toPhase },
  };
}
