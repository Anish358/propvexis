import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readSrc } from './helpers/src-files.js';
import { legacyCss } from './helpers/app-css.js';
import { NAV, navRoutes, navTitle, isSingleAccountRoute } from '../frontend/src/app/nav.js';
import {
  ALL_FIRMS, CHALLENGE_TABS, STAGE_ORDER, STAGE_STATUS_LABEL,
  challengeCounts, challengeLifecycle, challengeRows, challengeStages, currentStageMetrics,
  firmKeyOf, firmOptions, groupByFirm, stageFigures,
} from '../frontend/src/features/prop/challengesData.js';
import { byRisk } from '../frontend/src/features/prop/propAccounts.js';

// Prop OS › Challenges. Two halves, asserted separately: the DERIVATION (which
// challenges exist, how they group by firm, and above all the lifecycle state
// machine), which is real arithmetic imported and run; and the locked INFORMATION
// ARCHITECTURE plus the reuse rules, which a source-reading test is what protects.
// Files are read by BASENAME so the assertions survive a move — see
// helpers/src-files.js for why that matters.

const page = readSrc('PropChallenges.jsx');
const card = readSrc('ChallengeCard.jsx');
const details = readSrc('ChallengeDetails.jsx');
const lifecycle = readSrc('ChallengeLifecycle.jsx');
const kpis = readSrc('ChallengeKpiCards.jsx');
const acctCard = readSrc('AccountPortfolioCard.jsx');
const workspace = readSrc('AccountWorkspace.jsx');
const app = readSrc('App.jsx');

// Comment-stripped source, for the "must not contain X" scans. Every file in this
// module EXPLAINS in prose what it deliberately does NOT do ("no checkout, no
// marketplace", "three at FTMO, two at Topstep"), and a raw substring scan reads that
// explanation as the very thing it rules out. So the negative assertions read the CODE.
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// The Challenges block, bounded at BOTH ends. It used to run to the end of the file
// because it was the last block; the Settings module now follows it, and an unbounded
// slice would judge that block's selectors against this module's namespace.
const challengesCssBlock = () => {
  const start = legacyCss.indexOf('Prop OS › Challenges');
  assert.ok(start !== -1, 'the Challenges CSS block should exist');
  const next = legacyCss.indexOf('/* ============================================================', start);
  return next === -1 ? legacyCss.slice(start) : legacyCss.slice(start, next);
};

// ---------------------------------------------------------------------------
// The locked IA
// ---------------------------------------------------------------------------

test('Challenges has exactly two main tabs, in order', () => {
  assert.deepEqual(CHALLENGE_TABS, [
    { value: 'challenges', label: 'Challenges' },
    { value: 'details', label: 'Details' },
  ]);
});

test('the tab row and the firm selector are the app\'s one switcher primitive', () => {
  assert.match(page, /import \{[^}]*\bTabs\b[^}]*\} from '@\/components\/primitives'/s);
  assert.match(page, /<Tabs className="pa-tabs" tabs=\{CHALLENGE_TABS\}/);
  assert.match(page, /<Tabs className="pc-firms" tabs=\{firmTabs\}/);
  // Switching is local state, so no reload and no route churn.
  assert.match(page, /const \[tab, setTab\] = useState\('challenges'\)/);
  assert.match(page, /const \[firm, setFirm\] = useState\(ALL_FIRMS\)/);
  // No third top-level tab, and no bespoke tab styling.
  assert.equal((page.match(/<Tabs /g) || []).length, 2);
});

