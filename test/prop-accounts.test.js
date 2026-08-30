import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readSrc } from './helpers/src-files.js';
import { legacyCss } from './helpers/app-css.js';
import { httpLayer, sourceOf } from './helpers/backend-src.js';
import { NAV, navRoutes, navTitle, SINGLE_ACCOUNT_ROUTES, isSingleAccountRoute } from '../frontend/src/app/nav.js';
import {
  ACCOUNT_TABS, PORTFOLIO_TABS, bucketAccounts, equitySeries, selectedLogin, accountRow,
} from '../frontend/src/features/prop/propAccounts.js';
import { passedChallenges, accountsBreakdown } from '../src/domain/prop/propOverview.js';

// Prop OS › Accounts. Two halves, asserted separately: the DERIVATION (bucketing,
// the equity series, which account Details is on), which is real arithmetic
// imported and run; and the locked INFORMATION ARCHITECTURE plus the reuse rules,
// which a source-reading test is what protects. Files are read by BASENAME so the
// assertions survive a move — see helpers/src-files.js for why that matters.

const page = readSrc('PropAccounts.jsx');
const card = readSrc('AccountPortfolioCard.jsx');
const workspace = readSrc('AccountWorkspace.jsx');
const details = readSrc('AccountDetails.jsx');
const kpis = readSrc('AccountKpiCards.jsx');
const dash = readSrc('Dashboard.jsx');
const topbar = readSrc('FilterBar.jsx');
const app = readSrc('App.jsx');

// The Accounts CSS block, bounded at BOTH ends. It used to be sliced to the end of
// the stylesheet, which was true only while Accounts was the last block in the file;
// Prop OS > Challenges now follows it, and an unbounded slice would read that
// module's `pc-` selectors as this one's namespace violations.
const accountsCssBlock = () => {
  const start = legacyCss.indexOf('Prop OS › Accounts');
  const end = legacyCss.indexOf('Prop OS › Challenges');
  assert.ok(start !== -1, 'the Accounts CSS block should exist');
  return legacyCss.slice(start, end === -1 ? undefined : end);
};

// ---------------------------------------------------------------------------
// The locked IA
// ---------------------------------------------------------------------------

test('Accounts has exactly two main tabs, in order', () => {
  assert.deepEqual(ACCOUNT_TABS, [
    { value: 'portfolio', label: 'Portfolio' },
    { value: 'details', label: 'Details' },
  ]);
});

test('Portfolio has exactly four status sub-tabs, in lifecycle order', () => {
  assert.deepEqual(PORTFOLIO_TABS.map((t) => t.value), ['evaluation', 'funded', 'passed', 'breached']);
  assert.deepEqual(PORTFOLIO_TABS.map((t) => t.label), ['Evaluation', 'Funded', 'Passed', 'Breached']);
});

test('both tab rows are the app\'s one switcher primitive, not a new tab style', () => {
  assert.match(page, /import \{[^}]*\bTabs\b[^}]*\} from '@\/components\/primitives'/s);
  assert.match(page, /<Tabs className="pa-tabs" tabs=\{ACCOUNT_TABS\}/);
  assert.match(page, /<Tabs className="pa-slices" tabs=\{sliceTabs\}/);
  // Switching is local state, so no reload and no route churn.
  assert.match(page, /const \[tab, setTab\] = useState\('portfolio'\)/);
  assert.match(page, /const \[slice, setSlice\] = useState\('evaluation'\)/);
});

