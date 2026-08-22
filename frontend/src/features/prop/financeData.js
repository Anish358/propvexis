// ---------------------------------------------------------------------------
// Prop OS › Finance — the data layer.
//
// ONE LEDGER, DERIVED ONCE. Everything the Finance module shows — the KPI rows,
// the ROI progression series, all four breakdowns, and the transaction table —
// is a projection of a single signed ledger built from the money that has
// actually moved: `payouts` (money IN, the trader's split) and `account_fees`
// (money OUT). Nothing here is mocked, and nothing is invented: every field on a
// ledger row traces to a column that already exists in the schema.
//
// WHY THE PAGE DERIVES INSTEAD OF FETCHING. `payouts`, `fees` and `accounts` are
// already in the router's outlet context (App fetches them for the whole app, and
// the first two are already narrowed to the selected account scope), and
// `GET /api/prop/finance` returns a subset of what this file computes. Deriving
// client-side means one source of truth for the module — a KPI card and a table
// row can never disagree about the same dollar — and the page respects the global
// account switcher with no second loading path.
//
// PURE AND REACT-FREE ON PURPOSE, so node:test can assert the arithmetic
// (test/finance-data.test.js) the same way it does for src/finance.js on the
// backend. The rule for this module: it decides the numbers, the components only
// format and arrange them.
// ---------------------------------------------------------------------------

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const DAY_MS = 24 * 60 * 60 * 1000;

