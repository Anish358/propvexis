import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { legacyCss } from './helpers/app-css.js';
import { navTitle, navRoutes } from '../frontend/src/nav.js';

// Prop OS › Finance — the page's STRUCTURE, as distinct from its arithmetic
// (finance-data.test.js). These assert the two things a source-reading test can
// actually protect: the locked information architecture, and the reuse rules that
// keep the module from growing a second visual language.

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const page = read('../frontend/src/Finance.jsx');
const kpis = read('../frontend/src/FinanceKpiCards.jsx');
const summary = read('../frontend/src/FinanceSummary.jsx');
const ledger = read('../frontend/src/FinanceLedger.jsx');
const app = read('../frontend/src/App.jsx');

// --- the locked IA ---------------------------------------------------------

test('Finance has exactly three tabs, in order', () => {
  const values = [...page.matchAll(/\{ value: '(\w+)', label: '([^']+)' \}/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(values, [
    ['summary', 'Summary'],
    ['transactions', 'Transactions'],
    ['funded', 'Funded Accounts'],
  ]);
});

test('the tabs are the app\'s one switcher primitive, not a new tab style', () => {
  assert.match(page, /import \{[^}]*\bTabs\b[^}]*\} from '@\/components\/primitives'/s);
  assert.match(page, /<Tabs className="fin-tabs" tabs=\{TABS\} value=\{tab\} onChange=\{setTab\}/);
  // Switching is local state, so no reload and no route churn.
  assert.match(page, /const \[tab, setTab\] = useState\('summary'\)/);
});

test('Summary holds the KPI row, ROI Progression and Finance Breakdown — and nothing else', () => {
  const body = page.slice(page.indexOf('const summary = ('), page.indexOf('const transactions = ('));
  assert.match(body, /<FinanceSummaryKpis/);
  assert.match(body, /<RoiProgressionCard/);
  assert.match(body, /<FinanceBreakdownCard/);
  // Three sections. A fourth component here would be an invented section.
  assert.equal((body.match(/<[A-Z]\w+/g) || []).length, 3);
});

test('Transactions holds the KPI row and the transaction log', () => {
  const body = page.slice(page.indexOf('const transactions = ('), page.indexOf('// Intentionally empty'));
  assert.match(body, /<FinanceLedgerKpis/);
  assert.match(body, /<LedgerCard/);
  assert.equal((body.match(/<[A-Z]\w+/g) || []).length, 2);
});

test('Funded Accounts is intentionally empty, and reads as intentional', () => {
  const body = page.slice(page.indexOf('const fundedTab = ('), page.indexOf('return ('));
  // The same treatment every unbuilt route in the app uses (ComingSoon.jsx): a
  // brand badge over an EmptyState. Nothing invented.
  assert.match(body, /<EmptyState/);
  assert.match(body, /<Badge tone="brand">Coming soon<\/Badge>/);
  for (const invented of ['<table', 'Card', 'Chart', 'Pie', 'filter']) {
    assert.ok(!body.includes(invented), `Funded Accounts must not invent ${invented}`);
  }
});

