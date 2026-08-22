import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readSrc, srcExists } from './helpers/src-files.js';
import { legacyCss } from './helpers/app-css.js';
import {
  NAV, LEGACY_REDIRECTS, isSubnavInPage, navRoutes, navTitle,
} from '../frontend/src/app/nav.js';
import {
  SETTINGS_GROUPS, settingsRail, settingsRoutes, settingsSection, settingsSections,
} from '../frontend/src/features/settings/settingsNav.js';

// Settings, rebuilt as a MODULE: a section rail plus one section's panels, with the
// trading-account management that used to live on `/account` now a real table inside
// it. Three halves are asserted separately, because three different things could
// silently break:
//
//   1. THE DERIVED RAIL. settingsNav.js reads its routes out of nav.js instead of
//      declaring them, so the rail cannot link to a route the router does not serve.
//      That property is only worth anything if something checks it stayed derived.
//   2. THE LOCKED IA. Six sections, six routes, one sidebar row, and `/account`
//      redirecting rather than co-existing — the consolidation this module is for.
//   3. THE SINGLE IMPLEMENTATIONS. Two things are now rendered in two places (the
//      trade-settings controls, the account form fields), and a second copy of either
//      is the failure this rebuild was meant to remove, not introduce.
//
// Files are read by BASENAME so the assertions survive a move — helpers/src-files.js
// says why that matters.

const shell = readSrc('Settings.jsx');
const railCfg = readSrc('settingsNav.js');
const accounts = readSrc('SettingsAccounts.jsx');
const panels = readSrc('SettingsPanels.jsx');
const forms = readSrc('AccountForms.jsx');
const tsPanel = readSrc('TradeSettingsPanel.jsx');
const tsModal = readSrc('TradeSettingsModal.jsx');
const app = readSrc('App.jsx');
const sidebar = readSrc('Sidebar.jsx');
const topbar = readSrc('FilterBar.jsx');

// Comment-stripped source, for the "must not contain X" scans. Every file in this
// module EXPLAINS at length what it deliberately does NOT do ("Profit calculation
// method", "a second billing page"), and a raw substring scan reads that explanation
// as the very thing it rules out. So the negative assertions read the CODE.
const code = (src) => src
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

// The module's CSS block, bounded at both ends so a future block appended after it
// does not get judged against this one's namespace.
// Comment-stripped CSS, for the same reason `code()` exists above: this block
// EXPLAINS which rules it replaced and which token it deliberately does not use, and a
// substring scan reads that explanation as the rule itself. Declarations only.
const cssCode = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const settingsCssBlock = () => {
  const start = legacyCss.indexOf('Settings module  (Settings.jsx');
  assert.ok(start !== -1, 'the Settings CSS block should exist');
  const next = legacyCss.indexOf('/* ============================================================', start);
  return next === -1 ? legacyCss.slice(start) : legacyCss.slice(start, next);
};

// ---------------------------------------------------------------------------
// The locked IA
// ---------------------------------------------------------------------------

test('Settings is a module with six sections, in order', () => {
  const module = NAV.find((i) => i.base === '/settings');
  assert.ok(module, 'nav.js must declare a /settings module');
  assert.deepEqual(module.children.map((c) => c.to), [
    '/settings',
    '/settings/plan',
    '/settings/accounts',
    '/settings/trades',
    '/settings/appearance',
    '/settings/session',
  ]);
  assert.deepEqual(module.children.map((c) => c.label), [
    'Profile', 'Plan & Billing', 'Accounts', 'Trade Settings', 'Appearance', 'Session',
  ]);
  // The index child owns only its exact path, or Profile stays lit on all six.
  assert.equal(module.children.find((c) => c.to === '/settings').end, true);
});

test('every section is a real, linkable route the top bar can name', () => {
  const routes = new Set(navRoutes());
  for (const s of settingsRoutes()) {
    assert.ok(routes.has(s.to), `${s.to} is not a nav route`);
    assert.deepEqual(navTitle(s.to), { module: 'Settings', page: s.label });
  }
  // A section reached by URL is the whole point of routes over local state — the top
  // bar reads "Settings › Accounts" rather than a bare "Settings" on all six.
  assert.deepEqual(navTitle('/settings'), { module: 'Settings', page: 'Profile' });
  assert.deepEqual(navTitle('/settings/accounts'), { module: 'Settings', page: 'Accounts' });
  assert.deepEqual(navTitle('/settings/accounts/'), { module: 'Settings', page: 'Accounts' });
});