test('Accounts is one route, and it is no longer a Coming Soon stub', () => {
  const item = NAV.find((i) => i.base === '/prop').children.find((c) => c.to === '/prop/accounts');
  assert.notEqual(item.soon, true, 'Accounts should be a real page now');
  assert.deepEqual(navTitle('/prop/accounts'), { module: 'Prop OS', page: 'Accounts' });
  assert.ok(navRoutes().includes('/prop/accounts'));
  assert.ok(!navRoutes().some((r) => r.startsWith('/prop/accounts/')), 'two tabs must not become two routes');
  assert.match(app, /<Route path="accounts" element=\{<PropAccounts \/>\} \/>/);
  assert.equal((app.match(/element=\{<PropAccounts/g) || []).length, 1);
  assert.ok(!/ComingSoon title="Prop Accounts"/.test(app), 'the stub is gone');
});

test('Details holds exactly the six locked sections, and nothing else', () => {
  const body = workspace.slice(workspace.indexOf('export default function AccountWorkspace'));
  for (const section of [
    '<SelectedAccountHeader', '<EquityCard', '<AccountDetails', '<EquityCurveCard',
    '<RecentTrades', '<MonthCalendar',
  ]) {
    assert.ok(body.includes(section), `Details is missing ${section}`);
  }
  // Nothing from the explicitly-excluded V1 scope crept in.
  for (const invented of ['Modal', 'Compare', 'Score', 'Forecast', 'onDelete', 'onCreate']) {
    assert.ok(!body.includes(invented), `Details must not add ${invented}`);
  }
});

// ---------------------------------------------------------------------------
// One source of truth for the selected account
// ---------------------------------------------------------------------------

test('Details adds NO account switcher — the universal top-bar one is it', () => {
  // The whole point: a second selector would be a second source of truth, and a
  // trader would have no way to tell which one the figures belonged to.
  // Matched as JSX usage, not as a substring: this file's own
  // `SelectedAccountHeader` is a read-only label for the current account and
  // deliberately contains the word.
  for (const switcher of ['<AccountSwitcher', '<AccountHeader', '<Menu', '<MenuCheckboxItem', '<select']) {
    assert.ok(!workspace.includes(switcher), `Details must not contain ${switcher}`);
  }
  assert.ok(!/onSelect|setAccountId/.test(workspace), 'Details never writes the selection — it reads it');
  assert.ok(!page.includes('AccountSwitcher'), 'the page must not mount a second switcher either');
});

test('selecting a card writes to the app-wide selection, then flips to Details', () => {
  assert.match(page, /const select = \(login\) => \{\s*setAccountId\(String\(login\)\);\s*setTab\('details'\);/);
  // Both card kinds offer it, and both go through that one function.
  assert.match(page, /<AccountPortfolioCard[^>]*onSelect=\{\(\) => select\(r\.accountId\)\}/s);
  assert.match(page, /<PassedAccountCard[^>]*onSelect=\{\(\) => select\(r\.accountId\)\}/s);
  assert.match(card, /<Button variant="secondary" size="sm" onClick=\{onSelect\}>Select<\/Button>/);
  assert.equal((card.match(/>Select</g) || []).length, 2, 'every card kind has a Select action');
  // No local selected-account state anywhere — that would be the second source.
  assert.ok(!/useState\([^)]*selectedAccount/i.test(page));
});

test('the switcher is single-select on this route, and the IA is where that is declared', () => {
  // Challenges > Details joined the list when that module was built: a challenge is
  // one account plus its phase rows, so it is a single-account workspace for the same
  // reason. See nav.js — and test/prop-challenges.test.js, which asserts its half.
  assert.deepEqual(SINGLE_ACCOUNT_ROUTES, ['/prop/accounts', '/prop/challenges']);
  assert.equal(isSingleAccountRoute('/prop/accounts'), true);
  assert.equal(isSingleAccountRoute('/prop/accounts/'), true, 'a trailing slash is the same page');
  // ...and ONLY on the single-account workspaces: multi-select is the default
  // everywhere else, because an aggregate view across accounts is what god view is for.
  for (const other of ['/prop', '/prop/finance', '/', '/journal/trades']) {
    assert.equal(isSingleAccountRoute(other), false, `${other} must keep multi-select`);
  }
  // The bar reads the IA rather than a page reaching up to reconfigure it.
  assert.match(topbar, /import \{ navTitle, isSingleAccountRoute \} from '[^']*nav\.js'/);
  assert.match(topbar, /const singleAccount = isSingleAccountRoute\(pathname\)/);
  assert.match(topbar, /singleSelect=\{singleAccount\}/);
});

test('single-select replaces the selection and says so semantically', () => {
  // A MenuItem, not a checkbox item that behaves differently — a screen reader is
  // told it is a one-of-many choice rather than told "checkbox" and then finding
  // the other boxes clear themselves.
  assert.match(topbar, /const pick = \(login\) => setAccountId\(String\(login\)\)/);
  assert.match(topbar, /singleSelect \? \(\s*<MenuItem/s);
  // The multi-select path is untouched for every other route.
  assert.match(topbar, /<MenuCheckboxItem[\s\S]*?onCheckedChange=\{\(\) => toggle\(a\.mt5_login\)\}/);
  // "All accounts" survives in both modes: god view is still a valid scope.
  assert.match(topbar, /onClick=\{\(\) => setAccountId\(GOD\)\}/);
});

// ---------------------------------------------------------------------------
// Reuse, not reinvention
// ---------------------------------------------------------------------------

test('Account Details is ONE component, shared with the Dashboard', () => {
  // The rule that this module could most easily break: a second, drifting copy of
  // the Dashboard's drawdown / profit-target treatment.
  assert.match(dash, /import AccountDetails from '[^']*AccountDetails\.jsx'/);
  assert.match(workspace, /import AccountDetails from '[^']*AccountDetails\.jsx'/);
  // The meters exist in exactly one file.
  assert.match(details, /export function UsageMeter/);
  assert.ok(!dash.includes('function UsageMeter'), 'the Dashboard must not keep a copy');
  assert.ok(!workspace.includes('function UsageMeter'), 'Details must not grow one');
  // Same three rules, same labels, same order as the Dashboard always had.
  const labels = [...details.matchAll(/label=\{?["']([^"'}]+)/g)].map((m) => m[1]);
  assert.deepEqual(labels.slice(0, 2), ['Daily drawdown', 'Max drawdown']);
  assert.match(details, /'Payout target' : 'Profit target'/);
});

test('target editing is handed IN, so a view without that flow does not get it', () => {
  // Setting a payout target is account EDITING, which is outside Accounts' locked
  // V1 scope — but that must not fork the component.
  assert.match(details, /onSetTarget = null/);
  assert.match(dash, /onSetTarget=\{acctRecord \? \(\) => setTargetOpen\(true\) : null\}/);
  assert.match(workspace, /<AccountDetails data=\{data\} \/>/);
});

test('Recent Trades is the Dashboard\'s table, moved rather than copied', () => {
  const recent = readSrc('RecentTrades.jsx');
  assert.match(dash, /import RecentTrades from '[^']*RecentTrades\.jsx'/);
  assert.match(workspace, /import RecentTrades from '[^']*RecentTrades\.jsx'/);
  assert.ok(!dash.includes('function RecentTrades'), 'the Dashboard must not keep a copy');
  /* WAS `className="jo-recent-table"`. The list is Panel* primitives since the
   * 2026-08-28 rebuild, so the class is gone — but what this test protects is that
   * BOTH surfaces render the same component, not which class it wears. Pinned on the
   * shared row primitive instead, which is the thing that would actually have to be
   * duplicated for the two to drift. */
  // PanelTableRow since the Rhea rebuild (was PanelRow) — same point: the shared row
  // primitive is the thing that would have to be duplicated for the two to drift.
  assert.match(recent, /<PanelTableRow key=\{t\.id\} cols=\{COLS\}>/, 'one list component, two surfaces');
  // The only difference between the two call sites is a row count, not a design.
  assert.match(recent, /limit = 6/);
  assert.match(workspace, /limit=\{14\}/);
  // "View all" reuses the existing Trade Log route rather than inventing navigation.
  assert.match(workspace, /to="\/journal\/trades"/);
});

test('the KPI tiles borrow the locked master-card geometry', () => {
  // Net P&L in KpiCards.jsx is the locked master: every tile matches its
  // dimensions and the content adapts to the container, never the reverse.
  const tiles = kpis.match(/className="dash-stat[^"]*"/g) || [];
  assert.ok(tiles.length >= 1);
  for (const t of tiles) assert.match(t, /dash-stat--typo-match/);
  assert.match(kpis, /spacing="none"/);
  assert.ok(!/(width|height|padding|font-size):/i.test(kpis), 'no inline sizing on a locked card');
  // Three tiles reused verbatim from the Dashboard's set, three new account-state
  // ones — the row is six, and --kpi-count splits it like every other KPI row.
  assert.match(workspace, /import \{ NetPnlCard, TradeWinCard, ProfitFactorCard \} from '[^']*KpiCards\.jsx'/);
  assert.match(workspace, /'--kpi-count': 6/);
  assert.match(workspace, /className="jo-kpis dash-stats"/);
});

test('the calendar and the charting library are the app\'s existing ones', () => {
  assert.match(workspace, /import MonthCalendar from '[^']*MonthCalendar\.jsx'/);
  assert.match(workspace, /from 'recharts'/);
  // Chart colour comes from the token layer, never a literal (DESIGN-LANGUAGE §12).
  assert.match(workspace, /import \{ chartPalette \} from '[^']*theme\.js'/);
  for (const f of [workspace, card, kpis, details]) {
    assert.ok(!/#[0-9a-f]{3,8}\b/i.test(f), 'no raw colour value in a component');
  }
});

test('the drawdown thresholds are the shared ones, not a second set', () => {
  // A card and the Details section it opens can never disagree about "at risk".
  assert.match(card, /import \{ roomStatus, healthStatus \} from '[^']*PropOS\.jsx'/);
  assert.match(details, /import \{ roomStatus \} from '[^']*PropOS\.jsx'/);
  assert.match(workspace, /import \{ healthStatus \} from '[^']*PropOS\.jsx'/);
  for (const f of [card, workspace, details]) {
    assert.ok(!/function roomStatus|function healthStatus/.test(f), 'thresholds must not be re-derived');
  }
});

test('status is a word plus a colour, never a colour alone', () => {
  // The rule the whole Prop OS surface follows — green/red alone is the classic
  // colour-vision-deficiency confusion.
  assert.match(card, /const HEALTH_LABEL = \{ good: 'On Track', warn: 'At Risk', bad: 'Critical', na: 'No Data' \}/);
  assert.match(workspace, /HEALTH_LABEL\[health\]/);
  assert.match(card, /\{HEALTH_LABEL\[health\]\}/);
});

// ---------------------------------------------------------------------------
// Styling: the module reuses the app's systems rather than restating them
// ---------------------------------------------------------------------------

test('the module writes only its own namespace, and reuses the rest', () => {
  const block = accountsCssBlock();
  assert.ok(block.length > 0, 'the Accounts CSS block should exist');
  // Every selector it introduces is `pa-` prefixed (plus the media queries and
  // the one `.u-tab` alignment fix scoped under `.pa-slices`).
  for (const sel of block.match(/^\.[a-z][\w-]*/gm) || []) {
    assert.match(sel, /^\.pa-/, `${sel} is outside the module's namespace`);
  }
  // The shared systems are used, not restated: no second grid, card height,
  // meter or KPI geometry.
  assert.match(page, /className="page-body"/);
  assert.match(workspace, /className="dash-grid"/);
  assert.match(workspace, /card-md|card-lg/);
  assert.match(card, /className="prop-meter-track"/);
  assert.ok(!/--dash-card-h|--kpi-count *:/.test(block), 'no new card-size or KPI tokens');
});

test('the portfolio grid is responsive without a new breakpoint vocabulary', () => {
  const block = accountsCssBlock();
  assert.match(block, /\.pa-grid \{[^}]*repeat\(auto-fill, minmax\(320px, 1fr\)\)/s);
  // The same two breakpoints the Finance module already uses.
  assert.match(block, /@media \(max-width: 900px\)/);
  assert.match(block, /@media \(max-width: 560px\)/);
  assert.match(block, /\.pa-grid \{ grid-template-columns: minmax\(0, 1fr\); \}/);
});

// ---------------------------------------------------------------------------
// Derivation — real arithmetic, run
// ---------------------------------------------------------------------------

const state = (login, over = {}) => ({
  account_id: login,
  label: `Acct ${login}`,
  challenge: {},
  challengeId: login * 10,
  phase: 'p1',
  startBalance: 100000,
  currentEquity: 104000,
  maxDd: { limit: 10000, roomLeft: 8000, fracRemaining: 0.8, breached: false },
  dailyDd: { limit: 5000, usedToday: 500, roomLeft: 4500, fracRemaining: 0.9, breached: false },
  profitTarget: { target: 8000, current: 4000, pctToTarget: 0.5, reached: false },
  tradingDays: { completed: 2, required: 3 },
  breach: { breached: false, reason: null },
  health: { score: 80 },
  ...over,
});

const acct = (login, over = {}) => ({
  mt5_login: login, label: `Acct ${login}`, firm_name: 'FTMO', start_balance: 100000, ...over,
});

test('bucketAccounts: each account lands in exactly one sub-tab', () => {
  const states = [
    state(1),
    state(2, { phase: 'funded', profitTarget: null }),
    state(3, { breach: { breached: true, reason: 'max_dd' }, health: { score: 0 } }),
    state(4, { phase: 'p2' }),
  ];
  const b = bucketAccounts({ states, passed: [], accounts: [acct(1), acct(2), acct(3), acct(4)] });

  assert.deepEqual(b.evaluation.map((r) => r.accountId), [1, 4]);
  assert.deepEqual(b.funded.map((r) => r.accountId), [2]);
  assert.deepEqual(b.breached.map((r) => r.accountId), [3]);

  const seen = [...b.evaluation, ...b.funded, ...b.breached].map((r) => r.accountId);
  assert.equal(new Set(seen).size, seen.length, 'an account must not appear in two sub-tabs');
});

test('bucketAccounts: breached wins over phase', () => {
  // A breached evaluation account is BREACHED, not an evaluation account with a
  // problem — the same precedence the server-side breakdown uses.
  const states = [
    state(1, { breach: { breached: true, reason: 'daily_dd' } }),
    state(2, { phase: 'funded', profitTarget: null, breach: { breached: true, reason: 'max_dd' } }),
  ];
  const b = bucketAccounts({ states, accounts: [acct(1), acct(2)] });
  assert.deepEqual(b.breached.map((r) => r.accountId), [1, 2]);
  assert.deepEqual(b.evaluation, []);
  assert.deepEqual(b.funded, []);
});

test('bucketAccounts: an account with no challenge is in no sub-tab at all', () => {
  // It has no rules to be judged against, so it is not "evaluation by default".
  const b = bucketAccounts({
    states: [{ account_id: 9, label: 'Bare', challenge: null }],
    accounts: [acct(9)],
  });
  assert.deepEqual([b.evaluation, b.funded, b.passed, b.breached], [[], [], [], []]);
});

test('bucketAccounts: live sub-tabs are ordered by attention needed', () => {
  const states = [
    state(1, { health: { score: 90 } }),
    state(2, { health: { score: 20 } }),
    state(3, { health: { score: 55 } }),
  ];
  const b = bucketAccounts({ states, accounts: [acct(1), acct(2), acct(3)] });
  assert.deepEqual(b.evaluation.map((r) => r.accountId), [2, 3, 1], 'worst health first');
});

test('bucketAccounts: Passed is one row per pass EVENT, order preserved', () => {
  // A re-taken account legitimately passed twice, so it appears twice.
  const passed = [
    { accountId: 1, challengeId: 11, label: 'Acct 1', phase: 'p2', passedDate: '2026-08-10' },
    { accountId: 1, challengeId: 10, label: 'Acct 1', phase: 'p1', passedDate: '2026-07-02' },
  ];
  const b = bucketAccounts({ states: [], passed, accounts: [acct(1)] });
  assert.deepEqual(b.passed.map((r) => r.challengeId), [11, 10]);
  // Copied, not aliased — the tab must not be able to reorder the fetched payload.
  assert.notEqual(b.passed, passed);
});

test('accountRow joins the engine state to the commercial facts', () => {
  const r = accountRow(state(7), acct(7, { firm_name: 'GoatFundedTrader', start_balance: 50000, kind: 'manual' }));
  assert.equal(r.firmName, 'GoatFundedTrader');
  assert.equal(r.accountSize, 50000);
  assert.equal(r.isManual, true);
  // Balance is the ENGINE's equity — the number every meter on the card is
  // measured against — not the account row's possibly-stale sync.
  assert.equal(r.balance, 104000);
  assert.equal(r.pnl, 4000);
  // A missing account record degrades rather than throwing.
  const bare = accountRow(state(8), undefined);
  assert.equal(bare.firmName, 'Other');
  assert.equal(bare.accountSize, 100000);
});

test('equitySeries charts the account BALANCE, opening at the starting balance', () => {
  const days = [
    { date: new Date('2026-08-03T12:00:00Z'), pnl: 500 },
    { date: new Date('2026-08-04T12:00:00Z'), pnl: -200 },
    { date: new Date('2026-08-05T12:00:00Z'), pnl: 1000 },
  ];
  const s = equitySeries(100000, days);
  assert.equal(s.length, 4, 'one leading point at the starting balance');
  assert.deepEqual(s.map((p) => p.balance), [100000, 100500, 100300, 101300]);
  // The lead-in is dated before the first trading day, so the curve starts where
  // the account did rather than at the close of its first session.
  assert.ok(s[0].date < days[0].date);
});

test('equitySeries: nothing to chart returns nothing, never a flat line at zero', () => {
  assert.deepEqual(equitySeries(100000, []), []);
  assert.deepEqual(equitySeries(null, [{ date: new Date(), pnl: 10 }]), []);
});

test('selectedLogin: Details is single-account or it is nothing', () => {
  assert.equal(selectedLogin('12345'), '12345');
  assert.equal(selectedLogin('all'), null, 'god view is not one account');
  assert.equal(selectedLogin('123,456'), null, 'a multi-selection is not one account');
  assert.equal(selectedLogin(undefined), null);
});

// ---------------------------------------------------------------------------
// Backend
// ---------------------------------------------------------------------------

test('GET /api/prop/portfolio is portfolio-wide and ownership-bounded', () => {
  const src = sourceOf('get', '/api/prop/portfolio');
  assert.match(httpLayer, /app\.get\('\/api\/prop\/portfolio', \{ preHandler: app\.requireAuth \}/);
  const handler = src.slice(src.indexOf("'/api/prop/portfolio'"), src.indexOf("'/api/prop/insights'"));
  // Every login is the user's own — the same guard the Overview route uses.
  assert.match(handler, /ownedLogins\(req\.user\.uid\)/);
  // It deliberately ignores ?account_id: narrowing the Portfolio to the selected
  // account would empty three of its four sub-tabs.
  assert.ok(!handler.includes('req.query.account_id'), 'the Portfolio is not account-scoped');
  assert.ok(!handler.includes('resolveScope'), 'no per-account scoping on a portfolio route');
  // It reuses the engine and the pass derivation rather than recomputing either.
  assert.match(handler, /propStatesForScope\(scope\)/);
  assert.match(handler, /passedChallenges\(\{ challenges, accounts \}\)/);
  // `accounts` is not shipped back — the client already holds listAccounts().
  assert.ok(!/return \{[^}]*accounts,/s.test(handler), 'accounts would be a second, stalable copy');
});

test('passedChallenges is one derivation, used by both surfaces', () => {
  const challenges = [
    { id: 1, mt5_login: 5, status: 'passed', phase: 'p1', start_date: '2026-06-01', passed_at: '2026-06-20' },
    { id: 2, mt5_login: 5, status: 'passed', phase: 'p2', start_date: '2026-06-21', passed_at: '2026-07-15' },
    { id: 3, mt5_login: 5, status: 'breached', phase: 'p1', start_date: '2026-05-01' },
    // A funded challenge is not something you "pass".
    { id: 4, mt5_login: 5, status: 'passed', phase: 'funded', start_date: '2026-07-16' },
  ];
  const accounts = [{ mt5_login: 5, label: 'Live One', firm_name: 'FTMO' }];
  const rows = passedChallenges({ challenges, accounts });

  assert.deepEqual(rows.map((r) => r.challengeId), [2, 1], 'newest pass first');
  assert.equal(rows[0].label, 'Live One');
  assert.equal(rows[0].firmName, 'FTMO');
  assert.equal(rows[0].passedDate, '2026-07-15');

  // The Overview's accounts breakdown must return the identical list rather than
  // carrying its own copy of what counts as a pass.
  const breakdown = accountsBreakdown({ accounts, states: [], challenges, payouts: [] });
  assert.deepEqual(breakdown.passed, rows);
});

test('passedChallenges degrades rather than throwing on missing inputs', () => {
  assert.deepEqual(passedChallenges(), []);
  assert.deepEqual(passedChallenges({ challenges: [], accounts: [] }), []);
  // An unknown login still names something, rather than rendering "undefined".
  const [row] = passedChallenges({
    challenges: [{ id: 1, mt5_login: 42, status: 'passed', phase: 'p1', passed_at: '2026-08-01' }],
    accounts: [],
  });
  assert.equal(row.label, 'Account 42');
  assert.equal(row.firmName, 'Other');
});

test('the client fetch matches the route: no account id, one call for both tabs', () => {
  const api = readSrc('api.js');
  assert.match(api, /export async function fetchPropPortfolio\(\) \{\s*return getJson\('\/api\/prop\/portfolio'\);/);
  assert.doesNotMatch(api, /prop\/portfolio[^\n]*acctq/);
  // Details reads the entry it needs out of the SAME payload the cards were built
  // from — a separate per-account fetch would let the two show different numbers.
  assert.match(page, /fetchPropPortfolio\(\)/);
  assert.ok(!page.includes('fetchProp('), 'Details must not open a second loading path');
});