test('Finance is one route, unchanged in the IA', () => {
  assert.match(app, /<Route path="finance" element=\{<Finance \/>\} \/>/);
  // Exactly one — three tabs must not have become three routes.
  assert.equal((app.match(/element=\{<Finance/g) || []).length, 1);
  assert.deepEqual(navTitle('/prop/finance'), { module: 'Prop OS', page: 'Finance' });
  assert.ok(navRoutes().includes('/prop/finance'));
  assert.ok(!navRoutes().some((r) => r.startsWith('/prop/finance/')), 'no sub-routes were added');
});

// --- reuse, not reinvention -----------------------------------------------

test('the KPI tiles borrow the locked master-card geometry', () => {
  // Net P&L in KpiCards.jsx is the locked master: every KPI tile matches its
  // dimensions and the content adapts to the container, not the reverse.
  const tiles = kpis.match(/className="dash-stat[^"]*"/g) || [];
  assert.ok(tiles.length >= 1, 'the tiles must render the shared KPI box');
  for (const t of tiles) assert.match(t, /dash-stat--typo-match/);
  assert.match(kpis, /spacing="none"/);
  assert.match(kpis, /import \{ Card \} from '@\/components\/primitives'/);
  // No geometry of its own — that is what drifts.
  for (const own of ['padding:', 'height:', 'minHeight', 'fontSize']) {
    assert.ok(!kpis.includes(own), `the tiles must not declare ${own}`);
  }
});

test('both KPI rows are the same row: one component file, one grid class', () => {
  for (const row of ['FinanceSummaryKpis', 'FinanceLedgerKpis']) {
    assert.match(kpis, new RegExp(`export function ${row}`));
  }
  assert.equal((kpis.match(/className="jo-kpis dash-stats"/g) || []).length, 2);
  assert.equal((kpis.match(/'--kpi-count': 4/g) || []).length, 2);
  // Total Spent is declared once and rendered by both rows — not copied.
  assert.equal((kpis.match(/export function TotalSpentCard/g) || []).length, 1);
});

test('the module composes primitives and imports no generated component directly', () => {
  for (const [name, src] of Object.entries({ page, kpis, summary, ledger })) {
    assert.ok(
      !/from '@\/components\/ui\//.test(src),
      `${name} must import from @/components/primitives, never @/components/ui`,
    );
  }
  // The controls are library components, not hand-rolled markup: Badge for the pills,
  // CountBadge for the filter count, Button + Menu for the actions, Input for the
  // search, ToggleGroup for the range, Tabs for both switchers.
  const imported = (src) => new Set(
    // `[^}]*` rather than a lazy `[\s\S]*?`: a lazy match anchored at the FIRST
    // `import {` in the file swallows the intervening lucide import.
    [...src.matchAll(/import \{([^}]*)\} from '@\/components\/primitives'/g)]
      .flatMap((m) => m[1].split(',').map((s) => s.trim()).filter(Boolean)),
  );
  for (const c of ['Badge', 'Button', 'Card', 'CountBadge', 'EmptyState', 'Input', 'Menu', 'MenuTrigger', 'Tabs']) {
    assert.ok(imported(ledger).has(c), `the ledger should use the ${c} primitive`);
  }
  for (const c of ['Card', 'Tabs', 'EmptyState', 'ToggleGroupExclusive', 'ToggleGroupItem']) {
    assert.ok(imported(summary).has(c), `the summary cards should use the ${c} primitive`);
  }
  assert.match(ledger, /<Badge tone=\{TYPE_TONE\[r\.type\]\}>/);
});

test('the transaction table reuses the module\'s table treatment', () => {
  // `.prop-table` is the Prop OS module's table. A fourth table style in an app that
  // already has three is exactly what the reuse rule is for.
  assert.match(ledger, /className="prop-table fin-table"/);
  assert.match(legacyCss, /\.fin-table \{ min-width: 940px; \}/);
  assert.match(legacyCss, /\.fin-table-scroll \{ overflow-x: auto; \}/);
});