test('the app rail shows Settings once, because the PAGE draws its section rail', () => {
  // `subnavInPage` is an IA fact in nav.js, not a check buried in the sidebar — so the
  // rail, the router and the top bar all read where the sub-nav lives from one place.
  assert.equal(isSubnavInPage('Settings'), true);
  assert.equal(isSubnavInPage('Prop OS'), false, 'Prop OS keeps its accordion in the rail');
  // One module is shaped this way. If a second ever is, that is a decision worth
  // making deliberately rather than by copying this one.
  assert.deepEqual(NAV.filter((i) => i.subnavInPage).map((i) => i.label), ['Settings']);
  // The sidebar honours it, and falls back to `base` for such an entry's link target.
  assert.match(sidebar, /item\.children && !item\.subnavInPage/);
  assert.match(sidebar, /to=\{item\.to \|\| item\.base\}/);
});

test('the old Account page is gone and its URL redirects here', () => {
  // Absorbed, not duplicated: `/account` existed to list accounts and open a manage
  // modal, which is exactly what Settings > Accounts is.
  assert.equal(LEGACY_REDIRECTS['/account'], '/settings/accounts');
  assert.ok(!navRoutes().includes('/account'), '/account must be a redirect, not a route');
  assert.ok(!NAV.some((i) => i.to === '/account'), 'and not a sidebar row either');
  assert.equal(srcExists('Account.jsx'), false, 'the page file should be deleted, not orphaned');
  assert.ok(!/features\/accounts\/Account\.jsx/.test(app), 'App.jsx must not import it');
});

test('the sections are nested under ONE shell route', () => {
  // The shell draws the rail and the section header once; six sibling top-level routes
  // would each have to draw their own.
  assert.match(app, /<Route path="settings" element=\{<Settings \/>\}>/);
  for (const [path, el] of [
    ['index', 'SettingsProfile'],
    ['plan', 'SettingsPlan'],
    ['accounts', 'SettingsAccounts'],
    ['trades', 'SettingsTrades'],
    ['appearance', 'SettingsAppearance'],
    ['session', 'SettingsSession'],
  ]) {
    const attr = path === 'index' ? 'index' : `path="${path}"`;
    assert.match(app, new RegExp(`<Route ${attr} element=\\{<${el} />\\} />`), `${path} route`);
  }
  // Layout's context has to be forwarded, or a nested section is cut off from the
  // app state every top-level page reads.
  assert.match(shell, /const ctx = useOutletContext\(\)/);
  assert.match(shell, /<Outlet context=\{ctx\} \/>/);
});

// ---------------------------------------------------------------------------
// The rail is DERIVED, not a second list of routes
// ---------------------------------------------------------------------------

test('the rail reads its routes from nav.js instead of declaring them', () => {
  // A second list of /settings/* paths would be a second source of truth for the IA,
  // and both failure modes are silent: a new section the rail never shows, or a
  // renamed one the rail 404s on.
  assert.match(railCfg, /import \{ NAV \} from '\.\.\/\.\.\/app\/nav\.js'/);
  assert.deepEqual(
    settingsRoutes(),
    NAV.find((i) => i.base === '/settings').children,
  );
});

test('every section has a group and a blurb, or the rail refuses to build', () => {
  // Throwing beats dropping the row: a section missing from the rail is invisible,
  // and a settings page nobody can reach is worse than a failing test.
  const sections = settingsSections();
  assert.equal(sections.length, 6);
  for (const s of sections) {
    assert.ok(SETTINGS_GROUPS.includes(s.group), `${s.to} has an unknown group`);
    assert.ok(s.blurb && s.blurb.length > 20, `${s.to} needs a real blurb`);
  }
});

