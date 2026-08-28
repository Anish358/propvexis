// Reports (V1) — composes the two finished modules (Journal analytics + Prop OS
// challenge state) plus payouts into ONE exportable payload for a resolved scope.
// Composition only: it calls the existing engines (aggregations.js, prop.js) and
// data-access layers — no new analytics math, no new tables. See CLAUDE.md.
import { computeStats, computeYearly } from './aggregations.js';
import { challengeState } from '../prop/prop.js';
import { currentChallengesByLogin, tradesForEngine, equitySnapshotsForEngine } from '../prop/challenges.js';
import { listPayouts } from '../finance/payouts.js';
import { listFees } from '../finance/fees.js';
import { financeSummary } from '../finance/finance.js';
import { listAccounts } from '../accounts/accounts.js';
import { round2 } from '../trades/derive.js';

// The Prop OS state for a scope — extracted verbatim from the /api/prop route so
// the report and the live Prop OS page share ONE composition. Single account →
// one state object; god → { god:true, accounts:[...] }; empty → matches /api/prop.
export async function propStatesForScope(scope, asOf = new Date()) {
  const logins = scope.logins;
  if (!logins.length) return scope.god ? { god: true, accounts: [] } : null;

  const [challenges, trades, snaps, payouts, accts] = await Promise.all([
    currentChallengesByLogin(logins),
    tradesForEngine(logins),
    equitySnapshotsForEngine(logins),
    listPayouts(logins),
    listAccounts(scope.userId),
  ]);
  const acctByLogin = new Map(accts.map((a) => [a.mt5_login, a]));
  const groupBy = (arr) => {
    const m = new Map();
    for (const x of arr) { if (!m.has(x.account_id)) m.set(x.account_id, []); m.get(x.account_id).push(x); }
    return m;
  };
  const tByLogin = groupBy(trades);
  const sByLogin = groupBy(snaps);
  const pByLogin = groupBy(payouts);

  const build = (login) => {
    const acct = acctByLogin.get(login);
    const challenge = challenges.get(login);
    const meta = { account_id: login, label: acct?.label ?? null, currency: acct?.currency ?? 'USD' };
    if (!challenge) return { ...meta, challenge: null };
    const live = acct?.equity ?? acct?.balance ?? null;
    const state = challengeState({
      challenge,
      trades: tByLogin.get(login) ?? [],
      payouts: pByLogin.get(login) ?? [],
      snapshots: sByLogin.get(login) ?? [],
      live,
      asOf,
    });
    return { ...meta, challengeId: challenge.id, ...state };
  };

  if (!scope.god) return build(logins[0]);
  return { god: true, accounts: logins.map(build) };
}

// Assemble the full report for a scope. Reuses computeStats/computeYearly (Journal),
// propStatesForScope (Prop OS) and listPayouts (with totals summed here — payouts.js
// has no total helper). `meta.generatedAt` is stamped by the route, not here.
export async function buildReport(scope, { unit = 'R', filters = {}, beRound = false, year } = {}) {
  const yr = Number(year) || new Date().getUTCFullYear();
  const [stats, yearly, prop, payoutRows, feeRows, accounts] = await Promise.all([
    computeStats(scope, unit, filters, beRound),
    computeYearly(yr, scope, unit, filters, beRound),
    propStatesForScope(scope),
    listPayouts(scope.logins),
    listFees(scope.logins),
    listAccounts(scope.userId),
  ]);
  const grossTotal = round2(payoutRows.reduce((s, p) => s + Number(p.gross_amount || 0), 0));
  const traderTotal = round2(payoutRows.reduce((s, p) => s + Number(p.trader_amount || 0), 0));
  const inScope = accounts.filter((a) => scope.logins.includes(a.mt5_login));
  const finance = financeSummary({ payouts: payoutRows, fees: feeRows, accounts: inScope });
  return {
    meta: { unit, filters, year: yr, god: scope.god },
    stats,
    yearly,
    prop,
    payouts: { rows: payoutRows, grossTotal, traderTotal, count: payoutRows.length },
    fees: { rows: feeRows, total: finance.spent, count: feeRows.length },
    finance,
  };
}