test('Challenges is one route, and it is no longer a Coming Soon stub', () => {
  const item = NAV.find((i) => i.base === '/prop').children.find((c) => c.to === '/prop/challenges');
  assert.notEqual(item.soon, true, 'Challenges should be a real page now');
  assert.deepEqual(navTitle('/prop/challenges'), { module: 'Prop OS', page: 'Challenges' });
  assert.ok(navRoutes().includes('/prop/challenges'));
  assert.ok(!navRoutes().some((r) => r.startsWith('/prop/challenges/')), 'two tabs must not become two routes');
  assert.match(app, /<Route path="challenges" element=\{<PropChallenges \/>\} \/>/);
  assert.equal((app.match(/element=\{<PropChallenges/g) || []).length, 1);
  assert.ok(!/ComingSoon title="Challenges"/.test(app), 'the stub is gone');
});

test('Details holds exactly the three locked sections, and nothing else', () => {
  const body = details.slice(details.indexOf('export default function ChallengeDetails'));
  for (const section of ['<SelectedChallengeHeader', '<ChallengeKpiCards', '<ChallengeLifecycle']) {
    assert.ok(body.includes(section), `Details is missing ${section}`);
  }
  // The ACCOUNT workspace's surfaces stay on the Accounts page — the two modules
  // answer different questions and must not become copies of each other.
  for (const elsewhere of ['EquityCurve', 'MonthCalendar', 'RecentTrades', 'AccountDetails']) {
    assert.ok(!details.includes(elsewhere), `${elsewhere} belongs to Prop OS > Accounts`);
  }
  // Nothing from the explicitly-excluded scope crept in.
  for (const invented of ['Checkout', 'Purchase', 'Marketplace', 'Compare', 'Score', 'Recommend']) {
    assert.ok(!page.includes(invented) && !details.includes(invented), `must not add ${invented}`);
  }
});

test('the page keeps the prop-firm hierarchy in BOTH firm views', () => {
  // "All" renders one section per firm rather than one flat grid of everything.
  assert.match(page, /const shown = firm === ALL_FIRMS \? groups : groups\.filter\(\(g\) => g\.key === firm\)/);
  assert.match(page, /shown\.map\(section\)/);
  assert.match(page, /<section className="pc-firm"/);
  assert.match(page, /className="pc-firm-name">\{group\.name\}/);
  assert.match(page, /<div className="pc-grid">/);
  // The firms are the trader's own, not a hardcoded list on the page.
  assert.ok(!/FTMO|Topstep|FundingPips|5%ers/.test(code(page)), 'no firm names typed into the page');
});

test('the page adds NO dashboard KPI band — that is the Overview\'s job', () => {
  for (const kpi of ['Total Capital', 'Total P&L', 'At Risk', 'businessKpis', 'PropKpiCards']) {
    assert.ok(!page.includes(kpi), `Challenges must not grow a ${kpi} band`);
  }
  // Its own KPI row lives on Details only, one tile per lifecycle stage.
  assert.ok(!page.includes('jo-kpis'), 'no KPI row on the Challenges tab');
  assert.match(kpis, /className="jo-kpis dash-stats"/);
});

// ---------------------------------------------------------------------------
// One source of truth for the selection
// ---------------------------------------------------------------------------

test('selecting a challenge writes the app-wide selection, then flips to Details', () => {
  assert.match(page, /const select = \(accountLogin\) => \{\s*setAccountId\(String\(accountLogin\)\);\s*setTab\('details'\);/);
  assert.match(page, /<ChallengeCard[^>]*onSelect=\{\(\) => select\(r\.accountId\)\}/s);
  assert.match(card, /<Button variant="secondary" size="sm" onClick=\{onSelect\}>View Details<\/Button>/);
  // No local selected-challenge state — that would be a second source of truth.
  assert.ok(!/useState\([^)]*selectedChallenge/i.test(page));
  // The selection is read back through the SAME resolver the Accounts page uses.
  // The regex deliberately does not pin the import's brace contents -- what matters
  // is that selectedLogin comes from the shared module, not how many other symbols
  // travel alongside it in the same import statement.
  assert.match(page, /import \{[^}]*\bselectedLogin\b[^}]*\}\s*from\s*'[^']*propAccounts\.js'/);
  assert.match(page, /const login = selectedLogin\(accountId\)/);
});

test('Details adds NO switcher of its own — the universal top-bar one is it', () => {
  for (const switcher of ['<AccountSwitcher', '<AccountHeader', '<MenuCheckboxItem', '<select']) {
    assert.ok(!details.includes(switcher), `Details must not contain ${switcher}`);
  }
  assert.ok(!/setAccountId/.test(details), 'Details never writes the selection — it reads it');
});

test('the switcher is single-select on this route, declared in the IA', () => {
  assert.equal(isSingleAccountRoute('/prop/challenges'), true);
  assert.equal(isSingleAccountRoute('/prop/challenges/'), true, 'a trailing slash is the same page');
  // Its sibling workspace keeps the behaviour too, and nothing else gains it.
  assert.equal(isSingleAccountRoute('/prop/accounts'), true);
  for (const other of ['/prop', '/prop/finance', '/', '/journal/trades']) {
    assert.equal(isSingleAccountRoute(other), false, `${other} must keep multi-select`);
  }
});

// ---------------------------------------------------------------------------
// Reuse, not reinvention
// ---------------------------------------------------------------------------