test('the rail groups in a fixed order and loses nothing', () => {
  assert.deepEqual(SETTINGS_GROUPS, ['User', 'Workspace']);
  const rail = settingsRail();
  assert.deepEqual(rail.map((g) => g.group), SETTINGS_GROUPS);
  // Every section lands in exactly one group.
  const flat = rail.flatMap((g) => g.items.map((i) => i.to));
  assert.equal(flat.length, settingsSections().length);
  assert.equal(new Set(flat).size, flat.length);
  // Title Case, not USER / GENERAL. All-caps is prohibited outright by
  // DESIGN-LANGUAGE §3, and the tracking that normally makes it legible with it.
  for (const g of SETTINGS_GROUPS) {
    assert.notEqual(g, g.toUpperCase(), `${g} must not be all-caps`);
  }
});

test('settingsSection resolves the active row the same way navTitle does', () => {
  assert.equal(settingsSection('/settings').label, 'Profile');
  assert.equal(settingsSection('/settings/accounts').label, 'Accounts');
  // A trailing slash is the same section, not a section and nothing.
  assert.equal(settingsSection('/settings/accounts/').label, 'Accounts');
  assert.equal(settingsSection('/nope'), null);
});

test('the section title and blurb come from the rail config, once', () => {
  // The row you clicked and the heading you land on are the same string by
  // construction, so they cannot drift.
  assert.match(shell, /const section = settingsSection\(pathname\)/);
  assert.match(shell, /\{section\.label\}/);
  assert.match(shell, /\{section\.blurb\}/);
  // ...and no panel restates its own name.
  for (const [name, src] of [['SettingsPanels', panels], ['SettingsAccounts', accounts]]) {
    assert.ok(!/<h2\b/.test(code(src)), `${name} must not draw a second section title`);
  }
  // The in-page rail is a second navigation landmark, so it has to say which it is.
  assert.match(shell, /aria-label="Settings sections"/);
});

// ---------------------------------------------------------------------------
// Accounts — the table
// ---------------------------------------------------------------------------