// UTC calendar day (YYYY-MM-DD), matching src/finance.js's dayKey so a series
// computed here and one computed server-side bucket identically.
const dayOf = (ts) => {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

// The fee_type enum from db/migrations/0018_account_fees.sql, in the words the
// FeesModal already uses so a row reads the same wherever it is shown.
export const FEE_CATEGORY = {
  evaluation: 'Evaluation Fee',
  reset: 'Reset',
  activation: 'Activation Fee',
  other: 'Other',
};
export const PAYOUT_CATEGORY = 'Payout';

// account_type is 'eval' | 'funded' (0008_account_prop_fields.sql).
const CHALLENGE_LABEL = { eval: 'Evaluation', funded: 'Funded' };

// ---------------------------------------------------------------------------
// Scope. `accountId` is the global selection: 'all' (god view) or a comma-joined
// list of MT5 logins. Payouts and fees arrive already narrowed by the server, but
// `accounts` is the user's full list, so anything account-derived (funded capital,
// firm attribution) has to be narrowed here or a single-account view would report
// the whole portfolio's capital.
// ---------------------------------------------------------------------------

export function scopeLogins(accountId) {
  if (accountId == null || accountId === 'all') return null; // null = every account
  return String(accountId).split(',').map((s) => Number(s)).filter((n) => !Number.isNaN(n));
}

export function accountsInScope(accounts = [], accountId = 'all') {
  const logins = scopeLogins(accountId);
  if (!logins) return accounts;
  return accounts.filter((a) => logins.includes(Number(a.mt5_login)));
}

// ---------------------------------------------------------------------------
// The ledger.
//
// STATUS IS DERIVED FROM `source`, AND THAT IS A DELIBERATE SUBSTITUTION. The
// reference design carries a Reviewed / Not reviewed flag; the schema has no such
// column, and adding a review workflow is outside this module's scope — so rather
// than invent a field, the status reports the one distinction the data really
// makes. A 'manual' row was typed in by the trader, so it has been seen. An 'ea'
// or 'import' row was detected automatically (payouts.ingest reads a balance
// operation off the terminal), so nobody has confirmed it yet. That is exactly
// what "needs review" means here, and it is honest about which rows those are.
// ---------------------------------------------------------------------------

export function financeLedger({ payouts = [], fees = [], accounts = [], accountId = 'all' } = {}) {
  const inScope = accountsInScope(accounts, accountId);
  const acctByLogin = new Map(inScope.map((a) => [Number(a.mt5_login), a]));
  const logins = scopeLogins(accountId);
  const kept = (login) => !logins || logins.includes(Number(login));

  // An account row we can't see (deleted, or out of scope) still gets a readable
  // label rather than being dropped — the money moved either way.
  const meta = (login) => {
    const a = acctByLogin.get(Number(login));
    return {
      accountId: Number(login),
      account: a?.label || `Account ${login}`,
      firmId: a?.firm_id ?? null,
      firm: a?.firm_name || 'Other',
      challenge: CHALLENGE_LABEL[a?.account_type] || '—',
      size: a?.start_balance == null ? null : Number(a.start_balance),
    };
  };

  const statusOf = (source) => (source === 'manual' ? 'reviewed' : 'unreviewed');

  const rows = [
    ...payouts.filter((p) => kept(p.account_id)).map((p) => ({
      id: `payout:${p.id}`,
      date: p.payout_date,
      day: dayOf(p.payout_date),
      description: p.note || PAYOUT_CATEGORY,
      type: 'income',
      category: PAYOUT_CATEGORY,
      // The trader's split, not the gross withdrawal — the money that reached them.
      amount: round2(Number(p.trader_amount) || 0),
      source: p.source || 'manual',
      status: statusOf(p.source),
      note: p.note ?? null,
      ...meta(p.account_id),
    })),
    ...fees.filter((f) => kept(f.account_id)).map((f) => ({
      id: `fee:${f.id}`,
      date: f.fee_date,
      day: dayOf(f.fee_date),
      description: f.note || FEE_CATEGORY[f.fee_type] || 'Fee',
      type: 'expense',
      category: FEE_CATEGORY[f.fee_type] || FEE_CATEGORY.other,
      // Signed, so the column sums to the net the KPI row reports.
      amount: round2(-(Number(f.amount) || 0)),
      source: f.source || 'manual',
      status: statusOf(f.source),
      note: f.note ?? null,
      ...meta(f.account_id),
    })),
  ];

  // Newest first, with the id as a stable tiebreaker so the order never flickers
  // between renders for two rows stamped the same second.
  return rows.sort((a, b) => new Date(b.date) - new Date(a.date) || (a.id < b.id ? 1 : -1));
}

// ---------------------------------------------------------------------------
// Totals. Computed off the ledger rather than off payouts/fees directly, so a
// filtered table and its KPI row are guaranteed to describe the same rows.
//
//   earned = Σ income        spent = Σ |expense|        net = earned - spent
//   roiPct = net / spent * 100   (null until something has been spent — printing
//                                 0% with no outlay would be a claim, not a value)
// ---------------------------------------------------------------------------

export function financeTotals(ledger = []) {
  let earned = 0;
  let spent = 0;
  let income = 0;
  let expenses = 0;
  for (const r of ledger) {
    if (r.amount >= 0) { earned += r.amount; income += 1; } else { spent += -r.amount; expenses += 1; }
  }
  earned = round2(earned);
  spent = round2(spent);
  const net = round2(earned - spent);
  return {
    earned,
    spent,
    net,
    roiPct: spent > 0 ? round2((net / spent) * 100) : null,
    count: ledger.length,
    income,
    expenses,
    // Gross money moved in either direction — the "volume" behind a transaction
    // count, which a count alone doesn't give.
    volume: round2(earned + spent),
  };
}

// Spend in one fee category (drives a KPI's supporting line).
export function categoryTotal(ledger = [], category) {
  return round2(ledger.filter((r) => r.category === category).reduce((s, r) => s + Math.abs(r.amount), 0));
}

// ---------------------------------------------------------------------------
// Funded capital — capital actually under management. The same two exclusions
// businessKpis() applies on the backend (src/propOverview.js): evaluation
// accounts aren't yours to trade until you pass, and a deactivated account isn't
// being traded at all. Breach state lives in the challenge engine, which this
// module has no access to, so an account whose rules have broken is still counted
// here; the figure is "funded capital configured", and the Overview's Total
// Funding remains the engine-aware number.
// ---------------------------------------------------------------------------

export function fundedCapital(accounts = [], accountId = 'all') {
  const funded = accountsInScope(accounts, accountId)
    .filter((a) => a.account_type === 'funded' && a.is_active !== false);
  return {
    capital: round2(funded.reduce((s, a) => s + (Number(a.start_balance) || 0), 0)),
    accounts: funded.length,
  };
}

// ---------------------------------------------------------------------------
// ROI progression — cumulative earned / spent / net through each day that had
// money move. One point per calendar day (same-day events collapse to the day's
// closing totals), which is what makes the line read as a running balance rather
// than as a scatter of individual transactions.
// ---------------------------------------------------------------------------

export function roiSeries(ledger = []) {
  const days = [...ledger]
    .filter((r) => r.day)
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  if (!days.length) return [];

  const points = [];
  let earned = 0;
  let spent = 0;
  for (const r of days) {
    if (r.amount >= 0) earned += r.amount; else spent += -r.amount;
    const net = earned - spent;
    const point = {
      date: r.day,
      earned: round2(earned),
      spent: round2(spent),
      net: round2(net),
      roiPct: spent > 0 ? round2((net / spent) * 100) : null,
    };
    if (points.length && points[points.length - 1].date === r.day) points[points.length - 1] = point;
    else points.push(point);
  }
  return points;
}

export const RANGES = [
  { value: '1W', label: '1W', days: 7 },
  { value: '1M', label: '1M', days: 30 },
  { value: '1Y', label: '1Y', days: 365 },
  { value: 'ALL', label: 'All', days: null },
];

// Clip a cumulative series to a trailing window.
//
// THE POINT BEFORE THE WINDOW IS CARRIED IN as the window's opening value, which
// is the difference between a cumulative chart and a periodic one: drop it and a
// 1W view of an account that earned $8k last year and nothing this week would
// draw an empty chart instead of a flat line at $8k. `asOf` is injected so the
// clipping is testable against a fixed date.
export function clipSeries(series = [], range = 'ALL', asOf = new Date()) {
  const spec = RANGES.find((r) => r.value === range);
  if (!spec || spec.days == null || series.length === 0) return series;
  const from = dayOf(new Date(asOf).getTime() - spec.days * DAY_MS);
  const inside = series.filter((p) => p.date >= from);
  if (inside.length === series.length) return series;

  const before = series.filter((p) => p.date < from);
  const opening = before[before.length - 1];
  if (!opening) return inside;
  // Restamped to the window's first day so the axis starts where the range says.
  return [{ ...opening, date: from }, ...inside];
}

// ---------------------------------------------------------------------------
// Breakdowns. Four dimensions over the same ledger; each returns the same shape,
// so the card renders one list and one ring regardless of which is selected.
//
// THE RING IS ALWAYS A SHARE OF SPEND, and the list beside it always carries
// spent / earned / net. That pairing is chosen rather than incidental: a ring can
// only draw non-negative magnitudes, and net is routinely negative (an account in
// evaluation has spent and earned nothing). Spend is the one figure that is always
// non-negative and always answers a real question — "where is the money going?" —
// while the earned and net halves are read off the list, where a minus sign is
// legible. One semantic across all four tabs, so switching tabs never silently
// changes what the ring means.
// ---------------------------------------------------------------------------

export const BREAKDOWN_DIMS = [
  { value: 'firm', label: 'By Firm' },
  { value: 'type', label: 'By Account Type' },
  { value: 'size', label: 'By Account Size' },
  { value: 'expenses', label: 'Expenses' },
];

// Account size reads as the size a trader bought — "$100K" — not as a bucket
// range, because that is the number on the firm's checkout page.
export function sizeLabel(n) {
  if (n == null || !Number.isFinite(Number(n))) return 'Unspecified';
  const v = Number(n);
  if (v >= 1_000_000) return `$${round2(v / 1_000_000)}M`;
  if (v >= 1000) return `$${Math.round(v / 1000)}K`;
  return `$${Math.round(v)}`;
}

// How each dimension keys and names a row. `expenses` groups by fee category and
// so has no earnings by construction — every row in it is money out.
const DIMENSIONS = {
  firm: { key: (r) => r.firmId ?? '__other__', label: (r) => r.firm },
  type: { key: (r) => r.challenge, label: (r) => r.challenge },
  size: { key: (r) => (r.size == null ? '__unspecified__' : String(r.size)), label: (r) => sizeLabel(r.size) },
  expenses: { key: (r) => r.category, label: (r) => r.category, only: 'expense' },
};

export function financeBreakdown(ledger = [], dim = 'firm') {
  const spec = DIMENSIONS[dim] || DIMENSIONS.firm;
  const rows = spec.only ? ledger.filter((r) => r.type === spec.only) : ledger;

  const buckets = new Map();
  for (const r of rows) {
    const key = spec.key(r);
    if (!buckets.has(key)) buckets.set(key, { key: String(key), label: spec.label(r), spent: 0, earned: 0, count: 0 });
    const b = buckets.get(key);
    if (r.amount >= 0) b.earned += r.amount; else b.spent += -r.amount;
    b.count += 1;
  }

  const slices = [...buckets.values()]
    .map((b) => {
      const earned = round2(b.earned);
      const spent = round2(b.spent);
      return { ...b, earned, spent, net: round2(earned - spent) };
    })
    // Biggest spend first (that is what the ring orders by), then by net so two
    // zero-spend rows still land in a meaningful order.
    .sort((a, b) => b.spent - a.spent || b.net - a.net || a.label.localeCompare(b.label));

  const spent = round2(slices.reduce((s, b) => s + b.spent, 0));
  const earned = round2(slices.reduce((s, b) => s + b.earned, 0));
  return {
    dim,
    slices: slices.map((b) => ({ ...b, share: spent > 0 ? round2((b.spent / spent) * 100) : 0 })),
    spent,
    earned,
    net: round2(earned - spent),
  };
}

// ---------------------------------------------------------------------------
// Table filtering. The four views mirror the questions the table is opened with,
// and `search` spans every text column a trader would recall a row by — firm,
// account, challenge, description and category — so one box covers all of them
// without a field picker.
// ---------------------------------------------------------------------------

export const LEDGER_VIEWS = [
  { value: 'all', label: 'All Transactions' },
  { value: 'income', label: 'Income' },
  { value: 'expenses', label: 'Expenses' },
  { value: 'review', label: 'Needs Review' },
];

const MATCHES_VIEW = {
  all: () => true,
  income: (r) => r.type === 'income',
  expenses: (r) => r.type === 'expense',
  review: (r) => r.status === 'unreviewed',
};

export function filterLedger(ledger = [], { view = 'all', search = '', categories = [], firms = [] } = {}) {
  const inView = MATCHES_VIEW[view] || MATCHES_VIEW.all;
  const q = String(search).trim().toLowerCase();
  const cats = new Set(categories);
  const frms = new Set(firms.map((f) => String(f)));

  return ledger.filter((r) => {
    if (!inView(r)) return false;
    if (cats.size && !cats.has(r.category)) return false;
    if (frms.size && !frms.has(String(r.firmId ?? '__other__'))) return false;
    if (!q) return true;
    return [r.firm, r.account, r.challenge, r.description, r.category]
      .some((v) => String(v ?? '').toLowerCase().includes(q));
  });
}

// The choices the Filters menu offers — read off the data in view, so it can never
// list a category the trader has no rows for.
export function ledgerFilterOptions(ledger = []) {
  const categories = [...new Set(ledger.map((r) => r.category))].sort();
  const firms = new Map();
  for (const r of ledger) firms.set(String(r.firmId ?? '__other__'), r.firm);
  return {
    categories,
    firms: [...firms.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  };
}
