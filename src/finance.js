import { round2 } from './derive.js';

// Prop finance summary — the money view of a scope. Pure (no DB) so it's unit-
// testable and shared by the /api/prop/finance route and the report.
//
//   earned = Σ payout trader_amount   (net to the trader, after split)
//   spent  = Σ fee amount             (evaluation / reset / activation / other)
//   net    = earned - spent
//   roiPct = net / spent * 100        (null when nothing has been spent yet)
//
// byFirm groups the same figures per prop firm, attributing each payout/fee to
// its account's firm_id (accounts map login → firm). Accounts with no firm set
// (custom / pre-template) fall into a single "Other" bucket.

const FIRM_OTHER = { id: null, name: 'Other' };

const roi = (net, spent) => (spent > 0 ? round2((net / spent) * 100) : null);

function emptyBucket(firmId, firmName) {
  return { firmId, firmName, spent: 0, earned: 0, net: 0, roiPct: null, count: 0 };
}

export function financeSummary({ payouts = [], fees = [], accounts = [] }) {
  // login (account_id) → { id, name } of its firm.
  const firmByLogin = new Map();
  for (const a of accounts) {
    firmByLogin.set(Number(a.mt5_login), {
      id: a.firm_id ?? FIRM_OTHER.id,
      name: a.firm_name || FIRM_OTHER.name,
    });
  }
  const firmFor = (login) => firmByLogin.get(Number(login)) || FIRM_OTHER;

  const earned = round2(payouts.reduce((s, p) => s + (Number(p.trader_amount) || 0), 0));
  const spent = round2(fees.reduce((s, f) => s + (Number(f.amount) || 0), 0));
  const net = round2(earned - spent);

  // Group per firm (keyed by firmId, null → 'other' key).
  const buckets = new Map();
  const bucket = (login) => {
    const firm = firmFor(login);
    const key = firm.id ?? '__other__';
    if (!buckets.has(key)) buckets.set(key, emptyBucket(firm.id, firm.name));
    return buckets.get(key);
  };
  for (const p of payouts) { const b = bucket(p.account_id); b.earned += Number(p.trader_amount) || 0; b.count += 1; }
  for (const f of fees)    { const b = bucket(f.account_id); b.spent  += Number(f.amount) || 0;        b.count += 1; }

  const byFirm = [...buckets.values()]
    .map((b) => {
      const bEarned = round2(b.earned);
      const bSpent = round2(b.spent);
      const bNet = round2(bEarned - bSpent);
      return { ...b, earned: bEarned, spent: bSpent, net: bNet, roiPct: roi(bNet, bSpent) };
    })
    .sort((a, b) => b.net - a.net);

  return { spent, earned, net, roiPct: roi(net, spent), byFirm };
}

// UTC calendar day (YYYY-MM-DD) of a timestamp, for daily buckets.
const dayKey = (ts) => new Date(ts).toISOString().slice(0, 10);

// Cumulative money-over-time series for the ROI-progression chart: one point per
// calendar day that had a fee or payout, carrying the running totals THROUGH that
// day. `earned` = cumulative payout trader_amount, `spent` = cumulative fees,
// `net = earned - spent`, `roiPct = net/spent*100` (null until something's spent).
// Pure; empty inputs → []. The chart draws earned / spent / net lines over `date`.
export function roiProgression({ payouts = [], fees = [] }) {
  const events = [
    ...payouts.map((p) => ({ day: dayKey(p.payout_date), earned: Number(p.trader_amount) || 0, spent: 0 })),
    ...fees.map((f) => ({ day: dayKey(f.fee_date), earned: 0, spent: Number(f.amount) || 0 })),
  ].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  if (!events.length) return [];

  const points = [];
  let earned = 0;
  let spent = 0;
  for (const e of events) {
    earned += e.earned;
    spent += e.spent;
    const net = earned - spent;
    const point = { date: e.day, earned: round2(earned), spent: round2(spent), net: round2(net), roiPct: roi(net, spent) };
    // Collapse multiple same-day events into one point (keep the last = end of day).
    if (points.length && points[points.length - 1].date === e.day) points[points.length - 1] = point;
    else points.push(point);
  }
  return points;
}