test('the accounts table has the locked columns, in order', () => {
  const headers = [...accounts.matchAll(/<th[^>]*>([^<]+)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(headers, [
    'Account', 'Firm', 'Type', 'Size', 'Balance', 'Sync', 'Last Sync',
  ]);
  // The action column is a menu, not a named field — no header, but labelled for
  // assistive tech so the column is not anonymous.
  assert.match(accounts, /<th className="set-col-actions" aria-label="Actions" \/>/);
});

test('no column is invented — the two obvious ones PropVexis lacks are absent', () => {
  // Both would be a constant pretending to be data: there is no FIFO/LIFO setting to
  // report, and the EA pushes on trade close so there is no next poll to schedule.
  // "Last Sync" is the honest half of that pair and it IS a column above.
  const src = code(accounts);
  assert.ok(!/Profit calculation/i.test(src), 'no FIFO/LIFO column');
  assert.ok(!/Next\s*(update|sync)/i.test(src), 'no next-update column');
  // Every cell reads a field GET /api/accounts actually returns.
  for (const field of [
    'label', 'firm_name', 'broker', 'account_type', 'start_balance', 'balance',
    'kind', 'is_active', 'pending', 'mt5_login', 'balance_updated_at', 'created_at',
  ]) {
    assert.match(src, new RegExp(`\\b${field}\\b`), `${field} should be read from the account`);
  }
});

test('a sync state is a WORD plus a tone, and a manual account has none', () => {
  // Colour reinforces; it never carries the meaning alone — the same rule the Prop OS
  // health dots follow.
  assert.match(accounts, /if \(a\.kind === 'manual'\) return null;/);
  assert.match(accounts, /\{ label: 'Waiting', tone: 'warn' \}/);
  assert.match(accounts, /\{ label: 'Synced', tone: 'profit' \}/);
  assert.match(accounts, /\{ label: 'Archived', tone: 'neutral' \}/);
  // Nothing is meant to sync into a manual bucket, so a grey pill there would report a
  // fault where the account works exactly as designed.
  assert.match(accounts, /\{status && <Badge tone=\{status\.tone\}>/);
});

test('the table reuses the app\'s primitives and its table treatment', () => {
  assert.match(accounts, /from '@\/components\/primitives'/);
  // The module's existing table + the ledger's horizontal scroll, not a fourth style.
  assert.match(accounts, /className="prop-table set-table"/);
  assert.match(accounts, /className="set-table-scroll"/);
  // Tabs is the app's one switcher, and CountBadge its one count — same as Prop OS.
  assert.match(accounts, /<Tabs className="set-tabs"/);
  assert.match(accounts, /<CountBadge className="set-tab-count">/);
  // Active / Archived, and nothing else: archiving is a soft is_active toggle.
  assert.match(accounts, /const TABS = \[\s*\{ value: 'active', label: 'Active' \},\s*\{ value: 'archived', label: 'Archived' \},/);
  assert.match(accounts, /updateAccount\(a\.id, \{ is_active: a\.is_active === false \}\)/);
});

// ---------------------------------------------------------------------------
// Two things render in two places — each has ONE implementation
// ---------------------------------------------------------------------------

test('the manage-everything accounts modal split into two focused dialogs', () => {
  assert.equal(srcExists('AccountsModal.jsx'), false, 'renamed to AccountForms.jsx');
  // No default export: this file is the account FORMS, and nothing here lists accounts.
  assert.ok(!/export default/.test(forms), 'AccountForms must not have a default export');
  assert.match(forms, /export function AccountFormModal\(/);
  assert.match(forms, /export function EaSetupModal\(/);
  // The list is gone from the dialog — that was the duplication being removed.
  const src = code(forms);
  assert.ok(!/\.map\(\(a\) =>/.test(src), 'the dialog must not render a list of accounts');
  assert.ok(!/acct-list|acct-row/.test(src), 'and none of the old list markup survives');
  // One form for add and edit: they are the same fields minus the kind picker, which is
  // an add-time decision because `kind` is not editable after provisioning.
  assert.match(forms, /const editing = mode === 'edit'/);
  assert.match(forms, /\{!editing && \(/);
});

test('the account FIELDS still have one source of truth across three callers', () => {
  // The onboarding wizard, the add dialog and the edit dialog all render these. A second
  // copy of a drawdown field is how a rule means one thing on first run and another after.
  for (const piece of ['TemplatePicker', 'PropFields', 'SetupCard', 'toPayload', 'formFrom']) {
    assert.match(forms, new RegExp(`export (function|const) ${piece}\\b`), `${piece} is exported`);
  }
  assert.match(readSrc('Onboarding.jsx'), /from '\.\.\/accounts\/AccountForms\.jsx'/);
  // The EA steps are the same component at creation and a month later.
  assert.equal((forms.match(/<SetupCard account=/g) || []).length, 2);
});

test('the trade settings have one implementation and two frames', () => {
  // Settings > Trade Settings is the home; the Trade Log's toolbar and the avatar menu
  // open the same controls in a modal, because you want them while looking at the columns.
  assert.match(panels, /import TradeSettingsPanel from '\.\.\/trades\/TradeSettingsPanel\.jsx'/);
  assert.match(tsModal, /import TradeSettingsPanel from '\.\/TradeSettingsPanel\.jsx'/);
  // The controls live in exactly one of them.
  assert.match(tsPanel, /className="switch/);
  assert.match(tsPanel, /className="ts-col-opt"/);
  const modalCode = code(tsModal);
  assert.ok(!/className="switch/.test(modalCode), 'the modal must not keep its own toggle');
  assert.ok(!/ts-col-opt|ts-section/.test(modalCode), 'nor its own sections');
  // No Save button: the panel writes straight through to persisted state.
  assert.match(tsModal, />Done</);
});

test('the top bar sends "Manage accounts" to the page instead of opening a modal', () => {
  const src = code(topbar);
  assert.ok(!/AccountsModal|AccountFormModal/.test(src), 'the bar opens no account dialog now');
  assert.match(topbar, /<MenuItem render=\{<Link to="\/settings\/accounts" \/>\}>/);
  // ...and the dead plumbing went with it, rather than being left wired to nothing.
  assert.ok(!/manageOpen|setManageOpen|onManage/.test(src), 'no orphaned manage state');
});

// ---------------------------------------------------------------------------
// Styling
// ---------------------------------------------------------------------------

test('the block writes only the `set-` and `acct-form-` namespaces', () => {
  const block = settingsCssBlock();
  for (const sel of block.match(/^\.[a-z][\w-]*/gm) || []) {
    assert.match(sel, /^\.(set-|acct-form-)/, `${sel} is outside this block's namespaces`);
  }
  // Two namespaces on purpose, not by drift: the module's own, plus the account
  // dialogs it opens, which belong to the accounts feature.
  assert.match(block, /\.acct-form-modal \{/);
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(block), 'every colour in the block is a token');
  assert.ok(!/--dash-card-h|--kpi-count *:/.test(block), 'no new card-size or KPI tokens');
  // Nothing SHOUTS: all-caps is prohibited, including by transform.
  assert.ok(!/text-transform:\s*uppercase/.test(block), 'no all-caps labels');
  assert.ok(!/letter-spacing:\s*0?\.\d+em/.test(block), 'tracking follows case — none on Title Case');
});

test('rail selection is NEUTRAL and hover fills a surface, per §4 and §14', () => {
  const block = settingsCssBlock();
  // Brand colour never tints chrome — selection uses the neutral selection token.
  assert.match(block, /\.set-rail-link\.active \{ background: var\(--sel-bg\); color: var\(--text\); \}/);
  // The row has no border, so hover fills rather than brightening an edge it lacks.
  assert.match(block, /\.set-rail-link:hover \{ background: var\(--surface-hover\)/);
  assert.ok(!/\.set-rail-link[^{]*\{[^}]*var\(--accent/.test(block), 'no brand tint on a rail row');
  // A rail row is "smaller chrome — menu rows" in §6's assignment table.
  assert.match(block, /\.set-rail-link \{[^}]*border-radius: var\(--r-md\)/s);
});

test('the section rhythm is 16px and the page keeps its one title', () => {
  const block = settingsCssBlock();
  // The locked 16 units, expressed once as the column's gap rather than per child.
  assert.match(block, /\.set-content \{ display: flex; flex-direction: column; gap: 16px/);
  assert.match(block, /\.set-shell \{[^}]*gap: 16px/s);
  // --fs-section-title, not --fs-page-title: the top bar already holds the page title.
  assert.match(block, /\.set-section-title \{[^}]*font-size: var\(--fs-section-title\)/s);
  assert.ok(!/--fs-page-title/.test(cssCode(block)), 'a second 24px title would be two page titles');
  // Weight discipline: 600 is the ceiling and 700 is not used (DESIGN-LANGUAGE §3).
  assert.ok(!/font-weight:\s*(700|800|900|bold)/.test(cssCode(block)), 'no weight above the 600 ceiling');
});

test('the module is responsive on the app\'s existing breakpoints', () => {
  const block = settingsCssBlock();
  // The same two Finance, Accounts and Challenges already use — no new vocabulary.
  assert.match(block, /@media \(max-width: 900px\)/);
  assert.match(block, /@media \(max-width: 560px\)/);
  // The rail goes on top and scrolls sideways rather than shrinking into truncated
  // words — the same choice the Challenges lifecycle makes when it stacks.
  assert.match(block, /\.set-shell \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(block, /\.set-rail \{\s*position: static; flex-direction: row/);
  // Eight columns scroll horizontally rather than being squeezed until a figure wraps.
  assert.match(block, /\.set-table-scroll \{ overflow-x: auto; \}/);
});

test('the CSS the rebuild orphaned was deleted, not left behind', () => {
  // An unlayered legacy rule outranks everything Tailwind emits, so a dead one is not
  // inert — it is a rule waiting to capture a future class name. Read as declarations:
  // the new block names several of these in prose, explaining what it replaced.
  const decls = cssCode(legacyCss);
  for (const dead of [
    '.settings-page', '.settings-profile', '.settings-pic', '.settings-rows',
    '.settings-btn', '.settings-modal',
    '.acct-card', '.acct-list', '.acct-row', '.acct-badge',
    '.acct-add-toggle', '.acct-add-btn', '.acct-edit', '.acct-modal', '.acct-token',
  ]) {
    assert.ok(!decls.includes(dead), `${dead} has no markup left — the rule must go too`);
  }
  // What the onboarding wizard and the account forms still render stays.
  for (const live of ['.acct-add-row', '.acct-kind', '.acct-template', '.acct-prop', '.acct-empty']) {
    assert.ok(decls.includes(live), `${live} is still rendered and must keep its rule`);
  }
});