test('the challenge card reuses the accounts card\'s meter, not a copy of it', () => {
  assert.match(acctCard, /export function MiniMeter/);
  assert.match(card, /import \{ MiniMeter \} from '[^']*AccountPortfolioCard\.jsx'/);
  assert.ok(!card.includes('function MiniMeter'), 'the challenge card must not grow its own');
  // ...and the frame, figure strip and footer rules that already existed for a card
  // of this shape, rather than a second set under a new namespace.
  for (const cls of ['pa-card', 'pa-card-head', 'pa-card-figures', 'pa-card-foot', 'pa-status-']) {
    assert.ok(card.includes(cls), `the card should reuse .${cls}`);
  }
});

test('the lifecycle rail is ONE implementation at two densities', () => {
  assert.match(lifecycle, /export function LifecycleRail/);
  assert.match(card, /import \{ LifecycleRail \} from '[^']*ChallengeLifecycle\.jsx'/);
  assert.match(card, /<LifecycleRail stages=\{stages\} activeTone=\{health\} compact \/>/);
  assert.match(lifecycle, /<LifecycleRail stages=\{stages\} activeTone=\{activeTone\} \/>/);
  assert.ok(!card.includes('pc-step-node'), 'the card must not draw its own stepper');
});

test('the drawdown/health thresholds are the shared ones, not a second set', () => {
  assert.match(card, /import \{ healthStatus, roomStatus \} from '[^']*PropOS\.jsx'/);
  assert.match(lifecycle, /import \{ roomStatus \} from '[^']*PropOS\.jsx'/);
  assert.match(details, /import \{ healthStatus \} from '[^']*PropOS\.jsx'/);
  for (const f of [card, lifecycle, details, kpis]) {
    assert.ok(!/function roomStatus|function healthStatus/.test(f), 'thresholds must not be re-derived');
  }
  // The row join and the attention ordering come from the Accounts module's one copy.
  assert.match(readSrc('challengesData.js'), /import \{\s*PHASE_LABEL, accountRow, byRisk, isBreached, isLive,\s*\} from '\.\/propAccounts\.js'/);
  assert.equal(typeof byRisk, 'function');
});