// Minimal RFC-4180-ish CSV. `rows` is an array of arrays of primitives; a value
// containing a comma, quote, or newline is quoted with quotes doubled. No lib.
export function toCsv(rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(',')).join('\r\n');
}

// Flatten a report into sectioned CSV rows (headline KPIs, per-setup/instrument
// breakdowns, prop summary, payouts). Blank rows separate sections.
export function reportCsvRows(report) {
  const rows = [];
  const { meta, stats, prop, payouts } = report;
  rows.push(['Report', `unit=${meta.unit}`, `year=${meta.year}`, meta.god ? 'god view' : 'single account']);
  rows.push([]);

  const h = stats?.headline ?? {};
  rows.push(['Performance']);
  rows.push(['metric', 'value']);
  for (const k of ['unit', 'totalReturn', 'strikeRate', 'trades', 'wins', 'losses', 'breakeven',
    'avgWin', 'avgLoss', 'profitFactor', 'expectancy', 'winStreak', 'lossStreak']) {
    rows.push([k, h[k] ?? '']);
  }
  rows.push([]);

  const breakdown = (title, arr) => {
    if (!arr?.length) return;
    rows.push([title]);
    rows.push(['key', 'trades', 'wins', 'losses', 'breakeven', 'strikeRate', meta.unit]);
    for (const g of arr) rows.push([g.key, g.trades, g.wins, g.losses, g.breakeven, g.sr, g.r]);
    rows.push([]);
  };
  breakdown('By setup', stats?.bySetup);
  breakdown('By instrument', stats?.byInstrument);

  // Prop summary — one row per account (god) or the single account.
  const accts = prop?.god ? prop.accounts : (prop ? [prop] : []);
  const withChallenge = accts.filter((a) => a && a.phase);
  if (withChallenge.length) {
    rows.push(['Prop status']);
    rows.push(['account', 'phase', 'equity', 'health', 'maxDD room', 'dailyDD room', 'profit target %', 'trading days', 'breached']);
    for (const a of withChallenge) {
      rows.push([
        a.label ?? a.account_id, a.phase, a.currentEquity,
        a.health?.score ?? '',
        a.maxDd?.roomLeft ?? '', a.dailyDd?.roomLeft ?? '',
        a.profitTarget?.pctToTarget ?? '',
        a.tradingDays ? `${a.tradingDays.completed}/${a.tradingDays.required}` : '',
        a.breach?.breached ? (a.breach.reason || 'yes') : 'no',
      ]);
    }
    rows.push([]);
  }

  rows.push(['Payouts', `count=${payouts.count}`, `gross=${payouts.grossTotal}`, `trader=${payouts.traderTotal}`]);
  if (payouts.rows.length) {
    rows.push(['date', 'gross', 'split %', 'trader', 'source', 'note']);
    for (const p of payouts.rows) {
      rows.push([p.payout_date, p.gross_amount, p.split_pct, p.trader_amount, p.source, p.note ?? '']);
    }
  }
  rows.push([]);

  // Finance summary — spend vs earnings → net + ROI, with a by-firm breakdown.
  const fin = report.finance;
  if (fin) {
    rows.push(['Finance', `spent=${fin.spent}`, `earned=${fin.earned}`, `net=${fin.net}`, `roi%=${fin.roiPct ?? ''}`]);
    if (fin.byFirm.length) {
      rows.push(['firm', 'spent', 'earned', 'net', 'roi %', 'accounts']);
      for (const f of fin.byFirm) rows.push([f.firmName, f.spent, f.earned, f.net, f.roiPct ?? '', f.count]);
    }
  }
  return rows;
}