test('the nine transaction columns', () => {
  const head = ledger.slice(ledger.indexOf('<thead>'), ledger.indexOf('</thead>'));
  const cols = [...head.matchAll(/<th[^>]*>([^<]+)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(cols, [
    'Date', 'Description', 'Account', 'Challenge', 'Firm', 'Type', 'Category', 'Amount', 'Status',
  ]);
});

test('the controls row is search + filters + add, over four views', () => {
  assert.match(ledger, /<Tabs tabs=\{LEDGER_VIEWS\}/);
  assert.match(ledger, /aria-label="Search transactions"/);
  assert.match(ledger, /<span>Filters<\/span>/);
  assert.match(ledger, /<span>Add Transaction<\/span>/);
  // A control with a visible text label must not also carry an aria-label — it would
  // replace the words a voice-control user can actually see.
  assert.ok(!/aria-label="Filter transactions"/.test(ledger));
  // Add Transaction opens the forms that already exist rather than a new one.
  assert.match(page, /import FeesModal from '\.\/FeesModal\.jsx'/);
  assert.match(page, /import PayoutsModal from '\.\/PayoutsModal\.jsx'/);
});

// --- one source of truth for the numbers ----------------------------------

test('the page derives from context and adds no second loading path', () => {
  assert.match(page, /import \{[\s\S]*?financeLedger,[\s\S]*?\} from '\.\/financeData\.js'/);
  assert.ok(!page.includes('fetchPropFinance'), 'Finance derives from context, it does not fetch');
  assert.ok(!page.includes('useEffect'), 'nothing to load means nothing to sequence');
  // Scope-aware: an account switch re-derives everything.
  assert.match(page, /accountId = 'all'/);
  assert.match(page, /financeLedger\(\{ payouts, fees, accounts, accountId \}\)/);
});

test('the KPI row above the table describes the FILTERED rows', () => {
  // Both are computed in the page, from the same array, so a narrowed table and its
  // tiles can never report different money.
  assert.match(page, /const rows = useMemo\(\(\) => filterLedger\(ledger, \{ view, \.\.\.filters \}\)/);
  assert.match(page, /const rowTotals = useMemo\(\(\) => financeTotals\(rows\)/);
  assert.match(page, /<FinanceLedgerKpis totals=\{rowTotals\}/);
  // And the table gets the same rows it was measured from.
  assert.match(page, /rows=\{rows\}/);
});

test('no component decides a number', () => {
  // Formatting and arranging only; the arithmetic lives in financeData.js.
  for (const [name, src] of Object.entries({ summary, ledger })) {
    assert.ok(!/\breduce\(/.test(src), `${name} must not aggregate — that belongs in financeData.js`);
  }
});

// --- charts + colour ------------------------------------------------------

test('charts are the library already in the project, themed from tokens', () => {
  assert.match(summary, /from 'recharts'/);
  assert.match(summary, /import \{ chartPalette \} from '\.\/theme\.js'/);
  // Resolved during render, never captured at module scope.
  assert.ok(!/^const .*chartPalette\(/m.test(summary));
  for (const hex of summary.match(/#[0-9a-fA-F]{3,8}\b/g) || []) {
    assert.fail(`hardcoded colour ${hex} in FinanceSummary.jsx — use a token`);
  }
});

test('the ROI chart crosses zero and reads on hover', () => {
  assert.match(summary, /<ReferenceLine y=\{0\}/);
  assert.match(summary, /<Tooltip content=\{<RoiTooltip \/>\}/);
  assert.match(summary, /<Legend/);
  assert.match(summary, /<ResponsiveContainer width="100%"/);
});

test('semantic colour is the app\'s, and is not spent on every dollar', () => {
  // Tone is reserved for figures whose direction is a verdict. Spend and earnings
  // stay neutral; net and cash flow are coloured.
  const toned = [...kpis.matchAll(/export function (\w+Card)[\s\S]*?\n\}/g)]
    .filter((m) => m[0].includes('tone={signTone('))
    .map((m) => m[1]);
  assert.deepEqual(toned.sort(), ['NetCashFlowCard', 'NetTotalCard']);
});

// --- responsive ----------------------------------------------------------

test('the Summary columns stack, and the chart gives back height', () => {
  assert.match(legacyCss, /\.fin-cols \{\s*display: grid; grid-template-columns: 1\.95fr 1fr;/);
  assert.match(legacyCss, /@media \(max-width: 1200px\) \{\s*\.fin-cols \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(legacyCss, /@media \(max-width: 900px\) \{\s*\.fin-chart \{ height: 260px; \}/);
  assert.match(legacyCss, /@media \(max-width: 560px\) \{\s*\.fin-chart \{ height: 220px; \}/);
});

test('the Finance CSS restates no KPI-row breakpoint of its own', () => {
  // `.dash-stats` already reflows at 1100px for every KPI row in the app. A second
  // rule here is how two rows come to wrap at different widths.
  const at = legacyCss.indexOf('Prop OS › Finance  (Finance.jsx');
  assert.ok(at > 0, 'could not locate the Finance CSS block');
  // From the block's opening `/*`, so the comment stripper below sees whole comments.
  const block = legacyCss.slice(legacyCss.lastIndexOf('/*', at));
  assert.ok(block.length > 2000, 'the Finance CSS block looks truncated');
  // Comments stripped: the block EXPLAINS that it inherits the 1100px rule, so the
  // assertion is about declarations, not about the prose that documents them.
  const rules = block.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/dash-stats|jo-kpis/.test(rules), 'the Finance block must not redeclare the KPI grid');
});