test('the KPI tiles borrow the locked master-card geometry', () => {
  // Net P&L in KpiCards.jsx is the locked master: every tile matches its dimensions
  // and the content adapts to the container, never the reverse.
  const tiles = kpis.match(/className=\{?[`"]dash-stat[^`"]*/g) || [];
  assert.ok(tiles.length >= 1);
  for (const t of tiles) assert.match(t, /dash-stat--typo-match/);
  assert.match(kpis, /spacing="none"/);
  assert.ok(!/(width|height|padding|font-size):/i.test(kpis), 'no inline sizing on a locked card');
  // --kpi-count splits the row, like every other KPI row in the app.
  assert.match(kpis, /'--kpi-count': stages\.length \|\| 1/);
  // The context row is the app's one StatContext, not a second layout.
  assert.match(kpis, /import \{ StatContext \} from '[^']*DashWidgets\.jsx'/);
});

test('status is a word plus a colour, never a colour alone', () => {
  assert.deepEqual(STAGE_STATUS_LABEL, {
    complete: 'Passed',
    active: 'Active',
    breached: 'Breached',
    upcoming: 'Upcoming',
    skipped: 'Not Part Of This Challenge',
  });
  // Every stop carries its status word, and every stop's MARK differs by state too,
  // so the rail reads without colour at all.
  assert.match(lifecycle, /\{STAGE_STATUS_LABEL\[s\.status\]\}/);
  assert.match(lifecycle, /if \(stage\.status === 'complete'\) return '✓'/);
  assert.match(lifecycle, /if \(stage\.status === 'breached'\) return '✕'/);
  assert.match(card, /const HEALTH_LABEL = \{ good: 'On Track', warn: 'At Risk', bad: 'Critical', na: 'No Data' \}/);
  assert.match(card, /\{HEALTH_LABEL\[health\]\}/);
});

test('no raw colour value, and no second charting or icon system', () => {
  for (const f of [page, card, details, lifecycle, kpis]) {
    assert.ok(!/#[0-9a-f]{3,8}\b/i.test(f), 'no raw colour value in a component');
  }
  // The one icon comes from the app's icon package, used the way the app uses it.
  assert.match(page, /import \{ Plus \} from 'lucide-react'/);
  assert.match(page, /<Plus aria-hidden="true" \/>/);
});

// ---------------------------------------------------------------------------
// Fetching: one request for the grid, one more for the selected challenge
// ---------------------------------------------------------------------------

test('the grid and Details read ONE portfolio payload; only history is extra', () => {
  // A card and the lifecycle it opens must not be able to show different numbers for
  // the same challenge, which a second per-account state fetch would allow.
  assert.match(page, /import \{ fetchPropHistory, fetchPropPortfolio \} from '[^']*api\.js'/);
  assert.match(page, /fetchPropPortfolio\(\)/);
  assert.ok(!page.includes('fetchProp('), 'no second per-account state fetch');
  assert.equal((page.match(/fetchPropHistory\(/g) || []).length, 1, 'history is fetched once, for the selected challenge');
  // Both routes already existed — this module adds no endpoint.
  const api = readSrc('api.js');
  assert.match(api, /export async function fetchPropHistory\(accountId\) \{\s*return getJson\(`\/api\/prop\/history\?account_id=\$\{accountId\}`\);/);
  assert.match(api, /export async function fetchPropPortfolio\(\) \{\s*return getJson\('\/api\/prop\/portfolio'\);/);
});

test('history resets to null (not []) on an account change, because they differ', () => {
  // null = not loaded, [] = this account has no challenge rows. The lifecycle draws
  // those two differently, so conflating them would mislabel a passed phase.
  assert.match(page, /setHistory\(null\);\s*if \(login == null\) return undefined;/);
  assert.match(page, /history=\{history\}/);
});

test('Start New Challenge is an entry point to the EXISTING flow, not a fake purchase', () => {
  // It opens the app's own add-account form. That form used to be one section of
  // `AccountsModal`, which also listed every account; the list is Settings > Accounts
  // now, so what this button opens is the add HALF of it — same fields, same template
  // catalog, no list of existing accounts inside a "start new" dialog.
  assert.match(page, /import \{ AccountFormModal \} from '[^']*AccountForms\.jsx'/);
  assert.match(page, /<span>Start New Challenge<\/span>/);
  assert.match(page, /onClick=\{\(\) => setAddOpen\(true\)\}/);
  assert.match(page, /<AccountFormModal[\s\S]*?mode="add"[\s\S]*?onSaved=\{reloadAccounts\}/);
  // No invented commerce anywhere in the module.
  for (const f of [page, card, details, lifecycle, kpis]) {
    assert.ok(!/checkout|payment|razorpay|price|amount/i.test(code(f)), 'no purchase flow in this module');
  }
  // ...and the entry point opens the existing form rather than a new screen of its own.
  assert.ok(!/Modal(?!s)/.test(code(page).replace(/AccountFormModal/g, '')), 'no second modal invented here');
});

// ---------------------------------------------------------------------------
// Styling: the module writes only its own namespace
// ---------------------------------------------------------------------------

test('the module writes only `pc-` selectors, and reuses the rest', () => {
  const block = challengesCssBlock();
  for (const sel of block.match(/^\.[a-z][\w-]*/gm) || []) {
    assert.match(sel, /^\.pc-/, `${sel} is outside the module's namespace`);
  }
  // The shared systems are used, not restated: no second card geometry, KPI grid,
  // meter or page shell.
  assert.match(page, /className="page-body"/);
  assert.match(lifecycle, /className="prop-meter-track"/);
  assert.ok(!/--dash-card-h|--kpi-count *:/.test(block), 'no new card-size or KPI tokens');
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(block), 'every colour in the block is a token');
});

test('the module is responsive on the app\'s existing breakpoints', () => {
  const block = challengesCssBlock();
  assert.match(block, /\.pc-grid \{[^}]*repeat\(2, minmax\(0, 1fr\)\)/s, 'two up on desktop');
  // The same two breakpoints Finance and Accounts already use — no new vocabulary.
  assert.match(block, /@media \(max-width: 900px\)/);
  assert.match(block, /@media \(max-width: 560px\)/);
  assert.match(block, /\.pc-grid \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  // The lifecycle STACKS rather than compressing until its labels are unreadable.
  assert.match(block, /\.pc-rail \{ flex-direction: column/);
  // The KPI row is deliberately NOT restated here: `.dash-stats` already reflows at
  // 1100px for every KPI row in the app.
  assert.ok(!/\.dash-stats\s*\{/.test(block), 'the KPI row must not get a second reflow rule');
});

test('the Accounts module was left alone apart from the two exports it now shares', () => {
  // The one change to its card is the `export` keyword on MiniMeter.
  assert.match(acctCard, /export function MiniMeter\(\{ label, value, limit, pct, tone, note \}\)/);
  assert.ok(!code(acctCard).includes('Challenge'), 'the accounts card learns nothing about challenges');
  assert.ok(!code(workspace).includes('Challenge'), 'the accounts workspace is untouched');
  // The lifted comparator is the only other change, and it is a move, not a rewrite.
  assert.match(readSrc('propAccounts.js'), /^export const byRisk = /m);
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
  tradingDays: { completed: 2, required: 4 },
  breach: { breached: false, reason: null },
  health: { score: 80 },
  ...over,
});

const acct = (login, over = {}) => ({
  mt5_login: login, label: `Acct ${login}`, firm_id: 'ftmo', firm_name: 'FTMO', start_balance: 100000, ...over,
});

const row = (phase, status, over = {}) => ({
  id: over.id ?? 1, phase, status, start_balance: 100000,
  profit_target_pct: 10, max_dd_pct: 10, daily_dd_pct: 5, min_trading_days: 4,
  start_date: '2026-07-01', passed_at: null, breached_at: null, ...over,
});

test('challengeRows: one row per LIVE challenge, joined to its firm', () => {
  const rows = challengeRows({
    states: [state(1), state(2, { phase: 'funded', profitTarget: null }), { account_id: 3, challenge: null }],
    accounts: [acct(1), acct(2, { firm_id: 'gft', firm_name: 'GoatFundedTrader' }), acct(3)],
  });
  assert.deepEqual(rows.map((r) => r.accountId), [1, 2]);
  // An account with no challenge rules is not a challenge at all.
  assert.ok(!rows.some((r) => r.accountId === 3));
  assert.equal(rows[0].firmName, 'FTMO');
  assert.equal(rows[0].firmKey, 'id:ftmo');
  assert.deepEqual(rows[0].stages, ['p1', 'p2', 'funded']);
  // The engine's figures come through untouched (accountRow's join).
  assert.equal(rows[0].balance, 104000);
  assert.equal(rows[0].pnl, 4000);
});

test('challengeRows: passes the account\'s product_id through, so a 1-Step account does not grow a Phase 2', () => {
  // GFT 1-Step has exactly one evaluation phase before funding (see the
  // 'challengeStages: a resolved product overrides the firm-wide union' test
  // above) — this proves challengeRows' OWN call site resolves it, not just
  // challengeStages in isolation.
  const rows = challengeRows({
    states: [state(1)],
    accounts: [acct(1, { firm_id: 'gft', firm_name: 'GoatFundedTrader', product_id: '1step' })],
  });
  assert.deepEqual(rows[0].stages, ['p1', 'funded']);
});

test('challengeRows: a breached challenge is still one of your challenges', () => {
  const rows = challengeRows({
    states: [state(1, { breach: { breached: true, reason: 'max_dd' }, health: { score: 0 } })],
    accounts: [acct(1)],
  });
  assert.equal(rows.length, 1, 'hiding it would make the firm count disagree with the trader');
});

test('challengeRows: ordered by attention needed, worst first', () => {
  const rows = challengeRows({
    states: [state(1, { health: { score: 90 } }), state(2, { health: { score: 20 } }), state(3, { health: { score: 55 } })],
    accounts: [acct(1), acct(2), acct(3)],
  });
  assert.deepEqual(rows.map((r) => r.accountId), [2, 3, 1]);
});

test('firmKeyOf: one firm is one tab, however the account was created', () => {
  // Catalog-created and hand-typed accounts at the same firm must not split into two
  // tabs; two genuinely different firms must not merge.
  assert.equal(firmKeyOf({ firm_id: 'ftmo', firm_name: 'FTMO' }), 'id:ftmo');
  assert.equal(firmKeyOf({ firm_name: 'FTMO' }), 'name:ftmo');
  assert.equal(firmKeyOf({ firm_name: 'ftmo' }), firmKeyOf({ firm_name: 'FTMO' }), 'case is not a firm');
  assert.notEqual(firmKeyOf({ firm_name: 'FTMO' }), firmKeyOf({ firm_name: 'Topstep' }));
  // An account with no firm at all still lands somewhere nameable.
  assert.equal(firmKeyOf({}), 'name:other');
  assert.equal(firmKeyOf(undefined), 'name:other');
});

test('groupByFirm + firmOptions: the sections and the selector agree on order', () => {
  const rows = challengeRows({
    states: [state(1), state(2), state(3), state(4)],
    accounts: [
      acct(1, { firm_id: null, firm_name: 'Topstep' }),
      acct(2),
      acct(3),
      acct(4, { firm_id: null, firm_name: 'Topstep' }),
    ],
  });
  const groups = groupByFirm(rows);
  // Two firms, two challenges each → tie broken by name, so the order is stable.
  assert.deepEqual(groups.map((g) => g.name), ['FTMO', 'Topstep']);
  assert.deepEqual(groups.map((g) => g.rows.length), [2, 2]);

  const opts = firmOptions(groups);
  assert.equal(opts[0].value, ALL_FIRMS);
  assert.equal(opts[0].label, 'All');
  assert.equal(opts[0].count, 4, 'All counts every challenge');
  assert.deepEqual(opts.slice(1).map((o) => o.label), ['FTMO', 'Topstep']);
  assert.deepEqual(opts.slice(1).map((o) => o.value), groups.map((g) => g.key));
});

test('groupByFirm: the firm with the most challenges leads', () => {
  const rows = challengeRows({
    states: [state(1), state(2), state(3)],
    accounts: [acct(1, { firm_id: null, firm_name: 'Topstep' }), acct(2), acct(3)],
  });
  assert.deepEqual(groupByFirm(rows).map((g) => [g.name, g.rows.length]), [['FTMO', 2], ['Topstep', 1]]);
});

test('challengeCounts: the section subtitle counts what it shows', () => {
  const clean = [{ breach: { breached: false } }, { breach: { breached: false } }];
  assert.deepEqual(challengeCounts(clean), { total: 2, active: 2, breached: 0 });
  assert.deepEqual(
    challengeCounts([...clean, { breach: { breached: true } }]),
    { total: 3, active: 2, breached: 1 },
  );
  assert.deepEqual(challengeCounts(), { total: 0, active: 0, breached: 0 });
});

test('challengeStages: the lifecycle adapts to the firm, and never invents one', () => {
  assert.deepEqual(challengeStages('ftmo'), STAGE_ORDER, 'a two-phase firm runs all three stages');
  // A firm the trader typed by hand has no catalog entry — "we don't know" is not
  // "this firm has no Phase 2", so the full lifecycle is kept.
  assert.deepEqual(challengeStages(null), STAGE_ORDER);
  assert.deepEqual(challengeStages('not-a-firm'), STAGE_ORDER);
  // ...and the returned array is a copy, so a caller cannot mutate the constant.
  const s = challengeStages(null);
  s.pop();
  assert.deepEqual(STAGE_ORDER, ['p1', 'p2', 'funded']);
});

test('challengeStages: a resolved product overrides the firm-wide union', () => {
  // GFT 1-Step has exactly one evaluation phase before funding — no Phase 2.
  assert.deepEqual(challengeStages('gft', '1step'), ['p1', 'funded']);
  // Instant Funding skips evaluation entirely.
  assert.deepEqual(challengeStages('gft', 'instant'), ['funded']);
});

test('challengeStages: no product given falls back to the union across the firm\'s products, not a hardcoded default', () => {
  // What this pins: a no-product call for a firm whose products span all three
  // stages (GFT: 2step p1/p2/funded, 1step p1/funded, instant funded) still
  // yields the full lifecycle -- this is challengeRows' behaviour for an
  // account whose product_id is NULL (an older row, or a hand-typed firm),
  // since challengeStages(undefined) and challengeStages(firmId) with no
  // resolvable product take the same branch. See the dedicated test below for
  // proof that challengeRows' call site actually PASSES a resolved product_id
  // through when the account has one.
  //
  // What this does NOT pin, and why: with today's two-firm catalog, EVERY
  // firm's products union to the full STAGE_ORDER, and the "unknown firm /
  // empty ids" fallback also returns STAGE_ORDER. So a union silently broken
  // back to empty (the original bug) would produce the identical result here
  // and this assertion would not catch it -- that discrimination is what the
  // two product-resolved assertions above this one guard instead. Closing
  // this gap would need a firm whose products union to a strict SUBSET of
  // STAGE_ORDER, which the catalog does not currently contain (and is not
  // worth adding a fixture firm to create).
  assert.deepEqual(challengeStages('gft'), STAGE_ORDER);
});

// ---- the lifecycle state machine -------------------------------------------

const statuses = (opts) => challengeLifecycle(opts).map((s) => s.status);

test('lifecycle: Phase 1 active → the two stages ahead are upcoming', () => {
  assert.deepEqual(
    statuses({ phase: 'p1', history: [row('p1', 'active')] }),
    ['active', 'upcoming', 'upcoming'],
  );
});

test('lifecycle: Phase 2 active → Phase 1 complete, Funded still ahead', () => {
  assert.deepEqual(
    statuses({ phase: 'p2', history: [row('p2', 'active', { id: 2 }), row('p1', 'passed', { passed_at: '2026-07-20' })] }),
    ['complete', 'active', 'upcoming'],
  );
});

test('lifecycle: Funded → both evaluation phases complete', () => {
  assert.deepEqual(
    statuses({
      phase: 'funded',
      history: [row('funded', 'active', { id: 3 }), row('p2', 'passed', { id: 2 }), row('p1', 'passed')],
    }),
    ['complete', 'complete', 'active'],
  );
});

test('lifecycle: a breach marks the CURRENT stage, not the ones behind it', () => {
  assert.deepEqual(
    statuses({ phase: 'p2', breached: true, history: [row('p2', 'active', { id: 2 }), row('p1', 'passed')] }),
    ['complete', 'breached', 'upcoming'],
  );
});

test('lifecycle: no state is hard-coded — every one follows the phase', () => {
  // The same history read at three phases gives three different rails.
  const seen = new Set(['p1', 'p2', 'funded'].map((p) => statuses({ phase: p, history: [row(p, 'active')] }).join()));
  assert.equal(seen.size, 3);
});

test('lifecycle: a phase the challenge never ran is SKIPPED, not passed', () => {
  // An account registered straight into funding did not pass two evaluations, and a
  // rail claiming it did would be the module telling a lie about the trader's record.
  assert.deepEqual(
    statuses({ phase: 'funded', history: [row('funded', 'active')] }),
    ['skipped', 'skipped', 'active'],
  );
});

test('lifecycle: an UNLOADED history infers position instead of claiming skipped', () => {
  // This is what the challenge cards render from: one portfolio fetch, no per-card
  // request. `null` must therefore not read as "no rows exist".
  assert.deepEqual(statuses({ phase: 'funded', history: null }), ['complete', 'complete', 'active']);
  assert.deepEqual(statuses({ phase: 'p2' }), ['complete', 'active', 'upcoming']);
});

test('lifecycle: an unknown phase claims nothing about any stage', () => {
  assert.deepEqual(statuses({ phase: null, history: [] }), ['upcoming', 'upcoming', 'upcoming']);
  assert.deepEqual(statuses({ phase: 'p3', history: [] }), ['upcoming', 'upcoming', 'upcoming']);
});

test('lifecycle: a firm with no Phase 2 gets a two-stop rail, not a faked one', () => {
  const stages = challengeLifecycle({ phase: 'p1', stages: ['p1', 'funded'], history: [row('p1', 'active')] });
  assert.deepEqual(stages.map((s) => s.id), ['p1', 'funded']);
  assert.deepEqual(stages.map((s) => s.of), [2, 2]);
  assert.deepEqual(stages.map((s) => s.step), [1, 2]);
});

test('lifecycle: dates and re-take counts come off the rows', () => {
  const stages = challengeLifecycle({
    phase: 'p1',
    history: [
      row('p1', 'active', { id: 3, start_date: '2026-08-10' }),
      row('p1', 'breached', { id: 2, start_date: '2026-07-15', breached_at: '2026-07-28' }),
    ],
  });
  assert.equal(stages[0].attempts, 2, 'a trader on their second Phase 1 should see that');
  assert.equal(stages[0].startDate, '2026-08-10', 'the live row explains the stage');
  assert.equal(stages[0].breachedDate, '2026-07-28');
  assert.equal(stages[0].challenge.id, 3);
  assert.equal(stages[0].current, true);
  assert.equal(stages[1].current, false);

  // A stage closed by a pass reports the pass, and the row behind it is the passed one.
  const [p1] = challengeLifecycle({
    phase: 'p2',
    history: [row('p2', 'active', { id: 2 }), row('p1', 'passed', { passed_at: '2026-07-20' })],
  });
  assert.equal(p1.passedDate, '2026-07-20');
  assert.equal(p1.challenge.status, 'passed');
});

test('lifecycle: labels are the app\'s one phase vocabulary', () => {
  assert.deepEqual(
    challengeLifecycle({ phase: 'p1', history: null }).map((s) => s.label),
    ['Phase 1', 'Phase 2', 'Funded'],
  );
});

// ---- the stage tiles and the current-phase metrics --------------------------

test('stageFigures: only the live stage has a balance', () => {
  const [p1, p2] = challengeLifecycle({ phase: 'p1', history: [row('p1', 'active')] });
  const live = stageFigures(p1, state(1));
  assert.deepEqual(live, { live: true, capital: 100000, balance: 104000, pnl: 4000 });
  // A stage still ahead has neither a balance nor a P&L, and says so with nulls the
  // tile renders as a dash rather than as $0.
  assert.deepEqual(stageFigures(p2, state(1)), { live: false, capital: null, balance: null, pnl: null });
});

test('stageFigures: a completed stage keeps its capital and drops its balance', () => {
  const [p1] = challengeLifecycle({
    phase: 'p2',
    history: [row('p2', 'active', { id: 2 }), row('p1', 'passed', { start_balance: 50000, passed_at: '2026-07-20' })],
  });
  const f = stageFigures(p1, state(1));
  assert.equal(f.capital, 50000, 'the rule snapshot records what it ran at');
  assert.equal(f.balance, null, 'no final equity is stored for a closed phase');
  assert.equal(f.pnl, null, 'so no P&L is invented from it');
});

test('stageFigures degrades rather than throwing on missing inputs', () => {
  assert.deepEqual(stageFigures(null, null), { live: false, capital: null, balance: null, pnl: null });
  assert.deepEqual(stageFigures({ status: 'active' }, null).live, false, 'active with no state is not live');
});

test('currentStageMetrics: every metric is data-driven, in rule order', () => {
  const ms = currentStageMetrics({ state: state(1), challenge: row('p1', 'active') });
  assert.deepEqual(ms.map((m) => m.key), ['target', 'maxDd', 'dailyDd', 'days']);
  assert.deepEqual(ms.map((m) => m.label), ['Profit Target', 'Max Drawdown', 'Daily Drawdown', 'Minimum Trading Days']);
  // The firm's headline percentage comes off the rule snapshot, the progress off the
  // engine — neither is computed here.
  assert.deepEqual(ms.map((m) => m.rulePct), [10, 10, 5, null]);
  assert.equal(ms[0].frac, 0.5);
  assert.equal(ms[1].current, 2000, 'max drawdown used = limit - room left');
  assert.equal(ms[1].frac, 0.2);
  assert.equal(ms[2].current, 500);
  assert.equal(ms[2].frac, 0.1);
  assert.deepEqual([ms[3].current, ms[3].limit, ms[3].met], [2, 4, false]);
});

test('currentStageMetrics: a rule the challenge does not carry is absent, not 0%', () => {
  // A funded account with no target has nothing to progress against; printing a 0%
  // bar would claim it had made no progress toward something that does not exist.
  const funded = currentStageMetrics({
    state: state(1, { phase: 'funded', profitTarget: null, tradingDays: { completed: 0, required: 0 } }),
    challenge: row('funded', 'active', { profit_target_pct: null, min_trading_days: 0 }),
  });
  assert.deepEqual(funded.map((m) => m.key), ['maxDd', 'dailyDd']);

  // A funded account WITH a payout target says payout, not profit.
  const withTarget = currentStageMetrics({
    state: state(1, { phase: 'funded', tradingDays: null }),
    challenge: row('funded', 'active'),
  });
  assert.equal(withTarget[0].label, 'Payout Target');
  assert.equal(withTarget[0].kind, 'payout');
  assert.equal(withTarget.length, 3);
});

test('currentStageMetrics: fractions are clamped, and nothing to measure is nothing', () => {
  const over = currentStageMetrics({
    state: state(1, {
      currentEquity: 120000,
      profitTarget: { target: 8000, current: 20000, pctToTarget: 1, reached: true },
      tradingDays: { completed: 9, required: 4 },
    }),
    challenge: row('p1', 'active'),
  });
  assert.equal(over[0].frac, 1, 'a bar never overfills');
  assert.equal(over[0].reached, true);
  assert.equal(over.find((m) => m.key === 'days').frac, 1);
  assert.deepEqual(currentStageMetrics({ state: null }), []);
  assert.deepEqual(currentStageMetrics(), []);
});

test('currentStageMetrics: a zero-limit rule does not divide by zero', () => {
  const ms = currentStageMetrics({
    state: state(1, {
      maxDd: { limit: 0, roomLeft: 0, fracRemaining: 1, breached: false },
      dailyDd: { limit: 0, usedToday: 0, roomLeft: 0, fracRemaining: 1, breached: false },
    }),
    challenge: row('p1', 'active'),
  });
  for (const m of ms) assert.ok(Number.isFinite(m.frac), `${m.key} produced ${m.frac}`);
});
