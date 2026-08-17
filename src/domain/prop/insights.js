import { round2 } from '../trades/derive.js';

// Passing & breach insights (Prop OS Overview) — pass rates and breach patterns
// across dimensions (firm / account size / phase), computed from the retained
// challenge history. Pure (no DB) so it's unit-testable and mirrors finance.js.
//
// A challenge row is one phase attempt: status 'active' | 'passed' | 'breached'.
// Only CLOSED attempts (passed|breached) count toward a pass rate; active ones
// are in-progress. passRate = passed / (passed + breached) * 100 (null when none
// closed yet). breachReasons tally the persisted reason on breached rows
// ('max_dd' | 'daily_dd' | 'unspecified' when the reset didn't record one).

const passRateOf = (passed, breached) => {
  const closed = passed + breached;
  return closed > 0 ? round2((passed / closed) * 100) : null;
};

// Human size label: 50000 -> "50K".
const sizeLabel = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return 'Unknown';
  return v >= 1000 ? `${v / 1000}K` : String(v);
};

const PHASE_LABEL = { p1: 'Phase 1', p2: 'Phase 2', funded: 'Funded' };

// Group challenges by a key function, tallying pass/breach/active per bucket.
function groupBy(challenges, keyFn, labelFn) {
  const buckets = new Map();
  for (const c of challenges) {
    const key = keyFn(c);
    const k = key == null ? '__none__' : String(key);
    if (!buckets.has(k)) buckets.set(k, { key: key ?? null, label: labelFn(c, key), passed: 0, breached: 0, active: 0 });
    const b = buckets.get(k);
    if (c.status === 'passed') b.passed += 1;
    else if (c.status === 'breached') b.breached += 1;
    else b.active += 1;
  }
  return [...buckets.values()]
    .map((b) => ({ ...b, attempts: b.passed + b.breached, passRate: passRateOf(b.passed, b.breached) }))
    .sort((a, b) => b.attempts - a.attempts || b.passed - a.passed);
}

export function passBreachSummary(challenges = []) {
  let passed = 0;
  let breached = 0;
  let active = 0;
  const reasons = new Map();
  for (const c of challenges) {
    if (c.status === 'passed') passed += 1;
    else if (c.status === 'breached') {
      breached += 1;
      const r = c.breach_reason || 'unspecified';
      reasons.set(r, (reasons.get(r) || 0) + 1);
    } else active += 1;
  }

  const breachReasons = [...reasons.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  return {
    attempts: passed + breached, // closed attempts
    passed,
    breached,
    active,
    passRate: passRateOf(passed, breached),
    breachReasons,
    byFirm: groupBy(challenges, (c) => c.firm_id ?? null, (c) => c.firm_name || 'Other'),
    bySize: groupBy(challenges, (c) => c.start_balance ?? null, (c) => sizeLabel(c.start_balance)),
    byPhase: groupBy(challenges, (c) => c.phase, (c) => PHASE_LABEL[c.phase] || c.phase),
  };
}
